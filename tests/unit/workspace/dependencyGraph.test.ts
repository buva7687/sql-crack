import { buildDependencyGraph } from '../../../src/workspace/dependencyGraph';
import { WorkspaceIndex, FileAnalysis, SchemaDefinition, TableReference } from '../../../src/workspace/types';

function createDefinition(filePath: string, name: string): SchemaDefinition {
    return {
        type: 'table',
        name,
        columns: [],
        filePath,
        lineNumber: 1,
        sql: `create table ${name} (id int);`,
    };
}

function createReference(filePath: string, tableName: string): TableReference {
    return {
        tableName,
        referenceType: 'select',
        filePath,
        lineNumber: 1,
        context: 'FROM',
    };
}

function createFileAnalysis(filePath: string, definition: SchemaDefinition, references: TableReference[]): FileAnalysis {
    return {
        filePath,
        fileName: filePath.split('/').pop() || filePath,
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
});

