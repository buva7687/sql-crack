-- Test 6: Window Functions
-- Tests: ROW_NUMBER, RANK, PARTITION BY, window frames

SELECT
    customer_id,
    order_id,
    amount,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) as order_rank,
    RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) as amount_rank,
    DENSE_RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) as dense_rank,
    SUM(amount) OVER (PARTITION BY customer_id ORDER BY created_at) as running_total,
    AVG(amount) OVER (PARTITION BY customer_id) as avg_order_value,
    FIRST_VALUE(amount) OVER (PARTITION BY customer_id ORDER BY created_at) as first_order,
    LAG(amount) OVER (PARTITION BY customer_id ORDER BY created_at) as prev_amount,
    LEAD(amount) OVER (PARTITION BY customer_id ORDER BY created_at) as next_amount
FROM orders
WHERE status = 'completed'
ORDER BY customer_id, created_at;
