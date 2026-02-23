/**
 * LineageBuilder Tests
 *
 * Tests for building lineage graphs from workspace index data.
 * Uses jest.mock('fs') for CTE extraction; constructs mock WorkspaceIndex objects.
 */

jest.mock('fs');

import * as fs from 'fs';
import { LineageBuilder } from '../../../../src/workspace/lineage/lineageBuilder';
import { logger } from '../../../../src/logger';
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
        const key = (def.schema ? `${def.schema}.` : '') + def.name.toLowerCase();
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
        fileName: filePath.split('/').pop() || filePath,
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
        // Default: files don't exist (no CTE regex fallback from disk)
        mockedFs.existsSync.mockReturnValue(false);
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

        it('creates column nodes when includeColumns is true', () => {
            const cols = [makeColumn('id', 'int'), makeColumn('email', 'varchar')];
            const def = makeDef('users', 'table', cols);
            const index = makeIndex([def]);
            const builder = new LineageBuilder({ includeExternal: true, includeColumns: true });
            builder.buildFromIndex(index);

            expect(builder.nodes.has('column:users.id')).toBe(true);
            expect(builder.nodes.has('column:users.email')).toBe(true);
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

        it('logs parser fallback when CTE AST parsing fails and regex extraction is used', () => {
            const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue('WITH broken AS (SELECT FROM) SELECT *');

            const fileAnalysis = makeFileAnalysis('broken.sql', [], [], []);
            const files = new Map([['broken.sql', fileAnalysis]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('using regex fallback'));
            debugSpy.mockRestore();
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
    });

    describe('resolveTableId', () => {
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

    describe('extractCTEsWithRegex', () => {
        it('extracts simple CTEs from SQL on disk', () => {
            const sql = 'WITH my_cte AS (\n  SELECT * FROM orders\n)\nSELECT * FROM my_cte';
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue(sql);

            // Build index with a file that has no queries (triggers regex fallback)
            const fa = makeFileAnalysis('cte_test.sql', [], []);
            const files = new Map([['cte_test.sql', fa]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(builder.nodes.has('cte:my_cte')).toBe(true);
        });

        it('extracts RECURSIVE CTEs', () => {
            const sql = 'WITH RECURSIVE hierarchy AS (\n  SELECT 1\n)\nSELECT * FROM hierarchy';
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue(sql);

            const fa = makeFileAnalysis('rec.sql', [], []);
            const files = new Map([['rec.sql', fa]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            expect(builder.nodes.has('cte:hierarchy')).toBe(true);
        });

        it('filters out SQL reserved words', () => {
            // "WITH SELECT AS (" should not match — SELECT is reserved
            const sql = 'SELECT * FROM foo';
            mockedFs.existsSync.mockReturnValue(true);
            mockedFs.readFileSync.mockReturnValue(sql);

            const fa = makeFileAnalysis('no_cte.sql', [], []);
            const files = new Map([['no_cte.sql', fa]]);
            const index = makeIndex([], files);

            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            // No CTE nodes should be created from reserved words
            for (const [id] of builder.nodes) {
                expect(id.startsWith('cte:')).toBe(false);
            }
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
});
