/**
 * H11 regression: a deferred query hydrated while a refresh is still parsing
 * must not be written into the refreshed batch result.
 *
 * Drives the real webview entry module (src/webview/index.ts) through host
 * messages with the parser client, renderer, and UI modules mocked.
 */

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { promise, resolve };
}

function proxyModule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const cache: Record<string | symbol, unknown> = { __esModule: true, ...overrides };
    return new Proxy(cache, {
        get(target, property) {
            if (!(property in target)) {
                target[property] = jest.fn();
            }
            return target[property];
        },
    });
}

function createFakeElement(): any {
    const element: Record<string | symbol, unknown> = { style: {}, dataset: {}, children: [], value: '' };
    return new Proxy(element, {
        get(target, property) {
            if (!(property in target)) {
                target[property] = property === 'classList'
                    ? { add: jest.fn(), remove: jest.fn(), toggle: jest.fn(), contains: jest.fn(() => false) }
                    : jest.fn(() => createFakeElement());
            }
            return target[property];
        },
        set(target, property, value) {
            target[property] = value;
            return true;
        },
    });
}

const makeQuery = (sql: string) => ({
    sql,
    nodes: [{ id: `n:${sql}`, type: 'table', label: sql, x: 0, y: 0, width: 10, height: 10 }],
    edges: [],
    hints: [],
    stats: { tables: 1, joins: 0, subqueries: 0, ctes: 0, aggregations: 0, windowFunctions: 0, unions: 0, conditions: 0, complexity: 'Simple', complexityScore: 1 },
    columnLineage: [],
    columnFlows: [],
    tableUsage: new Map(),
});

const makeBatch = (prefix: string, count: number) => ({
    queries: Array.from({ length: count }, (_, index) => makeQuery(`SELECT ${prefix}${index} FROM t;`)),
    queryLineRanges: Array.from({ length: count }, (_, index) => ({ startLine: index + 1, endLine: index + 1 })),
    totalStats: makeQuery('').stats,
    successCount: count,
    errorCount: 0,
    parseErrors: [],
});

describe('webview deferred hydration during refresh (H11)', () => {
    const originalWindow = (global as any).window;
    const originalDocument = (global as any).document;
    const originalRequestAnimationFrame = (global as any).requestAnimationFrame;
    // Debounced webview timers must not fire after the fake window is removed.
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
    const trackedTimeout = (callback: () => void, ms?: number) => {
        const id = setTimeout(() => {
            pendingTimers.delete(id);
            callback();
        }, ms);
        pendingTimers.add(id);
        return id;
    };

    afterEach(() => {
        pendingTimers.forEach(id => clearTimeout(id));
        pendingTimers.clear();
        (global as any).requestAnimationFrame = originalRequestAnimationFrame;
        (global as any).window = originalWindow;
        (global as any).document = originalDocument;
        jest.resetModules();
    });

    it('does not write a hydration started before the refreshed result into that result', async () => {
        const batchCalls: Array<{ sql: string; result: Deferred<unknown> }> = [];
        const parseBatchAsync = jest.fn((sql: string) => {
            const result = deferred<unknown>();
            batchCalls.push({ sql, result });
            return result.promise;
        });
        const render = jest.fn();

        jest.doMock('../../../src/webview/parserClient', () => proxyModule({
            parseBatchAsync,
            parseAsync: jest.fn(() => Promise.resolve(makeQuery('baseline'))),
            isCancelledBatchParseResult: () => false,
        }));
        jest.doMock('../../../src/webview/renderer', () => proxyModule({
            render,
            getViewState: jest.fn(() => ({})),
            getCurrentLayout: jest.fn(() => 'vertical'),
            isDarkTheme: jest.fn(() => true),
        }));
        jest.doMock('../../../src/webview/ui', () => proxyModule({
            createToolbar: jest.fn(() => ({ cleanup: jest.fn() })),
            isCompareViewActive: jest.fn(() => false),
        }));
        jest.doMock('../../../src/webview/hintActions', () => proxyModule());
        jest.doMock('../../../src/webview/state/persistedViewState', () => proxyModule({
            readPersistedUiState: jest.fn(() => null),
        }));
        jest.doMock('../../../src/webview/minimapVisibility', () => proxyModule());

        let messageHandler: ((event: { data: unknown }) => void) | undefined;
        (global as any).document = {
            readyState: 'complete',
            getElementById: jest.fn(() => createFakeElement()),
            createElement: jest.fn(() => createFakeElement()),
            querySelector: jest.fn(() => null),
            querySelectorAll: jest.fn(() => []),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
            body: createFakeElement(),
            head: createFakeElement(),
            activeElement: null,
        };
        (global as any).window = {
            addEventListener: jest.fn((type: string, handler: (event: { data: unknown }) => void) => {
                if (type === 'message') {
                    messageHandler = handler;
                }
            }),
            removeEventListener: jest.fn(),
            setInterval: jest.fn(() => 1),
            clearInterval: jest.fn(),
            setTimeout: trackedTimeout,
            clearTimeout: (id: ReturnType<typeof setTimeout>) => {
                pendingTimers.delete(id);
                clearTimeout(id);
            },
            requestAnimationFrame: (callback: () => void) => trackedTimeout(callback, 0),
            vscodeApi: { postMessage: jest.fn(), getState: jest.fn(), setState: jest.fn() },
            initialSqlCode: '',
            sqlCrackConfig: { deferredQueryThreshold: 50, maxStatements: 500, maxFileSizeKB: 1024, parseTimeoutSeconds: 5 },
        };
        (global as any).requestAnimationFrame = (callback: () => void) => trackedTimeout(callback, 0);

        jest.isolateModules(() => {
            require('../../../src/webview/index');
        });
        expect(messageHandler).toBeDefined();

        const settle = async () => {
            for (let i = 0; i < 10; i++) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        };
        const send = (data: unknown) => messageHandler!({ data });
        const options = { dialect: 'MySQL', fileName: 'big.sql' };

        // 1. Initial result A: 60 statements, so queries 1..59 are compacted.
        send({ command: 'refresh', sql: 'A', options });
        await settle();
        batchCalls[0].result.resolve(makeBatch('a', 60));
        await settle();

        // 2. Start a refresh (result B) and, while it parses, open query 2.
        send({ command: 'refresh', sql: 'B', options });
        await settle();
        send({ command: 'switchToQuery', queryIndex: 1 });
        await settle();
        const hydrationOfA = batchCalls.find(call => call.sql === 'SELECT a1 FROM t;');
        expect(hydrationOfA).toBeDefined();

        // 3. The refresh finishes first, then the stale hydration of A settles.
        batchCalls.find(call => call.sql === 'B')!.result.resolve(makeBatch('b', 60));
        await settle();
        hydrationOfA!.result.resolve({ ...makeBatch('a1-hydrated', 1), queries: [makeQuery('SELECT a1 FROM t;')] });
        await settle();

        // 4. Opening query 2 of result B must hydrate B's statement, not show A's.
        send({ command: 'switchToQuery', queryIndex: 1 });
        await settle();
        const hydrationOfB = batchCalls.find(call => call.sql === 'SELECT b1 FROM t;');
        expect(hydrationOfB).toBeDefined();
        hydrationOfB!.result.resolve({ ...makeBatch('b1-hydrated', 1), queries: [makeQuery('SELECT b1 FROM t;')] });
        await settle();

        const lastRendered = render.mock.calls[render.mock.calls.length - 1]?.[0];
        expect(lastRendered?.sql).toBe('SELECT b1 FROM t;');
    });
});
