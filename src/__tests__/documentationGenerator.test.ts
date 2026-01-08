import { generateDocumentation, exportAsMarkdown } from '../webview/documentationGenerator';
import { Parser } from 'node-sql-parser';

describe('Documentation Generator', () => {
  const parser = new Parser();

  describe('generateDocumentation', () => {
    it('should generate documentation for SELECT query', () => {
      const sql = 'SELECT id, name, email FROM users WHERE active = 1 LIMIT 10';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      expect(doc.summary).toContain('Select');
      expect(doc.purpose).toBe('Retrieve data from the database');
      expect(doc.tables.length).toBeGreaterThan(0);
      expect(doc.complexity).toBeDefined();
    });

    it('should generate documentation for INSERT query', () => {
      const sql = 'INSERT INTO users (name, email) VALUES ("John", "john@example.com")';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      expect(doc.summary).toContain('Insert');
      expect(doc.purpose).toBe('Add new records to the database');
      expect(doc.tables.length).toBeGreaterThan(0);
    });

    it('should generate documentation for UPDATE query', () => {
      const sql = 'UPDATE users SET active = 1 WHERE id = 123';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      expect(doc.summary).toContain('Update');
      expect(doc.purpose).toBe('Modify existing records in the database');
      expect(doc.tables.length).toBeGreaterThan(0);
    });

    it('should generate documentation for DELETE query', () => {
      const sql = 'DELETE FROM users WHERE id = 123';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      expect(doc.summary).toContain('Delete');
      expect(doc.purpose).toBe('Remove records from the database');
      expect(doc.tables.length).toBeGreaterThan(0);
    });

    it('should detect tables with aliases', () => {
      const sql = 'SELECT u.id, u.name FROM users AS u';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      const usersTable = doc.tables.find(t => t.name === 'users');
      expect(usersTable).toBeDefined();
      expect(usersTable?.alias).toBe('u');
    });

    it('should detect JOIN operations', () => {
      const sql = 'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      expect(doc.joins.length).toBeGreaterThan(0);
      expect(doc.joins[0].type).toContain('JOIN');
    });

    it('should detect aggregations', () => {
      const sql = 'SELECT COUNT(*) as total, AVG(price) as avg_price FROM products';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      expect(doc.aggregations.length).toBeGreaterThan(0);
      const countAgg = doc.aggregations.find(a => a.function === 'COUNT');
      const avgAgg = doc.aggregations.find(a => a.function === 'AVG');
      expect(countAgg).toBeDefined();
      expect(avgAgg).toBeDefined();
    });

    it('should detect filters', () => {
      const sql = 'SELECT * FROM users WHERE active = 1 AND role = "admin"';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      expect(doc.filters.length).toBeGreaterThan(0);
    });

    it('should detect ORDER BY', () => {
      const sql = 'SELECT * FROM users ORDER BY created_at DESC, name ASC';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      expect(doc.ordering.length).toBe(2);
      expect(doc.ordering[0].direction).toBe('DESC');
      expect(doc.ordering[1].direction).toBe('ASC');
    });

    it('should warn about missing LIMIT', () => {
      const sql = 'SELECT * FROM users WHERE active = 1';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      const limitWarning = doc.warnings.find(w => w.includes('LIMIT'));
      expect(limitWarning).toBeDefined();
    });

    it('should warn about UPDATE without WHERE', () => {
      const sql = 'UPDATE users SET active = 1';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      const whereWarning = doc.warnings.find(w => w.includes('WHERE'));
      expect(whereWarning).toBeDefined();
    });

    it('should warn about DELETE without WHERE', () => {
      const sql = 'DELETE FROM users';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      const whereWarning = doc.warnings.find(w => w.includes('WHERE'));
      expect(whereWarning).toBeDefined();
    });

    it('should generate data flow steps', () => {
      const sql = 'SELECT u.name, COUNT(*) as order_count FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1 GROUP BY u.id ORDER BY order_count DESC';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);

      expect(doc.dataFlow.length).toBeGreaterThan(0);
      expect(doc.dataFlow.some(step => step.includes('retrieved'))).toBe(true);
      expect(doc.dataFlow.some(step => step.includes('join'))).toBe(true);
    });

    it('should assess complexity', () => {
      const simpleSQL = 'SELECT id FROM users LIMIT 10';
      const simpleAST = parser.astify(simpleSQL);
      const simpleDoc = generateDocumentation(simpleSQL, simpleAST);

      const complexSQL = 'SELECT u.*, COUNT(o.id) FROM users u JOIN orders o ON u.id = o.user_id JOIN order_items oi ON o.id = oi.order_id WHERE u.active = 1 GROUP BY u.id HAVING COUNT(o.id) > 5 ORDER BY COUNT(o.id) DESC';
      const complexAST = parser.astify(complexSQL);
      const complexDoc = generateDocumentation(complexSQL, complexAST);

      expect(['Simple', 'Moderate']).toContain(simpleDoc.complexity);
      expect(['Complex', 'Very Complex']).toContain(complexDoc.complexity);
    });

    it('should handle errors gracefully', () => {
      const sql = 'SELECT * FROM users';
      const invalidAST = { type: 'unknown' };
      const doc = generateDocumentation(sql, invalidAST);

      expect(doc.summary).toBeDefined();
      expect(doc.purpose).toBeDefined();
    });
  });

  describe('exportAsMarkdown', () => {
    it('should export documentation as markdown', () => {
      const sql = 'SELECT id, name FROM users WHERE active = 1 LIMIT 10';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);
      const markdown = exportAsMarkdown(doc, sql);

      expect(markdown).toContain('# SQL Query Documentation');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Purpose');
      expect(markdown).toContain('## Complexity');
      expect(markdown).toContain('```sql');
      expect(markdown).toContain(sql);
    });

    it('should include all sections', () => {
      const sql = 'SELECT u.name, COUNT(*) FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1 GROUP BY u.id ORDER BY COUNT(*) DESC';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);
      const markdown = exportAsMarkdown(doc, sql);

      expect(markdown).toContain('## Tables Involved');
      expect(markdown).toContain('## Join Operations');
      expect(markdown).toContain('## Filters & Conditions');
      expect(markdown).toContain('## Aggregations');
      expect(markdown).toContain('## Ordering');
      expect(markdown).toContain('## Data Flow');
    });

    it('should include warnings section if present', () => {
      const sql = 'UPDATE users SET active = 1';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);
      const markdown = exportAsMarkdown(doc, sql);

      expect(markdown).toContain('## ⚠️ Warnings');
    });

    it('should format dates', () => {
      const sql = 'SELECT * FROM users';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);
      const markdown = exportAsMarkdown(doc, sql);

      expect(markdown).toContain('**Generated:**');
    });

    it('should escape markdown characters in SQL', () => {
      const sql = 'SELECT * FROM users WHERE name LIKE "%test%"';
      const ast = parser.astify(sql);
      const doc = generateDocumentation(sql, ast);
      const markdown = exportAsMarkdown(doc, sql);

      expect(markdown).toContain('```sql');
      expect(markdown).toContain(sql);
    });
  });
});
