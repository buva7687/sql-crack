import { parseSql, setParseTimeout } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';
import { regexFallbackParse } from '../../../src/webview/parser/dialects/fallback';

describe('Fallback line number assignment', () => {
    afterEach(() => {
        setParseTimeout();
        jest.restoreAllMocks();
    });

    function mockSlowParse(delayMs: number): void {
        const realNow = Date.now;
        let calls = 0;
        jest.spyOn(Date, 'now').mockImplementation(() => {
            calls++;
            if (calls <= 1) {
                return realNow.call(Date);
            }
            return realNow.call(Date) + delayMs;
        });
    }

    it('assigns start lines for Teradata MERGE compatibility parser nodes', () => {
        const sql = `MERGE INTO target_customers AS t
USING source_updates AS s
ON t.customer_id = s.customer_id
WHEN MATCHED THEN
  UPDATE SET t.customer_name = s.customer_name
WHEN NOT MATCHED THEN
  INSERT (customer_id, customer_name)
  VALUES (s.customer_id, s.customer_name)`;

        const result = parseSql(sql, 'Teradata' as SqlDialect);

        expect(result.partial).toBeUndefined();
        const targetTable = result.nodes.find(node => node.label === 'target_customers');
        const sourceTable = result.nodes.find(node => node.label === 'source_updates');
        const mergeNode = result.nodes.find(node => node.label === 'MERGE INTO target_customers');

        expect(targetTable?.startLine).toBe(1);
        expect(sourceTable?.startLine).toBe(2);
        expect(mergeNode?.startLine).toBe(1);
    });

    it('assigns start lines when timeout fallback is used', () => {
        mockSlowParse(6000);

        const sql = `SELECT c.id
FROM customers c
JOIN orders o ON c.id = o.customer_id`;
        const result = parseSql(sql, 'PostgreSQL' as SqlDialect);

        expect(result.partial).toBe(true);
        const customers = result.nodes.find(node => node.label.toLowerCase() === 'customers');
        const orders = result.nodes.find(node => node.label.toLowerCase() === 'orders');

        expect(customers?.startLine).toBe(2);
        expect(orders?.startLine).toBe(3);
    });

    it('assigns start lines when parse-error fallback is used', () => {
        const sql = `SELECT *
FROM broken_table
WHERE :=: invalid_token`;
        const result = parseSql(sql, 'MySQL' as SqlDialect);

        expect(result.partial).toBe(true);
        const brokenTable = result.nodes.find(node => node.label.toLowerCase() === 'broken_table');
        expect(brokenTable?.startLine).toBe(2);
    });

    it('strips glued MySQL hash comments without inventing JOIN tables', () => {
        const result = regexFallbackParse(
            'SELECT * FROM orders #TODO join customers\nWHERE id > 0',
            'MySQL'
        );

        expect(result.nodes.filter(node => node.type === 'table').map(node => node.label)).toEqual(['orders']);
    });

    it('does not treat EXTRACT field sources as fallback tables', () => {
        const result = regexFallbackParse(
            'SELECT EXTRACT(YEAR FROM created_at) FROM orders WHERE :=: invalid_token',
            'PostgreSQL'
        );

        expect(result.nodes.filter(node => node.type === 'table').map(node => node.label)).toEqual(['orders']);
    });

    it.each([
        ["SELECT SUBSTRING(name FROM 2) FROM customers WHERE :=: invalid_token", 'customers'],
        ["SELECT TRIM(BOTH 'x' FROM code) FROM products WHERE :=: invalid_token", 'products'],
        ["SELECT POSITION('x' IN name) FROM contacts WHERE :=: invalid_token", 'contacts'],
        ["SELECT OVERLAY(name PLACING 'x' FROM 2) FROM accounts WHERE :=: invalid_token", 'accounts'],
        ["SELECT SUBSTRING(COALESCE(name, '') FROM 2) FROM customers WHERE :=: invalid_token", 'customers'],
    ])('does not treat function FROM clauses as fallback tables: %s', (sql, expectedTable) => {
        const result = regexFallbackParse(sql, 'PostgreSQL');
        const tables = result.nodes.filter(node => node.type === 'table').map(node => node.label);
        expect(tables).toEqual([expectedTable]);
    });
});
