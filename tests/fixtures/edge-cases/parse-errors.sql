-- Edge case: Parse errors mixed with valid queries

-- Valid query 1
SELECT * FROM users;

-- Invalid query (syntax error)
SELEC * FORM users;

-- Valid query 2
SELECT * FROM orders;

-- Invalid query (incomplete)
SELECT * FROM;

-- Valid query 3
SELECT id, name FROM customers WHERE active = 1;

-- Invalid query (unknown keyword)
SELECTT * FROM products;

-- Valid query 4
SELECT COUNT(*) FROM users GROUP BY department;
