-- ============================================================
-- Product Domain Schema
-- ============================================================
-- This file defines product-related tables and views
-- Referenced by: demo-showcase.sql, order-analytics.sql
-- Dialect: PostgreSQL / Snowflake

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

-- Product categories view (hierarchical)
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

-- Product supplier relationships
CREATE TABLE product_suppliers (
    product_id INTEGER NOT NULL REFERENCES products(product_id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(supplier_id),
    is_primary_supplier BOOLEAN DEFAULT FALSE,
    lead_time_days INTEGER DEFAULT 7,
    min_order_quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10, 2),
    PRIMARY KEY (product_id, supplier_id)
);
