/**
 * Regressions for the 0.9.4 audit parser-correctness cluster (workspace side):
 * dialect-aware backslash escapes in string masking and write-target
 * classification for multi-table UPDATE / DELETE.
 */

jest.mock('vscode');

import { ReferenceExtractor } from '../../../../src/workspace/extraction/referenceExtractor';
import { SchemaExtractor } from '../../../../src/workspace/extraction/schemaExtractor';
import { LineageBuilder } from '../../../../src/workspace/lineage/lineageBuilder';
import type { SqlDialect } from '../../../../src/workspace/extraction/types';
import type { WorkspaceIndex } from '../../../../src/workspace/types';

const refs = (sql: string, dialect: SqlDialect): string[] =>
    new ReferenceExtractor().extractReferences(sql, 'q.sql', dialect)
        .map(reference => `${reference.tableName}:${reference.referenceType}`);

function buildLineage(sql: string, dialect: SqlDialect) {
    const result = new ReferenceExtractor().extractReferencesWithStatus(sql, 'q.sql', dialect);
    const index: WorkspaceIndex = {
        version: 1,
        lastUpdated: 0,
        fileCount: 1,
        files: new Map([['q.sql', {
            filePath: 'q.sql',
            fileName: 'q.sql',
            lastModified: 0,
            contentHash: 'h',
            definitions: [],
            references: result.references,
            queries: result.queries,
        }]]),
        fileHashes: new Map(),
        definitionMap: new Map(),
        referenceMap: new Map(),
    };
    for (const reference of result.references) {
        const key = reference.tableName.toLowerCase();
        index.referenceMap.set(key, [...(index.referenceMap.get(key) || []), reference]);
    }
    return new LineageBuilder().buildFromIndex(index);
}

describe('backslash escapes follow the dialect', () => {
    const sql = [
        'SELECT * FROM customers c JOIN orders o ON o.cid = c.id;',
        "SELECT REPLACE(f.path, '\\', '/') AS p FROM files f;",
        'SELECT * FROM products;',
    ].join('\n');

    it.each(['PostgreSQL', 'TransactSQL', 'Oracle'] as SqlDialect[])(
        'keeps references after a one-character backslash literal in %s',
        (dialect) => {
            expect(refs(sql, dialect).map(entry => entry.split(':')[0]).sort())
                .toEqual(['customers', 'files', 'orders', 'products']);
        }
    );

    it('still honours backslash escapes in MySQL', () => {
        expect(refs("SELECT 'it\\'s' AS a FROM t1;\nSELECT * FROM t2;", 'MySQL').sort())
            .toEqual(['t1:select', 't2:select']);
    });

    it('keeps schema definitions after a backslash literal in PostgreSQL', () => {
        const definitions = new SchemaExtractor().extractDefinitions([
            "CREATE VIEW paths AS SELECT REPLACE(p, '\\', '/') AS p FROM raw_paths;",
            'CREATE TABLE later_table (id INT);',
        ].join('\n'), 'schema.sql', 'PostgreSQL');

        expect(definitions.map(definition => `${definition.name}@${definition.lineNumber}`).sort())
            .toEqual(['later_table@2', 'paths@1']);
    });
});

describe('# is only a comment in MySQL-family dialects', () => {
    it('keeps PostgreSQL references and statement boundaries after the # operator', () => {
        expect(refs('SELECT a # b FROM t1;\nSELECT * FROM t2;', 'PostgreSQL')).toEqual(['t1:select', 't2:select']);
        expect(refs('SELECT a # b FROM t1; SELECT * FROM t2;', 'PostgreSQL')).toEqual(['t1:select', 't2:select']);
    });

    it('keeps PostgreSQL definitions after the # operator on the same line', () => {
        const definitions = new SchemaExtractor().extractDefinitions(
            'CREATE VIEW v1 AS SELECT a # b AS x FROM t1; CREATE TABLE t9 (id INT);',
            'schema.sql',
            'PostgreSQL'
        );
        expect(definitions.map(definition => `${definition.name}:${definition.sql}`).sort()).toEqual([
            't9:CREATE TABLE t9 (id INT)',
            'v1:CREATE VIEW v1 AS SELECT a # b AS x FROM t1',
        ]);
    });

    it('still masks MySQL # comments', () => {
        expect(refs('SELECT 1 FROM t1; # FROM ghost_table\nSELECT * FROM t2;', 'MySQL')).toEqual(['t1:select', 't2:select']);
    });
});

describe('multi-table UPDATE / DELETE write targets', () => {
    it('writes only the SET-qualified table in MySQL UPDATE ... JOIN', () => {
        expect(refs('UPDATE tgt t JOIN src s ON t.id = s.id SET t.val = s.val;', 'MySQL'))
            .toEqual(['tgt:update', 'src:join']);
        expect(refs('UPDATE tgt t, src s SET t.val = s.val WHERE t.id = s.id;', 'MySQL'))
            .toEqual(['tgt:update', 'src:select']);
    });

    it('keeps the primary table written when a SET column is unqualified', () => {
        expect(refs('UPDATE tgt t JOIN src s ON t.id = s.id SET val = 1, s.flag = 2;', 'MySQL'))
            .toEqual(['tgt:update', 'src:update']);
        expect(refs('UPDATE tgt t JOIN src s ON t.id = s.id SET val = s.val;', 'MySQL'))
            .toEqual(['tgt:update', 'src:join']);
    });

    it('deletes only from the listed targets in DELETE ... JOIN', () => {
        expect(refs('DELETE t FROM tgt t JOIN src s ON t.id = s.id;', 'MySQL')).toEqual(['tgt:delete', 'src:join']);
        expect(refs('DELETE t FROM tgt t JOIN src s ON t.id = s.id;', 'TransactSQL')).toEqual(['tgt:delete', 'src:join']);
        expect(refs('DELETE t, s FROM tgt t JOIN src s ON t.id = s.id;', 'MySQL')).toEqual(['tgt:delete', 'src:delete']);
        expect(refs('DELETE FROM tgt WHERE id = 1;', 'MySQL')).toEqual(['tgt:delete']);
    });

    it('keeps WHERE-subquery tables as inputs of a single-table UPDATE', () => {
        const { queries } = new ReferenceExtractor().extractReferencesWithStatus([
            "UPDATE customer_segments SET tier = 'Platinum'",
            'WHERE customer_id IN (',
            '    SELECT cs.customer_id FROM customer_segments cs',
            '    JOIN (SELECT customer_id FROM orders GROUP BY customer_id) hv ON cs.customer_id = hv.customer_id',
            ');',
        ].join('\n'), 'q.sql', 'MySQL');

        expect(queries[0].inputTables.map(table => table.tableName).sort())
            .toEqual(['customer_segments', 'orders']);
    });

    it('builds the same table and column lineage as the UPDATE ... FROM form', () => {
        const mysql = buildLineage('UPDATE tgt t JOIN src s ON t.id = s.id SET t.val = s.val;', 'MySQL');
        const postgres = buildLineage('UPDATE tgt SET val = s.val FROM src s WHERE tgt.id = s.id;', 'PostgreSQL');

        const edges = (graph: ReturnType<typeof buildLineage>) =>
            graph.edges.map(edge => `${edge.sourceId}->${edge.targetId}`);
        expect(edges(mysql)).toEqual(edges(postgres));
        expect(edges(mysql)).toEqual(['external:src->external:tgt']);
        expect(mysql.columnEdges).toHaveLength(postgres.columnEdges.length);
        expect(mysql.columnEdges.length).toBeGreaterThan(0);
    });
});
