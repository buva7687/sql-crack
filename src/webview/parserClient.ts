/**
 * Parser Client for async SQL parsing
 *
 * Provides async parsing API with dynamic imports for code splitting.
 * Web Worker implementation is deferred to future work due to bundling complexity.
 * The async API still provides benefits by allowing chunked code loading.
 */

import { ParseResult, BatchParseResult, SqlDialect, ValidationError } from './types';

/**
 * Parse SQL asynchronously using dynamic imports
 *
 * @param sql - SQL string to parse
 * @param dialect - SQL dialect to use
 * @returns Promise resolving to parse result
 */
export async function parseAsync(
    sql: string,
    dialect: SqlDialect = 'MySQL'
): Promise<ParseResult> {
    // Dynamically import parseSql for code splitting
    const { parseSql } = await import('./sqlParser');
    return parseSql(sql, dialect);
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
    dialect: SqlDialect = 'MySQL'
): Promise<BatchParseResult> {
    // Dynamically import parseSqlBatch for code splitting
    const { parseSqlBatch } = await import('./sqlParser');
    return parseSqlBatch(sql, dialect);
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
    // Dynamically import validateSql for code splitting
    const { validateSql, DEFAULT_VALIDATION_LIMITS } = await import('./sqlParser');

    const limits = {
        maxSqlSizeBytes: maxSizeBytes ?? DEFAULT_VALIDATION_LIMITS.maxSqlSizeBytes,
        maxQueryCount: maxQueryCount ?? DEFAULT_VALIDATION_LIMITS.maxQueryCount
    };

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
