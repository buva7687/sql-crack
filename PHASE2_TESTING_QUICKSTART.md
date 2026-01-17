# Phase 2 Testing - Quick Start Guide

## Fastest Way to Test (2 minutes)

### Step 1: Verify Compilation ✅
```bash
cd /Users/buvan/Documents/GitHub/sql-crack
npm run compile
```
**Expected**: `webpack 5.104.1 compiled successfully`

---

### Step 2: Run Basic Test ✅
```bash
node test-column-extraction.js
```
**Expected**: All tests pass (✅)

---

### Step 3: Test in VS Code Extension (Recommended)

1. **Launch Extension**:
   - Open VS Code
   - Press `F5` (opens Extension Development Host)

2. **Open Test Files**:
   - In the new window: `File` → `Open Folder`
   - Select: `/Users/buvan/Documents/GitHub/sql-crack/test-sql`

3. **Run Workspace Analysis**:
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type: "Workspace Analysis"
   - Select: "SQL Crack: Analyze Workspace Dependencies"

4. **Verify Results**:
   - Workspace Analysis panel opens
   - Graph shows with table nodes
   - No errors in console

---

## Test Files Created

All test files are in `test-sql/` folder:

| File | Tests | Status |
|------|-------|--------|
| `simple-join.sql` | JOINs, aliases | ✅ |
| `aggregates.sql` | COUNT, SUM, AVG, functions | ✅ |
| `cte.sql` | Common table expressions | ✅ |
| `case-expressions.sql` | CASE WHEN | ✅ |
| `complex-transformations.sql` | CAST, COALESCE, arithmetic | ✅ |
| `window-functions.sql` | ROW_NUMBER, RANK, OVER | ✅ |
| `multi-join.sql` | Multiple JOINs | ✅ |

---

## How to Verify Column Extraction

### Method 1: Browser Console (Most Detailed)

1. Open Workspace Analysis panel
2. Right-click → "Inspect Element" (or F12)
3. Go to Console tab
4. Run:
```javascript
// Get all graph data
const state = vscode.getState();
console.log('Graph nodes:', state.graph.nodes);

// Check for column data
const nodesWithRefs = state.graph.nodes.filter(n => n.references);
nodesWithRefs.forEach(node => {
    console.log(`Node: ${node.label}`);
    console.log('References:', node.references);
});
```

**Expected Output** (for simple-join.sql):
```javascript
{
  id: "...",
  label: "simple-join.sql",
  references: [
    {
      tableName: "customers",
      referenceType: "select",
      columns: [
        { columnName: "customer_id", usedIn: "select" },
        { columnName: "name", usedIn: "select" }
      ]
    },
    {
      tableName: "orders",
      referenceType: "select",
      columns: [
        { columnName: "order_id", usedIn: "select" },
        { columnName: "amount", usedIn: "select" }
      ]
    }
  ]
}
```

### Method 2: Check Graph Visualization

Look for:
- ✅ Table nodes (customers, orders, etc.)
- ✅ File nodes (SQL files)
- ✅ Edges between nodes
- ✅ No red errors in panel

---

## What to Check for Each Test

### Test 1: simple-join.sql
**Expected**:
- 2 table references: `customers`, `orders`
- Columns extracted from SELECT
- JOIN condition columns
- WHERE clause columns

### Test 2: aggregates.sql
**Expected**:
- Aggregate functions: COUNT, SUM, AVG, MIN, MAX
- Scalar functions: UPPER, LOWER, CONCAT
- GROUP BY columns
- HAVING clause

### Test 3: cte.sql
**Expected**:
- CTE names: `customer_orders`, `high_value_customers`
- Base tables: `customers`, `orders`
- Subquery handling

### Test 4: case-expressions.sql
**Expected**:
- CASE expressions identified
- Multiple CASE in one query
- Conditional columns extracted

### Test 5: complex-transformations.sql
**Expected**:
- Arithmetic: `*`, `-`, `+`
- CAST: `CAST(created_at AS DATE)`
- COALESCE
- ROUND function

### Test 6: window-functions.sql
**Expected**:
- Window functions: ROW_NUMBER, RANK, etc.
- PARTITION BY columns
- ORDER BY in windows

### Test 7: multi-join.sql
**Expected**:
- 4 tables: customers, orders, order_items, products
- 3 JOINs
- All columns extracted

---

## Troubleshooting

### ❌ "No columns extracted"

**Cause**: Column extraction might not be enabled

**Fix**:
```javascript
// Check in browser console
const state = vscode.getState();
console.log('References:', state.graph?.nodes?.[0]?.references);

// If columns array is missing or empty, check:
// 1. SQL file was parsed?
// 2. extractColumns option is true?
```

### ❌ "Graph doesn't show"

**Cause**: Extension not loaded or error in parsing

**Fix**:
1. Check for errors in "Output" → "Extension Host"
2. Recompile: `npm run compile`
3. Restart VS Code
4. Try F5 again

### ❌ "Compilation failed"

**Cause**: TypeScript error in code

**Fix**:
```bash
# Check errors
npm run compile

# Fix TypeScript errors shown
# Common issues:
# - Missing imports
# - Type mismatches
# - Syntax errors
```

---

## Test Results Template

Use this to track your testing:

```
Phase 2 Testing Results
========================

Date: ___________
Tester: _________

Compilation:
  [ ] npm run compile successful
  [ ] No TypeScript errors

Basic Test:
  [ ] node test-column-extraction.js passed

Extension Test:
  [ ] Extension loads (F5)
  [ ] Workspace Analysis opens
  [ ] Graph renders

Test Files:
  [ ] simple-join.sql - columns extracted
  [ ] aggregates.sql - functions identified
  [ ] cte.sql - CTEs handled
  [ ] case-expressions.sql - CASE works
  [ ] complex-transformations.sql - transformations work
  [ ] window-functions.sql - windows handled
  [ ] multi-join.sql - multiple JOINs work

Column Extraction:
  [ ] SELECT columns extracted
  [ ] WHERE columns extracted
  [ ] JOIN columns extracted
  [ ] GROUP BY columns extracted
  [ ] HAVING columns extracted
  [ ] ORDER BY columns extracted

Transformation Classification:
  [ ] Direct mappings
  [ ] Aggregates
  [ ] Scalars
  [ ] CASE expressions
  [ ] Arithmetic
  [ ] Window functions

Overall Status:
  [ ] PASS - All tests successful
  [ ] PARTIAL - Some tests failed (notes: ___________)
  [ ] FAIL - Critical issues (notes: ___________)

Notes:
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## Quick Verification Commands

```bash
# 1. Compile
npm run compile

# 2. Quick test
node test-column-extraction.js

# 3. Count test files
ls -la test-sql/*.sql | wc -l
# Expected: 7

# 4. Check source files
ls -la src/workspace/extraction/*.ts | wc -l
# Expected: 6 (types, schemaExtractor, referenceExtractor, columnExtractor, transformExtractor, index)
```

---

## Next Steps

After successful testing:

1. ✅ **Phase 2 Verified**
2. 📄 Document any issues found
3. 🚀 Ready for Phase 3: Lineage Engine

If issues found:

1. 🐛 Document the issue
2. 🔍 Check browser console
3. 📝 Create GitHub issue
4. 🔧 Fix and re-test

---

## Additional Testing Resources

- **Full Test Guide**: `PHASE2_TESTING_GUIDE.md`
- **Completion Report**: `PHASE2_COMPLETED.md`
- **Implementation Plan**: `LINEAGE_IMPLEMENTATION_PLAN.md`
- **Source Code**: `src/workspace/extraction/`

---

**Happy Testing! 🧪**

Need help? Check:
- Browser console (F12 in panel)
- Extension Host output (View → Output → Extension Host)
- TypeScript errors from `npm run compile`
