/**
 * Function Extractor Tests
 *
 * Tests for extracting window functions, aggregates, and CASE statements from SQL AST.
 */

import {
    extractWindowFunctions,
    extractWindowFunctionDetails,
    extractAggregateFunctionDetails,
    extractCaseStatementDetails
} from '../../../../src/webview/parser/extractors/functions';

describe('Function Extractors', () => {
    describe('extractWindowFunctions', () => {
        it('returns empty array for null/undefined', () => {
            expect(extractWindowFunctions(null)).toEqual([]);
            expect(extractWindowFunctions(undefined)).toEqual([]);
        });

        it('returns empty array for non-array', () => {
            expect(extractWindowFunctions('not an array')).toEqual([]);
            expect(extractWindowFunctions({})).toEqual([]);
        });

        it('extracts window function with name', () => {
            const columns = [{
                expr: {
                    name: 'ROW_NUMBER',
                    over: {}
                }
            }];

            const result = extractWindowFunctions(columns);

            expect(result).toContain('ROW_NUMBER()');
        });

        it('extracts window function with nested name object', () => {
            const columns = [{
                expr: {
                    name: { name: 'RANK' },
                    over: {}
                }
            }];

            const result = extractWindowFunctions(columns);

            expect(result).toContain('RANK()');
        });

        it('extracts window function with value in name', () => {
            const columns = [{
                expr: {
                    name: { value: 'DENSE_RANK' },
                    over: {}
                }
            }];

            const result = extractWindowFunctions(columns);

            expect(result).toContain('DENSE_RANK()');
        });

        it('includes PARTITION BY clause', () => {
            const columns = [{
                expr: {
                    name: 'ROW_NUMBER',
                    over: {
                        partitionby: [
                            { column: 'dept_id' },
                            { expr: { column: 'region' } }
                        ]
                    }
                }
            }];

            const result = extractWindowFunctions(columns);

            expect(result[0]).toContain('PARTITION BY');
            expect(result[0]).toContain('dept_id');
        });

        it('defaults to WINDOW when no name found', () => {
            const columns = [{
                expr: {
                    over: {}
                }
            }];

            const result = extractWindowFunctions(columns);

            expect(result[0]).toContain('WINDOW()');
        });

        it('skips columns without over clause', () => {
            const columns = [
                { expr: { name: 'SUM' } },  // No over = not a window function
                { expr: { name: 'ROW_NUMBER', over: {} } }
            ];

            const result = extractWindowFunctions(columns);

            expect(result).toHaveLength(1);
        });
    });

    describe('extractWindowFunctionDetails', () => {
        it('returns empty array for null/undefined', () => {
            expect(extractWindowFunctionDetails(null)).toEqual([]);
            expect(extractWindowFunctionDetails(undefined)).toEqual([]);
        });

        it('extracts basic window function', () => {
            const columns = [{
                expr: {
                    name: 'ROW_NUMBER',
                    over: {}
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('ROW_NUMBER');
        });

        it('extracts PARTITION BY columns', () => {
            const columns = [{
                expr: {
                    name: 'RANK',
                    over: {
                        partitionby: [
                            { column: 'department' },
                            { column: 'region' }
                        ]
                    }
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].partitionBy).toEqual(['department', 'region']);
        });

        it('extracts ORDER BY with direction', () => {
            const columns = [{
                expr: {
                    name: 'ROW_NUMBER',
                    over: {
                        orderby: [
                            { expr: { column: 'salary' }, type: 'DESC' },
                            { expr: { column: 'name' }, type: 'ASC' }
                        ]
                    }
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].orderBy).toEqual(['salary DESC', 'name ASC']);
        });

        it('extracts frame specification', () => {
            const columns = [{
                expr: {
                    name: 'SUM',
                    over: {
                        frame: {
                            type: 'ROWS',
                            start: 'UNBOUNDED PRECEDING',
                            end: 'CURRENT ROW'
                        }
                    }
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].frame).toContain('ROWS');
        });

        it('infers function name from alias', () => {
            const columns = [{
                as: 'prev_value',
                expr: {
                    over: {}
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].name).toBe('LAG');
        });

        it('infers LEAD from alias', () => {
            const columns = [{
                as: 'next_row',
                expr: { over: {} }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].name).toBe('LEAD');
        });

        it('infers RANK from alias', () => {
            const columns = [{
                as: 'dept_rank',
                expr: { over: {} }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].name).toBe('RANK');
        });

        it('infers ROW_NUMBER from alias containing row_num', () => {
            const columns = [{
                as: 'row_num_value',
                expr: { over: {} }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].name).toBe('ROW_NUMBER');
        });

        it('infers SUM from alias containing running or total', () => {
            const columns = [{
                as: 'running_sum',
                expr: { over: {} }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].name).toBe('SUM');
        });

        it('infers AVG from alias containing avg or average', () => {
            const columns = [{
                as: 'moving_average',
                expr: { over: {} }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].name).toBe('AVG');
        });

        it('extracts function name from aggr_func type', () => {
            const columns = [{
                expr: {
                    type: 'aggr_func',
                    name: 'SUM',
                    over: {}
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].name).toBe('SUM');
        });

        it('extracts function name from function type', () => {
            const columns = [{
                expr: {
                    type: 'function',
                    name: 'NTILE',
                    over: {}
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].name).toBe('NTILE');
        });

        it('extracts function name from args.expr', () => {
            const columns = [{
                expr: {
                    args: { expr: { name: 'LAG' } },
                    over: {}
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].name).toBe('LAG');
        });

        it('handles partitionby with value property', () => {
            const columns = [{
                expr: {
                    name: 'RANK',
                    over: {
                        partitionby: [
                            { value: 'category' }
                        ]
                    }
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].partitionBy).toContain('category');
        });

        it('handles orderby without type (direction)', () => {
            const columns = [{
                expr: {
                    name: 'ROW_NUMBER',
                    over: {
                        orderby: [
                            { column: 'id' }
                        ]
                    }
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].orderBy).toContain('id');
        });

        it('handles frame without end', () => {
            const columns = [{
                expr: {
                    name: 'SUM',
                    over: {
                        frame: {
                            type: 'RANGE',
                            start: 'UNBOUNDED PRECEDING'
                        }
                    }
                }
            }];

            const result = extractWindowFunctionDetails(columns);

            expect(result[0].frame).toContain('RANGE');
        });

        it('uses dialect-specific function detection', () => {
            const columns = [{
                expr: {
                    over: {}
                }
            }];

            // Test with different dialects
            const mysqlResult = extractWindowFunctionDetails(columns, 'MySQL');
            const pgResult = extractWindowFunctionDetails(columns, 'PostgreSQL');

            expect(mysqlResult).toBeDefined();
            expect(pgResult).toBeDefined();
        });
    });

    describe('extractAggregateFunctionDetails', () => {
        it('returns empty array for null/undefined', () => {
            expect(extractAggregateFunctionDetails(null)).toEqual([]);
            expect(extractAggregateFunctionDetails(undefined)).toEqual([]);
        });

        it('extracts simple aggregate function', () => {
            const columns = [{
                expr: {
                    type: 'aggr_func',
                    name: 'COUNT',
                    args: { column: 'id' }
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('COUNT');
            expect(result[0].expression).toBe('COUNT(id)');
        });

        it('extracts aggregate with array args', () => {
            const columns = [{
                expr: {
                    type: 'aggr_func',
                    name: 'SUM',
                    args: {
                        value: [{ column: 'amount' }]
                    }
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result[0].expression).toBe('SUM(amount)');
        });

        it('captures alias', () => {
            const columns = [{
                as: 'total_count',
                expr: {
                    type: 'aggr_func',
                    name: 'COUNT'
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result[0].alias).toBe('total_count');
        });

        it('extracts nested aggregates', () => {
            const columns = [{
                expr: {
                    type: 'binary_expr',
                    operator: '+',
                    left: {
                        type: 'aggr_func',
                        name: 'SUM',
                        args: { column: 'a' }
                    },
                    right: {
                        type: 'aggr_func',
                        name: 'COUNT',
                        args: { column: 'b' }
                    }
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        it('skips non-aggregate expressions', () => {
            const columns = [{
                expr: {
                    type: 'column_ref',
                    column: 'name'
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result).toHaveLength(0);
        });

        it('extracts aggregate with expr.column in args', () => {
            const columns = [{
                expr: {
                    type: 'aggr_func',
                    name: 'AVG',
                    args: {
                        value: [{ expr: { column: 'price' } }]
                    }
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result[0].expression).toBe('AVG(price)');
        });

        it('handles aggregate with value in args', () => {
            const columns = [{
                expr: {
                    type: 'aggr_func',
                    name: 'MAX',
                    args: {
                        value: [{ value: 100 }]
                    }
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result[0].expression).toBe('MAX(100)');
        });

        it('handles aggregate with unknown arg structure', () => {
            const columns = [{
                expr: {
                    type: 'aggr_func',
                    name: 'MIN',
                    args: {
                        value: [{}]
                    }
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result[0].expression).toBe('MIN(?)');
        });

        it('recursively extracts from args.value', () => {
            const columns = [{
                expr: {
                    args: {
                        value: [{
                            type: 'aggr_func',
                            name: 'COUNT',
                            args: { column: 'id' }
                        }]
                    }
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('COUNT');
        });

        it('extracts from left/right of binary expression', () => {
            const columns = [{
                expr: {
                    type: 'binary_expr',
                    left: {
                        type: 'aggr_func',
                        name: 'SUM',
                        args: { column: 'price' }
                    },
                    right: { value: 0.1 }
                }
            }];

            const result = extractAggregateFunctionDetails(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('SUM');
        });

        it('uses dialect for function detection', () => {
            const columns = [{
                expr: {
                    type: 'aggr_func',
                    name: 'ARRAY_AGG',
                    args: { column: 'values' }
                }
            }];

            const result = extractAggregateFunctionDetails(columns, 'PostgreSQL');

            expect(result).toHaveLength(1);
        });
    });

    describe('extractCaseStatementDetails', () => {
        it('returns empty array for null/undefined', () => {
            expect(extractCaseStatementDetails(null)).toEqual([]);
            expect(extractCaseStatementDetails(undefined)).toEqual([]);
        });

        it('extracts simple CASE statement', () => {
            const columns = [{
                as: 'status_label',
                expr: {
                    type: 'case',
                    args: [
                        {
                            cond: { column: 'status', operator: '=', value: 1 },
                            result: { value: 'Active' }
                        }
                    ]
                }
            }];

            const result = extractCaseStatementDetails(columns);

            expect(result).toHaveLength(1);
            expect(result[0].alias).toBe('status_label');
            expect(result[0].conditions).toHaveLength(1);
        });

        it('extracts multiple WHEN clauses', () => {
            const columns = [{
                expr: {
                    type: 'case',
                    args: [
                        {
                            cond: {
                                type: 'binary_expr',
                                operator: '=',
                                left: { column: 'status' },
                                right: { value: 1 }
                            },
                            result: { value: 'Active' }
                        },
                        {
                            cond: {
                                type: 'binary_expr',
                                operator: '=',
                                left: { column: 'status' },
                                right: { value: 0 }
                            },
                            result: { value: 'Inactive' }
                        }
                    ]
                }
            }];

            const result = extractCaseStatementDetails(columns);

            expect(result[0].conditions).toHaveLength(2);
        });

        it('extracts ELSE clause', () => {
            const columns = [{
                expr: {
                    type: 'case',
                    args: [
                        {
                            cond: { column: 'x' },
                            result: { value: 'yes' }
                        }
                    ],
                    else: { value: 'no' }
                }
            }];

            const result = extractCaseStatementDetails(columns);

            expect(result[0].elseValue).toBe('no');
        });

        it('formats binary expression in condition', () => {
            const columns = [{
                expr: {
                    type: 'case',
                    args: [
                        {
                            cond: {
                                type: 'binary_expr',
                                operator: '>',
                                left: { column: 'age' },
                                right: { value: 18 }
                            },
                            result: { value: 'adult' }
                        }
                    ]
                }
            }];

            const result = extractCaseStatementDetails(columns);

            expect(result[0].conditions[0].when).toBe('age > 18');
        });

        it('skips non-case expressions', () => {
            const columns = [{
                expr: {
                    type: 'function',
                    name: 'COALESCE'
                }
            }];

            const result = extractCaseStatementDetails(columns);

            expect(result).toHaveLength(0);
        });

        it('skips case with no valid conditions', () => {
            const columns = [{
                expr: {
                    type: 'case',
                    args: []
                }
            }];

            const result = extractCaseStatementDetails(columns);

            expect(result).toHaveLength(0);
        });
    });
});
