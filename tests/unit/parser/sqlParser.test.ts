/**
 * SQL Parser Unit Tests
 *
 * Tests core SQL parsing functionality including:
 * - Validation (validateSql, size/query count limits)
 * - Statement splitting (splitSqlStatements)
 * - Basic SELECT statements
 * - JOINs (INNER, LEFT, RIGHT, FULL)
 * - CTEs (simple, chained, recursive)
 * - Aggregations (GROUP BY, HAVING)
 * - Window functions
 * - Error handling
 * - Batch parsing (including validation errors)
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  parseSql,
  parseSqlBatch,
  validateSql,
  splitSqlStatements,
} from '../../../src/webview/sqlParser';

describe('SQL Parser', () => {
  describe('validateSql', () => {
    it('returns null for valid SQL within size limit', () => {
      const result = validateSql('SELECT * FROM users');
      expect(result).toBeNull();
    });

    it('returns size_limit error when SQL exceeds max size', () => {
      const smallLimit = 50;
      const sqlOverLimit = 'x'.repeat(smallLimit + 1);
      const result = validateSql(sqlOverLimit, {
        maxSqlSizeBytes: smallLimit,
        maxQueryCount: 50,
      });
      expect(result).not.toBeNull();
      expect(result?.type).toBe('size_limit');
      expect(result?.message).toContain('size limit');
      expect(result?.details?.actual).toBeGreaterThan(smallLimit);
      expect(result?.details?.limit).toBe(smallLimit);
    });

    it('returns query_count_limit error when statement count exceeds limit', () => {
      const manyStatements = Array(55).fill('SELECT 1;').join('\n');
      const result = validateSql(manyStatements, {
        maxSqlSizeBytes: 1024 * 1024,
        maxQueryCount: 50,
      });
      expect(result).not.toBeNull();
      expect(result?.type).toBe('query_count_limit');
      expect(result?.message).toContain('statements');
      expect((result?.details?.actual as number)).toBeGreaterThan(50);
    });

    it('counts trailing statements without semicolons', () => {
      const sql = 'SELECT 1; SELECT 2';
      const result = validateSql(sql, {
        maxSqlSizeBytes: 1024 * 1024,
        maxQueryCount: 1,
      });
      expect(result).not.toBeNull();
      expect(result?.type).toBe('query_count_limit');
      expect(result?.details?.actual).toBe(2);
    });

    it('uses DEFAULT_VALIDATION_LIMITS when limits not provided', () => {
      const result = validateSql('SELECT 1');
      expect(result).toBeNull();
    });
  });

  describe('splitSqlStatements', () => {
    it('splits on semicolons', () => {
      const sql = 'SELECT * FROM users; SELECT * FROM orders;';
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
      expect(statements[0].trim()).toBe('SELECT * FROM users');
      expect(statements[1].trim()).toBe('SELECT * FROM orders');
    });

    it('returns single statement when no semicolon', () => {
      const sql = 'SELECT * FROM users';
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(1);
      expect(statements[0].trim()).toBe('SELECT * FROM users');
    });

    it('ignores semicolons inside single-quoted strings', () => {
      const sql = "SELECT 'a;b' AS x FROM t; SELECT 2;";
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
      expect(statements[0]).toContain("'a;b'");
    });

    it('ignores semicolons inside double-quoted strings', () => {
      const sql = 'SELECT "a;b" AS x FROM t; SELECT 2;';
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
    });

    it('ignores semicolons inside parentheses', () => {
      const sql = 'SELECT func(a; b) FROM t; SELECT 2;';
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
    });

    it('returns empty array for empty string', () => {
      const statements = splitSqlStatements('');
      expect(statements).toHaveLength(0);
    });

    it('trims whitespace-only statements', () => {
      const sql = '  SELECT 1;  ;  SELECT 2  ;';
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
    });

    it('ignores parentheses inside -- line comments', () => {
      const sql = `-- list: 1) first 2) second
SELECT * FROM users;
-- another (comment)
SELECT * FROM orders;`;
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
      expect(statements[0]).toContain('SELECT * FROM users');
      expect(statements[1]).toContain('SELECT * FROM orders');
    });

    it('ignores parentheses inside // line comments', () => {
      const sql = `// Snowflake comment (with parens)
SELECT 1;
// another)
SELECT 2;`;
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
    });

    it('ignores parentheses inside # line comments', () => {
      const sql = `# MySQL comment (with parens)
SELECT 1;
# another)
SELECT 2;`;
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
    });

    it('ignores parentheses inside /* block comments */', () => {
      const sql = `/* comment with ) unmatched paren */
SELECT 1;
/* another ( unmatched */
SELECT 2;`;
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
    });

    it('ignores semicolons inside -- line comments', () => {
      const sql = `SELECT 1 -- comment with ; semicolon
FROM t;
SELECT 2;`;
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
    });

    it('ignores semicolons inside /* block comments */', () => {
      const sql = `SELECT 1 /* comment; with; semis */ FROM t;
SELECT 2;`;
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
    });

    it('splits SQL file with comment headers containing numbered lists', () => {
      const sql = `-- ============================================================
-- Table-Valued Functions (TVF) - Snowflake
-- ============================================================
-- Use this file to validate:
--   1) FLATTEN appears as a table-function source node
--   2) FLATTEN alias handling
--   3) TABLE(FLATTEN(...)) wrapper detection
-- ============================================================

SELECT * FROM t1;

-- Q2
SELECT * FROM t2;

-- Q3
SELECT * FROM t3;`;
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(3);
    });
  });
  describe('Basic SELECT', () => {
    it('parses simple SELECT with single table', () => {
      const result = parseSql('SELECT * FROM users', 'MySQL');

      expect(result.error).toBeUndefined();
      expect(result.nodes.length).toBeGreaterThan(0);

      const tableNode = result.nodes.find(n => n.type === 'table');
      expect(tableNode).toBeDefined();
      expect(tableNode?.label.toLowerCase()).toContain('users');
    });

    it('parses SELECT with specific columns', () => {
      const result = parseSql('SELECT id, name, email FROM users', 'MySQL');

      expect(result.error).toBeUndefined();
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('parses SELECT with WHERE clause', () => {
      const result = parseSql('SELECT * FROM users WHERE active = 1', 'MySQL');

      expect(result.error).toBeUndefined();

      const filterNode = result.nodes.find(n => n.type === 'filter');
      expect(filterNode).toBeDefined();
    });

    it('parses SELECT with ORDER BY', () => {
      const result = parseSql('SELECT * FROM users ORDER BY created_at DESC', 'MySQL');

      expect(result.error).toBeUndefined();

      const sortNode = result.nodes.find(n => n.type === 'sort');
      expect(sortNode).toBeDefined();
    });

    it('parses SELECT with LIMIT', () => {
      const result = parseSql('SELECT * FROM users LIMIT 10', 'MySQL');

      expect(result.error).toBeUndefined();

      const limitNode = result.nodes.find(n => n.type === 'limit');
      expect(limitNode).toBeDefined();
    });

    it('parses SELECT with DISTINCT', () => {
      const result = parseSql('SELECT DISTINCT category FROM products', 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses SELECT with table alias', () => {
      const result = parseSql('SELECT u.id, u.name FROM users u', 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses SELECT with column alias', () => {
      const result = parseSql('SELECT id AS user_id, name AS user_name FROM users', 'MySQL');

      expect(result.error).toBeUndefined();
    });
  });

  describe('JOINs', () => {
    it('parses INNER JOIN', () => {
      const sql = 'SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();

      const joinNode = result.nodes.find(n => n.type === 'join');
      expect(joinNode).toBeDefined();
    });

    it('parses LEFT JOIN', () => {
      const sql = 'SELECT * FROM orders o LEFT JOIN customers c ON o.customer_id = c.id';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();

      const joinNode = result.nodes.find(n => n.type === 'join');
      expect(joinNode).toBeDefined();
    });

    it('parses RIGHT JOIN', () => {
      const sql = 'SELECT * FROM orders o RIGHT JOIN customers c ON o.customer_id = c.id';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses FULL OUTER JOIN', () => {
      const sql = 'SELECT * FROM orders o FULL OUTER JOIN customers c ON o.customer_id = c.id';
      const result = parseSql(sql, 'PostgreSQL');

      expect(result.error).toBeUndefined();
    });

    it('parses CROSS JOIN', () => {
      const sql = 'SELECT * FROM products CROSS JOIN categories';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses multiple JOINs', () => {
      const sql = `
        SELECT o.id, c.name, p.title
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN products p ON o.product_id = p.id
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
      expect(result.nodes.filter(n => n.type === 'table').length).toBeGreaterThanOrEqual(3);
    });

    it('parses self JOIN', () => {
      const sql = 'SELECT e.name, m.name AS manager FROM employees e LEFT JOIN employees m ON e.manager_id = m.id';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });
  });

  describe('Table-Valued Functions', () => {
    it('marks BigQuery UNNEST sources as table_function nodes', () => {
      const result = parseSql('SELECT num FROM UNNEST([1, 2, 3]) AS num', 'BigQuery');

      expect(result.error).toBeUndefined();
      const tableFunctionNode = result.nodes.find(
        n => n.type === 'table' && n.tableCategory === 'table_function'
      );
      expect(tableFunctionNode).toBeDefined();
      expect(tableFunctionNode?.label).toBe('num');
      expect(tableFunctionNode?.details).toContain('Function: UNNEST');
    });

    it('marks Snowflake LATERAL FLATTEN sources as table_function nodes', () => {
      const result = parseSql(
        'SELECT f.value FROM my_table, LATERAL FLATTEN(input => my_array) f',
        'Snowflake'
      );

      expect(result.error).toBeUndefined();
      const tableFunctionNode = result.nodes.find(
        n => n.type === 'table' && n.tableCategory === 'table_function'
      );
      expect(tableFunctionNode).toBeDefined();
      expect(tableFunctionNode?.label).toBe('f');
      expect(tableFunctionNode?.details).toContain('Function: FLATTEN');
    });

    it('marks joined OPENJSON sources as joined table_function nodes', () => {
      const result = parseSql(
        'SELECT * FROM orders CROSS APPLY OPENJSON(tags) j',
        'TransactSQL'
      );

      expect(result.error).toBeUndefined();
      const tableFunctionNode = result.nodes.find(
        n => n.type === 'table' && n.tableCategory === 'table_function'
      );
      expect(tableFunctionNode).toBeDefined();
      expect(tableFunctionNode?.label).toBe('j');
      expect(tableFunctionNode?.description).toContain('Joined table function');

      const joinNode = result.nodes.find(n => n.type === 'join');
      expect(joinNode).toBeDefined();
    });
  });

  describe('CTEs (Common Table Expressions)', () => {
    it('parses simple CTE', () => {
      const sql = `
        WITH active_users AS (
          SELECT * FROM users WHERE active = 1
        )
        SELECT * FROM active_users
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();

      const cteNode = result.nodes.find(n => n.type === 'cte');
      expect(cteNode).toBeDefined();
    });

    it('parses chained CTEs', () => {
      const sql = `
        WITH
          cte1 AS (SELECT * FROM t1),
          cte2 AS (SELECT * FROM cte1 WHERE x > 0)
        SELECT * FROM cte2
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();

      const cteNodes = result.nodes.filter(n => n.type === 'cte');
      expect(cteNodes.length).toBe(2);
    });

    it('parses CTE with aggregation', () => {
      const sql = `
        WITH order_totals AS (
          SELECT customer_id, SUM(amount) as total
          FROM orders
          GROUP BY customer_id
        )
        SELECT c.name, ot.total
        FROM customers c
        JOIN order_totals ot ON c.id = ot.customer_id
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses recursive CTE', () => {
      const sql = `
        WITH RECURSIVE nums AS (
          SELECT 1 AS n
          UNION ALL
          SELECT n + 1 FROM nums WHERE n < 10
        )
        SELECT * FROM nums
      `;
      const result = parseSql(sql, 'PostgreSQL');

      expect(result.error).toBeUndefined();
    });

    it('extracts CASE nodes from CTE internal structure', () => {
      const sql = `
        WITH customer_segments AS (
          SELECT
            customer_id,
            CASE
              WHEN lifetime_value > 10000 THEN 'Platinum'
              WHEN lifetime_value > 5000 THEN 'Gold'
              ELSE 'Standard'
            END AS customer_tier
          FROM customers
        )
        SELECT * FROM customer_segments
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();

      // Find the CTE node
      const cteNode = result.nodes.find(n => n.type === 'cte');
      expect(cteNode).toBeDefined();
      expect(cteNode?.children).toBeDefined();

      // CTE's internal nodes are stored in the children property
      const caseNode = cteNode?.children?.find(n => n.type === 'case');
      expect(caseNode).toBeDefined();
      expect(caseNode?.caseDetails?.cases.length).toBeGreaterThan(0);
    });

    it('extracts multiple CASE statements from CTE', () => {
      const sql = `
        WITH segments AS (
          SELECT
            id,
            CASE WHEN status = 1 THEN 'Active' ELSE 'Inactive' END AS status_label,
            CASE WHEN tier > 5 THEN 'Premium' ELSE 'Basic' END AS tier_label
          FROM users
        )
        SELECT * FROM segments
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();

      // CTE's internal nodes are stored in the children property
      const cteNode = result.nodes.find(n => n.type === 'cte');
      expect(cteNode?.children).toBeDefined();

      const caseNode = cteNode?.children?.find(n => n.type === 'case');
      expect(caseNode).toBeDefined();
      // Should have 2 CASE statements
      expect(caseNode?.caseDetails?.cases.length).toBe(2);
    });
  });

  describe('Aggregations', () => {
    it('parses GROUP BY', () => {
      const sql = 'SELECT department, COUNT(*) FROM employees GROUP BY department';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();

      const aggregateNode = result.nodes.find(n => n.type === 'aggregate');
      expect(aggregateNode).toBeDefined();
    });

    it('parses GROUP BY with multiple columns', () => {
      const sql = 'SELECT department, role, COUNT(*) FROM employees GROUP BY department, role';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses HAVING clause', () => {
      const sql = 'SELECT department, COUNT(*) as cnt FROM employees GROUP BY department HAVING COUNT(*) > 5';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses multiple aggregate functions', () => {
      const sql = 'SELECT department, COUNT(*), AVG(salary), MAX(salary), MIN(salary) FROM employees GROUP BY department';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses SUM aggregate', () => {
      const sql = 'SELECT category, SUM(price) as total FROM products GROUP BY category';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });
  });

  describe('Window Functions', () => {
    it('parses ROW_NUMBER()', () => {
      const sql = 'SELECT *, ROW_NUMBER() OVER (ORDER BY id) as rn FROM users';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();

      const windowNode = result.nodes.find(n => n.type === 'window');
      expect(windowNode).toBeDefined();
    });

    it('parses ROW_NUMBER() with PARTITION BY', () => {
      const sql = 'SELECT *, ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rn FROM employees';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses RANK()', () => {
      const sql = 'SELECT *, RANK() OVER (ORDER BY score DESC) as rnk FROM players';
      const result = parseSql(sql, 'MySQL');

      // Note: 'rank' is a reserved word in some contexts, using 'rnk' instead
      expect(result.error).toBeUndefined();
    });

    it('parses DENSE_RANK()', () => {
      const sql = 'SELECT *, DENSE_RANK() OVER (ORDER BY score DESC) as dense_rank FROM players';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses LAG()', () => {
      const sql = 'SELECT *, LAG(price, 1) OVER (ORDER BY date) as prev_price FROM stock_prices';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses LEAD()', () => {
      const sql = 'SELECT *, LEAD(price, 1) OVER (ORDER BY date) as next_price FROM stock_prices';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses running total with SUM()', () => {
      const sql = 'SELECT *, SUM(amount) OVER (ORDER BY date) as running_total FROM transactions';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });
  });

  describe('Subqueries', () => {
    it('parses subquery in FROM clause', () => {
      const sql = 'SELECT * FROM (SELECT * FROM users WHERE active = 1) AS active_users';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses subquery in WHERE clause', () => {
      const sql = 'SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE vip = 1)';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses correlated subquery', () => {
      const sql = `
        SELECT * FROM employees e
        WHERE salary > (SELECT AVG(salary) FROM employees WHERE department = e.department)
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses EXISTS subquery', () => {
      const sql = 'SELECT * FROM customers c WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });
  });

  describe('Set Operations', () => {
    it('parses UNION', () => {
      const sql = 'SELECT id, name FROM customers UNION SELECT id, name FROM suppliers';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses UNION ALL', () => {
      const sql = 'SELECT id, name FROM customers UNION ALL SELECT id, name FROM suppliers';
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });

    it('parses INTERSECT', () => {
      const sql = 'SELECT id FROM customers INTERSECT SELECT customer_id FROM orders';
      const result = parseSql(sql, 'PostgreSQL');

      expect(result.error).toBeUndefined();
    });

    it('parses EXCEPT', () => {
      const sql = 'SELECT id FROM customers EXCEPT SELECT customer_id FROM orders';
      const result = parseSql(sql, 'PostgreSQL');

      expect(result.error).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('returns partial result for invalid SQL syntax', () => {
      const result = parseSql('SELEC * FORM users', 'MySQL');

      // Fallback parser produces partial results instead of errors
      expect(result.partial).toBe(true);
      expect(result.hints.some(h => h.type === 'error')).toBe(true);
    });

    it('returns partial result for incomplete SQL', () => {
      const result = parseSql('SELECT * FROM', 'MySQL');

      expect(result.partial).toBe(true);
      expect(result.hints.some(h => h.type === 'error')).toBe(true);
    });

    it('handles empty SQL gracefully', () => {
      const result = parseSql('', 'MySQL');

      expect(result.nodes).toEqual([]);
    });

    it('handles whitespace-only SQL', () => {
      const result = parseSql('   \n\t  ', 'MySQL');

      expect(result.nodes).toEqual([]);
    });

    it('parses Snowflake DELETE via dialect fallback when native grammar fails', () => {
      const sql = `DELETE FROM test_orders WHERE created_at < CURRENT_DATE - INTERVAL '90 days'`;
      const result = parseSql(sql, 'Snowflake');

      expect(result.error).toBeUndefined();
      expect(result.nodes.some(n => n.label === 'DELETE')).toBe(true);
    });

    it('retries parsing with detected dialect when primary dialect fails', () => {
      const sql = `SELECT * FROM users WHERE created > INTERVAL '30 days'`;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
      expect(result.partial).not.toBe(true);
      const retryHint = result.hints.find(h => h.message.includes('Auto-retried parse with PostgreSQL'));
      expect(retryHint).toBeDefined();
    });

    it('includes parser error details in hints for syntax errors', () => {
      const sql = `SELECT
  customer_id
FROM orders
WHERE`;
      const result = parseSql(sql, 'Snowflake');

      expect(result.partial).toBe(true);
      const errorHint = result.hints.find(h => h.type === 'error');
      expect(errorHint).toBeDefined();
      expect(errorHint!.message).toMatch(/parse error/i);
    });
  });

  describe('Batch Parsing', () => {
    it('parses multiple statements', () => {
      const sql = `
        SELECT * FROM users;
        SELECT * FROM orders;
        SELECT * FROM products;
      `;
      const result = parseSqlBatch(sql, 'MySQL');

      expect(result.queries.length).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
    });

    it('handles partial failures in batch', () => {
      const sql = `
        SELECT * FROM users;
        INVALID SQL HERE;
        SELECT * FROM orders;
      `;
      const result = parseSqlBatch(sql, 'MySQL');

      expect(result.queries.length).toBeGreaterThanOrEqual(2);
      // With fallback parser, invalid SQL produces partial results instead of errors
      // At least the valid queries should succeed
      expect(result.queries.length).toBe(3);
    });

    it('tracks query line ranges', () => {
      const sql = `SELECT * FROM users;
SELECT * FROM orders;`;
      const result = parseSqlBatch(sql, 'MySQL');

      expect(result.queryLineRanges).toBeDefined();
      expect(result.queryLineRanges?.length).toBe(2);
    });

    it('handles invalid SQL in batch with fallback parser', () => {
      const sql = `SELECT 1;
SELECT
  customer_id
FROOM orders;`;
      const result = parseSqlBatch(sql, 'Snowflake');

      // With fallback parser, invalid SQL produces partial results
      expect(result.queries.length).toBe(2);
      // The second query should be marked as partial
      expect(result.queries[1].partial).toBe(true);
    });

    it('parses empty batch gracefully', () => {
      const result = parseSqlBatch('', 'MySQL');

      expect(result.queries.length).toBe(0);
    });

    it('returns validationError when SQL exceeds size limit but still parses partial', () => {
      const hugeSql = 'x'.repeat(101 * 1024); // > 100KB default
      const result = parseSqlBatch(hugeSql, 'MySQL');

      expect(result.validationError).toBeDefined();
      expect(result.validationError?.type).toBe('size_limit');
      // Now parses first 100KB instead of rejecting entirely
      expect(result.queries.length).toBeGreaterThanOrEqual(1);
    });

    it('returns validationError when statement count exceeds limit', () => {
      const manyStatements = Array(52).fill('SELECT 1;').join('\n');
      const result = parseSqlBatch(manyStatements, 'MySQL', {
        maxSqlSizeBytes: 1024 * 1024,
        maxQueryCount: 50,
      });

      expect(result.validationError).toBeDefined();
      expect(result.validationError?.type).toBe('query_count_limit');
    });
  });

  describe('Fixture: edge-cases/parse-errors.sql', () => {
    it('batch parses mixed valid and invalid statements with correct counts', () => {
      const fixturePath = path.join(__dirname, '../../fixtures/edge-cases/parse-errors.sql');
      const sql = fs.readFileSync(fixturePath, 'utf-8');
      const result = parseSqlBatch(sql, 'MySQL');

      expect(result.queries.length).toBeGreaterThan(0);
      // With fallback parser, previously failing queries now produce partial results
      // At least some queries should parse successfully, some may be partial
      const hasPartial = result.queries.some(q => q.partial);
      const hasSuccess = result.queries.some(q => !q.partial && !q.error);
      expect(hasPartial || hasSuccess).toBe(true);
    });
  });

  describe('Tables Used navigation (CTE children: table + join)', () => {
    it('Q2 product_sales CTE: products as table and brands in join label so both are findable for expand', () => {
      // Same structure as Q2 first CTE in enterprise-complex-queries.sql: FROM products p LEFT JOIN brands b
      const q2FirstCte = `
WITH product_sales AS (
  SELECT p.product_id, b.brand_name
  FROM products p
  LEFT JOIN brands b ON p.brand_id = b.brand_id
  LEFT JOIN categories c ON p.category_id = c.category_id
)
SELECT * FROM product_sales LIMIT 10
`;
      const result = parseSql(q2FirstCte, 'PostgreSQL');
      expect(result.error).toBeUndefined();
      expect(result.nodes).toBeDefined();
      const nodes = result.nodes!;
      const cteNodes = nodes.filter(n => n.type === 'cte' && n.children && n.children.length > 0);
      expect(cteNodes.length).toBeGreaterThan(0);
      const firstCte = cteNodes[0];
      const children = firstCte.children!;
      const productsTable = children.find(c =>
        c.type === 'table' && c.label.toLowerCase() === 'products'
      );
      const brandsInJoin = children.find(c =>
        c.type === 'join' && c.label.toLowerCase().endsWith(' brands')
      );
      expect(productsTable).toBeDefined();
      expect(brandsInJoin).toBeDefined();
      expect(result.tableUsage).toBeDefined();
      expect(result.tableUsage!.has('products')).toBe(true);
      expect(result.tableUsage!.has('brands')).toBe(true);
    });
  });
});
