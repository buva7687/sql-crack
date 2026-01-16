-- Test 3: CTEs and Subqueries
-- Tests: Common table expressions, subqueries, alias resolution

WITH customer_orders AS (
    SELECT
        customer_id,
        COUNT(*) as order_count,
        SUM(amount) as total_spent
    FROM orders
    WHERE status = 'completed'
    GROUP BY customer_id
),
high_value_customers AS (
    SELECT
        c.customer_id,
        c.name,
        c.email,
        co.order_count,
        co.total_spent
    FROM customers c
    JOIN customer_orders co ON c.customer_id = co.customer_id
    WHERE co.total_spent > 5000
)
SELECT
    hvc.customer_id,
    hvc.name,
    hvc.email,
    hvc.order_count,
    hvc.total_spent,
    (SELECT COUNT(*) FROM orders WHERE customer_id = hvc.customer_id AND created_at > '2024-01-01') as recent_orders
FROM high_value_customers hvc
ORDER BY hvc.total_spent DESC;
