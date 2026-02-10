-- ============================================================
-- Compare Mode (KPI After)
-- ============================================================
-- Goal: Optimized version of compare-mode-kpi-before.sql.
-- Uses reusable CTEs and joins instead of repeated correlated subqueries.
-- ============================================================

WITH shipment_window AS (
    SELECT
        s.warehouse_id,
        s.carrier_id,
        s.ship_date,
        s.delivered_date,
        s.shipping_cost
    FROM shipments s
    WHERE s.ship_date >= CURRENT_DATE - INTERVAL 30 DAY
),
shipment_kpis AS (
    SELECT
        sw.warehouse_id,
        COUNT(*) AS shipment_count_30d,
        SUM(sw.shipping_cost) AS shipping_cost_30d,
        AVG(DATEDIFF(sw.delivered_date, sw.ship_date)) AS avg_delivery_days_30d
    FROM shipment_window sw
    GROUP BY sw.warehouse_id
),
return_kpis AS (
    SELECT
        r.warehouse_id,
        COUNT(*) AS return_count_30d,
        SUM(r.refund_amount) AS refund_amount_30d
    FROM returns r
    WHERE r.return_date >= CURRENT_DATE - INTERVAL 30 DAY
    GROUP BY r.warehouse_id
),
latest_carrier AS (
    SELECT
        x.warehouse_id,
        x.carrier_id
    FROM shipment_window x
    INNER JOIN (
        SELECT warehouse_id, MAX(ship_date) AS latest_ship_date
        FROM shipment_window
        GROUP BY warehouse_id
    ) latest
      ON latest.warehouse_id = x.warehouse_id
     AND latest.latest_ship_date = x.ship_date
)
SELECT
    w.warehouse_id,
    w.region,
    COALESCE(sk.shipment_count_30d, 0) AS shipment_count_30d,
    COALESCE(sk.shipping_cost_30d, 0) AS shipping_cost_30d,
    sk.avg_delivery_days_30d,
    COALESCE(rk.return_count_30d, 0) AS return_count_30d,
    COALESCE(rk.refund_amount_30d, 0) AS refund_amount_30d,
    c.carrier_name AS latest_carrier
FROM warehouses w
LEFT JOIN shipment_kpis sk ON sk.warehouse_id = w.warehouse_id
LEFT JOIN return_kpis rk ON rk.warehouse_id = w.warehouse_id
LEFT JOIN latest_carrier lc ON lc.warehouse_id = w.warehouse_id
LEFT JOIN carriers c ON c.carrier_id = lc.carrier_id
WHERE w.active = 1
ORDER BY shipping_cost_30d DESC, shipment_count_30d DESC;
