-- ============================================================
-- Oracle Simple Examples
-- ============================================================
-- Dialect: Oracle
-- Focus: Basic Oracle syntax features
--
-- Tests:
--   1) (+) outer join operator (preprocessed)
--   2) MINUS set operator (rewritten to EXCEPT)
--   3) ROWNUM pseudocolumn
--   4) NVL/DECODE functions
--   5) SYSDATE
--   6) Sequence references (NEXTVAL/CURRVAL)
-- ============================================================

-- Q1: (+) outer join operator
SELECT 
    e.employee_id,
    e.first_name,
    e.last_name,
    d.department_name
FROM employees e, departments d
WHERE e.department_id(+) = d.department_id;

-- Q2: MINUS operator (Oracle-specific, rewritten to EXCEPT)
SELECT employee_id FROM employees
MINUS
SELECT employee_id FROM terminated_employees;

-- Q3: ROWNUM for pagination
SELECT 
    employee_id,
    first_name,
    salary
FROM employees
WHERE ROWNUM <= 10
ORDER BY salary DESC;

-- Q4: NVL function
SELECT 
    employee_id,
    first_name,
    NVL(commission_pct, 0) AS commission
FROM employees;

-- Q5: DECODE function
SELECT 
    employee_id,
    first_name,
    DECODE(department_id, 
        10, 'Admin',
        20, 'Marketing',
        30, 'Sales',
        'Other'
    ) AS dept_name
FROM employees;

-- Q6: SYSDATE
SELECT 
    employee_id,
    hire_date,
    SYSDATE - hire_date AS days_employed
FROM employees;

-- Q7: Sequence NEXTVAL in INSERT
INSERT INTO employees (employee_id, first_name, last_name)
VALUES (employees_seq.NEXTVAL, 'John', 'Doe');

-- Q8: Multiple Oracle features combined
SELECT 
    e.employee_id,
    e.first_name,
    e.last_name,
    d.department_name,
    NVL(e.manager_id, 0) AS manager_id,
    DECODE(e.status, 'A', 'Active', 'I', 'Inactive', 'Unknown') AS status
FROM employees e, departments d
WHERE e.department_id(+) = d.department_id
AND ROWNUM <= 5;
