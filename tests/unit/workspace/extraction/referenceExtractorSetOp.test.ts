/**
 * Regression test for Observation #2:
 * referenceExtractor should not pass stmt.set_op (a string like 'union')
 * to extractFromStatement, which expects an AST node.
 *
 * The _next block already handles UNION's right-side statement.
 * This test verifies UNION references are extracted correctly without
 * the dead set_op code path.
 */

import { ReferenceExtractor } from '../../../../src/workspace/extraction/referenceExtractor';

describe('Audit regression: #2 — UNION references via _next, not set_op', () => {
    let extractor: ReferenceExtractor;

    beforeEach(() => {
        extractor = new ReferenceExtractor();
    });

    it('extracts tables from both sides of a UNION', () => {
        const sql = `
            SELECT id, name FROM customers
            UNION
            SELECT id, name FROM suppliers
        `;
        const refs = extractor.extractReferences(sql, 'query.sql', 'MySQL');
        const names = refs.map(r => r.tableName.toLowerCase());

        expect(names).toContain('customers');
        expect(names).toContain('suppliers');
    });

    it('extracts tables from chained UNIONs', () => {
        const sql = `
            SELECT id FROM alpha
            UNION ALL
            SELECT id FROM beta
            UNION
            SELECT id FROM gamma
        `;
        const refs = extractor.extractReferences(sql, 'query.sql', 'MySQL');
        const names = refs.map(r => r.tableName.toLowerCase());

        expect(names).toContain('alpha');
        expect(names).toContain('beta');
        expect(names).toContain('gamma');
    });
});
