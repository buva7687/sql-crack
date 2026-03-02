/**
 * Parser Dialect Matrix Tests
 *
 * Verifies that compatibility parsers (MERGE, DELETE OUTPUT/USING, Bulk, Warehouse DDL)
 * activate for the correct dialects and correctly fall through for non-applicable dialects.
 */

import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

const ALL_DIALECTS: SqlDialect[] = [
    'MySQL', 'PostgreSQL', 'TransactSQL', 'MariaDB', 'SQLite',
    'Snowflake', 'BigQuery', 'Hive', 'Redshift', 'Athena',
    'Trino', 'Oracle', 'Teradata',
];

// ─── Section 1: MERGE dialect matrix ─────────────────────────────────────────

describe('MERGE dialect matrix', () => {
    const MERGE_SQL = `
        MERGE INTO target_table t
        USING source_table s
        ON t.id = s.id
        WHEN MATCHED THEN UPDATE SET t.value = s.value
        WHEN NOT MATCHED THEN INSERT (id, value) VALUES (s.id, s.value)
    `;

    const MERGE_COMPAT_DIALECTS: SqlDialect[] = [
        'TransactSQL', 'Oracle', 'Snowflake', 'BigQuery', 'Teradata', 'PostgreSQL',
    ];
    const NON_MERGE_DIALECTS = ALL_DIALECTS.filter(d => !MERGE_COMPAT_DIALECTS.includes(d));

    it.each(MERGE_COMPAT_DIALECTS)(
        '%s: MERGE activates compatibility parser (no partial, compat hint present)',
        (dialect) => {
            const result = parseSql(MERGE_SQL, dialect);
            expect(result.partial).toBeUndefined();
            expect(result.hints.some((h: any) =>
                h.message?.includes('compatibility parser') && h.message?.includes('MERGE')
            )).toBe(true);
        }
    );

    it.each(NON_MERGE_DIALECTS)(
        '%s: MERGE does not produce compatibility-parser hint',
        (dialect) => {
            const result = parseSql(MERGE_SQL, dialect);
            expect(result.hints.some((h: any) =>
                h.message?.includes('compatibility parser') && h.message?.includes('MERGE')
            )).toBe(false);
        }
    );
});

// ─── Section 2: DELETE OUTPUT matrix ─────────────────────────────────────────

describe('DELETE OUTPUT matrix', () => {
    const DELETE_OUTPUT_SQL = `
        DELETE FROM orders
        OUTPUT DELETED.id, DELETED.customer_id
        WHERE status = 'cancelled'
    `;

    const NON_TSQL_DIALECTS = ALL_DIALECTS.filter(d => d !== 'TransactSQL');

    it('TransactSQL: DELETE OUTPUT activates compat parser with OUTPUT hint', () => {
        const result = parseSql(DELETE_OUTPUT_SQL, 'TransactSQL' as SqlDialect);
        expect(result.error).toBeUndefined();
        expect(result.hints.some((h: any) =>
            h.message?.includes('TransactSQL') && h.message?.includes('OUTPUT')
        )).toBe(true);

        const deleteNode = result.nodes.find((n: any) =>
            n.type === 'table' && n.accessMode === 'write' && n.operationType === 'DELETE'
        );
        expect(deleteNode).toBeDefined();
    });

    it.each(NON_TSQL_DIALECTS)(
        '%s: DELETE OUTPUT does not produce TransactSQL OUTPUT hint',
        (dialect) => {
            const result = parseSql(DELETE_OUTPUT_SQL, dialect);
            expect(result.hints.some((h: any) =>
                h.message?.includes('TransactSQL') && h.message?.includes('OUTPUT')
            )).toBe(false);
        }
    );
});

// ─── Section 3: DELETE USING matrix ──────────────────────────────────────────

describe('DELETE USING matrix', () => {
    const DELETE_USING_SQL = `
        DELETE FROM orders o
        USING customers c
        WHERE o.customer_id = c.id
          AND c.status = 'inactive'
    `;

    const NON_PG_DIALECTS = ALL_DIALECTS.filter(d => d !== 'PostgreSQL');

    it('PostgreSQL: DELETE USING activates compat parser with USING hint', () => {
        const result = parseSql(DELETE_USING_SQL, 'PostgreSQL' as SqlDialect);
        expect(result.error).toBeUndefined();
        expect(result.hints.some((h: any) =>
            h.message?.includes('DELETE') && h.message?.includes('USING')
        )).toBe(true);

        const targetTable = result.nodes.find((n: any) =>
            n.type === 'table' && n.label === 'orders' && n.accessMode === 'write'
        );
        expect(targetTable).toBeDefined();
    });

    it.each(NON_PG_DIALECTS)(
        '%s: DELETE USING does not produce PostgreSQL USING hint',
        (dialect) => {
            const result = parseSql(DELETE_USING_SQL, dialect);
            expect(result.hints.some((h: any) =>
                h.message?.includes('DELETE') && h.message?.includes('USING') && h.message?.includes('compatibility parser')
            )).toBe(false);
        }
    );
});

// ─── Section 4: Bulk parser contamination ────────────────────────────────────

describe('Bulk parser contamination', () => {
    const COPY_FROM_SQL = `COPY users FROM 's3://bucket/users.csv' WITH (FORMAT csv, HEADER true)`;

    it('PostgreSQL: COPY FROM properly owned', () => {
        const result = parseSql(COPY_FROM_SQL, 'PostgreSQL' as SqlDialect);
        expect(result.error).toBeUndefined();
        expect(result.nodes.some((n: any) => n.label === 'users')).toBe(true);
        expect(result.nodes.some((n: any) => n.label === 's3://bucket/users.csv')).toBe(true);
    });

    it('Redshift: COPY FROM properly owned', () => {
        const result = parseSql(COPY_FROM_SQL, 'Redshift' as SqlDialect);
        expect(result.error).toBeUndefined();
        expect(result.nodes.some((n: any) => n.label === 'users')).toBe(true);
    });

    // These dialects should not match COPY FROM, but currently do due to no dialect gating.
    // These tests document the current contamination behavior and serve as regression guards.
    const CONTAMINATED_DIALECTS: SqlDialect[] = ['Hive', 'Athena', 'MySQL', 'MariaDB', 'SQLite', 'Trino'];

    it.each(CONTAMINATED_DIALECTS)(
        '%s: COPY FROM produces nodes (contamination — no dialect gate)',
        (dialect) => {
            const result = parseSql(COPY_FROM_SQL, dialect);
            // Documenting current behavior: bulk parser activates regardless of dialect
            expect(result.nodes.length).toBeGreaterThan(0);
        }
    );

    it('Snowflake: COPY INTO uses its own sub-parser', () => {
        const sql = `COPY INTO my_table FROM @my_stage FILE_FORMAT = (TYPE = 'CSV')`;
        const result = parseSql(sql, 'Snowflake' as SqlDialect);
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.hints.some((h: any) =>
            h.message?.toLowerCase().includes('copy')
        )).toBe(true);
    });

    it('BigQuery: EXPORT DATA uses its own sub-parser, not COPY', () => {
        const sql = `
            EXPORT DATA OPTIONS (
                uri = 'gs://bucket/output/*.csv',
                format = 'CSV'
            ) AS
            SELECT id, name FROM users
        `;
        const result = parseSql(sql, 'BigQuery' as SqlDialect);
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.hints.some((h: any) =>
            h.message?.toLowerCase().includes('export data')
        )).toBe(true);
    });
});

// ─── Section 5: Warehouse DDL negative matrix ───────────────────────────────

describe('Warehouse DDL negative matrix', () => {
    describe('CREATE EXTERNAL TABLE', () => {
        const EXTERNAL_TABLE_SQL = `
            CREATE EXTERNAL TABLE events (
                id INT,
                payload STRING
            )
            ROW FORMAT DELIMITED
            FIELDS TERMINATED BY ','
            LOCATION 's3://bucket/path'
        `;

        const EXTERNAL_TABLE_POSITIVE: SqlDialect[] = ['Hive', 'Athena'];
        const EXTERNAL_TABLE_NEGATIVE = ALL_DIALECTS.filter(d => !EXTERNAL_TABLE_POSITIVE.includes(d) && d !== 'BigQuery');

        it.each(EXTERNAL_TABLE_POSITIVE)(
            '%s: CREATE EXTERNAL TABLE activates warehouse DDL parser',
            (dialect) => {
                const result = parseSql(EXTERNAL_TABLE_SQL, dialect);
                expect(result.error).toBeUndefined();
                expect(result.partial).toBeUndefined();
                expect(result.hints.some((h: any) =>
                    h.message?.includes('CREATE EXTERNAL TABLE') && h.message?.includes('compatibility parser')
                )).toBe(true);
            }
        );

        it.each(EXTERNAL_TABLE_NEGATIVE)(
            '%s: CREATE EXTERNAL TABLE does not activate warehouse DDL parser',
            (dialect) => {
                const result = parseSql(EXTERNAL_TABLE_SQL, dialect);
                expect(result.hints.some((h: any) =>
                    h.message?.includes('CREATE EXTERNAL TABLE') && h.message?.includes('compatibility parser')
                )).toBe(false);
            }
        );
    });

    describe('CREATE STAGE', () => {
        const STAGE_SQL = `CREATE STAGE my_stage URL = 's3://bucket/path'`;

        const STAGE_NEGATIVE = ALL_DIALECTS.filter(d => d !== 'Snowflake');

        it('Snowflake: CREATE STAGE activates warehouse DDL parser', () => {
            const result = parseSql(STAGE_SQL, 'Snowflake' as SqlDialect);
            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();
            expect(result.hints.some((h: any) =>
                h.message?.includes('CREATE STAGE') && h.message?.includes('compatibility parser')
            )).toBe(true);
        });

        it.each(STAGE_NEGATIVE)(
            '%s: CREATE STAGE does not activate warehouse DDL parser',
            (dialect) => {
                const result = parseSql(STAGE_SQL, dialect);
                expect(result.hints.some((h: any) =>
                    h.message?.includes('CREATE STAGE') && h.message?.includes('compatibility parser')
                )).toBe(false);
            }
        );
    });

    describe('Redshift DISTKEY table', () => {
        const REDSHIFT_TABLE_SQL = `
            CREATE TABLE sales (
                id INT,
                amount DECIMAL(10,2),
                created_at TIMESTAMP
            )
            DISTSTYLE KEY
            DISTKEY (id)
            SORTKEY (created_at)
        `;

        const REDSHIFT_NEGATIVE = ALL_DIALECTS.filter(d => d !== 'Redshift');

        it('Redshift: CREATE TABLE with DISTKEY activates warehouse DDL parser', () => {
            const result = parseSql(REDSHIFT_TABLE_SQL, 'Redshift' as SqlDialect);
            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();
            expect(result.hints.some((h: any) =>
                h.message?.includes('Redshift') && h.message?.includes('compatibility parser')
            )).toBe(true);
        });

        it.each(REDSHIFT_NEGATIVE)(
            '%s: CREATE TABLE with DISTKEY does not activate Redshift parser',
            (dialect) => {
                const result = parseSql(REDSHIFT_TABLE_SQL, dialect);
                expect(result.hints.some((h: any) =>
                    h.message?.includes('Redshift') && h.message?.includes('compatibility parser')
                )).toBe(false);
            }
        );
    });

    describe('Trino CREATE TABLE WITH', () => {
        const TRINO_TABLE_SQL = `
            CREATE TABLE catalog.schema.events (
                id INT,
                payload VARCHAR
            )
            WITH (
                format = 'PARQUET',
                external_location = 's3://bucket/events/'
            )
        `;

        // BigQuery excluded from negative — BigQuery CREATE TABLE ... WITH may overlap
        const TRINO_NEGATIVE = ALL_DIALECTS.filter(d => d !== 'Trino' && d !== 'BigQuery');

        it('Trino: CREATE TABLE WITH activates warehouse DDL parser', () => {
            const result = parseSql(TRINO_TABLE_SQL, 'Trino' as SqlDialect);
            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();
            expect(result.hints.some((h: any) =>
                h.message?.includes('Trino') && h.message?.includes('compatibility parser')
            )).toBe(true);
        });

        it.each(TRINO_NEGATIVE)(
            '%s: CREATE TABLE WITH does not activate Trino parser',
            (dialect) => {
                const result = parseSql(TRINO_TABLE_SQL, dialect);
                expect(result.hints.some((h: any) =>
                    h.message?.includes('Trino') && h.message?.includes('compatibility parser')
                )).toBe(false);
            }
        );
    });
});

// ─── Section 6: Edge cases ───────────────────────────────────────────────────

describe('Dialect edge cases', () => {
    it('Snowflake: double-quoted MERGE target normalizes identifier', () => {
        const sql = `
            MERGE INTO "MySchema"."TargetTable" t
            USING source_table s
            ON t.id = s.id
            WHEN MATCHED THEN UPDATE SET t.value = s.value
        `;
        const result = parseSql(sql, 'Snowflake' as SqlDialect);
        expect(result.partial).toBeUndefined();

        const targetNode = result.nodes.find((n: any) =>
            n.type === 'table' && n.accessMode === 'write' && n.operationType === 'MERGE'
        );
        expect(targetNode).toBeDefined();
        // Quotes should be stripped from the label
        expect(targetNode!.label).not.toContain('"');
    });

    it('TransactSQL: bracket-quoted MERGE target normalizes identifier', () => {
        const sql = `
            MERGE INTO [dbo].[TargetTable] t
            USING source_table s
            ON t.id = s.id
            WHEN MATCHED THEN UPDATE SET t.value = s.value
        `;
        const result = parseSql(sql, 'TransactSQL' as SqlDialect);
        expect(result.partial).toBeUndefined();

        const targetNode = result.nodes.find((n: any) =>
            n.type === 'table' && n.accessMode === 'write' && n.operationType === 'MERGE'
        );
        expect(targetNode).toBeDefined();
        // Brackets should be stripped
        expect(targetNode!.label).not.toContain('[');
        expect(targetNode!.label).not.toContain(']');
    });

    it('MERGE with no WHEN clauses still produces merge edges', () => {
        const sql = `
            MERGE INTO target_table t
            USING source_table s
            ON t.id = s.id
        `;
        const result = parseSql(sql, 'Snowflake' as SqlDialect);
        expect(result.partial).toBeUndefined();
        // Should still produce nodes for source and target even without WHEN
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.edges.length).toBeGreaterThan(0);
    });

    it('PostgreSQL: DELETE USING with schema-qualified target', () => {
        const sql = `
            DELETE FROM public.orders o
            USING customers c
            WHERE o.customer_id = c.id
        `;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);
        expect(result.error).toBeUndefined();

        const targetNode = result.nodes.find((n: any) =>
            n.type === 'table' && n.accessMode === 'write' && n.operationType === 'DELETE'
        );
        expect(targetNode).toBeDefined();
        expect(result.hints.some((h: any) =>
            h.message?.includes('DELETE') && h.message?.includes('USING')
        )).toBe(true);
    });

    it('TransactSQL: DELETE OUTPUT with wildcard (DELETED.*)', () => {
        const sql = `
            DELETE FROM orders
            OUTPUT DELETED.*
            WHERE status = 'cancelled'
        `;
        const result = parseSql(sql, 'TransactSQL' as SqlDialect);
        expect(result.error).toBeUndefined();
        expect(result.hints.some((h: any) =>
            h.message?.includes('TransactSQL') && h.message?.includes('OUTPUT')
        )).toBe(true);
    });

    it('MERGE with deeply nested subquery source (EXISTS inside USING)', () => {
        const sql = `
            MERGE INTO target_table t
            USING (
                SELECT s.id, s.value
                FROM source_table s
                WHERE EXISTS (SELECT 1 FROM audit_log a WHERE a.ref_id = s.id)
            ) src
            ON t.id = src.id
            WHEN MATCHED THEN UPDATE SET t.value = src.value
        `;
        const result = parseSql(sql, 'Snowflake' as SqlDialect);
        expect(result.partial).toBeUndefined();
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(result.hints.some((h: any) =>
            h.message?.includes('compatibility parser') && h.message?.includes('MERGE')
        )).toBe(true);
    });

    it('Hive: DELETE USING must not trigger PostgreSQL compat parser', () => {
        const sql = `
            DELETE FROM orders o
            USING customers c
            WHERE o.customer_id = c.id
        `;
        const result = parseSql(sql, 'Hive' as SqlDialect);
        // Hive should NOT get the PostgreSQL DELETE USING compat hint
        expect(result.hints.some((h: any) =>
            h.message?.includes('DELETE') && h.message?.includes('USING') && h.message?.includes('compatibility parser')
        )).toBe(false);
    });

    it('SQLite: MERGE falls through (no compat hint)', () => {
        const sql = `
            MERGE INTO target_table t
            USING source_table s
            ON t.id = s.id
            WHEN MATCHED THEN UPDATE SET t.value = s.value
        `;
        const result = parseSql(sql, 'SQLite' as SqlDialect);
        expect(result.hints.some((h: any) =>
            h.message?.includes('compatibility parser') && h.message?.includes('MERGE')
        )).toBe(false);
    });
});
