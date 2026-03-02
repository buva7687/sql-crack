import { Parser } from 'node-sql-parser';
import { ColumnExtractor } from '../../../../src/workspace/extraction/columnExtractor';

describe('ColumnExtractor', () => {
    const parser = new Parser();
    let extractor: ColumnExtractor;

    const parseSelect = (sql: string): any => parser.astify(sql, { database: 'MySQL' });

    beforeEach(() => {
        extractor = new ColumnExtractor();
    });

    it('builds alias mappings for base tables and joined tables', () => {
        const ast = parseSelect('SELECT * FROM users u JOIN orders o ON u.id = o.user_id');

        const aliasMap = extractor.buildAliasMap(ast);

        expect(aliasMap.get('u')).toBe('users');
        expect(aliasMap.get('users')).toBe('users');
        expect(aliasMap.get('o')).toBe('orders');
        expect(aliasMap.get('orders')).toBe('orders');
    });

    it('extracts direct and computed select columns with resolved source tables', () => {
        const ast = parseSelect('SELECT u.id, u.name AS full_name, COUNT(*) AS total FROM users u');
        const aliasMap = extractor.buildAliasMap(ast);

        const columns = extractor.extractSelectColumns(ast, aliasMap);

        expect(columns).toHaveLength(3);
        expect(columns[0]).toMatchObject({
            name: 'id',
            sourceTable: 'users',
            sourceColumn: 'id',
            isComputed: false,
        });
        expect(columns[1]).toMatchObject({
            name: 'full_name',
            sourceTable: 'users',
            sourceColumn: 'name',
            isComputed: false,
        });
        expect(columns[2]).toMatchObject({
            name: 'total',
            isComputed: true,
        });
        expect(columns[2].expression).toContain('COUNT');
    });

    it('extracts columns used in WHERE and JOIN clauses', () => {
        const ast = parseSelect(`
            SELECT *
            FROM users u
            JOIN orders o ON u.id = o.user_id
            WHERE u.active = 1
        `);

        const joinColumns = extractor.extractUsedColumns(ast, 'join');
        const whereColumns = extractor.extractUsedColumns(ast, 'where');

        expect(joinColumns).toEqual(expect.arrayContaining([
            expect.objectContaining({ columnName: 'id', tableName: 'u', usedIn: 'join' }),
            expect.objectContaining({ columnName: 'user_id', tableName: 'o', usedIn: 'join' }),
        ]));
        expect(whereColumns).toEqual([
            expect.objectContaining({ columnName: 'active', tableName: 'u', usedIn: 'where' }),
        ]);
    });

    it('extracts GROUP BY, HAVING, and ORDER BY column references from parser AST shapes', () => {
        const ast = parseSelect(`
            SELECT customer_id, SUM(amount) AS total
            FROM orders
            GROUP BY customer_id
            HAVING SUM(amount) > 100
            ORDER BY customer_id
        `);

        const groupColumns = extractor.extractUsedColumns(ast, 'group');
        const havingColumns = extractor.extractUsedColumns(ast, 'having');
        const orderColumns = extractor.extractUsedColumns(ast, 'order');

        expect(groupColumns).toEqual([
            expect.objectContaining({ columnName: 'customer_id', usedIn: 'group' }),
        ]);
        expect(havingColumns).toEqual([
            expect.objectContaining({ columnName: 'amount', usedIn: 'having' }),
        ]);
        expect(orderColumns).toEqual([
            expect.objectContaining({ columnName: 'customer_id', usedIn: 'order' }),
        ]);
    });
});
