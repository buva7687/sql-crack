/**
 * Column Extractor Tests
 *
 * Tests for extracting column metadata from SELECT statement AST.
 * These are pure functions with no external dependencies.
 */

import { extractColumnInfos } from '../../../../src/webview/parser/extractors/columns';

describe('Column Extractors', () => {
    describe('extractColumnInfos', () => {
        it('returns empty array for null/undefined columns', () => {
            expect(extractColumnInfos(null)).toEqual([]);
            expect(extractColumnInfos(undefined)).toEqual([]);
        });

        it('returns empty array for star (*) columns', () => {
            expect(extractColumnInfos('*')).toEqual([]);
        });

        it('returns empty array for non-array columns', () => {
            expect(extractColumnInfos('column')).toEqual([]);
            expect(extractColumnInfos({})).toEqual([]);
        });

        it('extracts simple column reference', () => {
            const columns = [
                { expr: { column: 'id', table: 'users' } }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('id');
            expect(result[0].sourceColumn).toBe('id');
            expect(result[0].sourceTable).toBe('users');
            expect(result[0].transformationType).toBe('passthrough');
        });

        it('extracts aliased column', () => {
            const columns = [
                { as: 'user_id', expr: { column: 'id', table: 'users' } }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('user_id');
            expect(result[0].sourceColumn).toBe('id');
            expect(result[0].transformationType).toBe('renamed');
        });

        it('extracts aggregate function', () => {
            const columns = [
                { as: 'total', expr: { type: 'aggr_func', name: 'COUNT' } }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('total');
            expect(result[0].isAggregate).toBe(true);
            expect(result[0].transformationType).toBe('aggregated');
        });

        it('extracts window function', () => {
            const columns = [
                {
                    as: 'row_num',
                    expr: {
                        type: 'function',
                        name: 'ROW_NUMBER',
                        over: { partitionBy: ['dept_id'] }
                    }
                }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('row_num');
            expect(result[0].isWindowFunc).toBe(true);
            expect(result[0].transformationType).toBe('calculated');
        });

        it('extracts multiple columns', () => {
            const columns = [
                { expr: { column: 'id' } },
                { as: 'full_name', expr: { column: 'name' } },
                { as: 'cnt', expr: { type: 'aggr_func', name: 'COUNT' } }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('id');
            expect(result[0].transformationType).toBe('passthrough');
            expect(result[1].name).toBe('full_name');
            expect(result[1].transformationType).toBe('renamed');
            expect(result[2].name).toBe('cnt');
            expect(result[2].transformationType).toBe('aggregated');
        });

        it('handles column with name property', () => {
            const columns = [
                { expr: { name: 'my_func' } }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('my_func');
        });

        it('handles column with value property', () => {
            const columns = [
                { expr: { value: 'literal' } }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('literal');
        });

        it('handles string column', () => {
            const columns = ['column_name'];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('column_name');
        });

        it('defaults to "expr" for unknown expression types', () => {
            const columns = [
                { expr: { type: 'unknown' } }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('expr');
        });

        it('handles table as object with table property', () => {
            const columns = [
                { expr: { column: 'id', table: { table: 'users' } } }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].sourceTable).toBe('users');
        });

        it('handles table as object with name property', () => {
            const columns = [
                { expr: { column: 'id', table: { name: 'users' } } }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].sourceTable).toBe('users');
        });

        it('stores expression as JSON string', () => {
            const columns = [
                { expr: { column: 'id', table: 'users' } }
            ];

            const result = extractColumnInfos(columns);

            expect(result[0].expression).toBe(JSON.stringify({ column: 'id', table: 'users' }));
        });

        it('handles missing expr gracefully', () => {
            const columns = [
                { as: 'alias_only' }
            ];

            const result = extractColumnInfos(columns);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('alias_only');
            expect(result[0].expression).toBe('alias_only');
        });
    });
});
