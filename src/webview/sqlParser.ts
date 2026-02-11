import { Parser } from 'node-sql-parser';
import dagre from 'dagre';
import { analyzePerformance } from './performanceAnalyzer';
import { getAggregateFunctions, getWindowFunctions } from '../dialects';
import { getTableValuedFunctionName } from './parser/extractors/tables';
import { unwrapIdentifierValue } from './parser/astUtils';
import { escapeRegex, safeString } from '../shared';

// Import types from centralized type definitions
import {
    FlowNode,
    FlowEdge,
    ColumnFlow,
    ColumnInfo,
    ColumnLineage,
    QueryStats,
    OptimizationHint,
    ParseResult,
    BatchParseResult,
    ParseError,
    SqlDialect,
    NodeType,
    ValidationError,
    ValidationLimits,
} from './types';

// ============================================================
// Validation Constants
// ============================================================

/**
 * Default validation limits for SQL parsing.
 * These can be overridden by passing custom limits to validateSql.
 */
export const DEFAULT_VALIDATION_LIMITS: ValidationLimits = {
    maxSqlSizeBytes: 100 * 1024,  // 100KB
    maxQueryCount: 50,             // 50 statements max
};

/**
 * Parser timeout in milliseconds. If AST parsing exceeds this duration,
 * the result is discarded and the regex fallback parser is used instead.
 * Exported so tests can reference the threshold value.
 */
export let PARSE_TIMEOUT_MS = 5000;

/**
 * Override the parse timeout (for testing). Restores to default when called with no argument.
 */
export function setParseTimeout(ms?: number): void {
    PARSE_TIMEOUT_MS = ms ?? 5000;
}

export interface DialectDetectionResult {
    dialect: SqlDialect | null;
    scores: Partial<Record<SqlDialect, number>>;
    confidence: 'high' | 'low' | 'none';
}

/**
 * Validates SQL input against size and query count limits.
 * Call this before parsing to prevent performance issues with large inputs.
 *
 * @param sql - The SQL string to validate
 * @param limits - Optional custom limits (defaults to DEFAULT_VALIDATION_LIMITS)
 * @returns ValidationError if validation fails, null if valid
 */
export function validateSql(
    sql: string,
    limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS
): ValidationError | null {
    // Check SQL size
    const sizeBytes = new Blob([sql]).size;
    if (sizeBytes > limits.maxSqlSizeBytes) {
        return {
            type: 'size_limit',
            message: `SQL input exceeds maximum size limit of ${formatBytes(limits.maxSqlSizeBytes)}`,
            details: {
                actual: sizeBytes,
                limit: limits.maxSqlSizeBytes,
                unit: 'bytes',
            },
        };
    }

    // Quick estimate of statement count using semicolons (not counting those in strings/comments)
    const estimatedStatements = countStatements(sql);
    if (estimatedStatements > limits.maxQueryCount) {
        return {
            type: 'query_count_limit',
            message: `SQL contains approximately ${estimatedStatements} statements, exceeding the limit of ${limits.maxQueryCount}`,
            details: {
                actual: estimatedStatements,
                limit: limits.maxQueryCount,
                unit: 'statements',
            },
        };
    }

    return null;
}

/**
 * Counts the approximate number of SQL statements.
 * This is a quick heuristic that ignores semicolons inside strings and comments.
 */
function countStatements(sql: string): number {
    // Remove string literals (single and double quoted)
    let cleaned = sql.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');

    // Remove block comments
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove line comments
    cleaned = cleaned.replace(/--[^\n]*/g, '');
    cleaned = cleaned.replace(/#[^\n]*/g, '');

    // Count semicolons
    const semicolons = (cleaned.match(/;/g) || []).length;

    // At minimum, there's 1 statement if there's any content.
    // If the SQL doesn't end with a semicolon, assume a trailing statement.
    const trimmed = cleaned.trim();
    if (!trimmed) {
        return 0;
    }
    if (semicolons === 0) {
        return 1;
    }
    return trimmed.endsWith(';') ? semicolons : semicolons + 1;
}

/**
 * Formats bytes into human-readable string.
 */
function formatBytes(bytes: number): string {
    if (bytes < 1024) {return `${bytes} bytes`;}
    if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)}KB`;}
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Import color constants
import { getNodeColor } from './constants';

// Re-export types for backward compatibility
export type {
    FlowNode,
    FlowEdge,
    ColumnFlow,
    ColumnInfo,
    ColumnLineage,
    QueryStats,
    OptimizationHint,
    ParseResult,
    BatchParseResult,
    ParseError,
    SqlDialect,
    ValidationError,
    ValidationLimits,
};

// Re-export getNodeColor for backward compatibility
export { getNodeColor };

/**
 * Parser context holds all mutable state for a single parse operation.
 * Using a context object instead of scattered module-level variables improves
 * code organization and makes state management more explicit.
 *
 * Note: For true thread-safety in async contexts, this context should be
 * passed as a parameter through all functions. In the current synchronous
 * webview context, the atomic reset pattern is sufficient.
 */
interface ParserContext {
    stats: QueryStats;
    hints: OptimizationHint[];
    nodeCounter: number;
    hasSelectStar: boolean;
    hasNoLimit: boolean;
    statementType: string;
    tableUsageMap: Map<string, number>;
    dialect: SqlDialect;
    functionsUsed: Set<string>; // Track unique function names used
}

/**
 * Current parser context. All parser state is consolidated here rather than
 * in scattered module-level variables. This context is reset atomically at
 * the start of each parseSql call.
 */
let ctx: ParserContext = createFreshContext('MySQL');

/**
 * Create a fresh parser context with default values.
 * Called at the start of each parse operation to ensure clean state.
 */
function createFreshContext(dialect: SqlDialect): ParserContext {
    return {
        stats: {
            tables: 0,
            joins: 0,
            subqueries: 0,
            ctes: 0,
            aggregations: 0,
            windowFunctions: 0,
            unions: 0,
            conditions: 0,
            complexity: 'Simple',
            complexityScore: 0
        },
        hints: [],
        nodeCounter: 0,
        hasSelectStar: false,
        hasNoLimit: true,
        statementType: '',
        tableUsageMap: new Map(),
        dialect,
        functionsUsed: new Set<string>() // Track function names
    };
}

// Track table usage
function trackTableUsage(tableName: string): void {
    const normalizedName = tableName.toLowerCase();
    ctx.tableUsageMap.set(normalizedName, (ctx.tableUsageMap.get(normalizedName) || 0) + 1);
}

// Track function usage
function trackFunctionUsage(functionName: unknown, category: 'aggregate' | 'window' | 'tvf' | 'scalar'): void {
    if (typeof functionName !== 'string' || !functionName) {return;}
    const normalizedName = functionName.toUpperCase();
    ctx.functionsUsed.add(`${normalizedName}:${category}`);
}

function calculateComplexity(): void {
    const score =
        ctx.stats.tables * 1 +
        ctx.stats.joins * 3 +
        ctx.stats.subqueries * 5 +
        ctx.stats.ctes * 4 +
        ctx.stats.aggregations * 2 +
        ctx.stats.windowFunctions * 4 +
        ctx.stats.unions * 3 +
        ctx.stats.conditions * 0.5;

    ctx.stats.complexityScore = Math.round(score);

    if (score < 5) {
        ctx.stats.complexity = 'Simple';
    } else if (score < 15) {
        ctx.stats.complexity = 'Moderate';
    } else if (score < 30) {
        ctx.stats.complexity = 'Complex';
    } else {
        ctx.stats.complexity = 'Very Complex';
    }
}

function genId(prefix: string): string {
    return `${prefix}_${ctx.nodeCounter++}`;
}

/**
 * Session/utility command patterns that node-sql-parser doesn't support.
 * These are dialect-specific commands for setting context, session variables, etc.
 */
const SESSION_COMMAND_PATTERNS: Array<{
    pattern: RegExp;
    type: string;
    description: (match: RegExpMatchArray) => string;
    dialects?: string[];
}> = [
    // Snowflake session commands
    { pattern: /^USE\s+WAREHOUSE\s+(\S+)/i, type: 'USE WAREHOUSE', description: (m) => `Switch to warehouse: ${m[1]}`, dialects: ['Snowflake'] },
    { pattern: /^USE\s+DATABASE\s+(\S+)/i, type: 'USE DATABASE', description: (m) => `Switch to database: ${m[1]}` },
    { pattern: /^USE\s+SCHEMA\s+(\S+)/i, type: 'USE SCHEMA', description: (m) => `Switch to schema: ${m[1]}` },
    { pattern: /^USE\s+ROLE\s+(\S+)/i, type: 'USE ROLE', description: (m) => `Switch to role: ${m[1]}`, dialects: ['Snowflake'] },
    { pattern: /^USE\s+SECONDARY\s+ROLES\s+(\S+)/i, type: 'USE SECONDARY ROLES', description: (m) => `Set secondary roles: ${m[1]}`, dialects: ['Snowflake'] },
    { pattern: /^USE\s+(\S+)/i, type: 'USE', description: (m) => `Use: ${m[1]}` },

    // SET commands (various dialects)
    { pattern: /^SET\s+(\w+)\s*=\s*(.+)/i, type: 'SET', description: (m) => `Set ${m[1]} = ${m[2]}` },
    { pattern: /^SET\s+(TRANSACTION|SESSION|LOCAL|GLOBAL)\s+(.+)/i, type: 'SET', description: (m) => `Set ${m[1]} ${m[2]}` },

    // UNSET commands (Snowflake and others)
    { pattern: /^UNSET\s+(\w+)/i, type: 'UNSET', description: (m) => `Unset variable: ${m[1]}` },

    // Snowflake ALTER SESSION
    { pattern: /^ALTER\s+SESSION\s+SET\s+(.+)/i, type: 'ALTER SESSION', description: (m) => `Alter session: ${m[1]}`, dialects: ['Snowflake'] },
    { pattern: /^ALTER\s+SESSION\s+UNSET\s+(.+)/i, type: 'ALTER SESSION', description: (m) => `Unset session param: ${m[1]}`, dialects: ['Snowflake'] },

    // SQL Server / T-SQL specific
    { pattern: /^EXEC(?:UTE)?\s+(.+)/i, type: 'EXECUTE', description: (m) => `Execute: ${m[1]}`, dialects: ['TransactSQL'] },
    { pattern: /^PRINT\s+(.+)/i, type: 'PRINT', description: (m) => `Print: ${m[1]}`, dialects: ['TransactSQL'] },
    { pattern: /^DECLARE\s+(.+)/i, type: 'DECLARE', description: (m) => `Declare: ${m[1]}` },
    { pattern: /^GO\s*$/i, type: 'GO', description: () => `Batch separator`, dialects: ['TransactSQL'] },

    // PostgreSQL specific
    { pattern: /^\\(\w+)\s*(.*)/i, type: 'PSQL COMMAND', description: (m) => `psql: \\${m[1]} ${m[2]}`, dialects: ['PostgreSQL'] },
    { pattern: /^COPY\s+(.+)/i, type: 'COPY', description: (m) => `Copy: ${m[1]}`, dialects: ['PostgreSQL'] },
    { pattern: /^LISTEN\s+(\S+)/i, type: 'LISTEN', description: (m) => `Listen to channel: ${m[1]}`, dialects: ['PostgreSQL'] },
    { pattern: /^NOTIFY\s+(\S+)/i, type: 'NOTIFY', description: (m) => `Notify channel: ${m[1]}`, dialects: ['PostgreSQL'] },
    { pattern: /^VACUUM\s*(.*)/i, type: 'VACUUM', description: (m) => `Vacuum${m[1] ? ': ' + m[1] : ''}`, dialects: ['PostgreSQL'] },
    { pattern: /^ANALYZE\s*(.*)/i, type: 'ANALYZE', description: (m) => `Analyze${m[1] ? ': ' + m[1] : ''}`, dialects: ['PostgreSQL'] },
    { pattern: /^REINDEX\s*(.*)/i, type: 'REINDEX', description: (m) => `Reindex${m[1] ? ': ' + m[1] : ''}`, dialects: ['PostgreSQL'] },
    { pattern: /^CLUSTER\s*(.*)/i, type: 'CLUSTER', description: (m) => `Cluster${m[1] ? ': ' + m[1] : ''}`, dialects: ['PostgreSQL'] },

    // SHOW commands (various dialects) - specific patterns first
    { pattern: /^SHOW\s+TRANSACTIONS/i, type: 'SHOW TRANSACTIONS', description: () => `Show transactions` },
    { pattern: /^SHOW\s+VARIABLES(\s+LIKE\s+.+)?/i, type: 'SHOW VARIABLES', description: (m) => `Show variables${m[1] || ''}` },
    { pattern: /^SHOW\s+PARAMETERS(\s+LIKE\s+.+)?/i, type: 'SHOW PARAMETERS', description: (m) => `Show parameters${m[1] || ''}`, dialects: ['Snowflake'] },
    { pattern: /^SHOW\s+DATABASES/i, type: 'SHOW DATABASES', description: () => `Show databases` },
    { pattern: /^SHOW\s+SCHEMAS/i, type: 'SHOW SCHEMAS', description: () => `Show schemas` },
    { pattern: /^SHOW\s+TABLES(\s+IN\s+\S+)?/i, type: 'SHOW TABLES', description: (m) => `Show tables${m[1] || ''}` },
    { pattern: /^SHOW\s+VIEWS(\s+IN\s+\S+)?/i, type: 'SHOW VIEWS', description: (m) => `Show views${m[1] || ''}` },
    { pattern: /^SHOW\s+COLUMNS\s+(IN|FROM)\s+(\S+)/i, type: 'SHOW COLUMNS', description: (m) => `Show columns in ${m[2]}` },
    { pattern: /^SHOW\s+GRANTS(\s+.+)?/i, type: 'SHOW GRANTS', description: (m) => `Show grants${m[1] || ''}` },
    { pattern: /^SHOW\s+ROLES/i, type: 'SHOW ROLES', description: () => `Show roles`, dialects: ['Snowflake'] },
    { pattern: /^SHOW\s+WAREHOUSES/i, type: 'SHOW WAREHOUSES', description: () => `Show warehouses`, dialects: ['Snowflake'] },
    { pattern: /^SHOW\s+(.+)/i, type: 'SHOW', description: (m) => `Show: ${m[1]}` },

    // DESCRIBE commands
    { pattern: /^DESCRIBE\s+(\S+)/i, type: 'DESCRIBE', description: (m) => `Describe table: ${m[1]}` },
    { pattern: /^DESC\s+(\S+)/i, type: 'DESCRIBE', description: (m) => `Describe table: ${m[1]}` },
    { pattern: /^EXPLAIN\s+(.+)/i, type: 'EXPLAIN', description: (m) => `Explain: ${m[1].substring(0, 50)}...` },
    { pattern: /^FLUSH\s+(.+)/i, type: 'FLUSH', description: (m) => `Flush: ${m[1]}`, dialects: ['MySQL', 'MariaDB'] },
    { pattern: /^RESET\s+(.+)/i, type: 'RESET', description: (m) => `Reset: ${m[1]}` },
    { pattern: /^PURGE\s+(.+)/i, type: 'PURGE', description: (m) => `Purge: ${m[1]}`, dialects: ['MySQL', 'MariaDB'] },

    // BigQuery specific
    { pattern: /^ASSERT\s+(.+)/i, type: 'ASSERT', description: (m) => `Assert: ${m[1]}`, dialects: ['BigQuery'] },
    { pattern: /^EXPORT\s+DATA\s+(.+)/i, type: 'EXPORT DATA', description: (m) => `Export data: ${m[1]}`, dialects: ['BigQuery'] },
    { pattern: /^LOAD\s+DATA\s+(.+)/i, type: 'LOAD DATA', description: (m) => `Load data: ${m[1]}` },

    // Hive/Databricks specific
    { pattern: /^ADD\s+(JAR|FILE|ARCHIVE)\s+(.+)/i, type: 'ADD RESOURCE', description: (m) => `Add ${m[1]}: ${m[2]}`, dialects: ['Hive'] },
    { pattern: /^MSCK\s+REPAIR\s+TABLE\s+(\S+)/i, type: 'MSCK REPAIR', description: (m) => `Repair table: ${m[1]}`, dialects: ['Hive'] },
    { pattern: /^REFRESH\s+TABLE\s+(\S+)/i, type: 'REFRESH TABLE', description: (m) => `Refresh table: ${m[1]}`, dialects: ['Hive'] },
    { pattern: /^INVALIDATE\s+METADATA\s*(.*)/i, type: 'INVALIDATE METADATA', description: (m) => `Invalidate metadata${m[1] ? ': ' + m[1] : ''}`, dialects: ['Hive'] },

    // Generic transaction commands
    { pattern: /^BEGIN(\s+TRANSACTION|\s+WORK|\s+TRAN)?/i, type: 'BEGIN', description: () => `Begin transaction` },
    { pattern: /^START\s+TRANSACTION/i, type: 'START TRANSACTION', description: () => `Start transaction` },
    { pattern: /^COMMIT(\s+TRANSACTION|\s+WORK|\s+TRAN)?/i, type: 'COMMIT', description: () => `Commit transaction` },
    { pattern: /^ROLLBACK(\s+TRANSACTION|\s+WORK|\s+TRAN)?(\s+TO\s+SAVEPOINT\s+\S+)?/i, type: 'ROLLBACK', description: (m) => `Rollback transaction${m[2] || ''}` },
    { pattern: /^SAVEPOINT\s+(\S+)/i, type: 'SAVEPOINT', description: (m) => `Create savepoint: ${m[1]}` },
    { pattern: /^RELEASE\s+SAVEPOINT\s+(\S+)/i, type: 'RELEASE SAVEPOINT', description: (m) => `Release savepoint: ${m[1]}` },

    // Access control (common across dialects)
    { pattern: /^GRANT\s+(.+)/i, type: 'GRANT', description: (m) => `Grant: ${m[1].substring(0, 50)}...` },
    { pattern: /^REVOKE\s+(.+)/i, type: 'REVOKE', description: (m) => `Revoke: ${m[1].substring(0, 50)}...` },

    // Comment (single statement)
    { pattern: /^--.*$/i, type: 'COMMENT', description: () => `SQL comment` },
    { pattern: /^\/\*[\s\S]*\*\/$/i, type: 'COMMENT', description: () => `SQL block comment` },
];

/**
 * Check if SQL is a session/utility command that node-sql-parser doesn't support.
 * Returns a ParseResult if handled, or null if the SQL should be parsed normally.
 */
function tryParseSessionCommand(sql: string, _dialect: SqlDialect): ParseResult | null {
    // Strip leading comments so patterns can match at start of actual SQL
    const trimmedSql = stripLeadingComments(sql);

    for (const cmd of SESSION_COMMAND_PATTERNS) {
        const match = trimmedSql.match(cmd.pattern);
        if (match) {
            // Create a simple visualization for the session command
            const nodes: FlowNode[] = [];
            const edges: FlowEdge[] = [];

            const nodeId = genId('session');
            nodes.push({
                id: nodeId,
                type: 'operation' as NodeType,
                label: cmd.type,
                description: cmd.description(match),
                x: 0,
                y: 0,
                width: 200,
                height: 60,
            });

            // Set minimal stats for session commands
            ctx.stats.complexity = 'Simple';
            ctx.stats.complexityScore = 1;

            return {
                nodes,
                edges,
                stats: { ...ctx.stats },
                hints: [{
                    type: 'info',
                    message: `${cmd.type} statement`,
                    suggestion: 'This is a session/utility command that sets database context or configuration.'
                }],
                sql,
                columnLineage: [],
                tableUsage: new Map(),
            };
        }
    }

    return null;
}

/**
 * Strip leading SQL comments (both -- line comments and /* block comments *\/)
 * Returns the SQL with leading comments removed.
 */
function stripLeadingComments(sql: string): string {
    let result = sql.trim();
    let changed = true;

    while (changed) {
        changed = false;
        // Strip leading single-line comments (-- ...)
        while (result.startsWith('--')) {
            const newlineIdx = result.indexOf('\n');
            if (newlineIdx === -1) {
                // Entire string is a comment
                return '';
            }
            result = result.substring(newlineIdx + 1).trim();
            changed = true;
        }
        // Strip leading block comments (/* ... */)
        if (result.startsWith('/*')) {
            const endIdx = result.indexOf('*/');
            if (endIdx === -1) {
                // Unclosed block comment — treat remaining text as comment
                return '';
            }
            result = result.substring(endIdx + 2).trim();
            changed = true;
        }
        // Strip leading MySQL-style # comments
        while (result.startsWith('#')) {
            const newlineIdx = result.indexOf('\n');
            if (newlineIdx === -1) {
                return '';
            }
            result = result.substring(newlineIdx + 1).trim();
            changed = true;
        }
    }

    return result;
}

/**
 * Check if a SQL statement is a session/utility command (without parsing it).
 * Returns the matched command info or null if not a session command.
 */
function getSessionCommandInfo(sql: string): { type: string; description: string } | null {
    // Strip leading comments so patterns can match at start of actual SQL
    const trimmedSql = stripLeadingComments(sql);

    for (const cmd of SESSION_COMMAND_PATTERNS) {
        const match = trimmedSql.match(cmd.pattern);
        if (match) {
            return {
                type: cmd.type,
                description: cmd.description(match)
            };
        }
    }

    return null;
}

/**
 * Create a merged ParseResult for multiple consecutive session commands.
 * Shows them as a single "Session Setup" block with all commands listed.
 */
function createMergedSessionResult(
    commands: Array<{ sql: string; type: string; description: string }>,
    dialect: SqlDialect
): ParseResult {
    ctx = createFreshContext(dialect);
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    // Combine all SQL statements
    const combinedSql = commands.map(c => c.sql).join(';\n');
    const combinedLineCount = combinedSql.split('\n').length;

    // Create a single node with all session commands
    const nodeId = genId('session');
    const descriptions = commands.map(c => `• ${c.description}`).join('\n');

    nodes.push({
        id: nodeId,
        type: 'operation' as NodeType,
        label: 'Session Setup',
        description: descriptions,
        x: 0,
        y: 0,
        width: 220,
        height: Math.max(60, 30 + commands.length * 20),
        // Use relative line numbers (1-based) for the combined SQL
        startLine: 1,
        endLine: combinedLineCount,
    });

    // Set minimal stats
    ctx.stats.complexity = 'Simple';
    ctx.stats.complexityScore = 1;

    return {
        nodes,
        edges,
        stats: { ...ctx.stats },
        hints: [{
            type: 'info',
            message: `${commands.length} session command${commands.length > 1 ? 's' : ''}`,
            suggestion: 'These are session/utility commands that set database context or configuration.'
        }],
        sql: combinedSql,
        columnLineage: [],
        tableUsage: new Map(),
    };
}

// Split SQL into individual statements
export function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;
    let depth = 0;
    
    // Track procedural blocks
    let beginEndDepth = 0;  // Depth of nested BEGIN...END blocks
    let caseDepth = 0;      // Depth of CASE...END expressions (to avoid false END matches)
    let inDollarQuotes = false;
    let dollarQuoteTag = '';  // Dollar quote tag name (empty for $$, 'function' for $function$)
    let customDelimiter = null as string | null;  // MySQL DELIMITER command

    // Helper to check if we're at a word boundary and match a keyword
    const matchKeyword = (idx: number, keyword: string): boolean => {
        if (idx + keyword.length > sql.length) {return false;}
        if (sql.substring(idx, idx + keyword.length).toUpperCase() !== keyword) {return false;}
        // Check word boundary before
        if (idx > 0 && /[a-zA-Z0-9_]/.test(sql[idx - 1])) {return false;}
        // Check word boundary after
        const afterIdx = idx + keyword.length;
        if (afterIdx < sql.length && /[a-zA-Z0-9_]/.test(sql[afterIdx])) {return false;}
        return true;
    };

    // Helper to check if BEGIN starts a procedural block (not BEGIN TRANSACTION, BEGIN TRY, etc.)
    const isProceduralBegin = (idx: number): boolean => {
        // Check what follows BEGIN — skip non-block BEGINs
        const after = sql.substring(idx + 5, idx + 25).trim().toUpperCase();
        if (/^(TRANSACTION|WORK|TRAN|TRY|CATCH)\b/.test(after)) {return false;}

        // Look backwards to see what precedes BEGIN (up to 200 chars for long signatures)
        const before = sql.substring(Math.max(0, idx - 200), idx).toUpperCase();

        // Procedural BEGIN is preceded by: AS, THEN, ELSE, LOOP, IS
        if (/\b(AS|THEN|ELSE|LOOP|IS)\s*$/.test(before)) {return true;}

        // Or preceded by CREATE FUNCTION/PROCEDURE/TRIGGER with arbitrary signature (no semicolons between)
        if (/\bCREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE|TRIGGER)\b[^;]*$/.test(before)) {return true;}

        return false;
    };

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const nextChar = i < sql.length - 1 ? sql[i + 1] : '';
        const prevChar = i > 0 ? sql[i - 1] : '';

        // End of line comment on newline
        if (inLineComment) {
            current += char;
            if (char === '\n') {
                inLineComment = false;
            }
            continue;
        }

        // Inside block comment — look for closing */
        if (inBlockComment) {
            current += char;
            if (char === '*' && nextChar === '/') {
                current += '/';
                i++;
                inBlockComment = false;
            }
            continue;
        }

        // Detect start of block comment /* (not inside string or dollar quotes)
        if (!inString && !inDollarQuotes) {
            if (char === '/' && nextChar === '*') {
                inBlockComment = true;
                current += '/*';
                i++;
                continue;
            }

            // Detect start of line comments: --, //, # (not inside string or dollar quotes)
            if ((char === '-' && nextChar === '-') || (char === '/' && nextChar === '/')) {
                inLineComment = true;
                current += char + nextChar;
                i++;
                continue;
            }
            if (char === '#') {
                inLineComment = true;
                current += char;
                continue;
            }
        }

        // Handle PostgreSQL dollar quotes: $$ or $tag$
        // Must detect both opening and closing
        if (!inString && char === '$') {
            // Try to match dollar quote tag: $<optional_tag_name>$
            let j = i + 1;
            let tag = '';
            // Collect tag name (alphanumeric/underscore only)
            while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
                tag += sql[j];
                j++;
            }
            // Must end with $
            if (j < sql.length && sql[j] === '$') {
                const fullTag = '$' + tag + '$';
                if (inDollarQuotes && tag === dollarQuoteTag) {
                    // Closing the current dollar quote block
                    inDollarQuotes = false;
                    dollarQuoteTag = '';
                    current += fullTag;
                    i = j;
                    continue;
                } else if (!inDollarQuotes) {
                    // Opening a new dollar quote block
                    inDollarQuotes = true;
                    dollarQuoteTag = tag;
                    current += fullTag;
                    i = j;
                    continue;
                }
            }
        }

        // Handle MySQL DELIMITER command
        if (!inString && !inDollarQuotes && !inBlockComment && !inLineComment) {
            // Check for DELIMITER command at start of line (after whitespace/comments)
            const lineStart = current.trim(); // Current line content so far
            if (lineStart === '' && char.toUpperCase() === 'D') {
                const remaining = sql.substring(i, i + 20).toUpperCase();
                if (remaining.startsWith('DELIMITER ')) {
                    // Extract the delimiter
                    const delimiterMatch = sql.substring(i).match(/^DELIMITER\s+(\S+)/i);
                    if (delimiterMatch) {
                        customDelimiter = delimiterMatch[1] === ';' ? null : delimiterMatch[1];
                        // Skip the DELIMITER line (don't add to current statement)
                        while (i < sql.length && sql[i] !== '\n') {
                            i++;
                        }
                        current = ''; // Reset current statement
                        continue;
                    }
                }
            }
        }

        // Handle string literals (only when not in dollar quotes)
        if (!inDollarQuotes) {
            if ((char === "'" || char === '"') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }
        }

        // Handle parentheses depth and procedural block tracking
        if (!inString && !inDollarQuotes && !inBlockComment && !inLineComment) {
            if (char === '(') { depth++; }
            if (char === ')') { depth--; }

            // Track CASE...END to avoid false END matches
            if (matchKeyword(i, 'CASE')) {
                caseDepth++;
            }

            // Handle BEGIN...END blocks
            if (matchKeyword(i, 'BEGIN')) {
                if (isProceduralBegin(i)) {
                    beginEndDepth++;
                }
            }

            // END keyword — only decrement beginEndDepth for procedural END
            if (matchKeyword(i, 'END')) {
                // Check what follows END: skip END TRY, END CATCH, END IF, END LOOP, END WHILE
                const afterEnd = sql.substring(i + 3, i + 15).trim().toUpperCase();
                if (/^(TRY|CATCH|IF|LOOP|WHILE)\b/.test(afterEnd)) {
                    // Block-qualifier END — don't decrement
                } else if (caseDepth > 0) {
                    // This END closes a CASE expression, not a BEGIN block
                    caseDepth--;
                } else if (beginEndDepth > 0) {
                    beginEndDepth--;
                }
            }
        }

        // Determine the current delimiter
        const delimiter = customDelimiter || ';';
        
        // Split on delimiter at depth 0 and not inside BEGIN...END
        const isDelimiter = delimiter === ';' 
            ? (char === ';' && !inString && !inDollarQuotes && depth === 0 && beginEndDepth === 0)
            : (sql.substring(i).startsWith(delimiter) && !inString && !inDollarQuotes && depth === 0 && beginEndDepth === 0);
        
        if (isDelimiter) {
            const trimmed = current.trim();
            if (trimmed) {
                const withoutComments = stripLeadingComments(trimmed).trim();
                if (withoutComments) {
                    statements.push(trimmed);
                }
            }
            current = '';
            
            // Skip past the custom delimiter
            if (delimiter !== ';') {
                i += delimiter.length - 1;
            }
        } else {
            current += char;
        }
    }

    // Add last statement
    const trimmed = current.trim();
    if (trimmed) {
        const withoutComments = stripLeadingComments(trimmed).trim();
        if (withoutComments) {
            statements.push(trimmed);
        }
    }

    return statements;
}

/**
 * Check if a SQL statement is a DDL statement (CREATE, ALTER, DROP).
 * Returns info about the DDL type and object name, or null if not a DDL statement.
 */
function getDdlStatementInfo(sql: string): { type: string; keyword: string; objectName: string } | null {
    const trimmedSql = stripLeadingComments(sql).trim();

    // CREATE patterns
    const createMatch = trimmedSql.match(/^CREATE\s+(OR\s+REPLACE\s+)?(TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|PROCEDURE|TRIGGER|SEQUENCE|TYPE|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
    if (createMatch) {
        const keyword = createMatch[2].toUpperCase().replace(/\s+/g, ' ');
        return {
            type: 'CREATE',
            keyword: keyword,
            objectName: createMatch[3].replace(/[`"[\]]/g, ''), // Remove quotes
        };
    }

    // ALTER patterns
    const alterMatch = trimmedSql.match(/^ALTER\s+(TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|PROCEDURE)\s+([^\s(]+)/i);
    if (alterMatch) {
        return {
            type: 'ALTER',
            keyword: alterMatch[1].toUpperCase(),
            objectName: alterMatch[2].replace(/[`"[\]]/g, ''),
        };
    }

    // DROP patterns
    const dropMatch = trimmedSql.match(/^DROP\s+(TABLE|VIEW|INDEX|SCHEMA|DATABASE|FUNCTION|PROCEDURE|TRIGGER|SEQUENCE|TYPE|MATERIALIZED\s+VIEW)\s+(?:IF\s+EXISTS\s+)?([^\s(;]+)/i);
    if (dropMatch) {
        const keyword = dropMatch[1].toUpperCase().replace(/\s+/g, ' ');
        return {
            type: 'DROP',
            keyword: keyword,
            objectName: dropMatch[2].replace(/[`"[\]]/g, ''),
        };
    }

    return null;
}

/**
 * Create a merged ParseResult for multiple consecutive DDL statements.
 * Shows them as a single "Schema Definition" block with counts.
 */
function createMergedDdlResult(
    commands: Array<{ sql: string; type: string; keyword: string; objectName: string }>,
    dialect: SqlDialect
): ParseResult {
    ctx = createFreshContext(dialect);
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    // Combine all SQL statements
    const combinedSql = commands.map(c => c.sql).join(';\n');
    const combinedLineCount = combinedSql.split('\n').length;

    // Group objects by type+keyword
    const groups: Record<string, string[]> = {};
    for (const cmd of commands) {
        const key = `${cmd.type} ${cmd.keyword}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(cmd.objectName);
    }

    // Build summary label (counts)
    const summaryParts: string[] = [];
    for (const [key, names] of Object.entries(groups)) {
        summaryParts.push(`${names.length} ${key}${names.length > 1 ? 's' : ''}`);
    }
    const summaryLabel = summaryParts.join(', ');

    // Build concise description - group names by type
    const descriptionParts: string[] = [];
    for (const [key, names] of Object.entries(groups)) {
        // Extract just the object type (TABLE, VIEW, etc.)
        const objectType = key.split(' ').slice(1).join(' ');
        const plural = names.length > 1 ? 's' : '';
        descriptionParts.push(`${objectType}${plural}: ${names.join(', ')}`);
    }
    const descriptions = descriptionParts.join('\n');

    // Create a single node with all DDL commands
    const nodeId = genId('ddl');
    const labelWidth = Math.max(220, summaryLabel.length * 8 + 40);

    nodes.push({
        id: nodeId,
        type: 'result' as NodeType,
        label: 'Schema Definition',
        description: `${summaryLabel}\n\n${descriptions}`,
        accessMode: 'write',
        x: 0,
        y: 0,
        width: labelWidth,
        height: Math.max(80, 40 + commands.length * 18),
        startLine: 1,
        endLine: combinedLineCount,
    });

    // Set minimal stats
    ctx.stats.complexity = 'Simple';
    ctx.stats.complexityScore = commands.length;

    return {
        nodes,
        edges,
        stats: { ...ctx.stats },
        hints: [{
            type: 'info',
            message: summaryLabel,
            suggestion: `This block contains ${commands.length} DDL statement${commands.length > 1 ? 's' : ''} defining database schema.`
        }],
        sql: combinedSql,
        columnLineage: [],
        tableUsage: new Map(),
    };
}

// Options for batch parsing
export interface BatchParseOptions {
    combineDdlStatements?: boolean;
}

// Parse multiple SQL statements
export function parseSqlBatch(
    sql: string,
    dialect: SqlDialect = 'MySQL',
    limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS,
    options: BatchParseOptions = {}
): BatchParseResult {
    // Validate SQL before parsing
    const validationError = validateSql(sql, limits);
    if (validationError) {
        // For size limits, parse partial result instead of rejecting
        if (validationError.type === 'size_limit') {
            const truncatedSql = sql.substring(0, limits.maxSqlSizeBytes);
            // Recursively parse with infinite limit to avoid double-validation
            const partialResult = parseSqlBatch(truncatedSql, dialect, { ...limits, maxSqlSizeBytes: Infinity }, options);
            // Add truncation warning
            partialResult.queries.forEach(q => {
                q.hints.push({
                    type: 'warning',
                    message: 'Input truncated due to size limit',
                    suggestion: `Showing first ${formatBytes(limits.maxSqlSizeBytes)} of ${formatBytes(validationError.details.actual)}. Consider splitting into smaller files.`,
                    category: 'performance',
                    severity: 'medium',
                });
            });
            partialResult.validationError = validationError;
            return partialResult;
        }
        
        // For query count limits, parse first N statements
        if (validationError.type === 'query_count_limit') {
            const allStatements = splitSqlStatements(sql);
            const truncatedStatements = allStatements.slice(0, limits.maxQueryCount);
            const truncatedSql = truncatedStatements.join(';\n');
            // Recursively parse with infinite limit
            const partialResult = parseSqlBatch(truncatedSql, dialect, { ...limits, maxQueryCount: Infinity }, options);
            // Add truncation warning
            partialResult.queries.forEach(q => {
                q.hints.push({
                    type: 'warning',
                    message: 'Too many statements - showing first batch',
                    suggestion: `Showing first ${limits.maxQueryCount} of ${validationError.details.actual} statements. Consider splitting into multiple files.`,
                    category: 'performance',
                    severity: 'medium',
                });
            });
            partialResult.validationError = validationError;
            return partialResult;
        }
        
        // Fallback: return empty result (shouldn't reach here with current validation types)
        const emptyStats: QueryStats = {
            tables: 0, joins: 0, subqueries: 0, ctes: 0, aggregations: 0,
            windowFunctions: 0, unions: 0, conditions: 0,
            complexity: 'Simple', complexityScore: 0,
        };
        return {
            queries: [{
                nodes: [], edges: [], stats: emptyStats,
                hints: [{ type: 'error', message: validationError.message, category: 'performance', severity: 'high' }],
                sql: sql.substring(0, 1000) + (sql.length > 1000 ? '...' : ''),
                columnLineage: [], tableUsage: new Map(), error: validationError.message,
            }],
            totalStats: emptyStats, validationError,
        };
    }

    const statements = splitSqlStatements(sql);
    const queries: ParseResult[] = [];
    const queryLineRanges: Array<{ startLine: number; endLine: number }> = [];

    // Track line offsets for each statement
    let currentLine = 1;
    const lines = sql.split('\n');

    // Collect consecutive session commands to merge them
    let pendingSessionCommands: Array<{
        sql: string;
        type: string;
        description: string;
        startLine: number;
        endLine: number;
    }> = [];

    // Collect consecutive DDL commands to merge them (when option enabled)
    let pendingDdlCommands: Array<{
        sql: string;
        type: string;
        keyword: string;
        objectName: string;
        startLine: number;
        endLine: number;
    }> = [];

    // Helper to flush pending session commands as a single merged result
    const flushSessionCommands = () => {
        if (pendingSessionCommands.length === 0) {return;}

        const mergedResult = createMergedSessionResult(
            pendingSessionCommands.map(c => ({ sql: c.sql, type: c.type, description: c.description })),
            dialect
        );

        // Get line range for tracking (absolute lines in original file)
        const absoluteStartLine = pendingSessionCommands[0].startLine;
        const absoluteEndLine = pendingSessionCommands[pendingSessionCommands.length - 1].endLine;

        // Note: Node line numbers are already set relative to the combined SQL in createMergedSessionResult
        // Don't override them here

        queries.push(mergedResult);
        queryLineRanges.push({ startLine: absoluteStartLine, endLine: absoluteEndLine });

        pendingSessionCommands = [];
    };

    // Helper to flush pending DDL commands as a single merged result
    const flushDdlCommands = () => {
        if (pendingDdlCommands.length === 0) {return;}

        const mergedResult = createMergedDdlResult(
            pendingDdlCommands.map(c => ({ sql: c.sql, type: c.type, keyword: c.keyword, objectName: c.objectName })),
            dialect
        );

        // Get line range for tracking (absolute lines in original file)
        const absoluteStartLine = pendingDdlCommands[0].startLine;
        const absoluteEndLine = pendingDdlCommands[pendingDdlCommands.length - 1].endLine;

        queries.push(mergedResult);
        queryLineRanges.push({ startLine: absoluteStartLine, endLine: absoluteEndLine });

        pendingDdlCommands = [];
    };

    for (const stmt of statements) {
        // Find the starting line of this statement in the original SQL
        let stmtStartLine = currentLine;
        const stmtFirstLine = stmt.trim().split('\n')[0];
        for (let i = currentLine - 1; i < lines.length; i++) {
            if (lines[i].includes(stmtFirstLine.substring(0, Math.min(30, stmtFirstLine.length)))) {
                stmtStartLine = i + 1;
                break;
            }
        }

        const stmtEndLine = stmtStartLine + stmt.split('\n').length - 1;

        // Check if this is a session command
        const sessionInfo = getSessionCommandInfo(stmt);

        if (sessionInfo) {
            // Calculate actual start line by counting lines in leading comments
            const strippedSql = stripLeadingComments(stmt);
            const leadingLinesCount = stmt.split('\n').length - strippedSql.split('\n').length;
            const actualStartLine = stmtStartLine + leadingLinesCount;

            // Add to pending session commands (store stripped SQL without leading comments)
            pendingSessionCommands.push({
                sql: strippedSql,
                type: sessionInfo.type,
                description: sessionInfo.description,
                startLine: actualStartLine,
                endLine: stmtEndLine,
            });
        } else {
            // Flush any pending session commands before processing a regular statement
            flushSessionCommands();

            // Check if DDL combining is enabled and this is a DDL statement
            const ddlInfo = options.combineDdlStatements ? getDdlStatementInfo(stmt) : null;

            if (ddlInfo) {
                // Calculate actual start line by counting lines in leading comments
                const strippedSql = stripLeadingComments(stmt);
                const leadingLinesCount = stmt.split('\n').length - strippedSql.split('\n').length;
                const actualStartLine = stmtStartLine + leadingLinesCount;

                // Add to pending DDL commands
                pendingDdlCommands.push({
                    sql: strippedSql,
                    type: ddlInfo.type,
                    keyword: ddlInfo.keyword,
                    objectName: ddlInfo.objectName,
                    startLine: actualStartLine,
                    endLine: stmtEndLine,
                });
            } else {
                // Flush any pending DDL commands before processing a non-DDL statement
                flushDdlCommands();

                // Parse the regular statement
                const result = parseSql(stmt, dialect);

                // Adjust line numbers by adding the offset
                const lineOffset = stmtStartLine - 1;
                if (result.error) {
                    result.error = offsetErrorLineNumber(result.error, lineOffset);
                }
                for (const node of result.nodes) {
                    if (node.startLine) {
                        node.startLine += lineOffset;
                    }
                    if (node.endLine) {
                        node.endLine += lineOffset;
                    }
                }
                // Also adjust line numbers for edges
                for (const edge of result.edges) {
                    if (edge.startLine) {
                        edge.startLine += lineOffset;
                    }
                    if (edge.endLine) {
                        edge.endLine += lineOffset;
                    }
                }

                queries.push(result);
                queryLineRanges.push({ startLine: stmtStartLine, endLine: stmtEndLine });
            }
        }

        // Update current line past this statement
        currentLine = stmtStartLine + stmt.split('\n').length;
    }

    // Flush any remaining session commands at the end
    flushSessionCommands();

    // Flush any remaining DDL commands at the end
    flushDdlCommands();

    // Calculate total stats
    // For tables, count unique tables across all queries (not sum, as same table in multiple queries should count as 1)
    const allUniqueTables = new Set<string>();
    for (const q of queries) {
        if (q.tableUsage) {
            q.tableUsage.forEach((_count, tableName) => {
                allUniqueTables.add(tableName);
            });
        }
    }

    const totalStats: QueryStats = {
        tables: allUniqueTables.size, // Use unique table count
        joins: 0,
        subqueries: 0,
        ctes: 0,
        aggregations: 0,
        windowFunctions: 0,
        unions: 0,
        conditions: 0,
        complexity: 'Simple',
        complexityScore: 0
    };

    for (const q of queries) {
        // Don't add tables here, already counted above
        totalStats.joins += q.stats.joins;
        totalStats.subqueries += q.stats.subqueries;
        totalStats.ctes += q.stats.ctes;
        totalStats.aggregations += q.stats.aggregations;
        totalStats.windowFunctions += q.stats.windowFunctions;
        totalStats.unions += q.stats.unions;
        totalStats.conditions += q.stats.conditions;
        totalStats.complexityScore += q.stats.complexityScore;
    }

    // Determine overall complexity
    const avgScore = queries.length > 0 ? totalStats.complexityScore / queries.length : 0;
    if (avgScore < 5) {
        totalStats.complexity = 'Simple';
    } else if (avgScore < 15) {
        totalStats.complexity = 'Moderate';
    } else if (avgScore < 30) {
        totalStats.complexity = 'Complex';
    } else {
        totalStats.complexity = 'Very Complex';
    }

    // Collect parse errors for partial results tracking
    const parseErrors: ParseError[] = [];
    let successCount = 0;
    let errorCount = 0;

    queries.forEach((query, index) => {
        if (query.error) {
            errorCount++;
            // Extract line number from error message if available (e.g., "at line 5")
            const lineMatch = query.error.match(/line\s+(\d+)/i);
            const columnMatch = query.error.match(/column\s+(\d+)/i);

            parseErrors.push({
                queryIndex: index,
                line: lineMatch ? parseInt(lineMatch[1], 10) : queryLineRanges[index]?.startLine,
                column: columnMatch ? parseInt(columnMatch[1], 10) : undefined,
                message: query.error,
                sql: query.sql.substring(0, 200) + (query.sql.length > 200 ? '...' : '')
            });
        } else {
            successCount++;
        }
    });

    return {
        queries,
        totalStats,
        queryLineRanges,
        parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
        successCount,
        errorCount
    };
}

// Extract line numbers for SQL keywords
function extractKeywordLineNumbers(sql: string): Map<string, number[]> {
    const lines = sql.split('\n');
    const keywordLines = new Map<string, number[]>();

    const keywords = [
        'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT',
        'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
        'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
        'WITH', 'UNION', 'INTERSECT', 'EXCEPT', 'AS'
    ];

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1; // 1-indexed
        const upperLine = lines[i].toUpperCase();

        for (const keyword of keywords) {
            // Check for keyword at word boundary
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(upperLine)) {
                if (!keywordLines.has(keyword)) {
                    keywordLines.set(keyword, []);
                }
                keywordLines.get(keyword)!.push(lineNum);
            }
        }
    }

    return keywordLines;
}

// Assign line numbers to nodes based on their type and label
function assignLineNumbers(nodes: FlowNode[], sql: string): void {
    const keywordLines = extractKeywordLineNumbers(sql);

    // Track used line numbers to avoid duplicates
    const usedJoinLines: number[] = [];

    for (const node of nodes) {
        switch (node.type) {
            case 'table': {
                // Try to find the actual line where this table appears
                const tableName = node.label.toLowerCase().trim();
                const sqlLines = sql.split('\n');
                const fromLines = keywordLines.get('FROM') || [];
                const joinLines = [
                    ...(keywordLines.get('JOIN') || []),
                    ...(keywordLines.get('INNER JOIN') || []),
                    ...(keywordLines.get('LEFT JOIN') || []),
                    ...(keywordLines.get('RIGHT JOIN') || []),
                    ...(keywordLines.get('FULL JOIN') || []),
                    ...(keywordLines.get('CROSS JOIN') || [])
                ];
                
                // Search all lines for the table name
                let foundLine: number | undefined;
                const searchStartLine = Math.min(...fromLines, ...joinLines, sqlLines.length);
                
                // Search from the beginning, but prioritize lines after FROM/JOIN
                for (let i = 0; i < sqlLines.length; i++) {
                    const line = sqlLines[i].toLowerCase();
                    // Check if this line contains the table name as a word boundary
                    // Also check for table aliases (e.g., "employees e" or "employees AS e")
                    const tableRegex = new RegExp(`\\b${escapeRegex(tableName)}\\b`, 'i');
                    if (tableRegex.test(line)) {
                        // Make sure it's in a FROM or JOIN context
                        if (i >= searchStartLine - 1 || 
                            line.includes('from') || 
                            line.includes('join') ||
                            (i > 0 && (sqlLines[i-1].toLowerCase().includes('from') || sqlLines[i-1].toLowerCase().includes('join')))) {
                            foundLine = i + 1;
                            break;
                        }
                    }
                }
                
                // Fallback to first FROM line if not found
                node.startLine = foundLine || (fromLines.length > 0 ? fromLines[0] : undefined);
                break;
            }
            case 'join': {
                // Find the appropriate join line
                const joinTypes = ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
                                   'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
                                   'CROSS JOIN', 'JOIN'];
                for (const jt of joinTypes) {
                    if (node.label.toUpperCase().includes(jt.replace(' JOIN', ''))) {
                        const lines = keywordLines.get(jt) || keywordLines.get('JOIN') || [];
                        // Find first unused line
                        for (const line of lines) {
                            if (!usedJoinLines.includes(line)) {
                                node.startLine = line;
                                usedJoinLines.push(line);
                                break;
                            }
                        }
                        if (node.startLine) {break;}
                    }
                }
                break;
            }
            case 'filter': {
                if (node.label === 'WHERE') {
                    const whereLines = keywordLines.get('WHERE') || [];
                    if (whereLines.length > 0) {node.startLine = whereLines[0];}
                } else if (node.label === 'HAVING') {
                    const havingLines = keywordLines.get('HAVING') || [];
                    if (havingLines.length > 0) {node.startLine = havingLines[0];}
                }
                break;
            }
            case 'aggregate': {
                const groupLines = keywordLines.get('GROUP BY') || [];
                if (groupLines.length > 0) {node.startLine = groupLines[0];}
                break;
            }
            case 'sort': {
                const orderLines = keywordLines.get('ORDER BY') || [];
                if (orderLines.length > 0) {node.startLine = orderLines[0];}
                break;
            }
            case 'limit': {
                const limitLines = keywordLines.get('LIMIT') || [];
                if (limitLines.length > 0) {node.startLine = limitLines[0];}
                break;
            }
            case 'select': {
                const selectLines = keywordLines.get('SELECT') || [];
                if (selectLines.length > 0) {node.startLine = selectLines[0];}
                break;
            }
            case 'cte': {
                const withLines = keywordLines.get('WITH') || [];
                if (withLines.length > 0) {node.startLine = withLines[0];}
                break;
            }
            case 'union': {
                const unionLines = keywordLines.get('UNION') || keywordLines.get('INTERSECT') || keywordLines.get('EXCEPT') || [];
                if (unionLines.length > 0) {node.startLine = unionLines[0];}
                break;
            }
            case 'result': {
                // Result is at the end - use last SELECT line
                const selectLines = keywordLines.get('SELECT') || [];
                if (selectLines.length > 0) {node.startLine = selectLines[0];}
                break;
            }
        }
    }
}

function getLeadingKeyword(sql: string): string | null {
    const stripped = stripLeadingComments(sql);
    const match = stripped.match(/^\s*([A-Za-z_]+)/);
    return match ? match[1].toUpperCase() : null;
}

interface ParseErrorLocation {
    line: number;
    column?: number;
}

function getLineColumnFromOffset(sql: string, offset: number): ParseErrorLocation {
    const safeOffset = Math.max(0, Math.min(offset, sql.length));
    const before = sql.slice(0, safeOffset);
    const line = before.split('\n').length;
    const lastNewline = before.lastIndexOf('\n');
    const column = safeOffset - lastNewline;
    return { line, column };
}

function inferErrorOffsetFromToken(sql: string, token: string): number | null {
    const trimmed = token.trim();
    if (!trimmed) {
        return null;
    }

    const isWordToken = /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed);
    if (isWordToken) {
        const pattern = trimmed.length === 1
            ? new RegExp(`\\b${escapeRegex(trimmed)}[A-Za-z0-9_]*\\b`, 'i')
            : new RegExp(`\\b${escapeRegex(trimmed)}\\b`, 'i');
        const wordMatch = pattern.exec(sql);
        if (wordMatch && typeof wordMatch.index === 'number') {
            return wordMatch.index;
        }
    }

    const directIndex = sql.toUpperCase().indexOf(trimmed.toUpperCase());
    return directIndex >= 0 ? directIndex : null;
}

function extractParseErrorLocation(
    err: unknown,
    originalError: string,
    sql: string,
    syntaxHint: string | null
): ParseErrorLocation | null {
    const errorObj = err as any;

    const structuredLocation = errorObj?.location?.start;
    if (structuredLocation && typeof structuredLocation.line === 'number') {
        return {
            line: structuredLocation.line,
            column: typeof structuredLocation.column === 'number' ? structuredLocation.column : undefined,
        };
    }

    const hashLocation = errorObj?.hash?.loc;
    if (hashLocation && typeof hashLocation.first_line === 'number') {
        return {
            line: hashLocation.first_line,
            column: typeof hashLocation.first_column === 'number' ? hashLocation.first_column : undefined,
        };
    }

    if (typeof errorObj?.lineNumber === 'number') {
        return {
            line: errorObj.lineNumber,
            column: typeof errorObj?.columnNumber === 'number' ? errorObj.columnNumber : undefined,
        };
    }

    const lineInfoMatch = originalError.match(/(?:line\s+|at\s+line\s+)(\d+)/i);
    if (lineInfoMatch) {
        const line = parseInt(lineInfoMatch[1], 10);
        const colInfoMatch = originalError.match(/(?:column\s+|col\s+)(\d+)/i);
        const column = colInfoMatch ? parseInt(colInfoMatch[1], 10) : undefined;
        return { line, column };
    }

    if (syntaxHint) {
        const inferredOffset = inferErrorOffsetFromToken(sql, syntaxHint);
        if (inferredOffset !== null) {
            return getLineColumnFromOffset(sql, inferredOffset);
        }
    }

    return null;
}

function formatErrorLocationPrefix(location: ParseErrorLocation | null): string {
    if (!location) {
        return '';
    }
    return `Line ${location.line}${location.column ? `, column ${location.column}` : ''}`;
}

function offsetErrorLineNumber(message: string, lineOffset: number): string {
    if (lineOffset <= 0) {
        return message;
    }

    const prefixMatch = message.match(/^Line\s+(\d+)(,\s*column\s+\d+)?\s*:\s*/i);
    if (!prefixMatch) {
        return message;
    }

    const relativeLine = parseInt(prefixMatch[1], 10);
    if (!Number.isFinite(relativeLine)) {
        return message;
    }

    const absoluteLine = relativeLine + lineOffset;
    const columnPart = prefixMatch[2] || '';
    const remainder = message.slice(prefixMatch[0].length);
    return `Line ${absoluteLine}${columnPart}: ${remainder}`;
}

function tryParseSnowflakeDmlFallback(parser: Parser, sql: string, dialect: SqlDialect): any | null {
    // node-sql-parser has incomplete Snowflake grammar for some DML (notably DELETE ... WHERE).
    // Fall back to PostgreSQL AST parsing for these statements so visualization can still render.
    if (dialect !== 'Snowflake') {
        return null;
    }

    const keyword = getLeadingKeyword(sql);
    if (!keyword || !['DELETE', 'MERGE'].includes(keyword)) {
        return null;
    }

    try {
        return parser.astify(sql, { database: 'PostgreSQL' });
    } catch {
        return null;
    }
}

function rankDialectScores(scores: Partial<Record<SqlDialect, number>>): Array<{ dialect: SqlDialect; score: number }> {
    return Object.entries(scores)
        .filter((entry): entry is [SqlDialect, number] => typeof entry[1] === 'number' && entry[1] > 0)
        .map(([dialect, score]) => ({ dialect, score }))
        .sort((a, b) => b.score - a.score);
}

function selectRetryDialectOnParseFailure(
    sql: string,
    currentDialect: SqlDialect
): { retryDialect: SqlDialect | null; detection: DialectDetectionResult } {
    const detection = detectDialect(sql);

    if (detection.dialect && detection.dialect !== currentDialect) {
        return { retryDialect: detection.dialect, detection };
    }

    // For low-confidence detections, allow a retry when there is a clear top score.
    // This helps recover from common dialect mismatches without forcing auto-switch in UI.
    const ranked = rankDialectScores(detection.scores);
    const top = ranked[0];
    const secondScore = ranked[1]?.score ?? 0;

    if (!top || top.dialect === currentDialect) {
        return { retryDialect: null, detection };
    }

    if (top.score >= 2 && top.score > secondScore) {
        return { retryDialect: top.dialect, detection };
    }

    return { retryDialect: null, detection };
}

/**
 * Regex-based fallback parser for when AST parsing fails.
 * Extracts basic structure (tables, columns, JOINs) to show best-effort visualization.
 * This is better than showing nothing - 70% accuracy > 0%.
 */
function regexFallbackParse(sql: string, dialect: SqlDialect): ParseResult {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const tableNames = new Set<string>();
    const hints: OptimizationHint[] = []; // Declare hints early
    let nodeId = 0;

    // Helper to generate node IDs
    const genId = (prefix: string) => `${prefix}_${nodeId++}`;

    // Strip comments before regex extraction to avoid picking up
    // table-like words from comment text (e.g. "-- JOIN Patterns")
    const commentStripped = sql
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/--[^\n]*/g, '')            // line comments
        .replace(/#[^\n]*/g, '');            // MySQL-style # comments

    // Check for CTEs FIRST (before extracting regular tables)
    // This ensures CTEs are marked with the correct category
    const ctePattern = /WITH\s+(\w+)\s+AS/i;
    const cteMatch = ctePattern.exec(commentStripped);
    const cteNames = new Set<string>();
    
    if (cteMatch) {
        const cteName = cteMatch[1];
        cteNames.add(cteName);
        tableNames.add(cteName);
        nodes.push({
            id: genId('cte'),
            type: 'table',
            label: cteName,
            description: 'CTE (detected by fallback parser)',
            details: ['Common Table Expression'],
            x: 0,
            y: nodes.length * 100,
            width: 160,
            height: 60,
            tableCategory: 'cte_reference',
        });
    }

    // Extract table names from FROM, JOIN, INTO, UPDATE, MERGE clauses
    // Skip CTE names that were already added above
    const tablePatterns = [
        /\bFROM\s+([`"']?[\w.]+[`"']?)/gi,
        /\bJOIN\s+([`"']?[\w.]+[`"']?)/gi,
        /\bINTO\s+([`"']?[\w.]+[`"']?)/gi,
        /\bUPDATE\s+([`"']?[\w.]+[`"']?)/gi,
        /\bMERGE\s+INTO\s+([`"']?[\w.]+[`"']?)/gi,
        /\bUSING\s+([`"']?[\w.]+[`"']?)/gi,
    ];

    for (const pattern of tablePatterns) {
        let match;
        while ((match = pattern.exec(commentStripped)) !== null) {
            let tableName = match[1].replace(/[`"']/g, '');
            // Remove schema prefix if present
            tableName = tableName.split('.').pop() || tableName;
            // Skip if it's a CTE (already added) or already exists
            if (tableName && !tableNames.has(tableName)) {
                tableNames.add(tableName);
                nodes.push({
                    id: genId('table'),
                    type: 'table',
                    label: tableName,
                    description: 'Table (detected by fallback parser)',
                    details: ['Partial visualization - parsing failed'],
                    x: 0,
                    y: nodes.length * 100,
                    width: 160,
                    height: 60,
                    tableCategory: 'physical',
                });
            }
        }
    }

    // Extract JOIN relationships
    const joinPattern = /\bJOIN\s+([`"']?[\w.]+[`"']?)\s+(?:ON|USING)/gi;
    let joinMatch;
    let previousTable: string | null = null;

    while ((joinMatch = joinPattern.exec(commentStripped)) !== null) {
        const joinTable = joinMatch[1].replace(/[`"']/g, '').split('.').pop() || joinMatch[1];

        // Find the table before this JOIN
        const beforeMatch = commentStripped.substring(0, joinMatch.index).match(/FROM\s+([`"']?[\w.]+[`"']?)\s*$/i);
        if (beforeMatch) {
            previousTable = beforeMatch[1].replace(/[`"']/g, '').split('.').pop() || beforeMatch[1];
        }
        
        if (previousTable && tableNames.has(previousTable) && tableNames.has(joinTable)) {
            edges.push({
                id: genId('edge'),
                source: nodes.find(n => n.label === previousTable)?.id || '',
                target: nodes.find(n => n.label === joinTable)?.id || '',
                sqlClause: 'JOIN',
                clauseType: 'join',
            });
        }
        previousTable = joinTable;
    }

    // Detect statement type for hints
    const upperSql = commentStripped.toUpperCase().trim();
    let statementType = 'UNKNOWN';
    if (upperSql.startsWith('SELECT')) {statementType = 'SELECT';}
    else if (upperSql.startsWith('INSERT')) {statementType = 'INSERT';}
    else if (upperSql.startsWith('UPDATE')) {statementType = 'UPDATE';}
    else if (upperSql.startsWith('DELETE')) {statementType = 'DELETE';}
    else if (upperSql.startsWith('MERGE')) {
        statementType = 'MERGE';
        
        // Enhanced MERGE statement visualization
        // Extract WHEN MATCHED/NOT MATCHED clauses
        const whenClauses = [];
        
        // Extract WHEN MATCHED clauses with their action (keyword after THEN)
        const whenMatchedPattern = /WHEN\s+MATCHED\s+(?:AND\s+[^:]+\s+)?THEN\s+(\w+)/gi;
        let match;
        while ((match = whenMatchedPattern.exec(commentStripped)) !== null) {
            whenClauses.push({
                type: 'MATCHED',
                action: match[1] || 'UPDATE',
            });
        }
        
        // Extract WHEN NOT MATCHED clauses with their action
        const whenNotMatchedPattern = /WHEN\s+NOT\s+MATCHED\s+(?:BY\s+\w+\s+)?THEN\s+(\w+)/gi;
        while ((match = whenNotMatchedPattern.exec(commentStripped)) !== null) {
            whenClauses.push({
                type: 'NOT MATCHED',
                action: match[1] || 'INSERT',
            });
        }

        // Find MERGE target and source tables
        const mergeTargetMatch = commentStripped.match(/MERGE\s+INTO\s+([`"']?[\w.]+[`"']?)/i);
        const mergeSourceMatch = commentStripped.match(/USING\s+([`"']?[\w.]+[`"']?)/i);
        
        if (mergeTargetMatch && mergeSourceMatch) {
            const targetTable = mergeTargetMatch[1].replace(/[`"']/g, '').split('.').pop() || mergeTargetMatch[1];
            const sourceTable = mergeSourceMatch[1].replace(/[`"']/g, '').split('.').pop() || mergeSourceMatch[1];
            
            // Create a dedicated MERGE node
            const mergeNodeId = genId('merge');
            nodes.push({
                id: mergeNodeId,
                type: 'result',
                label: 'MERGE',
                description: 'MERGE operation',
                details: [
                    `Target: ${targetTable}`,
                    `Source: ${sourceTable}`,
                    `Branches: ${whenClauses.length} WHEN clause${whenClauses.length > 1 ? 's' : ''}`,
                    ...whenClauses.map(w => `  WHEN ${w.type}: ${w.action}`)
                ],
                x: 100,
                y: nodes.length * 100,
                width: 180,
                height: 80 + whenClauses.length * 15,
                accessMode: 'write',
                operationType: 'MERGE',
            });

            // Add edges from source and target to MERGE node
            const sourceNode = nodes.find(n => n.label === sourceTable);
            const targetNode = nodes.find(n => n.label === targetTable);
            
            if (sourceNode) {
                edges.push({
                    id: genId('edge'),
                    source: sourceNode.id,
                    target: mergeNodeId,
                    sqlClause: 'USING',
                    clauseType: 'merge_source',
                });
            }
            
            if (targetNode) {
                edges.push({
                    id: genId('edge'),
                    source: mergeNodeId,
                    target: targetNode.id,
                    sqlClause: 'INTO',
                    clauseType: 'merge_target',
                });
            }
        }
        
        // Add MERGE-specific hints
        if (dialect === 'PostgreSQL') {
            hints.push({
                type: 'info',
                message: 'MERGE statement detected (using fallback parser)',
                suggestion: 'Consider using INSERT ... ON CONFLICT DO UPDATE for PostgreSQL upserts, which is more widely supported.',
                category: 'best-practice',
                severity: 'low',
            });
        } else if (dialect === 'MySQL') {
            hints.push({
                type: 'info',
                message: 'MERGE statement detected (using fallback parser)',
                suggestion: 'Consider using INSERT ... ON DUPLICATE KEY UPDATE for MySQL upserts, which is more widely supported.',
                category: 'best-practice',
                severity: 'low',
            });
        } else if (dialect === 'TransactSQL') {
            hints.push({
                type: 'info',
                message: 'MERGE statement detected (using fallback parser)',
                suggestion: 'MERGE is fully supported in TransactSQL. This visualization is approximate due to parse limitations.',
                category: 'best-practice',
                severity: 'low',
            });
        } else {
            hints.push({
                type: 'info',
                message: 'MERGE statement detected (using fallback parser)',
                suggestion: 'MERGE syntax varies by dialect. This visualization shows approximate table relationships.',
                category: 'best-practice',
                severity: 'low',
            });
        }
    }
    else if (upperSql.startsWith('CREATE')) {statementType = 'CREATE';}
    else if (upperSql.startsWith('ALTER')) {statementType = 'ALTER';}
    else if (upperSql.startsWith('DROP')) {statementType = 'DROP';}

    // Build stats
    const stats: QueryStats = {
        tables: tableNames.size,
        joins: edges.length,
        subqueries: (commentStripped.match(/\bsubquery\b/gi) || []).length,
        ctes: cteMatch ? 1 : 0,
        aggregations: (commentStripped.match(/\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT)\b/gi) || []).length,
        windowFunctions: (commentStripped.match(/\bOVER\s*\(/gi) || []).length,
        unions: (commentStripped.match(/\bUNION\b/gi) || []).length,
        conditions: (commentStripped.match(/\bWHERE\b/gi) || []).length + (commentStripped.match(/\bHAVING\b/gi) || []).length,
        complexity: 'Simple',
        complexityScore: tableNames.size * 1 + edges.length * 3,
    };

    // Update complexity based on score
    if (stats.complexityScore >= 30) {stats.complexity = 'Very Complex';}
    else if (stats.complexityScore >= 15) {stats.complexity = 'Complex';}
    else if (stats.complexityScore >= 5) {stats.complexity = 'Moderate';}

    // Add the partial visualization warning hint
    hints.push({
        type: 'warning',
        message: 'Partial visualization - SQL parser could not parse this query',
        suggestion: `Showing best-effort approximation with ${tableNames.size} table(s) detected. This query may use syntax not supported by the ${dialect} dialect parser.`,
        category: 'best-practice',
        severity: 'medium',
    });

    // Filter out broken edges with empty source or target IDs
    const validEdges = edges.filter(e => e.source && e.target);

    return {
        nodes,
        edges: validEdges,
        stats,
        hints,
        sql,
        columnLineage: [],
        tableUsage: new Map(),
        partial: true, // Mark as partial visualization
    };
}

export function parseSql(sql: string, dialect: SqlDialect = 'MySQL'): ParseResult {
    // Reset all parser state atomically by creating a fresh context
    ctx = createFreshContext(dialect);
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    if (!sql || !sql.trim()) {
        return { nodes, edges, stats: ctx.stats, hints: ctx.hints, sql, columnLineage: [], tableUsage: new Map(), error: 'No SQL provided' };
    }

    // Check if this is a session/utility command that node-sql-parser doesn't support
    const sessionResult = tryParseSessionCommand(sql, dialect);
    if (sessionResult) {
        return sessionResult;
    }

    // Auto-hoist CTEs nested inside subqueries (e.g., Snowflake/Tableau patterns)
    const hoistedSql = hoistNestedCtes(sql);
    if (hoistedSql !== null) {
        sql = hoistedSql;
        ctx.hints.push({
            type: 'info',
            message: 'Hoisted nested CTE(s) from subquery to top level for parser compatibility',
            suggestion: 'Nested WITH inside FROM (...) is valid in some dialects but unsupported by the parser. The query was automatically rewritten.',
            category: 'best-practice',
            severity: 'low',
        });
    }

    const parser = new Parser();

    try {
        let ast: any;
        let effectiveDialect = dialect;

        const parseWithDialect = (targetDialect: SqlDialect): any => {
            try {
                return parser.astify(sql, { database: targetDialect });
            } catch (parseError) {
                const fallbackAst = tryParseSnowflakeDmlFallback(parser, sql, targetDialect);
                if (!fallbackAst) {
                    throw parseError;
                }
                return fallbackAst;
            }
        };

        // Timeout protection: measure parse duration and warn/fallback if too slow
        const parseStartTime = Date.now();
        try {
            ast = parseWithDialect(dialect);
        } catch (primaryParseError) {
            const { retryDialect } = selectRetryDialectOnParseFailure(sql, dialect);
            if (!retryDialect) {
                throw primaryParseError;
            }

            try {
                ast = parseWithDialect(retryDialect);
                effectiveDialect = retryDialect;
                ctx.dialect = retryDialect;
                ctx.hints.push({
                    type: 'info',
                    message: `Auto-retried parse with ${retryDialect} dialect after ${dialect} parse failure`,
                    suggestion: 'If this dialect is expected, switch the parser dialect in the toolbar for consistent parsing.',
                    category: 'best-practice',
                    severity: 'low',
                });
            } catch {
                throw primaryParseError;
            }
        }

        const parseDurationMs = Date.now() - parseStartTime;

        // If parsing exceeded the timeout, fall back to regex parser for a lighter result
        if (parseDurationMs > PARSE_TIMEOUT_MS) {
            const timeoutHint = {
                type: 'warning' as const,
                message: `Query parsing took ${(parseDurationMs / 1000).toFixed(1)}s — exceeded ${(PARSE_TIMEOUT_MS / 1000).toFixed(0)}s timeout`,
                suggestion: 'Consider simplifying this query or breaking it into smaller parts. The regex fallback parser was used instead.',
                category: 'performance' as const,
                severity: 'high' as const,
            };
            // Return regex fallback with the timeout hint merged in
            const fallbackResult = regexFallbackParse(sql, dialect);
            fallbackResult.hints.unshift(timeoutHint);
            return fallbackResult;
        }

        // Warn if parsing approached the timeout (>70% of limit)
        if (parseDurationMs > PARSE_TIMEOUT_MS * 0.7) {
            ctx.hints.push({
                type: 'warning',
                message: `Query parsing took ${(parseDurationMs / 1000).toFixed(1)}s — approaching ${(PARSE_TIMEOUT_MS / 1000).toFixed(0)}s timeout limit`,
                suggestion: 'Consider simplifying this query or breaking it into smaller parts for better performance.',
                category: 'performance',
                severity: 'medium',
            });
        }
        const statements = Array.isArray(ast) ? ast : [ast];

        for (const stmt of statements) {
            processStatement(stmt, nodes, edges);
        }

        // Calculate complexity
        calculateComplexity();

        // Generate optimization hints
        generateHints(statements[0]);

        // Detect dialect-specific syntax patterns
        detectDialectSpecificSyntax(sql, effectiveDialect);

        // Detect advanced issues (unused CTEs, dead columns, etc.)
        detectAdvancedIssues(nodes, edges, sql);

        // Calculate enhanced complexity metrics
        calculateEnhancedMetrics(nodes, edges);

        // Phase 3: Static performance analysis
        // Pass existing hints so performance analyzer can merge overlapping hints
        // (e.g., duplicate subquery hints + repeated table scan hints)
        if (statements[0]) {
            const perfAnalysis = analyzePerformance(statements[0], nodes, edges, ctx.tableUsageMap, ctx.hints);
            ctx.hints.push(...perfAnalysis.hints);

            // Filter out hints that were merged into performance hints
            // (marked with _merged flag by detectRepeatedScans)
            const mergedCount = ctx.hints.filter(h => (h as any)._merged).length;
            if (mergedCount > 0) {
                ctx.hints = ctx.hints.filter(h => !(h as any)._merged);
            }
        }

        // Calculate performance score after all hints are collected (0-100, higher is better)
        const perfHints = ctx.hints.filter(h => h.category === 'performance');
        if (perfHints.length > 0) {
            const highSeverityCount = perfHints.filter(h => h.severity === 'high').length;
            const mediumSeverityCount = perfHints.filter(h => h.severity === 'medium').length;
            const lowSeverityCount = perfHints.filter(h => h.severity === 'low').length;

            // Start with 100 and deduct points for issues
            let score = 100;
            score -= highSeverityCount * 15;  // High severity issues cost 15 points
            score -= mediumSeverityCount * 8; // Medium severity issues cost 8 points
            score -= lowSeverityCount * 3;    // Low severity issues cost 3 points

            ctx.stats.performanceScore = Math.max(0, Math.min(100, Math.round(score)));
            ctx.stats.performanceIssues = perfHints.length;
        }

        // Use dagre for layout
        layoutGraph(nodes, edges);

        // Assign line numbers to nodes for editor sync
        assignLineNumbers(nodes, sql);

        // Extract column lineage
        const columnLineage = extractColumnLineage(statements[0], nodes);

        // Generate column flows for visualization
        const columnFlows = generateColumnFlows(statements[0], nodes, edges);

        // Calculate column positions on nodes
        calculateColumnPositions(nodes);

        // Update stats.tables to reflect the actual number of unique tables (including from CTEs and subqueries)
        ctx.stats.tables = ctx.tableUsageMap.size;

        // Convert functionsUsed Set to sorted FunctionUsage array
        if (ctx.functionsUsed.size > 0) {
            ctx.stats.functionsUsed = Array.from(ctx.functionsUsed)
                .map(entry => {
                    const [name, category] = entry.split(':');
                    return { name, category: category as import('./types/parser').FunctionCategory };
                })
                .sort((a, b) => a.name.localeCompare(b.name));
        }

        return { nodes, edges, stats: ctx.stats, hints: ctx.hints, sql, columnLineage, columnFlows, tableUsage: ctx.tableUsageMap };
    } catch (err) {
        const originalError = err instanceof Error ? err.message : 'Parse error';
        let message = originalError;

        // Enhance error messages with helpful dialect suggestions for common issues
        // This helps users quickly identify when they need to switch SQL dialects
        const upperSql = sql.toUpperCase();
        const hasIntervalQuoted = /INTERVAL\s*'[^']+'/i.test(sql);
        const hasParenthesizedUnion = /\(\s*SELECT[\s\S]+\)\s*(UNION|INTERSECT|EXCEPT)/i.test(sql);

        // Extract specific syntax issue from error message
        // Parser errors are typically: "Expected X but "Y" found" or "Unexpected token Y"
        // We want to extract what was found (the problematic token)
        const butFoundMatch = originalError.match(/but\s+["']([^"']+)["']\s+found/i);
        const quotedFoundMatch = originalError.match(/["']([^"']+)["']\s+found/i);
        const unexpectedMatch = originalError.match(/unexpected\s+(?:token\s+)?["']?(\w+)["']?/i);
        const syntaxHint = butFoundMatch ? butFoundMatch[1] :
                          (quotedFoundMatch ? quotedFoundMatch[1] :
                          (unexpectedMatch ? unexpectedMatch[1] : null));
        const parseLocation = extractParseErrorLocation(err, originalError, sql, syntaxHint);

        // Check for || concatenation operator failure
        const hasPipeConcat = /\|\|/.test(sql);

        if (originalError.includes('found') || originalError.includes('Expected')) {
            if (hasPipeConcat && (syntaxHint === '|' || syntaxHint === '||' || originalError.includes('||'))) {
                message = `|| concatenation operator failed to parse in ${ctx.dialect}. Try PostgreSQL or MySQL dialect which supports || concatenation.`;
            } else if (ctx.dialect === 'MySQL') {
                // MySQL-specific issues - check in order of likelihood
                if (hasParenthesizedUnion && hasIntervalQuoted) {
                    message = `This query uses PostgreSQL syntax (INTERVAL '...' and parenthesized UNION). Try PostgreSQL dialect.`;
                } else if (hasParenthesizedUnion) {
                    message = `Parenthesized set operations not supported in MySQL. Try PostgreSQL dialect.`;
                } else if (hasIntervalQuoted) {
                    message = `PostgreSQL-style INTERVAL syntax detected. Try PostgreSQL dialect, or use MySQL syntax: INTERVAL 30 DAY.`;
                } else {
                    message = `SQL syntax not recognized by MySQL parser${syntaxHint ? ` (near '${syntaxHint}')` : ''}. Try PostgreSQL dialect (most compatible).`;
                }
            }
            // Check for INTERSECT/EXCEPT which are only supported in MySQL/PostgreSQL
            else if (upperSql.includes('INTERSECT') || upperSql.includes('EXCEPT')) {
                const dialectsWithSupport = ['MySQL', 'PostgreSQL'];
                if (!dialectsWithSupport.includes(ctx.dialect)) {
                    message = `INTERSECT/EXCEPT not supported in ${ctx.dialect}. Try MySQL or PostgreSQL dialect.`;
                }
            }
            // Check for recursive CTE
            else if (upperSql.includes('RECURSIVE') && !['PostgreSQL', 'MySQL', 'SQLite'].includes(ctx.dialect)) {
                message = `RECURSIVE CTE not supported in ${ctx.dialect}. Try PostgreSQL or MySQL dialect.`;
            }
            // Generic parse error - include original error details for better debugging
            else {
                message = `SQL syntax not recognized by ${ctx.dialect} parser${syntaxHint ? ` (near '${syntaxHint}')` : ''}. Try PostgreSQL dialect (most compatible).`;
            }
        }

        const locationPrefix = formatErrorLocationPrefix(parseLocation);
        if (locationPrefix && !/^Line\s+\d+/i.test(message)) {
            message = `${locationPrefix}: ${message}`;
        }

        // Even when parsing fails, try to detect dialect-specific syntax
        // to provide helpful hints to users
        detectDialectSpecificSyntax(sql, dialect);

        // Instead of returning empty result, use regex fallback parser
        // This gives users a best-effort visualization instead of nothing
        const fallbackResult = regexFallbackParse(sql, dialect);

        // Add the original parse error as a hint so users know what went wrong
        fallbackResult.hints.unshift({
            type: 'error',
            message: `Parse error: ${message}`,
            suggestion: 'Showing partial visualization using fallback parser. Some elements may be inaccurate.',
            category: 'best-practice',
            severity: 'high',
        });

        // Merge dialect-specific hints from ctx (populated by detectDialectSpecificSyntax above)
        fallbackResult.hints.push(...ctx.hints);

        return fallbackResult;
    }
}

function generateHints(stmt: any): void {
    if (!stmt) { return; }

    const type = stmt.type?.toLowerCase() || '';

    // SELECT * warning
    if (ctx.hasSelectStar) {
        ctx.hints.push({
            type: 'warning',
            message: 'SELECT * detected',
            suggestion: 'Specify only needed columns to reduce data transfer and improve performance'
        });
    }

    // Missing LIMIT on SELECT
    if (type === 'select' && ctx.hasNoLimit && ctx.stats.tables > 0) {
        ctx.hints.push({
            type: 'info',
            message: 'No LIMIT clause',
            suggestion: 'Consider adding LIMIT to prevent fetching large result sets'
        });
    }

    // Missing WHERE on UPDATE/DELETE
    if ((type === 'update' || type === 'delete') && !stmt.where) {
        ctx.hints.push({
            type: 'error',
            message: `${type.toUpperCase()} without WHERE clause`,
            suggestion: 'This will affect ALL rows in the table. Add a WHERE clause to limit scope'
        });
    }

    // Too many JOINs
    if (ctx.stats.joins > 5) {
        ctx.hints.push({
            type: 'warning',
            message: `High number of JOINs (${ctx.stats.joins})`,
            suggestion: 'Consider breaking into smaller queries or using CTEs for clarity'
        });
    }

    // Deeply nested subqueries
    if (ctx.stats.subqueries > 3) {
        ctx.hints.push({
            type: 'warning',
            message: `Multiple subqueries detected (${ctx.stats.subqueries})`,
            suggestion: 'Consider using CTEs (WITH clause) for better readability'
        });
    }

    // Cartesian product (no join condition)
    if (ctx.stats.tables > 1 && ctx.stats.joins === 0 && ctx.stats.conditions === 0) {
        ctx.hints.push({
            type: 'error',
            message: 'Possible Cartesian product',
            suggestion: 'Multiple tables without JOIN conditions will produce all row combinations',
            category: 'performance',
            severity: 'high'
        });
    }
}

// Advanced quality checks - detect unused CTEs, dead columns, duplicate subqueries
// Phase 2 Feature: Advanced SQL Annotations
function detectAdvancedIssues(nodes: FlowNode[], _edges: FlowEdge[], sql: string): void {
    // Detect unused CTEs
    // Fix: Properly match CTE names by removing "WITH " prefix and checking all table references
    const cteNodes = nodes.filter(n => n.type === 'cte');
    const referencedCTEs = new Set<string>();
    
    // Build a set of all CTE names (without "WITH " prefix for accurate matching)
    const allCteNames = new Set<string>();
    cteNodes.forEach(cteNode => {
        let cteName = cteNode.label.toLowerCase();
        if (cteName.startsWith('with ')) {
            cteName = cteName.substring(5).trim();
        }
        allCteNames.add(cteName);
    });

    // Track which CTEs are actually referenced in the query
    // Check all table nodes, not just those marked as cte_reference
    nodes.forEach(node => {
        if (node.type === 'table') {
            const tableName = node.label.toLowerCase().trim();
            // Check if this table name matches any CTE name
            if (allCteNames.has(tableName)) {
                referencedCTEs.add(tableName);
            }
            // Also check if it's marked as cte_reference (backup check)
            if (node.tableCategory === 'cte_reference') {
                referencedCTEs.add(tableName);
            }
        }
    });

    cteNodes.forEach(cteNode => {
        // Extract CTE name from label (remove "WITH " prefix if present)
        // This ensures accurate matching between CTE definitions and references
        let cteName = cteNode.label.toLowerCase();
        if (cteName.startsWith('with ')) {
            cteName = cteName.substring(5).trim();
        }
        
        if (!referencedCTEs.has(cteName)) {
            // CTE is defined but never used
            if (!cteNode.warnings) {cteNode.warnings = [];}
            cteNode.warnings.push({
                type: 'unused',
                severity: 'medium',
                message: 'This CTE is never referenced in the query'
            });

            ctx.hints.push({
                type: 'warning',
                message: `Unused CTE: "${cteNode.label}"`,
                suggestion: 'Remove this CTE as it is not used anywhere in the query',
                category: 'quality',
                nodeId: cteNode.id,
                severity: 'medium'
            });
        }
    });

    // ============================================================
    // Phase 2 Feature: Duplicate Subquery Detection
    // ============================================================
    // Detects duplicate or similar subqueries that could be extracted to CTEs
    // for better maintainability and performance.
    //
    // Detection Strategy:
    // 1. Collect FROM subqueries (already have nodes in the graph)
    // 2. Extract subqueries from WHERE/SELECT/HAVING clauses using SQL parsing
    // 3. Normalize subqueries for comparison (remove whitespace, aliases)
    // 4. Group by similarity (same FROM table, same aggregate, same WHERE presence)
    // 5. Add warnings to nodes and hints to the hints panel
    // ============================================================
    
    interface SubqueryMatch {
        sql: string;           // The subquery SQL
        normalized: string;    // Normalized signature for comparison
        location: 'from' | 'where' | 'select' | 'having';
        node?: FlowNode;       // For FROM subqueries that have nodes
        parentNodeId?: string; // For WHERE/SELECT subqueries
    }
    
    const allSubqueries: SubqueryMatch[] = [];
    const sqlLower = sql.toLowerCase();
    
    // 1. Collect FROM subqueries (already have nodes)
    const subqueryNodes = nodes.filter(n => n.type === 'subquery');
    subqueryNodes.forEach(node => {
        const desc = (node.description || node.label || '').toLowerCase();
        if (desc) {
            // Create normalized signature
            const normalized = desc.replace(/\s+/g, ' ').trim();
            allSubqueries.push({
                sql: desc,
                normalized: normalized,
                location: 'from',
                node: node,
                parentNodeId: node.parentId
            });
        }
    });
    
    // 2. Extract subqueries from SQL using balanced parentheses matching
    // This handles nested subqueries correctly by tracking parenthesis depth
    const extractSubquery = (sql: string, startIndex: number): { sql: string; endIndex: number } | null => {
        if (sql[startIndex] !== '(') {return null;}
        
        let depth = 0;
        let i = startIndex;
        let start = i + 1; // Skip opening (
        
        while (i < sql.length) {
            if (sql[i] === '(') {depth++;}
            if (sql[i] === ')') {
                depth--;
                if (depth === 0) {
                    return {
                        sql: sql.substring(start, i).trim(),
                        endIndex: i
                    };
                }
            }
            i++;
        }
        return null;
    };
    
    // Find all (SELECT ...) patterns
    let searchIndex = 0;
    
    while (searchIndex < sql.length) {
        // Look for SELECT keyword
        const selectPos = sqlLower.indexOf('select', searchIndex);
        if (selectPos === -1) {break;}
        
        // Check if it's inside parentheses (subquery)
        // Look backwards for opening parenthesis
        let parenPos = -1;
        for (let i = selectPos - 1; i >= 0 && i >= selectPos - 100; i--) {
            if (sql[i] === '(') {
                parenPos = i;
                break;
            }
            if (sql[i] === ')' || sql[i] === ';') {break;} // Not a subquery
        }
        
        if (parenPos >= 0) {
            const subquery = extractSubquery(sql, parenPos);
            if (subquery && subquery.sql.toLowerCase().includes('from')) {
                // Normalize: remove extra whitespace, lowercase, remove table aliases for comparison
                let normalized = subquery.sql.replace(/\s+/g, ' ').toLowerCase();
                // Remove table aliases (e.g., "orders o" -> "orders")
                normalized = normalized.replace(/\b(\w+)\s+\w+\b/g, '$1');
                
                // Determine location based on context
                const beforeMatch = sql.substring(Math.max(0, parenPos - 100), parenPos).toLowerCase();
                let location: 'where' | 'select' | 'having' = 'where';
                if (beforeMatch.includes('select') && !beforeMatch.includes('where') && !beforeMatch.includes('having') && !beforeMatch.includes('from')) {
                    location = 'select';
                } else if (beforeMatch.includes('having')) {
                    location = 'having';
                }
                
                allSubqueries.push({
                    sql: subquery.sql,
                    normalized: normalized,
                    location: location
                });
                
                searchIndex = subquery.endIndex + 1;
            } else {
                searchIndex = selectPos + 6;
            }
        } else {
            searchIndex = selectPos + 6;
        }
    }
    
    // 3. Group subqueries by normalized signature for exact duplicate detection
    const subqueryGroups = new Map<string, SubqueryMatch[]>();
    allSubqueries.forEach(subq => {
        if (!subqueryGroups.has(subq.normalized)) {
            subqueryGroups.set(subq.normalized, []);
        }
        subqueryGroups.get(subq.normalized)!.push(subq);
    });
    
    // 4. Detect similar subqueries (not just identical)
    // Similarity criteria: same FROM table, same aggregate function, same WHERE presence
    const similarGroups: SubqueryMatch[][] = [];
    const processed = new Set<string>();
    
    allSubqueries.forEach((subq1, idx1) => {
        if (processed.has(subq1.normalized)) {return;}
        
        const similar: SubqueryMatch[] = [subq1];
        allSubqueries.forEach((subq2, idx2) => {
            if (idx1 >= idx2 || processed.has(subq2.normalized)) {return;}
            
            // Check if subqueries are similar (same FROM table and similar structure)
            const sig1 = subq1.normalized;
            const sig2 = subq2.normalized;
            
            // Extract key parts: FROM table and aggregate function
            const from1 = sig1.match(/from\s+(\w+)/);
            const from2 = sig2.match(/from\s+(\w+)/);
            const agg1 = sig1.match(/(avg|count|sum|max|min)\s*\(/);
            const agg2 = sig2.match(/(avg|count|sum|max|min)\s*\(/);
            const where1 = sig1.includes('where');
            const where2 = sig2.includes('where');
            
            // Consider similar if: same FROM table, same aggregate (or both have aggregates), both have WHERE
            if (from1 && from2 && from1[1] === from2[1] && 
                where1 === where2 && 
                (agg1 && agg2 && agg1[1] === agg2[1] || (!agg1 && !agg2))) {
                similar.push(subq2);
                processed.add(subq2.normalized);
            }
        });
        
        if (similar.length > 1) {
            similarGroups.push(similar);
            processed.add(subq1.normalized);
        }
    });
    
    // Add warnings for similar groups
    similarGroups.forEach(group => {
        group.forEach(subq => {
            if (subq.node) {
                if (!subq.node.warnings) {subq.node.warnings = [];}
                subq.node.warnings.push({
                    type: 'complex',
                    severity: 'low',
                    message: `Similar subquery (${group.length} duplicates detected)`
                });
            } else {
                let targetNode: FlowNode | undefined;
                if (subq.location === 'where' || subq.location === 'having') {
                    targetNode = nodes.find(n => 
                        n.type === 'filter' && 
                        n.label === (subq.location === 'having' ? 'HAVING' : 'WHERE')
                    );
                } else if (subq.location === 'select') {
                    targetNode = nodes.find(n => n.type === 'select');
                }
                
                if (targetNode) {
                    if (!targetNode.warnings) {targetNode.warnings = [];}
                    targetNode.warnings.push({
                        type: 'complex',
                        severity: 'low',
                        message: `Duplicate subquery in ${subq.location.toUpperCase()} (${group.length} similar found)`
                    });
                }
            }
        });
        
            ctx.hints.push({
                type: 'info',
            message: `${group.length} similar subqueries detected`,
                suggestion: 'Consider extracting to a CTE to avoid duplication and improve maintainability',
                category: 'quality',
                severity: 'low'
            });
    });
    
    // Also check exact matches (original logic)
    subqueryGroups.forEach((group, signature) => {
        // Only flag if we have 2+ identical subqueries and signature is meaningful (at least 15 chars)
        if (group.length > 1 && signature.length > 15 && !processed.has(signature)) {
            group.forEach(subq => {
                if (subq.node) {
                    // FROM subquery - has a node, add warning to it
                    if (!subq.node.warnings) {subq.node.warnings = [];}
                    subq.node.warnings.push({
                        type: 'complex',
                        severity: 'low',
                        message: `Similar subquery (${group.length} duplicates detected)`
                    });
                } else {
                    // WHERE/SELECT subquery - find the appropriate node to warn
                    let targetNode: FlowNode | undefined;
                    
                    if (subq.location === 'where' || subq.location === 'having') {
                        // Find WHERE or HAVING filter node
                        targetNode = nodes.find(n => 
                            n.type === 'filter' && 
                            n.label === (subq.location === 'having' ? 'HAVING' : 'WHERE')
                        );
                    } else if (subq.location === 'select') {
                        // Find SELECT node
                        targetNode = nodes.find(n => n.type === 'select');
                    }
                    
                    if (targetNode) {
                        if (!targetNode.warnings) {targetNode.warnings = [];}
                        targetNode.warnings.push({
                            type: 'complex',
                            severity: 'low',
                            message: `Duplicate subquery in ${subq.location.toUpperCase()} (${group.length} similar found)`
                        });
                    }
                }
            });
            
            // Add hint
            ctx.hints.push({
                type: 'info',
                message: `${group.length} similar subqueries detected`,
                suggestion: 'Consider extracting to a CTE to avoid duplication and improve maintainability',
                category: 'quality',
                severity: 'low'
            });
        }
    });

    // ============================================================
    // Phase 2 Feature: Dead Column Detection
    // ============================================================
    // Detects columns that are selected but never used in WHERE/ORDER BY/
    // GROUP BY/HAVING/JOIN clauses. These "dead columns" add unnecessary
    // data transfer and reduce query clarity.
    //
    // Detection Strategy:
    // 1. Extract column names from SELECT node (from AST) and SQL string (fallback)
    // 2. For each column, check if it appears in WHERE/ORDER BY/GROUP BY/HAVING/JOIN clauses
    // 3. Use word boundary regex to ensure exact column name matches
    // 4. Add warnings to SELECT node and hints to the hints panel
    // ============================================================
    
    const selectNodes = nodes.filter(n => n.type === 'select' && n.columns);
    selectNodes.forEach(selectNode => {
        if (!selectNode.columns || selectNode.columns.length === 0) {return;}

        // Skip dead column detection for top-level SELECT nodes (final query output)
        // A SELECT with no parentId is a top-level query - all its columns are output columns
        // Dead column detection should only apply to intermediate SELECTs (CTEs/subqueries)
        // where columns might be selected but not used downstream
        if (!selectNode.parentId) {
            // This is a top-level SELECT - all columns are valid output, skip dead column detection
            return;
        }

        // Normalize SQL: remove comments, normalize whitespace for reliable matching
        const normalizedSql = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').replace(/#[^\n]*/g, '').replace(/\s+/g, ' ').trim();
        const sqlLower = normalizedSql.toLowerCase();

        // Extract column names directly from SQL SELECT clause as fallback
        // This ensures we have the actual column names as they appear in SQL,
        // which may differ from AST-extracted names (handles aliases, expressions)
        const selectClauseMatch = normalizedSql.match(/select\s+(.+?)\s+from/i);
        const sqlColumnNamesMap = new Map<string, string[]>(); // column name -> [all variations]
        if (selectClauseMatch) {
            const selectClause = selectClauseMatch[1];
            // Split by comma, handling potential commas in expressions
            const columnParts: string[] = [];
            let current = '';
            let parenDepth = 0;
            for (let i = 0; i < selectClause.length; i++) {
                const char = selectClause[i];
                if (char === '(') {parenDepth++;}
                else if (char === ')') {parenDepth--;}
                else if (char === ',' && parenDepth === 0) {
                    columnParts.push(current.trim());
                    current = '';
                    continue;
                }
                current += char;
            }
            if (current.trim()) {columnParts.push(current.trim());}
            
            columnParts.forEach(part => {
                const trimmed = part.trim();
                // Extract column name and alias
                // Pattern: "column_name" or "column_name AS alias" or "table.column" or just "column"
                const aliasMatch = trimmed.match(/\s+as\s+(\w+)$/i);
                const columnMatch = trimmed.match(/(?:^|\s)(\w+)(?:\s|$)/);
                
                if (aliasMatch) {
                    const alias = aliasMatch[1];
                    const colName = columnMatch ? columnMatch[1] : null;
                    if (colName && colName !== alias) {
                        sqlColumnNamesMap.set(alias.toLowerCase(), [alias, colName]);
                    } else {
                        sqlColumnNamesMap.set(alias.toLowerCase(), [alias]);
                    }
                } else if (columnMatch) {
                    const colName = columnMatch[1];
                    sqlColumnNamesMap.set(colName.toLowerCase(), [colName]);
                }
            });
        }

        selectNode.columns.forEach(col => {
            const colName = col.name;
            // Build list of all possible column name variations to check
            const colNamesToCheck = new Set<string>();
            colNamesToCheck.add(colName);
            if (col.sourceColumn && col.sourceColumn !== colName) {
                colNamesToCheck.add(col.sourceColumn);
            }
            // Add SQL-extracted names that match this column
            const colNameLower = colName.toLowerCase();
            if (sqlColumnNamesMap.has(colNameLower)) {
                sqlColumnNamesMap.get(colNameLower)!.forEach(name => colNamesToCheck.add(name));
            }
            // Also check if any SQL column name matches (case-insensitive)
            sqlColumnNamesMap.forEach((names, key) => {
                if (key === colNameLower) {
                    names.forEach(name => colNamesToCheck.add(name));
                }
            });
            
            let isUsed = false;

            // Check if column is used in any query clause using SQL string analysis
            // This is more reliable than AST traversal for detecting column usage
            if (normalizedSql) {
                for (const nameToCheck of Array.from(colNamesToCheck)) {
                    if (isUsed) {break;}
                    
                    // Escape special regex characters to prevent regex injection
                    const escapedColName = escapeRegex(nameToCheck);
                    // Use word boundary pattern to ensure exact column name matches
                    // (prevents matching partial names like "order_id" matching "order")
                    const wordBoundaryPattern = new RegExp(`\\b${escapedColName}\\b`, 'i');
                    
                    // Check WHERE clause: extract text between WHERE and next clause keyword
                    const whereMatch = sqlLower.match(/\bwhere\b\s+(.+?)(?:\s+(?:order|group|having|limit)\s+by|\s+limit|\s*;|\s*$)/i);
                    if (whereMatch && wordBoundaryPattern.test(whereMatch[1])) {
                        isUsed = true;
                        break;
                    }
                    
                    // Check ORDER BY clause: extract text between ORDER BY and LIMIT/end
                    const orderByMatch = sqlLower.match(/\border\s+by\b\s+(.+?)(?:\s+limit|\s*;|\s*$)/i);
                    if (orderByMatch && wordBoundaryPattern.test(orderByMatch[1])) {
                        isUsed = true;
                        break;
                    }
                    
                    // Check GROUP BY clause: extract text between GROUP BY and HAVING/ORDER BY/LIMIT/end
                    const groupByMatch = sqlLower.match(/\bgroup\s+by\b\s+(.+?)(?:\s+(?:having|order|limit)|\s*;|\s*$)/i);
                    if (groupByMatch && wordBoundaryPattern.test(groupByMatch[1])) {
                        isUsed = true;
                        break;
                    }
                    
                    // Check HAVING clause: extract text between HAVING and ORDER BY/LIMIT/end
                    const havingMatch = sqlLower.match(/\bhaving\b\s+(.+?)(?:\s+(?:order|limit)|\s*;|\s*$)/i);
                    if (havingMatch && wordBoundaryPattern.test(havingMatch[1])) {
                        isUsed = true;
                        break;
                    }
                    
                    // Check JOIN ON clauses: find all "JOIN table ON condition" patterns
                    // and check if column appears in the ON condition
                    const joinOnPattern = /\bjoin\b\s+\w+(?:\s+\w+)?\s+\bon\b\s+(.+?)(?:\s+(?:join|where|group|having|order|limit)|\s*;|\s*$)/gi;
                    let joinMatch;
                    while ((joinMatch = joinOnPattern.exec(sqlLower)) !== null) {
                        if (wordBoundaryPattern.test(joinMatch[1])) {
                            isUsed = true;
                            break;
                        }
                    }
                    if (isUsed) {break;}
                }
            }

            // If column is not used in any clause, it's a dead column
            if (!isUsed) {
                if (!selectNode.warnings) {selectNode.warnings = [];}
                selectNode.warnings.push({
                    type: 'dead-column',
                    severity: 'low',
                    message: `Column "${colName}" is not used in WHERE/ORDER BY/GROUP BY/HAVING/JOIN clauses`
                });
            }
        });
        
        // Add optimization hint to hints panel if dead columns are detected
        // This provides a summary in the hints panel for better visibility
        const deadColumns = selectNode.warnings?.filter(w => w.type === 'dead-column') || [];
        if (deadColumns.length > 0) {
            const deadColNames = deadColumns.map(w => {
                const match = w.message.match(/Column "([^"]+)"/);
                return match ? match[1] : '';
            }).filter(Boolean);
            
            ctx.hints.push({
                type: 'info',
                message: `${deadColumns.length} dead column${deadColumns.length > 1 ? 's' : ''} detected: ${deadColNames.slice(0, 3).join(', ')}${deadColNames.length > 3 ? ` and ${deadColNames.length - 3} more` : ''}`,
                suggestion: 'Remove unused columns from SELECT clause to improve query clarity and reduce data transfer',
                category: 'quality',
                nodeId: selectNode.id,
                severity: 'low'
            });
        }
    });

    // Detect repeated table scans
    const tableUsage = new Map<string, FlowNode[]>();
    nodes.filter(n => n.type === 'table' && n.tableCategory === 'physical').forEach(node => {
        const tableName = node.label.toLowerCase();
        if (!tableUsage.has(tableName)) {
            tableUsage.set(tableName, []);
        }
        tableUsage.get(tableName)!.push(node);
    });

    tableUsage.forEach((usages, tableName) => {
        if (usages.length > 1) {
            usages.forEach(node => {
                if (!node.warnings) {node.warnings = [];}
                node.warnings.push({
                    type: 'repeated-scan',
                    severity: 'medium',
                    message: `Table "${tableName}" is scanned ${usages.length} times`
                });
            });

            ctx.hints.push({
                type: 'warning',
                message: `Table "${tableName}" scanned ${usages.length} times`,
                suggestion: 'Consider using a CTE or subquery to scan the table once',
                category: 'performance',
                severity: 'medium'
            });
        }
    });
}

// Calculate enhanced complexity metrics
function calculateEnhancedMetrics(nodes: FlowNode[], edges: FlowEdge[]): void {
    // Calculate max CTE depth
    let maxDepth = 0;
    nodes.forEach(node => {
        if (node.type === 'cte' && node.depth !== undefined) {
            maxDepth = Math.max(maxDepth, node.depth);
        }
    });
    ctx.stats.maxCteDepth = maxDepth;

    // Calculate max fan-out (number of outgoing edges per node)
    const fanOutMap = new Map<string, number>();
    edges.forEach(edge => {
        const count = fanOutMap.get(edge.source) || 0;
        fanOutMap.set(edge.source, count + 1);
    });
    ctx.stats.maxFanOut = Math.max(0, ...Array.from(fanOutMap.values()));

    // Calculate critical path length (longest path from source to result)
    const calculatePathLength = (nodeId: string, visited: Set<string>): number => {
        if (visited.has(nodeId)) {return 0;}
        visited.add(nodeId);

        const outgoing = edges.filter(e => e.source === nodeId);
        if (outgoing.length === 0) {return 1;}

        const maxChildPath = Math.max(
            ...outgoing.map(edge => calculatePathLength(edge.target, new Set(visited)))
        );
        return 1 + maxChildPath;
    };

    // Find root nodes (nodes with no incoming edges)
    const nodesWithIncoming = new Set(edges.map(e => e.target));
    const rootNodes = nodes.filter(n => !nodesWithIncoming.has(n.id));

    ctx.stats.criticalPathLength = Math.max(
        0,
        ...rootNodes.map(node => calculatePathLength(node.id, new Set()))
    );

    // Complexity breakdown
    ctx.stats.complexityBreakdown = {
        joins: ctx.stats.joins * 3,           // Joins add significant complexity
        subqueries: ctx.stats.subqueries * 2,
        ctes: ctx.stats.ctes * 2,
        aggregations: ctx.stats.aggregations * 1,
        windowFunctions: ctx.stats.windowFunctions * 2
    };

    // Identify bottlenecks (nodes with high fan-out or in critical path)
    nodes.forEach(node => {
        const fanOut = fanOutMap.get(node.id) || 0;
        if (fanOut >= 3) {
            if (!node.warnings) {node.warnings = [];}
            node.warnings.push({
                type: 'fan-out',
                severity: fanOut >= 5 ? 'high' : 'medium',
                message: `High fan-out: ${fanOut} outgoing connections`
            });
        }

        // Mark nodes with high complexity
        if ((node.type === 'join' && ctx.stats.joins > 3) ||
            (node.type === 'aggregate' && node.aggregateDetails && node.aggregateDetails.functions.length > 3)) {
            if (!node.warnings) {node.warnings = [];}
            node.warnings.push({
                type: 'complex',
                severity: 'medium',
                message: 'Complex operation - may impact performance'
            });
        }
    });

    // Assign complexity levels to nodes
    nodes.forEach(node => {
        if (node.type === 'join') {
            node.complexityLevel = ctx.stats.joins > 5 ? 'high' : ctx.stats.joins > 2 ? 'medium' : 'low';
        } else if (node.type === 'aggregate') {
            const funcCount = node.aggregateDetails?.functions.length || 0;
            node.complexityLevel = funcCount > 4 ? 'high' : funcCount > 2 ? 'medium' : 'low';
        } else if (node.type === 'subquery') {
            node.complexityLevel = ctx.stats.subqueries > 2 ? 'high' : 'low';
        }
    });
}

function processStatement(stmt: any, nodes: FlowNode[], edges: FlowEdge[]): string | null {
    if (!stmt || !stmt.type) { return null; }

    ctx.statementType = stmt.type.toLowerCase();

    if (ctx.statementType === 'select') {
        return processSelect(stmt, nodes, edges);
    }

    // For non-SELECT, create a simple representation
    const rootId = genId('stmt');

    // Extract meaningful label and description for CREATE statements
    let label = stmt.type.toUpperCase();
    let description = `${stmt.type} statement`;
    let objectName = '';

    if (ctx.statementType === 'create' && stmt.keyword) {
        const keyword = stmt.keyword.toUpperCase();

        // Extract object name based on keyword type
        if (stmt.keyword === 'view' && stmt.view) {
            objectName = stmt.view.view || stmt.view.name || '';
        } else if (stmt.keyword === 'table' && stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            objectName = tables[0]?.table || tables[0]?.name || '';
        } else if (stmt.keyword === 'index' && stmt.index) {
            objectName = stmt.index || '';
        } else if (stmt.keyword === 'database' && stmt.database) {
            objectName = stmt.database || '';
        } else if (stmt.keyword === 'schema' && stmt.schema) {
            objectName = stmt.schema || '';
        }

        // Include object name in label for clarity
        label = objectName ? `${keyword} ${objectName}` : `CREATE ${keyword}`;
        description = objectName ? `Create ${keyword.toLowerCase()}: ${objectName}` : `Create ${keyword.toLowerCase()}`;

        // For CREATE VIEW with a SELECT, process the inner SELECT and connect to view
        if (stmt.keyword === 'view' && stmt.select && objectName) {
            // Process the SELECT statement that defines the view
            const selectRootId = processSelect(stmt.select, nodes, edges);

            // Create the view node as the result
            const viewNodeWidth = Math.max(160, objectName.length * 10 + 60);
            nodes.push({
                id: rootId,
                type: 'result',
                label: `VIEW ${objectName}`,
                description: `Create view: ${objectName}`,
                accessMode: 'write',
                operationType: 'CREATE_VIEW',
                x: 0, y: 0, width: viewNodeWidth, height: 60
            });

            // Connect SELECT output to VIEW
            if (selectRootId) {
                edges.push({
                    id: genId('e'),
                    source: selectRootId,
                    target: rootId
                });
            }

            return rootId;
        }

        // For CREATE TABLE AS SELECT (CTAS), process the inner SELECT for optimization hints
        if (stmt.keyword === 'table' && (stmt.select || stmt.as) && objectName) {
            const innerSelect = stmt.select || stmt.as;
            const selectRootId = processSelect(innerSelect, nodes, edges);

            const tableNodeWidth = Math.max(160, objectName.length * 10 + 60);
            nodes.push({
                id: rootId,
                type: 'result',
                label: `TABLE ${objectName}`,
                description: `Create table as select: ${objectName}`,
                accessMode: 'write',
                operationType: 'CREATE_TABLE_AS',
                x: 0, y: 0, width: tableNodeWidth, height: 60
            });

            if (selectRootId) {
                edges.push({
                    id: genId('e'),
                    source: selectRootId,
                    target: rootId
                });
            }

            return rootId;
        }
    }

    // INSERT ... SELECT: render inner SELECT flow, then wire it to write target(s).
    if (ctx.statementType === 'insert') {
        const insertSourceSelect = getInsertSelectAst(stmt);
        if (insertSourceSelect) {
            const selectRootId = processSelect(insertSourceSelect, nodes, edges);
            const targetTables = stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) : [];

            nodes.push({
                id: rootId,
                type: 'result',
                label: 'INSERT',
                description: 'Insert statement',
                x: 0, y: 0, width: 160, height: 60
            });

            if (targetTables.length === 0) {
                if (selectRootId) {
                    edges.push({
                        id: genId('e'),
                        source: selectRootId,
                        target: rootId
                    });
                }
                return rootId;
            }

            for (const tableRef of targetTables) {
                const tableName = getTableName(tableRef);
                if (!tableName) { continue; }

                ctx.stats.tables++;
                const targetId = genId('table');
                nodes.push({
                    id: targetId,
                    type: 'table',
                    label: tableName,
                    description: 'Insert target table',
                    accessMode: 'write',
                    operationType: 'INSERT',
                    x: 0, y: 0, width: 140, height: 60
                });

                if (selectRootId) {
                    edges.push({
                        id: genId('e'),
                        source: selectRootId,
                        target: targetId
                    });
                }

                edges.push({
                    id: genId('e'),
                    source: targetId,
                    target: rootId
                });
            }

            return rootId;
        }
    }

    // UPDATE/DELETE with source queries:
    // - UPDATE ... FROM ...
    // - UPDATE/DELETE ... WHERE ... IN (SELECT ...)
    // - UPDATE/DELETE ... WHERE EXISTS (SELECT ...)
    if (ctx.statementType === 'update' || ctx.statementType === 'delete') {
        const sourceRootIds: string[] = [];

        if (ctx.statementType === 'update') {
            const fromItems = getUpdateSourceFromItems(stmt);
            if (fromItems.length > 0) {
                const updateSourceRootId = processSelect(
                    buildSyntheticSelectFromFromItems(fromItems),
                    nodes,
                    edges
                );
                if (updateSourceRootId) {
                    sourceRootIds.push(updateSourceRootId);
                }
            }
        }

        const whereSelects = extractSelectSubqueriesFromExpression(stmt.where);
        for (const whereSelect of whereSelects) {
            const whereSourceRootId = processSelect(whereSelect, nodes, edges);
            if (whereSourceRootId) {
                sourceRootIds.push(whereSourceRootId);
            }
        }

        const uniqueSourceRootIds = Array.from(new Set(sourceRootIds));
        if (uniqueSourceRootIds.length > 0) {
            const labelWidth = Math.max(160, label.length * 10 + 40);
            nodes.push({
                id: rootId,
                type: 'result',
                label: label,
                description: description,
                x: 0, y: 0, width: labelWidth, height: 60
            });

            const targetTables = stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) : [];
            const opType = ctx.statementType.toUpperCase() as 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE' | 'CREATE_TABLE_AS';
            const targetIds: string[] = [];

            for (const t of targetTables) {
                const tableName = getTableName(t);
                if (!tableName) {
                    continue;
                }
                ctx.stats.tables++;
                const targetId = genId('table');
                nodes.push({
                    id: targetId,
                    type: 'table',
                    label: tableName,
                    description: 'Target table',
                    accessMode: 'write',
                    operationType: opType,
                    x: 0, y: 0, width: 140, height: 60
                });
                targetIds.push(targetId);
            }

            if (targetIds.length === 0) {
                for (const sourceId of uniqueSourceRootIds) {
                    edges.push({
                        id: genId('e'),
                        source: sourceId,
                        target: rootId
                    });
                }
                return rootId;
            }

            let inboundToTargets = uniqueSourceRootIds;
            if (stmt.where) {
                const conditionDetails = extractConditions(stmt.where);
                const filterId = genId('filter');
                nodes.push({
                    id: filterId,
                    type: 'filter',
                    label: 'WHERE',
                    description: 'DML filter condition',
                    details: conditionDetails.length > 0 ? [conditionDetails.join(' AND ')] : undefined,
                    x: 0, y: 0, width: 140, height: 60
                });
                for (const sourceId of uniqueSourceRootIds) {
                    edges.push({
                        id: genId('e'),
                        source: sourceId,
                        target: filterId
                    });
                }
                inboundToTargets = [filterId];
            }

            for (const inboundId of inboundToTargets) {
                for (const targetId of targetIds) {
                    edges.push({
                        id: genId('e'),
                        source: inboundId,
                        target: targetId
                    });
                }
            }

            for (const targetId of targetIds) {
                edges.push({
                    id: genId('e'),
                    source: targetId,
                    target: rootId
                });
            }

            return rootId;
        }
    }

    // Calculate width based on label length
    const labelWidth = Math.max(160, label.length * 10 + 40);

    nodes.push({
        id: rootId,
        type: 'result',
        label: label,
        description: description,
        x: 0, y: 0, width: labelWidth, height: 60
    });

    // Process table for UPDATE/DELETE/INSERT
    // Phase 1 Feature: Read vs Write Differentiation
    // Mark write operations with accessMode and operationType for visual distinction
    if (stmt.table) {
        const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
        // Determine operation type and access mode for write operations
        const opType = ctx.statementType.toUpperCase() as 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE' | 'CREATE_TABLE_AS';
        const accessMode: 'write' = 'write';

        for (const t of tables) {
            ctx.stats.tables++;
            const tableId = genId('table');
            const tableName = t.table || t.name || t;
            nodes.push({
                id: tableId,
                type: 'table',
                label: String(tableName),
                description: 'Target table',
                accessMode: accessMode, // Mark as write operation for red border/badge
                operationType: opType,  // Store operation type for badge display
                x: 0, y: 0, width: 140, height: 60
            });
            edges.push({
                id: genId('e'),
                source: tableId,
                target: rootId
            });
        }
    }

    return rootId;
}

function getInsertSelectAst(stmt: any): any | null {
    if (!stmt || stmt.type?.toLowerCase() !== 'insert') { return null; }
    const values = stmt.values;
    if (!values || typeof values !== 'object') { return null; }
    if (values.type?.toLowerCase() !== 'select') { return null; }
    return values;
}

function getUpdateSourceFromItems(stmt: any): any[] {
    if (!stmt || stmt.type?.toLowerCase() !== 'update' || !Array.isArray(stmt.from)) {
        return [];
    }

    const targetTables = stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) : [];
    if (targetTables.length === 0) {
        return stmt.from;
    }

    // Compare (tableName, alias) fingerprints so self-joins aren't filtered out.
    // e.g. UPDATE employees e ... FROM employees e2 should keep the FROM item.
    const targetFingerprints = new Set<string>();
    for (const target of targetTables) {
        const name = getTableName(target)?.toLowerCase() || '';
        const alias = (typeof target?.as === 'string' ? target.as : '').toLowerCase();
        targetFingerprints.add(`${name}::${alias}`);
    }

    return stmt.from.filter((fromItem: any) => {
        const name = getTableName(fromItem)?.toLowerCase() || '';
        const alias = (typeof fromItem?.as === 'string' ? fromItem.as : '').toLowerCase();
        const fingerprint = `${name}::${alias}`;
        return !targetFingerprints.has(fingerprint);
    });
}

function buildSyntheticSelectFromFromItems(fromItems: any[]): any {
    return {
        type: 'select',
        with: null,
        columns: [{ type: 'expr', expr: { type: 'star', value: '*' }, as: null }],
        from: fromItems,
        where: null,
        groupby: null,
        having: null,
        orderby: null,
        limit: null,
        window: null
    };
}



function extractSelectSubqueriesFromExpression(expression: any): any[] {
    const selects: any[] = [];
    const seen = new Set<any>();
    collectSelectSubqueriesFromExpression(expression, selects, seen);
    return selects;
}

function collectSelectSubqueriesFromExpression(expression: any, selects: any[], seen: Set<any>): void {
    if (!expression || typeof expression !== 'object') {
        return;
    }
    if (seen.has(expression)) {
        return;
    }
    seen.add(expression);

    if (Array.isArray(expression)) {
        for (const item of expression) {
            collectSelectSubqueriesFromExpression(item, selects, seen);
        }
        return;
    }

    const exprType = typeof expression.type === 'string' ? expression.type.toLowerCase() : '';
    if (exprType === 'select') {
        selects.push(expression);
    }

    const ast = (expression as any).ast;
    if (ast && typeof ast === 'object' && !seen.has(ast)) {
        const astType = typeof ast.type === 'string' ? ast.type.toLowerCase() : '';
        if (astType === 'select') {
            seen.add(ast);
            selects.push(ast);
        }
    }

    for (const value of Object.values(expression)) {
        collectSelectSubqueriesFromExpression(value, selects, seen);
    }
}

function processSelect(stmt: any, nodes: FlowNode[], edges: FlowEdge[], cteNames: Set<string> = new Set()): string {
    const nodeIds: string[] = [];

    // Collect CTE names first
    if (stmt.with && Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            const cteName = cte.name?.value || cte.name || 'CTE';
            cteNames.add(cteName.toLowerCase());
        }
    }

    // Process CTEs first - with nested sub-graph
    if (stmt.with && Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            ctx.stats.ctes++;
            const cteId = genId('cte');
            const cteName = cte.name?.value || cte.name || 'CTE';

            // Parse CTE's internal structure
            const cteChildren: FlowNode[] = [];
            const cteChildEdges: FlowEdge[] = [];

            // CTE statement can be in different locations depending on parser output
            // Handle various AST structures from node-sql-parser
            const cteStmt = getCteStatementAst(cte);

            if (cteStmt) {
                // Phase 1 Feature: CTE Expansion Controls & Breadcrumb Navigation
                // Recursively parse the CTE's SELECT statement with parentId and depth for breadcrumb navigation
                parseCteOrSubqueryInternals(cteStmt, cteChildren, cteChildEdges, cteId, 0);
            }

            // Calculate container size based on children
            const containerWidth = Math.max(200, cteChildren.length > 0 ? 220 : 160);
            const containerHeight = cteChildren.length > 0 ? 80 + cteChildren.length * 35 : 60;

            // Check if this CTE is recursive (node-sql-parser sets recursive flag on the CTE or parent)
            const isRecursive = cte.recursive === true || cte.prefix?.toLowerCase() === 'recursive';
            const cteLabel = isRecursive ? `WITH RECURSIVE ${cteName}` : `WITH ${cteName}`;
            const cteDescription = isRecursive ? 'Recursive Common Table Expression' : 'Common Table Expression';

            nodes.push({
                id: cteId,
                type: 'cte',
                label: cteLabel,
                description: cteDescription,
                children: cteChildren.length > 0 ? cteChildren : undefined,
                childEdges: cteChildren.length > 0 ? cteChildEdges : undefined, // Keep empty array if children exist
                expanded: false, // Start collapsed, expand on click to show subflow
                collapsible: cteChildren.length > 0, // Only collapsible if has children
                depth: 0, // Root level CTE - used for breadcrumb navigation
                x: 0, y: 0, width: containerWidth, height: containerHeight
            });
            nodeIds.push(cteId);
        }
    }

    // Process FROM tables (data sources) - first pass: create all table nodes
    const tableIds: string[] = [];
    const joinTableMap: Map<string, string> = new Map(); // Maps table name to its node id

    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            const tableId = processFromItem(fromItem, nodes, edges, cteNames, Boolean(fromItem.join));
            if (tableId) {
                tableIds.push(tableId);
                joinTableMap.set(getFromItemLookupKey(fromItem), tableId);
            }
        }
    }
    const seenTableLabels = new Set<string>();
    for (const tableId of tableIds) {
        const tableNode = nodes.find(node => node.id === tableId && node.type === 'table');
        if (tableNode) {
            seenTableLabels.add(tableNode.label.toLowerCase());
        }
    }
    const scalarSubquerySourceTables = collectScalarSubquerySourceTables(stmt, cteNames, seenTableLabels);

    // Process JOINs - create join nodes and connect tables properly
    let lastOutputId = tableIds[0]; // Start with first table as base

    if (stmt.from && Array.isArray(stmt.from)) {
        let leftTableId = tableIds[0];

        for (let i = 0; i < stmt.from.length; i++) {
            const fromItem = stmt.from[i];
            if (fromItem.join) {
                ctx.stats.joins++;
                const joinId = genId('join');
                const joinType = fromItem.join || 'JOIN';
                const joinTable = getFromItemDisplayName(fromItem);
                const rightTableId = joinTableMap.get(getFromItemLookupKey(fromItem));

                // Extract join condition details
                const joinDetails: string[] = [];
                if (fromItem.on) {
                    joinDetails.push(formatCondition(fromItem.on));
                }
                joinDetails.push(`${joinTable}`);

                nodes.push({
                    id: joinId,
                    type: 'join',
                    label: joinType.toUpperCase(),
                    description: `Join with ${joinTable}`,
                    details: joinDetails,
                    x: 0, y: 0, width: 140, height: 60
                });

                // Extract join condition SQL for edge
                const joinConditionSql = fromItem.on ? formatCondition(fromItem.on) : '';
                
                // Phase 1 Feature: Click Edge → View SQL Clauses
                // Connect left side to join (previous join result or first table)
                // Store SQL clause and line number for edge click navigation
                if (leftTableId) {
                    edges.push({
                        id: genId('e'),
                        source: leftTableId,
                        target: joinId,
                        sqlClause: joinConditionSql, // SQL clause for edge click display
                        clauseType: 'join',         // Type of clause for styling
                        startLine: fromItem.on?.location?.start?.line // Line number for navigation
                    });
                }

                // Connect right side (join table) to join
                if (rightTableId && rightTableId !== leftTableId) {
                    edges.push({
                        id: genId('e'),
                        source: rightTableId,
                        target: joinId,
                        sqlClause: joinConditionSql, // SQL clause for edge click display
                        clauseType: 'on',           // Type of clause for styling
                        startLine: fromItem.on?.location?.start?.line // Line number for navigation
                    });
                }

                // The join output becomes the left side for next join
                leftTableId = joinId;
                lastOutputId = joinId;
            }
        }
    }

    // Connect CTEs to first table
    for (const cteId of nodeIds) {
        if (tableIds[0]) {
            edges.push({
                id: genId('e'),
                source: cteId,
                target: tableIds[0]
            });
        }
    }

    // Connect comma-separated FROM items (implicit cross joins) that aren't
    // already wired by the explicit JOIN logic above. tableIds[0] is the base;
    // any additional non-join item needs an edge into the flow.
    if (stmt.from && Array.isArray(stmt.from)) {
        for (let i = 1; i < stmt.from.length; i++) {
            const fromItem = stmt.from[i];
            if (!fromItem.join) {
                const extraTableId = joinTableMap.get(getFromItemLookupKey(fromItem));
                if (extraTableId && lastOutputId) {
                    // Create an implicit CROSS JOIN node
                    ctx.stats.joins++;
                    const crossJoinId = genId('join');
                    nodes.push({
                        id: crossJoinId,
                        type: 'join',
                        label: 'CROSS JOIN',
                        description: `Implicit join with ${getFromItemDisplayName(fromItem)}`,
                        details: [getFromItemDisplayName(fromItem)],
                        x: 0, y: 0, width: 140, height: 60
                    });
                    edges.push({
                        id: genId('e'),
                        source: lastOutputId,
                        target: crossJoinId
                    });
                    edges.push({
                        id: genId('e'),
                        source: extraTableId,
                        target: crossJoinId
                    });
                    lastOutputId = crossJoinId;
                }
            }
        }
    }

    // Process WHERE - connect from the last join output or first table
    let previousId = lastOutputId || tableIds[0];
    if (stmt.where) {
        const whereId = genId('filter');
        const conditions = extractConditions(stmt.where);
        ctx.stats.conditions += conditions.length;
        nodes.push({
            id: whereId,
            type: 'filter',
            label: 'WHERE',
            description: 'Filter rows',
            details: conditions,
            x: 0, y: 0, width: 140, height: 60
        });

        // Phase 1 Feature: Click Edge → View SQL Clauses
        // Store WHERE clause SQL and line number for edge click navigation
        if (previousId) {
            // Format WHERE clause SQL
            const whereClauseSql = conditions.join(' AND ');
            edges.push({
                id: genId('e'),
                source: previousId,
                target: whereId,
                sqlClause: whereClauseSql, // SQL clause for edge click display
                clauseType: 'where',      // Type of clause for styling
                startLine: stmt.where?.location?.start?.line // Line number for navigation
            });
        }
        previousId = whereId;
    }

    // Process GROUP BY
    if (stmt.groupby && Array.isArray(stmt.groupby) && stmt.groupby.length > 0) {
        ctx.stats.aggregations++;
        const groupId = genId('agg');
        const groupCols = stmt.groupby.map((g: any) => g.column || g.expr?.column || '?').join(', ');
        nodes.push({
            id: groupId,
            type: 'aggregate',
            label: 'GROUP BY',
            description: 'Aggregate rows',
            details: [`Columns: ${groupCols}`],
            x: 0, y: 0, width: 140, height: 60
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: groupId
            });
        }
        previousId = groupId;
    }

    // Process HAVING
    if (stmt.having) {
        const havingId = genId('filter');
        nodes.push({
            id: havingId,
            type: 'filter',
            label: 'HAVING',
            description: 'Filter groups',
            details: [formatCondition(stmt.having)],
            x: 0, y: 0, width: 140, height: 60
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: havingId
            });
        }
        previousId = havingId;
    }

    // Check for aggregate functions in columns - with detailed breakdown
    const aggregateFuncDetails = extractAggregateFunctionDetails(stmt.columns);
    // Always show aggregate node when aggregate functions are present (similar to window functions)
    if (aggregateFuncDetails.length > 0) {
        const aggregateId = genId('aggregate');

        // Calculate height based on number of functions
        const baseHeight = 50;
        const perFuncHeight = 28;
        const aggregateHeight = baseHeight + aggregateFuncDetails.length * perFuncHeight;

        nodes.push({
            id: aggregateId,
            type: 'aggregate',
            label: 'AGGREGATE',
            description: `${aggregateFuncDetails.length} aggregate function${aggregateFuncDetails.length > 1 ? 's' : ''}`,
            aggregateDetails: { functions: aggregateFuncDetails },
            x: 0, y: 0, width: 220, height: Math.min(aggregateHeight, 180)
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: aggregateId
            });
        }
        previousId = aggregateId;
    }

    // Check for CASE statements in columns - with detailed breakdown
    const caseStatementDetails = extractCaseStatementDetails(stmt.columns);
    if (caseStatementDetails.length > 0) {
        const caseId = genId('case');

        // Calculate height based on number of CASE statements
        const baseHeight = 50;
        const perCaseHeight = 35; // More height per CASE due to multiple conditions
        const caseHeight = baseHeight + caseStatementDetails.length * perCaseHeight;

        nodes.push({
            id: caseId,
            type: 'case',
            label: 'CASE',
            description: `${caseStatementDetails.length} CASE statement${caseStatementDetails.length > 1 ? 's' : ''}`,
            caseDetails: { cases: caseStatementDetails },
            x: 0, y: 0, width: 220, height: Math.min(caseHeight, 200)
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: caseId
            });
        }
        previousId = caseId;
    }

    // Check for window functions in columns - with detailed breakdown
    const windowFuncDetails = extractWindowFunctionDetails(stmt.columns);
    if (windowFuncDetails.length > 0) {
        ctx.stats.windowFunctions += windowFuncDetails.length;
        const windowId = genId('window');

        // Calculate height based on number of functions
        const baseHeight = 50;
        const perFuncHeight = 28;
        const windowHeight = baseHeight + windowFuncDetails.length * perFuncHeight;

        nodes.push({
            id: windowId,
            type: 'window',
            label: 'WINDOW',
            description: `${windowFuncDetails.length} window function${windowFuncDetails.length > 1 ? 's' : ''}`,
            windowDetails: { functions: windowFuncDetails },
            x: 0, y: 0, width: 220, height: Math.min(windowHeight, 180)
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: windowId
            });
        }
        previousId = windowId;
    }

    // Process SELECT columns
    const selectId = genId('select');
    const columns = extractColumns(stmt.columns);
    // Extract column info for dead column detection
    const columnInfos: ColumnInfo[] = extractColumnInfos(stmt.columns);
    nodes.push({
        id: selectId,
        type: 'select',
        label: 'SELECT',
        description: 'Project columns',
        details: columns.length <= 5 ? columns : [`${columns.length} columns`],
        columns: columnInfos, // Store column info for dead column detection
        x: 0, y: 0, width: 140, height: 60
    });

    if (previousId) {
        edges.push({
            id: genId('e'),
            source: previousId,
            target: selectId
        });
    }

    for (const tableName of scalarSubquerySourceTables) {
        const tableKey = tableName.toLowerCase();
        if (seenTableLabels.has(tableKey)) {
            continue;
        }

        const tableId = genId('table');
        nodes.push({
            id: tableId,
            type: 'table',
            label: tableName,
            description: 'Scalar subquery source',
            tableCategory: 'physical',
            x: 0, y: 0, width: 140, height: 60
        });
        edges.push({
            id: genId('e'),
            source: tableId,
            target: selectId,
            sqlClause: 'Subquery source',
            clauseType: 'flow'
        });

        seenTableLabels.add(tableKey);
        const hadTable = ctx.tableUsageMap.has(tableKey);
        trackTableUsage(tableName);
        if (!hadTable) {
            ctx.stats.tables++;
        }
    }

    previousId = selectId;

    // Process ORDER BY
    if (stmt.orderby && Array.isArray(stmt.orderby) && stmt.orderby.length > 0) {
        const sortId = genId('sort');
        const sortCols = stmt.orderby.map((o: any) => {
            const col = o.expr?.column || o.expr?.value || '?';
            const dir = o.type || 'ASC';
            return `${col} ${dir}`;
        }).join(', ');
        nodes.push({
            id: sortId,
            type: 'sort',
            label: 'ORDER BY',
            description: 'Sort results',
            details: [sortCols],
            x: 0, y: 0, width: 140, height: 60
        });

        edges.push({
            id: genId('e'),
            source: previousId,
            target: sortId
        });
        previousId = sortId;
    }

    // Process LIMIT — guard against phantom objects from node-sql-parser
    // (PostgreSQL, Snowflake, Trino, Redshift return { seperator: "", value: [] } when no LIMIT exists)
    if (stmt.limit && !(Array.isArray(stmt.limit.value) && stmt.limit.value.length === 0)) {
        ctx.hasNoLimit = false;
        const limitId = genId('limit');
        const limitVal = stmt.limit.value?.[0]?.value ?? stmt.limit.value ?? stmt.limit;
        nodes.push({
            id: limitId,
            type: 'limit',
            label: 'LIMIT',
            description: 'Limit rows',
            details: [`${limitVal} rows`],
            x: 0, y: 0, width: 120, height: 60
        });

        edges.push({
            id: genId('e'),
            source: previousId,
            target: limitId
        });
        previousId = limitId;
    }

    // Add result node
    const resultId = genId('result');
    nodes.push({
        id: resultId,
        type: 'result',
        label: 'Result',
        description: 'Query output',
        x: 0, y: 0, width: 120, height: 60
    });

    edges.push({
        id: genId('e'),
        source: previousId,
        target: resultId
    });

    // Handle UNION/INTERSECT/EXCEPT
    if (stmt._next) {
        ctx.stats.unions++;
        const nextResultId = processStatement(stmt._next, nodes, edges);
        if (nextResultId) {
            const unionId = genId('union');
            const setOp = stmt.set_op || 'UNION';

            // Collect tables from both sides for details
            const leftTables = extractTablesFromStatement(stmt);
            const rightTables = extractTablesFromStatement(stmt._next);
            const unionDetails: string[] = [];
            if (leftTables.length > 0) {
                unionDetails.push(`Left: ${leftTables.join(', ')}`);
            }
            if (rightTables.length > 0) {
                unionDetails.push(`Right: ${rightTables.join(', ')}`);
            }

            nodes.push({
                id: unionId,
                type: 'union',
                label: setOp.toUpperCase(),
                description: `${setOp} operation`,
                details: unionDetails.length > 0 ? unionDetails : undefined,
                x: 0, y: 0, width: 140, height: 60
            });

            // Connect both results to the union
            edges.push({
                id: genId('e'),
                source: resultId,
                target: unionId
            });
            edges.push({
                id: genId('e'),
                source: nextResultId,
                target: unionId
            });
        }
    }

    return resultId;
}

function getCteStatementAst(cte: any): any {
    if (cte?.stmt?.ast) {
        return cte.stmt.ast;
    }
    if (cte?.stmt?.type === 'select' || cte?.stmt?.from) {
        return cte.stmt;
    }
    if (cte?.ast) {
        return cte.ast;
    }
    if (cte?.expr?.ast) {
        return cte.expr.ast;
    }
    if (cte?.definition?.ast) {
        return cte.definition.ast;
    }
    if (cte?.definition) {
        return cte.definition;
    }
    return null;
}

function processFromItem(
    fromItem: any,
    nodes: FlowNode[],
    _edges: FlowEdge[],
    cteNames: Set<string> = new Set(),
    asJoin: boolean = false
): string | null {
    // Check for subquery
    if (fromItem.expr && fromItem.expr.ast) {
        ctx.stats.subqueries++;
        const subqueryId = genId('subquery');
        const alias = fromItem.as || 'subquery';

        // Parse subquery's internal structure
        const subChildren: FlowNode[] = [];
        const subChildEdges: FlowEdge[] = [];
        parseCteOrSubqueryInternals(fromItem.expr.ast, subChildren, subChildEdges, subqueryId, 0);

        // Subqueries as data sources should always be expanded
        // Calculate container size based on children
        const hasChildren = subChildren.length > 0;
        const containerWidth = hasChildren ? 220 : 160;
        const containerHeight = hasChildren ? 55 + subChildren.length * 28 : 60;

        nodes.push({
            id: subqueryId,
            type: 'subquery',
            label: alias,
            description: hasChildren ? `Derived table with ${subChildren.length} operations` : 'Derived table',
            children: hasChildren ? subChildren : undefined,
            childEdges: subChildEdges.length > 0 ? subChildEdges : undefined,
            expanded: false, // Start collapsed, expand on click to show subflow
            collapsible: hasChildren, // Only collapsible if has children
            tableCategory: 'derived',
            depth: 0, // Subquery depth
            x: 0, y: 0, width: containerWidth, height: containerHeight
        });
        return subqueryId;
    }

    // Table-valued function (UNNEST, OPENJSON, FLATTEN, JSON_TABLE, etc.)
    const tableValuedFunctionName = getTableValuedFunctionName(fromItem, ctx.dialect);
    if (tableValuedFunctionName) {
        trackFunctionUsage(tableValuedFunctionName, 'tvf');
        ctx.stats.tables++;
        const tableId = genId('table');
        const label = getFromItemDisplayName(fromItem);
        const details: string[] = [`Function: ${tableValuedFunctionName}`];
        const rawAlias = typeof fromItem.as === 'string' ? fromItem.as.trim() : '';
        if (rawAlias && rawAlias !== label) {
            details.push(`Alias: ${rawAlias}`);
        }

        nodes.push({
            id: tableId,
            type: 'table',
            label,
            description: asJoin
                ? `Joined table function (${tableValuedFunctionName})`
                : `Table function source (${tableValuedFunctionName})`,
            details,
            tableCategory: 'table_function',
            x: 0, y: 0, width: 140, height: 60
        });
        trackTableUsage(label);
        return tableId;
    }

    // Regular table
    const tableName = getTableName(fromItem);
    if (!tableName) { return null; }

    ctx.stats.tables++;
    trackTableUsage(tableName);
    const tableId = genId('table');
    // Determine if this is a CTE reference
    const isCteRef = cteNames.has(tableName.toLowerCase());
    nodes.push({
        id: tableId,
        type: 'table',
        label: tableName,
        description: isCteRef
            ? (asJoin ? 'Joined CTE reference' : 'CTE reference')
            : (asJoin ? 'Joined table' : 'Source table'),
        details: fromItem.as ? [`Alias: ${fromItem.as}`] : undefined,
        tableCategory: isCteRef ? 'cte_reference' : 'physical',
        x: 0, y: 0, width: 140, height: 60
    });

    return tableId;
}

function getTableName(item: any): string {
    if (typeof item === 'string') { return item; }
    
    // For table references, prefer the actual table name over alias
    // The AST structure varies by parser, so check multiple possible fields
    if (item.table) {
        // If table is an object, extract the name
        if (typeof item.table === 'object') {
            return item.table.table || item.table.name || item.table.value || item.as || 'table';
        }
        return item.table;
    }
    
    // Fallback to name, then alias, then default
    return item.name || item.as || 'table';
}

function getNormalizedFromAlias(item: any): string | null {
    const rawAlias = typeof item?.as === 'string' ? item.as.trim() : '';
    if (!rawAlias) {
        return null;
    }
    const parenIndex = rawAlias.indexOf('(');
    if (parenIndex > 0) {
        return rawAlias.slice(0, parenIndex).trim();
    }
    return rawAlias;
}

function getFromItemDisplayName(item: any): string {
    const alias = getNormalizedFromAlias(item);
    if (alias) {
        return alias;
    }
    const tableName = getTableName(item);
    if (tableName && tableName !== 'table') {
        return tableName;
    }
    return getTableValuedFunctionName(item, ctx.dialect) || tableName;
}

function getFromItemLookupKey(item: any): string {
    const alias = getNormalizedFromAlias(item);
    if (alias) {
        return alias;
    }
    const tableName = getTableName(item);
    if (tableName && tableName !== 'table') {
        return tableName;
    }
    return getTableValuedFunctionName(item, ctx.dialect) || tableName;
}

/**
 * Extract a readable identifier/value from parser AST nodes across dialects.
 * Handles wrapped nodes like { expr: { type: 'default', value: 'col' } }.
 */
function getAstString(val: any, depth = 0): string | null {
    if (depth > 6 || val === null || val === undefined) { return null; }
    if (typeof val === 'string') { return val; }
    if (typeof val === 'number' || typeof val === 'boolean') { return String(val); }

    if (Array.isArray(val)) {
        for (const item of val) {
            const extracted = getAstString(item, depth + 1);
            if (extracted) { return extracted; }
        }
        return null;
    }

    if (typeof val === 'object') {
        const candidateKeys = ['value', 'name', 'column', 'table', 'expr'];
        for (const key of candidateKeys) {
            if (Object.prototype.hasOwnProperty.call(val, key)) {
                const extracted = getAstString(val[key], depth + 1);
                if (extracted) { return extracted; }
            }
        }
    }

    return null;
}

/**
 * Format an AST expression node into a readable SQL expression string
 */
function formatExpressionFromAst(expr: any): string {
    if (!expr) { return ''; }

    // Simple column reference
    if (expr.type === 'column_ref') {
        const tableName = getAstString(expr.table);
        const columnName = getAstString(expr.column);
        const table = tableName ? `${tableName}.` : '';
        return `${table}${columnName || '?'}`;
    }

    // Aggregate function
    if (expr.type === 'aggr_func') {
        const funcName = expr.name || 'AGG';
        trackFunctionUsage(funcName, 'aggregate');
        const distinct = expr.args?.distinct ? 'DISTINCT ' : '';
        let argsStr = '';

        if (expr.args) {
            const args = expr.args.value || expr.args.expr || expr.args;
            if (Array.isArray(args)) {
                argsStr = args.map((arg: any) => formatExpressionFromAst(arg)).join(', ');
            } else if (args) {
                argsStr = formatExpressionFromAst(args);
            }
        }

        return `${funcName}(${distinct}${argsStr})`;
    }

    // Function call
    if (expr.type === 'function') {
        const funcName = typeof expr.name === 'string' ? expr.name : expr.name?.name || 'FUNC';
        trackFunctionUsage(funcName, expr.over ? 'window' : 'scalar');
        const args = expr.args?.value || expr.args || [];
        const argsStr = Array.isArray(args)
            ? args.map((arg: any) => formatExpressionFromAst(arg)).join(', ')
            : formatExpressionFromAst(args);
        return `${funcName}(${argsStr})`;
    }

    // Binary expression
    if (expr.type === 'binary_expr') {
        const left = formatExpressionFromAst(expr.left);
        const right = formatExpressionFromAst(expr.right);
        return `${left} ${expr.operator || '?'} ${right}`;
    }

    // Unary expression
    if (expr.type === 'unary_expr') {
        return `${expr.operator || ''}${formatExpressionFromAst(expr.expr)}`;
    }

    // CAST expression
    if (expr.type === 'cast') {
        const innerExpr = formatExpressionFromAst(expr.expr);
        const dataType = expr.target?.dataType || expr.target || 'type';
        return `CAST(${innerExpr} AS ${dataType})`;
    }

    // Number or string literal
    if (expr.type === 'number' || expr.type === 'single_quote_string' || expr.type === 'string') {
        return String(expr.value ?? '');
    }

    // Star
    if (expr.type === 'star' || expr.column === '*') {
        return '*';
    }

    // Window function (has over clause)
    if (expr.over) {
        const funcName = typeof expr.name === 'string' ? expr.name : expr.name?.name || 'FUNC';
        return `${funcName}() OVER(...)`;
    }

    // CASE expression
    if (expr.type === 'case') {
        return 'CASE...END';
    }

    // Fallback: try common properties
    if (expr.column) { return getAstString(expr.column) || 'expr'; }
    if (expr.value !== undefined) { return String(expr.value); }
    if (expr.name) { return getAstString(expr.name) || 'expr'; }

    return 'expr';
}

function extractColumns(columns: any): string[] {
    if (!columns || columns === '*') {
        ctx.hasSelectStar = true;
        return ['*'];
    }
    if (!Array.isArray(columns)) { return ['*']; }

    return columns.map((col: any) => {
        const exprColumn = getAstString(col?.expr?.column);
        if (col === '*' || exprColumn === '*') {
            ctx.hasSelectStar = true;
            return '*';
        }
        const aliasName = getAstString(col?.as);
        if (aliasName) { return aliasName; }
        if (exprColumn) { return exprColumn; }
        const exprName = getAstString(col?.expr?.name);
        if (exprName) { return `${exprName}()`; }
        return 'expr';
    }).slice(0, 10); // Limit to first 10
}

/**
 * Extract column information from SELECT statement AST for dead column detection.
 * 
 * This function extracts detailed column information including:
 * - Column name (prioritizing alias if present)
 * - Source column and table references
 * - Aggregate and window function indicators
 * - Transformation types (renamed, aggregated, calculated, passthrough)
 * 
 * @param columns - Column AST nodes from the SELECT statement
 * @returns Array of ColumnInfo objects for dead column detection
 */
function extractColumnInfos(columns: any): ColumnInfo[] {
    if (!columns || columns === '*') {
        return [];
    }
    if (!Array.isArray(columns)) { return []; }

    return columns.map((col: any): ColumnInfo => {
        // Extract column name - prioritize alias, then column name, then expression
        let name: string;
        const aliasName = getAstString(col.as);
        const exprColumn = getAstString(col.expr?.column);
        const exprName = getAstString(col.expr?.name);
        const exprValue = getAstString(col.expr?.value);

        if (aliasName) {
            name = aliasName;
        } else if (exprColumn) {
            name = exprColumn;
        } else if (exprName) {
            name = exprName;
        } else if (exprValue) {
            name = exprValue;
        } else if (typeof col === 'string') {
            name = col;
        } else {
            name = 'expr';
        }
        
        const expression = col.expr ? formatExpressionFromAst(col.expr) : name;
        
        // Extract source column and table
        // For CAST expressions, the source column is inside col.expr.expr
        let sourceColName: string | undefined;
        let sourceTableName: string | undefined;
        
        if (col.expr?.type === 'cast') {
            // CAST expression: extract source from the inner expression
            sourceColName = getAstString(col.expr.expr?.column) || undefined;
            sourceTableName = getAstString(col.expr.expr?.table) || undefined;
        } else {
            // Regular expression: extract source from the expression itself
            sourceColName = getAstString(col.expr?.column) || undefined;
            sourceTableName = getAstString(col.expr?.table) || undefined;
        }

        return {
            name: name,
            expression: expression,
            sourceColumn: sourceColName || undefined,
            sourceTable: sourceTableName || undefined,
            isAggregate: col.expr?.type === 'aggr_func' || false,
            isWindowFunc: !!col.expr?.over,
            transformationType: col.as && col.expr?.column ? 'renamed' :
                               col.expr?.type === 'aggr_func' ? 'aggregated' :
                               col.expr?.over ? 'calculated' : 'passthrough'
        };
    });
}

function extractWindowFunctions(columns: any): string[] {
    if (!columns || !Array.isArray(columns)) { return []; }

    const windowFuncs: string[] = [];
    for (const col of columns) {
        if (col.expr?.over) {
            // Safely extract function name
            let funcName = 'WINDOW';
            const expr = col.expr;
            const extractedFunc = getAstString(expr.name);
            if (extractedFunc) { funcName = extractedFunc; }

            const partitionBy = col.expr.over?.partitionby?.map((p: any) =>
                getAstString(p.column) || getAstString(p.expr?.column) || '?'
            ).join(', ');
            let desc = `${funcName}()`;
            if (partitionBy) {
                desc += ` OVER(PARTITION BY ${partitionBy})`;
            }
            windowFuncs.push(desc);
        }
    }
    return windowFuncs;
}

// Extract detailed window function information
function extractWindowFunctionDetails(columns: any): Array<{
    name: string;
    partitionBy?: string[];
    orderBy?: string[];
    frame?: string;
}> {
    if (!columns || !Array.isArray(columns)) { return []; }

    const details: Array<{
        name: string;
        partitionBy?: string[];
        orderBy?: string[];
        frame?: string;
    }> = [];

    // Get dialect-specific window functions
    const windowFuncList = getWindowFunctions(ctx.dialect);

    for (const col of columns) {
        if (col.expr?.over) {
            // Safely extract function name - could be in various formats
            let funcName = 'WINDOW';
            const expr = col.expr;

            // Helper to safely get string value
            const getStringName = (obj: any): string | null => {
                if (typeof obj === 'string') {return obj;}
                if (obj && typeof obj.name === 'string') {return obj.name;}
                if (obj && typeof obj.value === 'string') {return obj.value;}
                return null;
            };

            // Try multiple paths to find the function name
            const nameFromExpr = getStringName(expr.name);
            if (nameFromExpr) {
                funcName = nameFromExpr;
            } else if (expr.type === 'aggr_func' || expr.type === 'function') {
                const aggName = getStringName(expr.name);
                if (aggName) {funcName = aggName;}
            } else if (expr.args?.expr) {
                const argsName = getStringName(expr.args.expr.name) || getStringName(expr.args.expr);
                if (argsName) {funcName = argsName;}
            }

            // Check for window function in alias patterns
            if (funcName === 'WINDOW' && col.as) {
                const alias = String(col.as).toLowerCase();
                if (alias.includes('prev') || alias.includes('lag')) {funcName = 'LAG';}
                else if (alias.includes('next') || alias.includes('lead')) {funcName = 'LEAD';}
                else if (alias.includes('rank')) {funcName = 'RANK';}
                else if (alias.includes('row_num')) {funcName = 'ROW_NUMBER';}
                else if (alias.includes('running') || alias.includes('total')) {funcName = 'SUM';}
                else if (alias.includes('avg') || alias.includes('average')) {funcName = 'AVG';}
            }

            // Final fallback - search JSON for known function names (dialect-aware)
            if (funcName === 'WINDOW') {
                try {
                    const exprStr = JSON.stringify(expr).toUpperCase();
                    for (const wf of windowFuncList) {
                        if (exprStr.includes(`"NAME":"${wf}"`) || exprStr.includes(`"${wf}"`)) {
                            funcName = wf;
                            break;
                        }
                    }
                } catch {
                    // Ignore JSON errors
                }
            }

            // Extract PARTITION BY columns
            const partitionBy = col.expr.over?.partitionby?.map((p: any) =>
                p.column || p.expr?.column || p.value || '?'
            ).filter(Boolean);

            // Extract ORDER BY columns
            const orderBy = col.expr.over?.orderby?.map((o: any) => {
                const colName = o.expr?.column || o.column || '?';
                const dir = o.type || '';
                return dir ? `${colName} ${dir}` : colName;
            }).filter(Boolean);

            // Extract frame clause if present
            let frame: string | undefined;
            if (col.expr.over?.frame) {
                const f = col.expr.over.frame;
                frame = `${f.type || 'ROWS'} ${f.start || ''} ${f.end ? 'TO ' + f.end : ''}`.trim();
            }

            // Ensure funcName is a clean string
            const cleanName = typeof funcName === 'string' ? funcName : 'WINDOW';
            trackFunctionUsage(cleanName, 'window');

            details.push({
                name: cleanName.toUpperCase(),
                partitionBy: partitionBy?.length > 0 ? partitionBy : undefined,
                orderBy: orderBy?.length > 0 ? orderBy : undefined,
                frame
            });
        }
    }

    return details;
}

// Extract aggregate functions from SELECT columns (not just GROUP BY)
function extractAggregateFunctionDetails(columns: any): Array<{
    name: string;
    expression: string;
    alias?: string;
    sourceColumn?: string;
    sourceTable?: string;
}> {
    if (!columns || !Array.isArray(columns)) { return []; }

    // Get dialect-specific aggregate functions
    const aggregateFuncSet = new Set(getAggregateFunctions(ctx.dialect));
    const details: Array<{ name: string; expression: string; alias?: string; sourceColumn?: string; sourceTable?: string }> = [];

    function getExpressionFunctionName(expr: any): string {
        if (typeof expr?.name === 'string') {
            return expr.name.toUpperCase();
        }
        const nameParts = expr?.name?.name;
        if (Array.isArray(nameParts) && nameParts.length > 0) {
            return String(nameParts[0]?.value || '').toUpperCase();
        }
        return '';
    }

    function normalizeColumnRefName(columnRef: any): string {
        const normalized = unwrapIdentifierValue(columnRef?.column);
        if (normalized) {
            return normalized;
        }
        if (typeof columnRef?.column === 'string') {
            return columnRef.column;
        }
        return '?';
    }

    function formatAggregateArg(arg: any): string {
        if (!arg || typeof arg !== 'object') {
            return arg === undefined ? '?' : String(arg);
        }

        if (arg.type === 'star') {
            return '*';
        }
        if (arg.type === 'column_ref') {
            return normalizeColumnRefName(arg);
        }
        if (arg.type === 'expr_list' && Array.isArray(arg.value)) {
            return arg.value.map(formatAggregateArg).join(', ');
        }
        if (arg.type === 'number') {
            return String(arg.value ?? '?');
        }
        if (arg.type && String(arg.type).includes('string')) {
            return `'${String(arg.value ?? '')}'`;
        }
        if (arg.column) {
            return String(arg.column);
        }
        if (arg.expr) {
            return formatAggregateArg(arg.expr);
        }
        return '?';
    }

    function extractAggregatesFromExpr(expr: any): void {
        if (!expr || typeof expr !== 'object') {
            return;
        }

        if (Array.isArray(expr)) {
            for (const item of expr) {
                extractAggregatesFromExpr(item);
            }
            return;
        }

        // Check if this is an aggregate function (dialect-aware)
        const exprType = typeof expr.type === 'string' ? expr.type.toLowerCase() : '';
        const exprFuncName = getExpressionFunctionName(expr);
        if (exprType === 'aggr_func' || (exprFuncName && aggregateFuncSet.has(exprFuncName))) {
            const funcName = exprFuncName || 'AGG';
            const argsContainer = expr.args;
            const argNode = argsContainer?.value ?? argsContainer?.expr ?? argsContainer;
            const argList = Array.isArray(argNode) ? argNode : (argNode ? [argNode] : []);
            const hasDistinct = String(argsContainer?.distinct || '').toUpperCase() === 'DISTINCT';

            let sourceColumn: string | undefined;
            let sourceTable: string | undefined;
            const argStrs = argList.map((arg: any) => {
                if (!sourceColumn && arg?.type === 'column_ref') {
                    sourceColumn = normalizeColumnRefName(arg);
                    sourceTable = arg.table;
                } else if (!sourceColumn && arg?.expr?.type === 'column_ref') {
                    sourceColumn = normalizeColumnRefName(arg.expr);
                    sourceTable = arg.expr.table;
                }
                return formatAggregateArg(arg);
            }).filter(Boolean);

            const distinctPrefix = hasDistinct ? 'DISTINCT ' : '';
            const expression = `${funcName}(${distinctPrefix}${argStrs.join(', ')})`;

            details.push({
                name: funcName,
                expression,
                alias: undefined,
                sourceColumn,
                sourceTable
            });
        }

        // Recursively inspect all nested expression values so we catch
        // aggregates inside CASE conditions and function arguments.
        for (const value of Object.values(expr)) {
            extractAggregatesFromExpr(value);
        }
    }

    for (const col of columns) {
        if (!col?.expr) {
            continue;
        }

        const startIndex = details.length;
        extractAggregatesFromExpr(col.expr);
        const addedCount = details.length - startIndex;
        const topExprType = typeof col.expr?.type === 'string' ? col.expr.type.toLowerCase() : '';
        const topExprName = getExpressionFunctionName(col.expr);
        const isTopLevelAggregate =
            topExprType === 'aggr_func' || (topExprName && aggregateFuncSet.has(topExprName));

        // Only attach alias when the SELECT expression itself is an aggregate.
        // Derived expressions (e.g., DATE_DIFF(MAX(...)), CASE WHEN SUM(...)...) should not
        // re-label nested aggregate internals.
        if (col.as && addedCount === 1 && isTopLevelAggregate) {
            details[startIndex].alias = col.as;
        }
    }

    // De-duplicate repeated aggregate expressions while keeping the first meaningful alias.
    const deduped: Array<{ name: string; expression: string; alias?: string; sourceColumn?: string; sourceTable?: string }> = [];
    const indexByKey = new Map<string, number>();
    for (const detail of details) {
        const key = `${detail.name}|${detail.expression}|${detail.sourceTable || ''}|${detail.sourceColumn || ''}`;
        const existingIndex = indexByKey.get(key);
        if (existingIndex === undefined) {
            indexByKey.set(key, deduped.length);
            deduped.push(detail);
            continue;
        }
        if (!deduped[existingIndex].alias && detail.alias) {
            deduped[existingIndex].alias = detail.alias;
        }
    }

    return deduped;
}

// Extract CASE statements from SELECT columns
function extractCaseStatementDetails(columns: any): Array<{
    conditions: Array<{ when: string; then: string }>;
    elseValue?: string;
    alias?: string;
}> {
    if (!columns || !Array.isArray(columns)) { return []; }

    const caseDetails: Array<{
        conditions: Array<{ when: string; then: string }>;
        elseValue?: string;
        alias?: string;
    }> = [];

    function formatExpr(expr: any): string {
        if (!expr) {return '?';}
        if (expr.column) {return expr.column;}
        if (expr.value) {return String(expr.value);}
        if (expr.type === 'binary_expr') {
            const left = formatExpr(expr.left);
            const right = formatExpr(expr.right);
            return `${left} ${expr.operator} ${right}`;
        }
        return 'expr';
    }

    for (const col of columns) {
        if (col.expr && col.expr.type === 'case') {
            const caseExpr = col.expr;
            const conditions: Array<{ when: string; then: string }> = [];

            if (caseExpr.args && Array.isArray(caseExpr.args)) {
                for (const arg of caseExpr.args) {
                    if (arg.cond && arg.result) {
                        conditions.push({
                            when: formatExpr(arg.cond),
                            then: formatExpr(arg.result)
                        });
                    }
                }
            }

            const elseValue = caseExpr.else ? formatExpr(caseExpr.else) : undefined;
            const alias = col.as;

            if (conditions.length > 0) {
                caseDetails.push({ conditions, elseValue, alias });
            }
        }
    }

    return caseDetails;
}

// Parse CTE or Subquery internal structure for nested visualization
// Phase 1 Feature: Breadcrumb Navigation
// Parse CTE/subquery internals and set parentId/depth for breadcrumb trail navigation
function parseCteOrSubqueryInternals(stmt: any, nodes: FlowNode[], edges: FlowEdge[], parentId?: string, depth: number = 0): void {
    if (!stmt) { return; }

    let previousId: string | null = null;

    // Extract tables from FROM clause
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            // Check for nested subqueries in FROM clause
            if (fromItem.expr && fromItem.expr.ast) {
                ctx.stats.subqueries++; // Count nested subqueries
                // Recursively parse the nested subquery
                parseCteOrSubqueryInternals(fromItem.expr.ast, nodes, edges, parentId, depth + 1);
            } else if (!fromItem.join) {
                const tableName = getTableName(fromItem);
                if (tableName && tableName !== 'table') {
                    // Track table usage for stats (including tables from CTEs and subqueries)
                    trackTableUsage(tableName);
                    const tableId = genId('child_table');
                    nodes.push({
                        id: tableId,
                        type: 'table',
                        label: tableName,
                        description: 'Table',
                        parentId: parentId,
                        depth: depth + 1,
                        x: 0, y: 0, width: 100, height: 32
                    });
                    if (previousId) {
                        edges.push({ id: genId('ce'), source: previousId, target: tableId });
                    }
                    previousId = tableId;
                }
            }
        }

        // Add joins (also check for nested subqueries in joins)
        for (const fromItem of stmt.from) {
            if (fromItem.join) {
                // Check for nested subqueries in JOIN
                if (fromItem.expr && fromItem.expr.ast) {
                    ctx.stats.subqueries++; // Count nested subqueries in joins
                    // Recursively parse the nested subquery
                    parseCteOrSubqueryInternals(fromItem.expr.ast, nodes, edges, parentId, depth + 1);
                } else {
                    const joinId = genId('child_join');
                    const joinTable = getTableName(fromItem);
                    // Track table usage for joined tables in CTEs/subqueries
                    if (joinTable && joinTable !== 'table') {
                        trackTableUsage(joinTable);
                    }
                    nodes.push({
                        id: joinId,
                        type: 'join',
                        label: `${fromItem.join} ${joinTable}`,
                        description: 'Join',
                        parentId: parentId,
                        depth: depth + 1,
                        x: 0, y: 0, width: 120, height: 32
                    });
                    if (previousId) {
                        edges.push({ id: genId('ce'), source: previousId, target: joinId });
                    }
                    previousId = joinId;
                }
            }
        }
    }

    // Check for subqueries in WHERE clause
    if (stmt.where) {
        const whereSubqueries = findSubqueriesInExpression(stmt.where);
        ctx.stats.subqueries += whereSubqueries.length;
    }

    // Check for subqueries in SELECT clause (scalar subqueries)
    if (stmt.columns && Array.isArray(stmt.columns)) {
        for (const col of stmt.columns) {
            if (col.expr && col.expr.ast && (col.expr.type === 'select' || col.expr.ast.type === 'select')) {
                ctx.stats.subqueries++; // Count scalar subqueries
                // Recursively parse the nested subquery
                parseCteOrSubqueryInternals(col.expr.ast, nodes, edges, parentId, depth + 1);
            }
        }
    }

    // Add WHERE if present
    if (stmt.where) {
        const whereId = genId('child_where');
        nodes.push({
            id: whereId,
            type: 'filter',
            label: 'WHERE',
            description: 'Filter',
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 80, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: whereId });
        }
        previousId = whereId;
    }

    // Add GROUP BY if present
    // groupby can be an array or an object with columns property
    const hasGroupBy = stmt.groupby && (
        (Array.isArray(stmt.groupby) && stmt.groupby.length > 0) ||
        (stmt.groupby.columns && Array.isArray(stmt.groupby.columns) && stmt.groupby.columns.length > 0)
    );
    if (hasGroupBy) {
        const groupId = genId('child_group');
        nodes.push({
            id: groupId,
            type: 'aggregate',
            label: 'GROUP BY',
            description: 'Aggregate',
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 90, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: groupId });
        }
        previousId = groupId;
    }

    // Extract CASE statements from SELECT columns in CTEs
    const caseStatementDetails = extractCaseStatementDetails(stmt.columns);
    if (caseStatementDetails.length > 0) {
        const caseId = genId('child_case');

        // Calculate height based on number of CASE statements
        const baseHeight = 50;
        const perCaseHeight = 35;
        const caseHeight = baseHeight + caseStatementDetails.length * perCaseHeight;

        nodes.push({
            id: caseId,
            type: 'case',
            label: 'CASE',
            description: `${caseStatementDetails.length} CASE statement${caseStatementDetails.length > 1 ? 's' : ''}`,
            caseDetails: { cases: caseStatementDetails },
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 220, height: Math.min(caseHeight, 200)
        });

        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: caseId });
        }
        previousId = caseId;
    }

    // Add ORDER BY if present
    // orderby can be an array or an object with columns property
    const hasOrderBy = stmt.orderby && (
        (Array.isArray(stmt.orderby) && stmt.orderby.length > 0) ||
        (stmt.orderby.columns && Array.isArray(stmt.orderby.columns) && stmt.orderby.columns.length > 0)
    );
    if (hasOrderBy) {
        const sortId = genId('child_sort');
        nodes.push({
            id: sortId,
            type: 'sort',
            label: 'ORDER BY',
            description: 'Sort',
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 90, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: sortId });
        }
    }
}

function collectScalarSubquerySourceTables(
    stmt: any,
    cteNames: Set<string>,
    excludedTableLabels: Set<string>
): string[] {
    const sourceTables = new Set<string>();
    const scopedCteNames = new Set<string>(Array.from(cteNames).map(name => name.toLowerCase()));
    const expressions: any[] = [];

    if (stmt?.where) {
        expressions.push(stmt.where);
    }
    if (stmt?.having) {
        expressions.push(stmt.having);
    }
    if (Array.isArray(stmt?.columns)) {
        for (const col of stmt.columns) {
            if (col?.expr) {
                expressions.push(col.expr);
            }
        }
    }
    if (Array.isArray(stmt?.orderby)) {
        for (const orderItem of stmt.orderby) {
            if (orderItem?.expr) {
                expressions.push(orderItem.expr);
            }
        }
    }
    if (Array.isArray(stmt?.from)) {
        for (const fromItem of stmt.from) {
            if (fromItem?.on) {
                expressions.push(fromItem.on);
            }
        }
    }

    for (const expr of expressions) {
        const subqueries = findSubqueriesInExpression(expr);
        for (const subquery of subqueries) {
            collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
        }
    }

    return Array.from(sourceTables).filter(name => !excludedTableLabels.has(name.toLowerCase()));
}

function collectTablesFromSelectTree(stmt: any, sourceTables: Set<string>, inheritedCteNames: Set<string>): void {
    if (!stmt || typeof stmt !== 'object') {
        return;
    }

    const scopedCteNames = new Set(inheritedCteNames);

    if (Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            const cteName = (cte?.name?.value || cte?.name || '').toString().trim().toLowerCase();
            if (cteName) {
                scopedCteNames.add(cteName);
            }
        }
        for (const cte of stmt.with) {
            const cteStmt = getCteStatementAst(cte);
            if (cteStmt) {
                collectTablesFromSelectTree(cteStmt, sourceTables, scopedCteNames);
            }
        }
    }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : (stmt.from ? [stmt.from] : []);
    for (const fromItem of fromItems) {
        const nestedFromSubquery = fromItem?.expr?.ast || (fromItem?.expr?.type === 'select' ? fromItem.expr : null);
        if (nestedFromSubquery) {
            collectTablesFromSelectTree(nestedFromSubquery, sourceTables, scopedCteNames);
        } else {
            const tableValuedFunctionName = getTableValuedFunctionName(fromItem, ctx.dialect);
            if (tableValuedFunctionName) {
                sourceTables.add(tableValuedFunctionName);
            } else {
                const tableName = getTableName(fromItem);
                if (tableName && tableName !== 'table' && !scopedCteNames.has(tableName.toLowerCase())) {
                    sourceTables.add(tableName);
                }
            }
        }

        if (fromItem?.on) {
            const onSubqueries = findSubqueriesInExpression(fromItem.on);
            for (const subquery of onSubqueries) {
                collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
            }
        }
    }

    if (stmt.where) {
        const whereSubqueries = findSubqueriesInExpression(stmt.where);
        for (const subquery of whereSubqueries) {
            collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
        }
    }

    if (stmt.having) {
        const havingSubqueries = findSubqueriesInExpression(stmt.having);
        for (const subquery of havingSubqueries) {
            collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
        }
    }

    if (Array.isArray(stmt.columns)) {
        for (const col of stmt.columns) {
            if (!col?.expr) {
                continue;
            }
            const columnSubqueries = findSubqueriesInExpression(col.expr);
            for (const subquery of columnSubqueries) {
                collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
            }
        }
    }

    if (Array.isArray(stmt.orderby)) {
        for (const orderItem of stmt.orderby) {
            if (!orderItem?.expr) {
                continue;
            }
            const orderSubqueries = findSubqueriesInExpression(orderItem.expr);
            for (const subquery of orderSubqueries) {
                collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
            }
        }
    }

    if (stmt._next) {
        collectTablesFromSelectTree(stmt._next, sourceTables, scopedCteNames);
    }
}

// Helper function to find subqueries in expressions (for counting nested subqueries)
function findSubqueriesInExpression(expr: any): any[] {
    const subqueries: any[] = [];
    if (!expr) { return subqueries; }

    // Check if this expression itself is a subquery
    if (expr.type === 'select') {
        subqueries.push(expr);
    } else if (expr.ast && expr.ast.type === 'select') {
        subqueries.push(expr.ast);
    } else if (expr.ast && typeof expr.ast === 'object') {
        subqueries.push(...findSubqueriesInExpression(expr.ast));
    }

    if (expr.expr) {
        subqueries.push(...findSubqueriesInExpression(expr.expr));
    }

    if (expr.value && typeof expr.value === 'object') {
        subqueries.push(...findSubqueriesInExpression(expr.value));
    }

    // Recursively check left and right sides of binary expressions
    if (expr.left) {
        subqueries.push(...findSubqueriesInExpression(expr.left));
    }
    if (expr.right) {
        subqueries.push(...findSubqueriesInExpression(expr.right));
    }

    // Check function arguments
    if (expr.args && Array.isArray(expr.args)) {
        for (const arg of expr.args) {
            subqueries.push(...findSubqueriesInExpression(arg));
        }
    } else if (Array.isArray(expr.args?.value)) {
        for (const arg of expr.args.value) {
            subqueries.push(...findSubqueriesInExpression(arg));
        }
    } else if (expr.args && expr.args.expr) {
        subqueries.push(...findSubqueriesInExpression(expr.args.expr));
    } else if (expr.args && typeof expr.args === 'object') {
        subqueries.push(...findSubqueriesInExpression(expr.args));
    }

    if (Array.isArray(expr.columns)) {
        for (const col of expr.columns) {
            if (col?.expr) {
                subqueries.push(...findSubqueriesInExpression(col.expr));
            }
        }
    }

    return subqueries;
}

function extractConditions(where: any): string[] {
    const conditions: string[] = [];
    formatConditionRecursive(where, conditions);
    return conditions.slice(0, 5); // Limit to first 5
}

function formatConditionRecursive(expr: any, conditions: string[], depth = 0): void {
    if (!expr || depth > 3) { return; }

    if (expr.type === 'binary_expr') {
        if (expr.operator === 'AND' || expr.operator === 'OR') {
            formatConditionRecursive(expr.left, conditions, depth + 1);
            formatConditionRecursive(expr.right, conditions, depth + 1);
        } else {
            conditions.push(formatCondition(expr));
        }
    }
}

function formatCondition(expr: any): string {
    if (!expr) { return '?'; }

    if (expr.type === 'binary_expr') {
        const left = expr.left?.column || expr.left?.value || '?';
        const right = expr.right?.column || expr.right?.value || '?';
        return `${left} ${expr.operator} ${right}`;
    }

    return 'condition';
}

function extractTablesFromStatement(stmt: any): string[] {
    const tables: string[] = [];
    if (!stmt || !stmt.from) { return tables; }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
    for (const item of fromItems) {
        const tableValuedFunctionName = getTableValuedFunctionName(item, ctx.dialect);
        if (tableValuedFunctionName) {
            tables.push(tableValuedFunctionName);
            continue;
        }
        const name = getTableName(item);
        if (name && name !== 'table') {
            tables.push(name);
        }
    }
    return tables;
}

function layoutGraph(nodes: FlowNode[], edges: FlowEdge[]): void {
    if (nodes.length === 0) { return; }

    const bottomUp = typeof window !== 'undefined' && window.flowDirection === 'bottom-up';
    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: bottomUp ? 'BT' : 'TB',
        nodesep: 60,
        ranksep: 80,
        marginx: 40,
        marginy: 40
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes
    for (const node of nodes) {
        g.setNode(node.id, { width: node.width, height: node.height });
    }

    // Add edges
    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    // Run layout
    dagre.layout(g);

    // Apply positions
    for (const node of nodes) {
        const layoutNode = g.node(node.id);
        if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
            node.x = layoutNode.x - node.width / 2;
            node.y = layoutNode.y - node.height / 2;
        }
    }
}

// Extract column lineage from SELECT statement
function extractColumnLineage(stmt: any, nodes: FlowNode[]): ColumnLineage[] {
    const lineage: ColumnLineage[] = [];

    if (!stmt || stmt.type?.toLowerCase() !== 'select' || !stmt.columns) {
        return lineage;
    }

    // Build table alias map
    const tableAliasMap = new Map<string, string>();
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            const rawTable = fromItem.table || fromItem.name;
            const tableName = typeof rawTable === 'string' ? rawTable : (rawTable?.table || rawTable?.name || '');
            const rawAlias = fromItem.as || tableName;
            const alias = typeof rawAlias === 'string' ? rawAlias : (rawAlias?.table || rawAlias?.name || tableName);
            if (tableName && alias) {
                tableAliasMap.set(alias.toLowerCase(), tableName);
            }
        }
    }

    // Find table nodes for mapping
    const tableNodes = nodes.filter(n => n.type === 'table');

    // Process each column
    const columns = Array.isArray(stmt.columns) ? stmt.columns : [];
    for (const col of columns) {
        if (col === '*') {
            lineage.push({
                outputColumn: '*',
                sources: tableNodes.map(n => ({
                    table: n.label,
                    column: '*',
                    nodeId: n.id
                }))
            });
            continue;
        }

        const colName = getAstString(col.as) || getAstString(col.expr?.column) || getAstString(col.expr?.name) || 'expr';
        const sources: ColumnLineage['sources'] = [];

        // Try to extract source table and column
        if (col.expr) {
            extractSourcesFromExpr(col.expr, sources, tableAliasMap, tableNodes);
        }

        lineage.push({
            outputColumn: String(colName),
            sources
        });
    }

    return lineage;
}

// Recursively extract source columns from expression
function extractSourcesFromExpr(
    expr: any,
    sources: ColumnLineage['sources'],
    tableAliasMap: Map<string, string>,
    tableNodes: FlowNode[]
): void {
    if (!expr) {return;}

    // Direct column reference
    if (expr.type === 'column_ref' || expr.column) {
        const column = getAstString(expr.column) || getAstString(expr.name) || 'expr';
        const rawTable = expr.table;
        const tableAlias = getAstString(rawTable) || '';

        let tableName = tableAlias;
        if (tableAlias && tableAliasMap.has(tableAlias.toLowerCase())) {
            tableName = tableAliasMap.get(tableAlias.toLowerCase()) || tableAlias;
        }

        // Find matching table node
        const tableNode = tableNodes.find(n =>
            n.label.toLowerCase() === (tableName || '').toLowerCase() ||
            n.label.toLowerCase() === (tableAlias || '').toLowerCase()
        );

        if (tableName || tableNodes.length === 1) {
            sources.push({
                table: tableName || (tableNodes[0]?.label || 'unknown'),
                column: column,
                nodeId: tableNode?.id || tableNodes[0]?.id || ''
            });
        }
        return;
    }

    // Binary expression (e.g., a + b)
    if (expr.type === 'binary_expr') {
        extractSourcesFromExpr(expr.left, sources, tableAliasMap, tableNodes);
        extractSourcesFromExpr(expr.right, sources, tableAliasMap, tableNodes);
        return;
    }

    // Function call (including aggregates)
    if (expr.args) {
        const args = expr.args.value || expr.args;
        if (Array.isArray(args)) {
            for (const arg of args) {
                extractSourcesFromExpr(arg, sources, tableAliasMap, tableNodes);
            }
        } else if (typeof args === 'object') {
            extractSourcesFromExpr(args, sources, tableAliasMap, tableNodes);
        }
    }

    // CASE expression
    if (expr.type === 'case') {
        if (expr.args) {
            for (const caseArg of expr.args) {
                extractSourcesFromExpr(caseArg.cond, sources, tableAliasMap, tableNodes);
                extractSourcesFromExpr(caseArg.result, sources, tableAliasMap, tableNodes);
            }
        }
    }
}

// ============================================================
// REDESIGNED: Column-Level Lineage Visualization
// Now builds FULL lineage paths from source tables to output
// ============================================================

/**
 * Generate column flows with full lineage paths from source to output
 */
function generateColumnFlows(
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[]
): ColumnFlow[] {
    const columnFlows: ColumnFlow[] = [];
    if (!stmt || stmt.type?.toLowerCase() !== 'select') {
        return columnFlows;
    }

    // Build node map for quick lookup
    const nodeMap = new Map<string, FlowNode>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    // Build edge map: target -> sources (for tracing backwards)
    const incomingEdges = new Map<string, string[]>();
    edges.forEach(edge => {
        if (!incomingEdges.has(edge.target)) {
            incomingEdges.set(edge.target, []);
        }
        incomingEdges.get(edge.target)!.push(edge.source);
    });

    // Find SELECT nodes (output nodes)
    const selectNodes = nodes.filter(n => n.type === 'select');
    if (selectNodes.length === 0) {return columnFlows;}

    // Process each SELECT node's output columns
    for (const selectNode of selectNodes) {
        if (!selectNode.columns || selectNode.columns.length === 0) {continue;}

        for (const outputCol of selectNode.columns) {
            // Build full lineage path for this output column
            const lineagePath = buildColumnLineagePath(
                outputCol,
                selectNode,
                nodeMap,
                incomingEdges
            );

            if (lineagePath.length > 0) {
                const flowId = `lineage_${selectNode.id}_${outputCol.name}`;
                columnFlows.push({
                    id: flowId,
                    outputColumn: outputCol.name,
                    outputNodeId: selectNode.id,
                    lineagePath
                });
            }
        }
    }

    return columnFlows;
}

/**
 * Build complete lineage path from source table to output column
 */
function buildColumnLineagePath(
    column: ColumnInfo,
    currentNode: FlowNode,
    nodeMap: Map<string, FlowNode>,
    incomingEdges: Map<string, string[]>,
    visited: Set<string> = new Set()
): ColumnFlow['lineagePath'] {
    const path: ColumnFlow['lineagePath'] = [];

    // Prevent infinite loops
    if (visited.has(currentNode.id)) {return path;}
    visited.add(currentNode.id);

    // Determine transformation at current node
    const transformation = getTransformationType(column, currentNode);

    // Add current node to path
    path.push({
        nodeId: currentNode.id,
        nodeName: currentNode.label,
        nodeType: currentNode.type,
        columnName: column.name,
        transformation,
        expression: column.expression !== column.name ? column.expression : undefined
    });

    // If this is a table node, we've reached the source
    if (currentNode.type === 'table') {
        // Mark as source
        path[path.length - 1].transformation = 'source';
        return path;
    }

    // Trace back through incoming edges
    const incoming = incomingEdges.get(currentNode.id) || [];

    for (const sourceNodeId of incoming) {
        const sourceNode = nodeMap.get(sourceNodeId);
        if (!sourceNode) {continue;}

        // Find matching source column
        const sourceColumn = findSourceColumn(column, sourceNode, currentNode);

        if (sourceColumn) {
            // For aggregate columns, trace the inner column (e.g., order_id from COUNT(order_id))
            // not the output alias (e.g., order_count)
            let columnToTrace = sourceColumn;
            if (sourceColumn.isAggregate && sourceColumn.sourceColumn && sourceColumn.sourceColumn !== sourceColumn.name) {
                columnToTrace = {
                    name: sourceColumn.sourceColumn,
                    expression: sourceColumn.sourceColumn,
                    sourceColumn: sourceColumn.sourceColumn,
                    sourceTable: sourceColumn.sourceTable
                };
            }

            // Recursively trace this source
            const sourcePath = buildColumnLineagePath(
                columnToTrace,
                sourceNode,
                nodeMap,
                incomingEdges,
                new Set(visited)
            );

            if (sourcePath.length > 0) {
                // Prepend source path (source comes before current)
                return [...sourcePath, ...path];
            }
        }
    }

    // If we couldn't trace further and column has explicit source info
    if (column.sourceTable && column.sourceColumn) {
        // Try to find the source table node
        const sourceTableLower = column.sourceTable.toLowerCase();
        for (const node of nodeMap.values()) {
            if (node.type === 'table') {
                const nodeLabelLower = node.label.toLowerCase();
                // Check for exact match first
                if (nodeLabelLower === sourceTableLower) {
                    path.unshift({
                        nodeId: node.id,
                        nodeName: node.label,
                        nodeType: 'table',
                        columnName: column.sourceColumn,
                        transformation: 'source'
                    });
                    break;
                }
                // For aliases (short names), check if table name starts with alias
                // e.g., alias 'o' should match 'orders' but not 'customers'
                if (sourceTableLower.length <= 2 && nodeLabelLower.startsWith(sourceTableLower)) {
                    path.unshift({
                        nodeId: node.id,
                        nodeName: node.label,
                        nodeType: 'table',
                        columnName: column.sourceColumn,
                        transformation: 'source'
                    });
                    break;
                }
                // For longer names, check if either contains the other as a word
                if (sourceTableLower.length > 2 &&
                    (nodeLabelLower.includes(sourceTableLower) || sourceTableLower.includes(nodeLabelLower))) {
                    path.unshift({
                        nodeId: node.id,
                        nodeName: node.label,
                        nodeType: 'table',
                        columnName: column.sourceColumn,
                        transformation: 'source'
                    });
                    break;
                }
            }
        }
    }

    return path;
}

/**
 * Detect dialect-specific syntax patterns and add appropriate hints
 * This helps users identify when they're using syntax that's specific to a certain dialect
 */
function detectDialectSpecificSyntax(sql: string, currentDialect: SqlDialect): void {
    const strippedSql = stripSqlComments(sql);
    const upperSql = strippedSql.toUpperCase();
    const syntax = detectDialectSyntaxPatterns(strippedSql);
    
    // Snowflake-specific syntax patterns
    const hasSnowflakePathOperator = syntax.hasSnowflakePathOperator; // e.g., payload:items (excludes :: casts and :params)
    const hasSnowflakeNamedArgs = syntax.hasSnowflakeNamedArgs; // e.g., input => value
    const hasFlatten = syntax.hasFlatten;
    
    if ((hasSnowflakePathOperator || hasSnowflakeNamedArgs || hasFlatten) && currentDialect !== 'Snowflake') {
        ctx.hints.push({
            type: 'warning',
            message: 'Snowflake-specific syntax detected',
            suggestion: currentDialect === 'MySQL' || currentDialect === 'PostgreSQL'
                ? `This query uses Snowflake syntax (e.g., : path operator or => named arguments). Try Snowflake dialect for full support.`
                : `This query uses Snowflake-specific syntax. Consider switching to Snowflake dialect.`,
            category: 'best-practice',
            severity: 'medium'
        });
    }
    
    // BigQuery-specific syntax patterns
    const hasBigQueryStruct = syntax.hasBigQueryStruct;
    const hasBigQueryUnnest = syntax.hasBigQueryUnnest;
    const hasBigQueryArrayType = syntax.hasBigQueryArrayType;
    
    const unnestOnlyDialects: SqlDialect[] = ['BigQuery', 'PostgreSQL', 'Trino', 'Athena'];
    if ((hasBigQueryStruct || hasBigQueryArrayType || (hasBigQueryUnnest && !unnestOnlyDialects.includes(currentDialect)))
        && currentDialect !== 'BigQuery') {
        ctx.hints.push({
            type: 'warning',
            message: 'BigQuery-specific syntax detected',
            suggestion: `This query uses BigQuery syntax (e.g., STRUCT, UNNEST, or ARRAY<>). Try BigQuery dialect for full support.`,
            category: 'best-practice',
            severity: 'medium'
        });
    }
    
    // PostgreSQL-specific syntax patterns
    const hasPostgresInterval = syntax.hasPostgresInterval;
    const hasPostgresDollarQuotes = syntax.hasPostgresDollarQuotes;
    const hasPostgresArrayAccess = syntax.hasPostgresArrayAccess; // e.g., arr[1]
    const hasPostgresJsonOperators = syntax.hasPostgresJsonOperators;
    
    if ((hasPostgresInterval || hasPostgresDollarQuotes || hasPostgresArrayAccess || hasPostgresJsonOperators) 
        && currentDialect !== 'PostgreSQL' && currentDialect !== 'Snowflake') {
        ctx.hints.push({
            type: 'warning',
            message: 'PostgreSQL-specific syntax detected',
            suggestion: `This query uses PostgreSQL syntax (e.g., INTERVAL '...', $$ quotes, or JSON operators). Try PostgreSQL dialect.`,
            category: 'best-practice',
            severity: 'medium'
        });
    }
    
    // MySQL-specific syntax patterns
    const hasMysqlBackticks = syntax.hasMysqlBackticks; // Backtick identifiers
    const hasMysqlGroupByRollup = syntax.hasMysqlGroupByRollup;
    const hasMysqlDual = syntax.hasMysqlDual;
    
    if ((hasMysqlBackticks || hasMysqlGroupByRollup || hasMysqlDual) 
        && currentDialect !== 'MySQL' && currentDialect !== 'MariaDB') {
        ctx.hints.push({
            type: 'info',
            message: 'MySQL-specific syntax detected',
            suggestion: `This query uses MySQL syntax (e.g., backtick identifiers or WITH ROLLUP). Try MySQL dialect.`,
            category: 'best-practice',
            severity: 'low'
        });
    }
    
    // T-SQL (SQL Server) specific syntax
    const hasTSqlApply = syntax.hasTSqlApply;
    const hasTSqlTop = syntax.hasTSqlTop;
    const hasTSqlPivot = syntax.hasTSqlPivot;
    
    if ((hasTSqlApply || hasTSqlTop || hasTSqlPivot) && currentDialect !== 'TransactSQL') {
        ctx.hints.push({
            type: 'warning',
            message: 'SQL Server (T-SQL) syntax detected',
            suggestion: `This query uses SQL Server syntax (e.g., CROSS APPLY, TOP, or PIVOT). Try TransactSQL dialect.`,
            category: 'best-practice',
            severity: 'medium'
        });
    }
    
    // MERGE statement detection (not fully supported by node-sql-parser in most dialects)
    const hasMerge = /\bMERGE\s+INTO\b/i.test(strippedSql);
    if (hasMerge) {
        // Check if we're in a dialect that should support MERGE
        const dialectsWithMerge = ['TransactSQL', 'Oracle', 'Snowflake', 'BigQuery'];
        if (!dialectsWithMerge.includes(currentDialect)) {
            ctx.hints.push({
                type: 'warning',
                message: 'MERGE statement detected',
                suggestion: `MERGE statements are supported in TransactSQL, Oracle, Snowflake, and BigQuery dialects. Current dialect (${currentDialect}) may have limited support. Consider using dialect-specific alternatives: PostgreSQL (INSERT ... ON CONFLICT), MySQL (INSERT ... ON DUPLICATE KEY UPDATE), or SQLite (INSERT OR REPLACE/IGNORE).`,
                category: 'best-practice',
                severity: 'medium'
            });
        } else {
            // Even in supported dialects, MERGE may have parsing issues
            ctx.hints.push({
                type: 'info',
                message: 'MERGE statement',
                suggestion: `MERGE statements are complex and may not render fully in all cases. If parsing fails, try simplifying the query or using dialect-specific alternatives (ON CONFLICT, ON DUPLICATE KEY, etc.).`,
                category: 'best-practice',
                severity: 'low'
            });
        }
    }
}

/**
 * Hoist CTEs nested inside subqueries to the top level.
 * Snowflake / Tableau generates `FROM ( WITH cte AS (...) SELECT ... ) t`
 * which node-sql-parser cannot handle. This rewrites the SQL to move the
 * WITH block to the top level — a semantically equivalent transformation.
 *
 * Returns the transformed SQL or `null` if no hoisting was needed.
 */
export function hoistNestedCtes(sql: string): string | null {
    // Build a masked version of the SQL where string literals and comments
    // are replaced with placeholder characters so we don't false-match
    // keywords inside them.
    const masked = maskStringsAndComments(sql);

    // We may need to hoist multiple independent nested CTEs (apply iteratively)
    let current = sql;
    let currentMasked = masked;
    let hoisted = false;

    // Safety limit to avoid infinite loops
    for (let iteration = 0; iteration < 20; iteration++) {
        const result = hoistOneNestedCte(current, currentMasked);
        if (!result) {
            break;
        }
        current = result;
        currentMasked = maskStringsAndComments(current);
        hoisted = true;
    }

    return hoisted ? current : null;
}

/**
 * Replace string literals and comments with spaces (preserving length/positions).
 */
function maskStringsAndComments(sql: string): string {
    const chars = sql.split('');
    let i = 0;
    while (i < chars.length) {
        // Block comment
        if (chars[i] === '/' && i + 1 < chars.length && chars[i + 1] === '*') {
            chars[i] = ' ';
            chars[i + 1] = ' ';
            i += 2;
            while (i < chars.length) {
                if (chars[i] === '*' && i + 1 < chars.length && chars[i + 1] === '/') {
                    chars[i] = ' ';
                    chars[i + 1] = ' ';
                    i += 2;
                    break;
                }
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        // Line comment (--)
        if (chars[i] === '-' && i + 1 < chars.length && chars[i + 1] === '-') {
            while (i < chars.length && chars[i] !== '\n') {
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        // Hash comment
        if (chars[i] === '#') {
            while (i < chars.length && chars[i] !== '\n') {
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        // String literal (single-quoted, with '' escape)
        if (chars[i] === "'") {
            chars[i] = ' ';
            i++;
            while (i < chars.length) {
                if (chars[i] === "'" && i + 1 < chars.length && chars[i + 1] === "'") {
                    chars[i] = ' ';
                    chars[i + 1] = ' ';
                    i += 2;
                    continue;
                }
                if (chars[i] === "'") {
                    chars[i] = ' ';
                    i++;
                    break;
                }
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        // Double-quoted identifier
        if (chars[i] === '"') {
            chars[i] = ' ';
            i++;
            while (i < chars.length) {
                if (chars[i] === '"') {
                    chars[i] = ' ';
                    i++;
                    break;
                }
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        i++;
    }
    return chars.join('');
}

/**
 * Try to find and hoist a single `( WITH ... )` block.
 * Returns the transformed SQL or null if nothing found.
 */
function hoistOneNestedCte(sql: string, masked: string): string | null {
    // Find `( WITH` in the masked string (case-insensitive)
    const parenWithRegex = /\(\s*WITH\b/gi;
    let match: RegExpExecArray | null;

    while ((match = parenWithRegex.exec(masked)) !== null) {
        const openParenPos = match.index;

        // Make sure this isn't a top-level WITH (no surrounding paren context
        // that makes this a subquery). Check that there's meaningful SQL before
        // the opening paren — i.e., it's used as FROM (...) or IN (...), etc.
        // A top-level `( WITH ...` at the very start would have only whitespace before it.
        const beforeParen = masked.substring(0, openParenPos).trim();
        if (beforeParen.length === 0) {
            // This is a top-level parenthesized WITH — skip
            continue;
        }

        // Position right after the `(`
        const withKeywordStart = openParenPos + 1;

        // Now parse CTE definitions using balanced paren tracking on the ORIGINAL sql
        // (but using masked for keyword detection)
        const cteResult = extractCteDefinitions(sql, masked, withKeywordStart);
        if (!cteResult) {
            continue;
        }

        const { cteBlock, innerSelectStart } = cteResult;

        // Find the matching closing `)` for the opening `(` at openParenPos
        const closingParenPos = findMatchingParen(masked, openParenPos);
        if (closingParenPos === -1) {
            continue;
        }

        // Extract the inner SELECT (from after CTEs to before closing paren)
        const innerSelect = sql.substring(innerSelectStart, closingParenPos).trim();

        // Check if there's already a top-level WITH clause
        const topLevelWithMatch = masked.match(/^\s*WITH\b/i);

        // Replace the subquery content: remove the WITH block, keep only inner SELECT
        // This is common to both merge and prepend paths
        const beforeSubquery = sql.substring(0, openParenPos + 1);
        const afterSubquery = sql.substring(closingParenPos);
        const rewrittenSubquery = beforeSubquery + '\n' + innerSelect + '\n' + afterSubquery;

        let newSql: string;
        if (topLevelWithMatch) {
            // Merge: find where the top-level CTEs end in the rewritten SQL
            const rewrittenMasked = maskStringsAndComments(rewrittenSubquery);
            const mergePoint = findTopLevelCteEnd(rewrittenMasked);
            if (mergePoint === -1) {
                continue;
            }
            // Insert the nested CTEs (comma-separated) before the main SELECT
            const before = rewrittenSubquery.substring(0, mergePoint);
            const after = rewrittenSubquery.substring(mergePoint);
            // cteBlock starts with "WITH " — strip it to just get the CTE list
            const cteList = cteBlock.replace(/^\s*WITH\s+/i, '');
            newSql = before.trimEnd() + ',\n' + cteList + '\n' + after;
        } else {
            // Prepend CTE block to top
            newSql = cteBlock + '\n' + rewrittenSubquery;
        }

        return newSql;
    }

    return null;
}

/**
 * Extract CTE definitions starting from `withKeywordStart` in the sql.
 * Returns the CTE block text and the position where the inner SELECT begins.
 */
function extractCteDefinitions(
    sql: string,
    masked: string,
    withKeywordStart: number
): { cteBlock: string; innerSelectStart: number } | null {
    // Skip past `WITH` keyword and whitespace
    const withMatch = masked.substring(withKeywordStart).match(/^(\s*WITH\s+)/i);
    if (!withMatch) {
        return null;
    }

    let pos = withKeywordStart + withMatch[0].length;
    const cteStartPos = withKeywordStart;

    // Parse each CTE: name AS (...)
    while (pos < sql.length) {
        // Skip whitespace
        while (pos < sql.length && /\s/.test(sql[pos])) { pos++; }

        // Read CTE name (may be quoted)
        const nameStart = pos;
        if (sql[pos] === '"' || sql[pos] === '`' || sql[pos] === '[') {
            const closeChar = sql[pos] === '[' ? ']' : sql[pos];
            pos++;
            while (pos < sql.length && sql[pos] !== closeChar) { pos++; }
            if (pos < sql.length) { pos++; } // skip closing quote
        } else {
            while (pos < sql.length && /\w/.test(sql[pos])) { pos++; }
        }

        if (pos === nameStart) {
            return null; // no CTE name found
        }

        // Skip whitespace
        while (pos < sql.length && /\s/.test(sql[pos])) { pos++; }

        // Expect `AS`
        if (masked.substring(pos, pos + 2).toUpperCase() !== 'AS') {
            return null;
        }
        pos += 2;

        // Skip whitespace
        while (pos < sql.length && /\s/.test(sql[pos])) { pos++; }

        // Expect `(` — find matching `)` using balanced paren tracking on original SQL
        if (sql[pos] !== '(') {
            return null;
        }
        const cteBodyClose = findMatchingParen(sql, pos);
        if (cteBodyClose === -1) {
            return null;
        }
        pos = cteBodyClose + 1;

        // Skip whitespace
        while (pos < sql.length && /\s/.test(sql[pos])) { pos++; }

        // Check for comma (more CTEs) or SELECT (end of CTEs)
        if (sql[pos] === ',') {
            pos++; // skip comma, continue to next CTE
            continue;
        }

        // Should be SELECT (or another DML keyword) — end of CTE definitions
        break;
    }

    // The CTE block in the original SQL
    const cteBlock = sql.substring(cteStartPos, pos).trim();

    // Verify the next keyword is SELECT/INSERT/UPDATE/DELETE/MERGE
    const remaining = masked.substring(pos).trimStart();
    if (!/^(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i.test(remaining)) {
        return null;
    }

    // innerSelectStart is where the SELECT begins (in original sql)
    const innerSelectStart = pos + (masked.substring(pos).length - masked.substring(pos).trimStart().length);

    return { cteBlock, innerSelectStart };
}

/**
 * Find the position of the matching closing parenthesis for an opening `(`.
 * Handles nested parens. Operates on the raw string (not masked) to handle
 * all paren types, but skips string literals and comments.
 */
function findMatchingParen(sql: string, openPos: number): number {
    if (sql[openPos] !== '(') {
        return -1;
    }
    let depth = 1;
    let i = openPos + 1;
    while (i < sql.length && depth > 0) {
        const ch = sql[i];
        // Skip string literals
        if (ch === "'") {
            i++;
            while (i < sql.length) {
                if (sql[i] === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
                    i += 2;
                    continue;
                }
                if (sql[i] === "'") {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        if (ch === '"') {
            i++;
            while (i < sql.length && sql[i] !== '"') { i++; }
            if (i < sql.length) { i++; }
            continue;
        }
        // Skip block comments
        if (ch === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
            i += 2;
            while (i < sql.length) {
                if (sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/') {
                    i += 2;
                    break;
                }
                i++;
            }
            continue;
        }
        // Skip line comments
        if (ch === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
            while (i < sql.length && sql[i] !== '\n') { i++; }
            continue;
        }
        if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
        i++;
    }
    return -1;
}

/**
 * Find where the top-level CTE list ends (i.e., the position of the main
 * SELECT/INSERT/UPDATE/DELETE/MERGE after `WITH ... AS (...), ...`).
 */
function findTopLevelCteEnd(masked: string): number {
    // Start after WITH keyword
    const withMatch = masked.match(/^\s*WITH\s+/i);
    if (!withMatch) {
        return -1;
    }

    let pos = withMatch[0].length;

    // Walk through CTE definitions
    while (pos < masked.length) {
        // Skip whitespace
        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }

        // Skip CTE name
        while (pos < masked.length && /\w/.test(masked[pos])) { pos++; }

        // Skip whitespace
        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }

        // Expect AS
        if (masked.substring(pos, pos + 2).toUpperCase() !== 'AS') {
            return -1;
        }
        pos += 2;

        // Skip whitespace
        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }

        // Skip CTE body (balanced parens) — in masked string, parens are preserved
        if (masked[pos] !== '(') {
            return -1;
        }
        let depth = 1;
        pos++;
        while (pos < masked.length && depth > 0) {
            if (masked[pos] === '(') { depth++; }
            else if (masked[pos] === ')') { depth--; }
            pos++;
        }

        // Skip whitespace
        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }

        // Comma means more CTEs
        if (masked[pos] === ',') {
            pos++;
            continue;
        }

        // Otherwise we should be at the main statement
        break;
    }

    return pos;
}

function stripSqlComments(sql: string): string {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n\r]*/g, ' ')
        .replace(/#[^\n\r]*/g, ' ');
}

function detectDialectSyntaxPatterns(sql: string): {
    hasSnowflakePathOperator: boolean;
    hasSnowflakeNamedArgs: boolean;
    hasFlatten: boolean;
    hasThreePartNames: boolean;
    hasQualify: boolean;
    hasIlike: boolean;
    hasCreateOrReplaceTable: boolean;
    hasMergeInto: boolean;
    hasBigQueryStruct: boolean;
    hasBigQueryUnnest: boolean;
    hasBigQueryArrayType: boolean;
    hasPostgresInterval: boolean;
    hasPostgresDollarQuotes: boolean;
    hasPostgresArrayAccess: boolean;
    hasPostgresJsonOperators: boolean;
    hasMysqlBackticks: boolean;
    hasMysqlGroupByRollup: boolean;
    hasMysqlDual: boolean;
    hasTSqlApply: boolean;
    hasTSqlTop: boolean;
    hasTSqlPivot: boolean;
} {
    return {
        hasSnowflakePathOperator: /(?<!:):\w+(?!:)/.test(sql), // payload:items (excludes :: and :params)
        hasSnowflakeNamedArgs: /\w+\s*=>\s*/.test(sql), // input => value
        hasFlatten: /\bFLATTEN\s*\(/i.test(sql),
        hasThreePartNames: /\b[\w$]+\.[\w$]+\.[\w$]+\b/.test(sql),
        hasQualify: /\bQUALIFY\b/i.test(sql),
        hasIlike: /\bILIKE\b/i.test(sql),
        hasCreateOrReplaceTable: /\bCREATE\s+OR\s+REPLACE\s+TABLE\b/i.test(sql),
        hasMergeInto: /\bMERGE\s+INTO\b/i.test(sql),
        hasBigQueryStruct: /\bSTRUCT\s*\(/i.test(sql),
        hasBigQueryUnnest: /\bUNNEST\s*\(/i.test(sql),
        hasBigQueryArrayType: /\bARRAY<.*>/i.test(sql),
        hasPostgresInterval: /INTERVAL\s+'[^']+'/i.test(sql),
        hasPostgresDollarQuotes: /\$\$/.test(sql),
        hasPostgresArrayAccess: /\w+\[\d+\]/.test(sql),
        hasPostgresJsonOperators: /->>|#>|\?&|\?\|/.test(sql),
        hasMysqlBackticks: /`[\w-]+`/.test(sql),
        hasMysqlGroupByRollup: /GROUP BY.*WITH ROLLUP/i.test(sql),
        hasMysqlDual: /FROM\s+DUAL/i.test(sql),
        hasTSqlApply: /\b(CROSS|OUTER)\s+APPLY\b/i.test(sql),
        hasTSqlTop: /TOP\s*\(/i.test(sql),
        hasTSqlPivot: /\bPIVOT\s*\(/i.test(sql),
    };
}

export function detectDialect(sql: string): DialectDetectionResult {
    const strippedSql = stripSqlComments(sql);
    if (!strippedSql.trim()) {
        return {
            dialect: null,
            scores: {},
            confidence: 'none'
        };
    }

    const syntax = detectDialectSyntaxPatterns(strippedSql);
    const scores: Partial<Record<SqlDialect, number>> = {};
    const addScore = (dialect: SqlDialect, points = 1): void => {
        scores[dialect] = (scores[dialect] || 0) + points;
    };

    // Snowflake
    if (syntax.hasSnowflakePathOperator) { addScore('Snowflake'); }
    if (syntax.hasSnowflakeNamedArgs) { addScore('Snowflake'); }
    if (syntax.hasFlatten) { addScore('Snowflake'); }
    if (syntax.hasCreateOrReplaceTable) { addScore('Snowflake', 2); }
    if (syntax.hasQualify) { addScore('Snowflake', 2); }
    if (syntax.hasMergeInto) { addScore('Snowflake'); }
    if (syntax.hasThreePartNames) { addScore('Snowflake', 3); }
    if (syntax.hasIlike) { addScore('Snowflake'); }

    // BigQuery (UNNEST alone is not enough to disambiguate)
    if (syntax.hasBigQueryStruct) { addScore('BigQuery'); }
    if (syntax.hasBigQueryArrayType) { addScore('BigQuery'); }
    if (syntax.hasBigQueryUnnest && (syntax.hasBigQueryStruct || syntax.hasBigQueryArrayType)) {
        addScore('BigQuery');
    }
    if (syntax.hasQualify) { addScore('BigQuery'); }

    // PostgreSQL
    if (syntax.hasPostgresDollarQuotes) { addScore('PostgreSQL'); }
    if (syntax.hasPostgresJsonOperators) { addScore('PostgreSQL'); }
    if (syntax.hasPostgresInterval) { addScore('PostgreSQL'); }
    if (syntax.hasIlike) { addScore('PostgreSQL'); }

    // MySQL
    if (syntax.hasMysqlBackticks) { addScore('MySQL'); }
    if (syntax.hasMysqlGroupByRollup) { addScore('MySQL'); }
    if (syntax.hasMysqlDual) { addScore('MySQL'); }

    // SQL Server (T-SQL)
    if (syntax.hasTSqlApply) { addScore('TransactSQL'); }
    if (syntax.hasTSqlTop) { addScore('TransactSQL'); }
    if (syntax.hasTSqlPivot) { addScore('TransactSQL'); }
    if (syntax.hasThreePartNames) { addScore('TransactSQL'); }
    if (syntax.hasMergeInto) { addScore('TransactSQL'); }

    // Redshift
    if (syntax.hasThreePartNames) { addScore('Redshift'); }
    if (syntax.hasIlike) { addScore('Redshift'); }

    const matchedDialects = rankDialectScores(scores);

    if (matchedDialects.length === 0) {
        return {
            dialect: null,
            scores,
            confidence: 'none'
        };
    }

    const topMatch = matchedDialects[0];
    const secondMatchScore = matchedDialects[1]?.score ?? 0;
    const isHighConfidence =
        matchedDialects.length === 1 ||
        (topMatch.score >= 3 && topMatch.score >= secondMatchScore + 2);

    if (!isHighConfidence) {
        return {
            dialect: null,
            scores,
            confidence: 'low'
        };
    }

    return {
        dialect: topMatch.dialect,
        scores,
        confidence: 'high'
    };
}

/**
 * Find the source column in a source node that maps to the target column
 */
function findSourceColumn(
    targetColumn: ColumnInfo,
    sourceNode: FlowNode,
    _targetNode: FlowNode
): ColumnInfo | null {
    // If target column has explicit source info, use it
    if (targetColumn.sourceColumn && targetColumn.sourceTable) {
        if (sourceNode.label.toLowerCase().includes(targetColumn.sourceTable.toLowerCase())) {
            return {
                name: targetColumn.sourceColumn,
                expression: targetColumn.sourceColumn,
                sourceTable: targetColumn.sourceTable
            };
        }
    }

    // For aggregate nodes, extract column from expression
    if (sourceNode.type === 'aggregate' && sourceNode.aggregateDetails) {
        for (const aggFunc of sourceNode.aggregateDetails.functions) {
            const outputName = aggFunc.alias || aggFunc.name;
            if (safeString(outputName).toLowerCase() === safeString(targetColumn.name).toLowerCase() ||
                safeString(targetColumn.expression).toLowerCase().includes(safeString(outputName).toLowerCase())) {
                // Include source column info for proper lineage tracing
                return {
                    name: outputName,
                    expression: aggFunc.expression,
                    isAggregate: true,
                    sourceColumn: (aggFunc as any).sourceColumn || outputName,
                    sourceTable: (aggFunc as any).sourceTable
                };
            }
        }
    }

    // For window nodes, check window functions
    if (sourceNode.type === 'window' && sourceNode.windowDetails) {
        for (const winFunc of sourceNode.windowDetails.functions) {
            if (safeString(winFunc.name).toLowerCase() === safeString(targetColumn.name).toLowerCase()) {
                return {
                    name: winFunc.name,
                    expression: `${winFunc.name}() OVER (...)`,
                    isWindowFunc: true
                };
            }
        }
    }

    // Check source node columns
    if (sourceNode.columns) {
        for (const sourceCol of sourceNode.columns) {
            // Direct name match
            if (safeString(sourceCol.name).toLowerCase() === safeString(targetColumn.name).toLowerCase()) {
                return sourceCol;
            }
            // Source column match
            if (safeString(sourceCol.name).toLowerCase() === safeString(targetColumn.sourceColumn).toLowerCase()) {
                return sourceCol;
            }
            // Expression match
            if (safeString(targetColumn.expression).toLowerCase().includes(safeString(sourceCol.name).toLowerCase())) {
                return sourceCol;
            }
        }
    }

    // For JOIN nodes, check if the column could pass through
    if (sourceNode.type === 'join') {
        return {
            name: targetColumn.sourceColumn || targetColumn.name,
            expression: targetColumn.sourceColumn || targetColumn.name,
            sourceTable: targetColumn.sourceTable
        };
    }

    // Default: assume passthrough with same name
    return {
        name: targetColumn.sourceColumn || targetColumn.name,
        expression: targetColumn.sourceColumn || targetColumn.name
    };
}

/**
 * Determine the transformation type at a node
 */
function getTransformationType(
    column: ColumnInfo,
    node: FlowNode
): ColumnFlow['lineagePath'][0]['transformation'] {
    // Source tables
    if (node.type === 'table') {
        return 'source';
    }

    // Aggregations - only mark as aggregated if the column itself uses an aggregate function
    // GROUP BY columns that pass through an aggregate node should remain passthrough
    if (column.isAggregate) {
        return 'aggregated';
    }

    // Window functions
    if (column.isWindowFunc || node.type === 'window') {
        return 'calculated';
    }

    // JOINs
    if (node.type === 'join') {
        return 'joined';
    }

    // Renamed columns
    if (column.sourceColumn &&
        safeString(column.name).toLowerCase() !== safeString(column.sourceColumn).toLowerCase()) {
        return 'renamed';
    }

    // Calculated expressions
    if (column.expression &&
        column.expression !== column.name &&
        !column.expression.match(/^[\w.]+$/)) {
        return 'calculated';
    }

    return 'passthrough';
}

/**
 * Calculate column positions on nodes for visual rendering
 * Positions are stored as RELATIVE offsets from the node's origin (node.x, node.y)
 * The renderer will add node.x/node.y to get absolute coordinates
 */
function calculateColumnPositions(nodes: FlowNode[]): void {
    for (const node of nodes) {
        if (!node.columns || node.columns.length === 0) {
            continue;
        }

        const positions = new Map<string, { x: number; y: number }>();
        const visibleColumns: string[] = [];

        // Calculate positions based on node type (relative to node origin)
        switch (node.type) {
            case 'table':
                // Position columns vertically along the right edge
                const spacing = 18;

                node.columns.forEach((col, index) => {
                    if (index < 10) { // Limit visible columns
                        visibleColumns.push(col.name);
                        positions.set(col.name, {
                            x: node.width,  // Right edge (relative)
                            y: 20 + index * spacing  // Offset from top (relative)
                        });
                    }
                });
                break;

            case 'select':
                // Position columns horizontally at the bottom
                const hSpacing = 80;

                node.columns.forEach((col, index) => {
                    if (index < 8) { // Limit visible columns
                        visibleColumns.push(col.name);
                        positions.set(col.name, {
                            x: 10 + (index % 4) * hSpacing,  // Offset from left (relative)
                            y: node.height + Math.floor(index / 4) * 15  // Bottom edge (relative)
                        });
                    }
                });
                break;

            case 'aggregate':
                // Position at output point (center bottom)
                if (node.aggregateDetails) {
                    node.aggregateDetails.functions.forEach((func, index) => {
                        const colName = func.alias || func.name;
                        visibleColumns.push(colName);
                        positions.set(colName, {
                            x: node.width / 2,  // Center (relative)
                            y: node.height + (index * 15)  // Below node (relative)
                        });
                    });
                }
                break;

            case 'window':
                // Position at output point
                if (node.windowDetails) {
                    node.windowDetails.functions.forEach((func, index) => {
                        visibleColumns.push(func.name);
                        positions.set(func.name, {
                            x: node.width / 2,  // Center (relative)
                            y: node.height + (index * 15)  // Below node (relative)
                        });
                    });
                }
                break;

            default:
                // For other node types, position at center bottom
                node.columns.slice(0, 5).forEach((col, index) => {
                    visibleColumns.push(col.name);
                    positions.set(col.name, {
                        x: node.width / 2,  // Center (relative)
                        y: node.height + (index * 12)  // Below node (relative)
                    });
                });
                break;
        }

        node.columnPositions = positions;
        node.visibleColumns = visibleColumns;
    }
}
