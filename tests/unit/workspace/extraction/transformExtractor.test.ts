/**
 * Transform Extractor Tests
 *
 * Tests for extracting column transformation information from SQL queries.
 */

import { TransformExtractor } from '../../../../src/workspace/extraction/transformExtractor';
import type { AstSelectStatement, AstExpression } from '../../../../src/workspace/extraction/astTypes';

describe('TransformExtractor', () => {
    let extractor: TransformExtractor;

    beforeEach(() => {
        extractor = new TransformExtractor();
    });

    describe('extractTransformations', () => {
        it('returns empty array for null AST', () => {
            const result = extractor.extractTransformations(null as unknown as AstSelectStatement, new Map());
            expect(result).toEqual([]);
        });

        it('returns empty array for AST without columns', () => {
            const result = extractor.extractTransformations({} as AstSelectStatement, new Map());
            expect(result).toEqual([]);
        });

        it('returns empty array for empty columns', () => {
            const result = extractor.extractTransformations({ columns: [] } as unknown as AstSelectStatement, new Map());
            expect(result).toEqual([]);
        });

        it('skips SELECT * columns', () => {
            const ast = {
                columns: [{ type: 'star' }]
            };
            const result = extractor.extractTransformations(ast as AstSelectStatement, new Map());
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

            const result = extractor.extractTransformations(ast as AstSelectStatement, new Map());

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

            const result = extractor.extractTransformations(ast as AstSelectStatement, new Map());

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

            const result = extractor.extractTransformations(ast as AstSelectStatement, new Map());

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

            const result = extractor.extractTransformations(ast as AstSelectStatement, new Map());

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

            const result = extractor.extractTransformations(ast as AstSelectStatement, tableAliases);

            expect(result).toHaveLength(1);
            expect(result[0].inputColumns[0].tableName).toBe('users');
        });
    });

    describe('parseExpression', () => {
        it('returns empty array for null expression', () => {
            const result = extractor.parseExpression(null as unknown as AstExpression, new Map());
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

    describe('constructor', () => {
        it('creates an instance', () => {
            const newExtractor = new TransformExtractor();
            expect(newExtractor).toBeDefined();
        });
    });

    describe('classifyTransformation', () => {
        it('returns direct for column_ref', () => {
            const result = extractor.classifyTransformation({ type: 'column_ref' });
            expect(result).toBe('direct');
        });

        it('returns aggregate for aggr_func', () => {
            const result = extractor.classifyTransformation({ type: 'aggr_func' });
            expect(result).toBe('aggregate');
        });

        it('returns case for case expressions', () => {
            const result = extractor.classifyTransformation({ type: 'case' });
            expect(result).toBe('case');
        });

        it('returns cast for cast expressions', () => {
            const result = extractor.classifyTransformation({ type: 'cast' });
            expect(result).toBe('cast');
        });

        it('returns window for window_func', () => {
            const result = extractor.classifyTransformation({ type: 'window_func' });
            expect(result).toBe('window');
        });

        it('returns subquery for subquery type', () => {
            const result = extractor.classifyTransformation({ type: 'subquery' });
            expect(result).toBe('subquery');
        });

        it('returns complex for unary_expr', () => {
            const result = extractor.classifyTransformation({ type: 'unary_expr' });
            expect(result).toBe('complex');
        });

        it('returns complex for null/undefined', () => {
            expect(extractor.classifyTransformation(null as unknown as AstExpression)).toBe('complex');
            expect(extractor.classifyTransformation(undefined as unknown as AstExpression)).toBe('complex');
            expect(extractor.classifyTransformation({} as AstExpression)).toBe('complex');
        });

        it('returns complex for unknown type', () => {
            const result = extractor.classifyTransformation({ type: 'unknown_type' });
            expect(result).toBe('complex');
        });

        it('returns arithmetic for binary_expr with +', () => {
            const result = extractor.classifyTransformation({
                type: 'binary_expr',
                operator: '+'
            });
            expect(result).toBe('arithmetic');
        });

        it('returns arithmetic for binary_expr with -', () => {
            const result = extractor.classifyTransformation({
                type: 'binary_expr',
                operator: '-'
            });
            expect(result).toBe('arithmetic');
        });

        it('returns arithmetic for binary_expr with *', () => {
            const result = extractor.classifyTransformation({
                type: 'binary_expr',
                operator: '*'
            });
            expect(result).toBe('arithmetic');
        });

        it('returns concat for binary_expr with ||', () => {
            const result = extractor.classifyTransformation({
                type: 'binary_expr',
                operator: '||'
            });
            expect(result).toBe('concat');
        });

        it('returns complex for comparison operators', () => {
            expect(extractor.classifyTransformation({
                type: 'binary_expr',
                operator: '='
            })).toBe('complex');

            expect(extractor.classifyTransformation({
                type: 'binary_expr',
                operator: '<'
            })).toBe('complex');

            expect(extractor.classifyTransformation({
                type: 'binary_expr',
                operator: 'LIKE'
            })).toBe('complex');
        });

        it('returns complex for logical operators', () => {
            expect(extractor.classifyTransformation({
                type: 'binary_expr',
                operator: 'AND'
            })).toBe('complex');

            expect(extractor.classifyTransformation({
                type: 'binary_expr',
                operator: 'OR'
            })).toBe('complex');
        });

        it('returns scalar for function type', () => {
            const result = extractor.classifyTransformation({
                type: 'function',
                name: 'UPPER'
            });
            expect(result).toBe('scalar');
        });

        it('returns scalar for string functions', () => {
            const stringFuncs = ['UPPER', 'LOWER', 'TRIM', 'CONCAT', 'COALESCE'];
            for (const name of stringFuncs) {
                const result = extractor.classifyTransformation({
                    type: 'function',
                    name
                });
                expect(result).toBe('scalar');
            }
        });

        it('returns scalar for date functions', () => {
            const dateFuncs = ['DATE', 'YEAR', 'MONTH', 'NOW', 'CURRENT_DATE'];
            for (const name of dateFuncs) {
                const result = extractor.classifyTransformation({
                    type: 'function',
                    name
                });
                expect(result).toBe('scalar');
            }
        });

        it('returns scalar for math functions', () => {
            const mathFuncs = ['ABS', 'CEIL', 'FLOOR', 'ROUND', 'SQRT'];
            for (const name of mathFuncs) {
                const result = extractor.classifyTransformation({
                    type: 'function',
                    name
                });
                expect(result).toBe('scalar');
            }
        });

        it('returns scalar for unknown functions', () => {
            const result = extractor.classifyTransformation({
                type: 'function',
                name: 'CUSTOM_FUNCTION'
            });
            expect(result).toBe('scalar');
        });

        it('returns scalar for function without name', () => {
            const result = extractor.classifyTransformation({
                type: 'function'
            });
            expect(result).toBe('scalar');
        });
    });

    describe('parseExpression edge cases', () => {
        it('extracts columns from aggregate with ORDER BY', () => {
            const expr = {
                type: 'aggr_func',
                name: 'ARRAY_AGG',
                args: {
                    expr: { type: 'column_ref', table: 't', column: 'value' }
                },
                orderby: [
                    { expr: { type: 'column_ref', table: 't', column: 'sort_col' } }
                ]
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it('extracts columns from CASE with ELSE clause', () => {
            const expr = {
                type: 'case',
                args: [
                    {
                        cond: { type: 'column_ref', table: 't', column: 'status' },
                        result: { type: 'column_ref', table: 't', column: 'active_val' }
                    }
                ],
                else: { type: 'column_ref', table: 't', column: 'default_val' }
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        it('extracts columns from window function with PARTITION BY', () => {
            const expr = {
                type: 'window_func',
                name: 'ROW_NUMBER',
                args: { expr: { type: 'column_ref', table: 't', column: 'id' } },
                partitionby: [
                    { type: 'column_ref', table: 't', column: 'category' }
                ]
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it('extracts columns from window function with ORDER BY', () => {
            const expr = {
                type: 'window_func',
                name: 'RANK',
                args: { expr: { type: 'column_ref', table: 't', column: 'id' } },
                orderby: [
                    { expr: { type: 'column_ref', table: 't', column: 'score' } }
                ]
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it('extracts columns from function with array args', () => {
            const expr = {
                type: 'function',
                name: 'CONCAT',
                args: {
                    expr: [
                        { type: 'column_ref', table: 't', column: 'first_name' },
                        { type: 'column_ref', table: 't', column: 'last_name' }
                    ]
                }
            };

            const result = extractor.parseExpression(expr, new Map());

            expect(result).toHaveLength(2);
        });
    });

    describe('extractTransformations edge cases', () => {
        it('generates output name for non-column expression', () => {
            const ast = {
                columns: [{
                    expr: {
                        type: 'function',
                        name: 'NOW'
                    }
                    // No alias
                }]
            };

            const result = extractor.extractTransformations(ast as AstSelectStatement, new Map());

            expect(result).toHaveLength(1);
            expect(result[0].outputColumn).toBeDefined();
        });

        it('handles column with missing expr gracefully', () => {
            const ast = {
                columns: [{ as: 'test' }]  // No expr
            };

            const result = extractor.extractTransformations(ast as AstSelectStatement, new Map());

            expect(result).toHaveLength(0);
        });
    });
});
