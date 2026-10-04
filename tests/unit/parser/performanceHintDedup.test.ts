import { parseSql } from '../../../src/webview/sqlParser';

describe('performance hint deduplication', () => {
    it('does not recommend collapsing an intentional employee-manager self-join', () => {
        const result = parseSql('SELECT a.id AS employee_id, b.id AS manager_id FROM employees a JOIN employees b ON a.manager_id = b.id', 'PostgreSQL');
        const repeated = result.hints.filter(hint => /table ["']employees["'].*2 times/i.test(hint.message));
        expect(repeated).toHaveLength(1);
        expect(repeated[0].type).toBe('info');
        expect(repeated[0].suggestion).not.toMatch(/scan.*once|single CTE/i);
        expect(result.nodes.flatMap(node => node.warnings || []).filter(warning => warning.type === 'repeated-scan')).toEqual([]);
    });

    it('keeps a self-join spread across a longer join chain informational', () => {
        const result = parseSql(
            'SELECT a.id, c.id AS grand_manager FROM employees a JOIN employees b ON a.manager_id = b.id '
            + 'JOIN departments d ON d.id = a.dept_id JOIN employees c ON b.manager_id = c.id',
            'PostgreSQL'
        );
        const repeated = result.hints.filter(hint => /table ["']employees["'].*3 times/i.test(hint.message));
        expect(repeated).toHaveLength(1);
        expect(repeated[0].type).toBe('info');
    });

    it('still warns when distinct aliases read the same table in separate UNION branches', () => {
        const result = parseSql(
            "SELECT o1.id FROM orders o1 WHERE o1.status = 'a' UNION ALL SELECT o2.id FROM orders o2 WHERE o2.status = 'b'",
            'PostgreSQL'
        );
        const repeated = result.hints.filter(hint => /table ["']orders["'].*2 times/i.test(hint.message));
        expect(repeated).toHaveLength(1);
        expect(repeated[0].type).toBe('warning');
        expect(repeated[0].message).not.toContain('distinct aliases');
    });

    it('emits a single repeated-table hint for the same table usage pattern', () => {
        const sql = `
            SELECT oi1.order_id
            FROM order_items oi1
            JOIN order_items oi2 ON oi1.order_id = oi2.order_id
        `;

        const result = parseSql(sql, 'MySQL');
        const repeatedTableHints = result.hints.filter(h =>
            /table ['"]order_items['"] (?:is )?(?:scanned|accessed) 2 times/i.test(h.message)
        );

        expect(repeatedTableHints).toHaveLength(1);
        expect(repeatedTableHints[0].type).toBe('info');
        expect(repeatedTableHints[0].message).toContain('distinct aliases');
    });

    it('does not emit overlapping scanned/accessed hints for Query 4 style repeated tables', () => {
        const sql = `
            SELECT DISTINCT
                c.customer_id,
                o.order_id,
                p1.product_id AS purchased_product_id,
                p2.product_id AS recommended_product_id,
                (SELECT COUNT(*)
                 FROM order_items oi2
                 JOIN order_items oi3 ON oi2.order_id = oi3.order_id
                 WHERE oi2.product_id = p1.product_id
                   AND oi3.product_id = p2.product_id) AS purchase_frequency
            FROM customers c
            JOIN orders o ON c.customer_id = o.customer_id
            JOIN order_items oi1 ON o.order_id = oi1.order_id
            JOIN products p1 ON oi1.product_id = p1.product_id
            JOIN order_items oi2 ON o.order_id = oi2.order_id
            JOIN products p2 ON oi2.product_id = p2.product_id
            WHERE p1.product_id != p2.product_id
        `;

        const result = parseSql(sql, 'MySQL');
        const scannedTables = new Set(
            result.hints
                .map(h => h.message.match(/^table\s+["']([^"']+)["']\s+(?:is\s+)?scanned\s+\d+\s+times/i)?.[1]?.toLowerCase())
                .filter((table): table is string => Boolean(table))
        );

        const accessedOverlaps = result.hints.filter(h => {
            const match = h.message.match(/^table\s+["']([^"']+)["']\s+(?:is\s+)?accessed\s+\d+\s+times/i);
            if (!match) {
                return false;
            }
            return scannedTables.has(match[1].toLowerCase());
        });

        expect(accessedOverlaps).toHaveLength(0);
    });
});
