import { parseSql } from '../../../src/webview/sqlParser';
import { repairJoinKeywordAliases } from '../../../src/shared/astUtils';
import { ReferenceExtractor } from '../../../src/workspace/extraction';
import type { FlowNode, SqlDialect } from '../../../src/webview/types';
import { Parser } from 'node-sql-parser';

function flatten(nodes: FlowNode[]): FlowNode[] {
    return nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);
}

// node-sql-parser's PostgreSQL-family grammars read `a CROSS JOIN b` as `a`
// aliased CROSS plus an INNER JOIN with no condition.
const dialects: SqlDialect[] = ['PostgreSQL', 'Snowflake', 'Redshift', 'Trino', 'SQLite', 'Oracle', 'MySQL', 'BigQuery', 'TransactSQL'];

describe('CROSS and NATURAL JOIN parsing', () => {
    it.each(dialects)('keeps CROSS JOIN and the left table alias in %s', (dialect) => {
        const nodes = flatten(parseSql('SELECT a.id, b.id FROM a CROSS JOIN b', dialect, { allowDialectFallback: false }).nodes);
        expect(nodes.find(node => node.type === 'table' && node.label === 'a')?.alias).toBeUndefined();
        expect(nodes.filter(node => node.type === 'join').map(node => node.joinType)).toEqual(['CROSS JOIN']);
    });

    it.each(['PostgreSQL', 'Snowflake', 'Trino'] as SqlDialect[])('repairs chained CROSS JOINs and NATURAL JOIN in %s', (dialect) => {
        const chained = flatten(parseSql('SELECT 1 FROM a CROSS JOIN b CROSS JOIN c', dialect, { allowDialectFallback: false }).nodes);
        expect(chained.filter(node => node.type === 'join').map(node => node.joinType)).toEqual(['CROSS JOIN', 'CROSS JOIN']);
        expect(chained.filter(node => node.type === 'table').map(node => node.alias)).toEqual([undefined, undefined, undefined]);

        const natural = flatten(parseSql('SELECT 1 FROM a NATURAL LEFT JOIN b', dialect, { allowDialectFallback: false }).nodes);
        expect(natural.filter(node => node.type === 'join').map(node => node.joinType)).toEqual(['NATURAL LEFT JOIN']);
    });

    it('leaves joins with a condition alone', () => {
        const ast = { from: [{ table: 'a', as: 'CROSS' }, { table: 'b', as: null, join: 'INNER JOIN', on: { type: 'bool', value: true } }] };
        repairJoinKeywordAliases(ast);
        expect(ast.from[0].as).toBe('CROSS');
        expect(ast.from[1].join).toBe('INNER JOIN');
    });

    it('repairs CROSS JOIN inside CTEs and subqueries', () => {
        const nodes = flatten(parseSql('WITH x AS (SELECT * FROM a CROSS JOIN b) SELECT * FROM (SELECT * FROM x CROSS JOIN c) s', 'PostgreSQL', { allowDialectFallback: false }).nodes);
        expect(nodes.some(node => node.alias === 'CROSS')).toBe(false);
        expect(nodes.filter(node => node.type === 'join').map(node => node.joinType)).toEqual(['CROSS JOIN', 'CROSS JOIN']);
    });

    it('keeps Workspace references for CROSS JOIN', () => {
        const references = new ReferenceExtractor().extractReferencesWithStatus('SELECT * FROM a CROSS JOIN b;', '/a.sql', 'PostgreSQL').references;
        expect(references.map(ref => ref.tableName).sort()).toEqual(['a', 'b']);
        expect(references.some(ref => ref.alias === 'CROSS')).toBe(false);
    });

    it.each(['Snowflake', 'SQLite', 'MySQL'] as SqlDialect[])('preserves quoted keyword aliases beside genuine CROSS JOINs in %s', dialect => {
        const quote = dialect === 'MySQL' ? '`' : '"';
        for (const alias of ['CROSS', 'NATURAL']) {
            const sql = `SELECT ${quote}${alias}${quote}.id FROM a AS ${quote}${alias}${quote} JOIN b CROSS JOIN c`;
            const result = parseSql(sql, dialect, { allowDialectFallback: false });
            expect(result.partial).toBeUndefined();
            expect(result.nodes.find(node => node.type === 'table' && node.label === 'a')?.alias).toBe(alias);
            expect(result.nodes.filter(node => node.type === 'join').map(node => node.joinType)).toEqual(['INNER JOIN', 'CROSS JOIN']);
        }
    });

    it.each([String.raw`SELECT '\' AS s FROM a CROSS JOIN b`, 'SELECT $$INNER JOIN$$ AS s FROM a CROSS JOIN b'])(
        'ignores quoted text while locating PostgreSQL joins in %s', sql => {
            const ast: any = new Parser().astify('SELECT 1 FROM a CROSS JOIN b', { database: 'PostgreSQL' });
            repairJoinKeywordAliases(ast, sql, 'PostgreSQL');
            expect(ast.from[0].as).toBeNull();
            expect(ast.from[1].join).toBe('CROSS JOIN');
        }
    );

    it('repairs FROM clauses on UPDATE statements', () => {
        const sql = 'UPDATE target SET id=a.id FROM a CROSS JOIN b';
        const ast: any = new Parser().astify(sql, { database: 'PostgreSQL' });
        repairJoinKeywordAliases(ast, sql, 'PostgreSQL');
        expect(ast.from[0].as).toBeNull();
        expect(ast.from[1].join).toBe('CROSS JOIN');
    });

    it('resets source scope between SELECT and UPDATE statements', () => {
        const sql = 'SELECT 1; UPDATE target SET id=a.id FROM a CROSS JOIN b';
        const ast: any = new Parser().astify(sql, { database: 'PostgreSQL' });
        repairJoinKeywordAliases(ast, sql, 'PostgreSQL');
        expect(ast[1].from[0].as).toBeNull();
        expect(ast[1].from[1].join).toBe('CROSS JOIN');
    });
});
