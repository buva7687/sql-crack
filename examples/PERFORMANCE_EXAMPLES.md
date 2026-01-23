# Performance Analysis Examples

This document provides comprehensive examples of SQL Crack's static performance analysis capabilities.

## Overview

SQL Crack's static performance analysis detects common optimization opportunities without requiring database connectivity. It analyzes query structure using heuristics and AST parsing to provide actionable suggestions.

## Detected Issues

### 1. Filter Pushdown

**Issue**: Filter conditions applied after JOIN operations could be applied earlier to reduce the dataset size.

```sql
-- Detected: Filter after JOIN could be applied earlier
SELECT e.name, d.dept_name
FROM employees e
JOIN departments d ON e.dept_id = d.id
WHERE e.status = 'active';

-- ⬆ Suggestion: Move filter before JOIN
SELECT e.name, d.dept_name
FROM employees e
WHERE e.status = 'active'
JOIN departments d ON e.dept_id = d.id;
```

**Impact**: Reduces the number of rows processed in the JOIN operation.

---

### 2. Non-Sargable Expressions

**Issue**: Functions on columns prevent index usage.

```sql
-- Detected: Function on column prevents index usage
SELECT * FROM employees
WHERE YEAR(hire_date) = 2024;

-- 🚫 Suggestion: Use date range instead
SELECT * FROM employees
WHERE hire_date >= '2024-01-01' AND hire_date < '2025-01-01';
```

**More Examples**:
```sql
-- Function in WHERE clause
WHERE UPPER(name) = 'JOHN'  -- ⚠️ Use: WHERE name = 'john' COLLATE utf8mb4_general_ci

-- LIKE with leading wildcard
WHERE name LIKE '%son'     -- ⚠️ Cannot use index
```

**Impact**: Queries can't use indexes, leading to full table scans.

---

### 3. Subquery to JOIN Conversion

**Issue**: IN or EXISTS subqueries could be rewritten as JOINs for better performance.

```sql
-- Detected: IN subquery could be a JOIN
SELECT e.name, e.salary
FROM employees e
WHERE e.dept_id IN (
    SELECT id FROM departments WHERE location = 'NYC'
);

-- Suggestion: Convert to INNER JOIN
SELECT e.name, e.salary
FROM employees e
INNER JOIN departments d ON e.dept_id = d.id
WHERE d.location = 'NYC';
```

**Benefits**:
- Better optimization opportunities
- More execution plan options
- Potentially better join order

---

### 4. Repeated Table Scans

**Issue**: The same table is accessed multiple times in a query.

```sql
-- Detected: Table accessed multiple times
SELECT 
    e1.name,
    (SELECT AVG(salary) FROM employees WHERE dept_id = e1.dept_id) as avg_salary,
    (SELECT MAX(salary) FROM employees WHERE dept_id = e1.dept_id) as max_salary
FROM employees e1;

-- 🔄 Suggestion: Use CTE to scan once
WITH dept_stats AS (
    SELECT 
        dept_id,
        AVG(salary) as avg_salary,
        MAX(salary) as max_salary
    FROM employees
    GROUP BY dept_id
)
SELECT e.name, ds.avg_salary, ds.max_salary
FROM employees e
JOIN dept_stats ds ON e.dept_id = ds.dept_id;
```

**Impact**: Reduces I/O operations from multiple scans to a single scan.

---

### 5. Index Suggestions

**Issue**: Multiple WHERE or JOIN conditions could benefit from a composite index.

```sql
-- Detected: Multiple WHERE conditions
SELECT * FROM employees
WHERE dept_id = 5 
  AND status = 'active' 
  AND salary > 50000;

-- 📇 Suggestion: Composite index on (dept_id, status, salary)
CREATE INDEX idx_employee_dept_status_salary 
ON employees(dept_id, status, salary);

-- Example for JOIN conditions
SELECT * 
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE c.status = 'active';

-- 📇 Suggestion: Index on customers.status if frequently filtered
CREATE INDEX idx_customer_status ON customers(status);
```

---

### 6. Join Order Optimization

**Issue**: Join order may not be optimal for performance.

```sql
-- Detected: Consider filtering tables first
SELECT *
FROM huge_table h
JOIN small_filtered_table s ON h.id = s.id
WHERE s.type = 'active';

-- ⇄ Suggestion: Filter small table first
SELECT *
FROM small_filtered_table s
JOIN huge_table h ON s.id = h.id
WHERE s.type = 'active';
```

**Rationale**: Starting with a smaller filtered result set reduces the work for subsequent joins.

---

### 7. Aggregate Optimization

**Issue**: HAVING without WHERE, or COUNT(DISTINCT) patterns.

```sql
-- Issue: HAVING without WHERE filters after aggregation
SELECT dept_id, COUNT(*)
FROM employees
GROUP BY dept_id
HAVING COUNT(*) > 10;

-- ✅ Better: Filter before aggregation when possible
SELECT dept_id, COUNT(*)
FROM employees
WHERE salary > 50000  -- Pre-filter if applicable
GROUP BY dept_id
HAVING COUNT(*) > 10;
```

---

### 8. Anti-Pattern Detection

| Pattern | Severity | Description |
|---------|----------|-------------|
| `SELECT *` | Warning | Retrieves all columns, may be unnecessary |
| Missing `LIMIT` | Info | No row limit on result set |
| `DELETE`/`UPDATE` without `WHERE` | Error | Affects all rows - dangerous |
| Excessive JOINs (5+) | Warning | Complex query, hard to optimize |
| Cartesian products | Error | Missing JOIN condition |
| Non-sargable expressions | High | Prevents index usage |
| Filter after JOIN | Medium | Could push filter earlier |
| Repeated table scans | Medium/High | Multiple scans of same table |

## Complete Example

For comprehensive performance analysis examples, see:
- `quality-performance-hints.sql` — Performance hints and optimization suggestions
- `quality-code-warnings.sql` — Code quality issues and warnings

These files demonstrate all detected issues with before/after examples.

## Performance Score

SQL Crack calculates a performance score (0-100) based on:
- **Filter pushdown opportunities** (higher score = more opportunities)
- **Index usage potential** (missing indexes lower score)
- **Query complexity** (CTE depth, JOIN count, nesting levels)
- **Anti-patterns detected** (severity impacts score)
- **Repeated scans** (multiple hits reduce score)

**Score Categories**:
- **90-100**: Excellent - Well-optimized query
- **70-89**: Good - Minor improvements possible
- **50-69**: Fair - Several optimization opportunities
- **30-49**: Poor - Significant optimization needed
- **0-29**: Critical - Major issues detected

## How to Use

1. Open a SQL file in VS Code
2. Visualize with `Cmd/Ctrl + Shift + V`
3. Click the **Query Stats** button (Q) or view the hints panel
4. Review categorized hints:
   - **Performance** (Filter pushdown, index suggestions)
   - **Quality** (Unused CTEs, dead columns)
   - **Best Practice** (Code organization, readability)
   - **Complexity** (CTE depth, fan-out analysis)
5. Click on any hint to see detailed explanation and line numbers

## Limitations

- **Static Analysis Only**: No database connectivity, so no actual query execution statistics
- **Heuristic-Based**: Suggestions based on common patterns, not actual query plans
- **False Positives**: Some suggestions may not apply in your specific database context
- **Dialect Differences**: Some optimizations may vary by SQL dialect

For production optimization, always test suggestions with actual query plans (`EXPLAIN ANALYZE`).

---

*See also: [README.md](../README.md) | [quality-performance-hints.sql](./quality-performance-hints.sql)*
