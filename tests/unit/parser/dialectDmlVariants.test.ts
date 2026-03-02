import { parseSql } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Dialect-specific DML variants', () => {
    describe('MySQL and MariaDB REPLACE INTO', () => {
        it('renders MySQL REPLACE ... SELECT with source flow and replace semantics', () => {
            const sql = `
                REPLACE INTO archive_orders (id, customer_id)
                SELECT id, customer_id
                FROM orders
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const sourceTable = result.nodes.find((node: any) =>
                node.type === 'table' &&
                node.label === 'orders' &&
                !node.accessMode
            );
            const targetTable = result.nodes.find((node: any) =>
                node.type === 'table' &&
                node.label === 'archive_orders' &&
                node.accessMode === 'write' &&
                node.operationType === 'REPLACE'
            );
            const replaceNode = result.nodes.find((node: any) =>
                node.type === 'result' &&
                node.label === 'REPLACE archive_orders'
            );
            const hint = result.hints.find((entry: any) => entry.message?.includes('REPLACE INTO'));

            expect(sourceTable).toBeDefined();
            expect(targetTable).toBeDefined();
            expect(replaceNode).toBeDefined();
            expect(replaceNode?.description).toContain('Semantics: delete conflicting row, then insert replacement');
            expect(replaceNode?.description).toContain('Source: SELECT');
            expect(hint?.suggestion).toMatch(/MySQL/i);
            expect(result.edges.some((edge: any) => edge.source === targetTable?.id && edge.target === replaceNode?.id)).toBe(true);
        });

        it('renders VALUES-backed REPLACE with row count details', () => {
            const sql = `
                REPLACE INTO users (id, name)
                VALUES (1, 'Alice'), (2, 'Bob')
            `;
            const result = parseSql(sql, 'MySQL' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const replaceNode = result.nodes.find((node: any) =>
                node.type === 'result' &&
                node.label === 'REPLACE users'
            );

            expect(replaceNode).toBeDefined();
            expect(replaceNode?.description).toContain('Rows: 2');
            expect(replaceNode?.description).toContain('Columns: id, name');
        });

        it('renders MariaDB REPLACE ... SET with assigned columns', () => {
            const sql = `
                REPLACE INTO users
                SET id = 1, name = 'Alice', updated_at = NOW()
            `;
            const result = parseSql(sql, 'MariaDB' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const replaceNode = result.nodes.find((node: any) =>
                node.type === 'result' &&
                node.label === 'REPLACE users'
            );
            const targetTable = result.nodes.find((node: any) =>
                node.type === 'table' &&
                node.label === 'users' &&
                node.accessMode === 'write' &&
                node.operationType === 'REPLACE'
            );

            expect(replaceNode).toBeDefined();
            expect(targetTable).toBeDefined();
            expect(replaceNode?.description).toContain('SET: id, name, updated_at');
            expect(replaceNode?.description).toContain('MariaDB REPLACE INTO');
        });
    });

    describe('Oracle multi-table inserts', () => {
        it('parses INSERT ALL through the compatibility parser and fans out to multiple targets', () => {
            const sql = `
                INSERT ALL
                    INTO sales_archive (id, customer_id) VALUES (id, customer_id)
                    INTO audit_log (entity_id, action_name) VALUES (id, 'ARCHIVE')
                SELECT id, customer_id
                FROM sales
            `;
            const result = parseSql(sql, 'Oracle' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const sourceTable = result.nodes.find((node: any) =>
                node.type === 'table' &&
                node.label === 'sales' &&
                !node.accessMode
            );
            const archiveTarget = result.nodes.find((node: any) =>
                node.type === 'table' &&
                node.label === 'sales_archive' &&
                node.accessMode === 'write'
            );
            const auditTarget = result.nodes.find((node: any) =>
                node.type === 'table' &&
                node.label === 'audit_log' &&
                node.accessMode === 'write'
            );
            const insertNode = result.nodes.find((node: any) =>
                node.type === 'result' &&
                node.label === 'INSERT ALL'
            );
            const hint = result.hints.find((entry: any) =>
                entry.message?.includes('Parsed Oracle INSERT ALL using compatibility parser')
            );

            expect(sourceTable).toBeDefined();
            expect(archiveTarget).toBeDefined();
            expect(auditTarget).toBeDefined();
            expect(insertNode).toBeDefined();
            expect(insertNode?.details).toContain('ALL ROWS -> sales_archive, audit_log');
            expect(hint).toBeDefined();
            expect(result.edges.some((edge: any) => edge.source === archiveTarget?.id && edge.target === insertNode?.id)).toBe(true);
            expect(result.edges.some((edge: any) => edge.source === auditTarget?.id && edge.target === insertNode?.id)).toBe(true);
        });

        it('parses INSERT FIRST branches with WHEN and ELSE routing', () => {
            const sql = `
                INSERT FIRST
                    WHEN amount < 100 THEN
                        INTO low_value_sales (order_id, amount) VALUES (order_id, amount)
                    WHEN amount >= 100 THEN
                        INTO high_value_sales (order_id, amount) VALUES (order_id, amount)
                    ELSE
                        INTO rejected_sales (order_id, amount) VALUES (order_id, amount)
                SELECT order_id, amount
                FROM staging_sales
            `;
            const result = parseSql(sql, 'Oracle' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const insertNode = result.nodes.find((node: any) =>
                node.type === 'result' &&
                node.label === 'INSERT FIRST'
            );
            const whenNodes = result.nodes.filter((node: any) => node.type === 'filter' && node.label === 'WHEN');
            const elseNode = result.nodes.find((node: any) => node.type === 'filter' && node.label === 'ELSE');
            const sourceTable = result.nodes.find((node: any) =>
                node.type === 'table' &&
                node.label === 'staging_sales' &&
                !node.accessMode
            );

            expect(insertNode).toBeDefined();
            expect(insertNode?.details).toContain('WHEN amount < 100 -> low_value_sales');
            expect(insertNode?.details).toContain('WHEN amount >= 100 -> high_value_sales');
            expect(insertNode?.details).toContain('ELSE -> rejected_sales');
            expect(whenNodes).toHaveLength(2);
            expect(elseNode?.details).toContain('ELSE -> rejected_sales');
            expect(sourceTable).toBeDefined();
        });
    });

    describe('Athena insert coverage', () => {
        it('keeps INSERT ... SELECT on the AST-backed write-flow path', () => {
            const sql = `
                INSERT INTO sales_archive
                SELECT *
                FROM sales
            `;
            const result = parseSql(sql, 'Athena' as SqlDialect);

            expect(result.error).toBeUndefined();
            expect(result.partial).toBeUndefined();

            const sourceTable = result.nodes.find((node: any) =>
                node.type === 'table' &&
                node.label === 'sales' &&
                !node.accessMode
            );
            const targetTable = result.nodes.find((node: any) =>
                node.type === 'table' &&
                node.label === 'sales_archive' &&
                node.accessMode === 'write' &&
                node.operationType === 'INSERT'
            );

            expect(sourceTable).toBeDefined();
            expect(targetTable).toBeDefined();
            expect(result.edges.some((edge: any) => edge.source === targetTable?.id)).toBe(true);
        });
    });
});
