-- ============================================================
-- Enterprise Database Schema - DDL
-- ============================================================
-- Comprehensive schema with 15+ tables across multiple business domains
-- Dialect: PostgreSQL / Snowflake (compatible with most SQL dialects)
-- Purpose: Testing complex SQL parsing, lineage, and visualization
-- ============================================================

-- ============================================================
-- ORGANIZATION DOMAIN
-- ============================================================

-- Companies/Organizations
CREATE TABLE companies (
    company_id INTEGER PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    industry VARCHAR(100),
    headquarters_country VARCHAR(100),
    founded_year INTEGER,
    employee_count INTEGER,
    revenue_usd DECIMAL(15, 2),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'merged', 'acquired')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Departments
CREATE TABLE departments (
    department_id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    department_name VARCHAR(200) NOT NULL,
    manager_id INTEGER,
    budget_allocated DECIMAL(12, 2),
    headcount INTEGER DEFAULT 0,
    location VARCHAR(100),
    cost_center_code VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employees
CREATE TABLE employees (
    employee_id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    department_id INTEGER REFERENCES departments(department_id),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    hire_date DATE NOT NULL,
    job_title VARCHAR(150),
    salary DECIMAL(10, 2),
    employment_type VARCHAR(30) DEFAULT 'full-time' CHECK (employment_type IN ('full-time', 'part-time', 'contract', 'intern')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'on-leave', 'terminated', 'retired')),
    manager_id INTEGER REFERENCES employees(employee_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PROJECT & TASK DOMAIN
-- ============================================================

-- Projects
CREATE TABLE projects (
    project_id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    project_name VARCHAR(255) NOT NULL,
    project_code VARCHAR(50) UNIQUE,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    budget DECIMAL(12, 2),
    status VARCHAR(30) DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on-hold', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    project_manager_id INTEGER REFERENCES employees(employee_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks
CREATE TABLE tasks (
    task_id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(project_id),
    task_name VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to INTEGER REFERENCES employees(employee_id),
    status VARCHAR(30) DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'review', 'done', 'blocked')),
    priority VARCHAR(20) DEFAULT 'medium',
    estimated_hours DECIMAL(6, 2),
    actual_hours DECIMAL(6, 2),
    due_date DATE,
    completed_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Time tracking
CREATE TABLE time_entries (
    entry_id INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(employee_id),
    project_id INTEGER REFERENCES projects(project_id),
    task_id INTEGER REFERENCES tasks(task_id),
    entry_date DATE NOT NULL,
    hours_worked DECIMAL(5, 2) NOT NULL CHECK (hours_worked > 0 AND hours_worked <= 24),
    billable BOOLEAN DEFAULT TRUE,
    description TEXT,
    approved_by INTEGER REFERENCES employees(employee_id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- FINANCIAL DOMAIN
-- ============================================================

-- Accounts
CREATE TABLE accounts (
    account_id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    account_code VARCHAR(50) UNIQUE NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    account_type VARCHAR(50) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    parent_account_id INTEGER REFERENCES accounts(account_id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions
CREATE TABLE transactions (
    transaction_id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    account_id INTEGER NOT NULL REFERENCES accounts(account_id),
    transaction_date DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('debit', 'credit')),
    description TEXT,
    reference_number VARCHAR(100),
    category VARCHAR(100),
    project_id INTEGER REFERENCES projects(project_id),
    department_id INTEGER REFERENCES departments(department_id),
    created_by INTEGER REFERENCES employees(employee_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Budgets
CREATE TABLE budgets (
    budget_id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    department_id INTEGER REFERENCES departments(department_id),
    project_id INTEGER REFERENCES projects(project_id),
    account_id INTEGER NOT NULL REFERENCES accounts(account_id),
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER CHECK (fiscal_quarter BETWEEN 1 AND 4),
    budget_amount DECIMAL(12, 2) NOT NULL,
    allocated_amount DECIMAL(12, 2) DEFAULT 0,
    remaining_amount DECIMAL(12, 2) GENERATED ALWAYS AS (budget_amount - allocated_amount) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, department_id, project_id, account_id, fiscal_year, fiscal_quarter)
);

-- ============================================================
-- SALES & CUSTOMER DOMAIN
-- ============================================================

-- Customers
CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    company_id INTEGER REFERENCES companies(company_id),
    customer_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    industry VARCHAR(100),
    customer_type VARCHAR(30) DEFAULT 'business' CHECK (customer_type IN ('business', 'individual', 'government')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'prospect')),
    credit_limit DECIMAL(12, 2),
    payment_terms INTEGER DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales opportunities
CREATE TABLE opportunities (
    opportunity_id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    customer_id INTEGER REFERENCES customers(customer_id),
    opportunity_name VARCHAR(255) NOT NULL,
    description TEXT,
    stage VARCHAR(50) DEFAULT 'prospecting' CHECK (stage IN ('prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost')),
    probability_percent INTEGER CHECK (probability_percent BETWEEN 0 AND 100),
    estimated_value DECIMAL(12, 2),
    expected_close_date DATE,
    owner_id INTEGER REFERENCES employees(employee_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales orders
CREATE TABLE sales_orders (
    order_id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    order_date DATE NOT NULL,
    status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'in-progress', 'shipped', 'delivered', 'cancelled')),
    total_amount DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    net_amount DECIMAL(12, 2) GENERATED ALWAYS AS (total_amount - discount_amount + tax_amount) STORED,
    sales_rep_id INTEGER REFERENCES employees(employee_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales order line items
CREATE TABLE sales_order_items (
    item_id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES sales_orders(order_id) ON DELETE CASCADE,
    product_id INTEGER,
    item_description VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    line_total DECIMAL(12, 2) GENERATED ALWAYS AS (quantity * unit_price * (1 - discount_percent / 100)) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INVENTORY & PRODUCTS DOMAIN
-- ============================================================

-- Products
CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    company_id INTEGER REFERENCES companies(company_id),
    product_code VARCHAR(100) UNIQUE NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    unit_price DECIMAL(10, 2) NOT NULL,
    cost_price DECIMAL(10, 2),
    margin_percent DECIMAL(5, 2) GENERATED ALWAYS AS ((unit_price - cost_price) / unit_price * 100) STORED,
    unit_of_measure VARCHAR(20) DEFAULT 'each',
    weight_kg DECIMAL(8, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory
CREATE TABLE inventory (
    inventory_id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    product_id INTEGER NOT NULL REFERENCES products(product_id),
    warehouse_location VARCHAR(100),
    quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    quantity_reserved INTEGER DEFAULT 0 CHECK (quantity_reserved >= 0),
    quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
    reorder_point INTEGER DEFAULT 10,
    max_stock_level INTEGER,
    last_count_date DATE,
    last_movement_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, product_id, warehouse_location)
);

-- ============================================================
-- ANALYTICS & REPORTING VIEWS
-- ============================================================

-- Employee performance summary
CREATE VIEW employee_performance_summary AS
SELECT
    e.employee_id,
    e.first_name || ' ' || e.last_name AS employee_name,
    e.department_id,
    d.department_name,
    e.job_title,
    COUNT(DISTINCT t.project_id) AS projects_count,
    COUNT(DISTINCT t.task_id) AS tasks_assigned,
    SUM(te.hours_worked) AS total_hours_logged,
    SUM(CASE WHEN te.billable = TRUE THEN te.hours_worked ELSE 0 END) AS billable_hours,
    AVG(CASE WHEN t.status = 'done' THEN 1.0 ELSE 0.0 END) AS completion_rate
FROM employees e
LEFT JOIN departments d ON e.department_id = d.department_id
LEFT JOIN tasks t ON t.assigned_to = e.employee_id
LEFT JOIN time_entries te ON te.employee_id = e.employee_id
WHERE e.status = 'active'
GROUP BY e.employee_id, e.first_name, e.last_name, e.department_id, d.department_name, e.job_title;

-- Project financial summary
CREATE VIEW project_financial_summary AS
SELECT
    p.project_id,
    p.project_name,
    p.project_code,
    p.status AS project_status,
    p.budget AS allocated_budget,
    COALESCE(SUM(te.hours_worked * e.salary / 2080), 0) AS labor_cost,
    COALESCE(SUM(txn.amount), 0) AS other_costs,
    COALESCE(SUM(te.hours_worked * e.salary / 2080), 0) + COALESCE(SUM(txn.amount), 0) AS total_cost,
    p.budget - (COALESCE(SUM(te.hours_worked * e.salary / 2080), 0) + COALESCE(SUM(txn.amount), 0)) AS budget_variance
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.project_id
LEFT JOIN time_entries te ON te.task_id = t.task_id
LEFT JOIN employees e ON te.employee_id = e.employee_id
LEFT JOIN transactions txn ON txn.project_id = p.project_id
GROUP BY p.project_id, p.project_name, p.project_code, p.status, p.budget;

-- Sales performance by employee
CREATE VIEW sales_performance_by_employee AS
SELECT
    e.employee_id,
    e.first_name || ' ' || e.last_name AS sales_rep_name,
    COUNT(DISTINCT so.order_id) AS total_orders,
    COUNT(DISTINCT so.customer_id) AS unique_customers,
    SUM(so.net_amount) AS total_revenue,
    AVG(so.net_amount) AS avg_order_value,
    COUNT(DISTINCT CASE WHEN so.status = 'delivered' THEN so.order_id END) AS completed_orders,
    SUM(CASE WHEN so.status = 'delivered' THEN so.net_amount ELSE 0 END) AS completed_revenue
FROM employees e
LEFT JOIN sales_orders so ON so.sales_rep_id = e.employee_id
WHERE e.status = 'active'
GROUP BY e.employee_id, e.first_name, e.last_name;
