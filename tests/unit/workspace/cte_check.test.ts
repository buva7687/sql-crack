import { ReferenceExtractor } from '../../../src/workspace/extraction/referenceExtractor';
import * as fs from 'fs';
import * as path from 'path';

describe('CTE reference filtering', () => {
    it('filters CTE names from references in single-statement WITH queries', () => {
        const sql = `
WITH
customer_journey AS (
    SELECT c.customer_id FROM customers c LEFT JOIN orders o ON c.customer_id = o.customer_id
),
customer_segments AS (
    SELECT customer_id FROM customer_journey
)
SELECT * FROM customer_segments;
`;
        const extractor = new ReferenceExtractor();
        const refs = extractor.extractReferences(sql, 'test.sql', 'MySQL');
        const refNames = refs.map((r: any) => r.tableName.toLowerCase());

        expect(refNames).not.toContain('customer_journey');
        expect(refNames).not.toContain('customer_segments');
        expect(refNames).toContain('customers');
        expect(refNames).toContain('orders');
    });

    it('filters CTE names in multi-statement files where AST parser may fall back to regex', () => {
        const sql = fs.readFileSync(path.join(__dirname, '../../../examples/demo-showcase.sql'), 'utf-8');
        const extractor = new ReferenceExtractor();
        const refs = extractor.extractReferences(sql, 'demo-showcase.sql', 'MySQL');

        const cteNames = ['customer_journey', 'customer_segments', 'revenue_metrics', 'monthly_product_sales',
                          'product_rankings', 'dept_salary_stats', 'top_earners', 'salary_analysis'];
        for (const cteName of cteNames) {
            const leaked = refs.filter((r: any) => r.tableName.toLowerCase() === cteName.toLowerCase());
            expect(leaked).toHaveLength(0);
        }

        // Real tables should still be present
        const refNames = refs.map((r: any) => r.tableName.toLowerCase());
        expect(refNames).toContain('customers');
        expect(refNames).toContain('orders');
    });

    it('ignores MySQL hash comments during regex fallback extraction', () => {
        const sql = `
# FROM fake_table
SEL * FROM real_table;
`;
        const extractor = new ReferenceExtractor();
        const refs = extractor.extractReferences(sql, 'hash-comment.sql', 'MySQL');
        const refNames = refs.map((r: any) => r.tableName.toLowerCase());

        expect(refNames).toContain('real_table');
        expect(refNames).not.toContain('fake_table');
    });

    it('filters subquery aliases from UPDATE...FROM even when keywords are lowercase', () => {
        const sql = `
update sales_target
set total = subq.total
from (
    select customer_id, sum(amount) as total
    from staging_payments
    group by customer_id
) as subq
join customers c on c.customer_id = subq.customer_id;
`;
        const extractor = new ReferenceExtractor();
        const refs = extractor.extractReferences(sql, 'update-alias.sql', 'MySQL');
        const refNames = refs.map((r: any) => r.tableName.toLowerCase());

        expect(refNames).toContain('staging_payments');
        expect(refNames).toContain('customers');
        expect(refNames).not.toContain('subq');
    });

    it('filters subquery aliases from UPDATE...FROM when alias omits AS keyword', () => {
        const sql = `
UpDaTe sales_target
SET total = subq.total
FrOm (
    select customer_id, sum(amount) as total
    from staging_payments
    group by customer_id
) subq
join customers c on c.customer_id = subq.customer_id;
`;
        const extractor = new ReferenceExtractor();
        const refs = extractor.extractReferences(sql, 'update-alias-no-as.sql', 'MySQL');
        const refNames = refs.map((r: any) => r.tableName.toLowerCase());

        expect(refNames).toContain('staging_payments');
        expect(refNames).toContain('customers');
        expect(refNames).not.toContain('subq');
    });
});
