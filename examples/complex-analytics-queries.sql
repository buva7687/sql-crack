-- ============================================================
-- Complex Enterprise Analytics Queries
-- ============================================================
-- Large, complex SQL queries using extensive SQL features:
--   - Multiple CTEs (Common Table Expressions)
--   - Window functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, SUM OVER, etc.)
--   - Aggregations (SUM, AVG, COUNT, MIN, MAX, STDDEV, VARIANCE)
--   - CASE expressions (simple and searched)
--   - Subqueries (correlated and non-correlated)
--   - JOINs (INNER, LEFT, RIGHT, FULL, CROSS)
--   - Set operations (UNION, INTERSECT, EXCEPT)
--   - String functions (CONCAT, SUBSTRING, TRIM, UPPER, LOWER, COALESCE, NULLIF)
--   - Date functions (EXTRACT, DATE_TRUNC, DATE_PART, INTERVAL)
--   - Mathematical functions (ROUND, FLOOR, CEIL, ABS, POWER, SQRT)
--   - Conditional aggregations (FILTER, CASE in aggregations)
--   - Recursive CTEs
-- Dialect: PostgreSQL / Snowflake
-- References: schema-enterprise-ddl.sql
-- ============================================================

-- ============================================================
-- QUERY 1: Comprehensive Employee Performance Analysis
-- ============================================================
-- Uses: CTEs, Window Functions, Aggregations, CASE, Subqueries, JOINs
-- ============================================================

WITH employee_base_metrics AS (
    SELECT
        e.employee_id,
        e.first_name || ' ' || e.last_name AS full_name,
        e.department_id,
        d.department_name,
        e.job_title,
        e.salary,
        e.hire_date,
        EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM e.hire_date) AS years_of_service,
        COUNT(DISTINCT t.project_id) AS projects_involved,
        COUNT(DISTINCT t.task_id) AS total_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.task_id END) AS completed_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'in-progress' THEN t.task_id END) AS in_progress_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'blocked' THEN t.task_id END) AS blocked_tasks
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.department_id
    LEFT JOIN tasks t ON t.assigned_to = e.employee_id
    WHERE e.status = 'active'
    GROUP BY e.employee_id, e.first_name, e.last_name, e.department_id, d.department_name, 
             e.job_title, e.salary, e.hire_date
),
time_tracking_metrics AS (
    SELECT
        te.employee_id,
        SUM(te.hours_worked) AS total_hours,
        SUM(CASE WHEN te.billable = TRUE THEN te.hours_worked ELSE 0 END) AS billable_hours,
        SUM(CASE WHEN te.billable = FALSE THEN te.hours_worked ELSE 0 END) AS non_billable_hours,
        COUNT(DISTINCT te.project_id) AS projects_with_time_logged,
        COUNT(DISTINCT DATE(te.entry_date)) AS days_with_entries,
        AVG(te.hours_worked) AS avg_hours_per_entry,
        MAX(te.hours_worked) AS max_hours_single_entry,
        MIN(te.hours_worked) AS min_hours_single_entry,
        STDDEV(te.hours_worked) AS hours_stddev
    FROM time_entries te
    WHERE te.entry_date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY te.employee_id
),
performance_scores AS (
    SELECT
        ebm.employee_id,
        ebm.full_name,
        ebm.department_name,
        ebm.job_title,
        ebm.salary,
        ebm.years_of_service,
        ebm.projects_involved,
        ebm.total_tasks,
        ebm.completed_tasks,
        ebm.in_progress_tasks,
        ebm.blocked_tasks,
        COALESCE(ttm.total_hours, 0) AS total_hours,
        COALESCE(ttm.billable_hours, 0) AS billable_hours,
        COALESCE(ttm.non_billable_hours, 0) AS non_billable_hours,
        COALESCE(ttm.projects_with_time_logged, 0) AS projects_with_time_logged,
        -- Calculate completion rate
        CASE 
            WHEN ebm.total_tasks > 0 
            THEN ROUND((ebm.completed_tasks::DECIMAL / ebm.total_tasks) * 100, 2)
            ELSE 0 
        END AS completion_rate_percent,
        -- Calculate efficiency score
        CASE
            WHEN ebm.total_tasks > 0 AND COALESCE(ttm.total_hours, 0) > 0
            THEN ROUND((ebm.completed_tasks::DECIMAL / NULLIF(ttm.total_hours, 0)) * 100, 2)
            ELSE 0
        END AS efficiency_score,
        -- Calculate billability rate
        CASE
            WHEN COALESCE(ttm.total_hours, 0) > 0
            THEN ROUND((ttm.billable_hours::DECIMAL / ttm.total_hours) * 100, 2)
            ELSE 0
        END AS billability_rate_percent
    FROM employee_base_metrics ebm
    LEFT JOIN time_tracking_metrics ttm ON ebm.employee_id = ttm.employee_id
),
department_rankings AS (
    SELECT
        ps.*,
        -- Window functions for ranking
        ROW_NUMBER() OVER (PARTITION BY ps.department_name ORDER BY ps.completion_rate_percent DESC) AS dept_rank_by_completion,
        RANK() OVER (PARTITION BY ps.department_name ORDER BY ps.efficiency_score DESC) AS dept_rank_by_efficiency,
        DENSE_RANK() OVER (PARTITION BY ps.department_name ORDER BY ps.billability_rate_percent DESC) AS dept_rank_by_billability,
        -- Percentile calculations
        PERCENT_RANK() OVER (PARTITION BY ps.department_name ORDER BY ps.completion_rate_percent) AS completion_percentile,
        PERCENT_RANK() OVER (PARTITION BY ps.department_name ORDER BY ps.efficiency_score) AS efficiency_percentile,
        -- Moving averages (if we had time series data)
        AVG(ps.completion_rate_percent) OVER (PARTITION BY ps.department_name) AS dept_avg_completion_rate,
        STDDEV(ps.completion_rate_percent) OVER (PARTITION BY ps.department_name) AS dept_stddev_completion_rate,
        -- Lead and Lag for comparison
        LAG(ps.completion_rate_percent, 1) OVER (PARTITION BY ps.department_name ORDER BY ps.completion_rate_percent DESC) AS prev_employee_completion,
        LEAD(ps.completion_rate_percent, 1) OVER (PARTITION BY ps.department_name ORDER BY ps.completion_rate_percent DESC) AS next_employee_completion
    FROM performance_scores ps
)
SELECT
    dr.employee_id,
    dr.full_name,
    dr.department_name,
    dr.job_title,
    dr.years_of_service,
    dr.salary,
    dr.projects_involved,
    dr.total_tasks,
    dr.completed_tasks,
    dr.in_progress_tasks,
    dr.blocked_tasks,
    dr.total_hours,
    dr.billable_hours,
    dr.non_billable_hours,
    dr.completion_rate_percent,
    dr.efficiency_score,
    dr.billability_rate_percent,
    dr.dept_rank_by_completion,
    dr.dept_rank_by_efficiency,
    dr.dept_rank_by_billability,
    dr.completion_percentile,
    dr.efficiency_percentile,
    dr.dept_avg_completion_rate,
    dr.dept_stddev_completion_rate,
    -- Performance category
    CASE
        WHEN dr.completion_rate_percent >= 90 AND dr.efficiency_score >= 10 THEN 'Top Performer'
        WHEN dr.completion_rate_percent >= 75 AND dr.efficiency_score >= 7 THEN 'High Performer'
        WHEN dr.completion_rate_percent >= 60 AND dr.efficiency_score >= 5 THEN 'Average Performer'
        WHEN dr.completion_rate_percent >= 40 THEN 'Below Average'
        ELSE 'Needs Improvement'
    END AS performance_category,
    -- Salary comparison
    CASE
        WHEN dr.salary > (SELECT AVG(salary) FROM employees WHERE department_id = dr.department_id AND status = 'active')
        THEN 'Above Average'
        WHEN dr.salary < (SELECT AVG(salary) FROM employees WHERE department_id = dr.department_id AND status = 'active')
        THEN 'Below Average'
        ELSE 'At Average'
    END AS salary_vs_dept_avg,
    -- Improvement indicator
    CASE
        WHEN dr.completion_rate_percent > dr.prev_employee_completion THEN 'Improving'
        WHEN dr.completion_rate_percent < dr.prev_employee_completion THEN 'Declining'
        ELSE 'Stable'
    END AS trend_indicator
FROM department_rankings dr
ORDER BY dr.department_name, dr.completion_rate_percent DESC;

-- ============================================================
-- QUERY 2: Financial Analysis with Budget Variance
-- ============================================================
-- Uses: CTEs, Aggregations, CASE, Window Functions, Subqueries, Date Functions
-- ============================================================

WITH fiscal_periods AS (
    SELECT
        DATE_TRUNC('quarter', CURRENT_DATE) AS current_quarter_start,
        DATE_TRUNC('quarter', CURRENT_DATE) + INTERVAL '3 months' - INTERVAL '1 day' AS current_quarter_end,
        EXTRACT(QUARTER FROM CURRENT_DATE) AS current_quarter,
        EXTRACT(YEAR FROM CURRENT_DATE) AS current_year
),
budget_allocations AS (
    SELECT
        b.budget_id,
        b.company_id,
        b.department_id,
        b.project_id,
        b.account_id,
        b.fiscal_year,
        b.fiscal_quarter,
        b.budget_amount,
        b.allocated_amount,
        b.remaining_amount,
        a.account_name,
        a.account_type,
        d.department_name,
        p.project_name,
        CASE
            WHEN b.fiscal_quarter IS NULL THEN 'Annual'
            ELSE 'Quarterly'
        END AS budget_period_type
    FROM budgets b
    JOIN accounts a ON b.account_id = a.account_id
    LEFT JOIN departments d ON b.department_id = d.department_id
    LEFT JOIN projects p ON b.project_id = p.project_id
    WHERE b.fiscal_year = (SELECT current_year FROM fiscal_periods)
),
actual_spending AS (
    SELECT
        txn.account_id,
        txn.department_id,
        txn.project_id,
        EXTRACT(QUARTER FROM txn.transaction_date) AS transaction_quarter,
        EXTRACT(YEAR FROM txn.transaction_date) AS transaction_year,
        SUM(CASE WHEN txn.transaction_type = 'debit' THEN txn.amount ELSE 0 END) AS total_debits,
        SUM(CASE WHEN txn.transaction_type = 'credit' THEN txn.amount ELSE 0 END) AS total_credits,
        SUM(CASE WHEN txn.transaction_type = 'debit' THEN txn.amount ELSE -txn.amount END) AS net_amount,
        COUNT(*) AS transaction_count,
        MIN(txn.transaction_date) AS first_transaction_date,
        MAX(txn.transaction_date) AS last_transaction_date
    FROM transactions txn
    WHERE txn.transaction_date >= (SELECT current_quarter_start FROM fiscal_periods)
      AND txn.transaction_date <= (SELECT current_quarter_end FROM fiscal_periods)
    GROUP BY txn.account_id, txn.department_id, txn.project_id, 
             EXTRACT(QUARTER FROM txn.transaction_date), EXTRACT(YEAR FROM txn.transaction_date)
),
budget_vs_actual AS (
    SELECT
        ba.budget_id,
        ba.company_id,
        ba.department_id,
        ba.department_name,
        ba.project_id,
        ba.project_name,
        ba.account_id,
        ba.account_name,
        ba.account_type,
        ba.fiscal_year,
        ba.fiscal_quarter,
        ba.budget_amount,
        ba.allocated_amount,
        ba.remaining_amount,
        COALESCE(asa.net_amount, 0) AS actual_spending,
        ba.budget_amount - COALESCE(asa.net_amount, 0) AS variance_amount,
        CASE
            WHEN ba.budget_amount > 0
            THEN ROUND(((ba.budget_amount - COALESCE(asa.net_amount, 0)) / ba.budget_amount) * 100, 2)
            ELSE 0
        END AS variance_percent,
        CASE
            WHEN COALESCE(asa.net_amount, 0) > ba.budget_amount THEN 'Over Budget'
            WHEN COALESCE(asa.net_amount, 0) < ba.budget_amount * 0.9 THEN 'Under Budget'
            WHEN COALESCE(asa.net_amount, 0) BETWEEN ba.budget_amount * 0.9 AND ba.budget_amount THEN 'On Budget'
            ELSE 'No Spending'
        END AS budget_status,
        COALESCE(asa.transaction_count, 0) AS transaction_count,
        COALESCE(asa.first_transaction_date, NULL) AS first_transaction_date,
        COALESCE(asa.last_transaction_date, NULL) AS last_transaction_date
    FROM budget_allocations ba
    LEFT JOIN actual_spending asa ON ba.account_id = asa.account_id
        AND (ba.department_id = asa.department_id OR (ba.department_id IS NULL AND asa.department_id IS NULL))
        AND (ba.project_id = asa.project_id OR (ba.project_id IS NULL AND asa.project_id IS NULL))
        AND (ba.fiscal_quarter = asa.transaction_quarter::INTEGER OR ba.fiscal_quarter IS NULL)
)
SELECT
    bva.budget_id,
    bva.company_id,
    c.company_name,
    bva.department_id,
    bva.department_name,
    bva.project_id,
    bva.project_name,
    bva.account_id,
    bva.account_name,
    bva.account_type,
    bva.fiscal_year,
    bva.fiscal_quarter,
    bva.budget_amount,
    bva.allocated_amount,
    bva.remaining_amount,
    bva.actual_spending,
    bva.variance_amount,
    ABS(bva.variance_amount) AS absolute_variance,
    bva.variance_percent,
    ABS(bva.variance_percent) AS absolute_variance_percent,
    bva.budget_status,
    bva.transaction_count,
    bva.first_transaction_date,
    bva.last_transaction_date,
    -- Window functions for department-level analysis
    SUM(bva.budget_amount) OVER (PARTITION BY bva.department_id) AS dept_total_budget,
    SUM(bva.actual_spending) OVER (PARTITION BY bva.department_id) AS dept_total_spending,
    SUM(bva.variance_amount) OVER (PARTITION BY bva.department_id) AS dept_total_variance,
    AVG(bva.variance_percent) OVER (PARTITION BY bva.department_id) AS dept_avg_variance_percent,
    -- Window functions for account type analysis
    SUM(bva.budget_amount) OVER (PARTITION BY bva.account_type) AS account_type_total_budget,
    SUM(bva.actual_spending) OVER (PARTITION BY bva.account_type) AS account_type_total_spending,
    COUNT(*) OVER (PARTITION BY bva.department_id, bva.budget_status) AS dept_status_count,
    -- Ranking
    RANK() OVER (PARTITION BY bva.department_id ORDER BY ABS(bva.variance_percent) DESC) AS variance_rank_in_dept,
    DENSE_RANK() OVER (PARTITION BY bva.account_type ORDER BY bva.variance_amount DESC) AS variance_rank_by_account_type
FROM budget_vs_actual bva
LEFT JOIN companies c ON bva.company_id = c.company_id
ORDER BY ABS(bva.variance_percent) DESC, bva.department_name, bva.account_name;

-- ============================================================
-- QUERY 3: Sales Performance with Cohort Analysis
-- ============================================================
-- Uses: CTEs, Window Functions, Aggregations, CASE, Date Functions, String Functions
-- ============================================================

WITH sales_rep_base AS (
    SELECT
        e.employee_id,
        UPPER(SUBSTRING(e.first_name, 1, 1) || SUBSTRING(e.last_name, 1, 1)) AS initials,
        TRIM(e.first_name || ' ' || e.last_name) AS full_name,
        e.department_id,
        d.department_name,
        e.hire_date AS rep_hire_date,
        EXTRACT(YEAR FROM e.hire_date) AS rep_hire_year,
        EXTRACT(QUARTER FROM e.hire_date) AS rep_hire_quarter
    FROM employees e
    JOIN departments d ON e.department_id = d.department_id
    WHERE e.status = 'active' AND e.job_title ILIKE '%sales%'
),
order_metrics AS (
    SELECT
        so.sales_rep_id,
        so.order_id,
        so.customer_id,
        so.order_date,
        so.order_number,
        so.status AS order_status,
        so.total_amount,
        so.discount_amount,
        so.tax_amount,
        so.net_amount,
        EXTRACT(YEAR FROM so.order_date) AS order_year,
        EXTRACT(QUARTER FROM so.order_date) AS order_quarter,
        EXTRACT(MONTH FROM so.order_date) AS order_month,
        DATE_TRUNC('month', so.order_date) AS order_month_start,
        COUNT(DISTINCT soi.item_id) AS line_item_count,
        SUM(soi.quantity) AS total_quantity_sold,
        SUM(soi.line_total) AS total_line_amount,
        c.customer_name,
        c.customer_type,
        c.industry AS customer_industry
    FROM sales_orders so
    LEFT JOIN sales_order_items soi ON so.order_id = soi.order_id
    LEFT JOIN customers c ON so.customer_id = c.customer_id
    WHERE so.order_date >= CURRENT_DATE - INTERVAL '2 years'
    GROUP BY so.sales_rep_id, so.order_id, so.customer_id, so.order_date, so.order_number,
             so.status, so.total_amount, so.discount_amount, so.tax_amount, so.net_amount,
             c.customer_name, c.customer_type, c.industry
),
monthly_sales_summary AS (
    SELECT
        om.sales_rep_id,
        om.order_month_start,
        om.order_year,
        om.order_quarter,
        COUNT(DISTINCT om.order_id) AS orders_count,
        COUNT(DISTINCT om.customer_id) AS unique_customers,
        SUM(om.net_amount) AS monthly_revenue,
        AVG(om.net_amount) AS avg_order_value,
        SUM(om.total_quantity_sold) AS total_units_sold,
        SUM(om.line_item_count) AS total_line_items,
        MIN(om.net_amount) AS min_order_value,
        MAX(om.net_amount) AS max_order_value,
        STDDEV(om.net_amount) AS order_value_stddev,
        -- First order date for each rep
        MIN(om.order_date) OVER (PARTITION BY om.sales_rep_id) AS rep_first_order_date,
        -- Month number since first order
        EXTRACT(MONTH FROM AGE(om.order_month_start, MIN(om.order_date) OVER (PARTITION BY om.sales_rep_id))) AS months_since_first_order
    FROM order_metrics om
    GROUP BY om.sales_rep_id, om.order_month_start, om.order_year, om.order_quarter
),
cohort_analysis AS (
    SELECT
        srb.employee_id,
        srb.full_name,
        srb.initials,
        srb.department_name,
        srb.rep_hire_date,
        srb.rep_hire_year,
        srb.rep_hire_quarter,
        mss.order_month_start,
        mss.order_year,
        mss.order_quarter,
        mss.orders_count,
        mss.unique_customers,
        mss.monthly_revenue,
        mss.avg_order_value,
        mss.total_units_sold,
        mss.total_line_items,
        mss.min_order_value,
        mss.max_order_value,
        mss.order_value_stddev,
        mss.rep_first_order_date,
        mss.months_since_first_order,
        -- Cohort month (first month of sales)
        DATE_TRUNC('month', mss.rep_first_order_date) AS cohort_month,
        -- Period number (months since cohort start)
        EXTRACT(MONTH FROM AGE(mss.order_month_start, DATE_TRUNC('month', mss.rep_first_order_date))) AS period_number
    FROM sales_rep_base srb
    JOIN monthly_sales_summary mss ON srb.employee_id = mss.sales_rep_id
),
cohort_aggregated AS (
    SELECT
        ca.employee_id,
        ca.full_name,
        ca.department_name,
        ca.cohort_month,
        ca.period_number,
        SUM(ca.orders_count) AS total_orders,
        SUM(ca.unique_customers) AS total_customers,
        SUM(ca.monthly_revenue) AS period_revenue,
        AVG(ca.avg_order_value) AS avg_order_value,
        SUM(ca.total_units_sold) AS total_units,
        -- Window functions for growth calculation
        LAG(SUM(ca.monthly_revenue), 1) OVER (PARTITION BY ca.employee_id ORDER BY ca.period_number) AS prev_period_revenue,
        LEAD(SUM(ca.monthly_revenue), 1) OVER (PARTITION BY ca.employee_id ORDER BY ca.period_number) AS next_period_revenue,
        -- Cumulative metrics
        SUM(SUM(ca.monthly_revenue)) OVER (PARTITION BY ca.employee_id ORDER BY ca.period_number) AS cumulative_revenue,
        SUM(SUM(ca.orders_count)) OVER (PARTITION BY ca.employee_id ORDER BY ca.period_number) AS cumulative_orders,
        -- First period revenue (for retention calculation)
        FIRST_VALUE(SUM(ca.monthly_revenue)) OVER (PARTITION BY ca.employee_id ORDER BY ca.period_number) AS first_period_revenue
    FROM cohort_analysis ca
    GROUP BY ca.employee_id, ca.full_name, ca.department_name, ca.cohort_month, ca.period_number
)
SELECT
    ca.employee_id,
    ca.full_name,
    ca.department_name,
    ca.cohort_month,
    TO_CHAR(ca.cohort_month, 'YYYY-MM') AS cohort_month_str,
    ca.period_number,
    CASE
        WHEN ca.period_number = 0 THEN 'Month 0 (Cohort Start)'
        WHEN ca.period_number = 1 THEN 'Month 1'
        WHEN ca.period_number = 2 THEN 'Month 2'
        WHEN ca.period_number BETWEEN 3 AND 5 THEN 'Months 3-5'
        WHEN ca.period_number BETWEEN 6 AND 11 THEN 'Months 6-11'
        ELSE 'Month 12+'
    END AS period_category,
    ca.total_orders,
    ca.total_customers,
    ca.period_revenue,
    ca.avg_order_value,
    ca.total_units,
    ca.prev_period_revenue,
    ca.next_period_revenue,
    ca.cumulative_revenue,
    ca.cumulative_orders,
    ca.first_period_revenue,
    -- Growth calculations
    CASE
        WHEN ca.prev_period_revenue > 0
        THEN ROUND(((ca.period_revenue - ca.prev_period_revenue) / ca.prev_period_revenue) * 100, 2)
        ELSE NULL
    END AS revenue_growth_percent,
    -- Retention rate (compared to first period)
    CASE
        WHEN ca.first_period_revenue > 0
        THEN ROUND((ca.period_revenue / ca.first_period_revenue) * 100, 2)
        ELSE 0
    END AS retention_rate_percent,
    -- Performance tier
    CASE
        WHEN ca.period_revenue >= 100000 THEN 'Tier 1'
        WHEN ca.period_revenue >= 50000 THEN 'Tier 2'
        WHEN ca.period_revenue >= 25000 THEN 'Tier 3'
        WHEN ca.period_revenue >= 10000 THEN 'Tier 4'
        ELSE 'Tier 5'
    END AS performance_tier,
    -- Window functions for ranking
    RANK() OVER (PARTITION BY ca.cohort_month ORDER BY ca.period_revenue DESC) AS revenue_rank_in_cohort,
    PERCENT_RANK() OVER (PARTITION BY ca.cohort_month ORDER BY ca.period_revenue) AS revenue_percentile_in_cohort,
    -- Department comparison
    AVG(ca.period_revenue) OVER (PARTITION BY ca.department_name, ca.period_number) AS dept_avg_for_period,
    MAX(ca.period_revenue) OVER (PARTITION BY ca.department_name, ca.period_number) AS dept_max_for_period,
    MIN(ca.period_revenue) OVER (PARTITION BY ca.department_name, ca.period_number) AS dept_min_for_period
FROM cohort_aggregated ca
ORDER BY ca.cohort_month DESC, ca.period_number, ca.period_revenue DESC;

-- ============================================================
-- QUERY 4: Project Health Dashboard with Risk Analysis
-- ============================================================
-- Uses: Recursive CTEs, Window Functions, Aggregations, CASE, Subqueries, Date Functions
-- ============================================================

WITH project_hierarchy AS (
    -- Base case: top-level projects
    SELECT
        p.project_id,
        p.project_name,
        p.project_code,
        p.company_id,
        p.start_date,
        p.end_date,
        p.budget,
        p.status,
        p.priority,
        NULL::INTEGER AS parent_project_id,
        0 AS hierarchy_level,
        ARRAY[p.project_id] AS project_path,
        p.project_name AS full_path_name
    FROM projects p
    WHERE p.status IN ('planning', 'active', 'on-hold')
    
    UNION ALL
    
    -- Recursive case: sub-projects (if you had a parent_project_id column)
    -- This is a placeholder structure for recursive CTE demonstration
    SELECT
        p.project_id,
        p.project_name,
        p.project_code,
        p.company_id,
        p.start_date,
        p.end_date,
        p.budget,
        p.status,
        p.priority,
        ph.project_id AS parent_project_id,
        ph.hierarchy_level + 1,
        ph.project_path || p.project_id,
        ph.full_path_name || ' > ' || p.project_name
    FROM projects p
    JOIN project_hierarchy ph ON p.company_id = ph.company_id
    WHERE ph.hierarchy_level < 3
),
task_statistics AS (
    SELECT
        t.project_id,
        COUNT(*) AS total_tasks,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) AS completed_tasks,
        COUNT(CASE WHEN t.status = 'in-progress' THEN 1 END) AS in_progress_tasks,
        COUNT(CASE WHEN t.status = 'todo' THEN 1 END) AS pending_tasks,
        COUNT(CASE WHEN t.status = 'blocked' THEN 1 END) AS blocked_tasks,
        COUNT(CASE WHEN t.due_date < CURRENT_DATE AND t.status != 'done' THEN 1 END) AS overdue_tasks,
        SUM(t.estimated_hours) AS total_estimated_hours,
        SUM(t.actual_hours) AS total_actual_hours,
        AVG(t.estimated_hours) AS avg_estimated_hours,
        AVG(t.actual_hours) AS avg_actual_hours,
        MIN(t.due_date) AS earliest_due_date,
        MAX(t.due_date) AS latest_due_date,
        COUNT(DISTINCT t.assigned_to) AS unique_assignees
    FROM tasks t
    GROUP BY t.project_id
),
time_tracking_stats AS (
    SELECT
        te.project_id,
        COUNT(DISTINCT te.employee_id) AS employees_logging_time,
        SUM(te.hours_worked) AS total_hours_logged,
        SUM(CASE WHEN te.billable = TRUE THEN te.hours_worked ELSE 0 END) AS billable_hours,
        AVG(te.hours_worked) AS avg_hours_per_entry,
        COUNT(*) AS total_time_entries,
        MIN(te.entry_date) AS first_time_entry,
        MAX(te.entry_date) AS last_time_entry,
        COUNT(DISTINCT DATE(te.entry_date)) AS days_with_entries
    FROM time_entries te
    WHERE te.entry_date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY te.project_id
),
financial_tracking AS (
    SELECT
        txn.project_id,
        SUM(CASE WHEN txn.transaction_type = 'debit' THEN txn.amount ELSE 0 END) AS total_debits,
        SUM(CASE WHEN txn.transaction_type = 'credit' THEN txn.amount ELSE 0 END) AS total_credits,
        SUM(CASE WHEN txn.transaction_type = 'debit' THEN txn.amount ELSE -txn.amount END) AS net_spending,
        COUNT(*) AS transaction_count,
        MIN(txn.transaction_date) AS first_transaction,
        MAX(txn.transaction_date) AS last_transaction
    FROM transactions txn
    WHERE txn.project_id IS NOT NULL
    GROUP BY txn.project_id
),
budget_tracking AS (
    SELECT
        b.project_id,
        SUM(b.budget_amount) AS total_budget_allocated,
        SUM(b.allocated_amount) AS total_allocated,
        SUM(b.remaining_amount) AS total_remaining
    FROM budgets b
    WHERE b.project_id IS NOT NULL
    GROUP BY b.project_id
)
SELECT
    ph.project_id,
    ph.project_name,
    ph.project_code,
    ph.company_id,
    c.company_name,
    ph.start_date,
    ph.end_date,
    ph.budget,
    ph.status,
    ph.priority,
    ph.hierarchy_level,
    ph.full_path_name,
    -- Task metrics
    COALESCE(ts.total_tasks, 0) AS total_tasks,
    COALESCE(ts.completed_tasks, 0) AS completed_tasks,
    COALESCE(ts.in_progress_tasks, 0) AS in_progress_tasks,
    COALESCE(ts.pending_tasks, 0) AS pending_tasks,
    COALESCE(ts.blocked_tasks, 0) AS blocked_tasks,
    COALESCE(ts.overdue_tasks, 0) AS overdue_tasks,
    COALESCE(ts.total_estimated_hours, 0) AS total_estimated_hours,
    COALESCE(ts.total_actual_hours, 0) AS total_actual_hours,
    COALESCE(ts.unique_assignees, 0) AS unique_assignees,
    -- Time tracking metrics
    COALESCE(tts.employees_logging_time, 0) AS employees_logging_time,
    COALESCE(tts.total_hours_logged, 0) AS total_hours_logged,
    COALESCE(tts.billable_hours, 0) AS billable_hours,
    COALESCE(tts.total_time_entries, 0) AS total_time_entries,
    COALESCE(tts.days_with_entries, 0) AS days_with_entries,
    -- Financial metrics
    COALESCE(ft.total_debits, 0) AS total_debits,
    COALESCE(ft.total_credits, 0) AS total_credits,
    COALESCE(ft.net_spending, 0) AS net_spending,
    COALESCE(ft.transaction_count, 0) AS transaction_count,
    COALESCE(bt.total_budget_allocated, 0) AS total_budget_allocated,
    COALESCE(bt.total_allocated, 0) AS total_allocated,
    COALESCE(bt.total_remaining, 0) AS total_remaining,
    -- Calculated metrics
    CASE
        WHEN ts.total_tasks > 0
        THEN ROUND((ts.completed_tasks::DECIMAL / ts.total_tasks) * 100, 2)
        ELSE 0
    END AS completion_percent,
    CASE
        WHEN ts.total_estimated_hours > 0 AND tts.total_hours_logged > 0
        THEN ROUND((ts.total_actual_hours::DECIMAL / ts.total_estimated_hours) * 100, 2)
        ELSE 0
    END AS hours_utilization_percent,
    CASE
        WHEN ph.budget > 0
        THEN ROUND((COALESCE(ft.net_spending, 0) / ph.budget) * 100, 2)
        ELSE 0
    END AS budget_utilization_percent,
    CASE
        WHEN ph.end_date IS NOT NULL
        THEN EXTRACT(DAY FROM (ph.end_date - CURRENT_DATE))
        ELSE NULL
    END AS days_until_deadline,
    CASE
        WHEN ph.end_date IS NOT NULL AND ph.end_date < CURRENT_DATE AND ph.status NOT IN ('completed', 'cancelled')
        THEN EXTRACT(DAY FROM (CURRENT_DATE - ph.end_date))
        ELSE 0
    END AS days_overdue,
    -- Risk indicators
    CASE
        WHEN COALESCE(ts.overdue_tasks, 0) > 5 THEN 'High Risk - Many Overdue Tasks'
        WHEN COALESCE(ts.blocked_tasks, 0) > 3 THEN 'High Risk - Multiple Blocked Tasks'
        WHEN COALESCE(ft.net_spending, 0) > ph.budget * 0.9 THEN 'High Risk - Budget Exhaustion'
        WHEN ph.end_date IS NOT NULL AND ph.end_date < CURRENT_DATE AND ph.status NOT IN ('completed', 'cancelled')
        THEN 'High Risk - Past Deadline'
        WHEN COALESCE(ts.completion_percent, 0) < 30 AND ph.end_date IS NOT NULL AND ph.end_date < CURRENT_DATE + INTERVAL '30 days'
        THEN 'Medium Risk - Low Progress Near Deadline'
        WHEN COALESCE(ts.blocked_tasks, 0) > 0 THEN 'Medium Risk - Blocked Tasks'
        WHEN COALESCE(ft.net_spending, 0) > ph.budget * 0.75 THEN 'Medium Risk - High Budget Usage'
        ELSE 'Low Risk'
    END AS risk_level,
    -- Health score (0-100)
    CASE
        WHEN ts.total_tasks > 0 THEN
            ROUND(
                (ts.completed_tasks::DECIMAL / ts.total_tasks) * 40 +
                (CASE WHEN COALESCE(ft.net_spending, 0) <= ph.budget THEN 30 ELSE 0 END) +
                (CASE WHEN ph.end_date IS NULL OR ph.end_date >= CURRENT_DATE THEN 20 ELSE 0 END) +
                (CASE WHEN COALESCE(ts.blocked_tasks, 0) = 0 THEN 10 ELSE 0 END)
            , 2)
        ELSE 50
    END AS health_score,
    -- Window functions for comparison
    AVG(COALESCE(ts.completion_percent, 0)) OVER (PARTITION BY ph.company_id) AS company_avg_completion,
    RANK() OVER (PARTITION BY ph.company_id ORDER BY COALESCE(ts.completion_percent, 0) DESC) AS completion_rank_in_company,
    PERCENT_RANK() OVER (PARTITION BY ph.status ORDER BY COALESCE(ts.completion_percent, 0)) AS completion_percentile_by_status
FROM project_hierarchy ph
LEFT JOIN companies c ON ph.company_id = c.company_id
LEFT JOIN task_statistics ts ON ph.project_id = ts.project_id
LEFT JOIN time_tracking_stats tts ON ph.project_id = tts.project_id
LEFT JOIN financial_tracking ft ON ph.project_id = ft.project_id
LEFT JOIN budget_tracking bt ON ph.project_id = bt.project_id
ORDER BY ph.hierarchy_level, ph.project_name;

-- ============================================================
-- QUERY 5: Inventory Analysis with Forecasting
-- ============================================================
-- Uses: Window Functions, Aggregations, CASE, Mathematical Functions, Subqueries
-- ============================================================

WITH inventory_movements AS (
    SELECT
        i.inventory_id,
        i.company_id,
        i.product_id,
        i.warehouse_location,
        i.quantity_on_hand,
        i.quantity_reserved,
        i.quantity_available,
        i.reorder_point,
        i.max_stock_level,
        i.last_movement_date,
        p.product_name,
        p.product_code,
        p.category,
        p.unit_price,
        p.cost_price,
        p.margin_percent,
        -- Calculate inventory value
        i.quantity_on_hand * p.cost_price AS inventory_value_cost,
        i.quantity_on_hand * p.unit_price AS inventory_value_retail,
        (i.quantity_on_hand * p.unit_price) - (i.quantity_on_hand * p.cost_price) AS potential_profit,
        -- Days since last movement
        CASE
            WHEN i.last_movement_date IS NOT NULL
            THEN EXTRACT(DAY FROM (CURRENT_DATE - DATE(i.last_movement_date)))
            ELSE NULL
        END AS days_since_last_movement
    FROM inventory i
    JOIN products p ON i.product_id = p.product_id
    WHERE p.is_active = TRUE
),
sales_velocity AS (
    SELECT
        soi.product_id,
        DATE_TRUNC('month', so.order_date) AS sales_month,
        SUM(soi.quantity) AS units_sold,
        COUNT(DISTINCT so.order_id) AS order_count,
        COUNT(DISTINCT so.customer_id) AS customer_count,
        AVG(soi.unit_price) AS avg_selling_price,
        SUM(soi.line_total) AS total_revenue
    FROM sales_order_items soi
    JOIN sales_orders so ON soi.order_id = so.order_id
    WHERE so.order_date >= CURRENT_DATE - INTERVAL '12 months'
      AND so.status IN ('delivered', 'shipped')
    GROUP BY soi.product_id, DATE_TRUNC('month', so.order_date)
),
product_sales_summary AS (
    SELECT
        sv.product_id,
        SUM(sv.units_sold) AS total_units_sold_12m,
        AVG(sv.units_sold) AS avg_monthly_sales,
        STDDEV(sv.units_sold) AS monthly_sales_stddev,
        COUNT(DISTINCT sv.sales_month) AS months_with_sales,
        MIN(sv.units_sold) AS min_monthly_sales,
        MAX(sv.units_sold) AS max_monthly_sales,
        SUM(sv.total_revenue) AS total_revenue_12m,
        AVG(sv.avg_selling_price) AS avg_selling_price,
        -- Calculate trend (using window function)
        CASE
            WHEN COUNT(*) >= 3
            THEN (MAX(CASE WHEN sv.sales_month >= CURRENT_DATE - INTERVAL '3 months' THEN sv.units_sold ELSE 0 END) -
                  AVG(CASE WHEN sv.sales_month < CURRENT_DATE - INTERVAL '3 months' THEN sv.units_sold ELSE 0 END))
            ELSE 0
        END AS sales_trend
    FROM sales_velocity sv
    GROUP BY sv.product_id
),
inventory_analysis AS (
    SELECT
        im.*,
        COALESCE(pss.total_units_sold_12m, 0) AS total_units_sold_12m,
        COALESCE(pss.avg_monthly_sales, 0) AS avg_monthly_sales,
        COALESCE(pss.monthly_sales_stddev, 0) AS monthly_sales_stddev,
        COALESCE(pss.months_with_sales, 0) AS months_with_sales,
        COALESCE(pss.total_revenue_12m, 0) AS total_revenue_12m,
        COALESCE(pss.avg_selling_price, 0) AS avg_selling_price,
        COALESCE(pss.sales_trend, 0) AS sales_trend,
        -- Calculate days of inventory
        CASE
            WHEN COALESCE(pss.avg_monthly_sales, 0) > 0
            THEN ROUND((im.quantity_on_hand::DECIMAL / (pss.avg_monthly_sales / 30)), 1)
            ELSE NULL
        END AS days_of_inventory,
        -- Calculate reorder recommendation
        CASE
        WHEN im.quantity_available <= im.reorder_point THEN 'Reorder Now'
        WHEN im.quantity_available <= im.reorder_point * 1.5 THEN 'Reorder Soon'
        WHEN im.quantity_available >= im.max_stock_level * 0.9 THEN 'Overstocked'
        ELSE 'Stock OK'
        END AS reorder_status,
        -- Turnover rate
        CASE
            WHEN im.inventory_value_cost > 0 AND pss.total_revenue_12m > 0
            THEN ROUND(pss.total_revenue_12m / im.inventory_value_cost, 2)
            ELSE 0
        END AS inventory_turnover_rate
    FROM inventory_movements im
    LEFT JOIN product_sales_summary pss ON im.product_id = pss.product_id
)
SELECT
    ia.inventory_id,
    ia.company_id,
    ia.product_id,
    ia.product_name,
    ia.product_code,
    ia.category,
    ia.warehouse_location,
    ia.quantity_on_hand,
    ia.quantity_reserved,
    ia.quantity_available,
    ia.reorder_point,
    ia.max_stock_level,
    ia.unit_price,
    ia.cost_price,
    ia.margin_percent,
    ia.inventory_value_cost,
    ia.inventory_value_retail,
    ia.potential_profit,
    ia.days_since_last_movement,
    -- Sales metrics
    ia.total_units_sold_12m,
    ia.avg_monthly_sales,
    ia.monthly_sales_stddev,
    ia.months_with_sales,
    ia.total_revenue_12m,
    ia.avg_selling_price,
    ia.sales_trend,
    -- Calculated metrics
    ia.days_of_inventory,
    ia.reorder_status,
    ia.inventory_turnover_rate,
    -- Risk indicators
    CASE
        WHEN ia.quantity_available <= 0 THEN 'Critical - Out of Stock'
        WHEN ia.quantity_available <= ia.reorder_point THEN 'High - Below Reorder Point'
        WHEN ia.days_of_inventory IS NOT NULL AND ia.days_of_inventory < 7 THEN 'High - Low Days of Inventory'
        WHEN ia.days_since_last_movement > 90 THEN 'Medium - Slow Moving'
        WHEN ia.quantity_available >= ia.max_stock_level THEN 'Medium - Overstocked'
        WHEN ia.inventory_turnover_rate < 2 THEN 'Medium - Low Turnover'
        ELSE 'Low Risk'
    END AS risk_level,
    -- ABC classification
    CASE
        WHEN ia.inventory_value_cost >= (SELECT PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY inventory_value_cost) FROM inventory_analysis WHERE company_id = ia.company_id)
        THEN 'A - High Value'
        WHEN ia.inventory_value_cost >= (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY inventory_value_cost) FROM inventory_analysis WHERE company_id = ia.company_id)
        THEN 'B - Medium Value'
        ELSE 'C - Low Value'
    END AS abc_classification,
    -- Window functions for category analysis
    SUM(ia.inventory_value_cost) OVER (PARTITION BY ia.category) AS category_total_value,
    AVG(ia.inventory_turnover_rate) OVER (PARTITION BY ia.category) AS category_avg_turnover,
    RANK() OVER (PARTITION BY ia.category ORDER BY ia.inventory_value_cost DESC) AS value_rank_in_category,
    PERCENT_RANK() OVER (PARTITION BY ia.company_id ORDER BY ia.inventory_value_cost) AS value_percentile_in_company
FROM inventory_analysis ia
ORDER BY ia.inventory_value_cost DESC, ia.risk_level, ia.product_name;
