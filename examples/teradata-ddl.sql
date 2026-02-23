-- ============================================================
-- Teradata DDL Examples
-- ============================================================
-- Dialect: Teradata
-- Focus: Teradata Data Definition Language patterns
--
-- Tests:
--   1) CREATE TABLE variations (MULTISET, SET, VOLATILE)
--   2) PRIMARY INDEX vs PRIMARY KEY
--   3) SECONDARY INDEX
--   4) PARTITION BY (table partitioning)
--   5) PRIMARY AMP INDEX
--   6) COLLECT STATISTICS
--   7) CREATE MACRO
--   8) CREATE PROCEDURE
--   9) CREATE FUNCTION
--   10) ALTER TABLE variations
--   11) COMMENT statements
--   12) GRANT/REVOKE
--   13) DROP statements
--   14) RENAME statements
--   ============================================================

-- ============================================================
-- CREATE TABLE Variations
-- ============================================================

-- Q1: Basic MULTISET table with PRIMARY INDEX
CREATE MULTISET TABLE sales_transactions (
    transaction_id BIGINT NOT NULL,
    customer_id INTEGER,
    transaction_date DATE,
    amount DECIMAL(15,2),
    status VARCHAR(20)
)
PRIMARY INDEX (transaction_id);

-- Q2: SET table with UNIQUE PRIMARY INDEX
CREATE SET TABLE customers (
    customer_id INTEGER NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    created_date DATE DEFAULT CURRENT_DATE,
    status CHAR(1) DEFAULT 'A'
)
UNIQUE PRIMARY INDEX (customer_id);

-- Q3: Table with composite PRIMARY INDEX
CREATE MULTISET TABLE order_items (
    order_id INTEGER NOT NULL,
    line_number SMALLINT NOT NULL,
    product_id INTEGER,
    quantity INTEGER,
    unit_price DECIMAL(10,2),
    line_total DECIMAL(12,2)
)
PRIMARY INDEX (order_id, line_number);

-- Q4: Table with PRIMARY KEY (creates UPI automatically)
CREATE SET TABLE countries (
    country_code CHAR(2) NOT NULL,
    country_name VARCHAR(100) NOT NULL,
    region VARCHAR(50),
    PRIMARY KEY (country_code)
);

-- Q5: Table with SECONDARY INDEX
CREATE MULTISET TABLE products (
    product_id INTEGER NOT NULL,
    product_name VARCHAR(200),
    category_id INTEGER,
    price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
PRIMARY INDEX (product_id)
INDEX (category_id)
INDEX (product_name);

-- Q6: Table with UNIQUE SECONDARY INDEX (USI)
CREATE SET TABLE user_accounts (
    user_id INTEGER NOT NULL,
    username VARCHAR(50),
    email VARCHAR(255),
    password_hash VARCHAR(128),
    created_date DATE
)
PRIMARY INDEX (user_id)
UNIQUE INDEX (username)
UNIQUE INDEX (email);

-- Q7: VOLATILE table with NO LOG
CREATE VOLATILE MULTISET TABLE temp_session_data (
    session_key VARCHAR(32),
    user_id INTEGER,
    data_value VARCHAR(500),
    created_ts TIMESTAMP
)
NO LOG
PRIMARY INDEX (session_key)
ON COMMIT PRESERVE ROWS;

-- Q8: VOLATILE table ON COMMIT DELETE ROWS
CREATE VOLATILE TABLE temp_calculation (
    calc_id INTEGER,
    calc_value DECIMAL(20,4)
)
PRIMARY INDEX (calc_id)
ON COMMIT DELETE ROWS;

-- Q9: GLOBAL TEMPORARY table
CREATE GLOBAL TEMPORARY TABLE gtt_order_batch (
    batch_id INTEGER,
    order_id BIGINT,
    processing_status CHAR(1)
)
PRIMARY INDEX (batch_id);

-- ============================================================
-- Partitioning
-- ============================================================

-- Q10: PARTITION BY RANGE (date partitioning)
CREATE MULTISET TABLE sales_by_month (
    sale_id BIGINT,
    sale_date DATE,
    customer_id INTEGER,
    amount DECIMAL(12,2)
)
PRIMARY INDEX (sale_id)
PARTITION BY RANGE_N(
    sale_date BETWEEN DATE '2020-01-01' AND DATE '2024-12-31' 
    EACH INTERVAL '1' MONTH,
    NO RANGE,
    UNKNOWN
);

-- Q11: PARTITION BY CASE_N (conditional partitioning)
CREATE MULTISET TABLE customer_segments (
    customer_id INTEGER,
    total_purchases DECIMAL(15,2),
    segment VARCHAR(20)
)
PRIMARY INDEX (customer_id)
PARTITION BY CASE_N(
    total_purchases >= 10000,
    total_purchases >= 5000 AND total_purchases < 10000,
    total_purchases >= 1000 AND total_purchases < 5000,
    total_purchases < 1000,
    NO CASE,
    UNKNOWN
);

-- Q12: Multi-level partitioning
CREATE MULTISET TABLE partitioned_transactions (
    transaction_id BIGINT,
    transaction_date DATE,
    region_code CHAR(2),
    amount DECIMAL(12,2)
)
PRIMARY INDEX (transaction_id)
PARTITION BY (
    RANGE_N(region_code BETWEEN 'EA', 'WE', 'AP', NO RANGE, UNKNOWN),
    RANGE_N(transaction_date BETWEEN DATE '2020-01-01' AND DATE '2024-12-31' 
        EACH INTERVAL '1' MONTH, NO RANGE, UNKNOWN)
);

-- Q13: PRIMARY AMP INDEX (PPI)
CREATE MULTISET TABLE amp_distributed_data (
    record_id BIGINT,
    partition_key INTEGER,
    data_value VARCHAR(500)
)
PRIMARY AMP INDEX (partition_key);

-- ============================================================
-- CREATE TABLE AS (CTAS)
-- ============================================================

-- Q14: CTAS with WITH DATA
CREATE TABLE customer_summary AS (
    SELECT 
        customer_id,
        COUNT(*) AS order_count,
        SUM(amount) AS total_spent,
        AVG(amount) AS avg_order
    FROM orders
    GROUP BY customer_id
)
WITH DATA
PRIMARY INDEX (customer_id);

-- Q15: CTAS with statistics collected
CREATE TABLE daily_sales_summary AS (
    SELECT 
        sale_date,
        SUM(revenue) AS daily_revenue,
        COUNT(DISTINCT customer_id) AS unique_customers
    FROM sales
    GROUP BY sale_date
)
WITH DATA AND STATISTICS
PRIMARY INDEX (sale_date);

-- Q16: CTAS with specific index
CREATE TABLE product_performance AS (
    SELECT 
        p.product_id,
        p.product_name,
        SUM(s.quantity) AS units_sold,
        SUM(s.revenue) AS total_revenue
    FROM products p
    JOIN sales s ON p.product_id = s.product_id
    GROUP BY p.product_id, p.product_name
)
WITH DATA
PRIMARY INDEX (product_id)
INDEX (total_revenue);

-- ============================================================
-- COLLECT STATISTICS
-- ============================================================

-- Q17: Collect statistics on column
COLLECT STATISTICS ON customers COLUMN (customer_id);

-- Q18: Collect statistics on multiple columns
COLLECT STATISTICS ON orders 
COLUMN (order_id),
COLUMN (customer_id),
COLUMN (order_date);

-- Q19: Collect statistics on index
COLLECT STATISTICS ON products INDEX (product_id);

-- Q20: Collect statistics using SAMPLE
COLLECT STATISTICS ON large_table 
COLUMN (key_column)
USING SAMPLE 5 PERCENT;

-- Q21: Collect statistics with threshold
COLLECT STATISTICS ON orders
COLUMN (order_date)
USING THRESHOLD 10 PERCENT;

-- Q22: DROP STATISTICS
DROP STATISTICS ON customers;

-- Q23: DROP specific column statistics
DROP STATISTICS ON orders COLUMN (order_date);

-- ============================================================
-- CREATE MACRO
-- ============================================================

-- Q24: Simple macro
CREATE MACRO get_customer_orders AS (
    SELECT order_id, order_date, total_amount
    FROM orders
    WHERE customer_id = :cust_id
    ORDER BY order_date DESC;
);

-- Q25: Macro with multiple parameters
CREATE MACRO get_sales_by_range (
    start_date DATE,
    end_date DATE,
    region VARCHAR(20)
) AS (
    SELECT 
        sale_date,
        SUM(amount) AS total_sales,
        COUNT(*) AS transaction_count
    FROM sales
    WHERE sale_date BETWEEN :start_date AND :end_date
    AND region = :region
    GROUP BY sale_date
    ORDER BY sale_date;
);

-- Q26: Macro with default values
CREATE MACRO search_products (
    search_term VARCHAR(100),
    max_results INTEGER DEFAULT 100
) AS (
    SELECT TOP :max_results
        product_id,
        product_name,
        price
    FROM products
    WHERE product_name LIKE '%' || :search_term || '%'
    ORDER BY product_name;
);

-- Q27: REPLACE MACRO
REPLACE MACRO get_customer_orders AS (
    SELECT order_id, order_date, total_amount, status
    FROM orders
    WHERE customer_id = :cust_id
    ORDER BY order_date DESC;
);

-- Q28: DROP MACRO
DROP MACRO get_customer_orders;

-- ============================================================
-- CREATE PROCEDURE
-- ============================================================

-- Q29: Simple stored procedure
CREATE PROCEDURE process_daily_sales()
BEGIN
    INSERT INTO sales_summary (sale_date, total_revenue)
    SELECT CURRENT_DATE, SUM(amount)
    FROM sales
    WHERE sale_date = CURRENT_DATE;
    
    DELETE FROM sales
    WHERE sale_date = CURRENT_DATE;
END;

-- Q30: Procedure with parameters
CREATE PROCEDURE archive_old_orders(
    IN days_to_keep INTEGER,
    OUT archived_count INTEGER
)
BEGIN
    DECLARE archive_date DATE;
    SET archive_date = CURRENT_DATE - days_to_keep;
    
    INSERT INTO order_archive
    SELECT * FROM orders
    WHERE order_date < archive_date;
    
    SELECT COUNT(*) INTO :archived_count
    FROM orders
    WHERE order_date < archive_date;
    
    DELETE FROM orders
    WHERE order_date < archive_date;
END;

-- Q31: Procedure with cursor
CREATE PROCEDURE process_customers()
BEGIN
    DECLARE done INTEGER DEFAULT 0;
    DECLARE v_customer_id INTEGER;
    DECLARE v_total DECIMAL(15,2);
    
    DECLARE customer_cursor CURSOR FOR
        SELECT customer_id FROM customers WHERE status = 'PENDING';
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
    
    OPEN customer_cursor;
    
    process_loop: LOOP
        FETCH customer_cursor INTO v_customer_id;
        IF done = 1 THEN
            LEAVE process_loop;
        END IF;
        
        SELECT SUM(amount) INTO v_total
        FROM orders
        WHERE customer_id = v_customer_id;
        
        UPDATE customers
        SET total_orders = v_total, status = 'PROCESSED'
        WHERE customer_id = v_customer_id;
    END LOOP;
    
    CLOSE customer_cursor;
END;

-- Q32: DROP PROCEDURE
DROP PROCEDURE process_daily_sales;

-- ============================================================
-- CREATE FUNCTION
-- ============================================================

-- Q33: Scalar UDF
CREATE FUNCTION calculate_discount(
    total_amount DECIMAL(15,2),
    customer_tier VARCHAR(10)
) RETURNS DECIMAL(15,2)
BEGIN
    DECLARE discount_rate DECIMAL(5,4);
    
    SET discount_rate = CASE customer_tier
        WHEN 'PLATINUM' THEN 0.15
        WHEN 'GOLD' THEN 0.10
        WHEN 'SILVER' THEN 0.05
        ELSE 0.00
    END;
    
    RETURN total_amount * discount_rate;
END;

-- Q34: Table UDF
CREATE FUNCTION get_top_products(
    IN category_id INTEGER,
    IN limit_count INTEGER
) RETURNS TABLE (
    product_id INTEGER,
    product_name VARCHAR(200),
    total_sales DECIMAL(15,2)
)
BEGIN
    RETURN
    SELECT 
        p.product_id,
        p.product_name,
        SUM(s.amount) AS total_sales
    FROM products p
    JOIN sales s ON p.product_id = s.product_id
    WHERE p.category_id = :category_id
    GROUP BY p.product_id, p.product_name
    ORDER BY total_sales DESC
    SAMPLE :limit_count;
END;

-- Q35: REPLACE FUNCTION
REPLACE FUNCTION calculate_discount(
    total_amount DECIMAL(15,2),
    customer_tier VARCHAR(10)
) RETURNS DECIMAL(15,2)
BEGIN
    DECLARE discount_rate DECIMAL(5,4);
    
    SET discount_rate = CASE customer_tier
        WHEN 'PLATINUM' THEN 0.20
        WHEN 'GOLD' THEN 0.12
        WHEN 'SILVER' THEN 0.07
        WHEN 'BRONZE' THEN 0.03
        ELSE 0.00
    END;
    
    RETURN total_amount * discount_rate;
END;

-- Q36: DROP FUNCTION
DROP FUNCTION calculate_discount;

-- ============================================================
-- ALTER TABLE
-- ============================================================

-- Q37: Add column
ALTER TABLE customers
ADD middle_name VARCHAR(50);

-- Q38: Add multiple columns
ALTER TABLE orders
ADD 
    shipping_method VARCHAR(20),
    estimated_delivery DATE,
    actual_delivery DATE;

-- Q39: Drop column
ALTER TABLE customers
DROP middle_name;

-- Q40: Rename column
ALTER TABLE customers
RENAME customer_fname TO first_name;

-- Q41: Add index
ALTER TABLE products
ADD INDEX (category_id, subcategory_id);

-- Q42: DROP INDEX
ALTER TABLE products
DROP INDEX category_id_idx;

-- Q43: Modify column
ALTER TABLE customers
ADD customer_notes VARCHAR(1000);

-- ============================================================
-- COMMENT
-- ============================================================

-- Q44: Comment on table
COMMENT ON TABLE customers IS 'Master customer table containing all registered customers';

-- Q45: Comment on column
COMMENT ON COLUMN customers.customer_id IS 'Unique identifier for each customer, generated by sequence';

-- Q46: Comment on database
COMMENT ON DATABASE sales_db IS 'Sales data warehouse containing transaction and summary tables';

-- ============================================================
-- GRANT / REVOKE
-- ============================================================

-- Q47: GRANT SELECT
GRANT SELECT ON customers TO readonly_user;

-- Q48: GRANT multiple privileges
GRANT SELECT, INSERT, UPDATE ON orders TO sales_user;

-- Q49: GRANT ALL
GRANT ALL ON temp_table TO admin_user;

-- Q50: GRANT with GRANT OPTION
GRANT SELECT ON products TO power_user WITH GRANT OPTION;

-- Q51: GRANT EXECUTE on macro
GRANT EXECUTE ON get_sales_by_range TO reporting_user;

-- Q52: GRANT EXECUTE on procedure
GRANT EXECUTE ON process_daily_sales TO etl_user;

-- Q53: REVOKE privileges
REVOKE UPDATE, DELETE ON customers FROM readonly_user;

-- Q54: REVOKE ALL
REVOKE ALL ON temp_table FROM guest_user;

-- ============================================================
-- DROP / RENAME
-- ============================================================

-- Q55: DROP TABLE
DROP TABLE customers;

-- Q56: DROP TABLE with ALL
DROP TABLE customers ALL;

-- Q57: RENAME TABLE
RENAME TABLE old_customers TO customers_archive;

-- Q58: RENAME VIEW
RENAME VIEW v_active_customers TO v_current_customers;

-- ============================================================
-- CREATE VIEW
-- ============================================================

-- Q59: Simple view
CREATE VIEW v_active_customers AS
SELECT customer_id, customer_name, email, status
FROM customers
WHERE status = 'ACTIVE';

-- Q60: View with CHECK OPTION
CREATE VIEW v_premium_customers AS
SELECT customer_id, customer_name, total_purchases, tier
FROM customers
WHERE tier IN ('GOLD', 'PLATINUM')
WITH CHECK OPTION;

-- Q61: REPLACE VIEW
REPLACE VIEW v_active_customers AS
SELECT customer_id, customer_name, email, phone, status
FROM customers
WHERE status = 'ACTIVE';

-- Q62: DROP VIEW
DROP VIEW v_active_customers;

-- ============================================================
-- CREATE JOIN INDEX
-- ============================================================

-- Q63: Join index
CREATE JOIN INDEX ji_customer_orders AS
SELECT 
    c.customer_id,
    c.customer_name,
    o.order_id,
    o.order_date,
    o.total_amount
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
PRIMARY INDEX (customer_id);

-- Q64: Aggregate join index
CREATE JOIN INDEX aji_daily_sales AS
SELECT 
    sale_date,
    region,
    SUM(amount) AS total_sales,
    COUNT(*) AS transaction_count
FROM sales
GROUP BY sale_date, region
PRIMARY INDEX (sale_date);

-- Q65: DROP JOIN INDEX
DROP JOIN INDEX ji_customer_orders;

-- ============================================================
-- Database and User Management
-- ============================================================

-- Q66: CREATE DATABASE
CREATE DATABASE sales_warehouse 
AS PERMANENT = 1000000000, 
   SPOOL = 500000000;

-- Q67: CREATE USER
CREATE USER reporting_user AS 
PASSWORD = 'SecurePass123',
PERMANENT = 100000000,
SPOOL = 50000000,
TEMPORARY = 50000000;

-- Q68: MODIFY USER
MODIFY USER reporting_user AS
PASSWORD = 'NewSecurePass456',
PERMANENT = 200000000;

-- Q69: DROP DATABASE
DROP DATABASE sales_warehouse;

-- Q70: DROP USER
DROP USER reporting_user;
