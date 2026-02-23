-- ============================================================
-- Oracle Complex Examples
-- ============================================================
-- Dialect: Oracle
-- Focus: Hierarchical queries (CONNECT BY), complex joins, 
--        analytics, and Oracle-specific patterns
--
-- Tests:
--   1) CONNECT BY hierarchical queries (stripped by preprocessing)
--   2) Complex subqueries with Oracle functions
--   3) Multiple set operations
--   4) Inline views with ROWNUM
--   5) Complex NVL/DECODE nesting
--   6) Multiple (+) join operators
-- ============================================================

-- Q1: CONNECT BY hierarchical query (preprocessed - stripped)
SELECT 
    employee_id,
    first_name,
    last_name,
    manager_id,
    LEVEL
FROM employees
START WITH manager_id IS NULL
CONNECT BY PRIOR employee_id = manager_id;

-- Q2: CONNECT BY with ORDER SIBLINGS BY
SELECT 
    employee_id,
    first_name,
    last_name,
    salary
FROM employees
START WITH manager_id IS NULL
CONNECT BY PRIOR employee_id = manager_id
ORDER SIBLINGS BY last_name;

-- Q3: Complex inline view with ROWNUM
SELECT 
    outer_query.employee_id,
    outer_query.first_name,
    outer_query.salary,
    outer_query.dept_rank
FROM (
    SELECT 
        employee_id,
        first_name,
        salary,
        department_id,
        ROWNUM AS dept_rank
    FROM (
        SELECT 
            employee_id,
            first_name,
            salary,
            department_id
        FROM employees
        ORDER BY salary DESC
    )
    WHERE department_id = 50
) outer_query
WHERE outer_query.dept_rank <= 3;

-- Q4: Multiple (+) outer joins
SELECT 
    e.employee_id,
    e.first_name,
    d.department_name,
    l.location_name,
    c.country_name
FROM employees e, departments d, locations l, countries c
WHERE e.department_id(+) = d.department_id
AND d.location_id(+) = l.location_id
AND l.country_id(+) = c.country_id;

-- Q5: MINUS and UNION combined (MINUS rewritten to EXCEPT)
SELECT employee_id, first_name, salary FROM employees WHERE salary > 5000
MINUS
SELECT employee_id, first_name, salary FROM contractors WHERE rate > 50
UNION ALL
SELECT employee_id, first_name, salary FROM interns;

-- Q6: Nested DECODE with NVL
SELECT 
    employee_id,
    first_name,
    DECODE(
        NVL(job_id, 'N/A'),
        'IT_PROG', 'Technology',
        'SA_MAN', 'Sales Management',
        'ST_CLERK', 'Clerical',
        DECODE(
            SUBSTR(job_id, 1, 2),
            'AD', 'Administration',
            'FI', 'Finance',
            'MK', 'Marketing',
            'Other Department'
        )
    ) AS department_category,
    NVL(commission_pct, 0) * NVL(salary, 0) AS total_compensation
FROM employees;

-- Q7: Correlated subquery with ROWNUM
SELECT 
    d.department_name,
    (
        SELECT COUNT(*) 
        FROM employees e 
        WHERE e.department_id = d.department_id
    ) AS employee_count,
    (
        SELECT MAX(e.salary) 
        FROM employees e 
        WHERE e.department_id = d.department_id
    ) AS max_salary
FROM departments d
WHERE ROWNUM <= 10;

-- Q8: Complex WITH clause (CTE) + CONNECT BY
WITH dept_hierarchy AS (
    SELECT 
        department_id,
        department_name,
        manager_id,
        LEVEL AS dept_level
    FROM departments
    START WITH manager_id IS NULL
    CONNECT BY PRIOR department_id = manager_id
)
SELECT 
    dh.department_id,
    dh.department_name,
    dh.dept_level,
    e.employee_id,
    e.first_name,
    e.salary
FROM dept_hierarchy dh
LEFT JOIN employees e ON dh.department_id = e.department_id
WHERE dh.dept_level <= 3
ORDER BY dh.dept_level, dh.department_name;

-- Q9: Multiple sequences in single query
SELECT 
    employees_seq.NEXTVAL AS new_employee_id,
    departments_seq.NEXTVAL AS new_dept_id,
    jobs_seq.CURRVAL AS current_job_id,
    'Created on ' || TO_CHAR(SYSDATE, 'YYYY-MM-DD') AS creation_note
FROM dual;

-- Q10: Full example combining multiple Oracle features
SELECT 
    e.employee_id,
    e.first_name || ' ' || e.last_name AS full_name,
    d.department_name,
    NVL(e.commission_pct, 0) AS comm_pct,
    DECODE(
        e.job_id,
        'AD_VP', 'Vice President',
        'IT_PROG', 'Programmer',
        'ST_MAN', 'Stock Manager',
        'Other'
    ) AS job_category,
    SYSDATE AS today,
    ROUND(MONTHS_BETWEEN(SYSDATE, e.hire_date), 1) AS months_employed
FROM employees e, departments d
WHERE e.department_id(+) = d.department_id
AND e.salary >= 3000
AND ROWNUM <= 20
ORDER BY e.salary DESC;
