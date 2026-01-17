# SQL Crack Layout Configuration

SQL Crack supports two layout directions for visualizing SQL query flows:

## Layout Options

### Vertical Layout (Default)
- **Direction**: Top-to-bottom flow
- **Best for**: Deep hierarchies, complex CTEs, traditional flowchart style
- **Characteristics**:
  - Nodes stack vertically
  - Edges connect from bottom to top
  - Familiar top-down visualization
  - Ideal for queries with many nested levels

### Horizontal Layout
- **Direction**: Left-to-right flow
- **Best for**: Wide queries, many parallel operations, timeline-style visualization
- **Characteristics**:
  - Nodes arrange horizontally
  - Edges connect from right to left
  - Better screen space utilization for wide graphs
  - Ideal for queries with many JOINs or parallel branches

## Configuration

### VS Code Settings

**Option 1: Via Settings UI**
1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for "SQL Crack"
3. Find "Default Graph Layout Direction"
4. Choose `vertical` or `horizontal`

**Option 2: Via settings.json**
```json
{
  "sqlCrack.defaultLayout": "vertical"
}
```

Or:
```json
{
  "sqlCrack.defaultLayout": "horizontal"
}
```

### Runtime Toggle

You can also toggle layout direction at runtime using keyboard shortcuts:

- **Press `H`** - Toggle between vertical and horizontal layouts

The layout preference persists across VS Code sessions.

## Comparison

| Aspect | Vertical | Horizontal |
|--------|----------|------------|
| **Flow Direction** | Top → Bottom | Left → Right |
| **Best For** | Deep hierarchies | Wide queries |
| **Screen Usage** | Better for tall screens | Better for wide screens |
| **CTE Visibility** | Stacked vertically | Arranged horizontally |
| **Edge Curves** | Bottom-to-top arcs | Right-to-left arcs |
| **Default** | ✅ Yes | ❌ |

## Usage Examples

### Example 1: Deep CTE Hierarchy (Vertical)

```sql
WITH 
  cte1 AS (SELECT * FROM table1),
  cte2 AS (SELECT * FROM cte1),
  cte3 AS (SELECT * FROM cte2),
  cte4 AS (SELECT * FROM cte3)
SELECT * FROM cte4;
```

**Recommendation**: Vertical layout shows the nested structure clearly.

### Example 2: Wide JOIN Operations (Horizontal)

```sql
SELECT 
  a.*, b.*, c.*, d.*, e.*
FROM table_a a
JOIN table_b b ON a.id = b.id
JOIN table_c c ON a.id = c.id
JOIN table_d d ON a.id = d.id
JOIN table_e e ON a.id = e.id;
```

**Recommendation**: Horizontal layout utilizes screen width better.

## Tips

1. **Switch Mid-Analysis**: Press `H` to quickly toggle and see which layout works better
2. **Consider Screen Orientation**:
   - Vertical monitors → Vertical layout
   - Wide monitors → Horizontal layout
3. **Query Complexity**:
   - Deep nesting → Vertical
   - Many parallel operations → Horizontal
4. **Presentation Mode**:
   - Vertical works better for slides/portrait viewing
   - Horizontal works better for wide screens/landscape viewing

## Technical Details

### Layout Algorithms

Both layouts use the same underlying **dagre** graph layout algorithm but with different direction parameters:

- **Vertical**: `rankdir: 'TB'` (Top to Bottom)
- **Horizontal**: `rankdir: 'LR'` (Left to Right)

### Edge Rendering

Edges automatically adjust their curvature based on layout direction:

- **Vertical**: Bezier curves with control points on Y-axis
- **Horizontal**: Bezier curves with control points on X-axis

### Node Positioning

The layout algorithm automatically:
1. Calculates node ranks (levels)
2. Minimizes edge crossings
3. Optimizes node spacing
4. Generates coordinate positions

## Troubleshooting

### Layout Not Applied?

1. **Check Settings**: Verify `sqlCrack.defaultLayout` in settings.json
2. **Refresh**: Close and reopen the visualization panel
3. **Toggle**: Press `H` twice to reset the layout
4. **Restart**: Restart VS Code if settings don't take effect

### Nodes Overlapping?

- Try switching layout direction (press `H`)
- Use zoom out (scroll down or `-` key)
- Use "Fit View" button in toolbar

### Edges Not Visible?

- Check if nodes are too far apart
- Try the opposite layout direction
- Use "Fit View" to see the entire graph

## Configuration Examples

### For Different Scenarios

**Analytics Queries (Deep CTEs)**
```json
{
  "sqlCrack.defaultLayout": "vertical"
}
```

**Data Pipeline Queries (Wide Operations)**
```json
{
  "sqlCrack.defaultLayout": "horizontal"
}
```

**Presentation Mode**
```json
{
  "sqlCrack.defaultLayout": "vertical",
  "sqlCrack.viewLocation": "tab"
}
```

**Development Mode (Wide Screen)**
```json
{
  "sqlCrack.defaultLayout": "horizontal",
  "sqlCrack.viewLocation": "beside"
}
```

## Future Enhancements

Potential future layout options:
- Force-directed layout (physics-based)
- Radial layout (center-outward)
- Circular layout (cyclic graphs)
- Custom user-defined layouts

Have a suggestion? Open an issue on GitHub!

## See Also

- [README.md](./README.md) - Main documentation
- [Configuration](./README.md#configuration) - All configuration options
- [Keyboard Shortcuts](./README.md#keyboard-shortcuts) - All shortcuts including `H` for layout toggle
