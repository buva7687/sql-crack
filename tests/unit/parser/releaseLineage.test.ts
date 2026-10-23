import { parseSql } from '../../../src/webview/sqlParser';

describe('release lineage regressions', () => {
    it('resolves each side of a self-join to its own source node', () => {
        const result = parseSql('SELECT a.id AS employee_id, b.id AS manager_id FROM employees a JOIN employees b ON a.manager_id=b.id', 'PostgreSQL');
        const a = result.nodes.find(node => node.alias === 'a' && node.type === 'table');
        const b = result.nodes.find(node => node.alias === 'b' && node.type === 'table');
        expect(a).toBeDefined();
        expect(b).toBeDefined();
        expect(result.columnLineage?.find(column => column.outputColumn === 'manager_id')?.sources[0].nodeId).toBe(b!.id);
        expect(result.columnLineage?.find(column => column.outputColumn === 'employee_id')?.sources[0].nodeId).toBe(a!.id);
    });

    it('gives identically named output columns different flow identities', () => {
        const result = parseSql('SELECT c.id, o.id FROM customers c JOIN orders o ON c.id=o.customer_id', 'PostgreSQL');
        const flows = result.columnFlows || [];
        expect(flows).toHaveLength(2);
        expect(new Set(flows.map(flow => flow.id)).size).toBe(2);
    });

    it('reports incomplete analysis rather than rebinding shadowed nested CTEs', () => {
        const sql = 'WITH x AS (SELECT id FROM outer_source) SELECT x.id,t.id FROM x JOIN (WITH x AS (SELECT id FROM inner_source) SELECT id FROM x) t ON x.id=t.id';
        const result = parseSql(sql, 'PostgreSQL', {allowDialectFallback: false});
        expect(result.partial).toBe(true);
        expect(result.hints.some(hint => /CTE.*scope|scope.*CTE/i.test(hint.message))).toBe(true);
        expect(result.columnLineage || []).toEqual([]);
    });
});

it.each([
    'SELECT x.id,t.id FROM x JOIN (WITH x AS (SELECT id FROM inner_source) SELECT id FROM x) t ON x.id=t.id',
    'WITH RECURSIVE x AS (SELECT id FROM outer_source) SELECT * FROM (WITH x AS (SELECT id FROM inner_source) SELECT id FROM x) t',
    'SELECT * FROM (WITH x AS (SELECT id FROM a) SELECT id FROM x) p JOIN (WITH x AS (SELECT id FROM b) SELECT id FROM x) q ON p.id=q.id',
    'SELECT "X".id,t.id FROM "X" JOIN (WITH "X" AS (SELECT id FROM inner_source) SELECT id FROM "X") t ON "X".id=t.id'
])('declines an unsafe nested CTE rewrite: %s', sql => {
    const result = parseSql(sql, 'PostgreSQL', {allowDialectFallback: false});
    expect(result.partial).toBe(true);
    expect(result.columnLineage || []).toEqual([]);
    expect(result.hints.some(hint => /scope/i.test(hint.message))).toBe(true);
});
