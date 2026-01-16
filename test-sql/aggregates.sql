-- Test 2: Aggregates and Transformations
-- Tests: Aggregate functions, scalar functions, GROUP BY, HAVING

SELECT
    customer_id,
    COUNT(*) as order_count,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    MIN(amount) as min_amount,
    MAX(amount) as max_amount,
    UPPER(name) as customer_name_upper,
    LOWER(email) as email_lower,
    CONCAT(first_name, ' ', last_name) as full_name
FROM orders
GROUP BY customer_id, name, email, first_name, last_name
HAVING SUM(amount) > 1000
ORDER BY total_amount DESC;
