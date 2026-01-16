-- ============================================================
-- Performance Analysis - Anti-Patterns and Optimization Hints
-- ============================================================
-- This file contains SQL patterns that trigger performance hints
--
-- Performance issues covered:
--   1. Filter pushdown opportunities
--   2. Non-sargable expressions (functions on columns)
--   3. LIKE with leading wildcard
--   4. Repeated table scans
--   5. Subquery to JOIN conversion
--   6. HAVING without aggregates
--   7. Missing WHERE filters
--   8. Expensive operations (COUNT DISTINCT)
--   9. High-cardinality GROUP BY
--   10. CROSS JOIN placement
--   11. OR conditions spanning columns
--   12. NOT IN with NULL semantics
--   13. Index suggestions
--
-- Use these examples to test:
--   - Performance hint panel
--   - Warning icons on nodes
--   - Optimization suggestions
-- ============================================================

-- ============================================================
-- 1. Filter Pushdown Opportunity
-- ============================================================
-- Filter after JOIN that could be applied before the JOIN
SELECT
    e.name,
    e.salary,
    d.dept_name,
    d.location
FROM employees e
JOIN departments d ON e.dept_id = d.id
WHERE e.status = 'active'  -- Could be pushed down before JOIN
    AND e.salary > 50000    -- Could be pushed down before JOIN
ORDER BY e.name;

-- ============================================================
-- 2. Non-Sargable Expression (Function on Column)
-- ============================================================
-- YEAR() function prevents index usage on hire_date
SELECT
    e.name,
    e.hire_date,
    e.salary
FROM employees e
WHERE YEAR(e.hire_date) = 2024  -- Non-sargable: use hire_date >= '2024-01-01' AND hire_date < '2025-01-01'
    AND e.status = 'active'
ORDER BY e.name;

-- Alternative non-sargable patterns
SELECT * FROM orders WHERE MONTH(order_date) = 12;  -- Function on column
SELECT * FROM customers WHERE UPPER(email) = 'TEST@EXAMPLE.COM';  -- Function on column
SELECT * FROM products WHERE price + tax > 100;  -- Expression on column

-- ============================================================
-- 3. LIKE with Leading Wildcard
-- ============================================================
-- Leading wildcard prevents index usage
SELECT
    e.name,
    e.email
FROM employees e
WHERE e.email LIKE '%@example.com'  -- Leading wildcard - cannot use index
    AND e.active = 1;

-- ============================================================
-- 4. Repeated Table Scan
-- ============================================================
-- Same table accessed multiple times in subqueries
SELECT
    e1.name,
    e1.salary,
    (SELECT AVG(salary) FROM employees WHERE dept_id = e1.dept_id) AS avg_dept_salary,
    (SELECT MAX(salary) FROM employees WHERE dept_id = e1.dept_id) AS max_dept_salary,
    (SELECT MIN(salary) FROM employees WHERE dept_id = e1.dept_id) AS min_dept_salary
FROM employees e1
WHERE e1.status = 'active';

-- ============================================================
-- 5. Subquery to JOIN Conversion - IN Subquery
-- ============================================================
-- IN subquery that could be rewritten as a JOIN
SELECT
    e.name,
    e.salary
FROM employees e
WHERE e.dept_id IN (
    SELECT id
    FROM departments
    WHERE location = 'NYC'
);

-- Better as:
-- SELECT e.name, e.salary
-- FROM employees e
-- JOIN departments d ON e.dept_id = d.id
-- WHERE d.location = 'NYC';

-- ============================================================
-- 6. Subquery to JOIN Conversion - EXISTS Subquery
-- ============================================================
-- EXISTS subquery that could be a JOIN
SELECT
    e.name,
    e.salary
FROM employees e
WHERE EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.employee_id = e.id
        AND o.status = 'completed'
);

-- ============================================================
-- 7. Scalar Subquery in SELECT
-- ============================================================
-- Scalar subquery executed for each row
SELECT
    e.name,
    e.salary,
    (SELECT d.dept_name FROM departments d WHERE d.id = e.dept_id) AS dept_name,
    (SELECT COUNT(*) FROM orders WHERE employee_id = e.id) AS order_count
FROM employees e;

-- ============================================================
-- 8. HAVING without Aggregates
-- ============================================================
-- Non-aggregate condition in HAVING should be in WHERE
SELECT
    dept_id,
    COUNT(*) AS emp_count,
    AVG(salary) AS avg_salary
FROM employees
GROUP BY dept_id
HAVING dept_id = 5;  -- Should be in WHERE clause

-- ============================================================
-- 9. Aggregate without WHERE Filter
-- ============================================================
-- No WHERE clause to reduce rows before aggregation
SELECT
    dept_id,
    COUNT(*) AS emp_count,
    AVG(salary) AS avg_salary,
    MAX(salary) AS max_salary
FROM employees  -- Full table scan before aggregation
GROUP BY dept_id;

-- ============================================================
-- 10. COUNT(DISTINCT) - Expensive Operation
-- ============================================================
-- COUNT(DISTINCT) requires sorting/hashing
SELECT
    dept_id,
    COUNT(DISTINCT manager_id) AS unique_managers,
    COUNT(DISTINCT location_id) AS unique_locations,
    COUNT(*) AS total_employees
FROM employees
GROUP BY dept_id;

-- ============================================================
-- 11. High-Cardinality GROUP BY
-- ============================================================
-- Many columns in GROUP BY creates many groups
SELECT
    dept_id,
    status,
    location,
    manager_id,
    hire_year,
    salary_band,
    COUNT(*) AS emp_count
FROM employees
GROUP BY dept_id, status, location, manager_id, hire_year, salary_band;

-- ============================================================
-- 12. CROSS JOIN Early in Join Order
-- ============================================================
-- CROSS JOIN should be later in the join sequence
SELECT
    e.name,
    d.dept_name,
    p.project_name
FROM employees e
CROSS JOIN projects p  -- Cartesian product should be filtered first
INNER JOIN departments d ON e.dept_id = d.id
WHERE e.status = 'active';

-- ============================================================
-- 13. OR Condition Spanning Different Columns
-- ============================================================
-- OR on different columns cannot use single index
SELECT
    e.name,
    e.salary
FROM employees e
WHERE e.dept_id = 1 OR e.manager_id = 100;  -- Cannot use single index

-- ============================================================
-- 14. Complex Query with Multiple Issues
-- ============================================================
-- This query has several performance problems
SELECT
    e.name,
    e.salary,
    d.dept_name,
    (SELECT AVG(salary) FROM employees WHERE dept_id = e.dept_id) AS avg_salary,
    YEAR(e.hire_date) AS hire_year
FROM employees e
JOIN departments d ON e.dept_id = d.id
WHERE YEAR(e.hire_date) = 2024         -- Non-sargable
    AND e.email LIKE '%@example.com'   -- Leading wildcard
    AND e.status = 'active'            -- Could be pushed down
ORDER BY e.name;

-- ============================================================
-- 15. NOT IN with Subquery (NULL Semantics Warning)
-- ============================================================
-- NOT IN can return unexpected results if subquery contains NULL
SELECT
    e.name
FROM employees e
WHERE e.dept_id NOT IN (
    SELECT id FROM departments WHERE location = 'Remote'
    -- If any id is NULL, this returns no rows!
);

-- Better: Use NOT EXISTS or explicit NULL handling
-- WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.id = e.dept_id AND d.location = 'Remote')

-- ============================================================
-- 16. Index Suggestions - Multiple WHERE Conditions
-- ============================================================
-- Suggests composite index on (dept_id, status, salary)
SELECT
    e.name,
    e.salary,
    e.status
FROM employees e
WHERE e.dept_id = 5
    AND e.status = 'active'
    AND e.salary > 50000
ORDER BY e.name;

-- ============================================================
-- 17. JOIN with Index Suggestion
-- ============================================================
-- Suggests index on e.dept_id for JOIN performance
SELECT
    e.name,
    d.dept_name
FROM employees e
JOIN departments d ON e.dept_id = d.id
WHERE e.status = 'active';

-- ============================================================
-- 18. ORDER BY Index Suggestion
-- ============================================================
-- Suggests covering index for ORDER BY
SELECT
    e.name,
    e.salary,
    e.hire_date
FROM employees e
WHERE e.status = 'active'
ORDER BY e.dept_id, e.salary DESC;

-- ============================================================
-- 19. SELECT * Anti-Pattern
-- ============================================================
-- SELECT * retrieves unnecessary columns
SELECT * FROM employees WHERE dept_id = 5;
SELECT * FROM orders WHERE status = 'completed';

-- ============================================================
-- 20. Missing LIMIT on Large Result Sets
-- ============================================================
-- No LIMIT clause on potentially large result
SELECT
    o.order_id,
    o.customer_id,
    o.total_amount,
    c.customer_name
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.status = 'completed'
ORDER BY o.order_date DESC;
-- Should have LIMIT clause
