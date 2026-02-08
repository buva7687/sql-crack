-- ============================================================
-- Table-Valued Functions (TVF) - BigQuery
-- ============================================================
-- Dialect: BigQuery
-- Focus: UNNEST() as source and join input
--
-- Use this file to validate:
--   1) UNNEST appears as a table-function source node
--   2) Alias handling on UNNEST sources
--   3) UNNEST in CROSS JOIN scenarios
-- ============================================================

-- Q1: Basic UNNEST source
SELECT num
FROM UNNEST([1, 2, 3, 5, 8]) AS num;

-- Q2: UNNEST over ARRAY<STRUCT>
WITH orders AS (
    SELECT
        101 AS order_id,
        [STRUCT('sku-1' AS sku, 2 AS qty), STRUCT('sku-2' AS sku, 1 AS qty)] AS items
    UNION ALL
    SELECT
        102 AS order_id,
        [STRUCT('sku-3' AS sku, 4 AS qty)] AS items
)
SELECT
    o.order_id,
    item.sku,
    item.qty
FROM orders o
CROSS JOIN UNNEST(o.items) AS item
ORDER BY o.order_id, item.sku;

-- Q3: UNNEST with position tracking
WITH events AS (
    SELECT 1 AS event_id, ['signup', 'verify_email', 'first_order'] AS steps
)
SELECT
    e.event_id,
    step_position,
    step_name
FROM events e
CROSS JOIN UNNEST(e.steps) AS step_name WITH OFFSET AS step_position
ORDER BY step_position;
