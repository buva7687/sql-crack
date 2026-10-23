import { Worker } from 'worker_threads';
import * as path from 'path';
import type { SqlDialect, SchemaDefinition, TableReference, QueryAnalysis } from './extraction/types';
import type { CancellationToken } from './types';

export interface WorkspaceAnalysisResult {
    definitions: SchemaDefinition[];
    references: TableReference[];
    queries: QueryAnalysis[];
    warnings: string[];
}
export class WorkspaceAnalysisError extends Error {}

/** Bounded parser workers keep CPU-heavy SQL analysis off the extension host. */
export class WorkspaceAnalysisClient {
    private idle: Worker[] = [];
    private active = new Set<Worker>();
    private idleTimers = new Map<Worker, ReturnType<typeof setTimeout>>();
    private disposed = false;
    constructor(
        private readonly createWorker = () => new Worker(path.join(__dirname, 'workspace.worker.js'), {resourceLimits: {maxOldGenerationSizeMb: 256}}),
        private readonly timeoutMs = 10_000
    ) {}

    analyze(sql: string, filePath: string, dialect: SqlDialect, token?: CancellationToken): Promise<WorkspaceAnalysisResult> {
        if (this.disposed || token?.isCancellationRequested) {
            return Promise.reject(new WorkspaceAnalysisError('Workspace analysis cancelled'));
        }
        return new Promise((resolve, reject) => {
            let worker: Worker;
            try {worker = this.idle.pop() || this.createWorker();}
            catch (error) {reject(new WorkspaceAnalysisError(error instanceof Error ? error.message : String(error))); return;}
            clearTimeout(this.idleTimers.get(worker));
            this.idleTimers.delete(worker);
            worker.ref();
            this.active.add(worker);
            let settled = false;
            const finish = (error?: Error, result?: WorkspaceAnalysisResult) => {
                if (settled) {return;}
                settled = true;
                this.active.delete(worker);
                clearTimeout(timeout);
                clearInterval(cancellation);
                worker.removeListener('message', onMessage);
                worker.removeListener('error', onError);
                worker.removeListener('exit', onExit);
                if (error) {
                    void worker.terminate();
                    reject(error);
                } else {
                    worker.unref();
                    if (this.idle.length < 4) {
                        this.idle.push(worker);
                        const retirement = setTimeout(() => {
                            this.idle = this.idle.filter(candidate => candidate !== worker);
                            this.idleTimers.delete(worker);
                            void worker.terminate();
                        }, 30_000);
                        retirement.unref();
                        this.idleTimers.set(worker, retirement);
                    }
                    else {void worker.terminate();}
                    resolve(result!);
                }
            };
            const onMessage = (message: { result?: WorkspaceAnalysisResult; error?: string }) => {
                finish(message.error ? new WorkspaceAnalysisError(message.error) : undefined, message.result);
            };
            const onError = (error: Error) => finish(new WorkspaceAnalysisError(error.message));
            const onExit = (code: number) => finish(new WorkspaceAnalysisError(`Workspace parser exited (${code})`));
            const timeout = setTimeout(() => finish(new WorkspaceAnalysisError(`Workspace analysis exceeded ${this.timeoutMs / 1000}s; file skipped`)), this.timeoutMs);
            const cancellation = setInterval(() => {
                if (token?.isCancellationRequested) {finish(new WorkspaceAnalysisError('Workspace analysis cancelled'));}
            }, 50);
            worker.once('message', onMessage);
            worker.once('error', onError);
            worker.once('exit', onExit);
            try {worker.postMessage({ sql, filePath, dialect });}
            catch (error) {finish(new WorkspaceAnalysisError(error instanceof Error ? error.message : String(error)));}
        });
    }

    dispose(): void {
        this.disposed = true;
        for (const timer of this.idleTimers.values()) {clearTimeout(timer);}
        this.idleTimers.clear();
        for (const worker of [...this.active, ...this.idle.splice(0)]) {void worker.terminate();}
    }
}
