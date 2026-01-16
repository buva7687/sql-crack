-- Test 4: CASE Expressions
-- Tests: CASE WHEN, conditional logic

SELECT
    customer_id,
    amount,
    CASE
        WHEN amount < 100 THEN 'Low'
        WHEN amount < 1000 THEN 'Medium'
        WHEN amount < 5000 THEN 'High'
        ELSE 'Very High'
    END as amount_category,
    CASE
        WHEN status = 'completed' THEN 1
        WHEN status = 'pending' THEN 0
        ELSE -1
    END as status_code,
    CASE
        WHEN amount > 1000 THEN 'Priority'
        WHEN amount > 500 THEN 'Standard'
        ELSE 'Regular'
    END as customer_tier
FROM orders
WHERE created_at >= '2024-01-01';
