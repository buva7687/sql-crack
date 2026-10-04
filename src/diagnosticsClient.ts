import { Worker } from 'worker_threads';
import * as path from 'path';
import type { BatchParseOptions } from './webview/sqlParser';
import type { BatchParseResult, SqlDialect, ValidationLimits } from './webview/types';

export interface DiagnosticsRequest {
    sql: string;
    dialect: SqlDialect;
    limits: ValidationLimits;
    options: BatchParseOptions;
    parseTimeoutMs?: number;
    customAggregateFunctions?: string[];
    customWindowFunctions?: string[];
}

interface Job {
    key: string;
    request: DiagnosticsRequest;
    resolve: (result: BatchParseResult) => void;
    reject: (error: Error) => void;
}

/** One reusable parser worker, with at most one pending parse per document. */
export class DiagnosticsClient {
    private worker: Worker | null = null;
    private active: Job | null = null;
    private pending = new Map<string, Job>();
    private deadline?: ReturnType<typeof setTimeout>;
    private retirement?: ReturnType<typeof setTimeout>;
    private disposed = false;

    constructor(
        private readonly createWorker = () => new Worker(path.join(__dirname, 'diagnostics.worker.js'), { resourceLimits: { maxOldGenerationSizeMb: 256 } }),
        private readonly timeoutMs = 10_000
    ) {}

    analyze(key: string, request: DiagnosticsRequest): Promise<BatchParseResult> {
        if (this.disposed) { return Promise.reject(new Error('Diagnostics cancelled')); }
        // Queue the replacement before cancelling so other documents keep their turn.
        const previous = this.pending.get(key);
        previous?.reject(new Error('Diagnostics superseded'));
        const promise = new Promise<BatchParseResult>((resolve, reject) => {
            this.pending.set(key, { key, request, resolve, reject });
        });
        if (this.active?.key === key) { this.finish(new Error('Diagnostics superseded')); }
        else { this.startNext(); }
        return promise;
    }

    cancel(key: string): void {
        this.pending.get(key)?.reject(new Error('Diagnostics cancelled'));
        this.pending.delete(key);
        if (this.active?.key === key) { this.finish(new Error('Diagnostics cancelled')); }
    }

    cancelAll(): void {
        for (const job of this.pending.values()) { job.reject(new Error('Diagnostics cancelled')); }
        this.pending.clear();
        if (this.active) { this.finish(new Error('Diagnostics cancelled')); }
        else { this.stopWorker(); }
    }

    dispose(): void {
        this.disposed = true;
        this.cancelAll();
    }

    private startNext(): void {
        if (this.disposed || this.active || !this.pending.size) { return; }
        clearTimeout(this.retirement);
        this.retirement = undefined;
        const job = this.pending.values().next().value as Job;
        this.pending.delete(job.key);
        this.active = job;
        try {
            if (!this.worker) {
                const worker = this.createWorker();
                this.worker = worker;
                worker.on('message', (message: { result?: BatchParseResult; error?: string }) => {
                    if (this.worker !== worker || !this.active) { return; }
                    if (message.error) { this.finish(new Error(message.error)); }
                    else if (message.result && Array.isArray(message.result.queries)
                        && (message.result.parseErrors === undefined || Array.isArray(message.result.parseErrors))) {
                        this.finish(undefined, message.result);
                    } else { this.finish(new Error('Invalid diagnostics parser response')); }
                });
                worker.on('error', (error: Error) => {
                    if (this.worker !== worker) { return; }
                    if (this.active) { this.finish(error); }
                    else { this.stopWorker(); }
                });
                worker.on('exit', (code: number) => {
                    if (this.worker !== worker) { return; }
                    if (this.active) { this.finish(new Error(`Diagnostics parser exited (${code})`)); }
                    else { this.stopWorker(); }
                });
            }
            this.worker.ref();
            const timeout = job.request.parseTimeoutMs ?? this.timeoutMs;
            this.deadline = setTimeout(() => this.finish(new Error('Diagnostics parsing timed out')), timeout);
            this.worker.postMessage(job.request);
        } catch (error) {
            this.finish(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private finish(error?: Error, result?: BatchParseResult): void {
        const job = this.active;
        if (!job) { return; }
        this.active = null;
        clearTimeout(this.deadline);
        this.deadline = undefined;
        if (error) {
            this.stopWorker();
            job.reject(error);
        } else {
            this.worker?.unref();
            job.resolve(result!);
            this.retirement = setTimeout(() => this.stopWorker(), 30_000);
            this.retirement.unref();
        }
        this.startNext();
    }

    private stopWorker(): void {
        clearTimeout(this.retirement);
        this.retirement = undefined;
        const worker = this.worker;
        this.worker = null;
        if (worker) { void worker.terminate(); }
    }
}
