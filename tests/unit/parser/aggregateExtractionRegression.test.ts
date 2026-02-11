import { parseSql } from '../../../src/webview/sqlParser';

describe('Aggregate extraction regression', () => {
    it('does not leak CASE alias into unrelated aggregate functions (analytics-customer Q3)', () => {
        const sql = `
SELECT
    c.customer_id,
    c.customer_name,
    c.email,
    c.tier,
    c.region,
    MAX(o.order_date) AS last_purchase_date,
    DATE_DIFF('day', MAX(o.order_date), CURRENT_DATE) AS days_since_last_purchase,
    COUNT(DISTINCT o.order_id) AS purchase_frequency,
    SUM(o.total_amount) AS total_monetary_value,
    AVG(o.total_amount) AS avg_order_value,
    CASE
        WHEN COUNT(DISTINCT o.order_id) > 10
             AND SUM(o.total_amount) > 10000
             AND DATE_DIFF('day', MAX(o.order_date), CURRENT_DATE) < 30 THEN 'Champion'
        WHEN COUNT(DISTINCT o.order_id) > 5
             AND SUM(o.total_amount) > 5000 THEN 'Loyal Customer'
        WHEN COUNT(DISTINCT o.order_id) > 3 THEN 'Regular Customer'
        WHEN DATE_DIFF('day', MAX(o.order_date), CURRENT_DATE) > 180 THEN 'At Risk'
        ELSE 'New/Nurture'
    END AS customer_segment
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE c.status = 'active'
    AND c.registration_date < CURRENT_DATE - INTERVAL '90 days'
GROUP BY c.customer_id, c.customer_name, c.email, c.tier, c.region
HAVING COUNT(DISTINCT o.order_id) > 0
ORDER BY total_monetary_value DESC;
        `;

        const result = parseSql(sql, 'Snowflake');
        const aggregateNode = result.nodes.find((n: any) => n.type === 'aggregate' && n.label === 'AGGREGATE') as any;

        expect(result.error).toBeUndefined();
        expect(aggregateNode).toBeDefined();

        const details = aggregateNode.aggregateDetails.functions as Array<{ expression: string; alias?: string }>;
        const expressions = details.map(d => d.expression);
        const aliases = details.map(d => d.alias).filter(Boolean);

        expect(expressions).toEqual(expect.arrayContaining([
            'MAX(order_date)',
            'COUNT(DISTINCT order_id)',
            'SUM(total_amount)',
            'AVG(total_amount)',
        ]));
        expect(new Set(expressions).size).toBe(expressions.length);
        expect(aliases).not.toContain('customer_segment');
    });

    it('keeps aggregate alias assignment scoped to the aggregate-producing column', () => {
        const sql = `
SELECT
    AVG(o.total_amount) AS avg_order_value,
    CASE WHEN SUM(o.total_amount) > 1000 THEN 'high' ELSE 'low' END AS customer_segment
FROM orders o
GROUP BY o.customer_id;
        `;

        const result = parseSql(sql, 'Snowflake');
        const aggregateNode = result.nodes.find((n: any) => n.type === 'aggregate' && n.label === 'AGGREGATE') as any;
        const details = aggregateNode.aggregateDetails.functions as Array<{ expression: string; alias?: string }>;

        const avg = details.find(d => d.expression === 'AVG(total_amount)');
        const sum = details.find(d => d.expression === 'SUM(total_amount)');

        expect(avg).toBeDefined();
        expect(sum).toBeDefined();
        expect(avg?.alias).toBe('avg_order_value');
        expect(sum?.alias).toBeUndefined();
    });

    it('formats PostgreSQL aggregate column references without object coercion', () => {
        const sql = `
SELECT
    MAX(o.order_date) AS last_purchase_date,
    COUNT(DISTINCT o.order_id) AS purchase_frequency,
    SUM(o.total_amount) AS total_monetary_value,
    AVG(o.total_amount) AS avg_order_value
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id;
        `;

        const result = parseSql(sql, 'PostgreSQL');
        const aggregateNode = result.nodes.find((n: any) => n.type === 'aggregate' && n.label === 'AGGREGATE') as any;
        const details = aggregateNode.aggregateDetails.functions as Array<{ expression: string; sourceColumn?: string }>;

        expect(result.error).toBeUndefined();
        expect(details.map(d => d.expression)).toEqual(expect.arrayContaining([
            'MAX(order_date)',
            'COUNT(DISTINCT order_id)',
            'SUM(total_amount)',
            'AVG(total_amount)',
        ]));
        expect(details.some(d => d.expression.includes('[object Object]'))).toBe(false);
        expect(details.some(d => String(d.sourceColumn).includes('[object Object]'))).toBe(false);
    });

    it('formats PostgreSQL performance index hint columns without object coercion', () => {
        const sql = `
SELECT
    c.customer_id,
    c.customer_name,
    SUM(o.total_amount) AS total_monetary_value
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE c.status = 'active'
GROUP BY c.customer_id, c.customer_name
ORDER BY total_monetary_value DESC;
        `;

        const result = parseSql(sql, 'PostgreSQL');
        const indexHint = result.hints.find((h: any) =>
            h.message?.includes('Columns that may benefit from indexing/clustering')
        );

        expect(indexHint).toBeDefined();
        expect(indexHint?.message).not.toContain('[object Object]');
        expect(indexHint?.suggestion).not.toContain('[object Object]');
        expect(indexHint?.suggestion).toContain('filter:');
        expect(indexHint?.suggestion).toContain('join:');
        expect(indexHint?.suggestion).toContain('sort:');
    });
});
