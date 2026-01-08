import { analyzeQueryForHints, getHintColor, getHintIcon } from '../webview/optimizationHints';
import { Parser } from 'node-sql-parser';

describe('Optimization Hints', () => {
  const parser = new Parser();

  describe('analyzeQueryForHints', () => {
    it('should detect SELECT * usage', () => {
      const sql = 'SELECT * FROM users';
      const ast = parser.astify(sql);
      const hints = analyzeQueryForHints(sql, ast);

      const selectAllHint = hints.find(h => h.title.includes('SELECT *'));
      expect(selectAllHint).toBeDefined();
      expect(selectAllHint?.severity).toBe('warning');
      expect(selectAllHint?.category).toBe('Best Practice');
    });

    it('should detect missing LIMIT clause', () => {
      const sql = 'SELECT id, name FROM users WHERE active = 1';
      const ast = parser.astify(sql);
      const hints = analyzeQueryForHints(sql, ast);

      const limitHint = hints.find(h => h.title.includes('LIMIT'));
      expect(limitHint).toBeDefined();
      expect(limitHint?.severity).toBe('warning');
      expect(limitHint?.category).toBe('Performance');
    });

    it('should detect UPDATE without WHERE', () => {
      const sql = 'UPDATE users SET status = "active"';
      const ast = parser.astify(sql);
      const hints = analyzeQueryForHints(sql, ast);

      const whereHint = hints.find(h => h.title.includes('WHERE'));
      expect(whereHint).toBeDefined();
      expect(whereHint?.severity).toBe('error');
      expect(whereHint?.category).toBe('Security');
    });

    it('should detect DELETE without WHERE', () => {
      const sql = 'DELETE FROM users';
      const ast = parser.astify(sql);
      const hints = analyzeQueryForHints(sql, ast);

      const whereHint = hints.find(h => h.title.includes('WHERE'));
      expect(whereHint).toBeDefined();
      expect(whereHint?.severity).toBe('error');
    });

    it('should detect NOT IN usage', () => {
      const sql = 'SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM banned)';
      const ast = parser.astify(sql);
      const hints = analyzeQueryForHints(sql, ast);

      const notInHint = hints.find(h => h.title.includes('NOT IN'));
      expect(notInHint).toBeDefined();
      expect(notInHint?.severity).toBe('warning');
      expect(notInHint?.category).toBe('Performance');
    });

    it('should detect OR in WHERE clause', () => {
      const sql = 'SELECT * FROM users WHERE status = "active" OR role = "admin"';
      const ast = parser.astify(sql);
      const hints = analyzeQueryForHints(sql, ast);

      const orHint = hints.find(h => h.title.includes('OR'));
      expect(orHint).toBeDefined();
      expect(orHint?.severity).toBe('info');
    });

    it('should not generate hints for well-optimized queries', () => {
      const sql = 'SELECT id, name, email FROM users WHERE active = 1 LIMIT 10';
      const ast = parser.astify(sql);
      const hints = analyzeQueryForHints(sql, ast);

      expect(hints.length).toBe(0);
    });

    it('should handle complex queries with multiple issues', () => {
      const sql = 'SELECT * FROM users WHERE status = "active" OR role = "admin"';
      const ast = parser.astify(sql);
      const hints = analyzeQueryForHints(sql, ast);

      expect(hints.length).toBeGreaterThan(1);
    });
  });

  describe('getHintColor', () => {
    it('should return correct color for error severity', () => {
      expect(getHintColor('error')).toBe('#f56565');
    });

    it('should return correct color for warning severity', () => {
      expect(getHintColor('warning')).toBe('#ed8936');
    });

    it('should return correct color for info severity', () => {
      expect(getHintColor('info')).toBe('#4299e1');
    });

    it('should return default color for unknown severity', () => {
      expect(getHintColor('unknown' as any)).toBe('#888');
    });
  });

  describe('getHintIcon', () => {
    it('should return correct icon for error severity', () => {
      expect(getHintIcon('error')).toBe('❌');
    });

    it('should return correct icon for warning severity', () => {
      expect(getHintIcon('warning')).toBe('⚠️');
    });

    it('should return correct icon for info severity', () => {
      expect(getHintIcon('info')).toBe('ℹ️');
    });

    it('should return default icon for unknown severity', () => {
      expect(getHintIcon('unknown' as any)).toBe('•');
    });
  });
});
