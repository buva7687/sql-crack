-- ============================================================
-- REFACTOR CHARACTERISATION TEST FIXTURES
-- 20 diverse SQL queries for characterisation testing
-- These queries cover all major parsing scenarios
-- DO NOT MODIFY - tests depend on exact structure
-- ============================================================

-- ============================================================
-- QUERY 1: Simple SELECT (baseline)
-- Expected: 1 table node, 1 select node, 1 edge
-- ============================================================
SELECT id, name, email FROM users;

-- ============================================================
-- QUERY 2: SELECT with WHERE clause
-- Expected: 1 table node, 1 select node, filter hint
-- ============================================================
SELECT * FROM orders WHERE status = 'pending';

-- ============================================================
-- QUERY 3: Simple JOIN
-- Expected: 2 table nodes, 1 join node, 1 select node, 3 edges
-- ============================================================
SELECT u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id;

-- ============================================================
-- QUERY 4: Multiple JOINs
-- Expected: 3 table nodes, 2 join nodes, 1 select node
-- ============================================================
SELECT u.name, o.total, p.product_name
FROM users u
JOIN orders o ON u.id = o.user_id
JOIN products p ON o.product_id = p.id;

-- ============================================================
-- QUERY 5: LEFT JOIN
-- Expected: 2 table nodes, LEFT JOIN edge type
-- ============================================================
SELECT u.name, o.total
FROM users u
LEFT JOIN orders o ON u.id = o.user_id;

-- ============================================================
-- QUERY 6: CTE (Common Table Expression)
-- Expected: 1 CTE node, 1 select node, CTE reference edge
-- ============================================================
WITH active_users AS (
    SELECT * FROM users WHERE status = 'active'
)
SELECT * FROM active_users;

-- ============================================================
-- QUERY 7: Multiple CTEs
-- Expected: 2 CTE nodes, 1 select node
-- ============================================================
WITH 
    active_users AS (SELECT * FROM users WHERE status = 'active'),
    recent_orders AS (SELECT * FROM orders WHERE created_at > '2024-01-01')
SELECT u.name, o.total
FROM active_users u
JOIN recent_orders o ON u.id = o.user_id;

-- ============================================================
-- QUERY 8: Nested CTE
-- Expected: CTE with child subgraph
-- ============================================================
WITH customer_orders AS (
    SELECT user_id, COUNT(*) as order_count
    FROM orders
    GROUP BY user_id
),
top_customers AS (
    SELECT user_id FROM customer_orders WHERE order_count > 10
)
SELECT u.name FROM users u
JOIN top_customers t ON u.id = t.user_id;

-- ============================================================
-- QUERY 9: Subquery in FROM
-- Expected: Subquery node with children
-- ============================================================
SELECT sub.name, sub.total
FROM (
    SELECT u.name, SUM(o.total) as total
    FROM users u
    JOIN orders o ON u.id = o.user_id
    GROUP BY u.name
) sub;

-- ============================================================
-- QUERY 10: Subquery in WHERE (correlated)
-- Expected: Table nodes, EXISTS or IN subquery edge
-- ============================================================
SELECT * FROM users u
WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.user_id = u.id
);

-- ============================================================
-- QUERY 11: INSERT with SELECT
-- Expected: INSERT target, SELECT source, write edge
-- ============================================================
INSERT INTO archived_orders (order_id, total)
SELECT id, total FROM orders WHERE created_at < '2023-01-01';

-- ============================================================
-- QUERY 12: Simple UPDATE
-- Expected: UPDATE target node, write marker
-- ============================================================
UPDATE users SET status = 'inactive' WHERE last_login < '2023-01-01';

-- ============================================================
-- QUERY 13: UPDATE with FROM (SQL Server style)
-- Expected: UPDATE target, FROM source
-- ============================================================
UPDATE o
SET o.status = 'processed'
FROM orders o
JOIN order_items i ON o.id = i.order_id
WHERE i.status = 'ready';

-- ============================================================
-- QUERY 14: DELETE with subquery
-- Expected: DELETE target, subquery source
-- ============================================================
DELETE FROM orders
WHERE user_id IN (SELECT id FROM users WHERE status = 'deleted');

-- ============================================================
-- QUERY 15: MERGE statement (upsert)
-- Expected: MERGE target, MERGE source, merge edges
-- ============================================================
MERGE INTO products target
USING new_products source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET target.price = source.price
WHEN NOT MATCHED THEN INSERT (id, name, price) VALUES (source.id, source.name, source.price);

-- ============================================================
-- QUERY 16: UNION
-- Expected: 2 select branches, UNION node
-- ============================================================
SELECT name FROM users
UNION
SELECT name FROM customers;

-- ============================================================
-- QUERY 17: Aggregate functions
-- Expected: Aggregate hints, GROUP BY detection
-- ============================================================
SELECT 
    user_id,
    COUNT(*) as order_count,
    SUM(total) as total_spent,
    AVG(total) as avg_order
FROM orders
GROUP BY user_id
HAVING COUNT(*) > 5;

-- ============================================================
-- QUERY 18: Window functions
-- Expected: Window function detection in hints
-- ============================================================
SELECT 
    name,
    total,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn,
    SUM(total) OVER (PARTITION BY user_id) as user_total
FROM orders;

-- ============================================================
-- QUERY 19: CREATE TABLE (DDL)
-- Expected: CREATE node, no data flow
-- ============================================================
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- QUERY 20: Complex real-world query
-- Expected: Multiple CTEs, JOINs, aggregates, subqueries
-- ============================================================
WITH monthly_sales AS (
    SELECT 
        DATE_TRUNC('month', created_at) as month,
        product_id,
        SUM(total) as revenue
    FROM orders
    WHERE created_at >= '2024-01-01'
    GROUP BY DATE_TRUNC('month', created_at), product_id
),
product_rankings AS (
    SELECT 
        month,
        product_id,
        revenue,
        RANK() OVER (PARTITION BY month ORDER BY revenue DESC) as rank
    FROM monthly_sales
),
top_products AS (
    SELECT product_id, SUM(revenue) as total_revenue
    FROM product_rankings
    WHERE rank <= 10
    GROUP BY product_id
)
SELECT 
    p.name,
    tp.total_revenue,
    (SELECT COUNT(*) FROM order_items WHERE product_id = p.id) as order_count
FROM products p
JOIN top_products tp ON p.id = tp.product_id
ORDER BY tp.total_revenue DESC;
