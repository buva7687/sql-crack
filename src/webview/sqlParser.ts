import { Parser } from 'node-sql-parser';
import { analyzePerformance } from './performanceAnalyzer';
import {
    detectDialect,
    type DialectDetectionResult,
    rankDialectScores
} from './parser/dialects/detection';
import { regexFallbackParse } from './parser/dialects/fallback';
import {
    collapseSnowflakePaths,
    hasOracleHints,
    hoistNestedCtes,
    preprocessForParsing,
    preprocessOracleSyntax,
    preprocessPostgresSyntax,
    rewriteGroupingSets,
    stripFilterClauses
} from './parser/dialects/preprocessing';
import { detectDialectSpecificSyntax } from './parser/dialects/warnings';
import {
    DEFAULT_VALIDATION_LIMITS,
    formatBytes,
    validateSql
} from './parser/validation/validate';
import { splitSqlStatements, stripLeadingComments } from './parser/validation/splitting';
import { createFreshContext, type ParserContext } from './parser/context';
import { layoutGraph } from './parser/layout';
import { assignLineNumbers } from './parser/lineNumbers';
import {
    calculateColumnPositions,
    extractColumnLineage,
    generateColumnFlows
} from './parser/lineage';
import {
    calculateEnhancedMetrics,
    detectAdvancedIssues,
    generateHints
} from './parser/hints';
import {
    createMergedDdlResult,
    createMergedSessionResult,
    extractConditions,
    getDdlStatementInfo,
    getAstString,
    getSessionCommandInfo,
    getStatementPresentation,
    getTableName,
    processSelectStatement,
    tryParseSessionCommand,
    tryProcessCreateStatement,
    tryProcessDmlStatements
} from './parser/statements';
import { escapeRegex } from '../shared';

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
export { detectDialect, hoistNestedCtes, preprocessPostgresSyntax, preprocessOracleSyntax, preprocessForParsing, rewriteGroupingSets, collapseSnowflakePaths, stripFilterClauses };
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

function isDebugLoggingEnabled(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).debugLogging);
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
        if (isDebugLoggingEnabled()) {
            console.debug('[sqlParser] AST parse failed:', e);
        }
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

function pushHintOnce(context: ParserContext, hint: OptimizationHint): void {
    const exists = context.hints.some(existing =>
        existing.type === hint.type
        && existing.message === hint.message
        && existing.category === hint.category
    );
    if (exists) {
        return;
    }
    context.hints.push(hint);
}

function applyParserCompatibilityPreprocessing(
    sql: string,
    dialect: SqlDialect,
    context: ParserContext
): string {
    let transformedSql = sql;

    const postgresPreprocessedSql = preprocessPostgresSyntax(transformedSql, dialect);
    if (postgresPreprocessedSql !== null) {
        transformedSql = postgresPreprocessedSql;
        pushHintOnce(context, {
            type: 'info',
            message: 'Rewrote PostgreSQL-specific syntax (AT TIME ZONE, type-prefixed literals) for parser compatibility',
            suggestion: 'Constructs like AT TIME ZONE and timestamptz literals are valid PostgreSQL but unsupported by the parser. They were automatically simplified.',
            category: 'best-practice',
            severity: 'low',
        });
    }

    const groupingSetsRewrittenSql = rewriteGroupingSets(transformedSql);
    if (groupingSetsRewrittenSql !== null) {
        transformedSql = groupingSetsRewrittenSql;
        pushHintOnce(context, {
            type: 'info',
            message: 'Rewrote GROUPING SETS for parser compatibility',
            suggestion: 'GROUPING SETS is valid SQL but unsupported by the parser. It was flattened to a standard GROUP BY list for visualization.',
            category: 'best-practice',
            severity: 'low',
        });
    }

    const oraclePreprocessedSql = preprocessOracleSyntax(transformedSql, dialect);
    if (oraclePreprocessedSql !== null) {
        transformedSql = oraclePreprocessedSql;
        pushHintOnce(context, {
            type: 'info',
            message: 'Rewrote Oracle-specific syntax ((+) joins, MINUS, CONNECT BY, PIVOT, FLASHBACK, MODEL) for parser compatibility',
            suggestion: 'Oracle-specific constructs were automatically simplified for visualization. Hierarchical queries (CONNECT BY), PIVOT/UNPIVOT, flashback queries, and MODEL clauses are stripped for parser compatibility.',
            category: 'best-practice',
            severity: 'low',
        });
    }

    if (dialect === 'Oracle' && hasOracleHints(sql)) {
        pushHintOnce(context, {
            type: 'info',
            message: 'Oracle optimizer hints detected',
            suggestion: 'Optimizer hints (/*+ ... */) are preserved in the SQL but do not affect the visualization.',
            category: 'best-practice',
            severity: 'low',
        });
    }

    const filterStrippedSql = stripFilterClauses(transformedSql);
    if (filterStrippedSql !== null) {
        transformedSql = filterStrippedSql;
        pushHintOnce(context, {
            type: 'info',
            message: 'Stripped FILTER (WHERE ...) clauses for parser compatibility',
            suggestion: 'FILTER clauses on aggregate/window functions are valid SQL but unsupported by the parser. They were removed for visualization.',
            category: 'best-practice',
            severity: 'low',
        });
    }

    const collapsedSnowflakePathSql = collapseSnowflakePaths(transformedSql, dialect);
    if (collapsedSnowflakePathSql !== null) {
        transformedSql = collapsedSnowflakePathSql;
        pushHintOnce(context, {
            type: 'info',
            message: 'Collapsed deep Snowflake path expressions for parser compatibility',
            suggestion: 'Snowflake paths with 3+ levels were reduced to 2 levels for structural parsing while preserving casts.',
            category: 'best-practice',
            severity: 'low',
        });
    }

    return transformedSql;
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
    const sessionResult = tryParseSessionCommand(ctx, sql, (prefix) => genId(ctx, prefix));
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

    sql = applyParserCompatibilityPreprocessing(sql, dialect, ctx);

    const parser = new Parser();

    try {
        let ast: any;
        let effectiveDialect = dialect;

        const parseWithDialect = (targetDialect: SqlDialect, sqlText: string = sql): any => {
            // Oracle is not supported by node-sql-parser; use PostgreSQL as the closest proxy
            const parserDialect = targetDialect === 'Oracle' ? 'PostgreSQL' : targetDialect;
            try {
                return parser.astify(sqlText, { database: parserDialect });
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
                const retrySql = applyParserCompatibilityPreprocessing(sql, retryDialect, ctx);

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
                if (isDebugLoggingEnabled()) {
                    console.debug(`[sqlParser] Dialect retry with ${retryDialect} also failed:`, retryErr);
                }
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
        detectAdvancedIssues(ctx, nodes, sql);

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
            trackTableUsage,
            trackFunctionUsage
        },
        cteNames
    );
}
