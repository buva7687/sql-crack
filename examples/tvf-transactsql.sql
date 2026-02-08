-- ============================================================
-- Table-Valued Functions (TVF) - SQL Server (TransactSQL)
-- ============================================================
-- Dialect: TransactSQL
-- Focus: OPENJSON() as source and CROSS APPLY input
--
-- Use this file to validate:
--   1) OPENJSON appears as a table-function source node
--   2) OPENJSON alias handling
--   3) Joined OPENJSON in CROSS APPLY scenarios
-- ============================================================

-- Q1: Basic OPENJSON source
DECLARE @payload NVARCHAR(MAX) = N'{"items":[{"sku":"sku-1","qty":2},{"sku":"sku-2","qty":1}]}';

SELECT
    j.[key] AS item_index,
    j.value
FROM OPENJSON(@payload, '$.items') AS j;

-- Q2: OPENJSON with JSON_VALUE projections
SELECT
    JSON_VALUE(item.value, '$.sku') AS sku,
    CAST(JSON_VALUE(item.value, '$.qty') AS INT) AS qty
FROM OPENJSON(@payload, '$.items') AS item;

-- Q3: CROSS APPLY OPENJSON against table rows
WITH orders AS (
    SELECT 101 AS order_id, N'["priority","gift"]' AS tags
    UNION ALL
    SELECT 102 AS order_id, N'["standard"]' AS tags
)
SELECT
    o.order_id,
    t.value AS tag
FROM orders o
CROSS APPLY OPENJSON(o.tags) AS t
ORDER BY o.order_id, t.[key];
