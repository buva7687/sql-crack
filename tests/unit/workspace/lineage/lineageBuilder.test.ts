/**
 * LineageBuilder Tests
 *
 * Tests for building lineage graphs from workspace index data.
 * Uses jest.mock('fs') for async SQL preloading; constructs mock WorkspaceIndex objects.
 */

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    promises: {
        readFile: jest.fn()
    }
}));

import * as fs from 'fs';
import * as path from 'path';
import { LineageBuilder } from '../../../../src/workspace/lineage/lineageBuilder';
import { getQualifiedKey } from '../../../../src/workspace/identifiers';
import { logger } from '../../../../src/logger';
import { SchemaExtractor } from '../../../../src/workspace/extraction/schemaExtractor';
import type { WorkspaceIndex, SchemaDefinition, FileAnalysis, TableReference } from '../../../../src/workspace/types';
import type { ColumnInfo } from '../../../../src/workspace/extraction/types';

const mockedFs = fs as jest.Mocked<typeof fs>;

// --- Helpers ---

function makeColumn(name: string, dataType: string = 'text', extra?: Partial<ColumnInfo>): ColumnInfo {
    return {
        name,
        dataType,
        nullable: true,
        primaryKey: false,
        ...extra
    } as ColumnInfo;
}

function makeDef(
    name: string,
    type: 'table' | 'view' = 'table',
    columns: ColumnInfo[] = [],
    extra?: Partial<SchemaDefinition>
): SchemaDefinition {
    return {
        type,
        name,
        columns,
        filePath: extra?.filePath ?? 'test.sql',
        lineNumber: extra?.lineNumber ?? 1,
        sql: extra?.sql ?? `CREATE ${type.toUpperCase()} ${name}`,
        ...extra
    };
}

function makeRef(
    tableName: string,
    referenceType: TableReference['referenceType'] = 'select',
    extra?: Partial<TableReference>
): TableReference {
    return {
        tableName,
        referenceType,
        filePath: extra?.filePath ?? 'test.sql',
        lineNumber: extra?.lineNumber ?? 1,
        context: extra?.context ?? referenceType.toUpperCase(),
        ...extra
    };
}

function makeIndex(
    defs: SchemaDefinition[] = [],
    files: Map<string, FileAnalysis> = new Map()
): WorkspaceIndex {
    const definitionMap = new Map<string, SchemaDefinition[]>();
    for (const def of defs) {
        const key = getQualifiedKey(def.name, def.schema, def);
        if (!definitionMap.has(key)) {
            definitionMap.set(key, []);
        }
        definitionMap.get(key)!.push(def);
    }

    return {
        version: 1,
        lastUpdated: Date.now(),
        fileCount: files.size,
        files,
        fileHashes: new Map(),
        definitionMap,
        referenceMap: new Map()
    };
}

function makeFileAnalysis(
    filePath: string,
    defs: SchemaDefinition[] = [],
    refs: TableReference[] = [],
    queries?: any[]
): FileAnalysis {
    return {
        filePath,
        fileName: path.basename(filePath),
        lastModified: Date.now(),
        contentHash: 'abc123',
        definitions: defs,
        references: refs,
        queries
    } as FileAnalysis;
}

// --- Tests ---

describe('LineageBuilder', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('buildFromIndex', () => {
        it('creates table nodes from definitions', () => {
            const def = makeDef('customers');
            const index = makeIndex([def]);
            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(builder.nodes.has('table:customers')).toBe(true);
            expect(builder.nodes.get('table:customers')!.type).toBe('table');
        });

        it('creates view nodes from definitions', () => {
            const def = makeDef('active_users', 'view');
            const index = makeIndex([def]);
            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(builder.nodes.has('view:active_users')).toBe(true);
            expect(builder.nodes.get('view:active_users')!.type).toBe('view');
        });

        it('preserves quoted case and catalog-schema relation identities', () => {
            const definitions = [
                makeDef('Users', 'table', [], { nameQuoted: true }),
                makeDef('users', 'table', [], { nameQuoted: true }),
                makeDef('orders', 'table', [], {
                    catalog: 'db1',
                    schema: 'sales',
                    catalogQuoted: true,
                    schemaQuoted: true,
                    nameQuoted: true,
                }),
                makeDef('orders', 'table', [], {
                    catalog: 'db1',
                    schema: 'finance',
                    catalogQuoted: true,
                    schemaQuoted: true,
                    nameQuoted: true,
                }),
            ];
            const builder = new LineageBuilder();

            builder.buildFromIndex(makeIndex(definitions));

            expect(builder.nodes.has('table:Users')).toBe(true);
            expect(builder.nodes.has('table:users')).toBe(true);
            expect(builder.nodes.get('table:db1.sales.orders')?.name).toBe('db1.sales.orders');
            expect(builder.nodes.get('table:db1.finance.orders')?.name).toBe('db1.finance.orders');
        });

        it('creates column nodes when includeColumns is true', () => {
            const cols = [makeColumn('id', 'int'), makeColumn('email', 'varchar')];
            const def = makeDef('users', 'table', cols);
            const index = makeIndex([def]);
            const builder = new LineageBuilder({ includeExternal: true, includeColumns: true });
            builder.buildFromIndex(index);

            expect(builder.nodes.has('column:users.id')).toBe(true);
            expect(builder.nodes.has('column:users.email')).toBe(true);
        });

        it('builds lineage for ordinary PostgreSQL CREATE TABLE columns', () => {
            const defs = new SchemaExtractor().extractDefinitions(
                'CREATE TABLE accounts (id INT, name TEXT);',
                'accounts.sql',
                'PostgreSQL'
            );
            const fileAnalysis = makeFileAnalysis('accounts.sql', defs, []);
            const files = new Map([['accounts.sql', fileAnalysis]]);
            const index = makeIndex(defs, files);
            const builder = new LineageBuilder({ includeExternal: true, includeColumns: true });

            expect(() => builder.buildFromIndex(index)).not.toThrow();
            expect(builder.nodes.has('column:accounts.id')).toBe(true);
            expect(builder.nodes.has('column:accounts.name')).toBe(true);
        });

        it('keeps quoted case-distinct and dotted PostgreSQL columns separate', () => {
            const defs = new SchemaExtractor().extractDefinitions(
                'CREATE TABLE t ("OrderID" INT, "orderid" INT, "customer.id" INT);',
                'quoted-columns.sql',
                'PostgreSQL'
            );
            const fileAnalysis = makeFileAnalysis('quoted-columns.sql', defs, []);
            const index = makeIndex(defs, new Map([['quoted-columns.sql', fileAnalysis]]));
            const builder = new LineageBuilder({ includeExternal: true, includeColumns: true });

            expect(defs[0].columns).toEqual([
                expect.objectContaining({ name: 'OrderID', nameQuoted: true }),
                expect.objectContaining({ name: 'orderid', nameQuoted: true }),
                expect.objectContaining({ name: 'customer.id', nameQuoted: true }),
            ]);
            builder.buildFromIndex(index);

            expect(builder.nodes.has('column:t.OrderID')).toBe(true);
            expect(builder.nodes.has('column:t.orderid')).toBe(true);
            expect(builder.nodes.has('column:t.customer\\.id')).toBe(true);
            expect([...builder.nodes.values()].filter(node => node.type === 'column')).toHaveLength(3);
        });

        it('skips column nodes when includeColumns is false', () => {
            const cols = [makeColumn('id', 'int')];
            const def = makeDef('users', 'table', cols);
            const index = makeIndex([def]);
            const builder = new LineageBuilder({ includeExternal: true, includeColumns: false });
            builder.buildFromIndex(index);

            expect(builder.nodes.has('column:users.id')).toBe(false);
        });

        it('creates edges from file references (SELECT → INSERT)', () => {
            const srcDef = makeDef('source_table', 'table', [], { filePath: 'etl.sql' });
            const tgtDef = makeDef('target_table', 'table', [], { filePath: 'etl.sql' });
            const refs = [
                makeRef('source_table', 'select', { filePath: 'etl.sql', statementIndex: 0 }),
                makeRef('target_table', 'insert', { filePath: 'etl.sql', statementIndex: 0 })
            ];
            const fileAnalysis = makeFileAnalysis('etl.sql', [srcDef, tgtDef], refs);
            const files = new Map([['etl.sql', fileAnalysis]]);
            const index = makeIndex([srcDef, tgtDef], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            const edge = builder.edges.find(e =>
                e.sourceId === 'table:source_table' && e.targetId === 'table:target_table'
            );
            expect(edge).toBeDefined();
        });

        it('treats a MERGE target as an output destination', () => {
            const sourceDef = makeDef('staging_orders', 'table', [], { filePath: 'merge.sql' });
            const targetDef = makeDef('orders', 'table', [], { filePath: 'merge.sql' });
            const refs = [
                makeRef('staging_orders', 'select', { filePath: 'merge.sql', statementIndex: 0 }),
                makeRef('orders', 'merge', { filePath: 'merge.sql', statementIndex: 0 }),
            ];
            const analysis = makeFileAnalysis('merge.sql', [sourceDef, targetDef], refs);
            const index = makeIndex(
                [sourceDef, targetDef],
                new Map([['merge.sql', analysis]])
            );

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(builder.edges).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    sourceId: 'table:staging_orders',
                    targetId: 'table:orders',
                }),
            ]));
        });

        it('creates external nodes for unknown references', () => {
            const def = makeDef('my_view', 'view', [], { filePath: 'view.sql', sql: 'CREATE VIEW my_view AS SELECT * FROM ext_table' });
            const refs = [
                makeRef('ext_table', 'select', { filePath: 'view.sql', statementIndex: 0 })
            ];
            const viewDef = makeDef('my_view', 'view', [], { filePath: 'view.sql', sql: 'CREATE VIEW my_view AS SELECT * FROM ext_table' });
            const fileAnalysis = makeFileAnalysis('view.sql', [viewDef], refs);
            const files = new Map([['view.sql', fileAnalysis]]);
            const index = makeIndex([viewDef], files);

            const builder = new LineageBuilder({ includeExternal: true, includeColumns: true });
            builder.buildFromIndex(index);

            expect(builder.nodes.has('external:ext_table')).toBe(true);
        });

        it('does not create external nodes when includeExternal is false', () => {
            const refs = [makeRef('unknown_table', 'select', { filePath: 'q.sql', statementIndex: 0 })];
            const fileAnalysis = makeFileAnalysis('q.sql', [], refs);
            const files = new Map([['q.sql', fileAnalysis]]);
            const def = makeDef('dest', 'table', [], { filePath: 'q.sql' });
            const insertRef = makeRef('dest', 'insert', { filePath: 'q.sql', statementIndex: 0 });
            fileAnalysis.references.push(insertRef);
            const index = makeIndex([def], files);

            const builder = new LineageBuilder({ includeExternal: false, includeColumns: false });
            builder.buildFromIndex(index);

            expect(builder.nodes.has('external:unknown_table')).toBe(false);
        });

        it('creates CTE nodes from query analysis', () => {
            const fileAnalysis = makeFileAnalysis('cte.sql', [], [], [
                { ctes: [{ name: 'recent_orders', lineNumber: 1 }], transformations: [] }
            ]);
            const files = new Map([['cte.sql', fileAnalysis]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(builder.nodes.has('cte:recent_orders')).toBe(true);
            expect(builder.nodes.get('cte:recent_orders')!.type).toBe('cte');
        });

        it('logs parser fallback when CTE AST parsing fails and regex extraction is used', async () => {
            const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue('WITH broken AS (SELECT FROM) SELECT *');

            const fileAnalysis = makeFileAnalysis('broken.sql', [], [], []);
            const files = new Map([['broken.sql', fileAnalysis]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            await builder.buildFromIndexAsync(index);

            expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('using regex fallback'));
            debugSpy.mockRestore();
        });

        it('does not require file SQL to filter already-classified references', async () => {
            const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
            (mockedFs.promises.readFile as jest.Mock).mockRejectedValue(new Error('EACCES'));

            // queries present => skips earlier CTE-on-disk fallback pass and targets addFileEdges() path
            const fileAnalysis = makeFileAnalysis(
                'restricted.sql',
                [],
                [makeRef('orders', 'select', { filePath: 'restricted.sql', statementIndex: 0 })],
                [{ ctes: [], transformations: [] }]
            );
            const files = new Map([['restricted.sql', fileAnalysis]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            await builder.buildFromIndexAsync(index);

            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('deduplicates nodes with same ID (first definition wins)', () => {
            const def1 = makeDef('users', 'table', [], { filePath: 'a.sql' });
            const def2 = makeDef('users', 'table', [], { filePath: 'b.sql' });
            const index = makeIndex([def1, def2]);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            // seenNodes guard means only first def is processed; one node created
            const tableNodes = Array.from(builder.nodes.values()).filter(n => n.name.toLowerCase().includes('users') && n.type === 'table');
            expect(tableNodes).toHaveLength(1);
            expect(tableNodes[0].metadata.definitionFiles).toContain('a.sql');
        });

        it('clears state on rebuild', () => {
            const def = makeDef('old_table');
            const index1 = makeIndex([def]);
            const builder = new LineageBuilder();
            builder.buildFromIndex(index1);
            expect(builder.nodes.has('table:old_table')).toBe(true);

            const def2 = makeDef('new_table');
            const index2 = makeIndex([def2]);
            builder.buildFromIndex(index2);
            expect(builder.nodes.has('table:old_table')).toBe(false);
            expect(builder.nodes.has('table:new_table')).toBe(true);
        });

        it('does not synchronously read SQL files when SQL was not preloaded', () => {
            mockedFs.readFileSync.mockImplementation(() => {
                throw new Error('sync read should not be used');
            });

            const fileAnalysis = makeFileAnalysis('no_preload.sql', [], [], []);
            const files = new Map([['no_preload.sql', fileAnalysis]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            expect(() => builder.buildFromIndex(index)).not.toThrow();
            expect(mockedFs.readFileSync).not.toHaveBeenCalled();
        });
    });

    describe('buildFromIndexAsync', () => {
        it('uses a bounded worker pool instead of Promise.all over every SQL file', () => {
            const source = jest.requireActual('fs').readFileSync(
                path.join(__dirname, '../../../../src/workspace/lineage/lineageBuilder.ts'),
                'utf-8'
            );

            expect(source).toContain('const MAX_PRELOAD_CONCURRENCY = 20;');
            expect(source).toContain('const workerCount = Math.min(MAX_PRELOAD_CONCURRENCY, filePaths.length);');
            expect(source).toContain('const workers = Array.from({ length: workerCount }, async () => {');
            expect(source).toContain('await Promise.all(workers);');
            expect(source).not.toContain('Array.from(files.keys()).map(async (filePath) => {');
        });
    });

    describe('addFileEdges (per-statement grouping)', () => {
        it('does not create cross-statement edges', () => {
            const t1 = makeDef('table_a', 'table', [], { filePath: 'multi.sql' });
            const t2 = makeDef('table_b', 'table', [], { filePath: 'multi.sql' });
            const t3 = makeDef('table_c', 'table', [], { filePath: 'multi.sql' });
            const t4 = makeDef('table_d', 'table', [], { filePath: 'multi.sql' });
            const refs = [
                makeRef('table_a', 'select', { filePath: 'multi.sql', statementIndex: 0 }),
                makeRef('table_b', 'insert', { filePath: 'multi.sql', statementIndex: 0 }),
                makeRef('table_c', 'select', { filePath: 'multi.sql', statementIndex: 1 }),
                makeRef('table_d', 'insert', { filePath: 'multi.sql', statementIndex: 1 })
            ];
            const fa = makeFileAnalysis('multi.sql', [t1, t2, t3, t4], refs);
            const files = new Map([['multi.sql', fa]]);
            const index = makeIndex([t1, t2, t3, t4], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            // a->b exists (statement 0), c->d exists (statement 1)
            expect(builder.edges.some(e => e.sourceId === 'table:table_a' && e.targetId === 'table:table_b')).toBe(true);
            expect(builder.edges.some(e => e.sourceId === 'table:table_c' && e.targetId === 'table:table_d')).toBe(true);

            // cross-statement a->d or c->b should NOT exist
            expect(builder.edges.some(e => e.sourceId === 'table:table_a' && e.targetId === 'table:table_d')).toBe(false);
            expect(builder.edges.some(e => e.sourceId === 'table:table_c' && e.targetId === 'table:table_b')).toBe(false);
        });

        it('removes self-referential edges within a statement', () => {
            const t1 = makeDef('self_table', 'table', [], { filePath: 'self.sql' });
            const refs = [
                makeRef('self_table', 'select', { filePath: 'self.sql', statementIndex: 0 }),
                makeRef('self_table', 'insert', { filePath: 'self.sql', statementIndex: 0 })
            ];
            const fa = makeFileAnalysis('self.sql', [t1], refs);
            const files = new Map([['self.sql', fa]]);
            const index = makeIndex([t1], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            // No self-edges
            const selfEdge = builder.edges.find(e => e.sourceId === 'table:self_table' && e.targetId === 'table:self_table');
            expect(selfEdge).toBeUndefined();
        });

        it('skips CTE references from edge creation', () => {
            const t1 = makeDef('real_table', 'table', [], { filePath: 'cte.sql' });
            const refs = [
                makeRef('my_cte', 'cte', { filePath: 'cte.sql', statementIndex: 0 }),
                makeRef('real_table', 'select', { filePath: 'cte.sql', statementIndex: 0 })
            ];
            const fa = makeFileAnalysis('cte.sql', [t1], refs);
            const files = new Map([['cte.sql', fa]]);
            const index = makeIndex([t1], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            // CTE reference should not create an external node or edge
            expect(builder.nodes.has('external:my_cte')).toBe(false);
        });

        it('does not let a CTE name hide a physical table in a later statement', () => {
            const report = makeDef('report', 'table', [], { filePath: 'pipeline.sql' });
            const refs = [
                makeRef('orders', 'select', { filePath: 'pipeline.sql', statementIndex: 1 }),
                makeRef('report', 'insert', { filePath: 'pipeline.sql', statementIndex: 1 }),
            ];
            const queries = [{
                statementType: 'select',
                outputColumns: [],
                inputTables: [],
                inputColumns: [],
                transformations: [],
                ctes: [{ name: 'orders', columns: [], lineNumber: 1 }],
                subqueries: [],
                lineNumber: 1,
            }];
            const analysis = makeFileAnalysis('pipeline.sql', [report], refs, queries as any);
            const index = makeIndex([report], new Map([['pipeline.sql', analysis]]));

            const builder = new LineageBuilder({ includeExternal: true, includeColumns: false });
            builder.buildFromIndex(index);

            expect(builder.edges).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    sourceId: 'external:orders',
                    targetId: 'table:report',
                }),
            ]));
        });

        it('resolves a view reference to the existing view node, not a stray external node', () => {
            // A view feeds an INSERT in the same statement. The edge source must
            // resolve to the real `view:` node; checking only `table:` would
            // create an `external:` node and orphan the view in the graph.
            const viewDef = makeDef('customer_view', 'view', [], { filePath: 'views.sql' });
            const targetDef = makeDef('customer_report', 'table', [], { filePath: 'pipeline.sql' });
            const refs = [
                makeRef('customer_view', 'select', { filePath: 'pipeline.sql', statementIndex: 0 }),
                makeRef('customer_report', 'insert', { filePath: 'pipeline.sql', statementIndex: 0 })
            ];
            const fa = makeFileAnalysis('pipeline.sql', [targetDef], refs);
            const files = new Map([['pipeline.sql', fa]]);
            const index = makeIndex([viewDef, targetDef], files);

            const builder = new LineageBuilder({ includeExternal: true, includeColumns: false });
            builder.buildFromIndex(index);

            expect(builder.nodes.has('external:customer_view')).toBe(false);
            const edge = builder.edges.find(e =>
                e.sourceId === 'view:customer_view' && e.targetId === 'table:customer_report'
            );
            expect(edge).toBeDefined();
        });
    });

    describe('resolveTableId', () => {
        it('does not fold an unresolved relation onto a different quoted-case node', () => {
            const quotedDef = makeDef('Users', 'table', [], {
                nameQuoted: true,
                filePath: 'quoted.sql',
            });
            const builder = new LineageBuilder();
            builder.buildFromIndex(makeIndex([quotedDef]));

            expect((builder as any).resolveTableId('users', 'query.sql')).toBeNull();
            expect((builder as any).resolveTableId('Users', 'query.sql')).toBe('table:Users');
        });

        it('resolves table: prefix', () => {
            const def = makeDef('orders');
            const index = makeIndex([def]);
            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            // Test via getUpstream/getDownstream which use nodes internally
            expect(builder.nodes.has('table:orders')).toBe(true);
        });

        it('resolves view: prefix', () => {
            const def = makeDef('active_view', 'view');
            const index = makeIndex([def]);
            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(builder.nodes.has('view:active_view')).toBe(true);
        });

        it('handles schema-qualified names', () => {
            const def = makeDef('orders', 'table', [], { schema: 'sales' });
            const index = makeIndex([def]);
            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(builder.nodes.has('table:sales.orders')).toBe(true);
        });
    });

    describe('resolveTargetTableId', () => {
        it('matches create_view transformations to the nearest definition in multi-view files', () => {
            const sourceDef = makeDef('orders', 'table', [makeColumn('customer_id')], {
                filePath: 'views.sql',
                lineNumber: 1
            });
            const firstView = makeDef('daily_orders', 'view', [makeColumn('customer_id')], {
                filePath: 'views.sql',
                lineNumber: 5,
                sql: 'CREATE VIEW daily_orders AS SELECT customer_id FROM orders'
            });
            const secondView = makeDef('monthly_orders', 'view', [makeColumn('customer_id')], {
                filePath: 'views.sql',
                lineNumber: 25,
                sql: 'CREATE VIEW monthly_orders AS SELECT customer_id FROM orders'
            });

            const queries = [{
                statementType: 'create_view',
                outputColumns: [makeColumn('customer_id')],
                inputTables: [],
                inputColumns: [],
                transformations: [{
                    outputColumn: 'customer_id',
                    inputColumns: [{ tableName: 'orders', columnName: 'customer_id' }],
                    operation: 'direct',
                    expression: 'orders.customer_id',
                    lineNumber: 26
                }],
                ctes: [],
                subqueries: [],
                lineNumber: 25
            }];

            const refs = [
                makeRef('orders', 'select', { filePath: 'views.sql', statementIndex: 1, lineNumber: 26 })
            ];
            const fileAnalysis = makeFileAnalysis('views.sql', [sourceDef, firstView, secondView], refs, queries as any);
            const files = new Map([['views.sql', fileAnalysis]]);
            const index = makeIndex([sourceDef, firstView, secondView], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(builder.columnEdges).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    sourceTableId: 'table:orders',
                    targetTableId: 'view:monthly_orders',
                    targetColumnName: 'customer_id'
                })
            ]));
        });

        it('ignores commented target patterns and resolves the real SELECT INTO target', () => {
            const commentedTarget = makeDef('commented_target');
            const realTarget = makeDef('real_target');
            const analysis = makeFileAnalysis(
                'targets.sql',
                [commentedTarget, realTarget],
                []
            );
            const builder = new LineageBuilder();
            builder.buildFromIndex(makeIndex([commentedTarget, realTarget]));

            const targetId = (builder as any).resolveTargetTableId(
                {
                    statementType: 'select',
                    sql: [
                        '-- INSERT INTO commented_target SELECT 1',
                        '/* SELECT 1 INTO commented_target */',
                        'SELECT 1 INTO real_target'
                    ].join('\n')
                },
                0,
                analysis,
                'targets.sql'
            );

            expect(targetId).toBe('table:real_target');
        });

        it('does not resolve a target mentioned only inside SQL comments', () => {
            const commentedTarget = makeDef('commented_target');
            const unrelatedTarget = makeDef('unrelated_target');
            const analysis = makeFileAnalysis(
                'comments_only.sql',
                [commentedTarget, unrelatedTarget],
                []
            );
            const builder = new LineageBuilder();
            builder.buildFromIndex(makeIndex([commentedTarget, unrelatedTarget]));

            const targetId = (builder as any).resolveTargetTableId(
                {
                    statementType: 'select',
                    sql: [
                        '-- INSERT INTO commented_target SELECT 1',
                        '/* SELECT 1 INTO commented_target */',
                        'SELECT 1'
                    ].join('\n')
                },
                0,
                analysis,
                'comments_only.sql'
            );

            expect(targetId).toBeNull();
        });

        it('preserves BigQuery case in the SELECT INTO target fallback', () => {
            const target = makeDef('MixedTarget', 'table', [], {
                filePath: 'bigquery.sql',
                identifierCaseFolding: 'preserve',
                quotedIdentifiersCaseSensitive: false,
            });
            const unrelated = makeDef('OtherTarget', 'table', [], {
                filePath: 'bigquery.sql',
                identifierCaseFolding: 'preserve',
                quotedIdentifiersCaseSensitive: false,
            });
            const analysis = makeFileAnalysis('bigquery.sql', [target, unrelated], []);
            const builder = new LineageBuilder();
            builder.buildFromIndex(makeIndex([target, unrelated]));

            const targetId = (builder as any).resolveTargetTableId(
                { statementType: 'select', sql: 'SELECT 1 INTO MixedTarget' },
                0,
                analysis,
                'bigquery.sql'
            );

            expect(targetId).toBe('table:MixedTarget');
        });

        it('applies Snowflake upper folding in the INSERT target fallback', () => {
            const target = makeDef('MixedTarget', 'table', [], {
                filePath: 'snowflake.sql',
                identifierCaseFolding: 'upper',
                quotedIdentifiersCaseSensitive: true,
            });
            const unrelated = makeDef('OtherTarget', 'table', [], {
                filePath: 'snowflake.sql',
                identifierCaseFolding: 'upper',
                quotedIdentifiersCaseSensitive: true,
            });
            const analysis = makeFileAnalysis('snowflake.sql', [target, unrelated], []);
            const builder = new LineageBuilder();
            builder.buildFromIndex(makeIndex([target, unrelated]));

            const targetId = (builder as any).resolveTargetTableId(
                { statementType: 'insert', sql: 'INSERT INTO MixedTarget SELECT 1' },
                0,
                analysis,
                'snowflake.sql'
            );

            expect(targetId).toBe('table:MIXEDTARGET');
        });
    });

    describe('extractCTEsWithRegex', () => {
        it('extracts simple CTEs from preloaded SQL', async () => {
            const sql = 'WITH my_cte AS (\n  SELECT * FROM orders\n)\nSELECT * FROM my_cte';
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(sql);

            // Build index with a file that has no queries (triggers regex fallback)
            const fa = makeFileAnalysis('cte_test.sql', [], []);
            const files = new Map([['cte_test.sql', fa]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            await builder.buildFromIndexAsync(index);

            expect(builder.nodes.has('cte:my_cte')).toBe(true);
        });

        it('extracts multiline RECURSIVE CTEs with the correct name line', async () => {
            const sql = 'WITH RECURSIVE\n e AS (\n  SELECT 1\n)\nSELECT * FROM e';
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(sql);

            const fa = makeFileAnalysis('rec.sql', [], []);
            const files = new Map([['rec.sql', fa]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            await builder.buildFromIndexAsync(index);

            expect(builder.nodes.get('cte:e')).toEqual(expect.objectContaining({
                name: 'e',
                lineNumber: 2
            }));
        });

        it('filters out SQL reserved words from preloaded SQL', async () => {
            // "WITH SELECT AS (" should not match — SELECT is reserved
            const sql = 'SELECT * FROM foo';
            (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(sql);

            const fa = makeFileAnalysis('no_cte.sql', [], []);
            const files = new Map([['no_cte.sql', fa]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            await builder.buildFromIndexAsync(index);

            // No CTE nodes should be created from reserved words
            for (const [id] of builder.nodes) {
                expect(id.startsWith('cte:')).toBe(false);
            }
        });

        it('ignores commented CTEs and preserves valid CTE line numbers', () => {
            const sql = [
                '-- WITH line_phantom AS (SELECT 1)',
                '/*',
                'WITH block_phantom AS (SELECT 2)',
                '*/',
                'WITH first_cte AS (',
                '  SELECT 1',
                '),',
                'second_cte AS (',
                '  SELECT 2',
                ')',
                'SELECT * FROM first_cte JOIN second_cte ON 1 = 1'
            ].join('\n');
            const cteNames = new Map<string, {
                name: string;
                filePath: string;
                lineNumber: number;
            }>();
            const builder = new LineageBuilder();

            (builder as any).extractCTEsWithRegex(sql, 'comments.sql', cteNames);

            expect(Array.from(cteNames.keys())).toEqual(['first_cte', 'second_cte']);
            expect(cteNames.get('first_cte')).toEqual({
                name: 'first_cte',
                filePath: 'comments.sql',
                lineNumber: 5
            });
            expect(cteNames.get('second_cte')).toEqual({
                name: 'second_cte',
                filePath: 'comments.sql',
                lineNumber: 8
            });
        });

        it('ignores CTE-like text inside quoted SQL tokens', () => {
            const sql = [
                "SELECT 'WITH string_phantom AS (SELECT 1)' AS note;",
                'SELECT "WITH identifier_phantom AS (SELECT 2)" FROM source;',
                'WITH real_cte AS (SELECT 3) SELECT * FROM real_cte'
            ].join('\n');
            const cteNames = new Map<string, {
                name: string;
                filePath: string;
                lineNumber: number;
            }>();
            const builder = new LineageBuilder();

            (builder as any).extractCTEsWithRegex(sql, 'quoted.sql', cteNames);

            expect(Array.from(cteNames.keys())).toEqual(['real_cte']);
            expect(cteNames.get('real_cte')?.lineNumber).toBe(3);
        });
    });

    describe('getUpstream / getDownstream delegation', () => {
        it('getUpstream returns upstream nodes', () => {
            const src = makeDef('source', 'table', [], { filePath: 'pipe.sql' });
            const tgt = makeDef('target', 'table', [], { filePath: 'pipe.sql' });
            const refs = [
                makeRef('source', 'select', { filePath: 'pipe.sql', statementIndex: 0 }),
                makeRef('target', 'insert', { filePath: 'pipe.sql', statementIndex: 0 })
            ];
            const fa = makeFileAnalysis('pipe.sql', [src, tgt], refs);
            const files = new Map([['pipe.sql', fa]]);
            const index = makeIndex([src, tgt], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            const upstream = builder.getUpstream('table:target');
            expect(upstream.some(n => n.id === 'table:source')).toBe(true);
        });

        it('getDownstream returns downstream nodes', () => {
            const src = makeDef('source', 'table', [], { filePath: 'pipe.sql' });
            const tgt = makeDef('target', 'table', [], { filePath: 'pipe.sql' });
            const refs = [
                makeRef('source', 'select', { filePath: 'pipe.sql', statementIndex: 0 }),
                makeRef('target', 'insert', { filePath: 'pipe.sql', statementIndex: 0 })
            ];
            const fa = makeFileAnalysis('pipe.sql', [src, tgt], refs);
            const files = new Map([['pipe.sql', fa]]);
            const index = makeIndex([src, tgt], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            const downstream = builder.getDownstream('table:source');
            expect(downstream.some(n => n.id === 'table:target')).toBe(true);
        });

        it('handles deep graph-interface traversals without overflowing the call stack', () => {
            const nodeCount = 12000;
            const builder = new LineageBuilder();

            for (let i = 0; i < nodeCount; i++) {
                const nodeId = `table:chain_${i}`;
                builder.nodes.set(nodeId, {
                    id: nodeId,
                    type: 'table',
                    name: `chain_${i}`,
                    metadata: {}
                });

                if (i > 0) {
                    (builder as any).addEdge({
                        id: `edge_${i - 1}_${i}`,
                        sourceId: `table:chain_${i - 1}`,
                        targetId: nodeId,
                        type: 'direct',
                        metadata: {}
                    });
                }
            }

            expect(builder.getDownstream('table:chain_0')).toHaveLength(nodeCount - 1);
            expect(builder.getUpstream(`table:chain_${nodeCount - 1}`)).toHaveLength(nodeCount - 1);
        });
    });

    describe('getColumnLineage', () => {
        it('returns empty for nonexistent column', () => {
            const def = makeDef('users', 'table', [makeColumn('id')]);
            const index = makeIndex([def]);
            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            const paths = builder.getColumnLineage('users', 'nonexistent');
            expect(paths).toHaveLength(0);
        });

        it('returns upstream and downstream paths for a column', () => {
            const cols = [makeColumn('id'), makeColumn('name')];
            const def = makeDef('users', 'table', cols);
            const index = makeIndex([def]);
            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            const paths = builder.getColumnLineage('users', 'id');
            // Should return 2 paths: upstream and downstream (even if empty)
            expect(paths).toHaveLength(2);
        });
    });

    describe('addExternalNode', () => {
        it('creates an external node with correct type', () => {
            const builder = new LineageBuilder();
            const node = builder.addExternalNode('remote_db.orders');
            expect(node.type).toBe('external');
            expect(node.metadata.isExternal).toBe(true);
        });
    });

    describe('edge dedup performance', () => {
        it('uses Set-based dedup instead of O(n) array scan', () => {
            const realFs = jest.requireActual('fs') as typeof import('fs');
            const source = realFs.readFileSync(
                path.join(__dirname, '../../../../src/workspace/lineage/lineageBuilder.ts'),
                'utf8'
            );
            // Should use Set for O(1) lookup instead of edges.find() for O(n)
            expect(source).toContain('private edgeIds = new Set<string>()');
            expect(source).toContain('private columnEdgeIds = new Set<string>()');
            expect(source).not.toMatch(/this\.edges\.find\(/);
            expect(source).not.toMatch(/this\.columnEdges\.some\(/);
            // Empty if block (#8) should be removed
            expect(source).not.toMatch(/if\s*\(edgesAdded\s*>\s*0\)\s*\{\s*\}/);
        });
    });
});
