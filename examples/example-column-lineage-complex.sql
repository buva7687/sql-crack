-- ============================================================
-- Complex Column Lineage Test Query
-- ============================================================
-- This query tests column flows through:
-- - Multiple CTEs
-- - JOINs
-- - Aggregations
-- - Window functions
-- - CASE statements
-- - Subqueries
-- ============================================================

WITH 
-- CTE 1: Employee statistics by department
dept_stats AS (
    SELECT 
        department,
        COUNT(*) AS employee_count,
        AVG(salary) AS avg_salary,
        MAX(salary) AS max_salary,
        MIN(salary) AS min_salary,
        SUM(salary) AS total_payroll
    FROM employees
    WHERE status = 'active'
    GROUP BY department
),

-- CTE 2: Employee rankings within department
dept_rankings AS (
    SELECT 
        e.employee_id,
        e.name,
        e.department,
        e.salary,
        ROW_NUMBER() OVER (PARTITION BY e.department ORDER BY e.salary DESC) AS salary_rank,
        RANK() OVER (PARTITION BY e.department ORDER BY e.salary DESC) AS salary_rank_with_ties,
        e.salary - AVG(e.salary) OVER (PARTITION BY e.department) AS salary_vs_dept_avg
    FROM employees e
    WHERE e.status = 'active'
),

-- CTE 3: Performance metrics
performance_metrics AS (
    SELECT 
        employee_id,
        AVG(rating) AS avg_rating,
        COUNT(*) AS review_count,
        MAX(rating) AS best_rating,
        MIN(rating) AS worst_rating
    FROM performance_reviews
    WHERE review_date >= CURRENT_DATE - INTERVAL '2 years'
    GROUP BY employee_id
)

-- Main query: Combine all metrics
SELECT 
    dr.employee_id,
    dr.name AS employee_name,
    dr.department,
    
    -- Salary information (from dept_rankings CTE)
    dr.salary AS current_salary,
    dr.salary_rank,
    dr.salary_vs_dept_avg,
    
    -- Department statistics (from dept_stats CTE)
    ds.avg_salary AS dept_avg_salary,
    ds.max_salary AS dept_max_salary,
    ds.employee_count AS dept_size,
    
    -- Performance metrics (from performance_metrics CTE)
    COALESCE(pm.avg_rating, 0) AS avg_performance_rating,
    COALESCE(pm.review_count, 0) AS review_count,
    
    -- Calculated fields
    CASE 
        WHEN dr.salary >= ds.max_salary * 0.9 THEN 'Top 10%'
        WHEN dr.salary >= ds.avg_salary THEN 'Above Average'
        WHEN dr.salary >= ds.min_salary * 1.1 THEN 'Below Average'
        ELSE 'Bottom Tier'
    END AS salary_percentile,
    
    CASE 
        WHEN COALESCE(pm.avg_rating, 0) >= 4.5 AND dr.salary < ds.avg_salary THEN 'Underpaid High Performer'
        WHEN COALESCE(pm.avg_rating, 0) < 3.0 AND dr.salary > ds.avg_salary THEN 'Overpaid Low Performer'
        WHEN COALESCE(pm.avg_rating, 0) >= 4.0 AND dr.salary >= ds.avg_salary THEN 'Well Compensated'
        ELSE 'Standard'
    END AS compensation_category,
    
    -- Salary adjustment calculation
    CASE 
        WHEN COALESCE(pm.avg_rating, 0) >= 4.5 AND dr.salary < ds.avg_salary 
            THEN (ds.avg_salary - dr.salary) * 0.5
        WHEN COALESCE(pm.avg_rating, 0) < 3.0 AND dr.salary > ds.avg_salary 
            THEN (dr.salary - ds.avg_salary) * -0.1
        ELSE 0
    END AS recommended_salary_adjustment,
    
    -- Final calculated salary
    dr.salary + 
    CASE 
        WHEN COALESCE(pm.avg_rating, 0) >= 4.5 AND dr.salary < ds.avg_salary 
            THEN (ds.avg_salary - dr.salary) * 0.5
        WHEN COALESCE(pm.avg_rating, 0) < 3.0 AND dr.salary > ds.avg_salary 
            THEN (dr.salary - ds.avg_salary) * -0.1
        ELSE 0
    END AS adjusted_salary,
    
    -- Window function: Overall ranking
    RANK() OVER (ORDER BY dr.salary DESC) AS overall_salary_rank,
    PERCENT_RANK() OVER (ORDER BY dr.salary) AS salary_percent_rank

FROM dept_rankings dr
INNER JOIN dept_stats ds ON dr.department = ds.department
LEFT JOIN performance_metrics pm ON dr.employee_id = pm.employee_id

WHERE ds.employee_count >= 5  -- Only departments with 5+ employees

ORDER BY 
    dr.department,
    dr.salary DESC;

