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

it('resolves unqualified UNION sources per branch and merges outputs by ordinal', () => {
    const result = parseSql('SELECT id AS person FROM users UNION ALL SELECT customer_id AS buyer FROM orders', 'PostgreSQL');
    expect(result.error).toBeUndefined();
    expect(result.columnLineage).toEqual([{ outputColumn: 'person', sources: [
        expect.objectContaining({ table: 'users', column: 'id' }),
        expect.objectContaining({ table: 'orders', column: 'customer_id' }),
    ] }]);
    expect(result.columnFlows?.map(flow => flow.lineagePath[0])).toEqual([
        expect.objectContaining({ nodeType: 'table', nodeName: 'users', columnName: 'id' }),
        expect.objectContaining({ nodeType: 'table', nodeName: 'orders', columnName: 'customer_id' }),
    ]);
});

it('keeps repeated table aliases in different UNION branches attached to different instances', () => {
    const result = parseSql('SELECT e.id AS person FROM employees e UNION ALL SELECT e.manager_id AS boss FROM employees e', 'PostgreSQL');
    const sources = result.columnLineage![0].sources;
    expect(sources.map(source => source.column)).toEqual(['id', 'manager_id']);
    expect(new Set(sources.map(source => source.nodeId)).size).toBe(2);
    expect(result.columnFlows?.map(flow => flow.lineagePath[0].nodeId)).toEqual(sources.map(source => source.nodeId));
});

it('does not assign an ambiguous unqualified branch column to a table in another UNION branch', () => {
    const result = parseSql('SELECT id AS person FROM users JOIN teams ON users.team_id=teams.id UNION ALL SELECT customer_id FROM orders', 'PostgreSQL');
    expect(result.columnLineage![0].sources).toEqual([expect.objectContaining({ table: 'orders', column: 'customer_id' })]);
    expect(result.columnFlows![0].lineagePath.every(step => step.nodeType !== 'table')).toBe(true);
    expect(result.columnFlows![1].lineagePath[0].nodeName).toBe('orders');
});

it('merges three UNION branches by ordinal while keeping duplicate output names separate', () => {
    const result = parseSql('SELECT id, name AS id FROM users UNION ALL SELECT customer_id, title FROM orders UNION ALL SELECT buyer_id, label FROM buyers', 'PostgreSQL');
    expect(result.columnLineage?.map(column => [column.outputColumn, column.sources.map(source => source.column)])).toEqual([
        ['id', ['id', 'customer_id', 'buyer_id']],
        ['id', ['name', 'title', 'label']],
    ]);
});

it('does not count a scalar subquery table as a FROM source for an unqualified UNION output', () => {
    const result = parseSql('SELECT id,(SELECT max(id) FROM other) AS maximum FROM users UNION ALL SELECT id,1 FROM orders', 'PostgreSQL');
    expect(result.columnLineage![0].sources.map(source => source.table)).toEqual(['users', 'orders']);
    expect(result.columnFlows?.filter(flow => flow.outputColumn === 'id').map(flow => flow.lineagePath[0].nodeName)).toEqual(['users', 'orders']);
});
