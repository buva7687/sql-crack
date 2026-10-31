import { parseSqlBatch } from '../../../src/webview/sqlParser';

it('connects a WITH definition to both same-CTE UNION ALL references', () => {
    const result = parseSqlBatch('WITH c AS (SELECT id FROM source_table) SELECT id FROM c UNION ALL SELECT id FROM c', 'PostgreSQL').queries[0];
    expect(result.error).toBeUndefined();
    const definition = result.nodes.find(node => node.type === 'cte')!;
    const references = result.nodes.filter(node => node.type === 'table' && node.label === 'c');
    expect(references).toHaveLength(2);
    for (const reference of references) {
        expect(result.edges).toEqual(expect.arrayContaining([
            expect.objectContaining({ source: definition.id, target: reference.id })
        ]));
    }
});

it('includes both contributors to a parenthesized UNION summary by output ordinal', () => {
    const result = parseSqlBatch('SELECT id AS person FROM a UNION (SELECT customer_id AS buyer FROM b)', 'PostgreSQL').queries[0];
    expect(result.error).toBeUndefined();
    expect(result.columnLineage).toEqual([{ outputColumn: 'person', sources: [
        expect.objectContaining({ table: 'a', column: 'id' }),
        expect.objectContaining({ table: 'b', column: 'customer_id' })
    ] }]);
    expect(result.columnFlows?.map(flow => flow.lineagePath[0])).toEqual([
        expect.objectContaining({ nodeName: 'a', columnName: 'id' }),
        expect.objectContaining({ nodeName: 'b', columnName: 'customer_id' })
    ]);
});

it.each(['UNION', 'UNION ALL', 'UNION DISTINCT'])('keeps ordinal output names and all parenthesized %s contributors', operator => {
    const result = parseSqlBatch(`SELECT id AS output, name AS label FROM a ${operator} (SELECT customer_id AS other, title AS renamed FROM b UNION ALL SELECT buyer_id, description FROM c)`, 'PostgreSQL').queries[0];
    expect(result.error).toBeUndefined();
    expect(result.columnLineage.map(column => [column.outputColumn, column.sources.map(source => `${source.table}.${source.column}`)]))
        .toEqual([
            ['output', ['a.id', 'b.customer_id', 'c.buyer_id']],
            ['label', ['a.name', 'b.title', 'c.description']]
        ]);
    expect(result.columnFlows?.filter(flow => ['output', 'other', 'buyer_id'].includes(flow.outputColumn)).map(flow => flow.lineagePath[0].nodeName))
        .toEqual(['a', 'b', 'c']);
});

it.each(['UNION ALL', 'UNION DISTINCT'])('connects every parenthesized %s reference to its CTE definition', operator => {
    const result = parseSqlBatch(`WITH c AS (SELECT id FROM source_table) SELECT id FROM c ${operator} (SELECT id FROM c)`, 'PostgreSQL').queries[0];
    expect(result.error).toBeUndefined();
    const definition = result.nodes.find(node => node.type === 'cte')!;
    const references = result.nodes.filter(node => node.type === 'table' && node.label === 'c');
    expect(references).toHaveLength(2);
    for (const reference of references) {
        expect(reference.tableCategory).toBe('cte_reference');
        expect(result.edges.filter(edge => edge.source === definition.id && edge.target === reference.id)).toHaveLength(1);
    }
});

it('connects an inherited CTE through a derived container without crossing graph boundaries', () => {
    const sql = 'WITH c AS (SELECT id FROM source_table) SELECT id FROM (SELECT id FROM c UNION ALL SELECT id FROM c) derived UNION ALL SELECT id FROM unrelated';
    const result = parseSqlBatch(sql, 'PostgreSQL').queries[0];
    expect(result.error).toBeUndefined();
    const definition = result.nodes.find(node => node.type === 'cte')!;
    const derived = result.nodes.find(node => node.type === 'subquery')!;
    const references = derived.children!.filter(node => node.type === 'table' && node.label === 'c');
    expect(references).toHaveLength(2);
    expect(references.every(node => node.tableCategory === 'cte_reference')).toBe(true);
    expect(result.edges.filter(edge => edge.source === definition.id && edge.target === derived.id)).toHaveLength(1);
    const topIds = new Set(result.nodes.map(node => node.id));
    expect(result.edges.every(edge => topIds.has(edge.source) && topIds.has(edge.target))).toBe(true);
    expect(result.edges.some(edge => edge.source === definition.id && result.nodes.find(node => node.id === edge.target)?.label === 'unrelated')).toBe(false);
});

it('keeps compound CTE dependencies unique and scoped to their containers', () => {
    const sql = 'WITH c AS (SELECT id FROM source_table), combined AS (SELECT id FROM c UNION ALL SELECT id FROM c) SELECT id FROM combined UNION ALL SELECT id FROM combined';
    const result = parseSqlBatch(sql, 'PostgreSQL').queries[0];
    expect(result.error).toBeUndefined();
    const c = result.nodes.find(node => node.label === 'WITH c')!;
    const combined = result.nodes.find(node => node.label === 'WITH combined')!;
    expect(result.edges.filter(edge => edge.source === c.id && edge.target === combined.id)).toHaveLength(1);
    expect(combined.children!.filter(node => node.type === 'table').every(node => node.tableCategory === 'cte_reference')).toBe(true);
    for (const reference of result.nodes.filter(node => node.type === 'table' && node.label === 'combined')) {
        expect(result.edges.filter(edge => edge.source === combined.id && edge.target === reference.id)).toHaveLength(1);
    }
});

it('does not retain CTE definitions or categories in a later query', () => {
    parseSqlBatch('WITH c AS (SELECT id FROM a) SELECT id FROM c UNION ALL SELECT id FROM c', 'PostgreSQL');
    const result = parseSqlBatch('SELECT id FROM c UNION ALL SELECT id FROM c', 'PostgreSQL').queries[0];
    expect(result.nodes.some(node => node.type === 'cte')).toBe(false);
    expect(result.nodes.filter(node => node.type === 'table').every(node => node.tableCategory === 'physical')).toBe(true);
});

it.each([
    ['SELECT id FROM a EXCEPT (SELECT id FROM b UNION ALL SELECT id FROM c)', ['a.id']],
    ['SELECT id FROM a EXCEPT (SELECT id FROM b) UNION ALL SELECT id FROM c', ['a.id', 'c.id']],
    ['SELECT id FROM a UNION (SELECT id FROM b EXCEPT SELECT id FROM c)', ['a.id', 'b.id']],
])('keeps EXCEPT right-only operands as dependencies for %s', (sql, sources) => {
    const result = parseSqlBatch(sql, 'PostgreSQL').queries[0];
    expect(result.error).toBeUndefined();
    expect(result.nodes.filter(node => node.type === 'table').map(node => node.label)).toEqual(['a', 'b', 'c']);
    expect(result.columnLineage[0].sources.map(source => `${source.table}.${source.column}`)).toEqual(sources);
});
