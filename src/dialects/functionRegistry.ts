import functionsData from './functions.json';

/**
 * Function registry for SQL dialect-specific aggregate and window functions.
 * Combines built-in dialect functions with user-defined custom functions.
 *
 * Note: Custom functions from VS Code settings are only available in the extension
 * context, not in webviews. Use setCustomFunctions() to inject them from the extension.
 */

interface DialectFunctions {
    aggregates: string[];
    window: string[];
    tableValued: string[];
}

interface FunctionsConfig {
    common: DialectFunctions;
    dialects: Record<string, DialectFunctions>;
}

// Type assertion for the imported JSON
const builtInFunctions = functionsData as unknown as FunctionsConfig;

// Custom functions injected from extension context
let customAggregateFunctions: string[] = [];
let customWindowFunctions: string[] = [];
let customTableValuedFunctions: string[] = [];

/**
 * Sets custom functions from the extension context.
 * Call this from the extension when initializing or when settings change.
 */
export function setCustomFunctions(aggregates: string[], window: string[], tableValued: string[] = []): void {
    customAggregateFunctions = aggregates.map(f => f.toUpperCase());
    customWindowFunctions = window.map(f => f.toUpperCase());
    customTableValuedFunctions = tableValued.map(f => f.toUpperCase());
}

/**
 * Normalizes dialect name to lowercase for consistent lookup
 */
function normalizeDialect(dialect: string): string {
    const normalized = dialect.toLowerCase().replace(/[^a-z]/g, '');
    // Map common variations
    const dialectMap: Record<string, string> = {
        'sqlserver': 'transactsql',
        'tsql': 'transactsql',
        'mssql': 'transactsql',
        'postgres': 'postgresql',
        'pg': 'postgresql',
    };
    return dialectMap[normalized] || normalized;
}

/**
 * Gets user-defined custom functions (set via setCustomFunctions)
 */
function getCustomFunctions(): { aggregates: string[]; window: string[]; tableValued: string[] } {
    return {
        aggregates: customAggregateFunctions,
        window: customWindowFunctions,
        tableValued: customTableValuedFunctions
    };
}

/**
 * Gets the merged function sets for a given dialect.
 * Combines: common functions + dialect-specific functions + user custom functions
 */
export function getFunctionsForDialect(dialect: string): { aggregates: Set<string>; window: Set<string>; tableValued: Set<string> } {
    const normalizedDialect = normalizeDialect(dialect);
    const customFunctions = getCustomFunctions();

    // Get common functions
    const commonAggregates = builtInFunctions.common.aggregates || [];
    const commonWindow = builtInFunctions.common.window || [];
    const commonTableValued = builtInFunctions.common.tableValued || [];

    // Get dialect-specific functions
    const dialectFuncs = builtInFunctions.dialects[normalizedDialect] || { aggregates: [], window: [], tableValued: [] };

    // Merge all sources
    const aggregates = new Set<string>([
        ...commonAggregates.map(f => f.toUpperCase()),
        ...dialectFuncs.aggregates.map(f => f.toUpperCase()),
        ...customFunctions.aggregates
    ]);

    const window = new Set<string>([
        ...commonWindow.map(f => f.toUpperCase()),
        ...dialectFuncs.window.map(f => f.toUpperCase()),
        ...customFunctions.window
    ]);

    const tableValued = new Set<string>([
        ...commonTableValued.map(f => f.toUpperCase()),
        ...dialectFuncs.tableValued.map(f => f.toUpperCase()),
        ...customFunctions.tableValued
    ]);

    return { aggregates, window, tableValued };
}

/**
 * Checks if a function name is an aggregate function for the given dialect
 */
export function isAggregateFunction(funcName: string, dialect: string = 'mysql'): boolean {
    const funcs = getFunctionsForDialect(dialect);
    return funcs.aggregates.has(funcName.toUpperCase());
}

/**
 * Checks if a function name is a window function for the given dialect
 */
export function isWindowFunction(funcName: string, dialect: string = 'mysql'): boolean {
    const funcs = getFunctionsForDialect(dialect);
    return funcs.window.has(funcName.toUpperCase());
}

/**
 * Gets all aggregate function names for a dialect as an array
 */
export function getAggregateFunctions(dialect: string = 'mysql'): string[] {
    const funcs = getFunctionsForDialect(dialect);
    return Array.from(funcs.aggregates);
}

/**
 * Gets all window function names for a dialect as an array
 */
export function getWindowFunctions(dialect: string = 'mysql'): string[] {
    const funcs = getFunctionsForDialect(dialect);
    return Array.from(funcs.window);
}

/**
 * Checks if a function name is a table-valued function for the given dialect
 */
export function isTableValuedFunction(funcName: string, dialect: string = 'mysql'): boolean {
    const funcs = getFunctionsForDialect(dialect);
    return funcs.tableValued.has(funcName.toUpperCase());
}

/**
 * Gets all table-valued function names for a dialect as an array
 */
export function getTableValuedFunctions(dialect: string = 'mysql'): string[] {
    const funcs = getFunctionsForDialect(dialect);
    return Array.from(funcs.tableValued);
}

/**
 * Gets a list of all supported dialects
 */
export function getSupportedDialects(): string[] {
    return Object.keys(builtInFunctions.dialects);
}

