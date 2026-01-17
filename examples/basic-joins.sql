-- ============================================================
-- JOIN Patterns - Comprehensive Examples
-- ============================================================
-- This file demonstrates all JOIN types and patterns for visualization
--
-- Patterns covered:
--   1. INNER JOIN (basic)
--   2. LEFT/RIGHT/FULL OUTER JOIN
--   3. Multiple table JOINs (3+ tables)
--   4. Self-joins (hierarchies)
--   5. Star schema pattern
--   6. Many-to-many via junction tables
--   7. Mixed join types
--   8. Complex join conditions
--
-- Use these examples to test:
--   - JOIN visualization in the flow graph
--   - Edge colors by reference type
--   - Node connections and data flow
-- ============================================================

-- ============================================================
-- 1. Simple INNER JOIN
-- ============================================================
-- Basic two-table join with filtering and sorting
SELECT
    c.customer_id,
    c.customer_name,
    c.email,
    o.order_id,
    o.total_amount,
    o.order_date
FROM customers c
INNER JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'completed'
ORDER BY o.order_date DESC;

-- ============================================================
-- 2. LEFT JOIN (preserve all left table rows)
-- ============================================================
-- Find all customers, including those without orders
SELECT
    c.customer_id,
    c.customer_name,
    c.region,
    COUNT(o.order_id) AS order_count,
    COALESCE(SUM(o.total_amount), 0) AS total_spent
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.customer_name, c.region
ORDER BY total_spent DESC;

-- ============================================================
-- 3. RIGHT JOIN (preserve all right table rows)
-- ============================================================
-- Find all products, including those never ordered
SELECT
    p.product_id,
    p.product_name,
    p.category,
    COUNT(oi.item_id) AS times_ordered,
    COALESCE(SUM(oi.quantity), 0) AS total_quantity_sold
FROM order_items oi
RIGHT JOIN products p ON oi.product_id = p.product_id
GROUP BY p.product_id, p.product_name, p.category
ORDER BY times_ordered ASC;

-- ============================================================
-- 4. FULL OUTER JOIN
-- ============================================================
-- Match customers with suppliers in same region (full comparison)
SELECT
    COALESCE(c.region, s.region) AS region,
    c.customer_name,
    s.supplier_name,
    c.customer_id,
    s.supplier_id
FROM customers c
FULL OUTER JOIN suppliers s ON c.region = s.region
ORDER BY region, c.customer_name, s.supplier_name;

-- ============================================================
-- 5. Multiple Table JOIN (4 tables)
-- ============================================================
-- Complete order details with customer, product, and line items
SELECT
    c.customer_id,
    c.customer_name AS customer_name,
    c.email,
    o.order_id,
    o.order_date,
    oi.product_id,
    p.product_name,
    oi.quantity,
    oi.unit_price,
    oi.quantity * oi.unit_price AS line_total
FROM customers c
INNER JOIN orders o ON c.customer_id = o.customer_id
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN products p ON oi.product_id = p.product_id
WHERE o.status = 'completed'
    AND oi.quantity > 0
    AND o.order_date >= '2024-01-01'
ORDER BY o.order_date DESC, c.customer_name, p.product_name;

-- ============================================================
-- 6. Star Schema Pattern (fact + multiple dimensions)
-- ============================================================
-- Sales fact with date, product, customer, and store dimensions
SELECT
    f.sale_id,
    f.amount,
    d.date_value,
    d.year,
    d.quarter,
    p.product_name,
    p.category,
    c.customer_name,
    c.segment,
    s.store_name,
    s.region
FROM fact_sales f
INNER JOIN dim_date d ON f.date_key = d.date_key
INNER JOIN dim_product p ON f.product_key = p.product_key
INNER JOIN dim_customer c ON f.customer_key = c.customer_key
INNER JOIN dim_store s ON f.store_key = s.store_key
WHERE d.year = 2024
    AND p.category = 'Electronics'
ORDER BY f.amount DESC
LIMIT 100;

-- ============================================================
-- 7. Self-Join (Employee Hierarchy)
-- ============================================================
-- Three-level employee reporting chain
SELECT
    e.employee_id,
    e.name AS employee_name,
    e.department,
    m.name AS manager_name,
    m.department AS manager_department,
    d.name AS director_name
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.employee_id
LEFT JOIN employees d ON m.manager_id = d.employee_id
WHERE e.is_active = 1;

-- ============================================================
-- 8. Many-to-Many via Junction Table
-- ============================================================
-- Students enrolled in courses through enrollment junction
SELECT
    s.student_name,
    s.email,
    c.course_name,
    c.credits,
    i.instructor_name,
    e.grade,
    e.enrollment_date
FROM students s
INNER JOIN enrollments e ON s.student_id = e.student_id
INNER JOIN courses c ON e.course_id = c.course_id
INNER JOIN instructors i ON c.instructor_id = i.instructor_id
INNER JOIN departments d ON c.department_id = d.department_id
WHERE d.name = 'Computer Science'
    AND e.semester = 'Fall 2024';

-- ============================================================
-- 9. Mixed Join Types (INNER + LEFT)
-- ============================================================
-- Orders with required customer but optional shipping/category info
SELECT
    o.order_id,
    o.order_date,
    c.customer_name,
    p.product_name,
    cat.category_name,
    sup.supplier_name,
    sh.shipper_name,
    emp.employee_name
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id
INNER JOIN order_details od ON o.order_id = od.order_id
INNER JOIN products p ON od.product_id = p.id
LEFT JOIN categories cat ON p.category_id = cat.id
LEFT JOIN suppliers sup ON p.supplier_id = sup.id
LEFT JOIN shippers sh ON o.shipper_id = sh.id
LEFT JOIN employees emp ON o.employee_id = emp.id
WHERE o.status = 'completed';

-- ============================================================
-- 10. Complex Reporting Query with Aggregations
-- ============================================================
-- Regional sales performance with multiple aggregates
SELECT
    r.region_name,
    t.team_name,
    COUNT(DISTINCT s.salesperson_id) AS salespeople,
    COUNT(d.deal_id) AS total_deals,
    SUM(d.amount) AS total_amount,
    AVG(d.amount) AS avg_deal_size
FROM regions r
INNER JOIN territories t ON r.region_id = t.region_id
INNER JOIN salespeople s ON t.territory_id = s.territory_id
LEFT JOIN deals d ON s.salesperson_id = d.salesperson_id
LEFT JOIN deal_stages ds ON d.stage_id = ds.stage_id
WHERE ds.is_won = 1
    AND d.close_date >= '2024-01-01'
GROUP BY r.region_name, t.team_name
HAVING SUM(d.amount) > 100000
ORDER BY total_amount DESC;

-- ============================================================
-- 11. CROSS JOIN (Cartesian Product)
-- ============================================================
-- Generate all possible product-store combinations
SELECT
    p.product_name,
    s.store_name,
    p.price AS product_price,
    s.region AS store_region
FROM products p
CROSS JOIN stores s
WHERE p.active = TRUE
    AND s.status = 'open'
ORDER BY p.product_name, s.store_name;

-- ============================================================
-- 12. Subquery in JOIN (derived table)
-- ============================================================
-- Join with aggregated subquery results
SELECT
    main.category,
    main.total_sales,
    main.product_count
FROM (
    SELECT
        c.name AS category,
        SUM(oi.quantity * oi.price) AS total_sales,
        COUNT(DISTINCT p.id) AS product_count
    FROM categories c
    INNER JOIN products p ON c.id = p.category_id
    INNER JOIN order_items oi ON p.id = oi.product_id
    INNER JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at >= '2024-01-01'
    GROUP BY c.name
) AS main
WHERE main.total_sales > 10000
ORDER BY main.total_sales DESC;
