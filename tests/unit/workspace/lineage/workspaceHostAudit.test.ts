import { SchemaExtractor, ReferenceExtractor } from '../../../../src/workspace/extraction';
import { FlowAnalyzer, ImpactAnalyzer, LineageBuilder } from '../../../../src/workspace/lineage';
import { buildDependencyGraph } from '../../../../src/workspace/dependencyGraph';
import { getQualifiedKey } from '../../../../src/workspace/identifiers';
import { ImpactView } from '../../../../src/workspace/ui/impactView';
import { LineageGraphRenderer } from '../../../../src/workspace/ui/lineageGraphRenderer';
import type { SqlDialect, WorkspaceIndex } from '../../../../src/workspace/types';

function analyze(files: Record<string, string>, dialect: SqlDialect = 'PostgreSQL') {
    const index: WorkspaceIndex = {
        version: 12, lastUpdated: 1, fileCount: Object.keys(files).length,
        files: new Map(), fileHashes: new Map(), definitionMap: new Map(), referenceMap: new Map(),
    };
    for (const [fileName, sql] of Object.entries(files)) {
        const filePath = '/audit/' + fileName;
        const schema = new SchemaExtractor().extractDefinitionsWithStatus(sql, filePath, dialect);
        const parsed = new ReferenceExtractor().extractReferencesWithStatus(sql, filePath, dialect);
        expect([...schema.warnings, ...parsed.warnings]).toEqual([]);
        index.files.set(filePath, {
            filePath, fileName, lastModified: 1, contentHash: 'fixture',
            definitions: schema.definitions, references: parsed.references, queries: parsed.queries,
        });
        for (const def of schema.definitions) {
            const key = getQualifiedKey(def.name, def.schema, def);
            index.definitionMap.set(key, [...(index.definitionMap.get(key) ?? []), def]);
        }
        for (const ref of parsed.references) {
            const key = getQualifiedKey(ref.tableName, ref.schema, ref);
            index.referenceMap.set(key, [...(index.referenceMap.get(key) ?? []), ref]);
        }
    }
    const graph = new LineageBuilder({ includeExternal: true, includeColumns: true, dialect }).buildFromIndex(index);
    const columns = graph.columnEdges.map(edge =>
        [edge.sourceTableId, edge.sourceColumnName, edge.targetTableId, edge.targetColumnName]);
    return { index, graph, columns };
}

const source = { 'source.sql': 'CREATE TABLE source(raw int,id int);' };
const later = { 'later.sql': 'CREATE TABLE later(raw int);' };
const target = { 'target.sql': 'CREATE TABLE target(id int,value int);' };

describe('Workspace host audit regressions', () => {
    test('earlier and self-named nonrecursive CTE bodies see physical relations', () => {
        const { graph, index, columns } = analyze({
            ...source, ...later,
            'report.sql': `CREATE VIEW report AS
                WITH a AS (SELECT raw FROM later), later AS (SELECT raw FROM source)
                SELECT raw FROM a;
                CREATE VIEW another AS WITH source AS (SELECT raw FROM source) SELECT raw FROM source;`,
        });
        const first = [...graph.nodes.values()].find(node => node.type === 'cte' && node.name === 'a')!;
        const selfNamed = [...graph.nodes.values()].find(node => node.type === 'cte' && node.name === 'source')!;
        const references = index.files.get('/audit/report.sql')!.references;
        expect(references.some(ref => ref.tableName === 'later')).toBe(true);
        expect(columns).toEqual(expect.arrayContaining([
            ['table:later', 'raw', first.id, 'raw'],
            ['table:source', 'raw', selfNamed.id, 'raw'],
        ]));
        expect(columns).not.toContainEqual([selfNamed.id, 'raw', selfNamed.id, 'raw']);
    });

    test('recursive CTE references stay in scope while physical seed references remain indexed', () => {
        const { graph, index } = analyze({
            ...source,
            'report.sql': `CREATE VIEW report AS WITH RECURSIVE c(id) AS (
                SELECT id FROM source UNION ALL SELECT id + 1 FROM c WHERE id < 10
            ) SELECT id FROM c;`,
        });
        const references = index.files.get('/audit/report.sql')!.references;
        expect(references.map(ref => ref.tableName)).toEqual(['source']);
        const cte = [...graph.nodes.values()].find(node => node.type === 'cte' && node.name === 'c')!;
        expect(graph.columnEdges).toEqual(expect.arrayContaining([
            expect.objectContaining({ sourceTableId: 'table:source', targetTableId: cte.id, targetColumnName: 'id' }),
            expect.objectContaining({ sourceTableId: cte.id, targetTableId: 'view:report' }),
        ]));
    });

    test('declared CTE column names connect incoming and outgoing edges', () => {
        const { graph, columns } = analyze({
            ...source,
            'report.sql': 'CREATE VIEW report AS WITH c(renamed) AS (SELECT raw FROM source) SELECT renamed FROM c;',
        });
        const cte = [...graph.nodes.values()].find(node => node.type === 'cte')!;
        expect(columns).toEqual([
            ['table:source', 'raw', cte.id, 'renamed'],
            [cte.id, 'renamed', 'view:report', 'renamed'],
        ]);
    });

    test('a partial CTE column list keeps the other output names', () => {
        const { graph, columns } = analyze({
            ...source,
            'report.sql': 'CREATE VIEW report AS WITH c(renamed) AS (SELECT raw, id FROM source) SELECT id FROM c;',
        });
        const cte = [...graph.nodes.values()].find(node => node.type === 'cte')!;
        expect(columns).toEqual([
            ['table:source', 'raw', cte.id, 'renamed'],
            ['table:source', 'id', cte.id, 'id'],
            [cte.id, 'id', 'view:report', 'id'],
        ]);
    });

    test.each([
        'SELECT d.x FROM (SELECT raw AS x FROM source) d',
        'SELECT x FROM (SELECT raw AS x FROM source) d',
        'SELECT (SELECT MAX(s.raw) FROM source s) AS x FROM later',
        'SELECT 1 + (SELECT MAX(s.raw) FROM source s) AS x FROM later',
    ])('traces the nested projection in %s', projection => {
        const { columns } = analyze({ ...source, ...later, 'report.sql': 'CREATE VIEW report AS ' + projection });
        expect(columns).toEqual([['table:source', 'raw', 'view:report', 'x']]);
    });

    test('traces a derived output through the CTE declared inside it', () => {
        const { graph, columns } = analyze({
            ...source,
            'report.sql': `CREATE VIEW report AS
                SELECT d.x FROM (WITH c AS (SELECT raw FROM source) SELECT raw AS x FROM c) d;`,
        });
        const cte = [...graph.nodes.values()].find(node => node.type === 'cte')!;
        expect(columns).toEqual([
            ['table:source', 'raw', cte.id, 'raw'],
            [cte.id, 'raw', 'view:report', 'x'],
        ]);
    });

    test('qualified source falls back to the same unqualified definition for table and column lineage', () => {
        const { graph, columns } = analyze({
            ...source, 'report.sql': 'CREATE VIEW report AS SELECT raw FROM public.source;',
        });
        expect(graph.edges).toEqual(expect.arrayContaining([
            expect.objectContaining({ sourceId: 'table:source', targetId: 'view:report' }),
        ]));
        expect(columns).toEqual([['table:source', 'raw', 'view:report', 'raw']]);
    });

    test('binds PostgreSQL quoted and unquoted uppercase columns to distinct IDs', () => {
        const { graph } = analyze({
            'source.sql': 'CREATE TABLE source("ID" int,id int);',
            'report.sql': 'CREATE VIEW report AS SELECT ID AS selected_id, "ID" AS quoted_id FROM source;',
        });
        expect(graph.columnEdges.map(edge => [edge.sourceColumnId, edge.targetColumnName])).toEqual([
            ['column:source.id', 'selected_id'],
            ['column:source.ID', 'quoted_id'],
        ]);
    });

    test('uses real target column ordinals for an implicit INSERT list', () => {
        const { columns } = analyze({
            ...source, ...target, 'etl.sql': 'INSERT INTO target SELECT raw,id FROM source;',
        });
        expect(columns).toEqual([
            ['table:source', 'raw', 'table:target', 'id'],
            ['table:source', 'id', 'table:target', 'value'],
        ]);
    });

    test('does not guess implicit destination ordinals past an unresolved wildcard', () => {
        const { columns } = analyze({
            ...source, ...target, 'etl.sql': 'INSERT INTO target SELECT source.*, raw FROM source;',
        });
        expect(columns).toEqual([]);
    });

    test('maps known UNION ordinals to implicit destinations even when an earlier arm has a wildcard', () => {
        const { columns } = analyze({
            ...source, ...target,
            'etl.sql': 'INSERT INTO target SELECT source.* FROM source UNION ALL SELECT id, raw FROM source;',
        });
        expect(columns).toEqual([
            ['table:source', 'id', 'table:target', 'id'],
            ['table:source', 'raw', 'table:target', 'value'],
        ]);
    });

    test('attributes MySQL joined UPDATE assignments to their respective write relations', () => {
        const { graph, columns } = analyze({
            ...source, ...target,
            'etl.sql': 'UPDATE target t JOIN source s ON t.id=s.id SET s.raw=t.value,t.value=s.id;',
        }, 'MySQL');
        expect(columns).toEqual([
            ['table:target', 'value', 'table:source', 'raw'],
            ['table:source', 'id', 'table:target', 'value'],
        ]);
        expect(graph.edges).toEqual(expect.arrayContaining([
            expect.objectContaining({ sourceId: 'table:target', targetId: 'table:source' }),
            expect.objectContaining({ sourceId: 'table:source', targetId: 'table:target' }),
        ]));
    });

    test('makes inferred view columns selectable in the renderer', () => {
        const { graph } = analyze({
            ...source, 'report.sql': 'CREATE VIEW report AS SELECT raw AS normalized FROM source;',
        });
        const renderer = new LineageGraphRenderer(graph);
        const rendered = renderer.buildGraph({
            centerNodeId: 'view:report', depth: 4, direction: 'both', expandedNodes: new Set(['view:report']),
        });
        expect(rendered.nodes.find(node => node.id === 'view:report')?.columns?.map(column => column.name))
            .toEqual(['normalized']);
    });

    test('counts repeat statement occurrences and their file while exposing one table edge', () => {
        const insert = 'INSERT INTO target (value) SELECT raw FROM source;';
        const { graph, index } = analyze({
            'ddl.sql': source['source.sql'] + target['target.sql'], 'etl.sql': insert + '\n' + insert,
        });
        const report = new ImpactAnalyzer(graph, new FlowAnalyzer(graph)).analyzeTableChange('source');
        expect(report.summary).toMatchObject({ queriesAffected: 2, filesAffected: 2 });
        expect(report.affectedFiles).toEqual(['/audit/ddl.sql', '/audit/etl.sql']);
        const html = new ImpactView().generateImpactReport(report);
        const fileList = /data-title="Files" data-list="([^"]+)"/.exec(html)?.[1];
        expect(fileList && JSON.parse(decodeURIComponent(fileList))).toEqual([
            { label: 'ddl.sql', title: '/audit/ddl.sql' },
            { label: 'etl.sql', title: '/audit/etl.sql' },
        ]);
        expect(graph.edges.filter(edge => edge.sourceId === 'table:source' && edge.targetId === 'table:target'))
            .toHaveLength(1);
        const tables = buildDependencyGraph(index, 'tables');
        const idsByLabel = new Map(tables.nodes.map(node => [node.label, node.id]));
        expect(tables.edges).toEqual([expect.objectContaining({
            source: idsByLabel.get('target'), target: idsByLabel.get('source'), referenceType: 'insert', count: 2,
            references: [
                expect.objectContaining({ filePath: '/audit/etl.sql', lineNumber: 1 }),
                expect.objectContaining({ filePath: '/audit/etl.sql', lineNumber: 2 }),
            ],
        })]);
    });
});
