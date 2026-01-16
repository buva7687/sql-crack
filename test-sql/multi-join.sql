-- Test 7: Multiple JOINs with Complex Conditions
-- Tests: Multiple tables, JOIN conditions, column disambiguation

SELECT
    c.customer_id,
    c.name as customer_name,
    c.email,
    o.order_id,
    o.order_date,
    oi.product_id,
    p.product_name,
    oi.quantity,
    oi.unit_price,
    oi.quantity * oi.unit_price as line_total
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
JOIN order_items oi ON o.order_id = oi.order_id
JOIN products p ON oi.product_id = p.product_id
WHERE o.status = 'completed'
  AND oi.quantity > 0
  AND o.created_at >= '2024-01-01'
ORDER BY o.order_date DESC, c.name, p.product_name;
