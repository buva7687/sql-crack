import { ReferenceExtractor } from '../../../../src/workspace/extraction/referenceExtractor';

describe('ReferenceExtractor behavioral coverage', () => {
    let extractor: ReferenceExtractor;

    beforeEach(() => {
        extractor = new ReferenceExtractor();
    });

    it('extracts base FROM and JOIN table references with aliases', () => {
        const refs = extractor.extractReferences(
            'SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id',
            'query.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'users',
                alias: 'u',
                referenceType: 'select',
                context: 'FROM',
            }),
            expect.objectContaining({
                tableName: 'orders',
                alias: 'o',
                referenceType: 'join',
            }),
        ]));
    });

    it('preserves schema-qualified names and schema metadata', () => {
        const refs = extractor.extractReferences(
            'SELECT * FROM analytics.users u JOIN sales.orders o ON u.id = o.user_id',
            'query.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'users',
                schema: 'analytics',
                alias: 'u',
            }),
            expect.objectContaining({
                tableName: 'orders',
                schema: 'sales',
                alias: 'o',
            }),
        ]));
    });

    it('extracts real tables from subqueries without leaking the subquery alias', () => {
        const refs = extractor.extractReferences(
            `
            SELECT *
            FROM (SELECT id FROM inner_table) t
            JOIN outer_table o ON t.id = o.id
            `,
            'query.sql',
            'MySQL'
        );

        const names = refs.map(ref => ref.tableName.toLowerCase());
        expect(names).toContain('inner_table');
        expect(names).toContain('outer_table');
        expect(names).not.toContain('t');
    });

    it('captures INSERT target tables and source SELECT tables', () => {
        const refs = extractor.extractReferences(
            'INSERT INTO target_table (id) SELECT id FROM source_table',
            'query.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'target_table',
                referenceType: 'insert',
                context: 'INSERT INTO',
            }),
            expect.objectContaining({
                tableName: 'source_table',
                referenceType: 'select',
                context: 'FROM',
            }),
        ]));
    });

    it('captures UPDATE targets and UPDATE ... FROM source tables', () => {
        const refs = extractor.extractReferences(
            `
            UPDATE target_table
            SET total = s.total
            FROM source_table s
            WHERE target_table.id = s.id
            `,
            'query.sql',
            'PostgreSQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'target_table',
                referenceType: 'update',
                context: 'UPDATE',
            }),
            expect.objectContaining({
                tableName: 'source_table',
                alias: 's',
            }),
        ]));
    });

    it('captures DELETE targets and subquery sources', () => {
        const refs = extractor.extractReferences(
            'DELETE FROM target_table WHERE id IN (SELECT id FROM source_table)',
            'query.sql',
            'MySQL'
        );

        expect(refs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'target_table',
                referenceType: 'delete',
                context: 'DELETE FROM',
            }),
            expect.objectContaining({
                tableName: 'source_table',
                referenceType: 'select',
            }),
        ]));
    });

    it('handles dialect preprocessing cases without inventing table names from syntax', () => {
        const pgRefs = extractor.extractReferences(
            "SELECT * FROM orders WHERE created_at::date = CURRENT_DATE",
            'pg.sql',
            'PostgreSQL'
        );
        const snowflakeRefs = extractor.extractReferences(
            "SELECT src:items FROM events",
            'sf.sql',
            'Snowflake'
        );

        expect(pgRefs.map(ref => ref.tableName.toLowerCase())).toContain('orders');
        expect(pgRefs.map(ref => ref.tableName.toLowerCase())).not.toContain('date');
        expect(snowflakeRefs.map(ref => ref.tableName.toLowerCase())).toContain('events');
        expect(snowflakeRefs.map(ref => ref.tableName.toLowerCase())).not.toContain('items');
    });
});
