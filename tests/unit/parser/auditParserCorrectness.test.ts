/**
 * Regressions for the 0.9.4 audit parser-correctness cluster (SQL Flow side):
 * PostgreSQL `#` operators vs MySQL `#` comments, MySQL multi-table UPDATE
 * targets, IN/BETWEEN expression formatting, and column flows through JOINs.
 */

import { detectDialect, parseSql, parseSqlBatch, splitSqlStatements } from '../../../src/webview/sqlParser';

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
