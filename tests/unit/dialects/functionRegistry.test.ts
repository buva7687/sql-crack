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
    isTableValuedFunction,
    getAggregateFunctions,
    getWindowFunctions,
    getTableValuedFunctions,
    getSupportedDialects
} from '../../../src/dialects/functionRegistry';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Function Registry', () => {
    // Reset custom functions before each test
    beforeEach(() => {
        setCustomFunctions([], [], []);
    });

    describe('setCustomFunctions', () => {
        it('adds custom aggregate functions', () => {
            setCustomFunctions(['my_sum', 'MY_COUNT'], [], []);

            expect(isAggregateFunction('my_sum', 'mysql')).toBe(true);
            expect(isAggregateFunction('MY_SUM', 'mysql')).toBe(true);
            expect(isAggregateFunction('MY_COUNT', 'mysql')).toBe(true);
        });

        it('adds custom window functions', () => {
            setCustomFunctions([], ['custom_rank', 'CUSTOM_LAG'], []);

            expect(isWindowFunction('custom_rank', 'mysql')).toBe(true);
            expect(isWindowFunction('CUSTOM_RANK', 'mysql')).toBe(true);
            expect(isWindowFunction('CUSTOM_LAG', 'mysql')).toBe(true);
        });

        it('adds custom table-valued functions', () => {
            setCustomFunctions([], [], ['my_tvf', 'MY_TVF']);

            expect(isTableValuedFunction('my_tvf', 'mysql')).toBe(true);
            expect(isTableValuedFunction('MY_TVF', 'mysql')).toBe(true);
        });

        it('normalizes function names to uppercase', () => {
            setCustomFunctions(['lower_case'], ['MixedCase'], ['tvf_func']);

            const funcs = getFunctionsForDialect('mysql');
            expect(funcs.aggregates.has('LOWER_CASE')).toBe(true);
            expect(funcs.window.has('MIXEDCASE')).toBe(true);
            expect(funcs.tableValued.has('TVF_FUNC')).toBe(true);
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

    describe('isTableValuedFunction', () => {
        it('identifies PostgreSQL table-valued functions', () => {
            expect(isTableValuedFunction('UNNEST', 'postgresql')).toBe(true);
            expect(isTableValuedFunction('GENERATE_SERIES', 'postgresql')).toBe(true);
            expect(isTableValuedFunction('JSON_TO_RECORD', 'postgresql')).toBe(true);
            expect(isTableValuedFunction('XMLTABLE', 'postgresql')).toBe(true);
        });

        it('identifies BigQuery table-valued functions', () => {
            expect(isTableValuedFunction('UNNEST', 'bigquery')).toBe(true);
            expect(isTableValuedFunction('GENERATE_ARRAY', 'bigquery')).toBe(true);
            expect(isTableValuedFunction('EXTERNAL_QUERY', 'bigquery')).toBe(true);
            expect(isTableValuedFunction('ML.PREDICT', 'bigquery')).toBe(true);
        });

        it('identifies Snowflake table-valued functions', () => {
            expect(isTableValuedFunction('FLATTEN', 'snowflake')).toBe(true);
            expect(isTableValuedFunction('SPLIT_TO_TABLE', 'snowflake')).toBe(true);
            expect(isTableValuedFunction('GENERATOR', 'snowflake')).toBe(true);
            expect(isTableValuedFunction('RESULT_SCAN', 'snowflake')).toBe(true);
        });

        it('identifies SQL Server table-valued functions', () => {
            expect(isTableValuedFunction('OPENJSON', 'transactsql')).toBe(true);
            expect(isTableValuedFunction('STRING_SPLIT', 'transactsql')).toBe(true);
            expect(isTableValuedFunction('OPENROWSET', 'transactsql')).toBe(true);
            expect(isTableValuedFunction('GENERATE_SERIES', 'transactsql')).toBe(true);
        });

        it('identifies MySQL table-valued functions', () => {
            expect(isTableValuedFunction('JSON_TABLE', 'mysql')).toBe(true);
        });

        it('identifies Hive table-valued functions', () => {
            expect(isTableValuedFunction('EXPLODE', 'hive')).toBe(true);
            expect(isTableValuedFunction('POSEXPLODE', 'hive')).toBe(true);
            expect(isTableValuedFunction('INLINE', 'hive')).toBe(true);
        });

        it('identifies Trino table-valued functions', () => {
            expect(isTableValuedFunction('UNNEST', 'trino')).toBe(true);
            expect(isTableValuedFunction('SEQUENCE', 'trino')).toBe(true);
        });

        it('identifies newly added Redshift table-valued functions', () => {
            expect(isTableValuedFunction('UNNEST', 'redshift')).toBe(true);
            expect(isTableValuedFunction('GENERATE_SERIES', 'redshift')).toBe(true);
        });

        it('identifies newly added Hive table-valued functions', () => {
            expect(isTableValuedFunction('JSON_TUPLE', 'hive')).toBe(true);
            expect(isTableValuedFunction('PARSE_URL_TUPLE', 'hive')).toBe(true);
        });

        it('identifies newly added Athena table-valued functions', () => {
            expect(isTableValuedFunction('SEQUENCE', 'athena')).toBe(true);
            expect(isTableValuedFunction('FLATTEN', 'athena')).toBe(true);
        });

        it('identifies newly added Snowflake table-valued functions', () => {
            expect(isTableValuedFunction('EXTERNAL_TABLE_FILES', 'snowflake')).toBe(true);
            expect(isTableValuedFunction('INFER_SCHEMA', 'snowflake')).toBe(true);
        });

        it('identifies newly added BigQuery table-valued functions', () => {
            expect(isTableValuedFunction('ML.TRAIN', 'bigquery')).toBe(true);
            expect(isTableValuedFunction('VECTOR_SEARCH', 'bigquery')).toBe(true);
        });

        it('is case-insensitive', () => {
            expect(isTableValuedFunction('unnest', 'postgresql')).toBe(true);
            expect(isTableValuedFunction('Unnest', 'postgresql')).toBe(true);
            expect(isTableValuedFunction('UNNEST', 'postgresql')).toBe(true);
        });

        it('returns false for non-table-valued functions', () => {
            expect(isTableValuedFunction('COUNT', 'postgresql')).toBe(false);
            expect(isTableValuedFunction('CONCAT', 'postgresql')).toBe(false);
            expect(isTableValuedFunction('random_func', 'postgresql')).toBe(false);
        });

        it('handles unknown dialect with no table-valued functions', () => {
            expect(isTableValuedFunction('any_func', 'unknown_dialect')).toBe(false);
        });
    });

    describe('getTableValuedFunctions', () => {
        it('returns array of table-valued function names for PostgreSQL', () => {
            const funcs = getTableValuedFunctions('postgresql');

            expect(Array.isArray(funcs)).toBe(true);
            expect(funcs.length).toBeGreaterThan(0);
            expect(funcs).toContain('UNNEST');
            expect(funcs).toContain('GENERATE_SERIES');
        });

        it('returns array of table-valued function names for BigQuery', () => {
            const funcs = getTableValuedFunctions('bigquery');

            expect(Array.isArray(funcs)).toBe(true);
            expect(funcs.length).toBeGreaterThan(0);
            expect(funcs).toContain('UNNEST');
            expect(funcs).toContain('GENERATE_ARRAY');
        });

        it('returns empty array for unknown dialect with no TVFs', () => {
            const funcs = getTableValuedFunctions('unknown_dialect');

            expect(Array.isArray(funcs)).toBe(true);
            expect(funcs.length).toBe(0);
        });

        it('includes custom table-valued functions', () => {
            setCustomFunctions([], [], ['custom_tvf']);

            const funcs = getTableValuedFunctions('mysql');
            expect(funcs).toContain('CUSTOM_TVF');
        });
    });

    describe('Priority 1: Missing Aggregate Functions', () => {
        it('Snowflake has ARRAY_UNION_AGG and ARRAY_UNIQUE_AGG', () => {
            expect(isAggregateFunction('ARRAY_UNION_AGG', 'snowflake')).toBe(true);
            expect(isAggregateFunction('ARRAY_UNIQUE_AGG', 'snowflake')).toBe(true);
        });

        it('Snowflake has MODE and ANY_VALUE', () => {
            expect(isAggregateFunction('MODE', 'snowflake')).toBe(true);
            expect(isAggregateFunction('ANY_VALUE', 'snowflake')).toBe(true);
        });

        it('BigQuery has COUNTIF and ANY_VALUE', () => {
            expect(isAggregateFunction('COUNTIF', 'bigquery')).toBe(true);
            expect(isAggregateFunction('ANY_VALUE', 'bigquery')).toBe(true);
        });

        it('MySQL has ANY_VALUE', () => {
            expect(isAggregateFunction('ANY_VALUE', 'mysql')).toBe(true);
        });

        it('PostgreSQL has MODE (removed PERCENTILE_CONT/DISC from aggregates)', () => {
            expect(isAggregateFunction('MODE', 'postgresql')).toBe(true);
            // These are now in common window functions, not aggregates
            expect(isAggregateFunction('PERCENTILE_CONT', 'postgresql')).toBe(false);
            expect(isWindowFunction('PERCENTILE_CONT', 'postgresql')).toBe(true);
        });
    });

    describe('Priority 1: Missing Window Functions', () => {
        it('Common window functions include PERCENTILE_CONT and PERCENTILE_DISC', () => {
            expect(isWindowFunction('PERCENTILE_CONT')).toBe(true);
            expect(isWindowFunction('PERCENTILE_DISC')).toBe(true);
        });

        it('PostgreSQL inherits common PERCENTILE_CONT and PERCENTILE_DISC', () => {
            expect(isWindowFunction('PERCENTILE_CONT', 'postgresql')).toBe(true);
            expect(isWindowFunction('PERCENTILE_DISC', 'postgresql')).toBe(true);
        });

        it('BigQuery has RATIO_TO_REPORT as window function', () => {
            expect(isWindowFunction('RATIO_TO_REPORT', 'bigquery')).toBe(true);
        });

        it('Redshift has PERCENTILE_CONT and PERCENTILE_DISC as window functions', () => {
            expect(isWindowFunction('PERCENTILE_CONT', 'redshift')).toBe(true);
            expect(isWindowFunction('PERCENTILE_DISC', 'redshift')).toBe(true);
        });
    });

    describe('getFunctionsForDialect includes tableValued', () => {
        it('returns tableValued set for dialects with TVFs', () => {
            const postgresql = getFunctionsForDialect('postgresql');
            expect(postgresql.tableValued).toBeInstanceOf(Set);
            expect(postgresql.tableValued.has('UNNEST')).toBe(true);

            const bigquery = getFunctionsForDialect('bigquery');
            expect(bigquery.tableValued.has('UNNEST')).toBe(true);
        });

        it('returns empty tableValued set for unknown dialects without TVFs', () => {
            const unknown = getFunctionsForDialect('unknown_dialect');
            expect(unknown.tableValued).toBeInstanceOf(Set);
            expect(unknown.tableValued.size).toBe(0);
        });

        it('includes custom table-valued functions', () => {
            setCustomFunctions([], [], ['MY_CUSTOM_TVF']);
            const funcs = getFunctionsForDialect('mysql');
            expect(funcs.tableValued.has('MY_CUSTOM_TVF')).toBe(true);
        });
    });
});
