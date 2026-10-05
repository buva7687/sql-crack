import { EventEmitter } from 'events';
import type { Worker } from 'worker_threads';
import { WorkspaceAnalysisClient } from '../../../src/workspace/analysisClient';

class FakeWorker extends EventEmitter {
    ref = jest.fn();
    unref = jest.fn();
    terminate = jest.fn().mockResolvedValue(0);
    postMessage = jest.fn();
}
describe('workspace parser isolation', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    it('terminates a timed-out parser and replaces it for the next file', async () => {
        const first = new FakeWorker();
        const second = new FakeWorker();
        const factory = jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
        const client = new WorkspaceAnalysisClient(factory, 100);
        const pending = client.analyze('SELECT 1', 'one.sql', 'MySQL');
        const assertion = expect(pending).rejects.toThrow('exceeded');
        jest.advanceTimersByTime(101);
        await assertion;
        expect(first.terminate).toHaveBeenCalledTimes(1);
        const next = client.analyze('SELECT 2', 'two.sql', 'MySQL');
        second.emit('message', {result: {definitions: [], references: [], queries: [], warnings: []}});
        await expect(next).resolves.toHaveProperty('references', []);
        client.dispose();
    });
    it('terminates parsing when the workspace scan is cancelled', async () => {
        const worker = new FakeWorker();
        const client = new WorkspaceAnalysisClient(() => worker as unknown as Worker);
        const token = {isCancellationRequested: false};
        const pending = client.analyze('SELECT 1', 'one.sql', 'MySQL', token);
        const assertion = expect(pending).rejects.toThrow('cancelled');
        token.isCancellationRequested = true;
        jest.advanceTimersByTime(50);
        await assertion;
        expect(worker.terminate).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
        client.dispose();
    });
});
