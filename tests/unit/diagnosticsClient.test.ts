import { EventEmitter } from 'events';
import type { Worker } from 'worker_threads';
import { DiagnosticsClient } from '../../src/diagnosticsClient';

class FakeWorker extends EventEmitter {
    ref = jest.fn();
    unref = jest.fn();
    terminate = jest.fn().mockResolvedValue(0);
    postMessage = jest.fn();
}

const request = { sql: 'SELECT * FROM orders', dialect: 'MySQL' as const, limits: { maxSqlSizeBytes: 102400, maxQueryCount: 50 }, options: {} };
const result = { queries: [], parseErrors: [] };

describe('Problems parser isolation', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    it('queues documents behind one worker and reuses it after a successful parse', async () => {
        const worker = new FakeWorker();
        const factory = jest.fn(() => worker as unknown as Worker);
        const client = new DiagnosticsClient(factory);
        const first = client.analyze('one.sql', request);
        const second = client.analyze('two.sql', request);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        worker.emit('message', { result });
        await expect(first).resolves.toEqual(result);
        expect(worker.postMessage).toHaveBeenCalledTimes(2);
        worker.emit('message', { result });
        await expect(second).resolves.toEqual(result);
        client.dispose();
    });

    it('accepts successful batches that omit the optional parseErrors array', async () => {
        const worker = new FakeWorker();
        const client = new DiagnosticsClient(() => worker as unknown as Worker);
        const pending = client.analyze('one.sql', request);
        worker.emit('message', { result: { queries: [] } });
        await expect(pending).resolves.toEqual({ queries: [] });
        client.dispose();
    });

    it('replaces a queued document with its latest text without skipping other documents', async () => {
        const worker = new FakeWorker();
        const client = new DiagnosticsClient(() => worker as unknown as Worker);
        const first = client.analyze('one.sql', request);
        const outdated = client.analyze('two.sql', request);
        const replaced = expect(outdated).rejects.toThrow('superseded');
        const latest = client.analyze('two.sql', { ...request, sql: 'SELECT id FROM orders' });
        await replaced;
        worker.emit('message', { result });
        await first;
        expect(worker.postMessage.mock.calls[1][0].sql).toBe('SELECT id FROM orders');
        worker.emit('message', { result });
        await latest;
        client.dispose();
    });

    it('terminates a cancelled parse, advances the queue and ignores a late reply', async () => {
        const first = new FakeWorker();
        const second = new FakeWorker();
        const client = new DiagnosticsClient(jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second));
        const pending = client.analyze('one.sql', request);
        const cancelled = expect(pending).rejects.toThrow('cancelled');
        const next = client.analyze('two.sql', request);
        client.cancel('one.sql');
        await cancelled;
        expect(first.terminate).toHaveBeenCalledTimes(1);
        first.emit('message', { result: { ...result, queries: ['stale'] } });
        second.emit('message', { result });
        await expect(next).resolves.toEqual(result);
        client.dispose();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('enforces the configured deadline and continues with a fresh worker', async () => {
        const first = new FakeWorker();
        const second = new FakeWorker();
        const client = new DiagnosticsClient(jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second));
        const pending = client.analyze('one.sql', { ...request, parseTimeoutMs: 100 });
        const timeout = expect(pending).rejects.toThrow('timed out');
        const next = client.analyze('two.sql', request);
        jest.advanceTimersByTime(100);
        await timeout;
        expect(first.terminate).toHaveBeenCalledTimes(1);
        second.emit('message', { result });
        await next;
        client.dispose();
    });

    it('rejects all queued work on disposal and refuses future requests', async () => {
        const worker = new FakeWorker();
        const client = new DiagnosticsClient(() => worker as unknown as Worker);
        const first = expect(client.analyze('one.sql', request)).rejects.toThrow('cancelled');
        const second = expect(client.analyze('two.sql', request)).rejects.toThrow('cancelled');
        client.dispose();
        await Promise.all([first, second]);
        await expect(client.analyze('three.sql', request)).rejects.toThrow('cancelled');
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    it('retires idle workers and handles errors after a completed request', async () => {
        const worker = new FakeWorker();
        const client = new DiagnosticsClient(() => worker as unknown as Worker);
        const pending = client.analyze('one.sql', request);
        worker.emit('message', { result });
        await pending;
        expect(() => worker.emit('error', new Error('idle worker failed'))).not.toThrow();
        expect(worker.terminate).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
        client.dispose();
    });

    it('replaces a parser that exits unexpectedly without wedging queued work', async () => {
        const first = new FakeWorker();
        const second = new FakeWorker();
        const client = new DiagnosticsClient(jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second));
        const failed = expect(client.analyze('one.sql', request)).rejects.toThrow('exited');
        const next = client.analyze('two.sql', request);
        first.emit('exit', 1);
        await failed;
        second.emit('message', { result });
        await next;
        jest.advanceTimersByTime(30_000);
        expect(second.terminate).toHaveBeenCalledTimes(1);
        client.dispose();
    });
});
