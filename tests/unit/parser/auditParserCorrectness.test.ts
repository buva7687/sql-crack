/**
 * Regressions for the 0.9.4 audit parser-correctness cluster (SQL Flow side):
 * PostgreSQL `#` operators vs MySQL `#` comments, MySQL multi-table UPDATE
 * targets, IN/BETWEEN expression formatting, and column flows through JOINs.
 */

import { detectDialect, parseSql, parseSqlBatch, splitSqlStatements } from '../../../src/webview/sqlParser';
import { regexFallbackParse } from '../../../src/webview/parser/dialects/fallback';
import { maskStringsAndComments, withSqlDialectLexing } from '../../../src/webview/parser/dialects/preprocessing';
import type { SqlDialect } from '../../../src/webview/types';

const replacer = (_key: string, value: unknown) => value instanceof Map ? [...value.entries()] : value;

describe('PostgreSQL # operators are not MySQL comments', () => {
    const jsonPathSql = "SELECT data #>> '{a,b}' AS x FROM t1;\nSELECT * FROM t2;";

    it('splits statements after #> / #>> JSON path operators in any dialect', () => {
        expect(splitSqlStatements(jsonPathSql, 'PostgreSQL')).toHaveLength(2);
        expect(splitSqlStatements(jsonPathSql, 'MySQL')).toHaveLength(2);
        expect(splitSqlStatements("SELECT data #> '{a}' FROM t1; SELECT 2;", 'PostgreSQL')).toHaveLength(2);
    });

    it('treats bare # as an operator outside MySQL-family dialects', () => {
        expect(splitSqlStatements('SELECT a # b AS x FROM t1;\nSELECT * FROM t2;', 'PostgreSQL')).toHaveLength(2);
    });

    it('keeps # line comments in MySQL, MariaDB, and BigQuery', () => {
        for (const dialect of ['MySQL', 'MariaDB', 'BigQuery'] as const) {
            expect(splitSqlStatements('SELECT 1; # note; not a statement\nSELECT 2;', dialect)).toHaveLength(2);
        }
    });

    it('parses each JSON path statement separately without phantom hints', () => {
        const result = parseSqlBatch(jsonPathSql, 'PostgreSQL');
        expect(result.queries).toHaveLength(2);
        expect(result.queries[0].hints.some(hint => /Cartesian/i.test(hint.message))).toBe(false);
    });

    it('keeps the #> signal for dialect detection', () => {
        expect(detectDialect(jsonPathSql).dialect).toBe('PostgreSQL');
    });
});

describe('MySQL multi-table UPDATE targets', () => {
    const describeNodes = (sql: string) => parseSql(sql, 'MySQL').nodes
        .filter(node => node.type === 'table')
        .map(node => `${node.label}:${node.accessMode ?? 'read'}`);

    it('writes only the SET-qualified table in UPDATE ... JOIN', () => {
        const result = parseSql('UPDATE tgt t JOIN src s ON t.id = s.id SET t.val = s.val', 'MySQL');
        const tables = result.nodes.filter(node => node.type === 'table');

        expect(tables.filter(node => node.accessMode === 'write').map(node => node.label)).toEqual(['tgt']);
        expect(tables.some(node => node.label === 'src' && node.accessMode !== 'write')).toBe(true);
        expect(result.hints.some(hint => /Cartesian/i.test(hint.message))).toBe(false);
    });

    it('keeps the primary table as a target when a SET column is unqualified', () => {
        // `val` may belong to tgt; MySQL resolves unqualified columns by ownership.
        expect(describeNodes('UPDATE tgt t JOIN src s ON t.id = s.id SET val = 1, s.flag = 2')
            .filter(entry => entry.endsWith(':write')).sort()).toEqual(['src:write', 'tgt:write']);
    });

    it('handles the comma form and unaliased JOIN form', () => {
        expect(describeNodes('UPDATE tgt t, src s SET t.val = s.val WHERE t.id = s.id'))
            .toEqual(expect.arrayContaining(['src:read', 'tgt:write']));
        expect(describeNodes('UPDATE tgt JOIN src ON tgt.id = src.id SET tgt.val = src.val WHERE src.x = 1')
            .filter(entry => entry.endsWith(':write'))).toEqual(['tgt:write']);
    });
});

describe('IN / BETWEEN expression formatting', () => {
    const sql = [
        'SELECT',
        "  CASE WHEN status IN ('a', 'b') THEN 1 WHEN x BETWEEN 1 AND 5 THEN 2 END AS bucket,",
        "  SUM(IF(status IN ('a', 'b'), 1, 0)) AS matched,",
        '  a NOT BETWEEN 1 AND 5 AS outside',
        'FROM t',
    ].join('\n');

    it('never renders [object Object] for expression lists', () => {
        const json = JSON.stringify(parseSql(sql, 'MySQL'), replacer);
        expect(json).not.toContain('[object Object]');
        expect(json).toContain('status IN (a, b)');
        expect(json).toContain('x BETWEEN 1 AND 5');
        expect(json).toContain('a NOT BETWEEN 1 AND 5');
        expect(json).toContain("SUM(IF(status IN ('a', 'b'), 1, 0))");
    });
});

describe('column flows through JOINs', () => {
    it('trace joined columns back to their source tables', () => {
        const result = parseSql('SELECT o.id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id', 'MySQL');
        const paths = Object.fromEntries((result.columnFlows || []).map(flow => [
            flow.outputColumn,
            flow.lineagePath.map(step => `${step.nodeName}.${step.columnName}:${step.transformation}`),
        ]));

        expect(paths.id?.[0]).toBe('orders.id:source');
        expect(paths.name?.[0]).toBe('customers.name:source');
    });
});

describe('regex fallback table detection', () => {
    const tableLabels = (sql: string, dialect: SqlDialect) => regexFallbackParse(sql, dialect).nodes
        .filter(node => node.type === 'table')
        .map(node => node.label);

    it('ignores table keywords inside string literals and FOR UPDATE', () => {
        const result = parseSql(
            "SELECT e.id, 'Copied from staging_backup' AS note FROM events e WHERE e.x = 1 FOR UPDATE SKIP LOCKED",
            'PostgreSQL'
        );
        expect(result.nodes.filter(node => node.type === 'table').map(node => node.label)).toEqual(['events']);
        expect(tableLabels("SELECT 'join ghost' AS j FROM real_t FOR UPDATE OF real_t", 'PostgreSQL')).toEqual(['real_t']);
    });

    it('ignores ON DUPLICATE KEY UPDATE and ON UPDATE CASCADE', () => {
        expect(tableLabels('INSERT INTO t1 (a) VALUES (1) ON DUPLICATE KEY UPDATE a = 2', 'MySQL')).toEqual(['t1']);
        expect(tableLabels('CREATE TABLE c (id int REFERENCES p(id) ON UPDATE CASCADE); UPDATE real_upd SET a = 1', 'MySQL'))
            .toEqual(['real_upd']);
    });

    it('keeps tables after a PostgreSQL # operator and still strips MySQL # comments', () => {
        expect(tableLabels('SELECT a # b FROM pg_t JOIN other_t ON 1=1', 'PostgreSQL')).toEqual(['pg_t', 'other_t']);
        expect(tableLabels('SELECT 1 FROM my_t # FROM ghost\nJOIN j2 ON 1=1', 'MySQL')).toEqual(['my_t', 'j2']);
    });
});

describe('RENAME TABLE targets', () => {
    it('labels each renamed table as old → new instead of [object Object]', () => {
        const result = parseSql('RENAME TABLE a TO b, old_customers TO customers_archive', 'MySQL');
        expect(result.nodes.filter(node => node.type === 'table').map(node => node.label))
            .toEqual(['a → b', 'old_customers → customers_archive']);
        expect(JSON.stringify(result.nodes)).not.toContain('[object Object]');
    });
});

describe('DDL and single-table DML nodes', () => {
    it('gives DDL and RENAME nodes the statement line for click-to-source', () => {
        const batch = parseSqlBatch([
            'SELECT 1;',
            '',
            'CREATE TABLE foo (id int);',
            'DROP TABLE bar;',
            '-- note',
            'ALTER TABLE baz ADD c int;',
        ].join('\n'), 'MySQL');
        const lines = batch.queries.slice(1).map(query => query.nodes.map(node => `${node.label}@${node.startLine}`));

        expect(lines[0]).toEqual(['TABLE foo@3']);
        expect(lines[1]).toEqual(expect.arrayContaining(['DROP TABLE bar@4']));
        expect(lines[2]).toEqual(expect.arrayContaining(['ALTER TABLE baz@6']));

        const rename = parseSql('RENAME TABLE a TO b', 'MySQL');
        expect(rename.nodes.every(node => node.startLine === 1)).toBe(true);
    });

    it('counts the target table of simple UPDATE, DELETE, INSERT, and RENAME statements', () => {
        const tables = (sql: string) => parseSql(sql, 'MySQL').stats.tables;
        expect(tables('UPDATE t SET a = 1 WHERE id = 2')).toBe(1);
        expect(tables('DELETE FROM t WHERE id = 1')).toBe(1);
        expect(tables('INSERT INTO t (a) VALUES (1)')).toBe(1);
        expect(tables('RENAME TABLE a TO b')).toBe(2);
        expect(tables('INSERT INTO t SELECT * FROM s')).toBe(2);
    });
});

describe('unqualified column lineage', () => {
    const firstStep = (sql: string, column: string) => parseSql(sql, 'MySQL').columnFlows
        ?.find(flow => flow.outputColumn === column)?.lineagePath[0];

    it('traces plain columns of a single-table query to that table', () => {
        expect(firstStep('SELECT id FROM orders', 'id')).toEqual(expect.objectContaining({ nodeName: 'orders', columnName: 'id', transformation: 'source' }));
        expect(firstStep('SELECT id, name FROM orders WHERE x > 1', 'name')).toEqual(expect.objectContaining({ nodeName: 'orders', transformation: 'source' }));
        expect(firstStep('SELECT COUNT(id) AS n FROM orders', 'n')).toEqual(expect.objectContaining({ nodeName: 'orders', columnName: 'id' }));
    });

    it('does not invent a source for ambiguous or computed columns', () => {
        expect(firstStep('SELECT id FROM orders o JOIN customers c ON o.cid = c.id', 'id')?.nodeType).not.toBe('table');
        expect(firstStep('SELECT a + b AS total FROM orders', 'total')?.nodeType).not.toBe('table');
    });
});

describe('dialect-scoped # masking', () => {
    it('keeps PostgreSQL # as an operator inside dialect-scoped work and restores the default', () => {
        const sql = 'SELECT a # b AS x FROM t1';
        expect(withSqlDialectLexing('PostgreSQL', () => maskStringsAndComments(sql))).toBe(sql);
        expect(withSqlDialectLexing('MySQL', () => maskStringsAndComments(sql))).not.toContain('FROM t1');
        expect(maskStringsAndComments(sql)).not.toContain('FROM t1');
        expect(maskStringsAndComments(sql, { hashComments: false })).toBe(sql);
    });
});
