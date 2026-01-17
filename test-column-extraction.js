// Quick test for Phase 2: Column Extraction
// Tests the SQL parsing layer that Phase 2 builds on

const { Parser } = require('node-sql-parser');

const parser = new Parser();

console.log('=== Phase 2 Column Extraction Tests ===\n');

// Test 1: Simple JOIN
console.log('Test 1: Simple JOIN with aliases');
const test1 = `
SELECT c.customer_id, c.name, o.order_id, o.amount
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'completed'
`;
try {
    const ast1 = parser.astify(test1, { database: 'mysql' });
    console.log('✅ Parsed successfully');
    console.log('  Columns:', ast1.columns.map(c => ({
        column: c.expr?.column,
        table: c.expr?.table?.[0]?.table || c.expr?.table,
        alias: c.expr?.table?.[0]?.alias || c.expr?.table?.as
    })));
    console.log('  FROM:', ast1.from.map(f => ({ table: f.table[0]?.table, alias: f.as })));
    console.log('  JOIN:', ast1.join.map(j => ({ table: j.table?.table?.[0]?.table, alias: j.as })));
    console.log('  WHERE:', ast1.where ? 'present' : 'none');
} catch (e) {
    console.log('❌ Failed:', e.message);
}
console.log('');

// Test 2: Aggregates
console.log('Test 2: Aggregates and functions');
const test2 = `
SELECT customer_id, COUNT(*) as cnt, SUM(amount) as total, UPPER(name) as name_upper
FROM orders
GROUP BY customer_id, name
`;
try {
    const ast2 = parser.astify(test2, { database: 'mysql' });
    console.log('✅ Parsed successfully');
    console.log('  Columns:', ast2.columns.map(c => ({
        expr: c.expr?.type,
        name: c.expr?.name || c.expr?.column,
        alias: c.as
    })));
    console.log('  GROUP BY:', ast2.groupby?.map(g => g.expr?.column));
} catch (e) {
    console.log('❌ Failed:', e.message);
}
console.log('');

// Test 3: CASE expression
console.log('Test 3: CASE expression');
const test3 = `
SELECT CASE WHEN amount < 100 THEN 'Low' ELSE 'High' END as category
FROM orders
`;
try {
    const ast3 = parser.astify(test3, { database: 'mysql' });
    console.log('✅ Parsed successfully');
    console.log('  Expression type:', ast3.columns[0].expr?.type);
    console.log('  Has CASE args:', ast3.columns[0].expr?.args ? 'yes' : 'no');
} catch (e) {
    console.log('❌ Failed:', e.message);
}
console.log('');

// Test 4: CTE
console.log('Test 4: CTE (Common Table Expression)');
const test4 = `
WITH cte AS (SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id)
SELECT * FROM cte
`;
try {
    const ast4 = parser.astify(test4, { database: 'mysql' });
    console.log('✅ Parsed successfully');
    console.log('  Has WITH clause:', ast4.with ? 'yes' : 'no');
    console.log('  CTE name:', ast4.with?.[0]?.name);
} catch (e) {
    console.log('❌ Failed:', e.message);
}
console.log('');

// Test 5: Window function
console.log('Test 5: Window function');
const test5 = `
SELECT ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount) as rn
FROM orders
`;
try {
    const ast5 = parser.astify(test5, { database: 'mysql' });
    console.log('✅ Parsed successfully');
    console.log('  Expression type:', ast5.columns[0].expr?.type);
    console.log('  Function name:', ast5.columns[0].expr?.name);
    console.log('  Has OVER:', ast5.columns[0].expr?.over ? 'yes' : 'no');
} catch (e) {
    console.log('❌ Failed:', e.message);
}
console.log('');

console.log('=== All Tests Complete ===');
