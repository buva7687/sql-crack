describe('parser.worker', () => {
    type MessageHandler = (event: { data: unknown }) => void;

    const DEFAULT_VALIDATION_LIMITS = {
        maxSqlSizeBytes: 4096,
        maxQueryCount: 20,
    };

    let messageHandler: MessageHandler | undefined;
    let postMessageMock: jest.Mock;
    let addEventListenerMock: jest.Mock;
    let parseSqlMock: jest.Mock;
    let parseSqlBatchMock: jest.Mock;
    let validateSqlMock: jest.Mock;

    function loadWorkerModule(): void {
        jest.resetModules();

        parseSqlMock = jest.fn();
        parseSqlBatchMock = jest.fn();
        validateSqlMock = jest.fn();

        postMessageMock = jest.fn();
        addEventListenerMock = jest.fn((type: string, handler: MessageHandler) => {
            if (type === 'message') {
                messageHandler = handler;
            }
        });

        (global as typeof globalThis & { postMessage: jest.Mock }).postMessage = postMessageMock;
        (global as typeof globalThis & { addEventListener: jest.Mock }).addEventListener = addEventListenerMock;

        jest.doMock('../../../src/webview/sqlParser', () => ({
            parseSql: parseSqlMock,
            parseSqlBatch: parseSqlBatchMock,
            validateSql: validateSqlMock,
            DEFAULT_VALIDATION_LIMITS,
        }));

        jest.isolateModules(() => {
            require('../../../src/webview/parser.worker');
        });
    }

    function dispatchMessage(data: unknown): void {
        if (!messageHandler) {
            throw new Error('parser.worker did not register a message handler');
        }
        messageHandler({ data });
    }

    afterEach(() => {
        delete (global as Record<string, unknown>).postMessage;
        delete (global as Record<string, unknown>).addEventListener;
        jest.resetModules();
        jest.clearAllMocks();
        jest.dontMock('../../../src/webview/sqlParser');
        messageHandler = undefined;
    });

    it('registers a message listener on module load', () => {
        loadWorkerModule();

        expect(addEventListenerMock).toHaveBeenCalledWith('message', expect.any(Function));
        expect(messageHandler).toEqual(expect.any(Function));
    });

    it('dispatches parse requests to parseSql and posts the result', () => {
        loadWorkerModule();
        const result = { sql: 'SELECT 1', nodes: [], edges: [], hints: [], stats: {}, columnLineage: [], tableUsage: new Map() };
        parseSqlMock.mockReturnValue(result);

        dispatchMessage({
            type: 'parse',
            requestId: 7,
            payload: {
                sql: 'SELECT 1',
                dialect: 'PostgreSQL',
                options: { allowDialectFallback: false },
            },
        });

        expect(parseSqlMock).toHaveBeenCalledWith('SELECT 1', 'PostgreSQL', { allowDialectFallback: false });
        expect(postMessageMock).toHaveBeenCalledWith({
            type: 'parse',
            requestId: 7,
            result,
        });
    });

    it('dispatches batch parse requests to parseSqlBatch and posts the result', () => {
        loadWorkerModule();
        const batchResult = { queries: [], totalStats: {}, successCount: 0, errorCount: 0 };
        parseSqlBatchMock.mockReturnValue(batchResult);

        dispatchMessage({
            type: 'parseBatch',
            requestId: 11,
            payload: {
                sql: 'SELECT 1; SELECT 2;',
                dialect: 'MySQL',
                limits: { maxSqlSizeBytes: 1000, maxQueryCount: 2 },
                options: { includeLineage: false },
            },
        });

        expect(parseSqlBatchMock).toHaveBeenCalledWith(
            'SELECT 1; SELECT 2;',
            'MySQL',
            { maxSqlSizeBytes: 1000, maxQueryCount: 2 },
            { includeLineage: false }
        );
        expect(postMessageMock).toHaveBeenCalledWith({
            type: 'parseBatch',
            requestId: 11,
            result: batchResult,
        });
    });

    it('dispatches validate requests to validateSql with explicit limits', () => {
        loadWorkerModule();
        const validationResult = { type: 'size_limit', message: 'too large', details: { actual: 999 } };
        validateSqlMock.mockReturnValue(validationResult);

        dispatchMessage({
            type: 'validate',
            requestId: 13,
            payload: {
                sql: 'SELECT * FROM large_table',
                maxSizeBytes: 2048,
                maxQueryCount: 4,
            },
        });

        expect(validateSqlMock).toHaveBeenCalledWith('SELECT * FROM large_table', {
            maxSqlSizeBytes: 2048,
            maxQueryCount: 4,
        });
        expect(postMessageMock).toHaveBeenCalledWith({
            type: 'validate',
            requestId: 13,
            result: validationResult,
        });
    });

    it('uses default validation limits when validate payload omits them', () => {
        loadWorkerModule();
        validateSqlMock.mockReturnValue(null);

        dispatchMessage({
            type: 'validate',
            requestId: 14,
            payload: {
                sql: 'SELECT 1',
            },
        });

        expect(validateSqlMock).toHaveBeenCalledWith('SELECT 1', DEFAULT_VALIDATION_LIMITS);
        expect(postMessageMock).toHaveBeenCalledWith({
            type: 'validate',
            requestId: 14,
            result: null,
        });
    });

    it('posts an error response when parser work throws', () => {
        loadWorkerModule();
        parseSqlMock.mockImplementation(() => {
            throw new Error('parse failed');
        });

        dispatchMessage({
            type: 'parse',
            requestId: 21,
            payload: {
                sql: 'SELECT broken',
            },
        });

        expect(postMessageMock).toHaveBeenCalledWith({
            type: 'error',
            requestId: 21,
            error: 'parse failed',
        });
    });

    it('posts an error response for unsupported message types', () => {
        loadWorkerModule();

        dispatchMessage({
            type: 'unknown',
            requestId: 34,
            payload: {},
        });

        expect(postMessageMock).toHaveBeenCalledWith({
            type: 'error',
            requestId: 34,
            error: 'Unsupported parser worker message type: unknown',
        });
    });
});
