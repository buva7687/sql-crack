# SQLFlow-Style Visualization Branch

This branch (`claude/sqlflow-style-PVc4e`) contains an alternative visualization style inspired by [SQLFlow](https://sqlflow.gudusoft.com/).

## Key Differences from Original Version

### Visual Style
- **Hierarchical Layout**: Top-to-bottom data flow (like flowcharts)
- **Table Boxes**: Tables displayed as structured boxes with headers and column lists
- **Color Coding**:
  - 🔵 Blue boxes = Source tables (data originates here)
  - 🟢 Green boxes = Target/Result tables (data flows to here)
  - 🟡 Yellow boxes = Intermediate tables (optional)
- **Clean Professional Design**: More enterprise-friendly appearance

### Layout Algorithm
- Uses **Dagre** hierarchical layout instead of force-directed layout
- Automatic positioning with proper spacing
- Clear parent-to-child relationships
- Better for understanding data lineage

### Node Design
Each table node shows:
- **Header**: Table name with emoji indicator
- **Columns**: List of columns involved in the query (up to 8 shown)
- **Overflow**: "+N more..." indicator for tables with many columns

### Edge Styling
- Smooth animated arrows showing data flow direction
- Arrow heads for clear directionality
- Dashed lines for JOIN relationships
- Solid lines for INSERT/data flow

## How to Test Both Versions

### Current Branch (SQLFlow Style)
```bash
git checkout claude/sqlflow-style-PVc4e
npm install  # Installs dagre dependency
npm run compile
# Press F5 in VS Code to test
```

### Original Branch (Graph Style)
```bash
git checkout claude/sql-visualization-extension-PVc4e
npm install
npm run compile
# Press F5 in VS Code to test
```

## Example Query Visualization

When you visualize this query:
```sql
SELECT u.name, o.order_id, p.product_name
FROM users u
INNER JOIN orders o ON u.id = o.user_id  
INNER JOIN products p ON o.product_id = p.id
WHERE o.status = 'completed';
```

### SQLFlow Style Shows:
```
    [users]
      ▸ id
      ▸ name
       ↓
    [orders]
      ▸ order_id
      ▸ user_id
      ▸ product_id
      ▸ status
       ↓
   [products]
      ▸ product_name
       ↓
    [RESULT]
      ▸ name
      ▸ order_id
      ▸ product_name
```

## Technical Changes

### New Files
- `src/webview/sqlParserSQLFlow.tsx` - New parser with hierarchical layout logic

### Modified Files
- `src/webview/App.tsx` - Updated import to use SQLFlow parser
- `package.json` - Added dagre and @types/dagre dependencies

### Bundle Size
- Original: ~2.8 MB
- SQLFlow version: ~4.3 MB (due to dagre library)

Note: This is acceptable as dagre provides significantly better layout for data lineage visualization.

## Recommendation

- **Use SQLFlow style** if you prioritize:
  - Clear data lineage understanding
  - Professional/enterprise appearance
  - Top-to-bottom logical flow
  - Better for complex multi-table queries

- **Use Original style** if you prioritize:
  - Smaller bundle size
  - More flexible graph exploration
  - Interactive node positioning
  - Better for simple queries

## Next Steps

1. Test both versions with your real SQL queries
2. Decide which style fits your use case better
3. We can merge your preferred version or keep both with a toggle option

---

**Created for testing - not merged to main branch**
