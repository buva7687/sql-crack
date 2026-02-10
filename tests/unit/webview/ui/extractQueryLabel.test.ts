import { extractQueryLabel } from '../../../../src/webview/ui/batchTabs';

describe('extractQueryLabel', () => {
    it('extracts INSERT INTO table', () => {
        expect(extractQueryLabel('INSERT INTO orders VALUES (1, 2, 3)')).toBe('INSERT orders');
    });

    it('extracts CREATE TABLE name', () => {
        expect(extractQueryLabel('CREATE TABLE users (id INT, name TEXT)')).toBe('CREATE users');
    });

    it('extracts CREATE VIEW name', () => {
        expect(extractQueryLabel('CREATE VIEW active_users AS SELECT * FROM users')).toBe('CREATE active_users');
    });

    it('extracts CREATE OR REPLACE VIEW', () => {
        expect(extractQueryLabel('CREATE OR REPLACE VIEW report AS SELECT 1')).toBe('CREATE report');
    });

    it('extracts CREATE TABLE IF NOT EXISTS', () => {
        expect(extractQueryLabel('CREATE TABLE IF NOT EXISTS logs (id INT)')).toBe('CREATE logs');
    });

    it('extracts UPDATE table', () => {
        expect(extractQueryLabel('UPDATE users SET name = "John"')).toBe('UPDATE users');
    });

    it('extracts DELETE FROM table', () => {
        expect(extractQueryLabel('DELETE FROM old_records WHERE created_at < NOW()')).toBe('DELETE old_records');
    });

    it('extracts MERGE INTO table', () => {
        expect(extractQueryLabel('MERGE INTO target USING source ON target.id = source.id')).toBe('MERGE target');
    });

    it('extracts ALTER TABLE', () => {
        expect(extractQueryLabel('ALTER TABLE users ADD COLUMN email TEXT')).toBe('ALTER users');
    });

    it('extracts DROP TABLE', () => {
        expect(extractQueryLabel('DROP TABLE IF EXISTS temp_data')).toBe('DROP temp_data');
    });

    it('extracts CTE name', () => {
        expect(extractQueryLabel('WITH active AS (SELECT * FROM users) SELECT * FROM active')).toBe('CTE active');
    });

    it('extracts SELECT FROM table', () => {
        expect(extractQueryLabel('SELECT id, name FROM customers WHERE active = 1')).toBe('SELECT customers');
    });

    it('falls back to Q index when no pattern matches', () => {
        expect(extractQueryLabel('GRANT ALL ON schema TO user', 0)).toBe('Q1');
        expect(extractQueryLabel('GRANT ALL ON schema TO user', 4)).toBe('Q5');
    });

    it('falls back to Q? when no index provided', () => {
        expect(extractQueryLabel('GRANT ALL ON schema TO user')).toBe('Q?');
    });

    it('truncates long labels to 20 chars', () => {
        const result = extractQueryLabel('SELECT * FROM very_long_table_name_that_exceeds_limit');
        expect(result.length).toBeLessThanOrEqual(20);
        expect(result).toContain('\u2026');
    });

    it('handles whitespace normalization', () => {
        expect(extractQueryLabel('  SELECT   *   FROM   orders  ')).toBe('SELECT orders');
    });

    it('is case-insensitive', () => {
        expect(extractQueryLabel('select * from Users')).toBe('SELECT Users');
        expect(extractQueryLabel('insert into ORDERS values (1)')).toBe('INSERT ORDERS');
    });

    it('extracts CREATE TEMP TABLE', () => {
        expect(extractQueryLabel('CREATE TEMPORARY TABLE tmp (id INT)')).toBe('CREATE tmp');
    });

    it('strips line comments before matching', () => {
        const sql = '-- This is a comment\n-- Another comment\nSELECT * FROM orders';
        expect(extractQueryLabel(sql)).toBe('SELECT orders');
    });

    it('strips block comments before matching', () => {
        const sql = '/* header comment */\nSELECT id FROM users';
        expect(extractQueryLabel(sql)).toBe('SELECT users');
    });

    it('strips mixed comments before matching', () => {
        const sql = '-- ============\n-- JOIN Patterns\n-- ============\nINSERT INTO logs VALUES (1)';
        expect(extractQueryLabel(sql)).toBe('INSERT logs');
    });

    it('falls back when SQL is only comments', () => {
        expect(extractQueryLabel('-- just a comment', 0)).toBe('Q1');
    });
});
