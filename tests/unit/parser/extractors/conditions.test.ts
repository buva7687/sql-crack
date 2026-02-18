/**
 * Condition Extractor Tests
 *
 * Tests for extracting WHERE conditions from SQL AST.
 */

import {
    extractConditions,
    formatConditionRecursive,
    formatCondition
} from '../../../../src/webview/parser/extractors/conditions';

describe('Condition Extractors', () => {
    describe('formatCondition', () => {
        it('formats simple binary expression', () => {
            const expr = {
                type: 'binary_expr',
                operator: '=',
                left: { column: 'id' },
                right: { value: 1 }
            };

            expect(formatCondition(expr)).toBe('id = 1');
        });

        it('formats comparison with column names', () => {
            const expr = {
                type: 'binary_expr',
                operator: '>',
                left: { column: 'age' },
                right: { value: 18 }
            };

            expect(formatCondition(expr)).toBe('age > 18');
        });

        it('formats comparison between two columns', () => {
            const expr = {
                type: 'binary_expr',
                operator: '=',
                left: { column: 'a.id' },
                right: { column: 'b.id' }
            };

            expect(formatCondition(expr)).toBe('a.id = b.id');
        });

        it('formats wrapped column_ref identifiers without [object Object]', () => {
            const expr = {
                type: 'binary_expr',
                operator: '>',
                left: {
                    type: 'column_ref',
                    table: 'cs',
                    column: { expr: { type: 'default', value: 'total_orders' } }
                },
                right: { type: 'number', value: 0 }
            };

            expect(formatCondition(expr)).toBe('cs.total_orders > 0');
        });

        it('formats IN lists from expr_list nodes', () => {
            const expr = {
                type: 'binary_expr',
                operator: 'IN',
                left: {
                    type: 'column_ref',
                    table: null,
                    column: { expr: { type: 'default', value: 'customer_tier' } }
                },
                right: {
                    type: 'expr_list',
                    value: [
                        { type: 'single_quote_string', value: 'Platinum' },
                        { type: 'single_quote_string', value: 'Gold' }
                    ]
                }
            };

            expect(formatCondition(expr)).toBe('customer_tier IN Platinum, Gold');
        });

        it('returns "?" for null/undefined input', () => {
            expect(formatCondition(null)).toBe('?');
            expect(formatCondition(undefined)).toBe('?');
        });

        it('returns "condition" for non-binary expression', () => {
            expect(formatCondition({ type: 'function' })).toBe('condition');
            expect(formatCondition({})).toBe('condition');
        });

        it('handles missing left/right values', () => {
            const expr = {
                type: 'binary_expr',
                operator: '=',
                left: {},
                right: {}
            };

            expect(formatCondition(expr)).toBe('? = ?');
        });
    });

    describe('formatConditionRecursive', () => {
        it('extracts single condition', () => {
            const conditions: string[] = [];
            const expr = {
                type: 'binary_expr',
                operator: '=',
                left: { column: 'status' },
                right: { value: 'active' }
            };

            formatConditionRecursive(expr, conditions);

            expect(conditions).toEqual(['status = active']);
        });

        it('extracts conditions from AND', () => {
            const conditions: string[] = [];
            const expr = {
                type: 'binary_expr',
                operator: 'AND',
                left: {
                    type: 'binary_expr',
                    operator: '=',
                    left: { column: 'a' },
                    right: { value: 1 }
                },
                right: {
                    type: 'binary_expr',
                    operator: '=',
                    left: { column: 'b' },
                    right: { value: 2 }
                }
            };

            formatConditionRecursive(expr, conditions);

            expect(conditions).toEqual(['a = 1', 'b = 2']);
        });

        it('extracts conditions from OR', () => {
            const conditions: string[] = [];
            const expr = {
                type: 'binary_expr',
                operator: 'OR',
                left: {
                    type: 'binary_expr',
                    operator: '=',
                    left: { column: 'x' },
                    right: { value: 1 }
                },
                right: {
                    type: 'binary_expr',
                    operator: '=',
                    left: { column: 'y' },
                    right: { value: 2 }
                }
            };

            formatConditionRecursive(expr, conditions);

            expect(conditions).toEqual(['x = 1', 'y = 2']);
        });

        it('stops at depth 3', () => {
            const conditions: string[] = [];
            // Create deeply nested structure
            const deepExpr = {
                type: 'binary_expr',
                operator: 'AND',
                left: {
                    type: 'binary_expr',
                    operator: 'AND',
                    left: {
                        type: 'binary_expr',
                        operator: 'AND',
                        left: {
                            type: 'binary_expr',
                            operator: 'AND',
                            left: {
                                type: 'binary_expr',
                                operator: '=',
                                left: { column: 'deep' },
                                right: { value: 1 }
                            },
                            right: {
                                type: 'binary_expr',
                                operator: '=',
                                left: { column: 'too_deep' },
                                right: { value: 2 }
                            }
                        },
                        right: {
                            type: 'binary_expr',
                            operator: '=',
                            left: { column: 'c' },
                            right: { value: 3 }
                        }
                    },
                    right: {
                        type: 'binary_expr',
                        operator: '=',
                        left: { column: 'b' },
                        right: { value: 2 }
                    }
                },
                right: {
                    type: 'binary_expr',
                    operator: '=',
                    left: { column: 'a' },
                    right: { value: 1 }
                }
            };

            formatConditionRecursive(deepExpr, conditions);

            // Should not include conditions from depth > 3
            expect(conditions.length).toBeLessThanOrEqual(4);
        });

        it('handles null expression', () => {
            const conditions: string[] = [];
            formatConditionRecursive(null, conditions);
            expect(conditions).toEqual([]);
        });
    });

    describe('extractConditions', () => {
        it('extracts conditions and limits to 5', () => {
            // Create 7 conditions
            let expr: any = {
                type: 'binary_expr',
                operator: '=',
                left: { column: 'c1' },
                right: { value: 1 }
            };

            for (let i = 2; i <= 7; i++) {
                expr = {
                    type: 'binary_expr',
                    operator: 'AND',
                    left: expr,
                    right: {
                        type: 'binary_expr',
                        operator: '=',
                        left: { column: `c${i}` },
                        right: { value: i }
                    }
                };
            }

            const conditions = extractConditions(expr);

            expect(conditions.length).toBeLessThanOrEqual(5);
        });

        it('returns empty array for null', () => {
            expect(extractConditions(null)).toEqual([]);
        });

        it('extracts mixed AND/OR conditions', () => {
            const expr = {
                type: 'binary_expr',
                operator: 'AND',
                left: {
                    type: 'binary_expr',
                    operator: 'OR',
                    left: {
                        type: 'binary_expr',
                        operator: '=',
                        left: { column: 'status' },
                        right: { value: 'active' }
                    },
                    right: {
                        type: 'binary_expr',
                        operator: '=',
                        left: { column: 'status' },
                        right: { value: 'pending' }
                    }
                },
                right: {
                    type: 'binary_expr',
                    operator: '>',
                    left: { column: 'created_at' },
                    right: { value: '2024-01-01' }
                }
            };

            const conditions = extractConditions(expr);

            expect(conditions.length).toBeGreaterThan(0);
            expect(conditions.length).toBeLessThanOrEqual(5);
        });
    });
});
