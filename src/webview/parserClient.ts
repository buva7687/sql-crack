/**
 * Parser Client for async SQL parsing
 *
 * Provides async parsing API that wraps the synchronous parser.
 * Uses a dedicated parser worker when the webview bootstrap provides a worker URI,
 * while preserving the existing macrotask yield and stale-request cancellation.
 */

import { ParseResult, BatchParseResult, QueryStats, SqlDialect, ValidationError, ValidationLimits } from './types';
import { parseSql, parseSqlBatch, validateSql, DEFAULT_VALIDATION_LIMITS, ParseOptions, BatchParseOptions } from './sqlParser';

type WorkerBackedResponse = ParseResult | BatchParseResult;

type ParserWorkerRequest =
    | {
        type: 'parse';
        requestId: number;
        payload: {
            sql: string;
            dialect: SqlDialect;
            options: ParseOptions;
        };
    }
    | {
        type: 'parseBatch';
        requestId: number;
        payload: {
            sql: string;
            dialect: SqlDialect;
            limits: ValidationLimits;
            options: BatchParseOptions;
        };
    };

type ParserWorkerResponse =
    | { type: 'parse'; requestId: number; result: ParseResult }
    | { type: 'parseBatch'; requestId: number; result: BatchParseResult }
    | { type: 'validate'; requestId: number; result: ValidationError | null }
    | { type: 'error'; requestId: number; error: string };

interface PendingWorkerRequest {
    kind: 'parse' | 'parseBatch';
    sql: string;
    resolve: (value: WorkerBackedResponse) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

const PARSER_WORKER_TIMEOUT_MS = 5000;

function yieldToMainLoop(): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, 0);
    });
}

let nextParseRequestId = 0;
let latestParseRequestId = 0;
let cancelledParseRequestId = 0;
let pendingParseRequests = 0;
let parserWorker: Worker | null = null;
const pendingWorkerRequests = new Map<number, PendingWorkerRequest>();

type ParserWorkerWindow = Window & typeof globalThis & {
    parserWorkerUri?: string;
    sqlCrackConfig?: {
        parserWorkerUri?: string;
    };
};

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

function getParserWorkerUri(): string | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const workerWindow = window as ParserWorkerWindow;
    return workerWindow.sqlCrackConfig?.parserWorkerUri || workerWindow.parserWorkerUri || null;
}

function clearWorkerRequestTimeout(timeoutId: ReturnType<typeof setTimeout>): void {
    clearTimeout(timeoutId);
}

function resolveCancelledWorkerRequest(requestId: number, request: PendingWorkerRequest): void {
    clearWorkerRequestTimeout(request.timeoutId);
    pendingWorkerRequests.delete(requestId);
    request.resolve(request.kind === 'parse'
        ? createCancelledParseResult(request.sql)
        : createCancelledBatchParseResult(request.sql));
}

function cancelSupersededWorkerRequests(requestId: number): void {
    for (const [pendingRequestId, pendingRequest] of pendingWorkerRequests) {
        if (pendingRequestId < requestId) {
            resolveCancelledWorkerRequest(pendingRequestId, pendingRequest);
        }
    }
}

function detachWorkerListeners(worker: Worker): void {
    worker.removeEventListener('message', handleWorkerMessage as EventListener);
    worker.removeEventListener('error', handleWorkerError as EventListener);
}

function destroyWorker(): void {
    if (!parserWorker) {
        return;
    }

    detachWorkerListeners(parserWorker);
    parserWorker.terminate();
    parserWorker = null;
}

function rejectPendingWorkerRequests(error: Error): void {
    for (const [requestId, pendingRequest] of pendingWorkerRequests) {
        clearWorkerRequestTimeout(pendingRequest.timeoutId);
        pendingWorkerRequests.delete(requestId);
        pendingRequest.reject(error);
    }
}

function handleWorkerMessage(event: MessageEvent<ParserWorkerResponse>): void {
    const response = event.data;
    const pendingRequest = pendingWorkerRequests.get(response.requestId);
    if (!pendingRequest) {
        return;
    }

    clearWorkerRequestTimeout(pendingRequest.timeoutId);
    pendingWorkerRequests.delete(response.requestId);

    if (response.type === 'error') {
        pendingRequest.reject(new Error(response.error));
        return;
    }

    if (response.type === 'parse' || response.type === 'parseBatch') {
        pendingRequest.resolve(response.result);
    }
}

function handleWorkerError(event: ErrorEvent): void {
    const message = event.message || 'Parser worker error';
    destroyWorker();
    rejectPendingWorkerRequests(new Error(message));
}

function getOrCreateWorker(): Worker {
    if (parserWorker) {
        return parserWorker;
    }

    const workerUri = getParserWorkerUri();
    if (!workerUri || typeof Worker === 'undefined') {
        throw new Error('Parser worker is not available in the current environment');
    }

    parserWorker = new Worker(workerUri);
    parserWorker.addEventListener('message', handleWorkerMessage as EventListener);
    parserWorker.addEventListener('error', handleWorkerError as EventListener);
    return parserWorker;
}

function queueWorkerRequest<T extends WorkerBackedResponse>(
    requestId: number,
    kind: PendingWorkerRequest['kind'],
    sql: string,
    request: ParserWorkerRequest
): Promise<T> {
    const worker = getOrCreateWorker();

    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            const pendingRequest = pendingWorkerRequests.get(requestId);
            if (!pendingRequest) {
                return;
            }

            pendingWorkerRequests.delete(requestId);
            destroyWorker();
            reject(new Error('Parser worker timed out'));
        }, PARSER_WORKER_TIMEOUT_MS);

        pendingWorkerRequests.set(requestId, {
            kind,
            sql,
            resolve: (value) => resolve(value as T),
            reject,
            timeoutId,
        });

        worker.postMessage(request);
    });
}

function beginParseRequest(): number {
    const requestId = ++nextParseRequestId;
    latestParseRequestId = requestId;
    pendingParseRequests++;
    cancelSupersededWorkerRequests(requestId);
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

        if (isWorkerSupported()) {
            try {
                return await queueWorkerRequest<ParseResult>(requestId, 'parse', sql, {
                    type: 'parse',
                    requestId,
                    payload: { sql, dialect, options },
                });
            } catch {
                destroyWorker();
                if (isParseRequestStale(requestId)) {
                    return createCancelledParseResult(sql);
                }
            }
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

        if (isWorkerSupported()) {
            try {
                return await queueWorkerRequest<BatchParseResult>(requestId, 'parseBatch', sql, {
                    type: 'parseBatch',
                    requestId,
                    payload: { sql, dialect, limits: appliedLimits, options },
                });
            } catch {
                destroyWorker();
                if (isParseRequestStale(requestId)) {
                    return createCancelledBatchParseResult(sql);
                }
            }
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
 */
export function isWorkerSupported(): boolean {
    return typeof window !== 'undefined'
        && typeof Worker !== 'undefined'
        && typeof getParserWorkerUri() === 'string'
        && Boolean(getParserWorkerUri());
}

/**
 * Terminate the worker and cleanup resources
 */
export function terminateWorker(): void {
    cancelPendingParse();
    destroyWorker();
}

/**
 * Parse with automatic fallback
 *
 * @param sql - SQL string to parse
 * @param dialect - SQL dialect to use
 * @param useWorker - Whether to attempt using the parser worker when supported
 * @returns Promise resolving to parse result
 */
export async function parseWithFallback(
    sql: string,
    dialect: SqlDialect = 'MySQL',
    useWorker: boolean = true,
    options: ParseOptions = {}
): Promise<ParseResult> {
    if (!useWorker) {
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

    return parseAsync(sql, dialect, options);
}

/**
 * Cancel any pending parse operations
 */
export function cancelPendingParse(): void {
    cancelledParseRequestId = latestParseRequestId;
    for (const [requestId, pendingRequest] of pendingWorkerRequests) {
        resolveCancelledWorkerRequest(requestId, pendingRequest);
    }
}

/**
 * Get worker status for debugging
 */
export function getWorkerStatus(): {
    supported: boolean;
    active: boolean;
    pendingRequests: number;
    implementation: 'deferred' | 'worker';
} {
    return {
        supported: isWorkerSupported(),
        active: parserWorker !== null,
        pendingRequests: pendingParseRequests,
        implementation: isWorkerSupported() ? 'worker' : 'deferred'
    };
}
