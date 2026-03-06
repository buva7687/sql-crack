import * as path from 'path';
import { buildDependencyGraph } from '../../../src/workspace/dependencyGraph';
import { WorkspaceIndex, FileAnalysis, SchemaDefinition, TableReference } from '../../../src/workspace/types';

function createDefinition(
    filePath: string,
    name: string,
    options: Partial<SchemaDefinition> = {}
): SchemaDefinition {
    return {
        type: options.type || 'table',
        name,
        schema: options.schema,
        statementIndex: options.statementIndex,
        columns: [],
        filePath,
        lineNumber: options.lineNumber || 1,
        sql: options.sql || `create table ${name} (id int);`,
        sourceQuery: options.sourceQuery,
    };
}

function createReference(
    filePath: string,
    tableName: string,
    options: Partial<TableReference> = {}
): TableReference {
    return {
        tableName,
        schema: options.schema,
        alias: options.alias,
        referenceType: options.referenceType || 'select',
        filePath,
        lineNumber: options.lineNumber || 1,
        context: options.context || 'FROM',
        statementIndex: options.statementIndex,
        columns: options.columns,
    };
}

function createFileAnalysis(filePath: string, definition: SchemaDefinition, references: TableReference[]): FileAnalysis {
    return {
        filePath,
        fileName: path.basename(filePath),
        lastModified: Date.now(),
        contentHash: `${filePath}-hash`,
        definitions: [definition],
        references,
    };
}

function createIndex(files: FileAnalysis[]): WorkspaceIndex {
    const fileMap = new Map<string, FileAnalysis>();
    const definitionMap = new Map<string, SchemaDefinition[]>();
    const referenceMap = new Map<string, TableReference[]>();
    const fileHashes = new Map<string, string>();

    for (const file of files) {
        fileMap.set(file.filePath, file);
        fileHashes.set(file.filePath, file.contentHash);

        for (const definition of file.definitions) {
            const key = definition.name.toLowerCase();
            const defs = definitionMap.get(key) || [];
            defs.push(definition);
            definitionMap.set(key, defs);
        }

        for (const reference of file.references) {
            const key = reference.tableName.toLowerCase();
            const refs = referenceMap.get(key) || [];
            refs.push(reference);
            referenceMap.set(key, refs);
        }
    }

    return {
        version: 1,
        lastUpdated: Date.now(),
        fileCount: files.length,
        files: fileMap,
        fileHashes,
        definitionMap,
        referenceMap,
    };
}

describe('workspace dependency graph layout and cycle detection', () => {
    it('uses dynamic canvas sizing so small graphs are not centered in a huge fixed-width space', () => {
        const fileA = '/repo/a.sql';
        const fileB = '/repo/b.sql';

        const index = createIndex([
            createFileAnalysis(fileA, createDefinition(fileA, 'orders'), []),
            createFileAnalysis(fileB, createDefinition(fileB, 'payments'), [createReference(fileB, 'orders')]),
        ]);

        const graph = buildDependencyGraph(index, 'files');
        const maxX = Math.max(...graph.nodes.map(node => node.x));

        expect(maxX).toBeLessThan(1000);
    });

    it('detects multi-file cycles beyond simple bidirectional pairs', () => {
        const fileA = '/repo/a.sql';
        const fileB = '/repo/b.sql';
        const fileC = '/repo/c.sql';

        const index = createIndex([
            createFileAnalysis(fileA, createDefinition(fileA, 'table_a'), [createReference(fileA, 'table_b')]),
            createFileAnalysis(fileB, createDefinition(fileB, 'table_b'), [createReference(fileB, 'table_c')]),
            createFileAnalysis(fileC, createDefinition(fileC, 'table_c'), [createReference(fileC, 'table_a')]),
        ]);

        const graph = buildDependencyGraph(index, 'files');
        const cycles = graph.stats.circularDependencies;

        expect(cycles).toHaveLength(1);
        expect(cycles[0]).toContain('a.sql');
        expect(cycles[0]).toContain('b.sql');
        expect(cycles[0]).toContain('c.sql');
        expect(cycles[0]).not.toContain('<->');
    });

    it('scopes table-mode view edges to the matching statement when a file defines multiple views', () => {
        const viewsFile = '/repo/views.sql';
        const sourceAFile = '/repo/source_a.sql';
        const sourceBFile = '/repo/source_b.sql';

        const viewsAnalysis: FileAnalysis = {
            filePath: viewsFile,
            fileName: path.basename(viewsFile),
            lastModified: Date.now(),
            contentHash: `${viewsFile}-hash`,
            definitions: [
                createDefinition(viewsFile, 'view_a', {
                    type: 'view',
                    lineNumber: 1,
                    statementIndex: 0,
                    sql: 'CREATE VIEW view_a AS SELECT * FROM source_a;'
                }),
                createDefinition(viewsFile, 'view_b', {
                    type: 'view',
                    lineNumber: 5,
                    statementIndex: 1,
                    sql: 'CREATE VIEW view_b AS SELECT * FROM source_b;'
                }),
            ],
            references: [
                createReference(viewsFile, 'source_a', { statementIndex: 0, lineNumber: 2 }),
                createReference(viewsFile, 'source_b', { statementIndex: 1, lineNumber: 6 }),
            ],
        };

        const index = createIndex([
            viewsAnalysis,
            createFileAnalysis(sourceAFile, createDefinition(sourceAFile, 'source_a'), []),
            createFileAnalysis(sourceBFile, createDefinition(sourceBFile, 'source_b'), []),
        ]);

        const graph = buildDependencyGraph(index, 'tables');
        const labelById = new Map(graph.nodes.map(node => [node.id, node.label]));
        const edgesBySourceLabel = new Map<string, string[]>();
        for (const edge of graph.edges) {
            const sourceLabel = labelById.get(edge.source) || '';
            const targetLabel = labelById.get(edge.target) || '';
            if (!edgesBySourceLabel.has(sourceLabel)) {
                edgesBySourceLabel.set(sourceLabel, []);
            }
            edgesBySourceLabel.get(sourceLabel)!.push(targetLabel);
        }

        expect(edgesBySourceLabel.get('view_a')).toEqual(['source_a']);
        expect(edgesBySourceLabel.get('view_b')).toEqual(['source_b']);
    });
});
