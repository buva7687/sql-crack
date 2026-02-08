/**
 * Table Extractor Tests
 *
 * Tests for extracting table names from SQL AST.
 */

import {
    getTableName,
    extractTablesFromStatement,
    getTableValuedFunctionName
} from '../../../../src/webview/parser/extractors/tables';

describe('Table Extractors', () => {
    describe('getTableName', () => {
        it('returns string as-is', () => {
            expect(getTableName('users')).toBe('users');
            expect(getTableName('orders')).toBe('orders');
        });

        it('extracts table from object with table property (string)', () => {
            expect(getTableName({ table: 'users' })).toBe('users');
        });

        it('extracts table from nested object', () => {
            expect(getTableName({ table: { table: 'users' } })).toBe('users');
            expect(getTableName({ table: { name: 'orders' } })).toBe('orders');
            expect(getTableName({ table: { value: 'products' } })).toBe('products');
        });

        it('falls back to alias when table is object without name', () => {
            expect(getTableName({ table: {}, as: 'u' })).toBe('u');
        });

        it('extracts from name property', () => {
            expect(getTableName({ name: 'categories' })).toBe('categories');
        });

        it('extracts from as property', () => {
            expect(getTableName({ as: 'alias' })).toBe('alias');
        });

        it('returns "table" as fallback', () => {
            expect(getTableName({})).toBe('table');
            expect(getTableName({ foo: 'bar' })).toBe('table');
        });

        it('handles null/undefined in nested structure', () => {
            expect(getTableName({ table: null })).toBe('table');
            expect(getTableName({ table: { table: null } })).toBe('table');
        });
    });

    describe('extractTablesFromStatement', () => {
        it('extracts single table from FROM', () => {
            const stmt = {
                from: [{ table: 'users' }]
            };

            expect(extractTablesFromStatement(stmt)).toEqual(['users']);
        });

        it('extracts multiple tables from FROM', () => {
            const stmt = {
                from: [
                    { table: 'users' },
                    { table: 'orders' },
                    { table: 'products' }
                ]
            };

            expect(extractTablesFromStatement(stmt)).toEqual(['users', 'orders', 'products']);
        });

        it('handles non-array from clause', () => {
            const stmt = {
                from: { table: 'users' }
            };

            expect(extractTablesFromStatement(stmt)).toEqual(['users']);
        });

        it('returns empty array for null/undefined statement', () => {
            expect(extractTablesFromStatement(null)).toEqual([]);
            expect(extractTablesFromStatement(undefined)).toEqual([]);
        });

        it('returns empty array when no from clause', () => {
            expect(extractTablesFromStatement({})).toEqual([]);
            expect(extractTablesFromStatement({ select: '*' })).toEqual([]);
        });

        it('filters out generic "table" fallback names', () => {
            const stmt = {
                from: [
                    { table: 'users' },
                    {},  // Will produce "table"
                    { table: 'orders' }
                ]
            };

            const result = extractTablesFromStatement(stmt);

            expect(result).toEqual(['users', 'orders']);
            expect(result).not.toContain('table');
        });

        it('extracts tables with aliases', () => {
            const stmt = {
                from: [
                    { table: 'users', as: 'u' },
                    { table: 'orders', as: 'o' }
                ]
            };

            // Should get actual table names, not aliases
            expect(extractTablesFromStatement(stmt)).toEqual(['users', 'orders']);
        });

        it('handles subquery references', () => {
            const stmt = {
                from: [
                    { table: 'users' },
                    { name: 'subquery_alias', as: 'sq' }
                ]
            };

            expect(extractTablesFromStatement(stmt)).toContain('users');
        });

        it('handles schema-qualified table names', () => {
            const stmt = {
                from: [
                    { table: 'public.users' },
                    { table: 'sales.orders' }
                ]
            };

            expect(extractTablesFromStatement(stmt)).toEqual(['public.users', 'sales.orders']);
        });

        it('extracts table-valued function names from FROM items', () => {
            const stmt = {
                from: [
                    {
                        type: 'expr',
                        expr: {
                            type: 'function',
                            name: { name: [{ type: 'default', value: 'OPENJSON' }] },
                            args: { type: 'expr_list', value: [] }
                        },
                        as: 'j'
                    },
                    { table: 'orders' }
                ]
            };

            expect(extractTablesFromStatement(stmt, 'TransactSQL')).toEqual(['OPENJSON', 'orders']);
        });

        it('extracts wrapped TABLE(FLATTEN(...)) as FLATTEN', () => {
            const stmt = {
                from: [
                    {
                        type: 'expr',
                        expr: {
                            type: 'function',
                            name: { name: [{ type: 'default', value: 'TABLE' }] },
                            args: {
                                type: 'expr_list',
                                value: [
                                    {
                                        type: 'flatten',
                                        name: { name: [{ type: 'default', value: 'FLATTEN' }] },
                                        args: { type: 'flattern' }
                                    }
                                ]
                            }
                        },
                        as: 'f'
                    }
                ]
            };

            expect(extractTablesFromStatement(stmt, 'Snowflake')).toEqual(['FLATTEN']);
        });
    });

    describe('getTableValuedFunctionName', () => {
        it('detects UNNEST shorthand nodes', () => {
            const fromItem = {
                type: 'unnest',
                as: 'u'
            };

            expect(getTableValuedFunctionName(fromItem, 'BigQuery')).toBe('UNNEST');
        });
    });
});
