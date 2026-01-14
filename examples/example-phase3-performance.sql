-- Phase 3: Static Performance Analysis Test Cases
-- This file contains SQL patterns designed to trigger performance analysis hints

-- 1. Filter Pushdown Opportunity
-- Filter after JOIN that could be applied earlier
SELECT
    e.name,
    e.salary,
    d.dept_name,
    d.location
FROM employees e
JOIN departments d ON e.dept_id = d.id
WHERE e.status = 'active'  -- This filter could be pushed down before JOIN
    AND e.salary > 50000
ORDER BY e.name;

-- 2. Non-Sargable Expression (Function on Column)
-- YEAR() function prevents index usage
SELECT
    e.name,
    e.hire_date,
    e.salary
FROM employees e
WHERE YEAR(e.hire_date) = 2024  -- Non-sargable: prevents index usage
    AND e.status = 'active'
ORDER BY e.name;

-- 3. LIKE with Leading Wildcard
SELECT
    e.name,
    e.email
FROM employees e
WHERE e.email LIKE '%@example.com'  -- Leading wildcard prevents index usage
    AND e.active = 1;

-- 4. Repeated Table Scan
-- Same table accessed multiple times
SELECT
    e1.name,
    e1.salary,
    (SELECT AVG(salary) FROM employees WHERE dept_id = e1.dept_id) as avg_dept_salary,
    (SELECT MAX(salary) FROM employees WHERE dept_id = e1.dept_id) as max_dept_salary
FROM employees e1
WHERE e1.status = 'active';

-- 5. Subquery to JOIN Conversion Opportunities
-- IN subquery that could be a JOIN
SELECT
    e.name,
    e.salary
FROM employees e
WHERE e.dept_id IN (SELECT id FROM departments WHERE location = 'NYC');

-- EXISTS subquery that could be a JOIN
SELECT
    e.name,
    e.salary
FROM employees e
WHERE EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.employee_id = e.id AND o.status = 'completed'
);

-- Scalar subquery in SELECT
SELECT
    e.name,
    e.salary,
    (SELECT d.dept_name FROM departments d WHERE d.id = e.dept_id) as dept_name
FROM employees e;

-- 6. HAVING without Aggregates
SELECT
    dept_id,
    COUNT(*) as emp_count,
    AVG(salary) as avg_salary
FROM employees
GROUP BY dept_id
HAVING dept_id = 5;  -- Should be in WHERE clause

-- 7. Aggregate without WHERE Filter
SELECT
    dept_id,
    COUNT(*) as emp_count,
    AVG(salary) as avg_salary,
    MAX(salary) as max_salary
FROM employees  -- No WHERE clause to reduce rows before aggregation
GROUP BY dept_id;

-- 8. COUNT(DISTINCT) - Expensive Operation
SELECT
    dept_id,
    COUNT(DISTINCT manager_id) as unique_managers,
    COUNT(*) as total_employees
FROM employees
GROUP BY dept_id;

-- 9. GROUP BY with Many Columns
SELECT
    dept_id,
    status,
    location,
    manager_id,
    hire_year,
    salary_band,
    COUNT(*) as emp_count
FROM employees
GROUP BY dept_id, status, location, manager_id, hire_year, salary_band;  -- High cardinality grouping

-- 10. CROSS JOIN Early in Join Order
SELECT
    e.name,
    d.dept_name,
    p.project_name
FROM employees e
CROSS JOIN projects p  -- CROSS JOIN should be later
INNER JOIN departments d ON e.dept_id = d.id
WHERE e.status = 'active';

-- 11. OR Condition Spanning Different Columns
SELECT
    e.name,
    e.salary
FROM employees e
WHERE e.dept_id = 1 OR e.manager_id = 100;  -- OR on different columns

-- 12. Complex Query with Multiple Issues
SELECT
    e.name,
    e.salary,
    d.dept_name,
    (SELECT AVG(salary) FROM employees WHERE dept_id = e.dept_id) as avg_salary,
    YEAR(e.hire_date) as hire_year
FROM employees e
JOIN departments d ON e.dept_id = d.id
WHERE YEAR(e.hire_date) = 2024
    AND e.email LIKE '%@example.com'
    AND e.status = 'active'
ORDER BY e.name;

-- 13. NOT IN with Subquery (NULL semantics warning)
SELECT
    e.name
FROM employees e
WHERE e.dept_id NOT IN (SELECT id FROM departments WHERE location = 'Remote');

-- 14. Index Suggestions - Multiple WHERE Conditions
SELECT
    e.name,
    e.salary,
    e.status
FROM employees e
WHERE e.dept_id = 5
    AND e.status = 'active'
    AND e.salary > 50000
ORDER BY e.name;

-- 15. JOIN with Index Suggestion
SELECT
    e.name,
    d.dept_name
FROM employees e
JOIN departments d ON e.dept_id = d.id  -- Index on e.dept_id would help
WHERE e.status = 'active';

-- 16. ORDER BY Index Suggestion
SELECT
    e.name,
    e.salary,
    e.hire_date
FROM employees e
WHERE e.status = 'active'
ORDER BY e.dept_id, e.salary DESC;  -- Covering index suggestion

