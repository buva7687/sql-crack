/**
 * Parser Client for async SQL parsing
 *
 * Provides async parsing API that wraps the synchronous parser.
 * Uses regular imports (not dynamic) to avoid CSP issues with webpack chunks.
 * Web Worker implementation is deferred to future work due to bundling complexity.
 */

import { ParseResult, BatchParseResult, QueryStats, SqlDialect, ValidationError, ValidationLimits } from './types';
import { parseSql, parseSqlBatch, validateSql, DEFAULT_VALIDATION_LIMITS, ParseOptions, BatchParseOptions } from './sqlParser';

function yieldToMainLoop(): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, 0);
    });
}

let nextParseRequestId = 0;
let latestParseRequestId = 0;
let cancelledParseRequestId = 0;
let pendingParseRequests = 0;

function createEmptyStats(): QueryStats {
    return {
        tables: 0,
        joins: 0,
        subqueries: 0,
        ctes: 0,
        aggregations: 0,
        windowFunctions: 0,
        unions: 0,
        conditions: 0,
        complexity: 'Simple',
        complexityScore: 0,
    };
}

function createCancelledParseResult(sql: string): ParseResult {
    return {
        nodes: [],
        edges: [],
        stats: createEmptyStats(),
        hints: [],
        sql,
        columnLineage: [],
        tableUsage: new Map(),
        error: 'Parse cancelled',
    };
}

function createCancelledBatchParseResult(sql: string): BatchParseResult {
    return {
        queries: [createCancelledParseResult(sql)],
        totalStats: createEmptyStats(),
        parseErrors: [{ queryIndex: 0, message: 'Parse cancelled', sql }],
        successCount: 0,
        errorCount: 1,
    };
}

function beginParseRequest(): number {
    const requestId = ++nextParseRequestId;
    latestParseRequestId = requestId;
    pendingParseRequests++;
    return requestId;
}

function finishParseRequest(): void {
    pendingParseRequests = Math.max(0, pendingParseRequests - 1);
}

function isParseRequestStale(requestId: number): boolean {
    return requestId <= cancelledParseRequestId || requestId !== latestParseRequestId;
}

/**
 * Parse SQL asynchronously
 *
 * @param sql - SQL string to parse
 * @param dialect - SQL dialect to use
 * @returns Promise resolving to parse result
 */
export async function parseAsync(
    sql: string,
    dialect: SqlDialect = 'MySQL',
    options: ParseOptions = {}
): Promise<ParseResult> {
    const requestId = beginParseRequest();
    try {
        await yieldToMainLoop();
        if (isParseRequestStale(requestId)) {
            return createCancelledParseResult(sql);
        }
        return parseSql(sql, dialect, options);
    } finally {
        finishParseRequest();
    }
}

/**
 * Parse multiple SQL statements in batch asynchronously
 *
 * @param sql - SQL string with potentially multiple statements
 * @param dialect - SQL dialect to use
 * @returns Promise resolving to batch parse result
 */
export async function parseBatchAsync(
    sql: string,
    dialect: SqlDialect = 'MySQL',
    limits?: ValidationLimits,
    options: BatchParseOptions = {}
): Promise<BatchParseResult> {
    const appliedLimits = limits ?? DEFAULT_VALIDATION_LIMITS;
    const requestId = beginParseRequest();
    try {
        await yieldToMainLoop();
        if (isParseRequestStale(requestId)) {
            return createCancelledBatchParseResult(sql);
        }
        return parseSqlBatch(sql, dialect, appliedLimits, options);
    } finally {
        finishParseRequest();
    }
}

/**
 * Validate SQL asynchronously
 *
 * @param sql - SQL string to validate
 * @param maxSizeBytes - Maximum size in bytes
 * @param maxQueryCount - Maximum number of queries
 * @returns Promise resolving to validation error or null
 */
export async function validateAsync(
    sql: string,
    maxSizeBytes?: number,
    maxQueryCount?: number
): Promise<ValidationError | null> {
    const limits = {
        maxSqlSizeBytes: maxSizeBytes ?? DEFAULT_VALIDATION_LIMITS.maxSqlSizeBytes,
        maxQueryCount: maxQueryCount ?? DEFAULT_VALIDATION_LIMITS.maxQueryCount
    };

    await yieldToMainLoop();
    return validateSql(sql, limits);
}

/**
 * Check if web workers are supported in current environment
 *
 * Note: Worker implementation is deferred. This always returns false currently.
 */
export function isWorkerSupported(): boolean {
    // Worker implementation deferred to future work
    return false;
}

/**
 * Terminate the worker and cleanup resources
 *
 * Note: Worker implementation is deferred. This is a no-op currently.
 */
export function terminateWorker(): void {
    // Worker implementation deferred - no-op for now
    cancelPendingParse();
}

/**
 * Parse with automatic fallback
 *
 * @param sql - SQL string to parse
 * @param dialect - SQL dialect to use
 * @param useWorker - Whether to attempt using worker (ignored for now)
 * @returns Promise resolving to parse result
 */
export async function parseWithFallback(
    sql: string,
    dialect: SqlDialect = 'MySQL',
    useWorker: boolean = true,
    options: ParseOptions = {}
): Promise<ParseResult> {
    // Worker implementation deferred, always use async import
    return parseAsync(sql, dialect, options);
}

/**
 * Cancel any pending parse operations
 *
 * Note: Worker implementation is deferred. This is a no-op currently.
 */
export function cancelPendingParse(): void {
    cancelledParseRequestId = latestParseRequestId;
}

/**
 * Get worker status for debugging
 *
 * Note: Worker implementation is deferred.
 */
export function getWorkerStatus(): {
    supported: boolean;
    active: boolean;
    pendingRequests: number;
    implementation: 'deferred';
} {
    return {
        supported: false,
        active: false,
        pendingRequests: pendingParseRequests,
        implementation: 'deferred'
    };
}
