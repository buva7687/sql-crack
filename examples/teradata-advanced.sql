-- ============================================================
-- Teradata Advanced Examples
-- ============================================================
-- Dialect: Teradata
-- Focus: Advanced Teradata-specific syntax patterns
--
-- Tests:
--   1) MERGE INTO statement
--   2) Hash functions (HASHROW, HASHBUCKET, HASHAMP)
--   3) Window functions with complex QUALIFY
--   4) Recursive CTEs
--   5) Teradata-specific analytic functions
--   6) UPDATE FROM syntax
--   7) DELETE WITH syntax
--   8) Collective subqueries
--   9) OLAP functions
--   10) Stored procedure calls
-- ============================================================

REPLACE VIEW Employee_View 
AS 
SELECT 
EmployeeNo, 
FirstName, 
BirthDate,
JoinedDate 
DepartmentNo 
FROM  
Employee e 
inner join dept d 
on e.id=d.id; 

-- Q1: MERGE INTO (Teradata upsert)
MERGE INTO target_customers AS t
USING source_updates AS s
ON t.customer_id = s.customer_id
WHEN MATCHED THEN
    UPDATE SET
        t.customer_name = s.customer_name,
        t.email = s.email,
        t.phone = s.phone,
        t.last_updated = CURRENT_TIMESTAMP
WHEN NOT MATCHED THEN
    INSERT (customer_id, customer_name, email, phone, created_date, last_updated)
    VALUES (s.customer_id, s.customer_name, s.email, s.phone, CURRENT_DATE, CURRENT_TIMESTAMP);

-- Q2: MERGE with multiple WHEN clauses
MERGE INTO product_inventory AS target
USING daily_sales AS source
ON target.product_id = source.product_id
WHEN MATCHED AND target.quantity - source.sold_qty >= 0 THEN
    UPDATE SET target.quantity = target.quantity - source.sold_qty
WHEN MATCHED AND target.quantity - source.sold_qty < 0 THEN
    UPDATE SET target.quantity = 0, target.stock_status = 'OUT_OF_STOCK'
WHEN NOT MATCHED THEN
    INSERT (product_id, quantity, stock_status)
    VALUES (source.product_id, 0, 'NEEDS_INVENTORY');

-- Q3: HASHROW for data distribution analysis
SELECT 
    HASHROW(customer_id) AS hash_value,
    customer_id,
    customer_name
FROM customers
SAMPLE 100;

-- Q4: HASHBUCKET and HASHAMP for AMP distribution
SELECT 
    HASHBUCKET(HASHROW(customer_id)) AS bucket_id,
    HASHAMP(HASHBUCKET(HASHROW(customer_id))) AS amp_id,
    COUNT(*) AS row_count
FROM customers
GROUP BY 1, 2
ORDER BY 3 DESC;

-- Q5: HASHAMP with table size analysis
SELECT 
    HASHAMP(HASHBUCKET(HASHROW(department_id))) AS amp_number,
    COUNT(*) AS employee_count
FROM employees
GROUP BY 1
ORDER BY 2 DESC;

-- Q6: Complex QUALIFY with multiple window functions
SELECT 
    employee_id,
    department_id,
    salary,
    hire_date,
    SUM(salary) OVER (PARTITION BY department_id ORDER BY hire_date) AS dept_running_total,
    AVG(salary) OVER (PARTITION BY department_id) AS dept_avg_salary,
    ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) AS salary_rank,
    LAG(salary) OVER (PARTITION BY department_id ORDER BY hire_date) AS prev_hire_salary
FROM employees
QUALIFY ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) <= 5;

-- Q7: QUALIFY with cumulative distribution
SELECT 
    product_id,
    sales_date,
    daily_sales,
    CUME_DIST() OVER (ORDER BY daily_sales) AS sales_percentile,
    PERCENT_RANK() OVER (ORDER BY daily_sales) AS sales_rank_pct
FROM daily_sales
QUALIFY CUME_DIST() OVER (ORDER BY daily_sales) >= 0.90;

-- Q8: Recursive CTE for organizational hierarchy
WITH RECURSIVE employee_hierarchy AS (
    SELECT 
        employee_id,
        employee_name,
        manager_id,
        1 AS level,
        CAST(employee_name AS VARCHAR(500)) AS hierarchy_path
    FROM employees
    WHERE manager_id IS NULL
    
    UNION ALL
    
    SELECT 
        e.employee_id,
        e.employee_name,
        e.manager_id,
        eh.level + 1,
        eh.hierarchy_path || ' > ' || e.employee_name
    FROM employees e
    INNER JOIN employee_hierarchy eh ON e.manager_id = eh.employee_id
)
SELECT 
    employee_id,
    employee_name,
    level,
    hierarchy_path
FROM employee_hierarchy
ORDER BY hierarchy_path;

-- Q9: Recursive CTE for bill of materials
WITH RECURSIVE bom_explosion AS (
    SELECT 
        parent_part_id,
        component_part_id,
        quantity,
        1 AS level,
        CAST(component_part_id AS VARCHAR(1000)) AS component_path
    FROM bill_of_materials
    WHERE parent_part_id = 'PRODUCT-001'
    
    UNION ALL
    
    SELECT 
        bom.parent_part_id,
        bom.component_part_id,
        bom.quantity,
        be.level + 1,
        be.component_path || '|' || bom.component_part_id
    FROM bill_of_materials bom
    INNER JOIN bom_explosion be ON bom.parent_part_id = be.component_part_id
)
SELECT 
    component_part_id,
    level,
    quantity,
    component_path
FROM bom_explosion
ORDER BY level, component_path;

-- Q10: UPDATE with FROM clause (Teradata extension)
UPDATE target_sales_summary t
FROM source_daily_sales s
SET 
    t.total_revenue = t.total_revenue + s.revenue,
    t.total_units = t.total_units + s.units_sold,
    t.last_updated = CURRENT_TIMESTAMP
WHERE t.product_id = s.product_id
AND s.sale_date = CURRENT_DATE;

-- Q11: DELETE with subquery
DELETE FROM customers
WHERE customer_id IN (
    SELECT customer_id
    FROM inactive_customers
    WHERE last_activity_date < CURRENT_DATE - 730
);

-- Q12: DELETE with correlated subquery
DELETE FROM order_history o
WHERE EXISTS (
    SELECT 1 
    FROM archived_orders a 
    WHERE a.order_id = o.order_id
);

-- Q13: INSERT with query
INSERT INTO customer_archive (customer_id, customer_name, archive_date)
SELECT 
    customer_id,
    customer_name,
    CURRENT_DATE
FROM customers
WHERE status = 'INACTIVE';

-- Q14: Collective subquery (IN with multiple columns)
SELECT *
FROM orders
WHERE (customer_id, order_date) IN (
    SELECT customer_id, MAX(order_date)
    FROM orders
    GROUP BY customer_id
);

-- Q15: EXISTS with correlated subquery
SELECT 
    c.customer_id,
    c.customer_name
FROM customers c
WHERE EXISTS (
    SELECT 1 
    FROM orders o 
    WHERE o.customer_id = c.customer_id 
    AND o.order_date >= CURRENT_DATE - 30
);

-- Q16: NOT EXISTS pattern
SELECT 
    p.product_id,
    p.product_name
FROM products p
WHERE NOT EXISTS (
    SELECT 1 
    FROM inventory i 
    WHERE i.product_id = p.product_id 
    AND i.quantity > 0
);

-- Q17: Moving average with window functions
SELECT 
    sales_date,
    daily_revenue,
    AVG(daily_revenue) OVER (
        ORDER BY sales_date 
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS moving_avg_7day,
    AVG(daily_revenue) OVER (
        ORDER BY sales_date 
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ) AS moving_avg_30day
FROM daily_revenue;

-- Q18: FIRST_VALUE and LAST_VALUE
SELECT 
    customer_id,
    order_date,
    order_amount,
    FIRST_VALUE(order_amount) OVER (
        PARTITION BY customer_id 
        ORDER BY order_date
    ) AS first_order_amount,
    LAST_VALUE(order_amount) OVER (
        PARTITION BY customer_id 
        ORDER BY order_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS most_recent_order_amount
FROM customer_orders;

-- Q19: LEAD and LAG for period comparison
SELECT 
    sales_date,
    daily_sales,
    LAG(daily_sales, 1) OVER (ORDER BY sales_date) AS prev_day_sales,
    LAG(daily_sales, 7) OVER (ORDER BY sales_date) AS prev_week_sales,
    LEAD(daily_sales, 1) OVER (ORDER BY sales_date) AS next_day_sales,
    daily_sales - LAG(daily_sales, 1) OVER (ORDER BY sales_date) AS day_over_day_change
FROM daily_sales;

-- Q20: NTH_VALUE window function
SELECT 
    employee_id,
    department_id,
    salary,
    NTH_VALUE(salary, 2) OVER (
        PARTITION BY department_id 
        ORDER BY salary DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS second_highest_salary
FROM employees;

-- Q21: NTILE for bucketing
SELECT 
    customer_id,
    total_purchases,
    NTILE(4) OVER (ORDER BY total_purchases) AS purchase_quartile
FROM customer_summary;

-- Q22: ROWS vs RANGE window frames
SELECT 
    transaction_date,
    amount,
    SUM(amount) OVER (
        ORDER BY transaction_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_sum_rows,
    SUM(amount) OVER (
        ORDER BY transaction_date
        RANGE BETWEEN INTERVAL '7' DAY PRECEDING AND CURRENT ROW
    ) AS sum_last_7_days
FROM transactions;

-- Q23: LISTAGG equivalent (Teradata XML aggregation)
SELECT 
    department_id,
    TRIM(TRAILING ',' FROM (
        XMLAGG(XMLELEMENT(E, employee_name || ',') ORDER BY employee_name)
        .RETREIVE('/:E[1]/text()' VARCHAR(10000))
    )) AS employee_list
FROM employees
GROUP BY department_id;

-- Q24: Statistical functions
SELECT 
    product_category,
    AVG(price) AS avg_price,
    STDDEV_POP(price) AS population_stddev,
    STDDEV_SAMP(price) AS sample_stddev,
    VAR_POP(price) AS population_variance,
    VAR_SAMP(price) AS sample_variance,
    CORR(price, rating) AS price_rating_correlation
FROM products
GROUP BY product_category;

-- Q25: PERCENTILE functions
SELECT 
    department_id,
    salary,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) OVER () AS median_salary,
    PERCENTILE_DISC(0.9) WITHIN GROUP (ORDER BY salary) OVER () AS p90_salary
FROM employees;

-- Q26: CROSS JOIN for Cartesian product
SELECT 
    d.department_name,
    r.region_name
FROM departments d
CROSS JOIN regions r;

-- Q27: Full outer join with COALESCE
SELECT 
    COALESCE(s.customer_id, t.customer_id) AS customer_id,
    s.source_system,
    t.target_system,
    CASE 
        WHEN s.customer_id IS NULL THEN 'MISSING_IN_SOURCE'
        WHEN t.customer_id IS NULL THEN 'MISSING_IN_TARGET'
        ELSE 'MATCH'
    END AS compare_status
FROM source_customers s
FULL OUTER JOIN target_customers t ON s.customer_id = t.customer_id;

-- Q28: Aggregation with ROLLUP
SELECT 
    COALESCE(region, 'ALL_REGIONS') AS region,
    COALESCE(department, 'ALL_DEPTS') AS department,
    SUM(sales) AS total_sales
FROM sales_data
GROUP BY ROLLUP (region, department);

-- Q29: Aggregation with CUBE
SELECT 
    COALESCE(region, 'ALL') AS region,
    COALESCE(year, 'ALL') AS year,
    SUM(revenue) AS total_revenue
FROM financials
GROUP BY CUBE (region, year);

-- Q30: GROUPING SETS
SELECT 
    region,
    product_category,
    SUM(sales) AS sales_total
FROM sales_summary
GROUP BY GROUPING SETS (
    (region, product_category),
    (region),
    (product_category),
    ()
);


database random;

locking row for access
select * from emp;


locking row for access
sel * from emp;

comment on view emp is 'test abc xyz' ;

replace view emp_v
as 
/***
* some comments
* some more
***/
locking row for access
sel * from emp
where id=1;

