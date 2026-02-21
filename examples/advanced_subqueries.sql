-- ============================================================
-- Advanced Subqueries - Focused Examples
-- ============================================================
-- This file intentionally has only a couple of advanced queries:
--   1) WHERE IN expression subquery (non-container shape)
--   2) FROM derived subquery (expandable container shape)
-- ============================================================

-- ============================================================
-- 1. Correlated IN Subquery with Aggregate
-- ============================================================
SELECT
    e.employee_id,
    e.name,
    e.salary
FROM employees e
WHERE e.dept_id IN (
    SELECT e2.dept_id
    FROM employees e2
    WHERE e2.status = 'active'
    GROUP BY e2.dept_id
    HAVING AVG(e2.salary) > (
        SELECT AVG(e3.salary)
        FROM employees e3
    )
)
ORDER BY e.salary DESC;

-- ============================================================
-- 2. FROM Derived Subquery + Correlated Filter
-- ============================================================
SELECT
    ds.customer_id,
    ds.total_spent
FROM (
    SELECT
        o.customer_id,
        SUM(o.total_amount) AS total_spent
    FROM orders o
    WHERE o.order_id IN (
        SELECT oi.order_id
        FROM order_items oi
        WHERE oi.quantity >= 2
    )
    GROUP BY o.customer_id
) ds
WHERE ds.total_spent > (
    SELECT AVG(o2.total_amount)
    FROM orders o2
)
ORDER BY ds.total_spent DESC;
