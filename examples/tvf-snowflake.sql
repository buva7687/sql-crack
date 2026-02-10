-- ============================================================
-- Table-Valued Functions (TVF) - Snowflake
-- ============================================================
-- Dialect: Snowflake
-- Focus: FLATTEN() in LATERAL and TABLE(...) forms
--
-- Use this file to validate:
--   1) FLATTEN appears as a table-function source node
--   2) FLATTEN alias handling
--   3) TABLE(FLATTEN(...)) wrapper detection
-- ============================================================

-- Q1: LATERAL FLATTEN over VARIANT array
WITH src AS (
    SELECT PARSE_JSON('{"order_id":101,"items":[{"sku":"sku-1","qty":2},{"sku":"sku-2","qty":1}]}') AS payload
)
SELECT
    f.value:sku::string AS sku,
    f.value:qty::number AS qty
FROM src, LATERAL FLATTEN(input => src.payload:items) f;

-- Q2: TABLE(FLATTEN(...)) wrapper form
WITH src AS (
    SELECT PARSE_JSON('{"items":[{"sku":"sku-1"},{"sku":"sku-2"},{"sku":"sku-3"}]}') AS payload
)
SELECT
    f.index AS item_index,
    f.value:sku::string AS sku
FROM src, TABLE(FLATTEN(input => src.payload:items)) f
ORDER BY item_index;

-- Q3: Join base table with FLATTEN output
WITH orders AS (
    SELECT 101 AS order_id, PARSE_JSON('["priority","gift"]') AS tags
    UNION ALL
    SELECT 102 AS order_id, PARSE_JSON('["standard"]') AS tags
)
SELECT
    o.order_id,
    t.value::string AS tag
FROM orders o, LATERAL FLATTEN(input => o.tags) t
ORDER BY o.order_id, tag;
