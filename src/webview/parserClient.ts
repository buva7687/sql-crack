/**
 * Parser Client for async SQL parsing
 *
 * Provides async parsing API that wraps the synchronous parser.
 * Uses a dedicated parser worker when the webview bootstrap provides a worker URI,
 * while preserving the existing macrotask yield and stale-request cancellation.
 */

import { ParseResult, BatchParseResult, QueryStats, SqlDialect, ValidationError, ValidationLimits } from './types';
import { parseSql, parseSqlBatch, validateSql, setParseTimeout, DEFAULT_VALIDATION_LIMITS, ParseOptions, BatchParseOptions } from './sqlParser';

type WorkerBackedResponse = ParseResult | BatchParseResult;
export type ParseRequestMode = 'latest' | 'independent';

type ParserWorkerRequest =
    | {
        type: 'parse';
        requestId: number;
        payload: {
            sql: string;
            dialect: SqlDialect;
            options: ParseOptions;
            parseTimeoutMs: number;
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
            parseTimeoutMs: number;
        };
    };

type ParserWorkerResponse =
    | { type: 'started'; requestId: number }
    | { type: 'parse'; requestId: number; result: ParseResult }
    | { type: 'parseBatch'; requestId: number; result: BatchParseResult }
    | { type: 'validate'; requestId: number; result: ValidationError | null }
    | { type: 'error'; requestId: number; error: string };

interface PendingWorkerRequest {
    kind: 'parse' | 'parseBatch';
    sql: string;
    worker: Worker;
    request: ParserWorkerRequest;
    resolve: (value: WorkerBackedResponse) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_PARSE_TIMEOUT_MS = 5000;
const PARSER_WORKER_START_TIMEOUT_MS = 5000;

/**
 * User-configured parse budget (`sqlCrack.advanced.parseTimeoutSeconds`).
 * Governs both the worker execution watchdog and the worker's own per-query
 * AST timeout, which lives in a separate module instance from the main thread.
 */
let parseTimeoutMs = DEFAULT_PARSE_TIMEOUT_MS;

/**
 * Apply the configured parse timeout to the main-thread parser, the worker
 * watchdog, and every subsequent worker request. Invalid values restore the
 * default.
 */
export function configureParseTimeout(ms?: number): void {
    parseTimeoutMs = typeof ms === 'number' && Number.isFinite(ms) && ms > 0
        ? ms
        : DEFAULT_PARSE_TIMEOUT_MS;
    setParseTimeout(parseTimeoutMs);
}

const PARSE_TIMEOUT_MESSAGE =
    'Parsing timed out — the query may be too large or complex to visualize.';

/**
 * Distinguishes a worker timeout from other worker failures (crash, unavailable).
 * On a timeout we must NOT re-run the heavy parse synchronously on the webview
 * thread, since that re-freezes the UI — the whole reason the work was offloaded.
 */
class ParserWorkerTimeoutError extends Error {
    constructor() {
        super('Parser worker timed out');
        this.name = 'ParserWorkerTimeoutError';
    }
}

/** Parser code reported a request-local failure; the worker remains usable. */
class ParserWorkerReportedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ParserWorkerReportedError';
    }
}

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

function createTimedOutParseResult(sql: string): ParseResult {
    return {
        nodes: [],
        edges: [],
        stats: createEmptyStats(),
        hints: [],
        sql,
        columnLineage: [],
        tableUsage: new Map(),
        error: PARSE_TIMEOUT_MESSAGE,
    };
}

function createTimedOutBatchParseResult(sql: string): BatchParseResult {
    return {
        queries: [createTimedOutParseResult(sql)],
        totalStats: createEmptyStats(),
        parseErrors: [{ queryIndex: 0, message: PARSE_TIMEOUT_MESSAGE, sql }],
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

function clearWorkerRequestTimeout(timeoutId: ReturnType<typeof setTimeout> | null): void {
    if (timeoutId !== null) {
        clearTimeout(timeoutId);
    }
}

function resolveCancelledWorkerRequest(requestId: number, request: PendingWorkerRequest): void {
    clearWorkerRequestTimeout(request.timeoutId);
    pendingWorkerRequests.delete(requestId);
    request.resolve(request.kind === 'parse'
        ? createCancelledParseResult(request.sql)
        : createCancelledBatchParseResult(request.sql));
}

function cancelSupersededWorkerRequests(requestId: number): void {
    let supersededActiveRequest = false;
    for (const [pendingRequestId, pendingRequest] of pendingWorkerRequests) {
        if (pendingRequestId < requestId) {
            resolveCancelledWorkerRequest(pendingRequestId, pendingRequest);
            supersededActiveRequest = true;
        }
    }

    // Resolving the superseded promises above only settles them on the main
    // thread — it does NOT stop the worker, which processes messages serially
    // and cannot abort an in-flight synchronous parse. A heavy superseded parse
    // would keep the worker busy and the latest request would queue behind it,
    // eventually hitting its own timeout (a false timeout for SQL that is
    // actually small). Terminate the worker so the abandoned work stops and the
    // next request spins up a fresh worker that runs immediately. node-sql-parser
    // astify() is synchronous, so terminate-and-respawn is the only way to
    // reclaim the worker.
    if (supersededActiveRequest) {
        destroyWorker();
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

function rejectPendingWorkerRequests(error: Error, worker?: Worker): void {
    for (const [requestId, pendingRequest] of pendingWorkerRequests) {
        if (worker && pendingRequest.worker !== worker) {
            continue;
        }
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

    if (response.type === 'started') {
        startWorkerRequestTimeout(response.requestId, pendingRequest);
        return;
    }

    clearWorkerRequestTimeout(pendingRequest.timeoutId);
    pendingWorkerRequests.delete(response.requestId);

    if (response.type === 'error') {
        pendingRequest.reject(new ParserWorkerReportedError(response.error));
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
        const pendingRequest: PendingWorkerRequest = {
            kind,
            sql,
            worker,
            request,
            resolve: (value) => resolve(value as T),
            reject,
            timeoutId: null,
        };
        const workerIsIdle = ![...pendingWorkerRequests.values()]
            .some(pending => pending.worker === worker);
        pendingWorkerRequests.set(requestId, pendingRequest);

        // Only the head request gets a start watchdog. Requests queued behind
        // synchronous parser work wait for the worker's `started` message, so
        // their execution budget does not elapse before they begin.
        if (workerIsIdle) {
            startWorkerRequestTimeout(requestId, pendingRequest, PARSER_WORKER_START_TIMEOUT_MS);
        }

        worker.postMessage(request);
    });
}

function startWorkerRequestTimeout(
    requestId: number,
    request: PendingWorkerRequest,
    timeoutMs: number = parseTimeoutMs
): void {
    clearWorkerRequestTimeout(request.timeoutId);
    request.timeoutId = setTimeout(() => {
        const timedOutRequest = pendingWorkerRequests.get(requestId);
        if (!timedOutRequest || timedOutRequest !== request) {
            return;
        }

        const timedOutWorker = timedOutRequest.worker;
        clearWorkerRequestTimeout(timedOutRequest.timeoutId);
        pendingWorkerRequests.delete(requestId);
        timedOutRequest.reject(new ParserWorkerTimeoutError());

        const stranded = [...pendingWorkerRequests.entries()]
            .filter(([, pending]) => pending.worker === timedOutWorker);
        if (parserWorker === timedOutWorker) {
            destroyWorker();
        }
        if (stranded.length === 0) {
            return;
        }

        const replacementWorker = getOrCreateWorker();
        for (const [index, [strandedRequestId, pending]] of stranded.entries()) {
            clearWorkerRequestTimeout(pending.timeoutId);
            pending.timeoutId = null;
            pending.worker = replacementWorker;
            if (index === 0) {
                startWorkerRequestTimeout(
                    strandedRequestId,
                    pending,
                    PARSER_WORKER_START_TIMEOUT_MS
                );
            }
            replacementWorker.postMessage(pending.request);
        }
    }, timeoutMs);
}

function beginParseRequest(mode: ParseRequestMode = 'latest'): number {
    const requestId = ++nextParseRequestId;
    pendingParseRequests++;
    if (mode === 'latest') {
        latestParseRequestId = requestId;
        cancelSupersededWorkerRequests(requestId);
    }
    return requestId;
}

function finishParseRequest(): void {
    pendingParseRequests = Math.max(0, pendingParseRequests - 1);
}

function isParseRequestStale(requestId: number, mode: ParseRequestMode = 'latest'): boolean {
    if (requestId <= cancelledParseRequestId) {
        return true;
    }
    return mode === 'latest'
        ? requestId !== latestParseRequestId
        : requestId < latestParseRequestId;
}

export function isCancelledBatchParseResult(result: BatchParseResult): boolean {
    return result.queries.length === 1
        && result.queries[0]?.error === 'Parse cancelled'
        && result.parseErrors?.length === 1
        && result.parseErrors[0]?.message === 'Parse cancelled';
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
    options: ParseOptions = {},
    requestMode: ParseRequestMode = 'latest'
): Promise<ParseResult> {
    const requestId = beginParseRequest(requestMode);
    try {
        await yieldToMainLoop();
        if (isParseRequestStale(requestId, requestMode)) {
            return createCancelledParseResult(sql);
        }

        if (isWorkerSupported()) {
            try {
                return await queueWorkerRequest<ParseResult>(requestId, 'parse', sql, {
                    type: 'parse',
                    requestId,
                    payload: { sql, dialect, options, parseTimeoutMs },
                });
            } catch (error) {
                if (!(error instanceof ParserWorkerTimeoutError)
                    && !(error instanceof ParserWorkerReportedError)) {
                    destroyWorker();
                }
                if (isParseRequestStale(requestId, requestMode)) {
                    return createCancelledParseResult(sql);
                }
                // A worker timeout means the parse is genuinely heavy — running it
                // synchronously here would re-freeze the webview thread. Return a
                // lightweight result instead. (The worker was already destroyed, so
                // the next request spins up a fresh one.)
                if (error instanceof ParserWorkerTimeoutError) {
                    return createTimedOutParseResult(sql);
                }
                // Request-local parser errors fall back synchronously while the
                // healthy worker continues processing its queued requests. Worker
                // crashes are already destroyed by handleWorkerError().
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
    options: BatchParseOptions = {},
    requestMode: ParseRequestMode = 'latest'
): Promise<BatchParseResult> {
    const appliedLimits = limits ?? DEFAULT_VALIDATION_LIMITS;
    const requestId = beginParseRequest(requestMode);
    try {
        await yieldToMainLoop();
        if (isParseRequestStale(requestId, requestMode)) {
            return createCancelledBatchParseResult(sql);
        }

        if (isWorkerSupported()) {
            try {
                return await queueWorkerRequest<BatchParseResult>(requestId, 'parseBatch', sql, {
                    type: 'parseBatch',
                    requestId,
                    payload: { sql, dialect, limits: appliedLimits, options, parseTimeoutMs },
                });
            } catch (error) {
                if (!(error instanceof ParserWorkerTimeoutError)
                    && !(error instanceof ParserWorkerReportedError)) {
                    destroyWorker();
                }
                if (isParseRequestStale(requestId, requestMode)) {
                    return createCancelledBatchParseResult(sql);
                }
                // A worker timeout means the parse is genuinely heavy — running it
                // synchronously here would re-freeze the webview thread. Return a
                // lightweight result instead. (The worker was already destroyed, so
                // the next request spins up a fresh one.)
                if (error instanceof ParserWorkerTimeoutError) {
                    return createTimedOutBatchParseResult(sql);
                }
                // Request-local parser errors fall back synchronously while the
                // healthy worker continues processing its queued requests. Worker
                // crashes are already destroyed by handleWorkerError().
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
    cancelledParseRequestId = nextParseRequestId;
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
