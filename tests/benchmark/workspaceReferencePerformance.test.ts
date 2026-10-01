import { ReferenceExtractor } from '../../src/workspace/extraction/referenceExtractor';

describe('Workspace reference extraction performance', () => {
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
