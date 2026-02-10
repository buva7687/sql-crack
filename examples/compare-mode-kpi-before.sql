-- ============================================================
-- Compare Mode (KPI Before)
-- ============================================================
-- Goal: Baseline version with repeated scalar subqueries and nested lookups.
-- Steps:
--   1) Visualize this file and click 📌 Pin.
--   2) Open compare-mode-kpi-after.sql and visualize.
--   3) Click ⇆ Compare to inspect shape and complexity changes.
-- ============================================================

SELECT
    w.warehouse_id,
    w.region,
    -- Correlated scalar subqueries (baseline)
    (SELECT COUNT(*)
     FROM shipments s1
     WHERE s1.warehouse_id = w.warehouse_id
       AND s1.ship_date >= CURRENT_DATE - INTERVAL 30 DAY) AS shipment_count_30d,
    (SELECT SUM(s2.shipping_cost)
     FROM shipments s2
     WHERE s2.warehouse_id = w.warehouse_id
       AND s2.ship_date >= CURRENT_DATE - INTERVAL 30 DAY) AS shipping_cost_30d,
    (SELECT AVG(DATEDIFF(s3.delivered_date, s3.ship_date))
     FROM shipments s3
     WHERE s3.warehouse_id = w.warehouse_id
       AND s3.ship_date >= CURRENT_DATE - INTERVAL 30 DAY) AS avg_delivery_days_30d,
    (SELECT COUNT(*)
     FROM returns r
     WHERE r.warehouse_id = w.warehouse_id
       AND r.return_date >= CURRENT_DATE - INTERVAL 30 DAY) AS return_count_30d,
    (SELECT SUM(r2.refund_amount)
     FROM returns r2
     WHERE r2.warehouse_id = w.warehouse_id
       AND r2.return_date >= CURRENT_DATE - INTERVAL 30 DAY) AS refund_amount_30d,
    (SELECT c.carrier_name
     FROM carriers c
     WHERE c.carrier_id = (
         SELECT s4.carrier_id
         FROM shipments s4
         WHERE s4.warehouse_id = w.warehouse_id
         ORDER BY s4.ship_date DESC
         LIMIT 1
     )) AS latest_carrier
FROM warehouses w
WHERE w.active = 1
ORDER BY shipping_cost_30d DESC, shipment_count_30d DESC;
