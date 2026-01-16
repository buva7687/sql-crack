-- ============================================================
-- E-Commerce Database Schema
-- ============================================================
-- Consolidated schema for SQL Crack demo and testing
-- This file defines all tables and views for the e-commerce domain
--
-- Domains covered:
--   - Customers: Customer master data, feedback, support
--   - Products: Product catalog, inventory, suppliers, reviews
--   - Orders: Transactions, line items, returns, status history
--
-- Dialect: PostgreSQL / Snowflake (compatible with most SQL dialects)
-- ============================================================

-- ============================================================
-- CUSTOMER DOMAIN
-- ============================================================

-- Customers table (master data)
CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    customer_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    region VARCHAR(50) NOT NULL,
    country VARCHAR(100) DEFAULT 'USA',
    registration_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    tier VARCHAR(20) DEFAULT 'Basic' CHECK (tier IN ('Basic', 'Silver', 'Gold', 'Platinum')),
    last_login_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer segments view (for analytics dashboards)
CREATE VIEW customer_segments AS
SELECT
    customer_id,
    customer_name,
    tier,
    region,
    registration_date,
    status,
    CASE
        WHEN tier = 'Platinum' THEN 'Premium Tier'
        WHEN tier IN ('Gold', 'Silver') THEN 'Standard Tier'
        ELSE 'Basic Tier'
    END AS tier_category,
    CASE
        WHEN registration_date >= CURRENT_DATE - INTERVAL '30 days' THEN 'New'
        WHEN registration_date >= CURRENT_DATE - INTERVAL '90 days' THEN 'Recent'
        ELSE 'Established'
    END AS customer_age_segment
FROM customers
WHERE status = 'active';

-- Customer feedback table
CREATE TABLE customer_feedback (
    feedback_id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    category VARCHAR(50),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer support interactions
CREATE TABLE customer_support (
    interaction_id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
    issue_type VARCHAR(100),
    priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(30) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- ============================================================
-- PRODUCT DOMAIN
-- ============================================================

-- Products master table
CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    brand VARCHAR(100),
    price DECIMAL(10, 2) NOT NULL CHECK (price > 0),
    cost DECIMAL(10, 2) CHECK (cost >= 0),
    margin_percent DECIMAL(5, 2) GENERATED ALWAYS AS ((price - cost) / price * 100) STORED,
    weight_kg DECIMAL(8, 2),
    active BOOLEAN DEFAULT TRUE,
    launch_date DATE,
    discontinued_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product inventory table
CREATE TABLE inventory (
    inventory_id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(product_id),
    warehouse_id INTEGER NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    reorder_level INTEGER DEFAULT 10 CHECK (reorder_level >= 0),
    reorder_quantity INTEGER DEFAULT 100,
    last_restock_date DATE,
    last_stock_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, warehouse_id)
);

-- Product reviews
CREATE TABLE reviews (
    review_id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(product_id),
    customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(255),
    comment TEXT,
    verified_purchase BOOLEAN DEFAULT FALSE,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Supplier information
CREATE TABLE suppliers (
    supplier_id INTEGER PRIMARY KEY,
    supplier_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(200),
    email VARCHAR(255),
    phone VARCHAR(50),
    region VARCHAR(50),
    country VARCHAR(100) DEFAULT 'USA',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product supplier relationships (many-to-many)
CREATE TABLE product_suppliers (
    product_id INTEGER NOT NULL REFERENCES products(product_id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(supplier_id),
    is_primary_supplier BOOLEAN DEFAULT FALSE,
    lead_time_days INTEGER DEFAULT 7,
    min_order_quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10, 2),
    PRIMARY KEY (product_id, supplier_id)
);

-- Product categories view (hierarchical with recursive CTE)
CREATE VIEW product_categories AS
WITH RECURSIVE category_tree AS (
    -- Base case: top-level categories
    SELECT
        category,
        subcategory,
        1 AS level,
        category AS path
    FROM products
    WHERE subcategory IS NULL

    UNION ALL

    -- Recursive case: subcategories
    SELECT
        p.category,
        p.subcategory,
        ct.level + 1,
        ct.path || ' > ' || p.subcategory
    FROM products p
    JOIN category_tree ct ON p.category = ct.category
    WHERE p.subcategory IS NOT NULL
)
SELECT DISTINCT
    category,
    subcategory,
    level,
    path AS category_path
FROM category_tree
ORDER BY level, category, subcategory;

-- ============================================================
-- ORDER DOMAIN
-- ============================================================

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

-- ============================================================
-- ANALYTICS VIEWS
-- ============================================================

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
    c.region AS customer_region,
    c.tier AS customer_tier,
    DATE_TRUNC('month', o.order_date) AS month,
    DATE_TRUNC('quarter', o.order_date) AS quarter,
    EXTRACT(YEAR FROM o.order_date) AS year,
    EXTRACT(MONTH FROM o.order_date) AS month_num
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
