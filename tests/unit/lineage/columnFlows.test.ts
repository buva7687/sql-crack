/**
 * Column Lineage Tests
 *
 * Tests column flow tracking including:
 * - Direct passthrough
 * - Renamed columns (aliases)
 * - Aggregated columns
 * - Calculated columns
 * - Columns through JOINs
 */

import { parseSql } from '../../../src/webview/sqlParser';

describe('Column Lineage', () => {
  describe('Direct Passthrough', () => {
    it('tracks column from single table', () => {
      const result = parseSql('SELECT id, name FROM users', 'MySQL');

      expect(result.columnFlows).toBeDefined();
      expect(result.columnFlows?.length).toBeGreaterThan(0);
    });

    it('tracks all selected columns', () => {
      const result = parseSql('SELECT id, name, email, created_at FROM users', 'MySQL');

      expect(result.columnFlows?.length).toBeGreaterThanOrEqual(4);
    });

    it('tracks SELECT * columns', () => {
      const result = parseSql('SELECT * FROM users', 'MySQL');

      // SELECT * should still produce column flows (as wildcards)
      expect(result.error).toBeUndefined();
    });
  });

  describe('Renamed Columns (Aliases)', () => {
    it('tracks simple alias', () => {
      const result = parseSql('SELECT id AS user_id FROM users', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'user_id');
      expect(flow).toBeDefined();
    });

    it('tracks alias with AS keyword', () => {
      const result = parseSql('SELECT name AS user_name FROM users', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'user_name');
      expect(flow).toBeDefined();
    });

    it('tracks alias without AS keyword', () => {
      const result = parseSql('SELECT name user_name FROM users', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'user_name');
      expect(flow).toBeDefined();
    });

    it('marks renamed columns with transformation type', () => {
      const result = parseSql('SELECT id AS user_id FROM users', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'user_id');
      const renamedStep = flow?.lineagePath.find(s => s.transformation === 'renamed');
      expect(renamedStep).toBeDefined();
    });
  });

  describe('Aggregated Columns', () => {
    it('tracks COUNT(*)', () => {
      const result = parseSql('SELECT COUNT(*) AS total FROM users', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'total');
      expect(flow).toBeDefined();
    });

    it('tracks SUM()', () => {
      const result = parseSql('SELECT SUM(amount) AS total_amount FROM orders', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'total_amount');
      expect(flow).toBeDefined();
    });

    it('tracks AVG()', () => {
      const result = parseSql('SELECT AVG(salary) AS avg_salary FROM employees', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'avg_salary');
      expect(flow).toBeDefined();
    });

    it('tracks MAX()', () => {
      const result = parseSql('SELECT MAX(price) AS max_price FROM products', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'max_price');
      expect(flow).toBeDefined();
    });

    it('tracks MIN()', () => {
      const result = parseSql('SELECT MIN(price) AS min_price FROM products', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'min_price');
      expect(flow).toBeDefined();
    });

    it('marks aggregated columns with transformation type', () => {
      const result = parseSql('SELECT COUNT(*) AS total FROM users', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'total');
      const aggStep = flow?.lineagePath.find(s => s.transformation === 'aggregated');
      expect(aggStep).toBeDefined();
    });

    it('tracks GROUP BY columns alongside aggregates', () => {
      const result = parseSql('SELECT department, COUNT(*) AS count FROM employees GROUP BY department', 'MySQL');

      expect(result.columnFlows?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Calculated Columns', () => {
    it('tracks arithmetic expression', () => {
      const result = parseSql('SELECT price * quantity AS total FROM order_items', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'total');
      expect(flow).toBeDefined();
    });

    it('tracks CONCAT expression', () => {
      const result = parseSql('SELECT CONCAT(first_name, " ", last_name) AS full_name FROM users', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'full_name');
      expect(flow).toBeDefined();
    });

    it('tracks CASE expression', () => {
      const result = parseSql(`
        SELECT
          CASE WHEN status = 1 THEN 'Active' ELSE 'Inactive' END AS status_label
        FROM users
      `, 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'status_label');
      expect(flow).toBeDefined();
    });

    it('tracks COALESCE expression', () => {
      const result = parseSql('SELECT COALESCE(nickname, name, "Unknown") AS display_name FROM users', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'display_name');
      expect(flow).toBeDefined();
    });

    it('marks calculated columns with transformation type', () => {
      const result = parseSql('SELECT price * quantity AS total FROM order_items', 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'total');
      const calcStep = flow?.lineagePath.find(s => s.transformation === 'calculated');
      expect(calcStep).toBeDefined();
    });
  });

  describe('Columns Through JOINs', () => {
    it('tracks columns from multiple tables', () => {
      const sql = `
        SELECT o.id, c.name
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.columnFlows?.length).toBeGreaterThanOrEqual(2);
    });

    it('tracks columns with table qualifiers', () => {
      const sql = `
        SELECT orders.id, customers.name
        FROM orders
        JOIN customers ON orders.customer_id = customers.id
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.columnFlows?.length).toBeGreaterThanOrEqual(2);
    });

    it('tracks columns through LEFT JOIN', () => {
      const sql = `
        SELECT o.id, c.name
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
      expect(result.columnFlows?.length).toBeGreaterThan(0);
    });

    it('tracks columns through multiple JOINs', () => {
      const sql = `
        SELECT o.id, c.name, p.title
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN products p ON o.product_id = p.id
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.columnFlows?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Columns Through CTEs', () => {
    it('tracks columns through simple CTE', () => {
      const sql = `
        WITH active_users AS (
          SELECT id, name FROM users WHERE active = 1
        )
        SELECT id, name FROM active_users
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
      expect(result.columnFlows?.length).toBeGreaterThan(0);
    });

    it('tracks columns through chained CTEs', () => {
      const sql = `
        WITH
          cte1 AS (SELECT id, name FROM users),
          cte2 AS (SELECT id, name FROM cte1 WHERE id > 0)
        SELECT * FROM cte2
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
    });
  });

  describe('Columns Through Subqueries', () => {
    it('tracks columns from subquery in FROM', () => {
      const sql = `
        SELECT sub.id, sub.name
        FROM (SELECT id, name FROM users WHERE active = 1) sub
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.error).toBeUndefined();
      expect(result.columnFlows?.length).toBeGreaterThan(0);
    });
  });

  describe('Window Function Columns', () => {
    it('tracks window function output', () => {
      const sql = `
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY id) AS row_num
        FROM users
      `;
      const result = parseSql(sql, 'MySQL');

      const flow = result.columnFlows?.find(f => f.outputColumn === 'row_num');
      expect(flow).toBeDefined();
    });

    it('tracks window function with PARTITION BY', () => {
      const sql = `
        SELECT
          department,
          salary,
          RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS dept_rank
        FROM employees
      `;
      const result = parseSql(sql, 'MySQL');

      expect(result.columnFlows?.length).toBeGreaterThanOrEqual(3);
    });
  });
});
