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
        version: 9, lastUpdated: 1, fileCount: 1, files: new Map([[filePath, analysis]]),
        fileHashes: new Map(), definitionMap, referenceMap: new Map(),
    };
    const graph = new LineageBuilder({ includeExternal: true, includeColumns: true, dialect }).buildFromIndex(index);
    return { graph, extracted };
}

describe('Workspace column lineage identities', () => {
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
