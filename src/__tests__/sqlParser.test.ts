import { parseSqlToGraph, SqlDialect } from '../webview/sqlParser';

describe('SQL Parser', () => {
  describe('parseSqlToGraph - SELECT queries', () => {
    it('should parse simple SELECT query', () => {
      const sql = 'SELECT id, name FROM users';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.ast).toBeDefined();
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse SELECT with WHERE clause', () => {
      const sql = 'SELECT * FROM users WHERE active = 1';
      const result = parseSqlToGraph(sql, 'MySQL');

      const whereNode = result.nodes.find(n => n.id.includes('where'));
      expect(whereNode).toBeDefined();
    });

    it('should parse SELECT with JOIN', () => {
      const sql = 'SELECT u.name, o.total FROM users u INNER JOIN orders o ON u.id = o.user_id';
      const result = parseSqlToGraph(sql, 'MySQL');

      const joinNode = result.nodes.find(n => n.id.includes('join'));
      expect(joinNode).toBeDefined();
      expect(result.edges.length).toBeGreaterThan(0);
    });

    it('should parse SELECT with GROUP BY', () => {
      const sql = 'SELECT department, COUNT(*) FROM employees GROUP BY department';
      const result = parseSqlToGraph(sql, 'MySQL');

      const groupByNode = result.nodes.find(n => n.id.includes('groupby'));
      expect(groupByNode).toBeDefined();
    });

    it('should parse SELECT with ORDER BY', () => {
      const sql = 'SELECT * FROM users ORDER BY created_at DESC';
      const result = parseSqlToGraph(sql, 'MySQL');

      const orderByNode = result.nodes.find(n => n.id.includes('orderby'));
      expect(orderByNode).toBeDefined();
    });

    it('should parse SELECT with LIMIT', () => {
      const sql = 'SELECT * FROM users LIMIT 10';
      const result = parseSqlToGraph(sql, 'MySQL');

      const limitNode = result.nodes.find(n => n.id.includes('limit'));
      expect(limitNode).toBeDefined();
    });

    it('should parse SELECT with CTE', () => {
      const sql = 'WITH active_users AS (SELECT * FROM users WHERE active = 1) SELECT * FROM active_users';
      const result = parseSqlToGraph(sql, 'MySQL');

      const cteNode = result.nodes.find(n => n.id.includes('cte'));
      expect(cteNode).toBeDefined();
    });

    it('should parse SELECT with window functions', () => {
      const sql = 'SELECT id, name, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) as rank FROM employees';
      const result = parseSqlToGraph(sql, 'MySQL');

      const windowNode = result.nodes.find(n => n.id.includes('window'));
      expect(windowNode).toBeDefined();
    });

    it('should parse SELECT with subquery', () => {
      const sql = 'SELECT * FROM users WHERE salary > (SELECT AVG(salary) FROM users)';
      const result = parseSqlToGraph(sql, 'MySQL');

      const subqueryNode = result.nodes.find(n => n.id.includes('subquery'));
      expect(subqueryNode).toBeDefined();
    });

    it('should parse SELECT with UNION', () => {
      const sql = 'SELECT id FROM customers UNION SELECT id FROM suppliers';
      const result = parseSqlToGraph(sql, 'MySQL');

      const unionNode = result.nodes.find(n => n.id.includes('union'));
      expect(unionNode).toBeDefined();
    });

    it('should parse SELECT with multiple JOINs', () => {
      const sql = `
        SELECT u.name, o.total, p.name
        FROM users u
        JOIN orders o ON u.id = o.user_id
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p ON oi.product_id = p.id
      `;
      const result = parseSqlToGraph(sql, 'MySQL');

      const joinNodes = result.nodes.filter(n => n.id.includes('join'));
      expect(joinNodes.length).toBeGreaterThanOrEqual(3);
    });

    it('should parse complex SELECT with multiple clauses', () => {
      const sql = `
        SELECT
          department,
          COUNT(*) as emp_count,
          AVG(salary) as avg_salary
        FROM employees
        WHERE active = 1
        GROUP BY department
        HAVING COUNT(*) > 5
        ORDER BY avg_salary DESC
        LIMIT 10
      `;
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(5);
      expect(result.nodes.find(n => n.id.includes('where'))).toBeDefined();
      expect(result.nodes.find(n => n.id.includes('groupby'))).toBeDefined();
      expect(result.nodes.find(n => n.id.includes('orderby'))).toBeDefined();
      expect(result.nodes.find(n => n.id.includes('limit'))).toBeDefined();
    });
  });

  describe('parseSqlToGraph - INSERT queries', () => {
    it('should parse simple INSERT query', () => {
      const sql = 'INSERT INTO users (name, email) VALUES ("John", "john@example.com")';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
      const insertNode = result.nodes.find(n => n.id.includes('insert'));
      expect(insertNode).toBeDefined();
    });

    it('should parse INSERT with multiple values', () => {
      const sql = 'INSERT INTO users (name, email) VALUES ("John", "john@example.com"), ("Jane", "jane@example.com")';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse INSERT with SELECT', () => {
      const sql = 'INSERT INTO archive_users SELECT * FROM users WHERE archived = 1';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('parseSqlToGraph - UPDATE queries', () => {
    it('should parse simple UPDATE query', () => {
      const sql = 'UPDATE users SET active = 1 WHERE id = 123';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
      const updateNode = result.nodes.find(n => n.id.includes('update'));
      expect(updateNode).toBeDefined();
    });

    it('should parse UPDATE with multiple SET clauses', () => {
      const sql = 'UPDATE users SET active = 1, status = "verified" WHERE id = 123';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse UPDATE without WHERE', () => {
      const sql = 'UPDATE users SET active = 1';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('parseSqlToGraph - DELETE queries', () => {
    it('should parse simple DELETE query', () => {
      const sql = 'DELETE FROM users WHERE id = 123';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
      const deleteNode = result.nodes.find(n => n.id.includes('delete'));
      expect(deleteNode).toBeDefined();
    });

    it('should parse DELETE without WHERE', () => {
      const sql = 'DELETE FROM users';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse DELETE with complex WHERE', () => {
      const sql = 'DELETE FROM users WHERE active = 0 AND created_at < "2020-01-01"';
      const result = parseSqlToGraph(sql, 'MySQL');

      const whereNode = result.nodes.find(n => n.id.includes('where'));
      expect(whereNode).toBeDefined();
    });
  });

  describe('parseSqlToGraph - Different SQL Dialects', () => {
    it('should parse MySQL query', () => {
      const sql = 'SELECT * FROM users LIMIT 10';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse PostgreSQL query', () => {
      const sql = 'SELECT * FROM users LIMIT 10';
      const result = parseSqlToGraph(sql, 'PostgreSQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse SQL Server query', () => {
      const sql = 'SELECT TOP 10 * FROM users';
      const result = parseSqlToGraph(sql, 'Transact-SQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse SQLite query', () => {
      const sql = 'SELECT * FROM users LIMIT 10';
      const result = parseSqlToGraph(sql, 'SQLite');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse MariaDB query', () => {
      const sql = 'SELECT * FROM users LIMIT 10';
      const result = parseSqlToGraph(sql, 'MariaDB');

      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('parseSqlToGraph - Node types and styling', () => {
    it('should create nodes with correct types', () => {
      const sql = 'SELECT id FROM users WHERE active = 1';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.every(n => n.type === 'default')).toBe(true);
    });

    it('should create nodes with labels', () => {
      const sql = 'SELECT id FROM users';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.every(n => n.data.label)).toBeTruthy();
    });

    it('should create nodes with positions', () => {
      const sql = 'SELECT id FROM users';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.every(n => n.position.x !== undefined && n.position.y !== undefined)).toBe(true);
    });

    it('should create nodes with styles', () => {
      const sql = 'SELECT id FROM users';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.every(n => n.style?.background)).toBeTruthy();
    });
  });

  describe('parseSqlToGraph - Edge creation', () => {
    it('should create edges between nodes', () => {
      const sql = 'SELECT u.name FROM users u JOIN orders o ON u.id = o.user_id';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.edges.length).toBeGreaterThan(0);
      expect(result.edges.every(e => e.source && e.target)).toBe(true);
    });

    it('should create edges with IDs', () => {
      const sql = 'SELECT id FROM users WHERE active = 1';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.edges.every(e => e.id)).toBeTruthy();
    });

    it('should create edges with types', () => {
      const sql = 'SELECT id FROM users WHERE active = 1';
      const result = parseSqlToGraph(sql, 'MySQL');

      if (result.edges.length > 0) {
        expect(result.edges.every(e => e.type)).toBeTruthy();
      }
    });
  });

  describe('parseSqlToGraph - Error handling', () => {
    it('should throw error for invalid SQL', () => {
      const sql = 'INVALID SQL SYNTAX HERE';

      expect(() => parseSqlToGraph(sql, 'MySQL')).toThrow();
    });

    it('should throw error for empty SQL', () => {
      const sql = '';

      expect(() => parseSqlToGraph(sql, 'MySQL')).toThrow();
    });

    it('should handle malformed queries', () => {
      const sql = 'SELECT FROM';

      expect(() => parseSqlToGraph(sql, 'MySQL')).toThrow();
    });
  });

  describe('parseSqlToGraph - Schema mode detection', () => {
    it('should detect CREATE TABLE as schema mode', () => {
      const sql = 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100))';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.isSchema).toBe(true);
    });

    it('should not mark SELECT as schema mode', () => {
      const sql = 'SELECT * FROM users';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.isSchema).toBeFalsy();
    });
  });

  describe('parseSqlToGraph - AST inclusion', () => {
    it('should include AST in result', () => {
      const sql = 'SELECT * FROM users';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('select');
    });

    it('should have correct AST structure', () => {
      const sql = 'SELECT id, name FROM users WHERE active = 1';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.ast.columns).toBeDefined();
      expect(result.ast.from).toBeDefined();
      expect(result.ast.where).toBeDefined();
    });
  });

  describe('parseSqlToGraph - Advanced SQL features', () => {
    it('should parse CASE statements', () => {
      const sql = 'SELECT CASE WHEN age > 18 THEN "adult" ELSE "minor" END as category FROM users';
      const result = parseSqlToGraph(sql, 'MySQL');

      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should parse LEFT JOIN', () => {
      const sql = 'SELECT u.name, o.total FROM users u LEFT JOIN orders o ON u.id = o.user_id';
      const result = parseSqlToGraph(sql, 'MySQL');

      const joinNode = result.nodes.find(n => n.id.includes('join'));
      expect(joinNode).toBeDefined();
    });

    it('should parse RIGHT JOIN', () => {
      const sql = 'SELECT u.name, o.total FROM users u RIGHT JOIN orders o ON u.id = o.user_id';
      const result = parseSqlToGraph(sql, 'MySQL');

      const joinNode = result.nodes.find(n => n.id.includes('join'));
      expect(joinNode).toBeDefined();
    });

    it('should parse FULL OUTER JOIN', () => {
      const sql = 'SELECT u.name, o.total FROM users u FULL OUTER JOIN orders o ON u.id = o.user_id';
      const result = parseSqlToGraph(sql, 'MySQL');

      const joinNode = result.nodes.find(n => n.id.includes('join'));
      expect(joinNode).toBeDefined();
    });

    it('should parse INTERSECT', () => {
      const sql = 'SELECT id FROM customers INTERSECT SELECT id FROM suppliers';
      const result = parseSqlToGraph(sql, 'MySQL');

      const intersectNode = result.nodes.find(n => n.id.includes('intersect'));
      expect(intersectNode).toBeDefined();
    });

    it('should parse EXCEPT', () => {
      const sql = 'SELECT id FROM customers EXCEPT SELECT id FROM blacklist';
      const result = parseSqlToGraph(sql, 'MySQL');

      const exceptNode = result.nodes.find(n => n.id.includes('except'));
      expect(exceptNode).toBeDefined();
    });
  });
});
