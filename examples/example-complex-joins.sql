-- Complex Join Scenarios for SQL Crack Visualization
-- This file demonstrates N:N join relationships and complex table connections

-- Example 1: Star Schema - Multiple dimension tables joining to a fact table
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

-- Example 2: Multiple tables with mixed join types
SELECT
    o.order_id,
    o.order_date,
    c.customer_name,
    p.product_name,
    cat.category_name,
    sup.supplier_name,
    sh.shipper_name,
    e.employee_name
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id
INNER JOIN order_details od ON o.order_id = od.order_id
INNER JOIN products p ON od.product_id = p.id
LEFT JOIN categories cat ON p.category_id = cat.id
LEFT JOIN suppliers sup ON p.supplier_id = sup.id
LEFT JOIN shippers sh ON o.shipper_id = sh.id
LEFT JOIN employees e ON o.employee_id = e.id
WHERE o.status = 'completed';

-- Example 3: Self-join with employee hierarchy
SELECT
    e.employee_id,
    e.name as employee_name,
    e.department,
    m.name as manager_name,
    m.department as manager_department,
    d.name as director_name
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.employee_id
LEFT JOIN employees d ON m.manager_id = d.employee_id
WHERE e.is_active = 1;

-- Example 4: Complex UNION with multiple tables on each side
SELECT
    'Order' as source,
    o.id,
    c.name as entity_name,
    o.total as amount,
    o.created_at
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'pending'

UNION ALL

SELECT
    'Invoice' as source,
    i.id,
    v.name as entity_name,
    i.amount,
    i.created_at
FROM invoices i
INNER JOIN vendors v ON i.vendor_id = v.id
WHERE i.status = 'unpaid'

UNION ALL

SELECT
    'Refund' as source,
    r.id,
    c.name as entity_name,
    -r.amount as amount,
    r.created_at
FROM refunds r
INNER JOIN customers c ON r.customer_id = c.id
WHERE r.status = 'processed';

-- Example 5: Many-to-many relationship through junction table
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

-- Example 6: Complex reporting query with multiple aggregations
SELECT
    r.region_name,
    t.team_name,
    COUNT(DISTINCT s.salesperson_id) as salespeople,
    COUNT(d.deal_id) as total_deals,
    SUM(d.amount) as total_amount,
    AVG(d.amount) as avg_deal_size
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

-- Example 7: Full outer join simulation (for databases that support it)
SELECT
    COALESCE(a.id, b.id) as id,
    a.name as table_a_name,
    b.name as table_b_name,
    a.value as table_a_value,
    b.value as table_b_value
FROM table_a a
FULL OUTER JOIN table_b b ON a.id = b.id;

-- Example 8: Subquery with multiple joins inside
SELECT
    main.category,
    main.total_sales,
    main.product_count
FROM (
    SELECT
        c.name as category,
        SUM(oi.quantity * oi.price) as total_sales,
        COUNT(DISTINCT p.id) as product_count
    FROM categories c
    INNER JOIN products p ON c.id = p.category_id
    INNER JOIN order_items oi ON p.id = oi.product_id
    INNER JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at >= '2024-01-01'
    GROUP BY c.name
) as main
WHERE main.total_sales > 10000
ORDER BY main.total_sales DESC;
