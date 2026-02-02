/**
 * Parser Client for async SQL parsing
 *
 * Provides async parsing API that wraps the synchronous parser.
 * Uses regular imports (not dynamic) to avoid CSP issues with webpack chunks.
 * Web Worker implementation is deferred to future work due to bundling complexity.
 */

import { ParseResult, BatchParseResult, SqlDialect, ValidationError, ValidationLimits } from './types';
import { parseSql, parseSqlBatch, validateSql, DEFAULT_VALIDATION_LIMITS } from './sqlParser';

/**
 * Parse SQL asynchronously
 *
 * @param sql - SQL string to parse
 * @param dialect - SQL dialect to use
 * @returns Promise resolving to parse result
 */
export async function parseAsync(
    sql: string,
    dialect: SqlDialect = 'MySQL'
): Promise<ParseResult> {
    // Use Promise.resolve to make it async without blocking
    return Promise.resolve(parseSql(sql, dialect));
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
    options?: { combineDdlStatements?: boolean }
): Promise<BatchParseResult> {
    const appliedLimits = limits ?? DEFAULT_VALIDATION_LIMITS;
    return Promise.resolve(parseSqlBatch(sql, dialect, appliedLimits, options ?? {}));
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

    return Promise.resolve(validateSql(sql, limits));
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
    useWorker: boolean = true
): Promise<ParseResult> {
    // Worker implementation deferred, always use async import
    return parseAsync(sql, dialect);
}

/**
 * Cancel any pending parse operations
 *
 * Note: Worker implementation is deferred. This is a no-op currently.
 */
export function cancelPendingParse(): void {
    // Worker implementation deferred - no-op for now
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
        pendingRequests: 0,
        implementation: 'deferred'
    };
}
