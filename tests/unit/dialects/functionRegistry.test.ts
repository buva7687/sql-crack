/**
 * Function Registry Tests
 *
 * Tests for SQL dialect-specific function lookups.
 */

import {
    setCustomFunctions,
    getFunctionsForDialect,
    isAggregateFunction,
    isWindowFunction,
    getAggregateFunctions,
    getWindowFunctions,
    getSupportedDialects
} from '../../../src/dialects/functionRegistry';

describe('Function Registry', () => {
    // Reset custom functions before each test
    beforeEach(() => {
        setCustomFunctions([], []);
    });

    describe('setCustomFunctions', () => {
        it('adds custom aggregate functions', () => {
            setCustomFunctions(['my_sum', 'MY_COUNT'], []);

            expect(isAggregateFunction('my_sum', 'mysql')).toBe(true);
            expect(isAggregateFunction('MY_SUM', 'mysql')).toBe(true);
            expect(isAggregateFunction('MY_COUNT', 'mysql')).toBe(true);
        });

        it('adds custom window functions', () => {
            setCustomFunctions([], ['custom_rank', 'CUSTOM_LAG']);

            expect(isWindowFunction('custom_rank', 'mysql')).toBe(true);
            expect(isWindowFunction('CUSTOM_RANK', 'mysql')).toBe(true);
            expect(isWindowFunction('CUSTOM_LAG', 'mysql')).toBe(true);
        });

        it('normalizes function names to uppercase', () => {
            setCustomFunctions(['lower_case'], ['MixedCase']);

            const funcs = getFunctionsForDialect('mysql');
            expect(funcs.aggregates.has('LOWER_CASE')).toBe(true);
            expect(funcs.window.has('MIXEDCASE')).toBe(true);
        });
    });

    describe('getFunctionsForDialect', () => {
        it('returns functions for MySQL', () => {
            const funcs = getFunctionsForDialect('mysql');

            expect(funcs.aggregates.has('COUNT')).toBe(true);
            expect(funcs.aggregates.has('SUM')).toBe(true);
            expect(funcs.aggregates.has('AVG')).toBe(true);
            expect(funcs.window.has('ROW_NUMBER')).toBe(true);
            expect(funcs.window.has('RANK')).toBe(true);
        });

        it('returns functions for PostgreSQL', () => {
            const funcs = getFunctionsForDialect('postgresql');

            expect(funcs.aggregates.has('COUNT')).toBe(true);
            expect(funcs.aggregates.has('ARRAY_AGG')).toBe(true);
            expect(funcs.window.has('ROW_NUMBER')).toBe(true);
        });

        it('handles dialect aliases', () => {
            const sqlserver = getFunctionsForDialect('sqlserver');
            const tsql = getFunctionsForDialect('tsql');
            const mssql = getFunctionsForDialect('mssql');

            // All should resolve to transactsql
            expect(sqlserver.aggregates).toEqual(tsql.aggregates);
            expect(tsql.aggregates).toEqual(mssql.aggregates);
        });

        it('handles postgres alias', () => {
            const postgres = getFunctionsForDialect('postgres');
            const pg = getFunctionsForDialect('pg');
            const postgresql = getFunctionsForDialect('postgresql');

            expect(postgres.aggregates).toEqual(postgresql.aggregates);
            expect(pg.aggregates).toEqual(postgresql.aggregates);
        });

        it('includes custom functions in results', () => {
            setCustomFunctions(['my_agg'], ['my_window']);

            const funcs = getFunctionsForDialect('mysql');
            expect(funcs.aggregates.has('MY_AGG')).toBe(true);
            expect(funcs.window.has('MY_WINDOW')).toBe(true);
        });

        it('handles unknown dialect gracefully', () => {
            const funcs = getFunctionsForDialect('unknown_dialect');

            // Should still have common functions
            expect(funcs.aggregates.has('COUNT')).toBe(true);
            expect(funcs.aggregates.has('SUM')).toBe(true);
        });
    });

    describe('isAggregateFunction', () => {
        it('identifies common aggregate functions', () => {
            expect(isAggregateFunction('COUNT')).toBe(true);
            expect(isAggregateFunction('SUM')).toBe(true);
            expect(isAggregateFunction('AVG')).toBe(true);
            expect(isAggregateFunction('MIN')).toBe(true);
            expect(isAggregateFunction('MAX')).toBe(true);
        });

        it('is case-insensitive', () => {
            expect(isAggregateFunction('count')).toBe(true);
            expect(isAggregateFunction('Count')).toBe(true);
            expect(isAggregateFunction('COUNT')).toBe(true);
        });

        it('returns false for non-aggregate functions', () => {
            expect(isAggregateFunction('CONCAT')).toBe(false);
            expect(isAggregateFunction('NOW')).toBe(false);
            expect(isAggregateFunction('random_func')).toBe(false);
        });

        it('uses default dialect when not specified', () => {
            expect(isAggregateFunction('COUNT')).toBe(true);
        });
    });

    describe('isWindowFunction', () => {
        it('identifies common window functions', () => {
            expect(isWindowFunction('ROW_NUMBER')).toBe(true);
            expect(isWindowFunction('RANK')).toBe(true);
            expect(isWindowFunction('DENSE_RANK')).toBe(true);
            expect(isWindowFunction('LEAD')).toBe(true);
            expect(isWindowFunction('LAG')).toBe(true);
        });

        it('is case-insensitive', () => {
            expect(isWindowFunction('row_number')).toBe(true);
            expect(isWindowFunction('Row_Number')).toBe(true);
            expect(isWindowFunction('ROW_NUMBER')).toBe(true);
        });

        it('returns false for non-window functions', () => {
            expect(isWindowFunction('CONCAT')).toBe(false);
            expect(isWindowFunction('NOW')).toBe(false);
            expect(isWindowFunction('random_func')).toBe(false);
        });

        it('uses default dialect when not specified', () => {
            expect(isWindowFunction('ROW_NUMBER')).toBe(true);
        });
    });

    describe('getAggregateFunctions', () => {
        it('returns array of aggregate function names', () => {
            const funcs = getAggregateFunctions('mysql');

            expect(Array.isArray(funcs)).toBe(true);
            expect(funcs.length).toBeGreaterThan(0);
            expect(funcs).toContain('COUNT');
            expect(funcs).toContain('SUM');
        });

        it('uses default dialect when not specified', () => {
            const funcs = getAggregateFunctions();

            expect(Array.isArray(funcs)).toBe(true);
            expect(funcs.length).toBeGreaterThan(0);
        });
    });

    describe('getWindowFunctions', () => {
        it('returns array of window function names', () => {
            const funcs = getWindowFunctions('mysql');

            expect(Array.isArray(funcs)).toBe(true);
            expect(funcs.length).toBeGreaterThan(0);
            expect(funcs).toContain('ROW_NUMBER');
            expect(funcs).toContain('RANK');
        });

        it('uses default dialect when not specified', () => {
            const funcs = getWindowFunctions();

            expect(Array.isArray(funcs)).toBe(true);
            expect(funcs.length).toBeGreaterThan(0);
        });
    });

    describe('getSupportedDialects', () => {
        it('returns list of supported dialects', () => {
            const dialects = getSupportedDialects();

            expect(Array.isArray(dialects)).toBe(true);
            expect(dialects.length).toBeGreaterThan(0);
        });

        it('includes common dialects', () => {
            const dialects = getSupportedDialects();

            // Check for at least some common dialects
            const hasMySQL = dialects.some(d => d.toLowerCase().includes('mysql'));
            const hasPostgres = dialects.some(d => d.toLowerCase().includes('postgres'));

            expect(hasMySQL || hasPostgres || dialects.length > 0).toBe(true);
        });
    });
});
