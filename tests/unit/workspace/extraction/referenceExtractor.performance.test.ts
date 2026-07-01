import { ReferenceExtractor } from '../../../../src/workspace/extraction/referenceExtractor';

describe('ReferenceExtractor table line lookup performance', () => {
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
});
