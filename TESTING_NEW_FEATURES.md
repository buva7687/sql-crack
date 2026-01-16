# Testing Guide for New Features - Lineage, Impact Analysis & UI Enhancements

This guide covers testing for the new features added in the latest commit:
- **Debounced Search** with instant highlighting
- **Data Lineage** tracking (upstream/downstream)
- **Impact Analysis** for table/column changes
- **Column Lineage** tracking
- **UI Enhancements** (view tabs, context menus, table explorer)

---

## Quick Start (5 minutes)

### 1. Compile & Launch
```bash
cd /Users/buvan/Documents/GitHub/sql-crack
npm run compile
```

Then in VS Code:
1. Open the project folder
2. Press `F5` to launch Extension Development Host
3. In the new window, open `examples/` folder

---

## Feature 1: Debounced Search (2 minutes)

### Test Setup
1. Open any `.sql` file with multiple tables (e.g., `examples/example-complex-joins.sql`)
2. Open SQL Crack visualization (Cmd+Shift+V)

### Test Steps

#### Test 1.1: Instant Highlighting
1. Press `Cmd+F` to open search box
2. Type "customer" slowly, one letter at a time
3. **Expected**: Matching nodes highlight immediately (yellow highlight) as you type
4. **Expected**: Graph does NOT zoom/jump until you stop typing for 600ms

#### Test 1.2: Debounced Navigation
1. Clear search (Escape)
2. Type "orders" quickly and stop
3. **Expected**: After 600ms pause, graph automatically zooms to first "orders" match
4. **Expected**: No jittery zooming while typing

#### Test 1.3: Search Navigation
1. Search for a common term (e.g., "id")
2. Use Enter/Down arrow to cycle through results
3. **Expected**: Each result is highlighted in sequence
4. **Expected**: Graph centers on each match

#### Verification
- ✅ Highlights appear instantly while typing
- ✅ Zoom happens only after stopping typing
- ✅ No camera shake/jitter during typing
- ✅ Search results are accurate

---

## Feature 2: Data Lineage Analysis (10 minutes)

### Test Setup
1. Create a test SQL file with dependencies:
```sql
-- Create test-lineage.sql
CREATE TABLE customers (
    customer_id INT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100)
);

CREATE TABLE orders (
    order_id INT PRIMARY KEY,
    customer_id INT,
    order_date DATE,
    amount DECIMAL(10,2)
);

CREATE VIEW customer_orders AS
SELECT 
    c.customer_id,
    c.name,
    COUNT(o.order_id) as order_count,
    SUM(o.amount) as total_spent
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.name;
```

2. Run **Workspace Analysis**:
   - Right-click folder → "SQL Crack: Analyze Workspace Dependencies"
   - Or `Cmd+Shift+P` → "Analyze Workspace Dependencies"

### Test 2.1: Lineage View Tab

1. In the workspace panel, look at the top right
2. **Expected**: Three tabs visible: **Graph**, **Lineage**, **Impact**
3. Click the **Lineage** tab
4. **Expected**: Panel shows "Data Lineage" header with back button

### Test 2.2: Upstream Lineage (Data Sources)

**Method A: Via Context Menu**
1. Switch back to **Graph** tab
2. Right-click on the `customer_orders` node
3. **Expected**: Context menu appears with options:
   - Show Upstream (👆)
   - Show Downstream (👇)
   - Show Full Lineage (🔄)
   - Explore Table (🔍)
   - Analyze Impact (💥)
4. Click **Show Upstream**
5. **Expected**: Switches to Lineage view, shows `customers` and `orders` as sources

**Method B: Via Command**
1. In browser console (F12), run:
```javascript
// Request upstream for customer_orders
vscode.postMessage({
    command: 'getLineage',
    data: {
        nodeId: 'table:customer_orders',
        direction: 'upstream',
        depth: 2
    }
});
```

**Expected Results**:
- Shows upstream nodes: `customers`, `orders`
- Shows flow arrows from sources → target
- Displays depth level
- Lists all tables in the flow path

### Test 2.3: Downstream Lineage (Data Consumers)

1. Right-click on `customers` table node
2. Click **Show Downstream**
3. **Expected**: Shows `customer_orders` as dependent
4. Shows how `customers` data flows into the view

### Test 2.4: Full Lineage (Both Directions)

1. Right-click on `orders` table
2. Click **Show Full Lineage**
3. **Expected**: Shows complete flow:
   - Upstream: nothing (it's a source)
   - Downstream: `customer_orders`
   - Full path visualization with all connections

### Test 2.5: Depth Control

1. In browser console:
```javascript
// Get lineage with specific depth
vscode.postMessage({
    command: 'getLineage',
    data: {
        nodeId: 'table:customers',
        direction: 'downstream',
        depth: 1  // Only immediate dependents
    }
});
```

2. **Expected**: Shows only direct dependencies (depth 1)

### Verification
- ✅ Lineage tab is accessible
- ✅ Context menu appears on right-click
- ✅ Upstream shows data sources correctly
- ✅ Downstream shows data consumers correctly
- ✅ Full lineage shows both directions
- ✅ Depth parameter works

---

## Feature 3: Impact Analysis (10 minutes)

### Test 3.1: Table Change Impact

**Setup**:
1. In **Graph** view, right-click on `customers` table
2. Click **Analyze Impact**
3. **Expected**: Switches to **Impact** tab

**Test Scenarios**:

**Scenario A: Modify Table**
1. In browser console:
```javascript
vscode.postMessage({
    command: 'analyzeImpact',
    data: {
        type: 'table',
        name: 'customers',
        changeType: 'modify'
    }
});
```

**Expected Results**:
- Shows impact report with:
  - **Severity**: HIGH (customers is referenced by customer_orders view)
  - **Direct Impacts**: Lists `customer_orders` view
  - **Transitive Impacts**: Any downstream consumers
  - **Suggestions**: "Review view definitions that reference customers"

**Scenario B: Drop Table**
```javascript
vscode.postMessage({
    command: 'analyzeImpact',
    data: {
        type: 'table',
        name: 'orders',
        changeType: 'drop'
    }
});
```

**Expected**:
- Severity: CRITICAL
- Shows all objects that will break
- Explicit warning about data loss

**Scenario C: Rename Table**
```javascript
vscode.postMessage({
    command: 'analyzeImpact',
    data: {
        type: 'table',
        name: 'customers',
        changeType: 'rename'
    }
});
```

**Expected**:
- Lists all SQL that needs updating
- Shows file paths and line numbers
- Suggestion: "Update all references before renaming"

### Test 3.2: Column Change Impact

**Setup**:
1. Right-click on any table node
2. Click **Explore Table** to see columns
3. Note the column names

**Test Column Modification**:
```javascript
vscode.postMessage({
    command: 'analyzeImpact',
    data: {
        type: 'column',
        tableName: 'customers',
        name: 'email',
        changeType: 'modify'
    }
});
```

**Expected Results**:
- Shows impacts if `email` is used in:
  - JOIN conditions
  - WHERE clauses
  - SELECT statements
- Severity based on usage count
- Suggestions for safe modification

### Verification
- ✅ Impact analysis works for tables
- ✅ Impact analysis works for columns
- ✅ Severity levels are appropriate
- ✅ Direct impacts are listed correctly
- ✅ Transitive impacts are tracked
- ✅ Actionable suggestions provided

---

## Feature 4: Column Lineage Tracking (8 minutes)

### Test 4.1: Basic Column Lineage

**Setup**: Create test file `test-column-lineage.sql`:
```sql
CREATE TABLE raw_sales (
    sale_id INT,
    product_id INT,
    quantity INT,
    price DECIMAL(10,2),
    sale_date DATE
);

CREATE VIEW sales_summary AS
SELECT 
    product_id,
    SUM(quantity * price) as revenue,
    COUNT(*) as sale_count,
    sale_date
FROM raw_sales
GROUP BY product_id, sale_date;

CREATE VIEW top_products AS
SELECT 
    product_id,
    revenue,
    RANK() OVER (ORDER BY revenue DESC) as ranking
FROM sales_summary
WHERE sale_date >= '2024-01-01';
```

**Test Steps**:
1. Run Workspace Analysis on this file
2. Switch to **Lineage** tab
3. In browser console:
```javascript
vscode.postMessage({
    command: 'getColumnLineage',
    data: {
        tableName: 'top_products',
        columnName: 'revenue'
    }
});
```

**Expected Results**:
- Shows transformation path:
  1. `raw_sales.quantity` * `raw_sales.price` 
  2. → `sales_summary.revenue` (SUM aggregation)
  3. → `top_products.revenue` (direct reference)
- Displays each transformation step
- Shows file paths and line numbers

### Test 4.2: Complex Column Transformations

**Setup**: Add to test file:
```sql
CREATE VIEW customer_metrics AS
SELECT 
    customer_id,
    SUM(quantity) as total_qty,
    AVG(price) as avg_price,
    CASE 
        WHEN SUM(quantity) > 100 THEN 'high'
        ELSE 'low'
    END as volume_category
FROM raw_sales
GROUP BY customer_id;
```

**Test**:
```javascript
vscode.postMessage({
    command: 'getColumnLineage',
    data: {
        tableName: 'customer_metrics',
        columnName: 'volume_category'
    }
});
```

**Expected**:
- Tracks through CASE expression
- Shows dependency on `SUM(quantity)`
- Shows transformation logic

### Verification
- ✅ Column lineage traces through multiple views
- ✅ Shows aggregation transformations
- ✅ Tracks CASE expressions
- ✅ Displays file locations
- ✅ Handles calculated columns correctly

---

## Feature 5: UI Enhancements (5 minutes)

### Test 5.1: View Mode Tabs

1. In Workspace panel, verify tabs are visible:
   - **Graph** (dependency graph)
   - **Lineage** (data lineage analysis)
   - **Impact** (change impact analysis)

2. Click each tab:
   - **Expected**: Smooth transition between views
   - **Expected**: Active tab is highlighted
   - **Expected**: Content changes without page reload

### Test 5.2: Table Explorer

**Test Steps**:
1. Right-click any table node
2. Click **Explore Table**
3. **Expected**: Switches to Lineage view showing:
   - Table name and type
   - Column list with data types (if available)
   - Upstream dependencies
   - Downstream dependencies
   - Usage statistics

### Test 5.3: Context Menu

**Test**:
1. Right-click on different node types (tables, views, files)
2. **Expected menu options**:
   - Show Upstream
   - Show Downstream  
   - Show Full Lineage
   - Explore Table (for tables/views)
   - Analyze Impact

3. Click each option:
   - **Expected**: Correct view opens with relevant data
   - **Expected**: Loading indicators for complex queries

### Test 5.4: Lineage Panel UI

1. Navigate to Lineage view (any lineage query)
2. **Expected UI elements**:
   - Back button (←) to return to previous view
   - Title showing current analysis (e.g., "Upstream Lineage")
   - Content area with formatted results
   - Node cards with:
     - Name
     - Type (table/view/file)
     - File path
     - Line numbers
     - Severity badges (for impact analysis)

### Test 5.5: Empty States

1. Switch to **Lineage** tab without running any query
2. **Expected**: Friendly empty state message
3. **Expected**: Icon or illustration
4. **Expected**: Helpful text explaining how to use lineage features

### Verification
- ✅ All tabs are visible and functional
- ✅ Context menu shows appropriate options
- ✅ Table explorer displays detailed information
- ✅ Lineage panel has proper navigation
- ✅ Empty states are user-friendly

---

## Feature 6: SQL Reserved Word Filtering (2 minutes)

### Test 6.1: False Positive Prevention

**Setup**: Create `test-reserved-words.sql`:
```sql
SELECT 
    select.name,
    from.status,
    where.location,
    join.department
FROM 
    employees as select,
    departments as from,
    locations as where,
    teams as join
WHERE 
    join.team_id = select.team_id;
```

**Test**:
1. Run Workspace Analysis
2. **Expected**: Tables detected: `employees`, `departments`, `locations`, `teams`
3. **NOT detected as tables**: `select`, `from`, `where`, `join` (these are aliases, not tables)

**Verification**:
- Graph should show 4 real tables (not the reserved words)
- No false positive nodes
- Edge relationships are correct

---

## Integration Testing (15 minutes)

### Test Scenario: ETL Pipeline Tracking

**Setup**: Create realistic ETL pipeline:
```sql
-- etl-pipeline.sql

-- Stage 1: Raw data ingestion
CREATE TABLE raw_transactions (
    transaction_id INT,
    customer_id INT,
    amount DECIMAL(10,2),
    transaction_date DATE,
    status VARCHAR(20)
);

-- Stage 2:清洗数据
CREATE VIEW cleaned_transactions AS
SELECT 
    transaction_id,
    customer_id,
    amount,
    transaction_date
FROM raw_transactions
WHERE status = 'completed'
    AND amount > 0;

-- Stage 3: Aggregation
CREATE VIEW daily_sales AS
SELECT 
    transaction_date,
    COUNT(*) as transaction_count,
    SUM(amount) as daily_revenue,
    AVG(amount) as avg_transaction
FROM cleaned_transactions
GROUP BY transaction_date;

-- Stage 4: Customer analytics
CREATE VIEW customer_analytics AS
SELECT 
    c.customer_id,
    COUNT(t.transaction_id) as total_transactions,
    SUM(t.amount) as lifetime_value,
    AVG(t.amount) as avg_transaction_value
FROM customers c
LEFT JOIN cleaned_transactions t ON c.customer_id = t.customer_id
GROUP BY c.customer_id;
```

**Test Flow**:

1. **Full Pipeline Impact**:
   - Right-click `raw_transactions` → Analyze Impact → Drop
   - **Expected**: Shows cascading impact through all 4 stages
   - Severity: CRITICAL

2. **Column Lineage Through Pipeline**:
   - Request column lineage for `customer_analytics.lifetime_value`
   - **Expected**: Traces back to `raw_transactions.amount`
   - Shows aggregation logic at each stage

3. **Upstream Analysis**:
   - Click `daily_sales` → Show Upstream
   - **Expected**: Shows `cleaned_transactions` → `raw_transactions`

4. **Downstream Analysis**:
   - Click `cleaned_transactions` → Show Downstream
   - **Expected**: Shows both `daily_sales` AND `customer_analytics`

5. **Search Test**:
   - In Graph view, search for "transaction"
   - **Expected**: Instant highlighting of all matches
   - After 600ms, zooms to first result

---

## Performance Testing (5 minutes)

### Test 7.1: Large Workspace

1. Create 50+ SQL files with table references
2. Run Workspace Analysis
3. **Expected**:
   - Indexing completes in reasonable time (< 30 seconds)
   - Graph renders without hanging
   - Search responds instantly

### Test 7.2: Complex Lineage Queries

1. Run column lineage on a deeply nested transformation (5+ levels)
2. **Expected**:
   - Results display in < 3 seconds
   - UI remains responsive
   - No browser freeze

---

## Browser Console Testing

### Useful Console Commands

```javascript
// 1. Check current graph state
vscode.getState()

// 2. Trigger lineage analysis
vscode.postMessage({
    command: 'getLineage',
    data: { nodeId: 'table:customers', direction: 'upstream', depth: 2 }
})

// 3. Trigger impact analysis
vscode.postMessage({
    command: 'analyzeImpact',
    data: { type: 'table', name: 'orders', changeType: 'modify' }
})

// 4. Get column lineage
vscode.postMessage({
    command: 'getColumnLineage',
    data: { tableName: 'customer_orders', columnName: 'total_spent' }
})

// 5. Explore table
vscode.postMessage({
    command: 'exploreTable',
    data: { tableName: 'customers' }
})

// 6. Switch views programmatically
vscode.postMessage({ command: 'switchToLineageView' })
vscode.postMessage({ command: 'switchToImpactView' })

// 7. Get lineage stats
vscode.postMessage({ command: 'getLineageStats' })
```

---

## Expected Bug Behaviors & Fixes

### Bug 1: Lineage Shows Empty Results
**Symptoms**: Clicking lineage shows blank panel

**Debug Steps**:
```javascript
// Check if lineage graph was built
console.log('Lineage nodes:', vscode.getState().lineageGraph?.nodes.size)

// Check if flow analyzer is initialized
console.log('Flow analyzer:', vscode.getState().flowAnalyzer)
```

**Fix**: Ensure workspace analysis completed successfully first

### Bug 2: Context Menu Doesn't Appear
**Symptoms**: Right-click does nothing

**Debug Steps**:
1. Open browser console
2. Check for JavaScript errors
3. Verify context-menu div exists: `document.getElementById('context-menu')`

**Fix**: Reload panel (Cmd+R) and try again

### Bug 3: Impact Analysis Shows No Results
**Symptoms**: Impact panel shows "No impacts found"

**Debug Steps**:
```javascript
// Verify table exists in lineage graph
const graph = vscode.getState().lineageGraph;
console.log('Has customers:', graph.nodes.has('table:customers'));
```

**Fix**: Run workspace analysis again to rebuild index

---

## Test Checklist

Use this checklist to verify all features:

### Debounced Search
- [ ] Instant highlighting while typing
- [ ] 600ms debounce before zoom
- [ ] No camera jitter
- [ ] Search navigation works (Enter/Down/Up)
- [ ] Search results are accurate

### Data Lineage
- [ ] Lineage tab is accessible
- [ ] Context menu appears on right-click
- [ ] Upstream analysis shows sources
- [ ] Downstream analysis shows consumers
- [ ] Full lineage shows both directions
- [ ] Depth parameter works correctly
- [ ] Lineage results display file paths

### Impact Analysis
- [ ] Impact tab is accessible
- [ ] Table impact analysis works
- [ ] Column impact analysis works
- [ ] Change types (modify/drop/rename) work
- [ ] Severity levels are appropriate
- [ ] Direct impacts listed correctly
- [ ] Transitive impacts tracked
- [ ] Suggestions are actionable

### Column Lineage
- [ ] Column lineage traces through views
- [ ] Shows aggregation transformations
- [ ] Tracks CASE expressions
- [ ] Displays file locations
- [ ] Handles calculated columns

### UI Enhancements
- [ ] View mode tabs visible and functional
- [ ] Context menu shows appropriate options
- [ ] Table explorer displays details
- [ ] Lineage panel has proper navigation
- [ ] Empty states are user-friendly
- [ ] Smooth transitions between views

### Bug Fixes
- [ ] SQL reserved words filtered correctly
- [ ] No false positive table detections
- [ ] Graph layout improvements visible
- [ ] Node positioning is clean

---

## Success Criteria

All tests pass if:
1. ✅ No JavaScript errors in browser console
2. ✅ All features are accessible via UI
3. ✅ Lineage results are accurate and complete
4. ✅ Impact analysis provides actionable insights
5. ✅ UI is responsive and smooth
6. ✅ Search works without jitter
7. ✅ Context menu appears consistently
8. ✅ Reserved words are filtered correctly

---

## Reporting Issues

If you find bugs, report with:
1. **Steps to reproduce** (exact SQL, exact clicks)
2. **Expected behavior** (what should happen)
3. **Actual behavior** (what actually happened)
4. **Browser console errors** (screenshot or copy-paste)
5. **VS Code version** and extension version

---

## Next Steps After Testing

If all tests pass:
1. ✅ Features verified
2. 📝 Document any edge cases discovered
3. 🚀 Ready for production use

If tests fail:
1. 🐛 Document failing tests
2. 🔍 Use console debugging
3. 🔧 Fix issues
4. 🔄 Re-test until passing

---

**Happy Testing! 🧪**

Need help? Check browser console (F12) and Extension Host output (View → Output → Extension Host)
