import { ReferenceExtractor } from '../../../../src/workspace/extraction/referenceExtractor';

describe('ReferenceExtractor table line lookup performance', () => {
    it('parses large files one statement at a time instead of using the quadratic batch path', () => {
        const extractor = new ReferenceExtractor();
        const astifySpy = jest.spyOn((extractor as any).parser, 'astify');
        const sql = Array.from({ length: 200 }, (_, index) =>
            `SELECT id FROM table_${index};`
        ).join('\n');

        const refs = extractor.extractReferences(sql, 'large.sql', 'MySQL');

        expect(refs).toHaveLength(200);
        expect(astifySpy).toHaveBeenCalledTimes(200);
        expect(Math.max(...astifySpy.mock.calls.map(call => String(call[0]).length))).toBeLessThan(80);
    });

    it('builds the per-file table line lookup once for multiple AST references', () => {
        const extractor = new ReferenceExtractor();
        const buildLookupSpy = jest.spyOn(extractor as any, 'buildTableLineLookup');
        const sql = [
            'SELECT u.id, o.id, p.id',
            'FROM users u',
            'JOIN orders o ON o.user_id = u.id',
            'JOIN payments p ON p.order_id = o.id',
        ].join('\n');

        const refs = extractor.extractReferences(sql, 'report.sql', 'MySQL');

        expect(buildLookupSpy).toHaveBeenCalledTimes(1);
        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 'users', lineNumber: 2 }),
            expect.objectContaining({ tableName: 'orders', lineNumber: 3 }),
            expect.objectContaining({ tableName: 'payments', lineNumber: 4 }),
        ]));
    });

    it('resolves reference locations in thousands of statements without per-reference file rescans', () => {
        const extractor = new ReferenceExtractor();
        const sql = Array.from({ length: 3000 }, (_, index) => [
            `CREATE VIEW v${index} AS`,
            'SELECT a.id, b.name',
            `FROM t${index} a`,
            `JOIN s.t${index + 1} b ON a.id = b.id`,
            'WHERE a.x > 1;',
        ].join('\n')).join('\n');

        const start = Date.now();
        const refs = extractor.extractReferences(sql, 'views.sql', 'MySQL');
        const elapsed = Date.now() - start;

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 't2999', lineNumber: 14998, statementIndex: 2999 }),
            expect.objectContaining({ tableName: 't3000', schema: 's', lineNumber: 14999, statementIndex: 2999 }),
        ]));
        // Previously ~10 s at this size (quadratic line lookups); now linear.
        expect(elapsed).toBeLessThan(5000);
    });

    it('builds the statement alias map once instead of once per FROM item', () => {
        const extractor = new ReferenceExtractor();
        const buildAliasMap = jest.spyOn((extractor as any).columnExtractor, 'buildAliasMap');
        const sql = `SELECT * FROM ${Array.from({ length: 200 }, (_, index) => `t${index}`).join(', ')};`;

        expect(extractor.extractReferences(sql, 'wide.sql', 'MySQL')).toHaveLength(200);
        // One map for column attribution plus the query-analysis map.
        expect(buildAliasMap.mock.calls.length).toBeLessThan(5);
    });

    it('handles very wide FROM lists without quadratic alias rebuilds', () => {
        const sql = `SELECT * FROM ${Array.from({ length: 10000 }, (_, index) => `t${index}`).join(', ')};`;
        const start = Date.now();
        const refs = new ReferenceExtractor().extractReferences(sql, 'wide.sql', 'MySQL');
        const elapsed = Date.now() - start;

        expect(refs).toHaveLength(10000);
        // Previously ~5 s at this size; now ~1 s.
        expect(elapsed).toBeLessThan(4000);
    });
});

