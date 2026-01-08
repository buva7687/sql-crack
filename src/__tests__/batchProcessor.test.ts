import {
  splitSqlQueries,
  processBatchQueries,
  hasMultipleQueries,
  getQueryPreview
} from '../webview/batchProcessor';

describe('Batch Processor', () => {
  describe('splitSqlQueries', () => {
    it('should split queries by semicolon', () => {
      const sql = 'SELECT * FROM users; SELECT * FROM orders;';
      const queries = splitSqlQueries(sql);

      expect(queries).toHaveLength(2);
      expect(queries[0]).toBe('SELECT * FROM users');
      expect(queries[1]).toBe('SELECT * FROM orders');
    });

    it('should remove empty queries', () => {
      const sql = 'SELECT * FROM users;;; SELECT * FROM orders;';
      const queries = splitSqlQueries(sql);

      expect(queries).toHaveLength(2);
    });

    it('should trim whitespace', () => {
      const sql = '  SELECT * FROM users  ;  SELECT * FROM orders  ';
      const queries = splitSqlQueries(sql);

      expect(queries[0]).toBe('SELECT * FROM users');
      expect(queries[1]).toBe('SELECT * FROM orders');
    });

    it('should handle single query without semicolon', () => {
      const sql = 'SELECT * FROM users';
      const queries = splitSqlQueries(sql);

      expect(queries).toHaveLength(1);
      expect(queries[0]).toBe('SELECT * FROM users');
    });

    it('should handle empty string', () => {
      const sql = '';
      const queries = splitSqlQueries(sql);

      expect(queries).toHaveLength(0);
    });

    it('should handle queries with line breaks', () => {
      const sql = `SELECT * FROM users
WHERE active = 1;
SELECT * FROM orders
WHERE status = 'completed';`;
      const queries = splitSqlQueries(sql);

      expect(queries).toHaveLength(2);
      expect(queries[0]).toContain('WHERE active = 1');
      expect(queries[1]).toContain('WHERE status');
    });
  });

  describe('hasMultipleQueries', () => {
    it('should return true for multiple queries', () => {
      const sql = 'SELECT * FROM users; SELECT * FROM orders;';
      expect(hasMultipleQueries(sql)).toBe(true);
    });

    it('should return false for single query', () => {
      const sql = 'SELECT * FROM users';
      expect(hasMultipleQueries(sql)).toBe(false);
    });

    it('should return false for single query with trailing semicolon', () => {
      const sql = 'SELECT * FROM users;';
      expect(hasMultipleQueries(sql)).toBe(false);
    });

    it('should return true for multiple queries with different types', () => {
      const sql = 'SELECT * FROM users; INSERT INTO logs (message) VALUES ("test");';
      expect(hasMultipleQueries(sql)).toBe(true);
    });
  });

  describe('processBatchQueries', () => {
    it('should process multiple valid queries', () => {
      const sql = 'SELECT id FROM users; SELECT id FROM orders;';
      const result = processBatchQueries(sql, 'MySQL');

      expect(result.totalQueries).toBe(2);
      expect(result.successfulQueries).toBe(2);
      expect(result.failedQueries).toBe(0);
      expect(result.queries).toHaveLength(2);
    });

    it('should handle queries with errors', () => {
      const sql = 'SELECT * FROM users; INVALID SQL QUERY; SELECT * FROM orders;';
      const result = processBatchQueries(sql, 'MySQL');

      expect(result.totalQueries).toBe(3);
      expect(result.successfulQueries).toBe(2);
      expect(result.failedQueries).toBe(1);
      expect(result.queries[1].error).toBeDefined();
    });

    it('should generate IDs for each query', () => {
      const sql = 'SELECT * FROM users; SELECT * FROM orders;';
      const result = processBatchQueries(sql, 'MySQL');

      expect(result.queries[0].id).toBe('query-1');
      expect(result.queries[1].id).toBe('query-2');
    });

    it('should include nodes and edges for successful queries', () => {
      const sql = 'SELECT id, name FROM users WHERE active = 1;';
      const result = processBatchQueries(sql, 'MySQL');

      expect(result.queries[0].nodes).toBeDefined();
      expect(result.queries[0].edges).toBeDefined();
      expect(result.queries[0].nodes.length).toBeGreaterThan(0);
    });

    it('should include AST for successful queries', () => {
      const sql = 'SELECT id FROM users;';
      const result = processBatchQueries(sql, 'MySQL');

      expect(result.queries[0].ast).toBeDefined();
    });

    it('should handle empty batch', () => {
      const sql = '';
      const result = processBatchQueries(sql, 'MySQL');

      expect(result.totalQueries).toBe(0);
      expect(result.queries).toHaveLength(0);
    });

    it('should support different dialects', () => {
      const sql = 'SELECT * FROM users;';
      const mysqlResult = processBatchQueries(sql, 'MySQL');
      const postgresResult = processBatchQueries(sql, 'PostgreSQL');

      expect(mysqlResult.successfulQueries).toBe(1);
      expect(postgresResult.successfulQueries).toBe(1);
    });

    it('should handle mixed query types', () => {
      const sql = `
        SELECT * FROM users;
        INSERT INTO logs (message) VALUES ('test');
        UPDATE users SET active = 1 WHERE id = 1;
        DELETE FROM logs WHERE id < 100;
      `;
      const result = processBatchQueries(sql, 'MySQL');

      expect(result.totalQueries).toBe(4);
      expect(result.successfulQueries).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getQueryPreview', () => {
    it('should return first 50 characters', () => {
      const sql = 'SELECT * FROM users WHERE active = 1 AND status = "verified"';
      const preview = getQueryPreview(sql);

      expect(preview).toHaveLength(53); // 50 chars + '...'
      expect(preview.endsWith('...')).toBe(true);
    });

    it('should return full query if less than 50 characters', () => {
      const sql = 'SELECT * FROM users';
      const preview = getQueryPreview(sql);

      expect(preview).toBe('SELECT * FROM users');
      expect(preview.endsWith('...')).toBe(false);
    });

    it('should handle empty string', () => {
      const sql = '';
      const preview = getQueryPreview(sql);

      expect(preview).toBe('');
    });

    it('should trim whitespace', () => {
      const sql = '   SELECT * FROM users   ';
      const preview = getQueryPreview(sql);

      expect(preview).toBe('SELECT * FROM users');
    });
  });
});
