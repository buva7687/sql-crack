-- ============================================================
-- Procedures & Functions - DDL and Usage Examples
-- ============================================================
-- Dialect: MySQL
-- Focus: CREATE FUNCTION/PROCEDURE as DDL blocks, plus
--        queries that call scalar and table-valued functions
--
-- Note: Procedural bodies (BEGIN...END) contain semicolons
-- that the statement splitter cannot distinguish from real
-- statement boundaries. Single-expression functions work fine.
-- ============================================================

-- Q1: Simple scalar function (single expression, no BEGIN...END)
CREATE FUNCTION calculate_discount(price DECIMAL(10,2), discount_pct INT)
RETURNS DECIMAL(10,2)
DETERMINISTIC
RETURN price * (1 - discount_pct / 100.0);

-- Q2: Another scalar function
CREATE FUNCTION full_name(first_name VARCHAR(50), last_name VARCHAR(50))
RETURNS VARCHAR(101)
DETERMINISTIC
RETURN CONCAT(first_name, ' ', last_name);

-- Q3: Create supporting tables
CREATE TABLE customers (
    id INT PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100)
);

CREATE TABLE orders (
    order_id INT PRIMARY KEY,
    customer_id INT,
    total_amount DECIMAL(10,2),
    status VARCHAR(20),
    order_date DATE
);

CREATE TABLE order_items (
    item_id INT PRIMARY KEY,
    order_id INT,
    product_name VARCHAR(100),
    quantity INT,
    unit_price DECIMAL(10,2)
);

-- Q4: Query using scalar functions in SELECT
SELECT
    full_name(c.first_name, c.last_name) AS customer_name,
    c.email,
    o.order_id,
    o.total_amount,
    calculate_discount(o.total_amount, 15) AS discounted_total
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE o.total_amount > 100
ORDER BY discounted_total DESC;

-- Q5: Aggregation with scalar function
SELECT
    full_name(c.first_name, c.last_name) AS customer_name,
    COUNT(o.order_id) AS order_count,
    SUM(o.total_amount) AS total_spent,
    SUM(calculate_discount(o.total_amount, 10)) AS total_after_discount
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.first_name, c.last_name
HAVING SUM(o.total_amount) > 500
ORDER BY total_spent DESC;

-- Q6: Subquery using function in filter
SELECT
    c.id,
    full_name(c.first_name, c.last_name) AS name,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
FROM customers c
WHERE c.id IN (
    SELECT DISTINCT customer_id
    FROM orders
    WHERE total_amount > calculate_discount(1000, 20)
);

-- Q7: CTE with function usage
WITH high_value_orders AS (
    SELECT
        o.customer_id,
        o.order_id,
        o.total_amount,
        calculate_discount(o.total_amount, 5) AS vip_price
    FROM orders o
    WHERE o.total_amount > 200
)
SELECT
    full_name(c.first_name, c.last_name) AS customer,
    hvo.order_id,
    hvo.total_amount AS original,
    hvo.vip_price
FROM high_value_orders hvo
JOIN customers c ON hvo.customer_id = c.id
ORDER BY hvo.total_amount DESC;
