/**
 * The SQL Flow page and its extension files have different origins in VS Code,
 * so the parser worker has to be started from a fetched blob URL. Constructing
 * it from the resource URL throws a SecurityError and silently moved every
 * parse to the main thread (deep dive 2026-11-10, H1).
 */
const RESOURCE_URI = 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/parser.worker.js';

class MockWorker {
    postMessage = jest.fn();
    terminate = jest.fn();
    private listeners = new Map<string, Set<(event: any) => void>>();
    addEventListener(type: string, handler: (event: any) => void): void {
        if (!this.listeners.has(type)) { this.listeners.set(type, new Set()); }
        this.listeners.get(type)!.add(handler);
    }
    removeEventListener(type: string, handler: (event: any) => void): void {
        this.listeners.get(type)?.delete(handler);
    }
    emitMessage(data: unknown): void {
        this.listeners.get('message')?.forEach(handler => handler({ data }));
    }
}

describe('parser worker blob loading', () => {
    const globals = global as Record<string, unknown>;
    const saved = { window: globals.window, Worker: globals.Worker, fetch: globals.fetch, createObjectURL: URL.createObjectURL };
    let workerUrls: string[];
    let workers: MockWorker[];
    let fetchMock: jest.Mock;

    beforeEach(() => {
        jest.resetModules();
        workerUrls = [];
        workers = [];
        globals.window = {
            location: { href: 'vscode-webview://abc/index.html', origin: 'vscode-webview://abc' },
            sqlCrackConfig: { parserWorkerUri: RESOURCE_URI },
        };
        globals.Worker = jest.fn((url: string) => {
            workerUrls.push(url);
            const worker = new MockWorker();
            workers.push(worker);
            return worker;
        });
        fetchMock = jest.fn(async () => ({ ok: true, status: 200, text: async () => 'self.onmessage = () => {};' }));
        globals.fetch = fetchMock;
        URL.createObjectURL = jest.fn(() => 'blob:vscode-webview://abc/worker-script');
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        globals.window = saved.window;
        globals.Worker = saved.Worker;
        globals.fetch = saved.fetch;
        URL.createObjectURL = saved.createObjectURL;
        jest.restoreAllMocks();
    });

    const flush = async (): Promise<void> => {
        for (let i = 0; i < 20; i++) { await new Promise(resolve => setTimeout(resolve, 0)); }
    };

    const answer = (worker: MockWorker): void => {
        const request = worker.postMessage.mock.calls[worker.postMessage.mock.calls.length - 1][0];
        worker.emitMessage({
            type: 'parse',
            requestId: request.requestId,
            result: { nodes: [{ id: 'from-worker' }], edges: [], hints: [], sql: 'SELECT 1', columnLineage: [], tableUsage: new Map(), stats: {} },
        });
    };

    it('starts the worker from a blob URL and reuses the fetched script', async () => {
        const { parseAsync } = require('../../../src/webview/parserClient');

        const first = parseAsync('SELECT 1', 'MySQL');
        await flush();
        expect(fetchMock).toHaveBeenCalledWith(RESOURCE_URI);
        expect(workerUrls).toEqual(['blob:vscode-webview://abc/worker-script']);
        answer(workers[0]);
        expect((await first).nodes[0].id).toBe('from-worker');

        const second = parseAsync('SELECT 2', 'MySQL');
        await flush();
        answer(workers[workers.length - 1]);
        await second;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(workerUrls.every(url => url.startsWith('blob:'))).toBe(true);
    });

    it('parses on the main thread without retrying when the script cannot be fetched', async () => {
        fetchMock.mockImplementation(async () => { throw new Error('blocked'); });
        const { parseAsync } = require('../../../src/webview/parserClient');

        const first = await parseAsync('SELECT 1', 'MySQL');
        const second = await parseAsync('SELECT 2', 'MySQL');

        expect(first.nodes.length).toBeGreaterThan(0);
        expect(second.nodes.length).toBeGreaterThan(0);
        expect(workerUrls).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
