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
    let setParseTimeoutMock: jest.Mock;

    function loadWorkerModule(): void {
        jest.resetModules();

        parseSqlMock = jest.fn();
        parseSqlBatchMock = jest.fn();
        setParseTimeoutMock = jest.fn();

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
            setParseTimeout: setParseTimeoutMock,
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

        expect(postMessageMock).toHaveBeenNthCalledWith(1, { type: 'started', requestId: 7 });
        expect(parseSqlMock).toHaveBeenCalledWith('SELECT 1', 'PostgreSQL', { allowDialectFallback: false });
        expect(postMessageMock).toHaveBeenCalledWith({
            type: 'parse',
            requestId: 7,
            result,
        });
    });

    it('applies the configured parse timeout before parsing in the worker realm', () => {
        loadWorkerModule();
        parseSqlBatchMock.mockImplementation(() => {
            expect(setParseTimeoutMock).toHaveBeenCalledWith(30000);
            return { queries: [], totalStats: {}, successCount: 0, errorCount: 0 };
        });

        dispatchMessage({
            type: 'parseBatch',
            requestId: 12,
            payload: { sql: 'SELECT 1;', dialect: 'MySQL', parseTimeoutMs: 30000 },
        });

        expect(parseSqlBatchMock).toHaveBeenCalledTimes(1);
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

    it('ignores obsolete standalone validation requests', () => {
        loadWorkerModule();
        dispatchMessage({ type: 'validate', requestId: 13, payload: { sql: 'SELECT 1;' } });

        expect(parseSqlMock).not.toHaveBeenCalled();
        expect(parseSqlBatchMock).not.toHaveBeenCalled();
        expect(postMessageMock).toHaveBeenCalledWith({
            type: 'error', requestId: 13, error: 'Unsupported parser worker message type: validate',
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
