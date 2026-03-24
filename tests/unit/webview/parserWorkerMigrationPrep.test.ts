import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAsync, parseBatchAsync, terminateWorker } from '../../../src/webview/parserClient';

describe('parser worker migration prep', () => {
    const indexSource = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');
    const getUsageSize = (value: unknown): number => {
        if (value instanceof Map) {
            return value.size;
        }
        if (value && typeof value === 'object') {
            return Object.keys(value as Record<string, unknown>).length;
        }
        return 0;
    };

    class MockWorker {
        public readonly postMessage = jest.fn();
        public readonly terminate = jest.fn();
        private readonly listeners = new Map<string, Set<(event: any) => void>>();

        addEventListener(type: string, handler: (event: any) => void): void {
            if (!this.listeners.has(type)) {
                this.listeners.set(type, new Set());
            }
            this.listeners.get(type)!.add(handler);
        }

        removeEventListener(type: string, handler: (event: any) => void): void {
            this.listeners.get(type)?.delete(handler);
        }

        emitMessage(data: unknown): void {
            this.listeners.get('message')?.forEach(handler => handler({ data }));
        }
    }

    function installWorkerEnvironment() {
        const workerInstances: MockWorker[] = [];
        const WorkerMock = jest.fn(() => {
            const worker = new MockWorker();
            workerInstances.push(worker);
            return worker as unknown as Worker;
        });

        const workerWindow = {
            parserWorkerUri: 'vscode-webview://unit-test/parser.worker.js',
            sqlCrackConfig: {
                parserWorkerUri: 'vscode-webview://unit-test/parser.worker.js',
            },
        };

        (global as Record<string, unknown>).window = workerWindow;
        (globalThis as Record<string, unknown>).window = workerWindow;
        (global as Record<string, unknown>).Worker = WorkerMock;
        (globalThis as Record<string, unknown>).Worker = WorkerMock;

        return { WorkerMock, workerInstances };
    }

    afterEach(() => {
        terminateWorker();
        delete (global as Record<string, unknown>).window;
        delete (global as Record<string, unknown>).Worker;
        delete (globalThis as Record<string, unknown>).window;
        delete (globalThis as Record<string, unknown>).Worker;
    });

    it('keeps request-id stale result guards in visualize flow', () => {
        expect(indexSource).toContain('const requestId = ++parseRequestId;');
        const staleGuards = indexSource.match(/requestId !== parseRequestId/g) || [];
        expect(staleGuards.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps parse-token guard for deferred hydration flow', () => {
        expect(indexSource).toContain('const parseToken = parseRequestId;');
        expect(indexSource).toContain('parseToken !== parseRequestId');
    });

    it('ensures single-query parse results remain structured-clone compatible', async () => {
        if (typeof structuredClone !== 'function') {
            return;
        }

        const result = await parseAsync('SELECT id FROM users', 'MySQL');
        const cloned = structuredClone(result);

        expect(Array.isArray(cloned.nodes)).toBe(true);
        expect(Array.isArray(cloned.edges)).toBe(true);
        expect(cloned).toHaveProperty('tableUsage');
        expect(getUsageSize(cloned.tableUsage)).toBeGreaterThanOrEqual(0);
    });

    it('ensures batch parse results remain structured-clone compatible', async () => {
        if (typeof structuredClone !== 'function') {
            return;
        }

        const result = await parseBatchAsync('SELECT id FROM users; SELECT 2;', 'MySQL');
        const cloned = structuredClone(result);

        expect(Array.isArray(cloned.queries)).toBe(true);
        expect(cloned.queries.length).toBeGreaterThan(0);
        expect(cloned.queries[0]).toHaveProperty('tableUsage');
        expect(getUsageSize(cloned.queries[0].tableUsage)).toBeGreaterThanOrEqual(0);
    });

    it('preserves non-empty tableUsage data across worker boundary for single-query parse results', async () => {
        jest.useFakeTimers();
        try {
            const { workerInstances } = installWorkerEnvironment();
            const pending = parseAsync('SELECT * FROM users', 'MySQL');

            jest.advanceTimersByTime(0);
            await Promise.resolve();

            const worker = workerInstances[0];
            const request = worker.postMessage.mock.calls[0][0];
            worker.emitMessage({
                type: 'parse',
                requestId: request.requestId,
                result: {
                    nodes: [],
                    edges: [],
                    stats: { tables: 2, joins: 0, subqueries: 0, ctes: 0, aggregations: 0, windowFunctions: 0, unions: 0, conditions: 0, complexity: 'Simple', complexityScore: 0 },
                    hints: [],
                    sql: 'SELECT * FROM users',
                    columnLineage: [],
                    tableUsage: new Map([['users', 1], ['orders', 2]]),
                },
            });

            const result = await pending;
            expect(result.tableUsage).toBeInstanceOf(Map);
            expect(result.tableUsage.get('users')).toBe(1);
            expect(result.tableUsage.get('orders')).toBe(2);
        } finally {
            jest.useRealTimers();
        }
    });

    it('preserves non-empty tableUsage data across worker boundary for batch parse results', async () => {
        jest.useFakeTimers();
        try {
            const { workerInstances } = installWorkerEnvironment();
            const pending = parseBatchAsync('SELECT * FROM users; SELECT * FROM orders;', 'MySQL');

            jest.advanceTimersByTime(0);
            await Promise.resolve();

            const worker = workerInstances[0];
            const request = worker.postMessage.mock.calls[0][0];
            worker.emitMessage({
                type: 'parseBatch',
                requestId: request.requestId,
                result: {
                    queries: [
                        {
                            nodes: [],
                            edges: [],
                            stats: { tables: 1, joins: 0, subqueries: 0, ctes: 0, aggregations: 0, windowFunctions: 0, unions: 0, conditions: 0, complexity: 'Simple', complexityScore: 0 },
                            hints: [],
                            sql: 'SELECT * FROM users',
                            columnLineage: [],
                            tableUsage: new Map([['users', 1]]),
                        },
                        {
                            nodes: [],
                            edges: [],
                            stats: { tables: 1, joins: 0, subqueries: 0, ctes: 0, aggregations: 0, windowFunctions: 0, unions: 0, conditions: 0, complexity: 'Simple', complexityScore: 0 },
                            hints: [],
                            sql: 'SELECT * FROM orders',
                            columnLineage: [],
                            tableUsage: new Map([['orders', 1]]),
                        },
                    ],
                    totalStats: { tables: 2, joins: 0, subqueries: 0, ctes: 0, aggregations: 0, windowFunctions: 0, unions: 0, conditions: 0, complexity: 'Simple', complexityScore: 0 },
                    successCount: 2,
                    errorCount: 0,
                },
            });

            const result = await pending;
            expect(result.queries[0]?.tableUsage).toBeInstanceOf(Map);
            expect(result.queries[0]?.tableUsage.get('users')).toBe(1);
            expect(result.queries[1]?.tableUsage.get('orders')).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });
    it('cancels queued parseAsync work when a newer parseAsync request starts', async () => {
        jest.useFakeTimers();
        try {
            const olderParse = parseAsync('SELECT 1', 'MySQL');
            const newerParse = parseAsync('SELECT 2', 'MySQL');

            jest.runOnlyPendingTimers();

            const [olderResult, newerResult] = await Promise.all([olderParse, newerParse]);

            expect(olderResult.error).toBe('Parse cancelled');
            expect(newerResult.error).toBeUndefined();
        } finally {
            jest.useRealTimers();
        }
    });

    it('cancels queued parseBatchAsync work when a newer parseBatchAsync request starts', async () => {
        jest.useFakeTimers();
        try {
            const olderParse = parseBatchAsync('SELECT 1;', 'MySQL');
            const newerParse = parseBatchAsync('SELECT 2; SELECT 3;', 'MySQL');

            jest.runOnlyPendingTimers();

            const [olderResult, newerResult] = await Promise.all([olderParse, newerParse]);

            expect(olderResult.queries[0]?.error).toBe('Parse cancelled');
            expect(newerResult.queries[0]?.error).toBeUndefined();
        } finally {
            jest.useRealTimers();
        }
    });
    it('timeouts terminate the parser worker and respawn a clean worker', async () => {
        jest.useFakeTimers();
        try {
            const { workerInstances } = installWorkerEnvironment();

            const firstPending = parseAsync('SELECT * FROM timed_out_query', 'MySQL');
            jest.advanceTimersByTime(0);
            await Promise.resolve();

            expect(workerInstances).toHaveLength(1);
            const firstWorker = workerInstances[0];

            jest.advanceTimersByTime(5000);
            await Promise.resolve();

            const fallbackResult = await firstPending;
            expect(firstWorker.terminate).toHaveBeenCalled();
            expect(fallbackResult).toBeDefined();

            const secondPending = parseAsync('SELECT * FROM users', 'MySQL');
            jest.advanceTimersByTime(0);
            await Promise.resolve();

            expect(workerInstances).toHaveLength(2);
            const secondWorker = workerInstances[1];
            const request = secondWorker.postMessage.mock.calls[0][0];
            secondWorker.emitMessage({
                type: 'parse',
                requestId: request.requestId,
                result: {
                    nodes: [],
                    edges: [],
                    stats: { tables: 1, joins: 0, subqueries: 0, ctes: 0, aggregations: 0, windowFunctions: 0, unions: 0, conditions: 0, complexity: 'Simple', complexityScore: 0 },
                    hints: [],
                    sql: 'SELECT * FROM users',
                    columnLineage: [],
                    tableUsage: new Map([['users', 1]]),
                },
            });

            const secondResult = await secondPending;
            expect(secondResult.tableUsage.get('users')).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });
    it('compare-mode baseline parse cannot overwrite a newer interaction state', () => {
        expect(indexSource).toContain('const compareToken = parseRequestId;');
        expect(indexSource).toContain('const compareQueryIndex = currentQueryIndex;');
        expect(indexSource).toContain('const baselineResult = await parseAsync(baseline.sql, baseline.dialect, {');
        expect(indexSource).toContain('compareToken !== parseRequestId || currentQueryIndex !== compareQueryIndex');
    });

    it('pinned-tab restore parse flow is cancellation-safe during rapid refresh/switch', () => {
        expect(indexSource).toContain('await switchToQueryIndex(targetIndex);');
        expect(indexSource).toContain('const hydrateToken = parseRequestId;');
        expect(indexSource).toContain('if (batchResult && parseRequestId === hydrateToken) {');
        expect(indexSource).toContain('if (currentQueryIndex !== newIndex) {');
        expect(indexSource).toContain('if (requestId !== parseRequestId) {');
    });
});
