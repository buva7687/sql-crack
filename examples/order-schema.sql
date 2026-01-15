-- ============================================================
-- Order Domain Schema
-- ============================================================
-- This file defines order-related tables and views
-- Referenced by: demo-showcase.sql, customer-analytics.sql
-- Dialect: PostgreSQL / Snowflake

-- Orders table (transaction header)
CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    order_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
    total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount >= 0),
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    shipping_amount DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    payment_method VARCHAR(50),
    payment_status VARCHAR(30) DEFAULT 'unpaid',
    shipping_address TEXT,
    billing_address TEXT,
    tracking_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order line items
CREATE TABLE order_items (
    item_id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(product_id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    total_price DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price * (1 - discount_percent / 100)) STORED,
    shipped_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order status history (audit trail)
CREATE TABLE order_status_history (
    history_id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(order_id),
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    changed_by VARCHAR(100),
    change_reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order returns and refunds
CREATE TABLE order_returns (
    return_id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(order_id),
    customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
    return_date DATE NOT NULL,
    return_reason VARCHAR(255),
    refund_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(30) DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'processed', 'refunded', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily sales summary (aggregated table for performance)
CREATE TABLE daily_sales_summary (
    summary_id INTEGER PRIMARY KEY,
    report_date DATE UNIQUE NOT NULL,
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
    unique_customers INTEGER NOT NULL DEFAULT 0,
    avg_order_value DECIMAL(10, 2),
    top_selling_category VARCHAR(100),
    total_items_sold INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order analytics view (complex query for dashboards)
CREATE VIEW order_analytics AS
SELECT 
    o.order_id,
    o.customer_id,
    o.order_date,
    o.status AS order_status,
    o.total_amount,
    COUNT(DISTINCT oi.item_id) AS item_count,
    SUM(oi.quantity) AS total_quantity,
    COUNT(DISTINCT oi.product_id) AS unique_products,
    -- Customer info
    c.region AS customer_region,
    c.tier AS customer_tier,
    -- Time-based analysis
    DATE_TRUNC('month', o.order_date) AS month,
    DATE_TRUNC('quarter', o.order_date) AS quarter,
    EXTRACT(YEAR FROM o.order_date) AS year,
    EXTRACT(MONTH FROM o.order_date) AS month_num,
    -- Product category analysis
    (SELECT STRING_AGG(DISTINCT p.category, ', ')
     FROM order_items oi2
     JOIN products p ON oi2.product_id = p.product_id
     WHERE oi2.order_id = o.order_id) AS categories_purchased
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN order_items oi ON o.order_id = oi.order_id
WHERE o.status IN ('completed', 'delivered', 'shipped')
GROUP BY o.order_id, o.customer_id, o.order_date, o.status, o.total_amount, c.region, c.tier;

-- Regional performance summary
CREATE VIEW regional_performance AS
SELECT 
    c.region,
    COUNT(DISTINCT o.order_id) AS total_orders,
    SUM(o.total_amount) AS total_revenue,
    AVG(o.total_amount) AS avg_order_value,
    COUNT(DISTINCT c.customer_id) AS total_customers,
    COUNT(DISTINCT CASE WHEN o.order_date >= CURRENT_DATE - INTERVAL '30 days' THEN c.customer_id END) AS active_customers_30d,
    MAX(o.order_date) AS last_order_date
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE c.status = 'active'
GROUP BY c.region;
