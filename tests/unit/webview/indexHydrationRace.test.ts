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

describe('webview refresh query state (H11, M15)', () => {
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

    const bootWebview = () => {
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
        const ui = {
            updateBatchTabs: jest.fn(),
            updateErrorBadge: jest.fn(),
            createToolbar: jest.fn(() => ({ cleanup: jest.fn() })),
            isCompareViewActive: jest.fn(() => false),
            showCompareView: jest.fn(),
        };
        jest.doMock('../../../src/webview/ui', () => proxyModule(ui));
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
        const toolbarCallbacks = () => (ui.createToolbar.mock.calls[0] as unknown[] | undefined)?.[1] as any;
        return { batchCalls, render, send, settle, ui, toolbarCallbacks };
    };

    it('does not write a hydration started before the refreshed result into that result', async () => {
        const { batchCalls, render, send, settle } = bootWebview();
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

        // 4. Result B keeps query 2 active. Re-opening it after the stale
        //    hydration settled must still show B's statement, not A's.
        send({ command: 'switchToQuery', queryIndex: 0 });
        await settle();
        send({ command: 'switchToQuery', queryIndex: 1 });
        await settle();
        const hydrationOfB = batchCalls.find(call => call.sql === 'SELECT b1 FROM t;');
        if (hydrationOfB) {
            hydrationOfB.result.resolve({ ...makeBatch('b1-hydrated', 1), queries: [makeQuery('SELECT b1 FROM t;')] });
            await settle();
        }

        const lastRendered = render.mock.calls[render.mock.calls.length - 1]?.[0];
        expect(lastRendered?.sql).toBe('SELECT b1 FROM t;');
        expect(render.mock.calls.some(([result]) => result?.sql === 'SELECT a1 FROM t;')).toBe(false);
    });

    it('keeps the selected query across refreshes of the same document and resets for another (M15)', async () => {
        const { batchCalls, render, send, settle } = bootWebview();
        const refresh = async (sql: string, documentKey: string, prefix: string, count: number) => {
            send({ command: 'refresh', sql, options: { dialect: 'MySQL', fileName: 'q.sql' }, documentKey });
            await settle();
            batchCalls.filter(call => call.sql === sql).pop()!.result.resolve(makeBatch(prefix, count));
            await settle();
        };
        const lastRenderedSql = () => render.mock.calls[render.mock.calls.length - 1]?.[0]?.sql;

        await refresh('v1', 'file:///a.sql', 'v1_', 4);
        send({ command: 'switchToQuery', queryIndex: 2 });
        await settle();
        expect(lastRenderedSql()).toBe('SELECT v1_2 FROM t;');

        // Editing the same document (auto-refresh) stays on Q3.
        await refresh('v2', 'file:///a.sql', 'v2_', 4);
        expect(lastRenderedSql()).toBe('SELECT v2_2 FROM t;');

        // Removing statements clamps to the last remaining query.
        await refresh('v3', 'file:///a.sql', 'v3_', 2);
        expect(lastRenderedSql()).toBe('SELECT v3_1 FROM t;');

        // A different document starts at Q1.
        await refresh('other', 'file:///b.sql', 'b_', 4);
        expect(lastRenderedSql()).toBe('SELECT b_0 FROM t;');
    });

    it('uses pins created after page load as the Compare baseline (M11)', async () => {
        const { batchCalls, send, settle, ui, toolbarCallbacks } = bootWebview();
        (global as any).alert = jest.fn();
        send({ command: 'refresh', sql: 'one', options: { dialect: 'MySQL', fileName: 'q.sql' }, documentKey: 'file:///q.sql' });
        await settle();
        batchCalls[0].result.resolve(makeBatch('cur', 1));
        await settle();

        send({
            command: 'pinCreated',
            pinId: 'pin-1',
            pinnedTabs: [{ id: 'pin-1', name: 'Earlier', sql: 'SELECT pinned FROM t;', dialect: 'MySQL', timestamp: 1 }],
        });
        toolbarCallbacks().onToggleCompareMode();
        await settle();

        expect((global as any).alert).not.toHaveBeenCalled();
        expect(ui.showCompareView).toHaveBeenCalledWith(expect.objectContaining({
            left: expect.objectContaining({ label: 'Pinned • Earlier' }),
        }));

        // After unpinning, that pin is no longer offered as a baseline.
        ui.showCompareView.mockClear();
        send({ command: 'viewLocationOptions', currentLocation: 'tab', pinnedTabs: [] });
        toolbarCallbacks().onToggleCompareMode();
        await settle();
        expect(ui.showCompareView).not.toHaveBeenCalled();
        expect((global as any).alert).toHaveBeenCalled();
        delete (global as any).alert;
    });

    it('keeps the last requested query when a joined hydration settles late (A1 follow-up)', async () => {
        for (const finalIndex of [0, 2]) {
            const { batchCalls, render, send, settle } = bootWebview();
            send({ command: 'refresh', sql: 'A', options: { dialect: 'MySQL', fileName: 'big.sql' } });
            await settle();
            batchCalls[0].result.resolve(makeBatch('a', 60));
            await settle();
            const hydrate = (sql: string) => batchCalls.find(call => call.sql === sql)!.result
                .resolve({ ...makeBatch('h', 1), queries: [makeQuery(sql)] });

            // Q2 starts hydrating, the user goes Q1 -> Q2 (joins) -> final.
            for (const index of [1, 0, 1, finalIndex]) {
                send({ command: 'switchToQuery', queryIndex: index });
                await settle();
            }
            if (finalIndex === 2) {
                hydrate('SELECT a2 FROM t;');
                await settle();
            }
            hydrate('SELECT a1 FROM t;');
            await settle();

            const lastRendered = render.mock.calls[render.mock.calls.length - 1]?.[0];
            expect(lastRendered?.sql).toBe(`SELECT a${finalIndex} FROM t;`);
            jest.resetModules();
        }
    });

    it('still renders a re-requested query whose hydration was joined (A1)', async () => {
        const { batchCalls, render, send, settle } = bootWebview();
        send({ command: 'refresh', sql: 'A', options: { dialect: 'MySQL', fileName: 'big.sql' } });
        await settle();
        batchCalls[0].result.resolve(makeBatch('a', 60));
        await settle();
        for (const index of [1, 0, 1]) {
            send({ command: 'switchToQuery', queryIndex: index });
            await settle();
        }
        batchCalls.find(call => call.sql === 'SELECT a1 FROM t;')!.result
            .resolve({ ...makeBatch('h', 1), queries: [makeQuery('SELECT a1 FROM t;')] });
        await settle();

        expect(render.mock.calls[render.mock.calls.length - 1]?.[0]?.sql).toBe('SELECT a1 FROM t;');
    });

    it('hides stale query tabs when a refresh parses zero statements (S4)', async () => {
        const { batchCalls, send, settle, ui } = bootWebview();
        send({ command: 'refresh', sql: 'three', options: { dialect: 'MySQL', fileName: 'q.sql' }, documentKey: 'file:///q.sql' });
        await settle();
        batchCalls[0].result.resolve(makeBatch('q', 3));
        await settle();
        send({ command: 'switchToQuery', queryIndex: 2 });
        await settle();

        send({ command: 'refresh', sql: '-- c\n;', options: { dialect: 'MySQL', fileName: 'q.sql' }, documentKey: 'file:///q.sql' });
        await settle();
        batchCalls[batchCalls.length - 1].result.resolve({ ...makeBatch('none', 0), successCount: 0 });
        await settle();

        const [lastBatch, lastIndex] = ui.updateBatchTabs.mock.calls[ui.updateBatchTabs.mock.calls.length - 1];
        expect(lastBatch.queries).toHaveLength(0);
        expect(lastIndex).toBe(0);
    });

    it('opens Compare against the hydrated query, not its loading placeholder (S5)', async () => {
        const { batchCalls, send, settle, ui, toolbarCallbacks } = bootWebview();
        send({ command: 'refresh', sql: 'A', options: { dialect: 'MySQL', fileName: 'big.sql' }, documentKey: 'file:///big.sql' });
        await settle();
        batchCalls[0].result.resolve(makeBatch('a', 60));
        await settle();
        send({
            command: 'pinCreated',
            pinId: 'pin-1',
            pinnedTabs: [{ id: 'pin-1', name: 'Earlier', sql: 'SELECT pinned FROM t;', dialect: 'MySQL', timestamp: 1 }],
        });

        send({ command: 'switchToQuery', queryIndex: 5 });
        await settle();
        toolbarCallbacks().onToggleCompareMode();
        await settle();
        expect(ui.showCompareView).not.toHaveBeenCalled();

        batchCalls.find(call => call.sql === 'SELECT a5 FROM t;')!.result
            .resolve({ ...makeBatch('h', 1), queries: [makeQuery('SELECT a5 FROM t;')] });
        await settle();

        expect(ui.showCompareView).toHaveBeenCalledTimes(1);
        const { right } = ui.showCompareView.mock.calls[0][0];
        expect(right.result.sql).toBe('SELECT a5 FROM t;');
        expect(right.result.nodes).toHaveLength(1);
    });

    it('counts a query that recovery turns into an error as failed (S6)', async () => {
        const { batchCalls, send, settle, ui } = bootWebview();
        const batch = makeBatch('q', 3);
        batch.queries[1] = { ...makeQuery('SET NOCOUNT ON;'), nodes: [] };
        send({ command: 'refresh', sql: 'three', options: { dialect: 'MySQL', fileName: 'q.sql' }, documentKey: 'file:///q.sql' });
        await settle();
        batchCalls[0].result.resolve(batch);
        await settle();
        expect(ui.updateErrorBadge).not.toHaveBeenCalled();

        // Opening the empty query starts recovery; the re-parse fails.
        send({ command: 'switchToQuery', queryIndex: 1 });
        await settle();
        batchCalls.find(call => call.sql === 'SET NOCOUNT ON;')!.result.resolve({
            ...makeBatch('r', 1),
            queries: [{ ...makeQuery('SET NOCOUNT ON;'), nodes: [], error: 'Unsupported statement' }],
            errorCount: 1,
            successCount: 0,
        });
        await settle();

        const [lastBatch] = ui.updateBatchTabs.mock.calls[ui.updateBatchTabs.mock.calls.length - 1];
        expect(lastBatch.errorCount).toBe(1);
        expect(lastBatch.successCount).toBe(2);
        expect(lastBatch.parseErrors).toEqual([expect.objectContaining({ queryIndex: 1, message: 'Unsupported statement' })]);
        expect(ui.updateErrorBadge).toHaveBeenLastCalledWith(1, [expect.objectContaining({ queryIndex: 1 })]);
    });
});
