-- ============================================================
-- Teradata Basic Examples
-- ============================================================
-- Dialect: Teradata
-- Focus: Core Teradata-specific syntax features
--
-- Tests:
--   1) MULTISET vs SET tables
--   2) PRIMARY INDEX (UPI, NUPI)
--   3) VOLATILE tables
--   4) SAMPLE clause
--   5) QUALIFY clause
--   6) WITH DATA option
--   7) LOCKING modifiers
--   8) SEL shorthand
--   9) Teradata date arithmetic
--   10) Normalization (NORMALIZE)
-- ============================================================

-- Q1: MULTISET table (allows duplicate rows)
CREATE MULTISET TABLE customer_sales (
    customer_id INTEGER,
    sale_date DATE,
    sale_amount DECIMAL(10,2),
    product_id INTEGER
)
PRIMARY INDEX (customer_id);

-- Q2: SET table (no duplicate rows allowed)
CREATE SET TABLE unique_customers (
    customer_id INTEGER,
    customer_name VARCHAR(100),
    email VARCHAR(255),
    created_date DATE
)
UNIQUE PRIMARY INDEX (customer_id);

-- Q3: VOLATILE table (session-scoped temporary table)
CREATE VOLATILE MULTISET TABLE temp_orders AS (
    SELECT order_id, customer_id, order_date, total_amount
    FROM orders
    WHERE order_date >= CURRENT_DATE - 30
)
WITH DATA
PRIMARY INDEX (order_id)
ON COMMIT PRESERVE ROWS;

-- Q4: SAMPLE clause for random row selection
SELECT 
    customer_id,
    customer_name,
    total_purchases
FROM customers
SAMPLE 1000;

-- Q5: SAMPLE with percentage
SELECT 
    product_id,
    product_name,
    category
FROM products
SAMPLE .25;

-- Q6: SAMPLE with multiple fractions
SELECT 
    employee_id,
    employee_name,
    department
FROM employees
SAMPLE .1, .2, .3;

-- Q7: QUALIFY with ROW_NUMBER (Teradata-specific filtering)
SELECT 
    customer_id,
    order_date,
    order_amount,
    ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) AS order_rank
FROM customer_orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) <= 3;

-- Q8: QUALIFY with RANK
SELECT 
    product_id,
    sale_date,
    revenue,
    RANK() OVER (ORDER BY revenue DESC) AS revenue_rank
FROM daily_product_sales
QUALIFY RANK() OVER (ORDER BY revenue DESC) <= 10;

-- Q9: SEL shorthand for SELECT
SEL customer_id, customer_name FROM customers;

-- Q10: WITH DATA option in CTAS
CREATE TABLE customer_summary AS (
    SELECT 
        customer_id,
        COUNT(*) AS order_count,
        SUM(order_amount) AS total_spent
    FROM orders
    GROUP BY customer_id
)
WITH DATA
PRIMARY INDEX (customer_id);

-- Q11: WITH NO DATA option (creates empty table structure)
CREATE TABLE customer_summary_empty AS (
    SELECT 
        customer_id,
        COUNT(*) AS order_count,
        SUM(order_amount) AS total_spent
    FROM orders
    GROUP BY 1
)
WITH NO DATA
PRIMARY INDEX (customer_id);

-- Q12: LOCKING ROW for access (optimistic locking)
SELECT customer_id, customer_name, credit_limit
FROM customers
LOCKING ROW FOR ACCESS
WHERE customer_id = 1001;

-- Q13: LOCKING TABLE for write (pessimistic locking)
UPDATE orders
SET status = 'Processing'
WHERE order_date = CURRENT_DATE
AND status = 'Pending';

-- Q14: LOCKING ROW FOR WRITE
SEL *
FROM inventory
LOCKING ROW FOR WRITE
WHERE product_id = 500;

-- Q15: Teradata date arithmetic
SELECT 
    order_id,
    order_date,
    order_date + 30 AS due_date,
    order_date - 7 AS reminder_date,
    CURRENT_DATE - order_date AS days_since_order,
    ADD_MONTHS(order_date, 1) AS next_month,
    EXTRACT(YEAR FROM order_date) AS order_year,
    EXTRACT(MONTH FROM order_date) AS order_month
FROM orders;

-- Q16: INTERVAL date arithmetic
SELECT 
    employee_id,
    hire_date,
    hire_date + INTERVAL '1' YEAR AS one_year_anniversary,
    hire_date + INTERVAL '6' MONTH AS six_month_review,
    hire_date + INTERVAL '90' DAY AS probation_end
FROM employees;

-- Q17: NORMALIZE with OVERLAPS (period data)
SELECT NORMALIZE 
    employee_id,
    PERIOD(job_start_date, job_end_date) AS job_period,
    job_title
FROM job_history;

-- Q18: NORMALIZE ON MEETS OR OVERLAPS
SELECT NORMALIZE ON MEETS OR OVERLAPS
    policy_id,
    PERIOD(coverage_start, coverage_end) AS coverage_period,
    plan_type
FROM insurance_policies;

-- Q19: MULTISET with secondary index
CREATE MULTISET TABLE order_items (
    order_id INTEGER,
    line_item_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    unit_price DECIMAL(10,2)
)
PRIMARY INDEX (order_id)
INDEX (product_id);

-- Q20: Non-unique PRIMARY INDEX (NUPI)
CREATE SET TABLE product_categories (
    category_id INTEGER,
    category_name VARCHAR(50),
    parent_category_id INTEGER
)
PRIMARY INDEX (parent_category_id);

-- Q21: Unique PRIMARY INDEX (UPI)
CREATE SET TABLE countries (
    country_code CHAR(2),
    country_name VARCHAR(100),
    region VARCHAR(50)
)
UNIQUE PRIMARY INDEX (country_code);

-- Q22: CASE expression with Teradata syntax
SELECT 
    customer_id,
    customer_name,
    CASE 
        WHEN credit_score >= 750 THEN 'Excellent'
        WHEN credit_score >= 700 THEN 'Good'
        WHEN credit_score >= 650 THEN 'Fair'
        WHEN credit_score >= 600 THEN 'Poor'
        ELSE 'Very Poor'
    END AS credit_rating
FROM customers;

-- Q23: COALESCE (Teradata preferred over NVL)
SELECT 
    employee_id,
    employee_name,
    COALESCE(manager_id, 0) AS manager_id,
    COALESCE(department_id, 'Unassigned') AS department
FROM employees;

-- Q24: NULLIF for handling division by zero
SELECT 
    product_id,
    total_revenue,
    units_sold,
    total_revenue / NULLIF(units_sold, 0) AS avg_price_per_unit
FROM product_sales;

-- Q25: CURRENT_DATE, CURRENT_TIME, CURRENT_TIMESTAMP
SELECT 
    CURRENT_DATE AS today,
    CURRENT_TIME AS current_time,
    CURRENT_TIMESTAMP AS current_timestamp,
    DATE AS system_date;

-- Q26: Global Temporary Table
CREATE GLOBAL TEMPORARY TABLE gtt_session_data (
    session_id VARCHAR(32),
    user_id INTEGER,
    login_time TIMESTAMP,
    activity_data VARCHAR(500)
)
PRIMARY INDEX (session_id);

-- Q27: Derived table with SAMPLE
SELECT *
FROM (
    SELECT customer_id, SUM(amount) AS total
    FROM transactions
    GROUP BY customer_id
) AS customer_totals
SAMPLE 100;

-- Q28: Subquery with QUALIFY
SELECT *
FROM customers
WHERE customer_id IN (
    SELECT customer_id
    FROM orders
    QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) = 1
);

-- Q29: TOP n with SAMPLE combination
SELECT TOP 10 *
FROM large_table
SAMPLE 1000;

-- Q30: DISTINCT with QUALIFY
SELECT DISTINCT
    customer_id,
    product_category
FROM purchases
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id, product_category ORDER BY purchase_date DESC) = 1;
