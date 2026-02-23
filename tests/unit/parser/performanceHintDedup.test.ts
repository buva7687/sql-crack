import { parseSql } from '../../../src/webview/sqlParser';

describe('performance hint deduplication', () => {
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
        expect(repeatedTableHints[0].message.toLowerCase()).toContain('scanned');
        expect(result.hints.some(h => /table 'order_items' is accessed 2 times/i.test(h.message))).toBe(false);
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
