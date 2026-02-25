import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAsync, parseBatchAsync } from '../../../src/webview/parserClient';

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

    it.todo('preserves non-empty tableUsage data across worker boundary for single-query parse results');
    it.todo('preserves non-empty tableUsage data across worker boundary for batch parse results');
    it.todo('cancels in-flight parseAsync work when a newer parseAsync request starts');
    it.todo('cancels in-flight parseBatchAsync work when a newer parseBatchAsync request starts');
    it.todo('timeouts terminate the parser worker and respawn a clean worker');
    it.todo('compare-mode baseline parse cannot overwrite a newer interaction state');
    it.todo('pinned-tab restore parse flow is cancellation-safe during rapid refresh/switch');
});
