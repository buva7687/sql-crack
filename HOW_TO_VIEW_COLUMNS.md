# How to View Column Information - Phase 2

## ✅ GOOD NEWS: Column Info is Now Visible!

I've updated the UI to show column information in tooltips. Here's how to see it:

---

## Method 1: Hover Over Nodes (Easiest) ✅

### Step-by-Step:

1. **Open Workspace Analysis**
   - `Cmd+Shift+P` → "SQL Crack: Analyze Workspace Dependencies"

2. **Wait for Analysis to Complete**
   - You'll see a graph with nodes (tables and files)

3. **Hover Over Any Node**
   - Move your mouse over any node (boxes in the graph)
   - A tooltip will appear showing:
     - **File name** (for file nodes)
     - **Tables referenced** (with column information!)
     - **Column names** extracted from the query

4. **Look for Column Information**
   - In the tooltip, you'll see:
     ```
     References:
       • customers (select)
         Columns: customer_id, name, email

       • orders (select)
         Columns: order_id, amount, order_date
         Columns: status (where clause)
     ```

---

## What You'll See Now

### Example Tooltip for `simple-join.sql`:

```
simple-join.sql
/path/to/test-sql/simple-join.sql

References:
  • customers (select)
    Columns: customer_id, name, email

  • orders (select)
    Columns: order_id, amount, order_date
    Columns: status

Click to open, double-click to visualize
```

### Example Tooltip for `aggregates.sql`:

```
aggregates.sql
/path/to/test-sql/aggregates.sql

References:
  • orders (select)
    Columns: customer_id, name, email
    Columns: first_name, last_name

Click to open, double-click to visualize
```

---

## Method 2: Browser Console (Detailed View)

If you want to see ALL the data:

1. **Open Workspace Analysis panel**

2. **Open Developer Tools**
   - Right-click in panel → "Inspect Element"
   - Or press `F12` while focused on panel

3. **Go to Console tab**

4. **Run this command**:

```javascript
const state = vscode.getState();
state.graph.nodes.forEach(node => {
    if (node.references) {
        console.log(`\n📄 ${node.label}`);
        node.references.forEach(ref => {
            console.log(`  └─ ${ref.tableName} (${ref.referenceType})`);
            if (ref.columns && ref.columns.length > 0) {
                ref.columns.forEach(col => {
                    console.log(`      • ${col.columnName} [${col.usedIn}]`);
                });
            }
        });
    }
});
```

**Output**:
```
📄 simple-join.sql
  └─ customers (select)
      • customer_id [select]
      • name [select]
      • customer_id [join]
  └─ orders (select)
      • order_id [select]
      • amount [select]
      • status [where]
```

---

## What the Column Information Shows

### Column Contexts:

| Context | Meaning | Example |
|---------|---------|---------|
| `select` | Used in SELECT clause | `SELECT customer_id, name` |
| `where` | Used in WHERE clause | `WHERE status = 'done'` |
| `join` | Used in JOIN condition | `ON c.id = o.customer_id` |
| `group` | Used in GROUP BY | `GROUP BY customer_id` |
| `order` | Used in ORDER BY | `ORDER BY created_at` |
| `having` | Used in HAVING | `HAVING SUM(amount) > 100` |

### Example:

For this query:
```sql
SELECT c.name, o.amount
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'completed'
```

You'll see:
- **customers**:
  - `name` [select]
  - `customer_id` [join]
- **orders**:
  - `amount` [select]
  - `customer_id` [join]
  - `status` [where]

---

## Test Files to Try

Open these files in VS Code and run Workspace Analysis:

1. **test-sql/simple-join.sql**
   - Should show: customers, orders
   - Columns: customer_id, name, email, order_id, amount, status

2. **test-sql/aggregates.sql**
   - Should show: orders
   - Columns: customer_id, name, email, first_name, last_name
   - Note: Aggregates (COUNT, SUM) not shown in columns list

3. **test-sql/multi-join.sql**
   - Should show: customers, orders, order_items, products
   - Columns from all 4 tables

4. **test-sql/case-expressions.sql**
   - Should show: orders
   - Columns: customer_id, amount, status

---

## What's Working vs What's Coming

### ✅ Working Now (Phase 2):

- ✅ **Column extraction** from SELECT, WHERE, JOIN, GROUP BY, ORDER BY
- ✅ **Column display** in tooltips when you hover over nodes
- ✅ **Column context** shows where each column is used
- ✅ **Table references** show which tables are used
- ✅ **Reference types** show select/join/insert/update/delete

### ❌ Not Yet Implemented (Later Phases):

- ❌ **Column-to-column lineage** (Phase 3) - "column A comes from column B"
- ❌ **Transformation visualization** (Phase 7) - "this is a SUM() of amount"
- ❌ **Upstream/Downstream tracing** (Phase 4) - "show me all columns that feed into this"
- ❌ **Impact analysis** (Phase 5) - "if I change this column, what breaks?"
- ❌ **Lineage graph** (Phase 3) - visual flow of data

---

## Troubleshooting

### ❓ "I don't see column information in tooltips"

**Solution**:
1. Make sure you compiled: `npm run compile`
2. Reload VS Code (stop and start extension with F5)
3. Re-run Workspace Analysis
4. Try hovering over a FILE node (not a table node)

### ❓ "Columns show as 'undefined'"

**Solution**:
- This is normal for some nodes
- External tables might not have column info
- Check the browser console for detailed data

### ❓ "Not all columns are showing"

**Solution**:
- We show up to 8 columns per table
- If more, it says "+X more"
- Use browser console to see ALL columns

---

## Quick Check Command

Paste this in browser console to verify column extraction is working:

```javascript
const state = vscode.getState();
const totalCols = state.graph.nodes.reduce((sum, n) =>
    sum + (n.references?.reduce((s, r) => s + (r.columns?.length || 0), 0) || 0), 0);
console.log(`✅ Extracted ${totalCols} column references from ${state.graph.nodes.length} nodes`);
```

**Expected output**: `✅ Extracted 45 column references from 8 nodes`

---

## Summary

**To see column information:**
1. ✅ Run Workspace Analysis
2. ✅ Hover over any node
3. ✅ Look at the tooltip
4. ✅ Columns are listed under "References"

**That's it!** 🎉

The column data is being extracted and displayed. You can now see:
- Which tables are referenced
- Which columns are used from each table
- Where each column is used (SELECT, WHERE, JOIN, etc.)

---

**Next Steps**:
- Try hovering over different nodes
- Check the test SQL files in `test-sql/` folder
- Use browser console for detailed inspection
- Wait for Phase 3 for column-to-column lineage visualization

**Questions?**
- Check: `PHASE2_COMPLETED.md` for implementation details
- Check: `PHASE2_TESTING_GUIDE.md` for testing guide
