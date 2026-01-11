WITH 
-- CTE 1: Calculate customer lifetime value and tier classification
customer_lifetime_stats AS (
    SELECT 
        c.customer_id,
        c.customer_name,
        c.region,
        c.sign_up_date,
        SUM(o.total_amount) AS total_lifetime_revenue,
        COUNT(o.order_id) AS total_order_count,
        AVG(o.total_amount) AS avg_order_value,
        -- Window function to rank customers by revenue within their region
        RANK() OVER (PARTITION BY c.region ORDER BY SUM(o.total_amount) DESC) as regional_rank
    FROM 
        dim_customers c
    INNER JOIN 
        fact_orders o ON c.customer_id = o.customer_id
    WHERE 
        o.order_status NOT IN ('CANCELLED', 'REFUNDED')
        AND o.order_date >= '2023-01-01'
    GROUP BY 
        c.customer_id, c.customer_name, c.region, c.sign_up_date
),

-- CTE 2: Analyze inventory levels and supplier lead times
inventory_supply_chain AS (
    SELECT 
        p.product_id,
        p.product_name,
        p.category,
        s.supplier_name,
        i.warehouse_id,
        i.stock_on_hand,
        i.reorder_level,
        i.lead_time_days,
        -- Create a complex flag logic based on stock levels
        CASE 
            WHEN i.stock_on_hand <= 0 THEN 'CRITICAL'
            WHEN i.stock_on_hand < i.reorder_level THEN 'LOW'
            WHEN i.stock_on_hand > (i.reorder_level * 3) THEN 'OVERSTOCK'
            ELSE 'OPTIMAL'
        END AS inventory_status
    FROM 
        dim_products p
    LEFT JOIN 
        fact_inventory i ON p.product_id = i.product_id
    LEFT JOIN 
        dim_suppliers s ON p.primary_supplier_id = s.supplier_id
),

-- CTE 3: Logistics and shipment efficiency metrics
logistics_performance AS (
    SELECT 
        sh.shipment_id,
        sh.order_id,
        sh.route_id,
        r.origin_hub,
        r.destination_hub,
        v.vehicle_type,
        e.employee_name AS driver_name,
        sh.shipment_date,
        sh.actual_delivery_date,
        sh.scheduled_delivery_date,
        -- Calculate delay in days
        DATEDIFF(day, sh.actual_delivery_date, sh.scheduled_delivery_date) AS delay_days,
        -- Window function to get the average delay for this route
        AVG(DATEDIFF(day, sh.actual_delivery_date, sh.scheduled_delivery_date)) OVER (PARTITION BY r.route_id) AS avg_route_delay
    FROM 
        fact_shipments sh
    INNER JOIN 
        dim_routes r ON sh.route_id = r.route_id
    LEFT JOIN 
        fleet_vehicles v ON sh.vehicle_id = v.vehicle_id
    LEFT JOIN 
        dim_employees e ON sh.driver_id = e.employee_id
)

-- MAIN QUERY: Joining CTEs and remaining tables to generate the final report
SELECT 
    -- Customer Dimensions
    cls.customer_id,
    cls.customer_name,
    cls.region,
    
    -- Order Dimensions
    o.order_id,
    o.order_date,
    o.order_status,
    
    -- Product Dimensions
    p.product_name,
    p.category,
    
    -- Financials & Currency
    CONVERT(DECIMAL(10, 2), oli.unit_price * oli.quantity) AS line_item_total,
    curr.currency_code,
    curr.exchange_rate_to_usd,
    
    -- Inventory Logic
    isc.inventory_status,
    isc.supplier_name,
    CASE 
        WHEN isc.stock_on_hand < 5 THEN 1 
        ELSE 0 
    END AS is_critical_stock_flag,
    
    -- Logistics Metrics
    lp.vehicle_type,
    lp.driver_name,
    lp.delay_days,
    
    -- Calculated Metrics for Reporting
    cls.total_lifetime_revenue,
    cls.regional_rank,
    
    -- Subquery in SELECT to get max payment method used by this customer
    (SELECT TOP 1 pm.payment_method_name
     FROM fact_payments fp
     INNER JOIN dim_payment_methods pm ON fp.payment_method_id = pm.payment_method_id
     WHERE fp.order_id = o.order_id
     ORDER BY fp.payment_amount DESC) AS primary_payment_method,

    -- Window function result calculated on the fly
    COUNT(*) OVER (
            PARTITION BY cls.region
            ORDER BY o.order_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_monthly_orders

FROM 
    customer_lifetime_stats cls
INNER JOIN 
    fact_orders o ON cls.customer_id = o.customer_id
INNER JOIN 
    fact_order_line_items oli ON o.order_id = oli.order_id
INNER JOIN 
    dim_products p ON oli.product_id = p.product_id
LEFT JOIN 
    inventory_supply_chain isc ON p.product_id = isc.product_id
LEFT JOIN 
    logistics_performance lp ON o.order_id = lp.order_id
LEFT JOIN 
    view_regional_targets rt ON cls.region = rt.region
LEFT JOIN 
    dim_currencies curr ON o.currency_id = curr.currency_id
FULL OUTER JOIN 
    dim_marketing_channels mc ON o.marketing_channel_id = mc.channel_id

WHERE 
    o.order_date >= DATEADD(year, -1, GETDATE())
    AND cls.region IN ('NORTH_AMERICA', 'EMEA', 'APAC')

GROUP BY 
    cls.customer_id, cls.customer_name, cls.region, o.order_id, o.order_date, 
    o.order_status, p.product_name, p.category, oli.unit_price, oli.quantity,
    curr.currency_code, curr.exchange_rate, isc.inventory_status, isc.supplier_name,
    isc.stock_on_hand, lp.vehicle_type, lp.driver_name, lp.delay_days, 
    cls.total_lifetime_revenue, cls.regional_rank, mc.channel_name

HAVING 
    SUM(oli.quantity) > 0
    OR cls.total_lifetime_revenue > 5000

ORDER BY 
    cls.total_lifetime_revenue DESC,
    o.order_date ASC,
    lp.delay_days DESC;