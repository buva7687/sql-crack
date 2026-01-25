-- ============================================================================
-- Enterprise E-Commerce Database Schema DDL
-- Compatible with MySQL 8.0+, PostgreSQL 12+, SQLite 3.35+
-- ============================================================================

-- ============================================================================
-- 1. CUSTOMER DIMENSION
-- ============================================================================

CREATE TABLE customers (
    customer_id BIGINT PRIMARY KEY,
    customer_number VARCHAR(50) UNIQUE NOT NULL,
    email_address VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(10),
    account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    registration_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_timestamp TIMESTAMP,
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    marketing_opt_in BOOLEAN DEFAULT FALSE,
    customer_segment VARCHAR(50),
    credit_score INT,
    account_balance DECIMAL(15, 2) DEFAULT 0.00,
    currency_code VARCHAR(3) DEFAULT 'USD',
    timezone VARCHAR(50),
    locale VARCHAR(10),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customer_email (email_address),
    INDEX idx_customer_status (account_status),
    INDEX idx_customer_segment (customer_segment),
    INDEX idx_customer_registration (registration_timestamp)
);

-- Customer addresses
CREATE TABLE customer_addresses (
    address_id BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    address_type VARCHAR(20) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    INDEX idx_address_customer (customer_id),
    INDEX idx_address_country (country_code)
);

-- Customer preferences
CREATE TABLE customer_preferences (
    preference_id BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    preference_key VARCHAR(100) NOT NULL,
    preference_value VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    UNIQUE KEY uk_customer_preference (customer_id, preference_key),
    INDEX idx_preference_customer (customer_id)
);

-- ============================================================================
-- 2. PRODUCT DIMENSION
-- ============================================================================

CREATE TABLE categories (
    category_id INT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    category_description TEXT,
    parent_category_id INT,
    category_level INT NOT NULL DEFAULT 0,
    category_path VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_category_id) REFERENCES categories(category_id),
    INDEX idx_category_parent (parent_category_id),
    INDEX idx_category_active (is_active)
);

CREATE TABLE brands (
    brand_id INT PRIMARY KEY,
    brand_name VARCHAR(100) NOT NULL UNIQUE,
    brand_description TEXT,
    logo_url VARCHAR(500),
    website_url VARCHAR(500),
    country_code VARCHAR(2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_brand_active (is_active)
);

CREATE TABLE products (
    product_id BIGINT PRIMARY KEY,
    product_sku VARCHAR(50) UNIQUE NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_description TEXT,
    category_id INT NOT NULL,
    brand_id INT,
    product_type VARCHAR(50) NOT NULL,
    base_price DECIMAL(12, 2) NOT NULL,
    cost_price DECIMAL(12, 2),
    currency_code VARCHAR(3) DEFAULT 'USD',
    weight_kg DECIMAL(10, 3),
    length_cm DECIMAL(10, 2),
    width_cm DECIMAL(10, 2),
    height_cm DECIMAL(10, 2),
    is_taxable BOOLEAN DEFAULT TRUE,
    tax_class VARCHAR(50),
    is_fragile BOOLEAN DEFAULT FALSE,
    is_digital BOOLEAN DEFAULT FALSE,
    download_url VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    inventory_tracking BOOLEAN DEFAULT TRUE,
    low_stock_threshold INT DEFAULT 10,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (brand_id) REFERENCES brands(brand_id),
    INDEX idx_product_sku (product_sku),
    INDEX idx_product_category (category_id),
    INDEX idx_product_brand (brand_id),
    INDEX idx_product_status (status),
    FULLTEXT INDEX idx_product_search (product_name, product_description)
);

-- Product attributes
CREATE TABLE product_attributes (
    attribute_id BIGINT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    attribute_name VARCHAR(100) NOT NULL,
    attribute_value VARCHAR(500) NOT NULL,
    attribute_type VARCHAR(20) DEFAULT 'TEXT',
    display_order INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
    INDEX idx_attr_product (product_id)
);

-- Product images
CREATE TABLE product_images (
    image_id BIGINT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    image_alt_text VARCHAR(255),
    image_type VARCHAR(20) DEFAULT 'MAIN',
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
    INDEX idx_image_product (product_id)
);

-- ============================================================================
-- 3. INVENTORY MANAGEMENT
-- ============================================================================

CREATE TABLE warehouses (
    warehouse_id INT PRIMARY KEY,
    warehouse_code VARCHAR(20) UNIQUE NOT NULL,
    warehouse_name VARCHAR(100) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    manager_name VARCHAR(100),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    warehouse_type VARCHAR(20) DEFAULT 'STANDARD',
    capacity cubic_meters DECIMAL(15, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_warehouse_active (is_active)
);

CREATE TABLE inventory (
    inventory_id BIGINT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    warehouse_id INT NOT NULL,
    quantity_on_hand INT NOT NULL DEFAULT 0,
    quantity_allocated INT NOT NULL DEFAULT 0,
    quantity_available INT GENERATED ALWAYS AS (quantity_on_hand - quantity_allocated) STORED,
    reorder_threshold INT DEFAULT 20,
    reorder_quantity INT DEFAULT 100,
    last_stock_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id),
    UNIQUE KEY uk_inventory_product_warehouse (product_id, warehouse_id),
    INDEX idx_inventory_product (product_id),
    INDEX idx_inventory_warehouse (warehouse_id),
    INDEX idx_inventory_low_stock (quantity_on_hand, reorder_threshold)
);

-- Inventory transactions
CREATE TABLE inventory_transactions (
    transaction_id BIGINT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    warehouse_id INT NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    quantity INT NOT NULL,
    reference_type VARCHAR(50),
    reference_id BIGINT,
    transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_by VARCHAR(100),
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id),
    INDEX idx_trans_product (product_id),
    INDEX idx_trans_warehouse (warehouse_id),
    INDEX idx_trans_date (transaction_date)
);

-- ============================================================================
-- 4. ORDER MANAGEMENT
-- ============================================================================

CREATE TABLE orders (
    order_id BIGINT PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id BIGINT NOT NULL,
    order_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    order_type VARCHAR(20) DEFAULT 'STANDARD',
    currency_code VARCHAR(3) DEFAULT 'USD',
    subtotal_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    shipping_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(20) DEFAULT 'UNPAID',
    payment_method VARCHAR(50),
    shipping_carrier VARCHAR(50),
    shipping_method VARCHAR(50),
    tracking_number VARCHAR(100),
    estimated_delivery_date DATE,
    actual_delivery_date DATE,
    customer_notes TEXT,
    internal_notes TEXT,
    source_channel VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    INDEX idx_order_customer (customer_id),
    INDEX idx_order_status (order_status),
    INDEX idx_order_payment (payment_status),
    INDEX idx_order_created (created_at),
    INDEX idx_order_number (order_number)
);

CREATE TABLE order_items (
    item_id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    product_sku VARCHAR(50) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    line_total DECIMAL(15, 2) GENERATED ALWAYS AS ((quantity * unit_price) + tax_amount - discount_amount) STORED,
    gift_wrap BOOLEAN DEFAULT FALSE,
    gift_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    INDEX idx_item_order (order_id),
    INDEX idx_item_product (product_id)
);

-- Order shipping address
CREATE TABLE order_shipping (
    shipping_id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    phone_number VARCHAR(20),
    delivery_instructions TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    UNIQUE KEY uk_shipping_order (order_id)
);

-- Order status history
CREATE TABLE order_status_history (
    history_id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    status_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by VARCHAR(100),
    notes TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    INDEX idx_status_history_order (order_id),
    INDEX idx_status_history_date (status_timestamp)
);

-- ============================================================================
-- 5. PAYMENT PROCESSING
-- ============================================================================

CREATE TABLE payment_methods (
    payment_method_id BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    method_type VARCHAR(20) NOT NULL,
    provider VARCHAR(50),
    last_four_digits VARCHAR(4),
    expiry_month INT,
    expiry_year INT,
    cardholder_name VARCHAR(100),
    is_default BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    INDEX idx_payment_customer (customer_id)
);

CREATE TABLE payments (
    payment_id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    payment_method_id BIGINT,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    payment_amount DECIMAL(15, 2) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    transaction_id VARCHAR(100) UNIQUE,
    gateway_response_code VARCHAR(20),
    gateway_response_message TEXT,
    payment_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(payment_method_id),
    INDEX idx_payment_order (order_id),
    INDEX idx_payment_status (payment_status),
    INDEX idx_payment_transaction (transaction_id)
);

-- ============================================================================
-- 6. RETURNS AND REFUNDS
-- ============================================================================

CREATE TABLE returns (
    return_id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    return_status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    return_reason VARCHAR(100),
    return_request_date DATE NOT NULL,
    approved_date DATE,
    received_date DATE,
    refund_amount DECIMAL(15, 2),
    refund_method VARCHAR(50),
    refund_status VARCHAR(20),
    admin_notes TEXT,
    customer_notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    INDEX idx_return_order (order_id),
    INDEX idx_return_customer (customer_id),
    INDEX idx_return_status (return_status)
);

CREATE TABLE return_items (
    return_item_id BIGINT PRIMARY KEY,
    return_id BIGINT NOT NULL,
    order_item_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    return_quantity INT NOT NULL,
    return_reason VARCHAR(100),
    condition VARCHAR(50),
    refund_amount DECIMAL(12, 2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (return_id) REFERENCES returns(return_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    INDEX idx_returnitem_return (return_id)
);

-- ============================================================================
-- 7. MARKETING AND PROMOTIONS
-- ============================================================================

CREATE TABLE coupons (
    coupon_id INT PRIMARY KEY,
    coupon_code VARCHAR(50) UNIQUE NOT NULL,
    coupon_description TEXT,
    discount_type VARCHAR(20) NOT NULL,
    discount_value DECIMAL(10, 2) NOT NULL,
    min_order_amount DECIMAL(15, 2) DEFAULT 0.00,
    max_discount_amount DECIMAL(15, 2),
    usage_limit INT,
    usage_count INT DEFAULT 0,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    applicable_categories VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_coupon_code (coupon_code),
    INDEX idx_coupon_active (is_active),
    INDEX idx_coupon_dates (start_date, end_date)
);

CREATE TABLE coupon_usage (
    usage_id BIGINT PRIMARY KEY,
    coupon_id INT NOT NULL,
    order_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    discount_applied DECIMAL(15, 2) NOT NULL,
    used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coupon_id) REFERENCES coupons(coupon_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    INDEX idx_couponusage_coupon (coupon_id),
    INDEX idx_couponusage_customer (customer_id)
);

-- ============================================================================
-- 8. REVIEWS AND RATINGS
-- ============================================================================

CREATE TABLE reviews (
    review_id BIGINT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    order_id BIGINT,
    customer_id BIGINT NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_title VARCHAR(255),
    review_text TEXT,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    helpful_count INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    INDEX idx_review_product (product_id),
    INDEX idx_review_customer (customer_id),
    INDEX idx_review_rating (rating),
    INDEX idx_review_status (status)
);

-- ============================================================================
-- 9. WISHLISTS AND CARTS
-- ============================================================================

CREATE TABLE wishlists (
    wishlist_id BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    priority INT DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
    UNIQUE KEY uk_wishlist_customer_product (customer_id, product_id),
    INDEX idx_wishlist_customer (customer_id)
);

CREATE TABLE shopping_carts (
    cart_id BIGINT PRIMARY KEY,
    customer_id BIGINT,
    session_id VARCHAR(100),
    product_id BIGINT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
    INDEX idx_cart_customer (customer_id),
    INDEX idx_cart_session (session_id)
);

-- ============================================================================
-- 10. ANALYTICS AND REPORTING
-- ============================================================================

CREATE TABLE daily_sales_summary (
    summary_id BIGINT PRIMARY KEY,
    summary_date DATE NOT NULL UNIQUE,
    total_orders INT NOT NULL DEFAULT 0,
    total_revenue DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    total_items_sold INT NOT NULL DEFAULT 0,
    unique_customers INT NOT NULL DEFAULT 0,
    average_order_value DECIMAL(12, 2),
    total_discount_given DECIMAL(15, 2) DEFAULT 0.00,
    total_tax_collected DECIMAL(15, 2) DEFAULT 0.00,
    total_shipping_collected DECIMAL(15, 2) DEFAULT 0.00,
    returned_orders INT DEFAULT 0,
    refund_amount DECIMAL(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_summary_date (summary_date)
);

CREATE TABLE product_daily_stats (
    stats_id BIGINT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    stats_date DATE NOT NULL,
    views INT DEFAULT 0,
    add_to_cart INT DEFAULT 0,
    purchases INT DEFAULT 0,
    revenue DECIMAL(15, 2) DEFAULT 0.00,
    units_sold INT DEFAULT 0,
    refund_requests INT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    UNIQUE KEY uk_product_stats_date (product_id, stats_date),
    INDEX idx_product_stats_date (stats_date)
);

-- ============================================================================
-- 11. LOGGING AND AUDIT
-- ============================================================================

CREATE TABLE audit_logs (
    log_id BIGINT PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_action (action_type),
    INDEX idx_audit_date (created_at)
);

-- ============================================================================
-- 12. NOTIFICATIONS
-- ============================================================================

CREATE TABLE notifications (
    notification_id BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    notification_title VARCHAR(255) NOT NULL,
    notification_message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    action_url VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    INDEX idx_notification_customer (customer_id),
    INDEX idx_notification_read (is_read),
    INDEX idx_notification_date (created_at)
);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
-- Total Tables: 20
-- Total Relationships: Complex foreign key network
-- Compatible Dialects: MySQL, PostgreSQL, SQLite
-- ============================================================================
