import { parentPort } from 'worker_threads';
import { setCustomFunctions } from './dialects';
import { parseSqlBatch, setParseTimeout } from './webview/sqlParser';
import type { DiagnosticsRequest } from './diagnosticsClient';

parentPort?.on('message', (request: DiagnosticsRequest) => {
    try {
        setCustomFunctions(request.customAggregateFunctions || [], request.customWindowFunctions || []);
        setParseTimeout(request.parseTimeoutMs ?? 10_000);
        const result = parseSqlBatch(request.sql, request.dialect, request.limits, request.options);
        parentPort?.postMessage({ result });
    } catch (error) {
        parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
});
