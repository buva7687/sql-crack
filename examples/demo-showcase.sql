-- ============================================================
-- SQL Crack - Complete Feature Showcase
-- ============================================================
-- Dialect: PostgreSQL / Snowflake
-- This comprehensive demo file showcases ALL features of the SQL Crack extension
-- in a realistic e-commerce analytics scenario.
--
-- RELATED FILES:
--   - schema-ecommerce.sql: Database schema definitions
--   - basic-*.sql: Individual SQL feature examples
--   - lineage-*.sql: Column lineage and data pipeline examples
--   - quality-*.sql: Performance hints and code warnings
--   - analytics-*.sql: Business analytics queries
--
-- SCENARIO: Analyzing customer behavior, order patterns, and product performance
-- for a multi-region e-commerce platform.
--
-- FEATURES DEMONSTRATED:
-- 
-- Phase 1 - Interactive Navigation:
--   ✅ Click nodes to jump to SQL (all nodes)
--   ✅ Click edges to view JOIN/WHERE conditions
--   ✅ Breadcrumb navigation through nested CTEs
--   ✅ Enhanced tooltips with SQL fragments
--   ✅ Read vs Write badges (blue READ, red WRITE)
--
-- Phase 2 - Developer Productivity & Quality:
--   ✅ Advanced SQL annotations (warnings for issues)
--   ✅ Query complexity insights with breakdown
--   ✅ Column lineage (click output columns to trace)
--   ✅ CTE cloud expansion (double-click to expand)
--   ✅ Independent pan/zoom within clouds
--
-- Phase 3 - Static Performance Analysis:
--   ✅ Filter pushdown detection (⬆ icon)
--   ✅ Non-sargable expressions (🚫 icon)
--   ✅ Repeated table scans (🔄 icon)
--   ✅ Index suggestions (📇 icon)
--   ✅ Subquery to JOIN conversion hints
--   ✅ Performance score (0-100)
--
-- Additional Features:
--   ✅ Multi-query support (Q1, Q2, Q3 tabs)
--   ✅ Operation type badges (INSERT, UPDATE, DELETE)
--   ✅ Complex JOIN visualization with Venn diagrams
--   ✅ Window functions and aggregations
--   ✅ CASE statements and unions
-- ============================================================

-- ============================================================
-- QUERY 1: Customer Lifecycle Analysis
-- Demonstrates: CTEs, JOINs, aggregations, window functions, CASE statements
-- ============================================================

WITH 
-- CTE 1: Customer registration and first purchase
customer_journey AS (
    SELECT 
        c.customer_id,
        c.customer_name,
        c.email,
        c.region,
        c.registration_date,
        MIN(o.order_date) AS first_purchase_date,
        COUNT(DISTINCT o.order_id) AS total_orders,
        SUM(o.total_amount) AS lifetime_value,
        -- Window function for customer ranking
        RANK() OVER (PARTITION BY c.region ORDER BY SUM(o.total_amount) DESC) AS regional_rank
    FROM customers c
    LEFT JOIN orders o ON c.customer_id = o.customer_id
    WHERE c.registration_date >= '2024-01-01'
        AND c.status = 'active'  -- 🚫 Non-sargable if status is computed column
    GROUP BY c.customer_id, c.customer_name, c.email, c.region, c.registration_date
),

-- CTE 2: Customer segments based on behavior
customer_segments AS (
    SELECT 
        customer_id,
        customer_name,
        region,
        first_purchase_date,
        total_orders,
        lifetime_value,
        regional_rank,
        -- CASE statement for segmentation
        CASE 
            WHEN lifetime_value > 10000 THEN 'Platinum'
            WHEN lifetime_value > 5000 THEN 'Gold'
            WHEN lifetime_value > 1000 THEN 'Silver'
            WHEN total_orders > 1 THEN 'Bronze'
            ELSE 'New'
        END AS customer_tier,
        -- CASE statement for engagement
        CASE 
            WHEN DATEDIFF('2024-12-31', first_purchase_date) <= 30 THEN 'New Customer'
            WHEN DATEDIFF('2024-12-31', first_purchase_date) <= 90 THEN 'Recent Customer'
            ELSE 'Established Customer'
        END AS engagement_level
    FROM customer_journey
),

-- CTE 3: Regional performance metrics
regional_metrics AS (
    SELECT 
        region,
        COUNT(*) AS total_customers,
        SUM(lifetime_value) AS regional_revenue,
        AVG(lifetime_value) AS avg_customer_value,
        MAX(regional_rank) AS rank_count
    FROM customer_segments
    GROUP BY region
),

-- CTE 4: High-value customers (unused CTE - demonstrates warning badge)
high_value_customers AS (
    SELECT 
        customer_id,
        customer_name,
        lifetime_value,
        region
    FROM customer_segments
    WHERE customer_tier IN ('Platinum', 'Gold')
    -- This CTE is defined but never used - shows unused CTE warning
)

-- Main query: Customer lifecycle report
SELECT 
    cs.customer_id,
    cs.customer_name,
    cs.region,
    cs.first_purchase_date,
    cs.total_orders,
    cs.lifetime_value,
    cs.regional_rank,
    cs.customer_tier,
    cs.engagement_level,
    rm.total_customers AS regional_customer_count,
    rm.regional_revenue,
    ROUND(cs.lifetime_value / rm.regional_revenue * 100, 2) AS revenue_contribution_pct,
    -- Dead columns (never used) - demonstrate dead column detection
    cs.email AS contact_email,  -- Dead column
    rm.avg_customer_value      -- Dead column
FROM customer_segments cs
JOIN regional_metrics rm ON cs.region = rm.region
WHERE cs.total_orders > 0
ORDER BY cs.regional_rank
LIMIT 100;

-- ============================================================
-- QUERY 2: Product Performance Analysis
-- Demonstrates: Complex JOINs, subqueries, filter pushdown, index suggestions
-- ============================================================

SELECT 
    p.product_id,
    p.product_name,
    p.category,
    p.brand,
    p.price,
    -- Subquery for total sales (could be a JOIN - shows subquery hint)
    (SELECT COUNT(*) 
     FROM order_items oi 
     WHERE oi.product_id = p.product_id) AS order_count,
    -- Subquery for revenue (repeated table scan - shows 🔄 icon)
    (SELECT SUM(oi.quantity * oi.unit_price)
     FROM order_items oi 
     WHERE oi.product_id = p.product_id) AS total_revenue,
    -- Subquery for average rating (repeated scan)
    (SELECT AVG(r.rating)
     FROM reviews r
     WHERE r.product_id = p.product_id) AS avg_rating,
    -- Join with inventory (demonstrates JOIN visualization)
    i.stock_quantity,
    i.reorder_level,
    CASE 
        WHEN i.stock_quantity <= i.reorder_level THEN 'Low Stock'
        WHEN i.stock_quantity <= i.reorder_level * 2 THEN 'Medium Stock'
        ELSE 'In Stock'
    END AS stock_status
FROM products p
LEFT JOIN inventory i ON p.product_id = i.product_id
WHERE p.category = 'Electronics'  -- 📇 Index suggestion on category
    AND p.active = 1  -- 📇 Index suggestion on active flag
    -- Filter after JOIN - could be pushed down (shows ⬆ icon)
    AND i.stock_quantity > 0
ORDER BY total_revenue DESC;

-- ============================================================
-- QUERY 3: Monthly Revenue Trend with Year-over-Year Comparison
-- Demonstrates: Window functions, multiple aggregations, complex expressions
-- ============================================================

SELECT 
    -- Date truncation for grouping
    DATE_TRUNC('month', o.order_date) AS month,
    -- Current year metrics
    SUM(CASE 
        WHEN EXTRACT(YEAR FROM o.order_date) = 2024
        THEN o.total_amount 
        ELSE 0 
    END) AS revenue_2024,
    COUNT(CASE 
        WHEN EXTRACT(YEAR FROM o.order_date) = 2024
        THEN o.order_id 
        ELSE NULL 
    END) AS orders_2024,
    -- Previous year metrics
    SUM(CASE 
        WHEN EXTRACT(YEAR FROM o.order_date) = 2023
        THEN o.total_amount 
        ELSE 0 
    END) AS revenue_2023,
    COUNT(CASE 
        WHEN EXTRACT(YEAR FROM o.order_date) = 2023
        THEN o.order_id 
        ELSE NULL 
    END) AS orders_2023,
    -- Year-over-year growth
    ROUND(
        (SUM(CASE WHEN EXTRACT(YEAR FROM o.order_date) = 2024 THEN o.total_amount ELSE 0 END) -
         SUM(CASE WHEN EXTRACT(YEAR FROM o.order_date) = 2023 THEN o.total_amount ELSE 0 END)) *
        100.0 /
        NULLIF(SUM(CASE WHEN EXTRACT(YEAR FROM o.order_date) = 2023 THEN o.total_amount ELSE 0 END), 0),
        2
    ) AS yoy_growth_pct,
    -- Window functions for running totals
    SUM(SUM(CASE WHEN EXTRACT(YEAR FROM o.order_date) = 2024 THEN o.total_amount ELSE 0 END)) 
        OVER (ORDER BY DATE_TRUNC('month', o.order_date) 
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total_2024
FROM orders o
WHERE o.order_date >= DATE '2023-01-01'  -- 📇 Index suggestion on order_date
    AND o.status IN ('completed', 'processed')
GROUP BY DATE_TRUNC('month', o.order_date)
ORDER BY month;

-- ============================================================
-- QUERY 4: Upsell Opportunities - Customer Product Recommendations
-- Demonstrates: Self-joins, EXISTS subqueries, correlated subqueries
-- ============================================================

SELECT DISTINCT
    c.customer_id,
    c.customer_name,
    c.email,
    o.order_id,
    p1.product_id AS purchased_product_id,
    p1.product_name AS purchased_product,
    p2.product_id AS recommended_product_id,
    p2.product_name AS recommended_product,
    p2.category AS recommended_category,
    -- Correlated subquery for recommendation confidence
    (SELECT COUNT(*) 
     FROM order_items oi2
     JOIN order_items oi3 ON oi2.order_id = oi3.order_id
     WHERE oi2.product_id = p1.product_id 
       AND oi3.product_id = p2.product_id) AS purchase_frequency,
    -- EXISTS subquery for availability check
    EXISTS (
        SELECT 1 
        FROM inventory i
        WHERE i.product_id = p2.product_id
          AND i.stock_quantity > 0
    ) AS in_stock
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
JOIN order_items oi1 ON o.order_id = oi1.order_id
JOIN products p1 ON oi1.product_id = p1.product_id
-- Self-join to find products frequently bought together
JOIN order_items oi2 ON o.order_id = oi2.order_id
JOIN products p2 ON oi2.product_id = p2.product_id
WHERE p1.product_id != p2.product_id
    AND p2.category = p1.category  -- Same category recommendations
    AND o.order_date >= '2024-01-01'
ORDER BY c.customer_id, purchase_frequency DESC;

-- ============================================================
-- QUERY 5: Inventory Optimization - Reorder Analysis
-- Demonstrates: UNION, multiple CTEs, write operation simulation
-- ============================================================

WITH 
-- Products needing reorder based on stock level
low_stock_products AS (
    SELECT 
        p.product_id,
        p.product_name,
        p.category,
        i.stock_quantity,
        i.reorder_level,
        i.reorder_quantity,
        -- Calculate days until stockout
        FLOOR(i.stock_quantity / (
            SELECT COALESCE(AVG(oi.quantity), 0)
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.order_id
            WHERE oi.product_id = p.product_id
              AND o.order_date >= DATE('now', '-30 days')
        )) AS days_until_stockout
    FROM products p
    JOIN inventory i ON p.product_id = i.product_id
    WHERE i.stock_quantity <= i.reorder_level
),

-- Products with high recent demand (unused - demonstrates warning)
high_demand_products AS (
    SELECT 
        p.product_id,
        p.product_name,
        SUM(oi.quantity) AS monthly_demand
    FROM products p
    JOIN order_items oi ON p.product_id = oi.product_id
    JOIN orders o ON oi.order_id = o.order_id
    WHERE o.order_date >= DATE('now', '-30 days')
    GROUP BY p.product_id, p.product_name
    -- Unused CTE
)

-- Main analysis with UNION for different scenarios
SELECT 
    product_id,
    product_name,
    category,
    stock_quantity,
    reorder_level,
    days_until_stockout,
    'Urgent Reorder' AS reorder_priority,
    reorder_quantity * 2 AS suggested_order_qty
FROM low_stock_products
WHERE days_until_stockout <= 7

UNION ALL

SELECT 
    product_id,
    product_name,
    category,
    stock_quantity,
    reorder_level,
    days_until_stockout,
    'Planned Reorder' AS reorder_priority,
    reorder_quantity AS suggested_order_qty
FROM low_stock_products
WHERE days_until_stockout > 7 AND days_until_stockout <= 30

ORDER BY days_until_stockout ASC;

-- ============================================================
-- QUERY 6: Customer Churn Risk Analysis
-- Demonstrates: Complex aggregations, HAVING clause, multiple JOINs
-- ============================================================

SELECT 
    c.customer_id,
    c.customer_name,
    c.email,
    c.region,
    MAX(o.order_date) AS last_order_date,
    DATE_DIFF('day', MAX(o.order_date), DATE '2024-12-31') AS days_since_last_order,
    COUNT(DISTINCT o.order_id) AS total_orders,
    SUM(o.total_amount) AS total_spent,
    AVG(o.total_amount) AS avg_order_value,
    -- Churn risk calculation
    CASE 
        WHEN DATE_DIFF('day', MAX(o.order_date), DATE '2024-12-31') > 180 THEN 'High Risk'
        WHEN DATE_DIFF('day', MAX(o.order_date), DATE '2024-12-31') > 90 THEN 'Medium Risk'
        WHEN DATE_DIFF('day', MAX(o.order_date), DATE '2024-12-31') > 60 THEN 'Low Risk'
        ELSE 'Active'
    END AS churn_risk_level,
    -- Customer segment
    CASE 
        WHEN COUNT(DISTINCT o.order_id) > 10 THEN 'Loyal'
        WHEN COUNT(DISTINCT o.order_id) > 5 THEN 'Regular'
        WHEN COUNT(DISTINCT o.order_id) > 1 THEN 'Occasional'
        ELSE 'One-time Buyer'
    END AS purchase_frequency
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE c.registration_date < '2024-06-01'
GROUP BY c.customer_id, c.customer_name, c.email, c.region
-- HAVING clause for filtering aggregated results
HAVING COUNT(DISTINCT o.order_id) >= 1
    AND SUM(o.total_amount) > 0
ORDER BY days_since_last_order DESC, total_spent DESC;

-- ============================================================
-- QUERY 7: Update High-Value Customer Status (WRITE operation)
-- Demonstrates: UPDATE with JOIN, operation badge (red WRITE)
-- ============================================================

UPDATE customer_segments
SET tier = 'Platinum',
    benefits = 'Free shipping, priority support, exclusive access',
    last_updated = CURRENT_TIMESTAMP
WHERE customer_id IN (
    -- Subquery to identify new platinum customers
    SELECT cs.customer_id
    FROM customer_segments cs
    JOIN (
        -- CTE for high-value calculation
        SELECT 
            customer_id,
            SUM(total_amount) AS lifetime_value
        FROM orders
        WHERE order_date >= '2024-01-01'
        GROUP BY customer_id
        HAVING SUM(total_amount) > 10000
    ) high_value ON cs.customer_id = high_value.customer_id
    WHERE cs.tier != 'Platinum'
);

-- ============================================================
-- QUERY 8: Delete Stale Test Data (WRITE operation)
-- Demonstrates: DELETE with WHERE clause, operation badge (red DELETE)
-- ============================================================

DELETE FROM test_orders
WHERE created_at < CURRENT_DATE - INTERVAL '90 days'
    AND status = 'test'
    -- Missing WHERE clause warning - this query has proper WHERE
    AND tester_id IN (
        SELECT user_id 
        FROM test_users 
        WHERE account_status = 'inactive'
    );

-- ============================================================
-- QUERY 9: Insert Daily Sales Summary (WRITE operation)
-- Demonstrates: INSERT ... SELECT, operation badge (green INSERT)
-- ============================================================

INSERT INTO daily_sales_summary (
    report_date,
    total_orders,
    total_revenue,
    unique_customers,
    avg_order_value,
    top_selling_category,
    created_at
)
SELECT 
    CURRENT_DATE AS report_date,
    COUNT(DISTINCT o.order_id) AS total_orders,
    SUM(o.total_amount) AS total_revenue,
    COUNT(DISTINCT o.customer_id) AS unique_customers,
    AVG(o.total_amount) AS avg_order_value,
    -- Subquery to find top category
    (SELECT p.category
     FROM order_items oi
     JOIN products p ON oi.product_id = p.product_id
     WHERE oi.order_id = o.order_id
     GROUP BY p.category
     ORDER BY SUM(oi.quantity * oi.unit_price) DESC
     LIMIT 1) AS top_selling_category,
    CURRENT_TIMESTAMP AS created_at
FROM orders o
WHERE o.order_date >= CURRENT_DATE
    AND o.status IN ('completed', 'processed');

-- ============================================================
-- QUERY 10: Unified Support Ticket Metrics (CTE with 3-way UNION)
-- Demonstrates: UNION convergence inside CTEs, subquery wrapping,
--   GROUP BY + aggregates connected downstream of UNION
-- ============================================================

WITH ticket_volume AS (
    SELECT
        t.priority,
        a.team_name,
        a.skill_level,
        COUNT(*) AS ticket_count,
        AVG(t.resolution_hours) AS avg_resolution_hrs,
        SUM(CASE WHEN t.reopened = 1 THEN 1 ELSE 0 END) AS reopen_count
    FROM (
        -- Phone tickets
        SELECT
            ph.ticket_id, ph.created_at, ph.priority, ph.agent_id,
            ph.resolution_hours, ph.reopened, ph.satisfaction_score
        FROM phone_tickets ph
        JOIN call_logs cl ON ph.ticket_id = cl.ticket_id
        WHERE cl.duration_seconds > 30

        UNION

        -- Email tickets
        SELECT
            em.ticket_id, em.received_at, em.priority, em.assigned_agent_id,
            em.resolution_hours, em.reopened, em.csat_rating
        FROM email_tickets em
        LEFT JOIN spam_filter sf ON em.ticket_id = sf.ticket_id
        WHERE sf.ticket_id IS NULL

        UNION

        -- Chat tickets
        SELECT
            ch.session_id, ch.started_at, ch.urgency, ch.handler_id,
            ch.time_to_resolve_hrs, ch.was_reopened, ch.feedback_score
        FROM live_chat_sessions ch
        JOIN chat_transcripts ct ON ch.session_id = ct.session_id
        WHERE ct.message_count >= 3
    ) t
    JOIN agents a ON a.agent_id = t.agent_id
    WHERE t.created_at >= '2024-01-01'
    GROUP BY t.priority, a.team_name, a.skill_level
)
SELECT
    tv.team_name,
    tv.priority,
    tv.skill_level,
    tv.ticket_count,
    ROUND(tv.avg_resolution_hrs, 1) AS avg_hours,
    tv.reopen_count,
    ROUND(tv.reopen_count * 100.0 / NULLIF(tv.ticket_count, 0), 1) AS reopen_pct,
    tg.target_hours,
    CASE
        WHEN tv.avg_resolution_hrs <= tg.target_hours THEN 'Meeting SLA'
        WHEN tv.avg_resolution_hrs <= tg.target_hours * 1.5 THEN 'At Risk'
        ELSE 'Breaching SLA'
    END AS sla_status
FROM ticket_volume tv
JOIN team_goals tg ON tv.team_name = tg.team_name AND tv.priority = tg.priority
ORDER BY tv.reopen_count DESC, tv.avg_resolution_hrs DESC
LIMIT 50;

-- ============================================================
-- QUERY 11: Course Enrollment Funnel with CTE-to-CTE UNION
-- Demonstrates: Multiple CTEs merged via UNION, recursive CTE
--   with UNION ALL, cross-CTE convergence
-- ============================================================

WITH
-- Semester windows
semesters AS (
    SELECT 'Fall 2024' AS term, CAST('2024-09-01' AS date) AS start_dt, CAST('2024-12-15' AS date) AS end_dt
    UNION
    SELECT 'Spring 2025' AS term, CAST('2025-01-15' AS date) AS start_dt, CAST('2025-05-30' AS date) AS end_dt
),

-- Students who enrolled through the main application portal
portal_enrollments AS (
    SELECT
        s.student_id,
        s.full_name,
        s.gpa,
        dept.department_name,
        c.course_code,
        c.credits,
        sem.term,
        'Portal' AS enrollment_source
    FROM students s
    JOIN applications app ON s.student_id = app.student_id
    JOIN courses c ON app.course_id = c.course_id
    JOIN departments dept ON c.department_id = dept.department_id
    JOIN semesters sem ON app.submitted_at BETWEEN sem.start_dt AND sem.end_dt
    WHERE app.status = 'confirmed'
      AND s.gpa >= 2.0
),

-- Students enrolled via advisor override (waitlist, late add, special permission)
advisor_overrides AS (
    SELECT
        s.student_id,
        s.full_name,
        s.gpa,
        dept.department_name,
        c.course_code,
        c.credits,
        sem.term,
        'Advisor Override' AS enrollment_source
    FROM students s
    JOIN override_requests ovr ON s.student_id = ovr.student_id
    JOIN advisors adv ON ovr.advisor_id = adv.advisor_id
    JOIN courses c ON ovr.course_id = c.course_id
    JOIN departments dept ON c.department_id = dept.department_id
    JOIN semesters sem ON ovr.approved_at BETWEEN sem.start_dt AND sem.end_dt
    WHERE ovr.decision = 'approved'
),

-- Combine both enrollment paths
all_enrollments AS (
    SELECT * FROM portal_enrollments
    UNION
    SELECT * FROM advisor_overrides
    WHERE student_id NOT IN (
        SELECT DISTINCT student_id FROM portal_enrollments
        WHERE course_code = advisor_overrides.course_code
    )
),

-- Build prerequisite chains (recursive)
prereq_chain AS (
    -- Direct prerequisites
    SELECT
        c.course_code,
        p.prereq_code,
        pc.course_name AS prereq_name,
        1 AS chain_depth
    FROM courses c
    JOIN prerequisites p ON c.course_id = p.course_id
    JOIN courses pc ON p.prereq_course_id = pc.course_id

    UNION ALL

    -- Transitive prerequisites
    SELECT
        ch.course_code,
        p.prereq_code,
        pc.course_name AS prereq_name,
        ch.chain_depth + 1 AS chain_depth
    FROM prereq_chain ch
    JOIN prerequisites p ON ch.prereq_code = p.course_code
    JOIN courses pc ON p.prereq_course_id = pc.course_id
    WHERE ch.chain_depth < 4
)

SELECT
    ae.term,
    ae.department_name,
    ae.course_code,
    ae.full_name,
    ae.gpa,
    ae.credits,
    ae.enrollment_source,
    COUNT(pc.prereq_code) AS prereq_depth,
    STRING_AGG(pc.prereq_name, ' → ' ORDER BY pc.chain_depth) AS prereq_path
FROM all_enrollments ae
LEFT JOIN prereq_chain pc ON ae.course_code = pc.course_code
GROUP BY ae.term, ae.department_name, ae.course_code,
         ae.full_name, ae.gpa, ae.credits, ae.enrollment_source
ORDER BY ae.department_name, ae.course_code, ae.full_name;

-- ============================================================
-- END OF DEMO SHOWCASE
-- ============================================================
-- 
-- TIPS FOR DEMO:
-- 
-- 1. Start with Query 1 (Customer Lifecycle) to show:
--    - Multiple CTEs with cloud expansion
--    - Click any node to jump to its definition
--    - Click edges to see JOIN conditions
--    - Use breadcrumb to navigate CTE hierarchy
--    - Hover over nodes for detailed tooltips
--
-- 2. Show Query 2 (Product Performance) for:
--    - Complex JOIN visualization with Venn diagrams
--    - Repeated table scan warnings (🔄 icon)
--    - Index suggestions (📇 icon)
--    - Filter pushdown hints (⬆ icon)
--
-- 3. Show Query 3 (Revenue Trend) for:
--    - Window functions visualization
--    - Multiple aggregations
--    - Complex expressions
--
-- 4. Show Query 4 (Recommendations) for:
--    - Self-joins
--    - EXISTS subqueries
--    - Correlated subqueries
--
-- 5. Show Query 7, 8, 9 for:
--    - WRITE operation badges (red for UPDATE/DELETE, green for INSERT)
--    - Operation type badges
--
-- 5b. Show Query 10 (Multi-Channel Sales) for:
--    - 3-way UNION convergence inside a CTE cloud
--    - FROM subquery wrapping with GROUP BY connected downstream
--    - Click child nodes inside the CTE cloud to see their details
--
-- 5c. Show Query 11 (Entity Hierarchy) for:
--    - CTE-to-CTE UNION (merging two issuer CTEs)
--    - Recursive CTE with UNION ALL
--    - Deep CTE chain with cross-references
--
-- 6. Use keyboard shortcuts:
--    - Press 'Q' to toggle query stats panel
--    - Press 'C' to enable column lineage mode
--    - Press 'L' to toggle legend
--    - Press 'H' to switch layout (vertical/horizontal)
--    - Press 'E' to expand/collapse all CTEs
--
-- 7. Demonstrate workspace analysis:
--    - Use all files in examples/ folder
--    - Right-click → "Analyze Workspace Dependencies"
--    - Show cross-file relationships with schema-ecommerce.sql
--    - Use Lineage tab to trace upstream/downstream
--
-- 8. For specific feature demos, use:
--    - basic-joins.sql: All JOIN types
--    - basic-ctes.sql: CTE patterns and recursion
--    - basic-window-functions.sql: Window function examples
--    - lineage-column-tracking.sql: Column lineage tracing
--    - quality-performance-hints.sql: Performance anti-patterns
--    - quality-code-warnings.sql: Code quality issues
--
-- ============================================================
