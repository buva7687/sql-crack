import { parseSqlBatch } from '../../../src/webview/sqlParser';
import type { FlowEdge, FlowNode, SqlDialect } from '../../../src/webview/types';

type Graph = { nodes: FlowNode[]; edges: FlowEdge[] };
const scopes = ['top-level', 'CTE', 'derived table'] as const;
type Scope = typeof scopes[number];

function parseGraph(sql: string, scope: Scope = 'top-level', dialect: SqlDialect = 'PostgreSQL'): Graph {
    const wrapped = scope === 'CTE' ? `WITH combined AS (${sql}) SELECT * FROM combined`
        : scope === 'derived table' ? `SELECT * FROM (${sql}) combined` : sql;
    const result = parseSqlBatch(wrapped, dialect).queries[0];
    expect(result.error).toBeUndefined();
    expect(result.partial).not.toBe(true);
    if (scope === 'top-level') { return result; }
    const container = result.nodes.find(node => node.type === (scope === 'CTE' ? 'cte' : 'subquery'))!;
    return { nodes: container.children!, edges: container.childEdges! };
}

function reaches(graph: Graph, source: string, target: string, visited = new Set<string>()): boolean {
    if (source === target) { return true; }
    if (visited.has(source)) { return false; }
    visited.add(source);
    return graph.edges.filter(edge => edge.source === source).some(edge => reaches(graph, edge.target, target, visited));
}

it('applies trailing ORDER BY and LIMIT to the merged set, not the right SELECT', () => {
    const graph = parseGraph('SELECT id FROM users UNION ALL SELECT id FROM orders ORDER BY id LIMIT 5');
    const merge = graph.nodes.find(node => node.type === 'union')!;
    const sort = graph.nodes.find(node => node.type === 'sort')!;
    const limit = graph.nodes.find(node => node.type === 'limit')!;
    expect(reaches(graph, merge.id, sort.id)).toBe(true);
    expect(reaches(graph, sort.id, limit.id)).toBe(true);
    for (const table of graph.nodes.filter(node => node.type === 'table')) {
        expect(reaches(graph, table.id, merge.id)).toBe(true);
    }
});

it.each(scopes)('applies a three-branch global tail after the complete %s set', scope => {
    const graph = parseGraph('SELECT id FROM alpha UNION ALL SELECT id FROM beta UNION ALL SELECT id FROM gamma ORDER BY id LIMIT 5', scope);
    const sort = graph.nodes.find(node => node.type === 'sort')!;
    const limit = graph.nodes.find(node => node.type === 'limit')!;
    const merge = graph.nodes.find(node => node.type === 'union')!;
    expect(graph.nodes.filter(node => node.type === 'union')).toHaveLength(1);
    expect(reaches(graph, merge.id, sort.id)).toBe(true);
    expect(reaches(graph, sort.id, limit.id)).toBe(true);
    for (const table of graph.nodes.filter(node => node.type === 'table')) {
        expect(reaches(graph, table.id, merge.id)).toBe(true);
    }
});

it.each(scopes)('preserves parenthesized branch tails alongside a separate global tail in a %s', scope => {
    const graph = parseGraph('(SELECT id FROM alpha ORDER BY id LIMIT 1) UNION ALL (SELECT id FROM beta ORDER BY id LIMIT 2) ORDER BY id LIMIT 3', scope);
    const merge = graph.nodes.find(node => node.type === 'union')!;
    const limits = graph.nodes.filter(node => node.type === 'limit');
    const localOne = limits.find(node => node.details?.[0] === '1 rows')!;
    const localTwo = limits.find(node => node.details?.[0] === '2 rows')!;
    const global = limits.find(node => node.details?.[0] === '3 rows')!;
    expect(limits).toHaveLength(3);
    expect(graph.nodes.filter(node => node.type === 'sort')).toHaveLength(3);
    expect(reaches(graph, localOne.id, merge.id)).toBe(true);
    expect(reaches(graph, localTwo.id, merge.id)).toBe(true);
    expect(reaches(graph, merge.id, global.id)).toBe(true);
    expect(reaches(graph, localOne.id, localTwo.id)).toBe(false);
});

it.each(scopes)('keeps a right-parenthesized LIMIT local in a %s', scope => {
    const graph = parseGraph('SELECT id FROM alpha UNION (SELECT id FROM beta ORDER BY id LIMIT 2)', scope);
    const merge = graph.nodes.find(node => node.type === 'union')!;
    const limit = graph.nodes.find(node => node.type === 'limit')!;
    const alpha = graph.nodes.find(node => node.label === 'alpha')!;
    expect(merge).toBeDefined();
    expect(reaches(graph, limit.id, merge.id)).toBe(true);
    expect(reaches(graph, merge.id, limit.id)).toBe(false);
    expect(reaches(graph, alpha.id, limit.id)).toBe(false);
    expect(graph.nodes.some(node => node.type === 'join')).toBe(false);
});

function operationTree(graph: Graph): string {
    const byId = new Map(graph.nodes.map(node => [node.id, node]));
    const describe = (id: string): string => {
        const node = byId.get(id)!;
        if (node.type === 'table' || node.type === 'subquery') { return node.label; }
        const sources = graph.edges.filter(edge => edge.target === id).map(edge => edge.source);
        if (node.type === 'union') { return `(${sources.map(describe).join(` ${node.label} `)})`; }
        return describe(sources[0]);
    };
    const output = graph.nodes.find(node => !graph.edges.some(edge => edge.source === node.id))!;
    return describe(output.id);
}

it.each(scopes)('evaluates consecutive EXCEPT operations from left to right in a %s', scope => {
    expect(operationTree(parseGraph('SELECT id FROM alpha EXCEPT SELECT id FROM beta EXCEPT SELECT id FROM gamma', scope)))
        .toBe('((alpha EXCEPT beta) EXCEPT gamma)');
});

it.each(scopes)('honors a parenthesized right EXCEPT operand in a %s', scope => {
    expect(operationTree(parseGraph('SELECT id FROM alpha EXCEPT (SELECT id FROM beta EXCEPT SELECT id FROM gamma)', scope)))
        .toBe('(alpha EXCEPT (beta EXCEPT gamma))');
});

it.each([
    ['PostgreSQL', 'UNION', 'INTERSECT', '(alpha UNION (beta INTERSECT gamma))'],
    ['PostgreSQL', 'INTERSECT', 'UNION', '((alpha INTERSECT beta) UNION gamma)'],
    ['PostgreSQL', 'EXCEPT', 'UNION', '((alpha EXCEPT beta) UNION gamma)'],
    ['MySQL', 'UNION', 'INTERSECT', '(alpha UNION (beta INTERSECT gamma))'],
    ['Oracle', 'UNION', 'INTERSECT', '((alpha UNION beta) INTERSECT gamma)'],
] as const)('preserves %s precedence for %s followed by %s', (dialect, first, second, expected) => {
    expect(operationTree(parseGraph(`SELECT id FROM alpha ${first} SELECT id FROM beta ${second} SELECT id FROM gamma`, 'top-level', dialect)))
        .toBe(expected);
});

it('keeps explicit left grouping inside a derived table', () => {
    const result = parseSqlBatch('SELECT id FROM (SELECT id FROM alpha EXCEPT SELECT id FROM beta) grouped EXCEPT SELECT id FROM gamma', 'PostgreSQL').queries[0];
    expect(result.error).toBeUndefined();
    const group = result.nodes.find(node => node.type === 'subquery')!;
    expect(operationTree({ nodes: group.children!, edges: group.childEdges! })).toBe('(alpha EXCEPT beta)');
    expect(operationTree(result)).toBe('(grouped EXCEPT gamma)');
});

it('keeps a plain SELECT tail in its ordinary order', () => {
    const graph = parseGraph('SELECT id FROM alpha ORDER BY id LIMIT 1');
    const select = graph.nodes.find(node => node.type === 'select')!;
    const sort = graph.nodes.find(node => node.type === 'sort')!;
    const limit = graph.nodes.find(node => node.type === 'limit')!;
    expect(reaches(graph, select.id, sort.id)).toBe(true);
    expect(reaches(graph, sort.id, limit.id)).toBe(true);
    expect(graph.nodes.some(node => node.type === 'union')).toBe(false);
});

it('keeps a WITH definition in scope for every compound SELECT', () => {
    const result = parseSqlBatch('WITH c AS (SELECT id FROM source_table) SELECT id FROM c EXCEPT SELECT id FROM c', 'PostgreSQL').queries[0];
    expect(result.error).toBeUndefined();
    expect(result.nodes.filter(node => node.type === 'cte')).toHaveLength(1);
    expect(result.stats.ctes).toBe(1);
    const references = result.nodes.filter(node => node.type === 'table' && node.label === 'c');
    expect(references).toHaveLength(2);
    expect(references.every(node => node.tableCategory === 'cte_reference')).toBe(true);
});

it('does not let parentheses around a single right operand change outer operator precedence', () => {
    expect(operationTree(parseGraph('SELECT id FROM alpha UNION (SELECT id FROM beta) INTERSECT SELECT id FROM gamma')))
        .toBe('(alpha UNION (beta INTERSECT gamma))');
});

it('counts both UNION ALL subtrees when reusing a merge', () => {
    const graph = parseGraph('SELECT id FROM alpha UNION ALL SELECT id FROM beta UNION ALL (SELECT id FROM gamma UNION ALL SELECT id FROM delta)');
    const outputMerge = graph.nodes.find(node => node.type === 'union' && !graph.edges.some(edge => edge.source === node.id))!;
    expect(outputMerge.details).toEqual(['4 branches']);
});
