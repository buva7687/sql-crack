-- ============================================================
-- Inline Diagnostics Playground
-- ============================================================
-- Goal: Trigger SQL Crack diagnostics in the Problems panel.
-- Steps:
--   1) Open this file and save.
--   2) Open Problems panel and filter by "SQL Crack".
--   3) Use Quick Fix: "Show in SQL Flow".
-- ============================================================

-- Q1: Non-sargable expression (function on indexed column)
SELECT
    e.employee_id,
    e.name,
    e.hire_date
FROM employees e
WHERE YEAR(e.hire_date) = 2024
  AND e.status = 'active';

-- Q2: Leading wildcard LIKE (index-unfriendly)
SELECT
    c.customer_id,
    c.email
FROM customers c
WHERE c.email LIKE '%@example.com';

-- Q3: Repeated table scans through scalar subqueries
SELECT
    o.customer_id,
    (SELECT COUNT(*) FROM orders x WHERE x.customer_id = o.customer_id) AS order_count,
    (SELECT AVG(total_amount) FROM orders y WHERE y.customer_id = o.customer_id) AS avg_order,
    (SELECT MAX(total_amount) FROM orders z WHERE z.customer_id = o.customer_id) AS max_order
FROM orders o;

-- Q4: HAVING used for non-aggregate predicate
SELECT
    dept_id,
    COUNT(*) AS employee_count
FROM employees
GROUP BY dept_id
HAVING dept_id = 10;

-- Q5: Intentional parse error (should surface parser diagnostic)
SELEC employee_id, name FROM employees;
