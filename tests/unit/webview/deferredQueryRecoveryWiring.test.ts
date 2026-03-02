import { readFileSync } from 'fs';
import { join } from 'path';

describe('deferred query recovery wiring', () => {
    const indexSource = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');

    it('recovers empty executable queries before rendering a blank-state error', () => {
        expect(indexSource).toContain('if (!query.error && query.nodes.length === 0 && hasExecutableSql(query.sql)) {');
        expect(indexSource).toContain('recoverQueryVisualization(currentQueryIndex);');
    });

    it('converts unrecoverable empty reparses into explicit query errors', () => {
        expect(indexSource).toContain('async function reparseStoredQuery(queryIndex: number, fallbackMessage: string): Promise<void>');
        expect(indexSource).toContain("hydratedQuery.nodes.length === 0 && hasExecutableSql(querySql)");
        expect(indexSource).toContain('buildFallbackQueryErrorResult(querySql, fallbackMessage)');
    });
});
