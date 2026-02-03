-- Performance Benchmark: Small Query
-- Expected: ~10-15 nodes
-- Tests basic SELECT with JOINs

SELECT
    u.id,
    u.name,
    u.email,
    o.order_id,
    o.total_amount,
    o.order_date,
    p.product_name,
    p.price
FROM users u
INNER JOIN orders o ON u.id = o.user_id
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.status = 'completed'
  AND o.order_date >= '2024-01-01'
ORDER BY o.order_date DESC
LIMIT 100;
