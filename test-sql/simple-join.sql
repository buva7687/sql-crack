-- Test 1: Simple SELECT with JOINs
-- Tests: Column extraction, alias resolution, JOIN columns

SELECT
    c.customer_id,
    c.name,
    c.email,
    o.order_id,
    o.amount,
    o.order_date
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'completed'
ORDER BY o.order_date DESC;
