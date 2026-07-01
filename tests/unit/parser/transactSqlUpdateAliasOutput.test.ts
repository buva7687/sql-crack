import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

const TSQL = 'TransactSQL' as SqlDialect;

describe('T-SQL UPDATE alias / OUTPUT compatibility', () => {
    describe('issue #88: UPDATE <alias> ... FROM <table> <alias>', () => {
        it('does not report a false Cartesian product for a single-table aliased update', () => {
            const sql = `update t
set   [description] = 'Updated'
from   @test_table t
where id = 1`;
            const result = parseSql(sql, TSQL);

            expect(result.error).toBeUndefined();
            expect(result.hints.some((h: any) => h.message === 'Possible Cartesian product')).toBe(false);
            // Only one physical table is involved; the update target alias must not be
            // counted as a second table.
            expect(result.stats.tables).toBe(1);
            // The WHERE predicate is now counted as a filter condition.
            expect(result.stats.conditions).toBeGreaterThan(0);
        });

        it('resolves the target alias to the real table name instead of the alias', () => {
            const sql = `update t
set   [description] = 'Updated'
from   @test_table t
where id = 1`;
            const result = parseSql(sql, TSQL);

            const writeTarget = result.nodes.find((n: any) =>
                n.type === 'table' && n.accessMode === 'write' && n.operationType === 'UPDATE'
            );
            expect(writeTarget).toBeDefined();
            expect(writeTarget?.label?.toLowerCase()).toBe('@test_table');
            // The alias `t` must not survive as a table label.
            expect(result.nodes.some((n: any) => n.type === 'table' && n.label === 't')).toBe(false);
        });

        it('counts only the real tables for a joined update-from and keeps the join', () => {
            const sql = `update t
set   t.col = s.col
from   target_table t
join   source_table s on t.id = s.id`;
            const result = parseSql(sql, TSQL);

            expect(result.error).toBeUndefined();
            expect(result.hints.some((h: any) => h.message === 'Possible Cartesian product')).toBe(false);
            expect(result.stats.tables).toBe(2);
            expect(result.stats.joins).toBeGreaterThanOrEqual(1);

            const writeTarget = result.nodes.find((n: any) =>
                n.type === 'table' && n.accessMode === 'write' && n.operationType === 'UPDATE'
            );
            expect(writeTarget?.label?.toLowerCase()).toBe('target_table');
        });
    });

    describe('issue #87: UPDATE ... OUTPUT [...] INTO', () => {
        it('parses UPDATE ... OUTPUT ... INTO without a parse error', () => {
            const sql = `update  tt
set     tt.active = 1
output  inserted.active
into    #output_table
from    #temp_table tt`;
            const result = parseSql(sql, TSQL);

            expect(result.error).toBeUndefined();
            expect(result.hints.some((h: any) => /OUTPUT via compatibility parser/i.test(h.message))).toBe(true);
        });

        it('renders the OUTPUT INTO target as a write node fed from the update', () => {
            const sql = `update  tt
set     tt.active = 1
output  inserted.active
into    #output_table
from    #temp_table tt`;
            const result = parseSql(sql, TSQL);

            const updateNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'UPDATE');
            const outputTarget = result.nodes.find((n: any) =>
                n.type === 'table' && n.label?.toLowerCase() === '#output_table'
            );

            expect(updateNode).toBeDefined();
            expect(outputTarget).toBeDefined();
            expect(outputTarget?.accessMode).toBe('write');
            expect(result.edges.some((e: any) => e.source === updateNode?.id && e.target === outputTarget?.id)).toBe(true);
        });

        it('still parses OUTPUT without an INTO target (results returned to client)', () => {
            const sql = `update tt
set    tt.active = 1
output inserted.active
from   #temp_table tt`;
            const result = parseSql(sql, TSQL);

            expect(result.error).toBeUndefined();
            const updateNode = result.nodes.find((n: any) => n.type === 'result' && n.label === 'UPDATE');
            expect(updateNode?.details?.some((d: string) => /OUTPUT/i.test(d))).toBe(true);
        });
    });
});
