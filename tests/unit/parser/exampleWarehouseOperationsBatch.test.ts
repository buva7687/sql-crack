import { readFileSync } from 'fs';
import { join } from 'path';
import { detectDialect } from '../../../src/webview/parser/dialects/detection';
import { parseSqlBatch } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types';

describe('ddl-warehouse-operations example batch parsing', () => {
    const sql = readFileSync(join(__dirname, '../../../examples/ddl-warehouse-operations.sql'), 'utf8');

    it('keeps the Q8 DROP TABLE statement renderable under autodetected entry dialect', () => {
        const detection = detectDialect(sql);
        const dialect = (detection.confidence === 'high' ? detection.dialect : 'MySQL') as SqlDialect;
        const result = parseSqlBatch(sql, dialect, undefined, { combineDdlStatements: false });
        const q8 = result.queries[7];

        expect(q8).toBeDefined();
        expect(q8?.error).toBeUndefined();
        expect(q8?.nodes.length).toBeGreaterThan(0);
        expect(q8?.nodes[0]?.label).toContain('DROP');
    });
});
