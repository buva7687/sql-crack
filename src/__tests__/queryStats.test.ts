import { calculateQueryStats, getComplexityColor } from '../webview/queryStats';
import { parseSqlToGraph } from '../webview/sqlParser';

describe('Query Statistics', () => {
  describe('calculateQueryStats', () => {
    it('should count total nodes', () => {
      const sql = 'SELECT id, name FROM users WHERE active = 1';
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(stats.totalNodes).toBe(nodes.length);
    });

    it('should count tables', () => {
      const sql = 'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id';
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(stats.tableCount).toBeGreaterThanOrEqual(2);
    });

    it('should count joins', () => {
      const sql = 'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id JOIN order_items oi ON o.id = oi.order_id';
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(stats.joinCount).toBeGreaterThanOrEqual(2);
    });

    it('should count CTEs', () => {
      const sql = 'WITH active_users AS (SELECT * FROM users WHERE active = 1) SELECT * FROM active_users';
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(stats.cteCount).toBeGreaterThanOrEqual(1);
    });

    it('should count window functions', () => {
      const sql = 'SELECT id, name, ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rank FROM employees';
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(stats.windowFunctionCount).toBeGreaterThanOrEqual(1);
    });

    it('should count subqueries', () => {
      const sql = 'SELECT * FROM users WHERE salary > (SELECT AVG(salary) FROM users)';
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(stats.subqueryCount).toBeGreaterThanOrEqual(1);
    });

    it('should count set operations', () => {
      const sql = 'SELECT id FROM customers UNION SELECT id FROM suppliers';
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(stats.setOperationCount).toBeGreaterThanOrEqual(1);
    });

    it('should calculate complexity for simple query', () => {
      const sql = 'SELECT id FROM users LIMIT 10';
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(stats.complexityLevel).toBe('Simple');
      expect(stats.complexityScore).toBeLessThan(10);
    });

    it('should calculate complexity for moderate query', () => {
      const sql = 'SELECT u.name, COUNT(*) FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1 GROUP BY u.id';
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(['Moderate', 'Complex']).toContain(stats.complexityLevel);
    });

    it('should calculate complexity for complex query', () => {
      const sql = `
        WITH ranked_orders AS (
          SELECT
            user_id,
            order_date,
            total,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_date DESC) as rank
          FROM orders
        )
        SELECT
          u.name,
          ro.order_date,
          ro.total
        FROM users u
        JOIN ranked_orders ro ON u.id = ro.user_id
        JOIN order_items oi ON ro.order_id = oi.order_id
        WHERE ro.rank <= 3
          AND u.active = 1
        ORDER BY u.name, ro.order_date DESC
      `;
      const { nodes, edges } = parseSqlToGraph(sql, 'MySQL');
      const stats = calculateQueryStats(nodes, edges);

      expect(['Complex', 'Very Complex']).toContain(stats.complexityLevel);
      expect(stats.complexityScore).toBeGreaterThan(25);
    });

    it('should handle empty nodes and edges', () => {
      const stats = calculateQueryStats([], []);

      expect(stats.totalNodes).toBe(0);
      expect(stats.tableCount).toBe(0);
      expect(stats.joinCount).toBe(0);
      expect(stats.complexityLevel).toBe('Simple');
    });

    it('should increase complexity score with more features', () => {
      const simpleSQL = 'SELECT id FROM users';
      const { nodes: simpleNodes, edges: simpleEdges } = parseSqlToGraph(simpleSQL, 'MySQL');
      const simpleStats = calculateQueryStats(simpleNodes, simpleEdges);

      const complexSQL = 'SELECT u.id, COUNT(*) FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1 GROUP BY u.id HAVING COUNT(*) > 5';
      const { nodes: complexNodes, edges: complexEdges } = parseSqlToGraph(complexSQL, 'MySQL');
      const complexStats = calculateQueryStats(complexNodes, complexEdges);

      expect(complexStats.complexityScore).toBeGreaterThan(simpleStats.complexityScore);
    });
  });

  describe('getComplexityColor', () => {
    it('should return green for Simple', () => {
      expect(getComplexityColor('Simple')).toBe('#48bb78');
    });

    it('should return blue for Moderate', () => {
      expect(getComplexityColor('Moderate')).toBe('#4299e1');
    });

    it('should return orange for Complex', () => {
      expect(getComplexityColor('Complex')).toBe('#ed8936');
    });

    it('should return red for Very Complex', () => {
      expect(getComplexityColor('Very Complex')).toBe('#f56565');
    });

    it('should return default color for unknown level', () => {
      expect(getComplexityColor('Unknown')).toBe('#888');
    });
  });
});
