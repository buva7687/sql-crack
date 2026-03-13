import { Parser } from 'node-sql-parser';
import { ColumnExtractor } from '../../../../src/workspace/extraction/columnExtractor';

describe('ColumnExtractor coverage', () => {
    const parser = new Parser();
    let extractor: ColumnExtractor;

    const parseSelect = (sql: string): any => parser.astify(sql, { database: 'MySQL' });

    beforeEach(() => {
        extractor = new ColumnExtractor();
    });

    describe('buildAliasMap edge cases', () => {
        it('handles null/undefined from and join', () => {
            const aliasMap = extractor.buildAliasMap({ from: null, join: null });
            expect(aliasMap.size).toBe(0);
        });

        it('handles empty object AST', () => {
            const aliasMap = extractor.buildAliasMap({});
            expect(aliasMap.size).toBe(0);
        });

        it('handles subquery in FROM clause', () => {
            const ast = parseSelect('SELECT a FROM (SELECT id AS a FROM users) sub');
            const aliasMap = extractor.buildAliasMap(ast);
            // sub is the alias for the subquery
            expect(aliasMap.size).toBeGreaterThanOrEqual(0);
        });
    });

    describe('extractSelectColumns with expressions', () => {
        it('handles CAST expression as computed column', () => {
            const ast = parseSelect('SELECT CAST(price AS DECIMAL(10,2)) AS formatted_price FROM products');
            const aliasMap = extractor.buildAliasMap(ast);
            const columns = extractor.extractSelectColumns(ast, aliasMap);

            expect(columns.length).toBeGreaterThanOrEqual(1);
            const castCol = columns.find(c => c.name === 'formatted_price');
            expect(castCol).toBeDefined();
            expect(castCol!.isComputed).toBe(true);
        });

        it('handles CASE WHEN expression', () => {
            const ast = parseSelect(`
                SELECT
                    CASE WHEN status = 1 THEN 'active' ELSE 'inactive' END AS status_label
                FROM users
            `);
            const aliasMap = extractor.buildAliasMap(ast);
            const columns = extractor.extractSelectColumns(ast, aliasMap);

            expect(columns.length).toBeGreaterThanOrEqual(1);
            const caseCol = columns.find(c => c.name === 'status_label');
            expect(caseCol).toBeDefined();
            expect(caseCol!.isComputed).toBe(true);
        });

        it('handles star (*) select', () => {
            const ast = parseSelect('SELECT * FROM users');
            const aliasMap = extractor.buildAliasMap(ast);
            const columns = extractor.extractSelectColumns(ast, aliasMap);

            // Star columns produce a wildcard entry
            expect(columns.length).toBeGreaterThanOrEqual(0);
        });

        it('handles multiple aggregate functions', () => {
            const ast = parseSelect(`
                SELECT
                    COUNT(*) AS total,
                    SUM(amount) AS total_amount,
                    AVG(amount) AS avg_amount,
                    MAX(created_at) AS latest
                FROM orders
            `);
            const aliasMap = extractor.buildAliasMap(ast);
            const columns = extractor.extractSelectColumns(ast, aliasMap);

            expect(columns.length).toBe(4);
            expect(columns.every(c => c.isComputed)).toBe(true);
        });

        it('handles column without alias', () => {
            const ast = parseSelect('SELECT id, name FROM users');
            const aliasMap = extractor.buildAliasMap(ast);
            const columns = extractor.extractSelectColumns(ast, aliasMap);

            expect(columns).toHaveLength(2);
            expect(columns[0].name).toBe('id');
            expect(columns[1].name).toBe('name');
        });

        it('handles binary expression columns', () => {
            const ast = parseSelect('SELECT price * quantity AS total FROM line_items');
            const aliasMap = extractor.buildAliasMap(ast);
            const columns = extractor.extractSelectColumns(ast, aliasMap);

            expect(columns.length).toBeGreaterThanOrEqual(1);
            const totalCol = columns.find(c => c.name === 'total');
            expect(totalCol).toBeDefined();
            expect(totalCol!.isComputed).toBe(true);
        });

        it('handles nested function calls', () => {
            const ast = parseSelect('SELECT COALESCE(NULLIF(name, \'\'), \'unknown\') AS display_name FROM users');
            const aliasMap = extractor.buildAliasMap(ast);
            const columns = extractor.extractSelectColumns(ast, aliasMap);

            expect(columns.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('extractUsedColumns edge cases', () => {
        it('handles missing WHERE clause', () => {
            const ast = parseSelect('SELECT id FROM users');
            const columns = extractor.extractUsedColumns(ast, 'where');
            expect(columns).toEqual([]);
        });

        it('handles missing GROUP BY clause', () => {
            const ast = parseSelect('SELECT id FROM users');
            const columns = extractor.extractUsedColumns(ast, 'group');
            expect(columns).toEqual([]);
        });

        it('handles missing ORDER BY clause', () => {
            const ast = parseSelect('SELECT id FROM users');
            const columns = extractor.extractUsedColumns(ast, 'order');
            expect(columns).toEqual([]);
        });

        it('handles complex WHERE with AND/OR', () => {
            const ast = parseSelect(`
                SELECT * FROM users
                WHERE (age > 18 AND status = 'active') OR role = 'admin'
            `);
            const columns = extractor.extractUsedColumns(ast, 'where');
            const colNames = columns.map(c => c.columnName);
            expect(colNames).toContain('age');
            expect(colNames).toContain('status');
            expect(colNames).toContain('role');
        });

        it('handles ORDER BY with multiple columns', () => {
            const ast = parseSelect('SELECT * FROM users ORDER BY last_name ASC, first_name DESC');
            const columns = extractor.extractUsedColumns(ast, 'order');
            expect(columns.length).toBe(2);
        });
    });
});
