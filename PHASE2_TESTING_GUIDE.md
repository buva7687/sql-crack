# Phase 2 Testing Guide

## Overview

This guide provides step-by-step instructions to test Phase 2: Column-Level Extraction functionality.

---

## Quick Start (5 minutes)

### Step 1: Verify Compilation

```bash
cd /Users/buvan/Documents/GitHub/sql-crack
npm run compile
```

**Expected Result**: ✅ `webpack 5.104.1 compiled successfully`

---

### Step 2: Load Extension in VS Code

1. Press `F5` to launch Extension Development Host
2. Or: Click "Run" → "Start Debugging"
3. A new VS Code window will open with the extension loaded

---

### Step 3: Open Test SQL Files

1. In the new window, open: `File` → `Open Folder`
2. Navigate to `/Users/buvan/Documents/GitHub/sql-crack/test-sql`
3. Open any test file (e.g., `simple-join.sql`)

---

### Step 4: Run Workspace Analysis

1. Open Command Palette: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: "Workspace Analysis"
3. Select: "SQL Crack: Analyze Workspace Dependencies"
4. The Workspace Analysis panel will open

**Expected Result**: ✅ Panel shows graph with table nodes

---

## Detailed Testing Methods

### Method 1: Visual Testing (Recommended for UX)

#### Test Column Extraction with Browser Console

1. Open Workspace Analysis panel
2. Open Browser DevTools:
   - Right-click anywhere in the panel → "Inspect Element"
   - Or press `F12` in the panel
3. Go to "Console" tab
4. Type this command to see extracted column data:

```javascript
// Get current graph data
const graphData = vscode.getState();

// View first node with references
const firstNode = graphData.graph?.nodes?.[0];
console.log('First node:', firstNode);

// Check if columns are extracted
console.log('References with columns:', graphData.graph?.nodes?.filter(n => n.references));
```

#### Expected Output for simple-join.sql:

```javascript
{
  id: "customers",
  type: "external",
  label: "customers",
  references: [
    {
      tableName: "customers",
      referenceType: "select",
      columns: [
        { columnName: "customer_id", usedIn: "select" },
        { columnName: "name", usedIn: "select" },
        { columnName: "email", usedIn: "select" },
        { columnName: "customer_id", usedIn: "join" }
      ]
    }
  ]
}
```

---

### Method 2: Unit Testing with Node.js

Create a test script:

```bash
cd /Users/buvan/Documents/GitHub/sql-crack
```

Create file `test-column-extraction.js`:

```javascript
// test-column-extraction.js
const { Parser } = require('node-sql-parser');

// Since workspace code is bundled, we'll test the logic directly
const parser = new Parser();

const testSQL = `
SELECT
    c.customer_id,
    c.name,
    o.order_id,
    o.amount
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'completed'
`;

try {
    const ast = parser.astify(testSQL, { database: 'mysql' });
    console.log('✅ SQL parsing successful');
    console.log('AST type:', ast.type);
    console.log('Columns:', ast.columns?.map(c => ({
        expr: c.expr?.type,
        column: c.expr?.column,
        table: c.expr?.table
    })));
    console.log('FROM:', ast.from?.map(f => ({
        table: f.table?.[0]?.table,
        alias: f.as
    })));
    console.log('JOIN:', ast.join?.map(j => ({
        table: j.table?.table?.[0]?.table,
        alias: j.as,
        on: j.on ? 'JOIN condition present' : 'none'
    })));
    console.log('WHERE:', ast.where ? 'WHERE clause present' : 'none');
} catch (error) {
    console.error('❌ Test failed:', error.message);
}
```

Run the test:

```bash
node test-column-extraction.js
```

**Expected Output**:
```
✅ SQL parsing successful
AST type: select
Columns: [
  { expr: 'column_ref', column: 'customer_id', table: [Object] },
  { expr: 'column_ref', column: 'name', table: [Object] },
  { expr: 'column_ref', column: 'order_id', table: [Object] },
  { expr: 'column_ref', column: 'amount', table: [Object] }
]
FROM: [
  { table: 'customers', alias: 'c' }
]
JOIN: [
  { table: 'orders', alias: 'o', on: 'JOIN condition present' }
]
WHERE: WHERE clause present
```

---

### Method 3: Create Table Definitions for Full Testing

To fully test column lineage, you need CREATE TABLE statements:

Create file `test-sql/schema.sql`:

```sql
-- Schema definitions for testing

CREATE TABLE customers (
    customer_id INT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP
);

CREATE TABLE orders (
    order_id INT PRIMARY KEY,
    customer_id INT,
    amount DECIMAL(10, 2),
    status VARCHAR(50),
    order_date DATE,
    created_at TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE order_items (
    item_id INT PRIMARY KEY,
    order_id INT,
    product_id INT,
    quantity INT,
    unit_price DECIMAL(10, 2),
    discount DECIMAL(10, 2),
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE products (
    product_id INT PRIMARY KEY,
    product_name VARCHAR(255),
    category VARCHAR(100)
);
```

Place `schema.sql` in the `test-sql` folder.

Now run Workspace Analysis again:

**Expected Result**: ✅ You should see:
- Table nodes for `customers`, `orders`, `order_items`, `products`
- Reference nodes for each SELECT query
- Column information in the references

---

## Test Cases Checklist

### Test 1: Simple JOIN ✅

**File**: `test-sql/simple-join.sql`

**Verify**:
- [ ] `customers` table extracted with columns: `customer_id`, `name`, `email`
- [ ] `orders` table extracted with columns: `order_id`, `amount`, `order_date`, `status`
- [ ] JOIN condition columns extracted: `customer_id` from both tables
- [ ] WHERE clause columns extracted: `status` from orders
- [ ] ORDER BY columns extracted: `order_date` from orders

**Console Check**:
```javascript
// In browser console, find the query node
const nodes = vscode.getState().graph.nodes;
const queryNode = nodes.find(n => n.type === 'file');
console.log('References:', queryNode.references);
```

---

### Test 2: Aggregates ✅

**File**: `test-sql/aggregates.sql`

**Verify**:
- [ ] Aggregate functions identified: `COUNT(*)`, `SUM`, `AVG`, `MIN`, `MAX`
- [ ] Scalar functions identified: `UPPER`, `LOWER`, `CONCAT`
- [ ] GROUP BY columns extracted: `customer_id`, `name`, `email`, `first_name`, `last_name`
- [ ] HAVING clause extracted: `SUM(amount) > 1000`

**Expected Transformation Types**:
- `aggregate` for `COUNT(*)`, `SUM`, `AVG`, `MIN`, `MAX`
- `scalar` for `UPPER`, `LOWER`
- `concat` for `CONCAT`

---

### Test 3: CTEs ✅

**File**: `test-sql/cte.sql`

**Verify**:
- [ ] CTE names extracted: `customer_orders`, `high_value_customers`
- [ ] CTEs not shown as external tables (filtered out)
- [ ] Subquery in SELECT extracted
- [ ] Column references through CTE boundaries

**Check for CTEs**:
```javascript
const refs = vscode.getState().graph.nodes.find(n => n.references)?.references;
console.log('All references:', refs?.map(r => ({
    table: r.tableName,
    type: r.referenceType,
    isCTE: r.referenceType === 'cte'
})));
```

---

### Test 4: CASE Expressions ✅

**File**: `test-sql/case-expressions.sql`

**Verify**:
- [ ] CASE expressions classified as `case` transformation type
- [ ] Conditional columns extracted from CASE clauses
- [ ] Multiple CASE statements in same query handled

**Expected**:
- 3 output columns from CASE: `amount_category`, `status_code`, `customer_tier`
- Each has `operation: 'case'`

---

### Test 5: Complex Transformations ✅

**File**: `test-sql/complex-transformations.sql`

**Verify**:
- [ ] Arithmetic operations: `*`, `-`, `+`
- [ ] CAST expressions: `CAST(created_at AS DATE)`
- [ ] COALESCE function
- [ ] ROUND function
- [ ] Nested expressions: `(quantity * unit_price) * 0.1`

**Expected Transformation Types**:
- `arithmetic` for `quantity * unit_price`
- `scalar` for `COALESCE`, `ROUND`, `CAST`

---

### Test 6: Window Functions ✅

**File**: `test-sql/window-functions.sql`

**Verify**:
- [ ] Window functions identified: `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `SUM`, `AVG`, `FIRST_VALUE`, `LAG`, `LEAD`
- [ ] PARTITION BY columns extracted
- [ ] ORDER BY in window functions extracted
- [ ] Frame clauses handled

**Expected**:
- All classified as `window` transformation type
- PARTITION BY column: `customer_id`
- ORDER BY columns: `amount`, `created_at`

---

### Test 7: Multiple JOINs ✅

**File**: `test-sql/multi-join.sql`

**Verify**:
- [ ] All 4 tables extracted: `customers`, `orders`, `order_items`, `products`
- [ ] JOIN conditions extracted for each join
- [ ] Column references disambiguated by table alias
- [ ] WHERE clause columns extracted
- [ ] All columns in SELECT statement extracted

**Check Tables**:
```javascript
const tables = vscode.getState().graph.nodes.filter(n => n.type === 'external');
console.log('Tables:', tables.map(t => t.label));
// Expected: ['customers', 'orders', 'order_items', 'products']
```

---

## Automated Testing Script

Create `run-phase2-tests.sh`:

```bash
#!/bin/bash

echo "=== Phase 2 Column Extraction Tests ==="
echo ""

# Test 1: Simple JOIN
echo "Test 1: Simple JOIN"
node test-column-extraction.js
echo ""

# Test 2: Verify files exist
echo "Test 2: Verify test files exist"
ls -la test-sql/*.sql
echo ""

# Test 3: Check compilation
echo "Test 3: Verify compilation"
npm run compile 2>&1 | tail -5
echo ""

echo "=== Tests Complete ==="
```

Run it:

```bash
chmod +x run-phase2-tests.sh
./run-phase2-tests.sh
```

---

## Debugging Tips

### Issue: No columns extracted

**Check**:
1. Is `options.extractColumns = true`?
2. Are the SQL files being parsed?
3. Check browser console for errors

**Debug Command** (in browser console):
```javascript
// Check if column extraction is enabled
vscode.postMessage({
    command: 'checkExtractionOptions'
});
```

---

### Issue: Wrong table assigned to column

**Check**:
1. Alias map built correctly?
2. Table aliases resolved?

**Debug Command**:
```javascript
// Build alias map manually
const parser = new Parser();
const ast = parser.astify('SELECT c.name FROM customers c', { database: 'mysql' });
const aliases = new Map();
if (ast.from) {
    ast.from.forEach(f => {
        if (f.as) aliases.set(f.as, f.table[0].table);
    });
}
console.log('Aliases:', Object.fromEntries(aliases));
```

---

### Issue: Transformation not classified

**Check**:
1. Expression type recognized?
2. Classification logic covers this case?

**Debug Command**:
```javascript
// Check expression type
const ast = parser.astify('SELECT UPPER(name) FROM customers', { database: 'mysql' });
console.log('Expression type:', ast.columns[0].expr.type);
console.log('Function name:', ast.columns[0].expr.name);
```

---

## Success Criteria

Phase 2 testing is successful when:

- [ ] ✅ All 7 test SQL files parse without errors
- [ ] ✅ Columns extracted from SELECT clauses
- [ ] ✅ Columns extracted from WHERE, JOIN, GROUP BY, HAVING, ORDER BY
- [ ] ✅ Table aliases resolved correctly
- [ ] ✅ Transformations classified correctly
- [ ] ✅ Aggregate functions identified
- [ ] ✅ Scalar functions identified
- [ ] ✅ CASE expressions handled
- [ ] ✅ Window functions handled
- [ ] ✅ CTEs handled correctly
- [ ] ✅ Multiple JOINs handled
- [ ] ✅ No compilation errors
- [ ] ✅ No runtime errors in browser console

---

## Next Steps After Testing

If all tests pass:

1. ✅ Phase 2 is verified complete
2. 📝 Document any edge cases found
3. 🚀 Proceed to Phase 3: Lineage Engine

If tests fail:

1. 🐛 Record the failure
2. 🔍 Check browser console for errors
3. 📝 Create issue with test case
4. 🔧 Fix and re-test

---

## Quick Reference Commands

```bash
# Compile
npm run compile

# Watch mode for development
npm run watch

# Run extension
F5 in VS Code

# Open test folder
cd test-sql

# Check AST parsing
node -e "const {Parser} = require('node-sql-parser'); const p = new Parser(); console.log(JSON.stringify(p.astify('SELECT 1', {database: 'mysql'}), null, 2));"
```

---

## Additional Resources

- **Implementation Details**: See `PHASE2_COMPLETED.md`
- **Source Code**: `src/workspace/extraction/`
- **Test Files**: `test-sql/*.sql`
- **Lineage Plan**: `LINEAGE_IMPLEMENTATION_PLAN.md`

---

**Happy Testing! 🧪**
