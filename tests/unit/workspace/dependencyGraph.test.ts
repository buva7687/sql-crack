import * as path from 'path';
import { buildDependencyGraph } from '../../../src/workspace/dependencyGraph';
import { getQualifiedKey } from '../../../src/workspace/identifiers';
import { ReferenceExtractor } from '../../../src/workspace/extraction/referenceExtractor';
import { SchemaExtractor } from '../../../src/workspace/extraction/schemaExtractor';
import { SqlDialect } from '../../../src/workspace/extraction/types';
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
        catalog: options.catalog,
        nameQuoted: options.nameQuoted,
        schemaQuoted: options.schemaQuoted,
        catalogQuoted: options.catalogQuoted,
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
        catalog: options.catalog,
        nameQuoted: options.nameQuoted,
        schemaQuoted: options.schemaQuoted,
        catalogQuoted: options.catalogQuoted,
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

function createExtractedAnalysis(filePath: string, sql: string, dialect: SqlDialect): FileAnalysis {
    return {
        filePath,
        fileName: path.basename(filePath),
        lastModified: Date.now(),
        contentHash: `${filePath}-hash`,
        definitions: new SchemaExtractor().extractDefinitions(sql, filePath, dialect),
        references: new ReferenceExtractor().extractReferences(sql, filePath, dialect),
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
            const key = getQualifiedKey(definition.name, definition.schema, definition);
            const defs = definitionMap.get(key) || [];
            defs.push(definition);
            definitionMap.set(key, defs);
        }

        for (const reference of file.references) {
            const key = getQualifiedKey(reference.tableName, reference.schema, reference);
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
    it('counts fallback-parsed files separately from fatal parse errors', () => {
        const filePath = '/repo/partial.sql';
        const analysis = createFileAnalysis(filePath, createDefinition(filePath, 'orders'), []);
        analysis.parseWarnings = ['Reference parser failed; regex fallback used: Unexpected token'];

        const graph = buildDependencyGraph(createIndex([analysis]), 'files');

        expect(graph.stats.parseErrors).toBe(0);
        expect(graph.stats.parseWarnings).toBe(1);
    });

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

    it('builds a deep file dependency chain without overflowing the call stack', () => {
        const fileCount = 12000;
        const files: FileAnalysis[] = [];

        for (let i = 0; i < fileCount; i++) {
            const filePath = `/repo/chain_${i}.sql`;
            const references = i < fileCount - 1
                ? [createReference(filePath, `chain_table_${i + 1}`)]
                : [];
            files.push(createFileAnalysis(
                filePath,
                createDefinition(filePath, `chain_table_${i}`),
                references
            ));
        }

        const graph = buildDependencyGraph(createIndex(files), 'files');

        expect(graph.nodes).toHaveLength(fileCount);
        expect(graph.edges).toHaveLength(fileCount - 1);
        expect(graph.stats.circularDependencies).toHaveLength(0);
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

    it('keeps same-file view dependencies in table mode', () => {
        const filePath = '/repo/models.sql';
        const analysis: FileAnalysis = {
            filePath,
            fileName: path.basename(filePath),
            lastModified: Date.now(),
            contentHash: 'models-hash',
            definitions: [
                createDefinition(filePath, 'base_table', { statementIndex: 0, lineNumber: 1 }),
                createDefinition(filePath, 'derived_view', {
                    type: 'view',
                    statementIndex: 1,
                    lineNumber: 2,
                    sql: 'CREATE VIEW derived_view AS SELECT * FROM base_table;'
                }),
            ],
            references: [
                createReference(filePath, 'base_table', { statementIndex: 1, lineNumber: 2 }),
            ],
        };

        const graph = buildDependencyGraph(createIndex([analysis]), 'tables');
        const labels = new Map(graph.nodes.map(node => [node.id, node.label]));

        expect(graph.edges).toEqual(expect.arrayContaining([
            expect.objectContaining({
                source: expect.stringMatching(/^table_/),
                target: expect.stringMatching(/^table_/),
            }),
        ]));
        expect(graph.edges.some(edge =>
            labels.get(edge.source) === 'derived_view' && labels.get(edge.target) === 'base_table'
        )).toBe(true);
    });

    it('creates table-mode dependencies for CREATE TABLE AS SELECT', () => {
        const sourceFile = '/repo/source.sql';
        const targetFile = '/repo/snapshot.sql';
        const source = createFileAnalysis(sourceFile, createDefinition(sourceFile, 'orders'), []);
        const snapshot = createFileAnalysis(
            targetFile,
            createDefinition(targetFile, 'orders_snapshot', {
                statementIndex: 0,
                sql: 'CREATE TABLE orders_snapshot AS SELECT * FROM orders;'
            }),
            [createReference(targetFile, 'orders', { statementIndex: 0 })]
        );

        const graph = buildDependencyGraph(createIndex([source, snapshot]), 'tables');
        const labels = new Map(graph.nodes.map(node => [node.id, node.label]));

        expect(graph.edges.some(edge =>
            labels.get(edge.source) === 'orders_snapshot' && labels.get(edge.target) === 'orders'
        )).toBe(true);
    });

    it('resolves unqualified references through normalized definition-name fallback', () => {
        const producerFile = '/repo/source.sql';
        const consumerFile = '/repo/consumer.sql';

        const index = createIndex([
            createFileAnalysis(
                producerFile,
                createDefinition(producerFile, 'orders', { schema: 'sales' }),
                []
            ),
            createFileAnalysis(
                consumerFile,
                createDefinition(consumerFile, 'orders_report', { type: 'view' }),
                [createReference(consumerFile, 'orders')]
            ),
        ]);

        const graph = buildDependencyGraph(index, 'files');
        const labelById = new Map(graph.nodes.map(node => [node.id, node.label]));
        const resolvedEdge = graph.edges.find((edge) =>
            labelById.get(edge.source) === 'consumer.sql' && labelById.get(edge.target) === 'source.sql'
        );

        expect(resolvedEdge).toBeDefined();
    });

    it('keeps quoted PostgreSQL relations with different case distinct', () => {
        const upperSource = '/repo/upper-users.sql';
        const lowerSource = '/repo/lower-users.sql';
        const upperConsumer = '/repo/upper-report.sql';
        const lowerConsumer = '/repo/lower-report.sql';
        const index = createIndex([
            createExtractedAnalysis(upperSource, 'CREATE TABLE "Users" (id INT);', 'PostgreSQL'),
            createExtractedAnalysis(lowerSource, 'CREATE TABLE "users" (id INT);', 'PostgreSQL'),
            createExtractedAnalysis(
                upperConsumer,
                'CREATE VIEW upper_report AS SELECT * FROM "Users";',
                'PostgreSQL'
            ),
            createExtractedAnalysis(
                lowerConsumer,
                'CREATE VIEW lower_report AS SELECT * FROM "users";',
                'PostgreSQL'
            ),
        ]);

        expect([...index.definitionMap.keys()]).toEqual(expect.arrayContaining(['Users', 'users']));

        const graph = buildDependencyGraph(index, 'tables');
        const labels = new Map(graph.nodes.map(node => [node.id, node.label]));
        const targetsFor = (sourceLabel: string) => graph.edges
            .filter(edge => labels.get(edge.source) === sourceLabel)
            .map(edge => labels.get(edge.target));

        expect(targetsFor('upper_report')).toEqual(['Users']);
        expect(targetsFor('lower_report')).toEqual(['users']);
    });

    it('keeps a quoted dotted name distinct from schema qualification', () => {
        const index = createIndex([
            createExtractedAnalysis('/repo/dotted.sql', 'CREATE TABLE "a.b" (id INT);', 'PostgreSQL'),
            createExtractedAnalysis('/repo/qualified.sql', 'CREATE TABLE a.b (id INT);', 'PostgreSQL'),
        ]);

        expect(index.definitionMap.has('a\\.b')).toBe(true);
        expect(index.definitionMap.has('a.b')).toBe(true);
        expect(index.definitionMap.size).toBe(2);
    });

    it('uses Snowflake folding while keeping non-equivalent quoted case distinct', () => {
        const index = createIndex([
            createExtractedAnalysis('/repo/unquoted.sql', 'CREATE TABLE users (id INT);', 'Snowflake'),
            createExtractedAnalysis('/repo/quoted-upper.sql', 'CREATE TABLE "USERS" (id INT);', 'Snowflake'),
            createExtractedAnalysis('/repo/quoted-lower.sql', 'CREATE TABLE "users" (id INT);', 'Snowflake'),
        ]);

        expect(index.definitionMap.get('USERS')).toHaveLength(2);
        expect(index.definitionMap.get('users')).toHaveLength(1);
        expect(index.definitionMap.size).toBe(2);
    });

    it('does not infer SQL Server case sensitivity from identifier delimiters', () => {
        const index = createIndex([
            createExtractedAnalysis('/repo/unquoted.sql', 'CREATE TABLE Users (id INT);', 'TransactSQL'),
            createExtractedAnalysis('/repo/bracketed.sql', 'CREATE TABLE [USERS] (id INT);', 'TransactSQL'),
        ]);

        expect(index.definitionMap.get('users')).toHaveLength(2);
        expect(index.definitionMap.size).toBe(1);
    });

    it('does not let MySQL quoting alone split the same relation spelling', () => {
        const index = createIndex([
            createExtractedAnalysis('/repo/unquoted.sql', 'CREATE TABLE Users (id INT);', 'MySQL'),
            createExtractedAnalysis('/repo/backtick.sql', 'CREATE TABLE `Users` (id INT);', 'MySQL'),
        ]);

        expect(index.definitionMap.get('users')).toHaveLength(2);
        expect(index.definitionMap.size).toBe(1);
    });

    it('keeps SQL Server catalog and schema qualifiers distinct', () => {
        const salesSource = '/repo/sales-orders.sql';
        const financeSource = '/repo/finance-orders.sql';
        const salesConsumer = '/repo/sales-report.sql';
        const financeConsumer = '/repo/finance-report.sql';
        const index = createIndex([
            createExtractedAnalysis(
                salesSource,
                'CREATE TABLE [db1].[sales].[orders] (id INT);',
                'TransactSQL'
            ),
            createExtractedAnalysis(
                financeSource,
                'CREATE TABLE [db1].[finance].[orders] (id INT);',
                'TransactSQL'
            ),
            createExtractedAnalysis(
                salesConsumer,
                'CREATE VIEW sales_report AS SELECT * FROM [db1].[sales].[orders];',
                'TransactSQL'
            ),
            createExtractedAnalysis(
                financeConsumer,
                'CREATE VIEW finance_report AS SELECT * FROM [db1].[finance].[orders];',
                'TransactSQL'
            ),
        ]);

        expect([...index.definitionMap.keys()]).toEqual(expect.arrayContaining([
            'db1.sales.orders',
            'db1.finance.orders',
        ]));

        const graph = buildDependencyGraph(index, 'tables');
        const labels = new Map(graph.nodes.map(node => [node.id, node.label]));
        const targetsFor = (sourceLabel: string) => graph.edges
            .filter(edge => labels.get(edge.source) === sourceLabel)
            .map(edge => labels.get(edge.target));

        expect(targetsFor('sales_report')).toEqual(['db1.sales.orders']);
        expect(targetsFor('finance_report')).toEqual(['db1.finance.orders']);
    });

    it('uses a prebuilt normalized definition-name index for fallback lookups', () => {
        const source = require('fs').readFileSync(
            path.join(__dirname, '../../../src/workspace/dependencyGraph.ts'),
            'utf-8'
        );

        expect(source).toContain('function buildDefinitionNameIndex(index: WorkspaceIndex): DefinitionNameIndex');
        expect(source).toContain('const definitionNameIndex = buildDefinitionNameIndex(index);');
        expect(source).toContain('const byName = normalizedName ? (definitionNameIndex.get(normalizedName) || []) : [];');
        expect(source).not.toContain('function findDefinitionsByName');
    });
});
