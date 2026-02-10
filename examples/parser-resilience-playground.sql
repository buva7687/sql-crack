-- ============================================================
-- Parser Resilience Playground
-- ============================================================
-- Goal: Exercise batch splitting/fallback/limits-related behavior.
--
-- Includes:
--   - comments with unmatched parentheses (previous splitter edge case)
--   - valid and invalid statements in one file
--   - procedural blocks with internal semicolons
-- ============================================================

-- Comment edge case: unmatched close paren should not break statement splitting )
-- Another one: text with open paren (

-- Q1: Valid baseline query
SELECT
    o.order_id,
    o.customer_id,
    o.total_amount
FROM orders o
WHERE o.total_amount > 100;

-- Q2: Vendor-ish syntax in generic dialects (can trigger fallback + hints)
SELECT
    payload:customer.id AS customer_id,
    payload:order.total AS total
FROM raw_events;

-- Q3: Intentional syntax issue to keep mixed success/failure batch behavior visible
SELECT FROM broken_table WHERE;

-- Q4: MySQL-style procedure block with internal semicolons
DELIMITER $$
CREATE PROCEDURE summarize_orders()
BEGIN
    INSERT INTO order_summary (customer_id, order_count)
    SELECT customer_id, COUNT(*)
    FROM orders
    GROUP BY customer_id;

    UPDATE order_summary
    SET refreshed_at = CURRENT_TIMESTAMP;
END$$
DELIMITER ;

-- Q5: Statement after procedural block (should still split and parse independently)
SELECT
    customer_id,
    COUNT(*) AS order_count
FROM orders
GROUP BY customer_id
ORDER BY order_count DESC;
