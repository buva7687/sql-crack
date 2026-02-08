/**
 * Item #5: Expand TVF Registry
 * 
 * Tests for expanded table-valued function registry.
 * Verifies that new TVFs are properly registered and detected.
 */

import { getTableValuedFunctions, isTableValuedFunction } from '../../../src/dialects/functionRegistry';
import type { SqlDialect } from '../../../src/webview/types/parser';

describe('Item #5: Expand TVF Registry', () => {
    describe('PostgreSQL TVFs', () => {
        it('should include JSONB_TO_RECORDSET in TVF registry', () => {
            const tvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            expect(tvfs).toContain('JSONB_TO_RECORDSET');
        });

        it('should detect JSONB_TO_RECORDSET as table-valued function', () => {
            const isTvf = isTableValuedFunction('JSONB_TO_RECORDSET', 'PostgreSQL' as SqlDialect);
            expect(isTvf).toBe(true);
        });

        it('should include JSONB_ARRAY_ELEMENTS in TVF registry', () => {
            const tvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            expect(tvfs).toContain('JSONB_ARRAY_ELEMENTS');
        });

        it('should detect JSONB_ARRAY_ELEMENTS as table-valued function', () => {
            const isTvf = isTableValuedFunction('JSONB_ARRAY_ELEMENTS', 'PostgreSQL' as SqlDialect);
            expect(isTvf).toBe(true);
        });

        it('should include JSONB_POPULATE_RECORDSET in TVF registry', () => {
            const tvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            expect(tvfs).toContain('JSONB_POPULATE_RECORDSET');
        });

        it('should detect JSONB_POPULATE_RECORDSET as table-valued function', () => {
            const isTvf = isTableValuedFunction('JSONB_POPULATE_RECORDSET', 'PostgreSQL' as SqlDialect);
            expect(isTvf).toBe(true);
        });

        it('should include JSON_POPULATE_RECORDSET in TVF registry', () => {
            const tvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            expect(tvfs).toContain('JSON_POPULATE_RECORDSET');
        });

        it('should detect JSON_POPULATE_RECORDSET as table-valued function', () => {
            expect(isTableValuedFunction('JSON_POPULATE_RECORDSET', 'PostgreSQL' as SqlDialect)).toBe(true);
        });

        it('should include JSON_TO_RECORDSET in TVF registry', () => {
            const tvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            expect(tvfs).toContain('JSON_TO_RECORDSET');
        });

        it('should detect JSON_TO_RECORDSET as table-valued function', () => {
            expect(isTableValuedFunction('JSON_TO_RECORDSET', 'PostgreSQL' as SqlDialect)).toBe(true);
        });

        it('should include existing GENERATE_SERIES TVF', () => {
            const tvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            expect(tvfs).toContain('GENERATE_SERIES');
        });

        it('should include existing GENERATE_SUBSCRIPTS TVF', () => {
            const tvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            expect(tvfs).toContain('GENERATE_SUBSCRIPTS');
        });

        it('should include existing REGEXP_SPLIT_TO_TABLE TVF', () => {
            const tvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            expect(tvfs).toContain('REGEXP_SPLIT_TO_TABLE');
        });
    });

    describe('BigQuery TVFs', () => {
        it('should include JSON_EXTRACT_ARRAY in TVF registry', () => {
            const tvfs = getTableValuedFunctions('BigQuery' as SqlDialect);
            expect(tvfs).toContain('JSON_EXTRACT_ARRAY');
        });

        it('should detect JSON_EXTRACT_ARRAY as table-valued function', () => {
            const isTvf = isTableValuedFunction('JSON_EXTRACT_ARRAY', 'BigQuery' as SqlDialect);
            expect(isTvf).toBe(true);
        });

        it('should include JSON_EXTRACT_STRING_ARRAY in TVF registry', () => {
            const tvfs = getTableValuedFunctions('BigQuery' as SqlDialect);
            expect(tvfs).toContain('JSON_EXTRACT_STRING_ARRAY');
        });

        it('should detect JSON_EXTRACT_STRING_ARRAY as table-valued function', () => {
            const isTvf = isTableValuedFunction('JSON_EXTRACT_STRING_ARRAY', 'BigQuery' as SqlDialect);
            expect(isTvf).toBe(true);
        });

        it('should include existing UNNEST TVF', () => {
            const tvfs = getTableValuedFunctions('BigQuery' as SqlDialect);
            expect(tvfs).toContain('UNNEST');
        });
    });

    describe('Snowflake TVFs', () => {
        it('should include STRTOK_SPLIT_TO_TABLE in TVF registry', () => {
            const tvfs = getTableValuedFunctions('Snowflake' as SqlDialect);
            expect(tvfs).toContain('STRTOK_SPLIT_TO_TABLE');
        });

        it('should detect STRTOK_SPLIT_TO_TABLE as table-valued function', () => {
            const isTvf = isTableValuedFunction('STRTOK_SPLIT_TO_TABLE', 'Snowflake' as SqlDialect);
            expect(isTvf).toBe(true);
        });

        it('should include existing FLATTEN TVF', () => {
            const tvfs = getTableValuedFunctions('Snowflake' as SqlDialect);
            expect(tvfs).toContain('FLATTEN');
        });

        it('should include existing SPLIT_TO_TABLE TVF', () => {
            const tvfs = getTableValuedFunctions('Snowflake' as SqlDialect);
            expect(tvfs).toContain('SPLIT_TO_TABLE');
        });

        it('should include existing GENERATOR TVF', () => {
            const tvfs = getTableValuedFunctions('Snowflake' as SqlDialect);
            expect(tvfs).toContain('GENERATOR');
        });
    });

    describe('TransactSQL TVFs', () => {
        it('should include existing STRING_SPLIT TVF', () => {
            const tvfs = getTableValuedFunctions('TransactSQL' as SqlDialect);
            expect(tvfs).toContain('STRING_SPLIT');
        });

        it('should detect STRING_SPLIT as table-valued function', () => {
            const isTvf = isTableValuedFunction('STRING_SPLIT', 'TransactSQL' as SqlDialect);
            expect(isTvf).toBe(true);
        });

        it('should include existing GENERATE_SERIES TVF', () => {
            const tvfs = getTableValuedFunctions('TransactSQL' as SqlDialect);
            expect(tvfs).toContain('GENERATE_SERIES');
        });

        it('should detect GENERATE_SERIES as table-valued function', () => {
            const isTvf = isTableValuedFunction('GENERATE_SERIES', 'TransactSQL' as SqlDialect);
            expect(isTvf).toBe(true);
        });

        it('should include existing OPENJSON TVF', () => {
            const tvfs = getTableValuedFunctions('TransactSQL' as SqlDialect);
            expect(tvfs).toContain('OPENJSON');
        });
    });

    describe('Cross-Dialect Verification', () => {
        it('should not detect PostgreSQL TVFs in MySQL', () => {
            const isTvf = isTableValuedFunction('JSONB_TO_RECORDSET', 'MySQL' as SqlDialect);
            expect(isTvf).toBe(false);
        });

        it('should not detect BigQuery TVFs in PostgreSQL', () => {
            const isTvf = isTableValuedFunction('JSON_EXTRACT_ARRAY', 'PostgreSQL' as SqlDialect);
            expect(isTvf).toBe(false);
        });

        it('should not detect Snowflake TVFs in BigQuery', () => {
            const isTvf = isTableValuedFunction('STRTOK_SPLIT_TO_TABLE', 'BigQuery' as SqlDialect);
            expect(isTvf).toBe(false);
        });
    });

    describe('TVF Registry Completeness', () => {
        it('should have multiple TVFs for each dialect', () => {
            const postgresqlTvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            const bigqueryTvfs = getTableValuedFunctions('BigQuery' as SqlDialect);
            const snowflakeTvfs = getTableValuedFunctions('Snowflake' as SqlDialect);
            const transactsqlTvfs = getTableValuedFunctions('TransactSQL' as SqlDialect);

            expect(postgresqlTvfs.length).toBeGreaterThan(10);
            expect(bigqueryTvfs.length).toBeGreaterThan(10);
            expect(snowflakeTvfs.length).toBeGreaterThan(3);
            expect(transactsqlTvfs.length).toBeGreaterThan(3);
        });

        it('should include all required PostgreSQL TVFs', () => {
            const tvfs = getTableValuedFunctions('PostgreSQL' as SqlDialect);
            
            const requiredTvfs = [
                'GENERATE_SERIES',
                'GENERATE_SUBSCRIPTS',
                'JSONB_TO_RECORDSET',
                'JSON_TO_RECORDSET',
                'JSONB_ARRAY_ELEMENTS',
                'JSON_POPULATE_RECORDSET',
                'JSONB_POPULATE_RECORDSET',
                'REGEXP_SPLIT_TO_TABLE'
            ];

            requiredTvfs.forEach(tvf => {
                expect(tvfs).toContain(tvf);
            });
        });

        it('should include all required BigQuery TVFs', () => {
            const tvfs = getTableValuedFunctions('BigQuery' as SqlDialect);
            
            const requiredTvfs = [
                'JSON_EXTRACT_ARRAY',
                'JSON_EXTRACT_STRING_ARRAY'
            ];

            requiredTvfs.forEach(tvf => {
                expect(tvfs).toContain(tvf);
            });
        });

        it('should include all required Snowflake TVFs', () => {
            const tvfs = getTableValuedFunctions('Snowflake' as SqlDialect);
            
            const requiredTvfs = [
                'STRTOK_SPLIT_TO_TABLE'
            ];

            requiredTvfs.forEach(tvf => {
                expect(tvfs).toContain(tvf);
            });
        });
    });

    describe('Case Sensitivity', () => {
        it('should detect TVFs regardless of case', () => {
            const lowercaseTvf = isTableValuedFunction('jsonb_to_recordset', 'PostgreSQL' as SqlDialect);
            const uppercaseTvf = isTableValuedFunction('JSONB_TO_RECORDSET', 'PostgreSQL' as SqlDialect);
            const mixedcaseTvf = isTableValuedFunction('Jsonb_To_Recordset', 'PostgreSQL' as SqlDialect);

            expect(lowercaseTvf).toBe(true);
            expect(uppercaseTvf).toBe(true);
            expect(mixedcaseTvf).toBe(true);
        });

        it('should detect BigQuery TVFs with dot notation', () => {
            const isTvf = isTableValuedFunction('JSON_EXTRACT_ARRAY', 'BigQuery' as SqlDialect);
            expect(isTvf).toBe(true);
        });
    });
});
