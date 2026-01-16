# Detailed Testing Plan - Lineage, Impact Analysis & UI Enhancements

## Executive Summary

This document provides a comprehensive testing plan for the new features added to SQL Crack:
- **Debounced Search** ✅ (Already working)
- **Data Lineage Analysis** (Tabs not visible - needs investigation)
- **Impact Analysis** (Tabs not visible - needs investigation)
- **Column Lineage Tracking** (Needs testing)
- **UI Enhancements** (Context menu, table explorer - needs testing)
- **SQL Reserved Word Filtering** (Needs testing)

---

## Test Environment Setup

### Prerequisites
1. **Compile the extension**:
   ```bash
   cd /Users/buvan/Documents/GitHub/sql-crack
   npm run compile
   ```

2. **Launch Extension Development Host**:
   - Open VS Code
   - Press `F5` to launch Extension Development Host
   - In the new window, open the `/Users/buvan/Documents/GitHub/sql-crack/examples` folder

3. **Enable Developer Tools**:
   - In the Extension Development Host window
   - Help → Toggle Developer Tools
   - This will allow you to see console errors and debug

---

## Part 1: Investigation - Why Tabs Aren't Showing

### Issue Report
- **Symptom**: Lineage and Impact tabs are not visible in the workspace panel
- **Expected**: Three tabs should be visible: Graph, Lineage, Impact
- **Actual**: Only Graph tab is visible (or tabs are missing entirely)

### Investigation Steps

#### Step 1: Verify HTML Contains Tabs
1. Open any folder with SQL files
2. Run "SQL Crack: Analyze Workspace Dependencies"
3. In Developer Tools console, run:
   ```javascript
   // Check if tabs exist in DOM
   document.querySelectorAll('.view-tabs')
   ```

**Expected**: Array with 1 element (the tabs container)
**If empty**: HTML is not being rendered

#### Step 2: Check Tab Buttons
```javascript
// Check individual tab buttons
document.querySelectorAll('.view-tab')
```

**Expected**: Array with 3 elements (Graph, Lineage, Impact)
**If only 1**: Only Graph tab is being rendered

#### Step 3: Check Lineage Panel
```javascript
// Check if lineage panel exists
document.getElementById('lineage-panel')
```

**Expected**: Element exists (even if hidden)
**If null**: Lineage panel HTML is missing

#### Step 4: Inspect the HTML
1. Right-click on the workspace panel
2. Select "Inspect Element"
3. Look for `<div class="view-tabs">` in the header
4. Look for `<div id="lineage-panel" class="lineage-panel">`

### Root Cause Analysis

#### Possible Cause 1: HTML Not Generated
**Check**: The `getWebviewHtml()` method might not include the tabs HTML
**Verify**: Search workspacePanel.ts for the tabs HTML generation (around line 1059)

#### Possible Cause 2: CSS Hiding Tabs
**Check**: Tabs might be hidden via CSS
**Verify**: In Developer Tools, check Computed styles for `.view-tabs`

#### Possible Cause 3: JavaScript Error
**Check**: Browser console might have errors preventing tab rendering
**Verify**: Check console for any JavaScript errors

#### Possible Cause 4: View Mode Not Supported
**Check**: The tabs might only show for certain graph modes
**Verify**: Try switching between Files/Tables/Hybrid modes

### Solution Verification

Once tabs are visible, verify:
1. ✅ Clicking "Lineage" tab switches the view
2. ✅ Clicking "Impact" tab switches the view
3. ✅ Clicking "Graph" tab returns to dependency graph
4. ✅ Active tab is highlighted

---

## Part 2: Data Lineage Testing

### Test Data Setup

The `examples/` folder contains perfect test files:
- **customer-schema.sql**: Defines customers, customer_segments, customer_feedback, customer_support tables
- **order-schema.sql**: Defines orders, order_items, order_analytics, regional_performance views
- **product-schema.sql**: Defines products and related tables

These files have clear dependencies:
```
products → order_items → orders → customers
                    ↓
            order_analytics (view)
            regional_performance (view)
```

### Test 2.1: Upstream Lineage (Data Sources)

**Objective**: Trace data back to its sources

**Test Case 2.1.1: Simple Upstream Trace**
1. Run Workspace Analysis on `examples/` folder
2. Wait for graph to render
3. Right-click on `order_analytics` view node
4. **Expected**: Context menu appears with:
   - Show Upstream (👆)
   - Show Downstream (👇)
   - Show Full Lineage (🔄)
   - Explore Table (🔍)
   - Analyze Impact (💥)

5. Click **Show Upstream**

**Expected Results**:
- Lineage view opens (or panel becomes visible)
- Shows upstream nodes:
  - `orders` table
  - `customers` table
  - `order_items` table
  - `products` table (via order_items)
- Flow arrows point FROM sources TO `order_analytics`
- Displays transformation depth
- Shows file paths for each source

**Verification**:
```javascript
// In browser console, check lineage state
vscode.getState()

// Should contain:
// - lineageGraph: LineageGraph object
// - selectedLineageNode: the order_analytics node
```

**Test Case 2.1.2: Multi-Level Upstream**
1. Right-click on `regional_performance` view
2. Click **Show Upstream**

**Expected Results**:
- Level 1: `orders` table
- Level 2: `customers` table
- Shows the full dependency chain

### Test 2.2: Downstream Lineage (Data Consumers)

**Objective**: Find what will be affected by changes

**Test Case 2.2.1: Simple Downstream Trace**
1. Switch to Graph view
2. Right-click on `customers` table
3. Click **Show Downstream**

**Expected Results**:
- Shows all objects that reference `customers`:
  - `orders` table (foreign key)
  - `customer_feedback` table (foreign key)
  - `customer_support` table (foreign key)
  - `order_analytics` view (JOIN)
  - `regional_performance` view (JOIN)
  - `customer_segments` view (source)

**Test Case 2.2.2: Cascading Dependencies**
1. Right-click on `products` table
2. Click **Show Downstream**

**Expected Results**:
- Level 1: `order_items` table (foreign key)
- Level 2: `orders` table (via order_items)
- Level 3: `order_analytics` view (via orders)
- Shows the full cascade

### Test 2.3: Full Lineage (Both Directions)

**Test Case 2.3.1: Complete Data Flow**
1. Right-click on `order_analytics` view
2. Click **Show Full Lineage**

**Expected Results**:
- Shows both upstream and downstream
- Visualizes the complete data journey
- Highlights the selected node in the center
- Shows all transformation paths

### Test 2.4: Depth-Limited Lineage

**Test Case 2.4.1: Immediate Neighbors**
1. In browser console, run:
   ```javascript
   vscode.postMessage({
       command: 'getLineage',
       data: {
           nodeId: 'table:order_analytics',
           direction: 'upstream',
           depth: 1
       }
   });
   ```

**Expected Results**:
- Only shows immediate dependencies (depth 1)
- Does not show multi-level chains

**Test Case 2.4.2: Extended Depth**
```javascript
vscode.postMessage({
    command: 'getLineage',
    data: {
        nodeId: 'table:customers',
        direction: 'downstream',
        depth: 3
    }
});
```

**Expected Results**:
- Shows up to 3 levels of dependencies
- Traces through multiple tables and views

### Test 2.5: Lineage Statistics

**Test Case 2.5.1: Get Lineage Stats**
1. In browser console:
   ```javascript
   vscode.postMessage({
       command: 'getLineageStats'
   });
   ```

**Expected Results**:
- Returns statistics:
  - Total tables in lineage graph
  - Total views
  - Total columns
  - Total edges (relationships)

---

## Part 3: Impact Analysis Testing

### Test 3.1: Table Change Impact

**Test Case 3.1.1: Modify Table Impact**
1. Right-click on `customers` table
2. Click **Analyze Impact**

**Expected Results**:
- Switches to Impact view
- Shows impact report:
  - **Change Type**: MODIFY
  - **Severity**: HIGH (affects multiple objects)
  - **Target**: `customers` table
  - **Direct Impacts**: List of all tables/views referencing customers
    - `orders` table (foreign key)
    - `customer_feedback` table
    - `customer_support` table
    - `order_analytics` view
    - `regional_performance` view
    - `customer_segments` view
  - **Transitive Impacts**: Downstream consumers
  - **Suggestions**:
    - "Review all foreign key constraints before modifying"
    - "Test views that depend on this table"
    - "Consider impact on analytics queries"

**Test Case 3.1.2: Drop Table Impact**
1. In browser console:
   ```javascript
   vscode.postMessage({
       command: 'analyzeImpact',
       data: {
           type: 'table',
           name: 'products',
           changeType: 'drop'
       }
   });
   ```

**Expected Results**:
- **Severity**: CRITICAL
- **Direct Impacts**:
  - `order_items` table (will break)
  - Any views using products
- **Transitive Impacts**:
  - `orders` (via order_items)
  - `order_analytics` (via orders)
- **Suggestions**:
  - "Dropping this table will break foreign key constraints"
  - "All dependent data will become orphaned"
  - "Consider soft delete instead"

**Test Case 3.1.3: Rename Table Impact**
1. Run impact analysis for rename on `customers`
2. **Expected**:
  - **Severity**: MEDIUM
  - Lists all SQL files that need updating
  - Shows line numbers for each reference
  - Suggestion: "Use database refactoring tools to update all references"

### Test 3.2: Column Change Impact

**Test Case 3.2.1: Modify Column Impact**
1. Right-click on `orders` table → Explore Table
2. Note the columns: `order_id`, `customer_id`, `order_date`, `total_amount`, etc.
3. Run impact analysis for `total_amount` column:
   ```javascript
   vscode.postMessage({
       command: 'analyzeImpact',
       data: {
           type: 'column',
           tableName: 'orders',
           name: 'total_amount',
           changeType: 'modify'
       }
   });
   ```

**Expected Results**:
- Shows all usages of `total_amount` column:
  - In SELECT clauses
  - In WHERE clauses
  - In aggregations (SUM, AVG)
  - In ORDER BY
- Severity based on usage count
- Suggestions for safe modification

**Test Case 3.2.2: Drop Column Impact**
1. Analyze impact of dropping `customer_id` from `orders`
2. **Expected**:
  - **Severity**: CRITICAL
  - Breaks all joins with customers table
  - Breaks foreign key constraint
  - Affects all analytics queries

### Test 3.3: Impact Severity Levels

**Verification**:
- ✅ **CRITICAL**: Dropping tables, dropping foreign key columns
- ✅ **HIGH**: Modifying tables with many dependents
- ✅ **MEDIUM**: Renaming tables/columns
- ✅ **LOW**: Modifying tables with few dependents

---

## Part 4: Column Lineage Testing

### Test 4.1: Simple Column Lineage

**Test Case 4.1.1: Direct Column Reference**
1. Create test file `test-column-lineage.sql`:
   ```sql
   CREATE TABLE raw_sales (
       sale_id INT,
       amount DECIMAL(10,2),
       sale_date DATE
   );

   CREATE VIEW sales_summary AS
   SELECT
           sale_id,
           amount,
           sale_date
   FROM raw_sales;
   ```

2. Run Workspace Analysis
3. Get column lineage:
   ```javascript
   vscode.postMessage({
       command: 'getColumnLineage',
       data: {
           tableName: 'sales_summary',
           columnName: 'amount'
       }
   });
   ```

**Expected Results**:
- Shows: `raw_sales.amount` → `sales_summary.amount`
- Type: Direct reference
- File path: `test-column-lineage.sql`

### Test 4.2: Aggregation Column Lineage

**Test Case 4.2.1: SUM Aggregation**
1. Add to test file:
   ```sql
   CREATE VIEW daily_sales AS
   SELECT
       sale_date,
       SUM(amount) as total_revenue,
       COUNT(*) as sale_count
   FROM raw_sales
   GROUP BY sale_date;
   ```

2. Get column lineage for `total_revenue`:
   ```javascript
   vscode.postMessage({
       command: 'getColumnLineage',
       data: {
           tableName: 'daily_sales',
           columnName: 'total_revenue'
       }
   });
   ```

**Expected Results**:
- Shows transformation:
  1. `raw_sales.amount`
  2. → `SUM(amount)` aggregation
  3. → `daily_sales.total_revenue`
- Transformation type: Aggregation

### Test 4.3: Multi-Level Column Lineage

**Test Case 4.3.1: Through Multiple Views**
1. Add to test file:
   ```sql
   CREATE VIEW sales_analytics AS
   SELECT
       sale_date,
       total_revenue,
       CASE
           WHEN total_revenue > 1000 THEN 'high'
           ELSE 'low'
       END as revenue_category
   FROM daily_sales;
   ```

2. Get column lineage for `revenue_category`:
   ```javascript
   vscode.postMessage({
       command: 'getColumnLineage',
       data: {
           tableName: 'sales_analytics',
           columnName: 'revenue_category'
       }
   });
   ```

**Expected Results**:
- Shows full transformation chain:
  1. `raw_sales.amount`
  2. → `daily_sales.total_revenue` (SUM aggregation)
  3. → `sales_analytics.revenue_category` (CASE expression)
- Each step shows:
  - Source table/column
  - Transformation logic
  - Target table/column

### Test 4.4: Complex Transformations

**Test Case 4.4.1: Arithmetic Operations**
1. Test column lineage for calculated columns:
   ```sql
   CREATE VIEW order_metrics AS
   SELECT
       order_id,
       quantity * unit_price as total_price
   FROM order_items;
   ```

2. Get lineage for `total_price`

**Expected Results**:
- Shows both source columns: `quantity`, `unit_price`
- Shows arithmetic operation: `*`
- Shows transformation step

**Test Case 4.4.2: CASE Expressions**
1. Test lineage through CASE:
   ```sql
   CREATE VIEW customer_tier AS
   SELECT
       customer_id,
       CASE
           WHEN total_orders > 100 THEN 'VIP'
           WHEN total_orders > 50 THEN 'Gold'
           ELSE 'Regular'
       END as tier
   FROM customer_summary;
   ```

2. Get lineage for `tier` column

**Expected Results**:
- Shows dependency on `total_orders`
- Shows CASE expression logic
- Traces back to original source

---

## Part 5: UI Enhancements Testing

### Test 5.1: View Mode Tabs

**Test Case 5.1.1: Tab Visibility**
1. Run Workspace Analysis
2. Check top right of panel
3. **Expected**: Three tabs visible:
   - **Graph** (default)
   - **Lineage**
   - **Impact**

**Test Case 5.1.2: Tab Switching**
1. Click **Lineage** tab
2. **Expected**:
   - Tab becomes active (highlighted)
   - Panel content changes
   - No page reload/flicker

3. Click **Impact** tab
4. **Expected**: Same smooth transition

5. Click **Graph** tab
6. **Expected**: Returns to dependency graph

### Test 5.2: Context Menu

**Test Case 5.2.1: Context Menu Appearance**
1. Right-click on any table node
2. **Expected**: Context menu appears at mouse position
3. **Expected menu items**:
   - Show Upstream (👆)
   - Show Downstream (👇)
   - Show Full Lineage (🔄)
   - Explore Table (🔍)
   - Analyze Impact (💥)

**Test Case 5.2.2: Context Menu Actions**
1. Right-click on `customers` table
2. Click **Show Upstream**
3. **Expected**: Switches to Lineage view, shows upstream sources

4. Right-click on `orders` table
5. Click **Analyze Impact**
6. **Expected**: Switches to Impact view, shows impact report

**Test Case 5.2.3: Context Menu Dismissal**
1. Open context menu
2. Click elsewhere on the graph
3. **Expected**: Context menu disappears

4. Open context menu
5. Press Escape
6. **Expected**: Context menu disappears

**Test Case 5.2.4: Context Menu on Different Node Types**
1. Right-click on table node
2. **Expected**: All menu items visible

3. Right-click on view node
4. **Expected**: Same menu items

5. Right-click on file node
6. **Expected**: Context menu might be different or disabled

### Test 5.3: Table Explorer

**Test Case 5.3.1: Open Table Explorer**
1. Right-click on `customers` table
2. Click **Explore Table**
3. **Expected**:
   - Switches to Lineage view
   - Shows detailed table information:
     - Table name: `customers`
     - Type: TABLE
     - Columns (if schema extracted):
       - `customer_id` (INTEGER, PRIMARY KEY)
       - `customer_name` (VARCHAR)
       - `email` (VARCHAR)
       - etc.
     - Upstream dependencies: None (base table)
     - Downstream dependents: List of all objects using customers
     - File path: `examples/customer-schema.sql`

**Test Case 5.3.2: Explore View**
1. Right-click on `order_analytics` view
2. Click **Explore Table**
3. **Expected**:
   - Shows view definition
   - Lists source tables
   - Shows transformations

### Test 5.4: Lineage Panel Navigation

**Test Case 5.4.1: Back Button**
1. Navigate to any lineage view
2. Click the back button (←) in the lineage header
3. **Expected**: Returns to previous view (Graph or table explorer)

**Test Case 5.4.2: Panel Title**
1. Run different lineage queries
2. **Expected**: Title updates to reflect current analysis:
   - "Upstream Lineage"
   - "Downstream Lineage"
   - "Full Data Lineage"
   - "Impact Analysis Report"

### Test 5.5: Empty States

**Test Case 5.5.1: Lineage Empty State**
1. Switch to Lineage tab without running any query
2. **Expected**:
   - Friendly empty state message
   - Helpful icon or illustration
   - Instructions: "Select a table or view to view its data lineage"

**Test Case 5.5.2: Impact Empty State**
1. Switch to Impact tab without running analysis
2. **Expected**:
   - Similar empty state
   - Instructions: "Right-click a table or column and select 'Analyze Impact'"

---

## Part 6: SQL Reserved Word Filtering

### Test 6.1: False Positive Prevention

**Test Case 6.1.1: Common SQL Keywords as Table Names**
1. Create test file `test-reserved-words.sql`:
   ```sql
   SELECT
       select.name,
       from.status,
       where.location,
       join.department
   FROM
       employees as "select",
       departments as "from",
       locations as "where",
       teams as "join"
   WHERE
       join.team_id = "select".team_id;
   ```

2. Run Workspace Analysis
3. **Expected**:
   - Real tables detected: `employees`, `departments`, `locations`, `teams`
   - **NOT detected**: `select`, `from`, `where`, `join` (these are aliases)
   - No false positive nodes in graph

**Test Case 6.1.2: Reserved Words in References**
1. Create test file:
   ```sql
   CREATE TABLE users (
       user_id INT,
       username VARCHAR,
       select_count INT,
       insert_count INT,
       update_count INT
   );

   SELECT
       user_id,
       select_count,
       insert_count
   FROM users
   WHERE update_count > 0;
   ```

2. Run Workspace Analysis
3. **Expected**:
   - Table detected: `users`
   - Column references NOT treated as tables
   - `SELECT`, `INSERT`, `UPDATE` keywords properly ignored

**Test Case 6.1.3: Reserved Word List Verification**
The following words should be filtered:
- DML: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- DDL: `CREATE`, `DROP`, `ALTER`, `TRUNCATE`
- Clauses: `FROM`, `WHERE`, `JOIN`, `GROUP`, `ORDER`, `HAVING`
- Keywords: `AND`, `OR`, `NOT`, `IN`, `AS`, `CASE`, `WHEN`, `THEN`, `ELSE`
- Functions: `COUNT`, `SUM`, `AVG`, `MAX`, `MIN`, etc.

### Test 6.2: Edge Cases

**Test Case 6.2.1: Mixed Case Reserved Words**
1. Test with: `Select`, `From`, `Where` (different casing)
2. **Expected**: Still filtered correctly (case-insensitive)

**Test Case 6.2.2: Reserved Words as Actual Table Names**
1. Some databases allow reserved words as table names with quoting
2. **Expected**: Handled gracefully (quoted identifiers respected)

---

## Part 7: Integration Testing

### Test 7.1: End-to-End Workflow

**Scenario**: Analyze impact of a schema change

**Steps**:
1. Open `examples/` folder
2. Run Workspace Analysis
3. Review the dependency graph
4. Right-click on `customers` table
5. Select **Analyze Impact** → Modify
6. Review impact report
7. Identify high-risk dependent objects
8. Right-click on `order_analytics` view
9. Select **Show Upstream** to understand data sources
10. Get column lineage for `customer_tier` column
11. Review transformation chain
12. Use **Explore Table** to see full column list

**Expected**:
- Smooth transitions between views
- Consistent data across all views
- All lineage and impact data is accurate
- No JavaScript errors in console

### Test 7.2: Performance Testing

**Test Case 7.2.1: Large Workspace**
1. Create 100+ SQL files with cross-references
2. Run Workspace Analysis
3. **Expected**:
   - Indexing completes in reasonable time (< 60 seconds)
   - Graph renders without hanging
   - Lineage queries respond in < 3 seconds
   - UI remains responsive

**Test Case 7.2.2: Complex Lineage Query**
1. Create deeply nested transformations (10+ levels)
2. Request full lineage
3. **Expected**:
   - Results display in < 5 seconds
   - No browser freeze
   - Memory usage remains reasonable

---

## Part 8: Error Handling

### Test 8.1: Missing Dependencies

**Test Case 8.1.1: Table Not Found**
1. Get lineage for non-existent table:
   ```javascript
   vscode.postMessage({
       command: 'getLineage',
       data: {
           nodeId: 'table:nonexistent_table',
           direction: 'upstream',
           depth: 2
       }
   });
   ```

**Expected**:
- Graceful error message
- No crash or hang
- User-friendly notification

**Test Case 8.1.2: Column Not Found**
1. Get column lineage for non-existent column
2. **Expected**: Similar graceful error handling

### Test 8.2: Invalid Input

**Test Case 8.2.1: Negative Depth**
1. Request lineage with depth: -1
2. **Expected**: Treat as unlimited depth or show error

**Test Case 8.2.2: Invalid Node ID**
1. Use malformed node ID
2. **Expected**: Clear error message

---

## Test Results Template

Use this template to record test results:

```
TEST EXECUTION REPORT
=====================

Date: _________________
Tester: _______________
Environment: VS Code version _______, OS _______

PART 1: Tab Visibility Investigation
[ ] Tabs HTML exists in DOM
[ ] All three tabs are visible (Graph, Lineage, Impact)
[ ] Tabs are clickable
[ ] Tab switching works smoothly

Notes: _________________________________


PART 2: Data Lineage Testing
2.1 Upstream Lineage
[ ] Test 2.1.1: Simple upstream trace - PASS / FAIL
[ ] Test 2.1.2: Multi-level upstream - PASS / FAIL

2.2 Downstream Lineage
[ ] Test 2.2.1: Simple downstream trace - PASS / FAIL
[ ] Test 2.2.2: Cascading dependencies - PASS / FAIL

2.3 Full Lineage
[ ] Test 2.3.1: Complete data flow - PASS / FAIL

2.4 Depth-Limited Lineage
[ ] Test 2.4.1: Immediate neighbors - PASS / FAIL
[ ] Test 2.4.2: Extended depth - PASS / FAIL

2.5 Lineage Statistics
[ ] Test 2.5.1: Get lineage stats - PASS / FAIL

Notes: _________________________________


PART 3: Impact Analysis Testing
3.1 Table Change Impact
[ ] Test 3.1.1: Modify table - PASS / FAIL
[ ] Test 3.1.2: Drop table - PASS / FAIL
[ ] Test 3.1.3: Rename table - PASS / FAIL

3.2 Column Change Impact
[ ] Test 3.2.1: Modify column - PASS / FAIL
[ ] Test 3.2.2: Drop column - PASS / FAIL

3.3 Impact Severity Levels
[ ] CRITICAL severity assigned correctly - PASS / FAIL
[ ] HIGH severity assigned correctly - PASS / FAIL
[ ] MEDIUM severity assigned correctly - PASS / FAIL
[ ] LOW severity assigned correctly - PASS / FAIL

Notes: _________________________________


PART 4: Column Lineage Testing
4.1 Simple Column Lineage
[ ] Test 4.1.1: Direct reference - PASS / FAIL

4.2 Aggregation Column Lineage
[ ] Test 4.2.1: SUM aggregation - PASS / FAIL

4.3 Multi-Level Column Lineage
[ ] Test 4.3.1: Through multiple views - PASS / FAIL

4.4 Complex Transformations
[ ] Test 4.4.1: Arithmetic operations - PASS / FAIL
[ ] Test 4.4.2: CASE expressions - PASS / FAIL

Notes: _________________________________


PART 5: UI Enhancements Testing
5.1 View Mode Tabs
[ ] Test 5.1.1: Tab visibility - PASS / FAIL
[ ] Test 5.1.2: Tab switching - PASS / FAIL

5.2 Context Menu
[ ] Test 5.2.1: Context menu appearance - PASS / FAIL
[ ] Test 5.2.2: Context menu actions - PASS / FAIL
[ ] Test 5.2.3: Context menu dismissal - PASS / FAIL
[ ] Test 5.2.4: Different node types - PASS / FAIL

5.3 Table Explorer
[ ] Test 5.3.1: Open table explorer - PASS / FAIL
[ ] Test 5.3.2: Explore view - PASS / FAIL

5.4 Lineage Panel Navigation
[ ] Test 5.4.1: Back button - PASS / FAIL
[ ] Test 5.4.2: Panel title - PASS / FAIL

5.5 Empty States
[ ] Test 5.5.1: Lineage empty state - PASS / FAIL
[ ] Test 5.5.2: Impact empty state - PASS / FAIL

Notes: _________________________________


PART 6: SQL Reserved Word Filtering
6.1 False Positive Prevention
[ ] Test 6.1.1: Common SQL keywords - PASS / FAIL
[ ] Test 6.1.2: Reserved words in references - PASS / FAIL
[ ] Test 6.1.3: Reserved word list - PASS / FAIL

6.2 Edge Cases
[ ] Test 6.2.1: Mixed case - PASS / FAIL
[ ] Test 6.2.2: Quoted identifiers - PASS / FAIL

Notes: _________________________________


PART 7: Integration Testing
[ ] Test 7.1: End-to-end workflow - PASS / FAIL
[ ] Test 7.2.1: Large workspace performance - PASS / FAIL
[ ] Test 7.2.2: Complex lineage performance - PASS / FAIL

Notes: _________________________________


PART 8: Error Handling
[ ] Test 8.1.1: Table not found - PASS / FAIL
[ ] Test 8.1.2: Column not found - PASS / FAIL
[ ] Test 8.2.1: Negative depth - PASS / FAIL
[ ] Test 8.2.2: Invalid node ID - PASS / FAIL

Notes: _________________________________


OVERALL RESULTS
===============
Total Tests: _____
Passed: ______
Failed: ______
Pass Rate: _____%

Critical Issues:
1. _________________________________
2. _________________________________

Non-Critical Issues:
1. _________________________________
2. _________________________________

Recommendations:
_________________________
_________________________

Ready for Production: [ ] YES [ ] NO

Signature: _________________
```

---

## Next Steps

1. **Fix Tab Visibility Issue** (Priority: CRITICAL)
   - Investigate why Lineage/Impact tabs aren't showing
   - Check if HTML is being generated
   - Verify CSS is not hiding tabs
   - Check for JavaScript errors

2. **Execute Test Plan** (After tabs fixed)
   - Follow this test plan systematically
   - Document all results
   - Report bugs with detailed reproduction steps

3. **Performance Optimization** (If needed)
   - Profile large workspace performance
   - Optimize lineage query execution
   - Improve caching strategies

4. **Documentation** (After testing complete)
   - Update user documentation with new features
   - Create tutorial videos
   - Write troubleshooting guide

---

**Good luck with testing! 🧪**
