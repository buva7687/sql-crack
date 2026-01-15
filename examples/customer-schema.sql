-- ============================================================
-- Customer Domain Schema
-- ============================================================
-- This file defines customer-related tables and views
-- Referenced by: demo-showcase.sql, order-analytics.sql
-- Dialect: PostgreSQL / Snowflake

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

-- Customer segments view (used for analytics)
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
