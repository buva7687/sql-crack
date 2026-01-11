WITH base_users AS (
    SELECT
        u.user_id,
        u.username,
        u.created_at,
        u.status,
        p.profile_id,
        p.country_code,
        p.timezone
    FROM users u
    INNER JOIN user_profiles p
        ON u.user_id = p.user_id
    WHERE u.deleted_at IS NULL
),
orders_enriched AS (
    SELECT
        o.order_id,
        o.user_id,
        o.order_date,
        o.total_amount,
        o.currency,
        pm.method_name AS payment_method,
        ROW_NUMBER() OVER (
            PARTITION BY o.user_id
            ORDER BY o.order_date DESC
        ) AS order_rank
    FROM orders o
    LEFT JOIN payments pay
        ON o.order_id = pay.order_id
    LEFT JOIN payment_methods pm
        ON pay.payment_method_id = pm.payment_method_id
),
product_metrics AS (
    SELECT
        oi.order_id,
        pr.product_id,
        pr.category_id,
        SUM(oi.quantity) AS total_quantity,
        SUM(oi.quantity * oi.unit_price) AS revenue
    FROM order_items oi
    INNER JOIN products pr
        ON oi.product_id = pr.product_id
    GROUP BY
        oi.order_id,
        pr.product_id,
        pr.category_id
),
category_rollup AS (
    SELECT
        c.category_id,
        c.category_name,
        COUNT(DISTINCT pr.product_id) AS product_count
    FROM categories c
    LEFT JOIN products pr
        ON c.category_id = pr.category_id
    GROUP BY
        c.category_id,
        c.category_name
),
user_activity AS (
    SELECT
        ua.user_id,
        MAX(ua.last_login_at) AS last_login_at,
        COUNT(*) FILTER (WHERE ua.activity_type = 'LOGIN') AS login_count,
        COUNT(*) FILTER (WHERE ua.activity_type = 'PURCHASE') AS purchase_count
    FROM user_activity_logs ua
    GROUP BY ua.user_id
),
geo_enrichment AS (
    SELECT
        g.country_code,
        g.region,
        g.sub_region,
        g.population
    FROM geo_countries g
),
support_stats AS (
    SELECT
        t.user_id,
        COUNT(*) AS ticket_count,
        AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at))) AS avg_resolution_seconds
    FROM support_tickets t
    WHERE t.status = 'CLOSED'
    GROUP BY t.user_id
),
fraud_flags AS (
    SELECT DISTINCT
        f.entity_id AS user_id,
        TRUE AS is_flagged
    FROM fraud_events f
    WHERE f.entity_type = 'USER'
),
json_preferences AS (
    SELECT
        up.user_id,
        up.preferences ->> 'language' AS preferred_language,
        (up.preferences ->> 'marketing_opt_in')::BOOLEAN AS marketing_opt_in
    FROM user_preferences up
),
final_dataset AS (
    SELECT
        bu.user_id,
        bu.username,
        bu.status,
        bu.created_at,
        oe.order_id,
        oe.order_date,
        oe.total_amount,
        oe.currency,
        oe.payment_method,
        pmx.total_quantity,
        pmx.revenue,
        cr.category_name,
        ua.last_login_at,
        ua.login_count,
        ua.purchase_count,
        ss.ticket_count,
        ss.avg_resolution_seconds,
        jp.preferred_language,
        jp.marketing_opt_in,
        ge.region,
        ge.sub_region,
        COALESCE(ff.is_flagged, FALSE) AS fraud_flag,
        CASE
            WHEN oe.total_amount > 1000 THEN 'HIGH_VALUE'
            WHEN oe.total_amount BETWEEN 500 AND 1000 THEN 'MEDIUM_VALUE'
            ELSE 'LOW_VALUE'
        END AS order_value_segment
    FROM base_users bu
    LEFT JOIN orders_enriched oe
        ON bu.user_id = oe.user_id
       AND oe.order_rank <= 5
    LEFT JOIN product_metrics pmx
        ON oe.order_id = pmx.order_id
    LEFT JOIN category_rollup cr
        ON pmx.category_id = cr.category_id
    LEFT JOIN user_activity ua
        ON bu.user_id = ua.user_id
    LEFT JOIN support_stats ss
        ON bu.user_id = ss.user_id
    LEFT JOIN fraud_flags ff
        ON bu.user_id = ff.user_id
    LEFT JOIN json_preferences jp
        ON bu.user_id = jp.user_id
    LEFT JOIN geo_enrichment ge
        ON bu.country_code = ge.country_code
)
SELECT
    fd.*,
    DENSE_RANK() OVER (
        PARTITION BY fd.region
        ORDER BY fd.total_amount DESC NULLS LAST
    ) AS regional_spend_rank
FROM final_dataset fd
WHERE EXISTS (
    SELECT 1
    FROM audit_logs al
    WHERE al.entity_id = fd.user_id
      AND al.entity_type = 'USER'
)
AND NOT EXISTS (
    SELECT 1
    FROM blacklist bl
    WHERE bl.user_id = fd.user_id
)
ORDER BY
    fd.region,
    fd.total_amount DESC,
    fd.created_at DESC;
