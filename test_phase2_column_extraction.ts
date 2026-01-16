// Test Phase 2: Column-Level Extraction
// This file tests the new column extraction functionality

import { Parser } from 'node-sql-parser';
import { ColumnExtractor } from './src/workspace/extraction/columnExtractor';
import { TransformExtractor } from './src/workspace/extraction/transformExtractor';
import { ReferenceExtractor } from './src/workspace/extraction/referenceExtractor';

// Test 1: Simple SELECT with JOINs
const test1_SQL = `
SELECT
    c.customer_id,
    c.name,
    o.order_id,
    o.amount,
    o.order_date
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'completed'
`;

// Test 2: Aggregates and transformations
const test2_SQL = `
SELECT
    customer_id,
    COUNT(*) as order_count,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    UPPER(name) as customer_name_upper,
    CONCAT(first_name, ' ', last_name) as full_name
FROM orders
GROUP BY customer_id, name, first_name, last_name
HAVING SUM(amount) > 1000
ORDER BY total_amount DESC
`;

// Test 3: CTEs and subqueries
const test3_SQL = `
WITH customer_orders AS (
    SELECT
        customer_id,
        COUNT(*) as order_count,
        SUM(amount) as total_spent
    FROM orders
    WHERE status = 'completed'
    GROUP BY customer_id
),
high_value_customers AS (
    SELECT
        c.customer_id,
        c.name,
        co.order_count,
        co.total_spent
    FROM customers c
    JOIN customer_orders co ON c.customer_id = co.customer_id
    WHERE co.total_spent > 5000
)
SELECT
    hvc.name,
    hvc.order_count,
    hvc.total_spent,
    (SELECT COUNT(*) FROM orders WHERE customer_id = hvc.customer_id) as recent_orders
FROM high_value_customers hvc
ORDER BY hvc.total_spent DESC
`;

// Test 4: CASE expressions
const test4_SQL = `
SELECT
    customer_id,
    amount,
    CASE
        WHEN amount < 100 THEN 'Low'
        WHEN amount < 1000 THEN 'Medium'
        ELSE 'High'
    END as amount_category,
    CASE
        WHEN status = 'completed' THEN 1
        WHEN status = 'pending' THEN 0
        ELSE -1
    END as status_code
FROM orders
`;

// Test 5: Complex transformations
const test5_SQL = `
SELECT
    product_id,
    quantity,
    price,
    quantity * price as total_price,
    COALESCE(discount, 0) as discount_amount,
    (quantity * price) - COALESCE(discount, 0) as final_price,
    CAST(created_at AS DATE) as order_date
FROM order_items
WHERE quantity > 0
`;

function runTests() {
    const parser = new Parser();
    const columnExtractor = new ColumnExtractor();
    const transformExtractor = new TransformExtractor();
    const referenceExtractor = new ReferenceExtractor();

    console.log('=== Phase 2: Column-Level Extraction Tests ===\n');

    // Test 1: Simple JOIN
    console.log('Test 1: Simple SELECT with JOINs');
    console.log('SQL:', test1_SQL.trim());
    try {
        const ast1 = parser.astify(test1_SQL, { database: 'mysql' });
        const aliases1 = columnExtractor.buildAliasMap(ast1);
        console.log('Aliases:', Object.fromEntries(aliases1));

        const columns1 = columnExtractor.extractSelectColumns(ast1, aliases1);
        console.log('Extracted columns:', JSON.stringify(columns1, null, 2));

        const whereCols1 = columnExtractor.extractUsedColumns(ast1, 'where');
        console.log('WHERE columns:', JSON.stringify(whereCols1, null, 2));

        const refs1 = referenceExtractor.extractReferences(test1_SQL, 'test.sql', 'MySQL');
        console.log('References with columns:', JSON.stringify(refs1, null, 2));
        console.log('✅ Test 1 passed\n');
    } catch (error) {
        console.error('❌ Test 1 failed:', error);
    }

    // Test 2: Aggregates and transformations
    console.log('Test 2: Aggregates and Transformations');
    console.log('SQL:', test2_SQL.trim());
    try {
        const ast2 = parser.astify(test2_SQL, { database: 'mysql' });
        const aliases2 = columnExtractor.buildAliasMap(ast2);

        const columns2 = columnExtractor.extractSelectColumns(ast2, aliases2);
        console.log('Extracted columns:', JSON.stringify(columns2, null, 2));

        const transforms2 = transformExtractor.extractTransformations(ast2, aliases2);
        console.log('Transformations:', JSON.stringify(transforms2, null, 2));
        console.log('✅ Test 2 passed\n');
    } catch (error) {
        console.error('❌ Test 2 failed:', error);
    }

    // Test 3: CTEs
    console.log('Test 3: CTEs and Subqueries');
    console.log('SQL:', test3_SQL.trim());
    try {
        const refs3 = referenceExtractor.extractReferences(test3_SQL, 'test.sql', 'MySQL');
        console.log('References:', JSON.stringify(refs3, null, 2));

        const ast3 = parser.astify(test3_SQL, { database: 'mysql' });
        const aliases3 = columnExtractor.buildAliasMap(ast3);
        console.log('Aliases:', Object.fromEntries(aliases3));
        console.log('✅ Test 3 passed\n');
    } catch (error) {
        console.error('❌ Test 3 failed:', error);
    }

    // Test 4: CASE expressions
    console.log('Test 4: CASE Expressions');
    console.log('SQL:', test4_SQL.trim());
    try {
        const ast4 = parser.astify(test4_SQL, { database: 'mysql' });
        const aliases4 = columnExtractor.buildAliasMap(ast4);

        const columns4 = columnExtractor.extractSelectColumns(ast4, aliases4);
        console.log('Extracted columns:', JSON.stringify(columns4, null, 2));

        const transforms4 = transformExtractor.extractTransformations(ast4, aliases4);
        console.log('Transformations:', JSON.stringify(transforms4, null, 2));
        console.log('✅ Test 4 passed\n');
    } catch (error) {
        console.error('❌ Test 4 failed:', error);
    }

    // Test 5: Complex transformations
    console.log('Test 5: Complex Transformations');
    console.log('SQL:', test5_SQL.trim());
    try {
        const ast5 = parser.astify(test5_SQL, { database: 'mysql' });
        const aliases5 = columnExtractor.buildAliasMap(ast5);

        const columns5 = columnExtractor.extractSelectColumns(ast5, aliases5);
        console.log('Extracted columns:', JSON.stringify(columns5, null, 2));

        const transforms5 = transformExtractor.extractTransformations(ast5, aliases5);
        console.log('Transformations:', JSON.stringify(transforms5, null, 2));

        const whereCols5 = columnExtractor.extractUsedColumns(ast5, 'where');
        console.log('WHERE columns:', JSON.stringify(whereCols5, null, 2));
        console.log('✅ Test 5 passed\n');
    } catch (error) {
        console.error('❌ Test 5 failed:', error);
    }

    console.log('=== All Tests Complete ===');
}

// Run tests
runTests();
