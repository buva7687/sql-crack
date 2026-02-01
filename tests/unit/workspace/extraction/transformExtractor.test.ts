/**
 * Transform Extractor Tests
 *
 * Tests for extracting column transformation information from SQL queries.
 */

import { TransformExtractor } from '../../../../src/workspace/extraction/transformExtractor';

describe('TransformExtractor', () => {
    let extractor: TransformExtractor;

    beforeEach(() => {
        extractor = new TransformExtractor();
    });

    describe('extractTransformations', () => {
        it('returns empty array for null AST', () => {
            const result = extractor.extractTransformations(null, new Map());
            expect(result).toEqual([]);
        });

        it('returns empty array for AST without columns', () => {
            const result = extractor.extractTransformations({}, new Map());
            expect(result).toEqual([]);
        });

        it('returns empty array for empty columns', () => {
            const result = extractor.extractTransformations({ columns: [] }, new Map());
            expect(result).toEqual([]);
        });

        it('skips SELECT * columns', () => {
            const ast = {
                columns: [{ type: 'star' }]
            };
            const result = extractor.extractTransformations(ast, new Map());
            expect(result).toEqual([]);
        });

        it('extracts simple column reference', () => {
            const ast = {
                columns: [{
                    expr: {
                        type: 'column_ref',
                        table: 'users',
                        column: 'name'
                    }
                }]
            };

            const result = extractor.extractTransformations(ast, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].outputColumn).toBe('name');
            expect(result[0].inputColumns).toHaveLength(1);
            expect(result[0].inputColumns[0].columnName).toBe('name');
        });

        it('extracts aliased column', () => {
            const ast = {
                columns: [{
                    expr: {
                        type: 'column_ref',
                        table: 'users',
                        column: 'first_name'
                    },
                    as: 'name'
                }]
            };

            const result = extractor.extractTransformations(ast, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].outputColumn).toBe('name');
            expect(result[0].outputAlias).toBe('name');
        });

        it('extracts binary expression', () => {
            const ast = {
                columns: [{
                    expr: {
                        type: 'binary_expr',
                        operator: '+',
                        left: { type: 'column_ref', table: 't', column: 'a' },
                        right: { type: 'column_ref', table: 't', column: 'b' }
                    },
                    as: 'sum'
                }]
            };

            const result = extractor.extractTransformations(ast, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].outputColumn).toBe('sum');
            expect(result[0].inputColumns.length).toBeGreaterThanOrEqual(1);
        });

        it('extracts aggregate function', () => {
            const ast = {
                columns: [{
                    expr: {
                        type: 'aggr_func',
                        name: 'COUNT',
                        args: {
                            expr: { type: 'column_ref', table: 'users', column: 'id' }
                        }
                    },
                    as: 'user_count'
                }]
            };

            const result = extractor.extractTransformations(ast, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].outputColumn).toBe('user_count');
            expect(result[0].operation).toBe('aggregate');
        });

        it('handles table aliases', () => {
            const tableAliases = new Map([['u', 'users']]);
            const ast = {
                columns: [{
                    expr: {
                        type: 'column_ref',
                        table: 'u',
                        column: 'name'
                    }
                }]
            };

            const result = extractor.extractTransformations(ast, tableAliases);

            expect(result).toHaveLength(1);
            expect(result[0].inputColumns[0].tableName).toBe('users');
        });
    });

    describe('parseExpression', () => {
        it('returns empty array for null expression', () => {
            const result = extractor.parseExpression(null, new Map());
            expect(result).toEqual([]);
        });

        it('extracts column from simple reference', () => {
            const expr = {
                type: 'column_ref',
                table: 'users',
                column: 'email'
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].columnName).toBe('email');
            expect(result[0].tableName).toBe('users');
        });

        it('extracts columns from binary expression', () => {
            const expr = {
                type: 'binary_expr',
                operator: '+',
                left: { type: 'column_ref', table: 't', column: 'price' },
                right: { type: 'column_ref', table: 't', column: 'tax' }
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result).toHaveLength(2);
            expect(result.map(c => c.columnName).sort()).toEqual(['price', 'tax']);
        });

        it('extracts columns from unary expression', () => {
            const expr = {
                type: 'unary_expr',
                operator: '-',
                expr: { type: 'column_ref', table: 't', column: 'amount' }
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].columnName).toBe('amount');
        });

        it('extracts columns from function call', () => {
            const expr = {
                type: 'function',
                name: 'UPPER',
                args: {
                    expr: { type: 'column_ref', table: 't', column: 'name' }
                }
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].columnName).toBe('name');
        });

        it('extracts columns from aggregate function', () => {
            const expr = {
                type: 'aggr_func',
                name: 'SUM',
                args: {
                    expr: { type: 'column_ref', table: 't', column: 'amount' }
                }
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].columnName).toBe('amount');
        });

        it('extracts columns from CASE expression', () => {
            const expr = {
                type: 'case',
                args: [
                    {
                        cond: { type: 'column_ref', table: 't', column: 'status' },
                        result: { type: 'column_ref', table: 't', column: 'active_value' }
                    }
                ]
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it('extracts columns from CAST expression', () => {
            const expr = {
                type: 'cast',
                expr: { type: 'column_ref', table: 't', column: 'value' }
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].columnName).toBe('value');
        });

        it('extracts columns from window function', () => {
            const expr = {
                type: 'window_func',
                name: 'ROW_NUMBER',
                args: {
                    expr: { type: 'column_ref', table: 't', column: 'id' }
                },
                over: {
                    partitionby: [{ type: 'column_ref', column: 'category' }],
                    orderby: [{ expr: { type: 'column_ref', column: 'date' } }]
                }
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it('handles subquery gracefully', () => {
            const expr = {
                type: 'select',
                columns: []
            };

            const result = extractor.parseExpression(expr, new Map());

            // Subqueries are not recursively processed
            expect(result).toEqual([]);
        });

        it('resolves table aliases', () => {
            const tableAliases = new Map([['u', 'users'], ['o', 'orders']]);
            const expr = {
                type: 'binary_expr',
                operator: '=',
                left: { type: 'column_ref', table: 'u', column: 'id' },
                right: { type: 'column_ref', table: 'o', column: 'user_id' }
            };

            const result = extractor.parseExpression(expr, tableAliases);

            expect(result).toHaveLength(2);
            const tableNames = result.map(c => c.tableName);
            expect(tableNames).toContain('users');
            expect(tableNames).toContain('orders');
        });
    });

    describe('constructor options', () => {
        it('accepts custom options', () => {
            const customExtractor = new TransformExtractor({
                dialect: 'PostgreSQL',
                maxSubqueryDepth: 5
            });

            expect(customExtractor).toBeDefined();
        });

        it('uses default options when none provided', () => {
            const defaultExtractor = new TransformExtractor();
            expect(defaultExtractor).toBeDefined();
        });
    });
});
