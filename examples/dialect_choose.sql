-- Dialect switch action smoke tests (U6)
-- Run one block at a time in SQL Flow and confirm the hints panel shows
-- the expected "Switch to <dialect>" action button.
-- Note: avoid syntax that triggers auto-retry; after auto-retry, mismatch warnings
-- are suppressed because parsing already switched to the inferred dialect.

-- 1) Snowflake signal
-- Start dialect: MySQL
-- Expect button: Switch to Snowflake
SELECT payload:items:sku FROM orders;

-- 2) BigQuery signal
-- Start dialect: PostgreSQL
-- Expect button: Switch to BigQuery
SELECT STRUCT(1) AS s FROM orders;

-- 3) PostgreSQL signal
-- Start dialect: MySQL
-- Expect button: Switch to PostgreSQL
SELECT payload->>'sku' AS sku FROM orders;

-- 4) MySQL signal
-- Start dialect: PostgreSQL
-- Expect button: Switch to MySQL
SELECT 1 FROM DUAL;

-- 5) SQL Server (TransactSQL) signal
-- Start dialect: PostgreSQL
-- Expect button: Switch to TransactSQL
SELECT TOP(5) id FROM orders;

-- 6) Oracle signal
-- Start dialect: MySQL
-- Expect button: Switch to Oracle
SELECT NVL(amount, 0) AS amount FROM orders;

-- 7) Teradata signal
-- Start dialect: MySQL
-- Expect button: Switch to Teradata
SELECT HASHROW(customer_id) AS hash_value FROM orders;
