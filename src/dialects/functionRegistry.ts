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
}

interface FunctionsConfig {
    common: DialectFunctions;
    dialects: Record<string, DialectFunctions>;
}

// Type assertion for the imported JSON
const builtInFunctions = functionsData as unknown as FunctionsConfig;

// Cache for merged function sets per dialect
const functionCache = new Map<string, { aggregates: Set<string>; window: Set<string> }>();

// Custom functions injected from extension context
let customAggregateFunctions: string[] = [];
let customWindowFunctions: string[] = [];

/**
 * Sets custom functions from the extension context.
 * Call this from the extension when initializing or when settings change.
 */
export function setCustomFunctions(aggregates: string[], window: string[]): void {
    customAggregateFunctions = aggregates.map(f => f.toUpperCase());
    customWindowFunctions = window.map(f => f.toUpperCase());
    // Clear cache when custom functions change
    functionCache.clear();
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
function getCustomFunctions(): { aggregates: string[]; window: string[] } {
    return {
        aggregates: customAggregateFunctions,
        window: customWindowFunctions
    };
}

/**
 * Gets the merged function sets for a given dialect.
 * Combines: common functions + dialect-specific functions + user custom functions
 */
export function getFunctionsForDialect(dialect: string): { aggregates: Set<string>; window: Set<string> } {
    const normalizedDialect = normalizeDialect(dialect);

    // Check cache first (but invalidate if settings might have changed)
    // For simplicity, we rebuild on each call - this is fast enough
    const customFunctions = getCustomFunctions();

    // Get common functions
    const commonAggregates = builtInFunctions.common.aggregates || [];
    const commonWindow = builtInFunctions.common.window || [];

    // Get dialect-specific functions
    const dialectFuncs = builtInFunctions.dialects[normalizedDialect] || { aggregates: [], window: [] };

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

    return { aggregates, window };
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
 * Gets a list of all supported dialects
 */
export function getSupportedDialects(): string[] {
    return Object.keys(builtInFunctions.dialects);
}

/**
 * Clears the function cache (useful for testing or when settings change)
 */
export function clearFunctionCache(): void {
    functionCache.clear();
}
