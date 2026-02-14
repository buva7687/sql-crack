import { Parser } from 'node-sql-parser';
import dagre from 'dagre';
import { analyzePerformance } from './performanceAnalyzer';
import {
    detectDialect,
    type DialectDetectionResult,
    rankDialectScores
} from './parser/dialects/detection';
import { regexFallbackParse } from './parser/dialects/fallback';
import {
    hoistNestedCtes,
    preprocessPostgresSyntax
} from './parser/dialects/preprocessing';
import { detectDialectSpecificSyntax } from './parser/dialects/warnings';
import {
    DEFAULT_VALIDATION_LIMITS,
    formatBytes,
    validateSql
} from './parser/validation/validate';
import { splitSqlStatements } from './parser/validation/splitting';
import { createFreshContext, type ParserContext } from './parser/context';
import {
    calculateEnhancedMetrics,
    detectAdvancedIssues,
    generateHints
} from './parser/hints';
import {
    extractConditions,
    getAstString,
    getStatementPresentation,
    getTableName,
    processSelectStatement,
    tryProcessCreateStatement,
    tryProcessDmlStatements
} from './parser/statements';
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
export { DEFAULT_VALIDATION_LIMITS, splitSqlStatements, validateSql };
export { detectDialect, hoistNestedCtes, preprocessPostgresSyntax };
export type { DialectDetectionResult };

/**
 * Current parser context. All parser state is consolidated here rather than
 * in scattered module-level variables. This context is reset atomically at
 * the start of each parseSql call.
 */
let ctx: ParserContext = createFreshContext('MySQL');

// Track table usage
function trackTableUsage(context: ParserContext, tableName: string): void {
    const normalizedName = tableName.toLowerCase();
    context.tableUsageMap.set(normalizedName, (context.tableUsageMap.get(normalizedName) || 0) + 1);
}

// Track function usage
function trackFunctionUsage(
    context: ParserContext,
    functionName: unknown,
    category: 'aggregate' | 'window' | 'tvf' | 'scalar'
): void {
    if (typeof functionName !== 'string' || !functionName) {return;}
    const normalizedName = functionName.toUpperCase();
    context.functionsUsed.add(`${normalizedName}:${category}`);
}

function calculateComplexity(context: ParserContext): void {
    const score =
        context.stats.tables * 1 +
        context.stats.joins * 3 +
        context.stats.subqueries * 5 +
        context.stats.ctes * 4 +
        context.stats.aggregations * 2 +
        context.stats.windowFunctions * 4 +
        context.stats.unions * 3 +
        context.stats.conditions * 0.5;

    context.stats.complexityScore = Math.round(score);

    if (score < 5) {
        context.stats.complexity = 'Simple';
    } else if (score < 15) {
        context.stats.complexity = 'Moderate';
    } else if (score < 30) {
        context.stats.complexity = 'Complex';
    } else {
        context.stats.complexity = 'Very Complex';
    }
}

function genId(context: ParserContext, prefix: string): string;
function genId(prefix: string): string;
function genId(contextOrPrefix: ParserContext | string, prefix?: string): string {
    if (typeof contextOrPrefix === 'string') {
        return `${contextOrPrefix}_${ctx.nodeCounter++}`;
    }
    const resolvedPrefix = prefix ?? 'node';
    return `${resolvedPrefix}_${contextOrPrefix.nodeCounter++}`;
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
function tryParseSessionCommand(context: ParserContext, sql: string, _dialect: SqlDialect): ParseResult | null {
    // Strip leading comments so patterns can match at start of actual SQL
    const trimmedSql = stripLeadingComments(sql);

    for (const cmd of SESSION_COMMAND_PATTERNS) {
        const match = trimmedSql.match(cmd.pattern);
        if (match) {
            // Create a simple visualization for the session command
            const nodes: FlowNode[] = [];
            const edges: FlowEdge[] = [];

            const nodeId = genId(context, 'session');
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
            context.stats.complexity = 'Simple';
            context.stats.complexityScore = 1;

            return {
                nodes,
                edges,
                stats: { ...context.stats },
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
        // Empty input: return empty result
        if (validationError.type === 'empty_input') {
            const emptyStats: QueryStats = {
                tables: 0, joins: 0, subqueries: 0, ctes: 0, aggregations: 0,
                windowFunctions: 0, unions: 0, conditions: 0,
                complexity: 'Simple', complexityScore: 0,
            };
            return { queries: [], totalStats: emptyStats, validationError };
        }

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
                sql: query.sql.substring(0, 500) + (query.sql.length > 500 ? '...' : '')
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
    } catch (e) {
        window.debugLogging && console.debug('[sqlParser] AST parse failed:', e);
        return null;
    }
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

export function parseSql(sql: string, dialect: SqlDialect = 'MySQL'): ParseResult {
    // Reset all parser state atomically by creating a fresh context
    ctx = createFreshContext(dialect);
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    if (!sql || !sql.trim()) {
        return { nodes, edges, stats: ctx.stats, hints: ctx.hints, sql, columnLineage: [], tableUsage: new Map(), error: 'No SQL provided' };
    }

    // Check if this is a session/utility command that node-sql-parser doesn't support
    const sessionResult = tryParseSessionCommand(ctx, sql, dialect);
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

    // Preprocess PostgreSQL-specific syntax (AT TIME ZONE, type-prefixed literals)
    const preprocessedSql = preprocessPostgresSyntax(sql, dialect);
    if (preprocessedSql !== null) {
        sql = preprocessedSql;
        ctx.hints.push({
            type: 'info',
            message: 'Rewrote PostgreSQL-specific syntax (AT TIME ZONE, type-prefixed literals) for parser compatibility',
            suggestion: 'Constructs like AT TIME ZONE and timestamptz literals are valid PostgreSQL but unsupported by the parser. They were automatically simplified.',
            category: 'best-practice',
            severity: 'low',
        });
    }

    const parser = new Parser();

    try {
        let ast: any;
        let effectiveDialect = dialect;

        const parseWithDialect = (targetDialect: SqlDialect, sqlText: string = sql): any => {
            try {
                return parser.astify(sqlText, { database: targetDialect });
            } catch (parseError) {
                const fallbackAst = tryParseSnowflakeDmlFallback(parser, sqlText, targetDialect);
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
                let retrySql = sql;
                const retryPreprocessedSql = preprocessPostgresSyntax(sql, retryDialect);
                if (retryPreprocessedSql !== null) {
                    retrySql = retryPreprocessedSql;
                    ctx.hints.push({
                        type: 'info',
                        message: 'Rewrote PostgreSQL-specific syntax (AT TIME ZONE, type-prefixed literals) for parser compatibility',
                        suggestion: 'Constructs like AT TIME ZONE and timestamptz literals are valid PostgreSQL but unsupported by the parser. They were automatically simplified.',
                        category: 'best-practice',
                        severity: 'low',
                    });
                }

                ast = parseWithDialect(retryDialect, retrySql);
                effectiveDialect = retryDialect;
                ctx.dialect = retryDialect;
                ctx.hints.push({
                    type: 'info',
                    message: `Auto-retried parse with ${retryDialect} dialect after ${dialect} parse failure`,
                    suggestion: 'If this dialect is expected, switch the parser dialect in the toolbar for consistent parsing.',
                    category: 'best-practice',
                    severity: 'low',
                });
            } catch (retryErr) {
                window.debugLogging && console.debug(`[sqlParser] Dialect retry with ${retryDialect} also failed:`, retryErr);
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
            processStatement(ctx, stmt, nodes, edges);
        }

        // Calculate complexity
        calculateComplexity(ctx);

        // Generate optimization hints
        generateHints(ctx, statements[0]);

        // Detect dialect-specific syntax patterns
        detectDialectSpecificSyntax(ctx, sql, effectiveDialect);

        // Detect advanced issues (unused CTEs, dead columns, etc.)
        detectAdvancedIssues(ctx, nodes, edges, sql);

        // Calculate enhanced complexity metrics
        calculateEnhancedMetrics(ctx, nodes, edges);

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
        detectDialectSpecificSyntax(ctx, sql, dialect);

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

function processStatement(context: ParserContext, stmt: any, nodes: FlowNode[], edges: FlowEdge[]): string | null {
    ctx = context;
    if (!stmt || !stmt.type || typeof stmt.type !== 'string') { return null; }

    ctx.statementType = stmt.type.toLowerCase();

    if (ctx.statementType === 'select') {
        return processSelect(context, stmt, nodes, edges);
    }

    // For non-SELECT, create a simple representation
    const rootId = genId('stmt');

    const { label, description, objectName } = getStatementPresentation(stmt, ctx.statementType);

    const createRootId = tryProcessCreateStatement(
        context,
        stmt,
        nodes,
        edges,
        rootId,
        objectName,
        (prefix) => genId(prefix),
        processSelect
    );
    if (createRootId) {
        return createRootId;
    }

    const dmlRootId = tryProcessDmlStatements({
        context,
        stmt,
        nodes,
        edges,
        rootId,
        label,
        description,
        genId: (prefix) => genId(prefix),
        processSelect,
        getTableName,
        extractConditions
    });
    if (dmlRootId) {
        return dmlRootId;
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

function processSelect(
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    cteNames: Set<string> = new Set()
): string {
    return processSelectStatement(
        context,
        stmt,
        nodes,
        edges,
        {
            genId: (prefix) => genId(prefix),
            processStatement,
            layoutGraph,
            extractColumnLineage,
            calculateColumnPositions,
            assignLineNumbers,
            calculateComplexity,
            trackTableUsage,
            trackFunctionUsage
        },
        cteNames
    );
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
