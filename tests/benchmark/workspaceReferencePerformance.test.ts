import { ReferenceExtractor } from '../../src/workspace/extraction/referenceExtractor';

describe('Workspace reference extraction performance', () => {
    it('resolves reference locations in thousands of statements without per-reference file rescans', () => {
        const extractor = new ReferenceExtractor();
        const buildLookup = jest.spyOn(extractor as any, 'buildTableLineLookup');
        const sql = Array.from({ length: 3000 }, (_, index) => [
            `CREATE VIEW v${index} AS`,
            'SELECT a.id, b.name',
            `FROM t${index} a`,
            `JOIN s.t${index + 1} b ON a.id = b.id`,
            'WHERE a.x > 1;',
        ].join('\n')).join('\n');

        const refs = extractor.extractReferences(sql, 'views.sql', 'MySQL');

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 't2999', lineNumber: 14998, statementIndex: 2999 }),
            expect.objectContaining({ tableName: 't3000', schema: 's', lineNumber: 14999, statementIndex: 2999 }),
        ]));
        // One lookup for the file keeps line resolution off the old per-reference scan path.
        expect(buildLookup).toHaveBeenCalledTimes(1);
    });

    it('handles very wide FROM lists without quadratic alias rebuilds', () => {
        const sql = `SELECT * FROM ${Array.from({ length: 10000 }, (_, index) => `t${index}`).join(', ')};`;
        const extractor = new ReferenceExtractor();
        const buildAliasMap = jest.spyOn((extractor as any).columnExtractor, 'buildAliasMap');
        const refs = extractor.extractReferences(sql, 'wide.sql', 'MySQL');

        expect(refs).toHaveLength(10000);
        // A map per FROM item made this path quadratic; the count stays constant.
        expect(buildAliasMap.mock.calls.length).toBeLessThan(5);
    });
});
