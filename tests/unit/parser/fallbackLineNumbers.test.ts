import { parseSql, setParseTimeout } from '../../../src/webview/sqlParser';
import type { SqlDialect } from '../../../src/webview/types/parser';

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
});
