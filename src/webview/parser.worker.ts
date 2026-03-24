import {
    parseSql,
    parseSqlBatch,
    validateSql,
    DEFAULT_VALIDATION_LIMITS,
    type ParseOptions,
    type BatchParseOptions,
} from './sqlParser';
import type {
    ParseResult,
    BatchParseResult,
    SqlDialect,
    ValidationError,
    ValidationLimits,
} from './types';

type ParserWorkerRequest =
    | {
        type: 'parse';
        requestId: number;
        payload: {
            sql: string;
            dialect?: SqlDialect;
            options?: ParseOptions;
        };
    }
    | {
        type: 'parseBatch';
        requestId: number;
        payload: {
            sql: string;
            dialect?: SqlDialect;
            limits?: ValidationLimits;
            options?: BatchParseOptions;
        };
    }
    | {
        type: 'validate';
        requestId: number;
        payload: {
            sql: string;
            maxSizeBytes?: number;
            maxQueryCount?: number;
        };
    };

type ParserWorkerResponse =
    | { type: 'parse'; requestId: number; result: ParseResult }
    | { type: 'parseBatch'; requestId: number; result: BatchParseResult }
    | { type: 'validate'; requestId: number; result: ValidationError | null }
    | { type: 'error'; requestId: number; error: string };

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function postWorkerMessage(message: ParserWorkerResponse): void {
    postMessage(message);
}

addEventListener('message', (event: MessageEvent<ParserWorkerRequest>) => {
    const message = event.data;

    try {
        if (message.type === 'parse') {
            postWorkerMessage({
                type: 'parse',
                requestId: message.requestId,
                result: parseSql(
                    message.payload.sql,
                    message.payload.dialect ?? 'MySQL',
                    message.payload.options ?? {}
                ),
            });
            return;
        }

        if (message.type === 'parseBatch') {
            postWorkerMessage({
                type: 'parseBatch',
                requestId: message.requestId,
                result: parseSqlBatch(
                    message.payload.sql,
                    message.payload.dialect ?? 'MySQL',
                    message.payload.limits ?? DEFAULT_VALIDATION_LIMITS,
                    message.payload.options ?? {}
                ),
            });
            return;
        }

        if (message.type === 'validate') {
            const limits: ValidationLimits = {
                maxSqlSizeBytes: message.payload.maxSizeBytes ?? DEFAULT_VALIDATION_LIMITS.maxSqlSizeBytes,
                maxQueryCount: message.payload.maxQueryCount ?? DEFAULT_VALIDATION_LIMITS.maxQueryCount,
            };

            postWorkerMessage({
                type: 'validate',
                requestId: message.requestId,
                result: validateSql(message.payload.sql, limits),
            });
            return;
        }

        const unknownMessage = message as { type?: string; requestId?: number };
        postWorkerMessage({
            type: 'error',
            requestId: unknownMessage.requestId ?? -1,
            error: `Unsupported parser worker message type: ${unknownMessage.type ?? 'unknown'}`,
        });
    } catch (error) {
        postWorkerMessage({
            type: 'error',
            requestId: message.requestId,
            error: toErrorMessage(error),
        });
    }
});
