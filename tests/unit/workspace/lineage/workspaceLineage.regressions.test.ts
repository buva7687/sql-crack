import { SchemaExtractor, ReferenceExtractor } from '../../../../src/workspace/extraction';
import { LineageBuilder, ColumnLineageTracker } from '../../../../src/workspace/lineage';
import { getQualifiedKey } from '../../../../src/workspace/identifiers';
import type { WorkspaceIndex, FileAnalysis, SchemaDefinition, SqlDialect } from '../../../../src/workspace/types';

function analyze(sql: string, dialect: SqlDialect = 'PostgreSQL') {
    const filePath = '/workspace-lineage.sql';
    const definitions = new SchemaExtractor().extractDefinitions(sql, filePath, dialect);
    const extracted = new ReferenceExtractor().extractReferencesWithStatus(sql, filePath, dialect);
    expect(extracted.warnings).toEqual([]);
    const analysis: FileAnalysis = {
        filePath, fileName: 'workspace-lineage.sql', lastModified: 1, contentHash: 'hash',
        definitions, references: extracted.references, queries: extracted.queries,
    };
    const definitionMap = new Map<string, SchemaDefinition[]>();
    for (const definition of definitions) {
        const key = getQualifiedKey(definition.name, definition.schema, definition);
        definitionMap.set(key, [...(definitionMap.get(key) || []), definition]);
    }
    const index: WorkspaceIndex = {
        version: 10, lastUpdated: 1, fileCount: 1, files: new Map([[filePath, analysis]]),
        fileHashes: new Map(), definitionMap, referenceMap: new Map(),
    };
    const graph = new LineageBuilder({ includeExternal: true, includeColumns: true, dialect }).buildFromIndex(index);
    return { graph, extracted };
}

describe('Workspace column lineage identities', () => {
    it('retains a parenthesized UNION DISTINCT value arm in BigQuery', () => {
        const { graph } = analyze(`
            CREATE TABLE a (id INT64); CREATE TABLE b (other_id INT64); CREATE TABLE target (x INT64);
            INSERT INTO target(x) SELECT id FROM a UNION DISTINCT (SELECT other_id FROM b);
        `, 'BigQuery');
        expect(graph.columnEdges.filter(edge => edge.targetTableId === 'table:target').map(edge => [edge.sourceTableId, edge.sourceColumnName, edge.targetColumnName]))
            .toEqual([['table:a', 'id', 'x'], ['table:b', 'other_id', 'x']]);
    });

    it('does not map a wildcard arm onto just the first compound output', () => {
        const { graph } = analyze(`
            CREATE TABLE a (a1 INT, a2 INT); CREATE TABLE b (b1 INT, b2 INT);
            CREATE VIEW u AS SELECT a1 AS x, a2 AS y FROM a UNION ALL SELECT * FROM b;
        `);
        expect(graph.columnEdges.filter(edge => edge.targetTableId === 'view:u').map(edge => [edge.sourceTableId, edge.sourceColumnName, edge.targetColumnName]))
            .toEqual([['table:a', 'a1', 'x'], ['table:a', 'a2', 'y']]);
    });

    it('does not invent output ordinals after an unresolved leading wildcard', () => {
        const { graph } = analyze(`
            CREATE TABLE a (a1 INT, a2 INT); CREATE TABLE b (b1 INT, b2 INT);
            CREATE VIEW u AS SELECT * FROM a UNION ALL SELECT b1, b2 FROM b;
        `);
        expect(graph.columnEdges.filter(edge => edge.targetTableId === 'view:u')).toEqual([]);
        expect(graph.edges.filter(edge => edge.targetId === 'view:u').map(edge => edge.sourceId).sort())
            .toEqual(['table:a', 'table:b']);
    });

    it.each([
        ['SELECT * FROM a UNION ALL SELECT b1, b2 FROM b', [['table:b', 'b1', 'x'], ['table:b', 'b2', 'y']]],
        ['SELECT a1, a2 FROM a UNION ALL SELECT * FROM b', [['table:a', 'a1', 'x'], ['table:a', 'a2', 'y']]],
    ])('uses explicit destination ordinals while omitting an unresolved wildcard: %s', (query, expected) => {
        const { graph } = analyze(`
            CREATE TABLE a (a1 INT, a2 INT); CREATE TABLE b (b1 INT, b2 INT);
            CREATE VIEW u (x, y) AS ${query};
        `);
        expect(graph.columnEdges.filter(edge => edge.targetTableId === 'view:u').map(edge => [edge.sourceTableId, edge.sourceColumnName, edge.targetColumnName]))
            .toEqual(expected);
    });

    it('preserves significant whitespace in a quoted canonical CTE key', () => {
        const { graph } = analyze(`
            CREATE TABLE a (id INT); CREATE TABLE b (id INT);
            CREATE VIEW v (x) AS WITH " Foo " AS (SELECT id FROM a), "Foo" AS (SELECT id FROM b)
                SELECT id FROM " Foo ";
        `);
        const ctes = [...graph.nodes.values()].filter(node => node.type === 'cte');
        const spaced = ctes.find(node => node.name === ' Foo ')!;
        const plain = ctes.find(node => node.name === 'Foo')!;
        expect(spaced).toBeDefined();
        expect(plain).toBeDefined();
        expect(spaced.id).not.toBe(plain.id);
        expect(graph.columnEdges.filter(edge => edge.targetTableId === 'view:v').map(edge => edge.sourceTableId))
            .toEqual([spaced.id]);
    });

    it.each([
        ['SELECT id FROM a EXCEPT SELECT id FROM b', ['a'], ['a', 'b']],
        ['SELECT id FROM a INTERSECT SELECT id FROM b', ['a'], ['a', 'b']],
        ['SELECT id FROM a EXCEPT SELECT id FROM b UNION SELECT id FROM c', ['a', 'c'], ['a', 'b', 'c']],
        ['SELECT id FROM a UNION SELECT id FROM b INTERSECT SELECT id FROM c', ['a', 'b'], ['a', 'b', 'c']],
        ['SELECT id FROM a EXCEPT (SELECT id FROM b UNION SELECT id FROM c)', ['a'], ['a', 'b', 'c']],
    ])('preserves value provenance and table dependencies for %s', (query, values, dependencies) => {
        const { graph } = analyze(`
            CREATE TABLE a (id INT); CREATE TABLE b (id INT); CREATE TABLE c (id INT);
            CREATE TABLE target (id INT); INSERT INTO target(id) ${query};
        `);
        expect(graph.columnEdges.filter(edge => edge.targetTableId === 'table:target').map(edge => edge.sourceTableId))
            .toEqual((values as string[]).map(name => `table:${name}`));
        expect(graph.edges.filter(edge => edge.targetId === 'table:target').map(edge => edge.sourceId).sort())
            .toEqual((dependencies as string[]).map(name => `table:${name}`).sort());
    });

    it('keeps a quoted CTE binding separate from its folded sibling', () => {
        const { graph } = analyze(`
            CREATE TABLE a (id INT);
            CREATE TABLE b (id INT);
            CREATE VIEW v (x) AS WITH "Foo" AS (SELECT id FROM a), foo AS (SELECT id FROM b)
                SELECT f.id FROM "Foo" f;
        `);
        const quoted = [...graph.nodes.values()].find(node => node.type === 'cte' && node.name === 'Foo')!;
        expect(graph.columnEdges.filter(edge => edge.targetTableId === 'view:v')).toEqual([
            expect.objectContaining({ sourceTableId: quoted.id, sourceColumnName: 'id', targetColumnName: 'x' }),
        ]);
    });

    it.each<[SqlDialect, string]>([
        ['PostgreSQL', 'Foo'], ['MySQL', 'Foo'], ['Snowflake', 'foo'], ['Oracle', 'foo'],
    ])('uses the canonical CTE target key for %s %s', (dialect, name) => {
        const { graph } = analyze(`
            CREATE TABLE source_data (id INT);
            CREATE VIEW output_data (id) AS WITH ${name} AS (SELECT id FROM source_data)
                SELECT id FROM ${name};
        `, dialect);
        const cte = [...graph.nodes.values()].find(node => node.type === 'cte')!;
        expect(graph.columnEdges).toEqual(expect.arrayContaining([
            expect.objectContaining({ sourceTableId: dialect === 'Snowflake' || dialect === 'Oracle' ? 'table:SOURCE_DATA' : 'table:source_data', targetTableId: cte.id }),
            expect.objectContaining({ sourceTableId: cte.id, targetTableId: dialect === 'Snowflake' || dialect === 'Oracle' ? 'view:OUTPUT_DATA' : 'view:output_data' }),
        ]));
    });

    it.each<SqlDialect>(['PostgreSQL', 'Snowflake'])('retains a lone quoted CTE source in %s', (dialect) => {
        const { graph } = analyze(`
            CREATE TABLE a (id INT);
            CREATE VIEW v (x) AS WITH "Foo" AS (SELECT id FROM a) SELECT f.id FROM "Foo" f;
        `, dialect);
        const cte = [...graph.nodes.values()].find(node => node.type === 'cte')!;
        expect(graph.columnEdges.filter(edge => edge.targetTableId === (dialect === 'Snowflake' ? 'view:V' : 'view:v')))
            .toEqual([expect.objectContaining({ sourceTableId: cte.id, targetColumnName: 'x' })]);
    });

    it('preserves UNION contributors by output ordinal and scopes repeated aliases to each branch', () => {
        const { graph } = analyze(`
            CREATE TABLE a (id INT, amount INT);
            CREATE TABLE b (customer_id INT, total INT);
            CREATE TABLE c (user_id INT, price INT);
            CREATE TABLE combined (person INT, value INT);
            INSERT INTO combined(person, value)
                SELECT s.id AS ignored_id, s.amount AS ignored_amount FROM a s
                UNION ALL SELECT s.customer_id AS other_id, s.total AS other_amount FROM b s
                UNION ALL SELECT s.user_id, s.price FROM c s;
        `);
        expect(graph.columnEdges.map(edge => `${edge.sourceTableId}.${edge.sourceColumnName}->${edge.targetTableId}.${edge.targetColumnName}`))
            .toEqual([
                'table:a.id->table:combined.person', 'table:a.amount->table:combined.value',
                'table:b.customer_id->table:combined.person', 'table:b.total->table:combined.value',
                'table:c.user_id->table:combined.person', 'table:c.price->table:combined.value',
            ]);
    });

    it('preserves UNION branches inside a CTE and resolves inherited CTE sources in later branches', () => {
        const { graph } = analyze(`
            CREATE TABLE a (id INT);
            CREATE TABLE b (other_id INT);
            CREATE TABLE combined (id INT);
            INSERT INTO combined(id)
                WITH rows AS (SELECT id FROM a UNION ALL SELECT other_id FROM b)
                SELECT id FROM rows UNION ALL SELECT id FROM rows;
        `);
        const cte = [...graph.nodes.values()].find(node => node.type === 'cte' && node.name === 'rows')!;
        expect(cte).toBeDefined();
        expect(graph.columnEdges).toEqual(expect.arrayContaining([
            expect.objectContaining({ sourceTableId: 'table:a', sourceColumnName: 'id', targetTableId: cte.id, targetColumnName: 'id' }),
            expect.objectContaining({ sourceTableId: 'table:b', sourceColumnName: 'other_id', targetTableId: cte.id, targetColumnName: 'id' }),
            expect.objectContaining({ sourceTableId: cte.id, sourceColumnName: 'id', targetTableId: 'table:combined', targetColumnName: 'id' }),
        ]));
        expect(graph.columnEdges).toHaveLength(3);
    });

    it('keeps a parenthesized UNION branch CTE independent when it shadows an outer CTE', () => {
        const { graph } = analyze(`
            CREATE TABLE a (id INT);
            CREATE TABLE b (other_id INT);
            CREATE TABLE combined (person INT);
            INSERT INTO combined(person)
                WITH rows AS (SELECT id FROM a)
                SELECT id FROM rows
                UNION ALL (WITH rows AS (SELECT other_id AS id FROM b) SELECT id FROM rows);
        `);
        const ctes = [...graph.nodes.values()].filter(node => node.type === 'cte' && node.name === 'rows');
        expect(ctes).toHaveLength(2);
        const aCte = graph.columnEdges.find(edge => edge.sourceTableId === 'table:a')!.targetTableId;
        const bCte = graph.columnEdges.find(edge => edge.sourceTableId === 'table:b')!.targetTableId;
        expect(aCte).not.toBe(bCte);
        expect(graph.columnEdges.filter(edge => edge.targetTableId === 'table:combined').map(edge => edge.sourceTableId))
            .toEqual([aCte, bCte]);
        expect(graph.columnEdges.filter(edge => edge.targetTableId === 'table:combined').map(edge => edge.targetColumnName))
            .toEqual(['person', 'person']);
    });

    it('preserves schema-qualified column sources when a basename collides', () => {
        const { graph } = analyze(`
            CREATE TABLE orders (id INT);
            CREATE TABLE sales.orders (id INT);
            CREATE VIEW sales.order_ids (id) AS SELECT o.id FROM sales.orders o;
        `);
        expect(graph.columnEdges).toEqual([
            expect.objectContaining({ sourceTableId: 'table:sales.orders', sourceColumnName: 'id', targetTableId: 'view:sales.order_ids', targetColumnName: 'id' }),
        ]);
    });

    it('keeps quoted case-distinct tables separate in both tracing APIs', () => {
        const { graph } = analyze(`
            CREATE TABLE "Data" (id INT);
            CREATE TABLE data (id INT);
            CREATE VIEW upper_out (id) AS SELECT id FROM "Data";
            CREATE VIEW lower_out (id) AS SELECT id FROM data;
        `);
        const tracker = new ColumnLineageTracker(graph);
        expect(tracker.getColumnLineagePaths(graph, 'table:Data', 'id').downstream.map(path => path.targetTableId))
            .toEqual(['view:upper_out']);
        expect(tracker.getFullColumnLineage(graph, 'table:Data', 'id').downstream.flatMap(path => path.edges.map(edge => edge.targetId)))
            .toEqual(['view:upper_out']);
        expect(tracker.getFullColumnLineage(graph, 'view:lower_out', 'id').upstream.flatMap(path => path.edges.map(edge => edge.sourceId)))
            .toEqual(['table:data']);
    });

    it('traces case-distinct quoted columns using their canonical column IDs', () => {
        const { graph } = analyze(`
            CREATE TABLE source_data ("ID" INT, id INT);
            CREATE VIEW upper_out (id) AS SELECT "ID" FROM source_data;
            CREATE VIEW lower_out (id) AS SELECT id FROM source_data;
        `);
        const tracker = new ColumnLineageTracker(graph);
        expect(tracker.getColumnLineagePaths(graph, 'table:source_data', 'ID').downstream.map(path => path.targetTableId))
            .toEqual(['view:upper_out']);
        expect(tracker.getColumnLineagePaths(graph, 'table:source_data', 'id').downstream.map(path => path.targetTableId))
            .toEqual(['view:lower_out']);
        expect(tracker.getFullColumnLineage(graph, 'table:source_data', 'Id').downstream).toEqual([]);
    });
});
