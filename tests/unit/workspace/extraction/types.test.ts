/**
 * Extraction Types Tests
 *
 * Tests for type conversion functions and default values.
 */

import {
    toColumnDefinition,
    toColumnInfo,
    DEFAULT_EXTRACTION_OPTIONS
} from '../../../../src/workspace/extraction/types';

describe('Extraction Types', () => {
    describe('toColumnDefinition', () => {
        it('converts ColumnInfo to ColumnDefinition', () => {
            const columnInfo = {
                name: 'user_id',
                dataType: 'INTEGER',
                nullable: false,
                primaryKey: true,
                foreignKey: undefined,
                isComputed: false
            };

            const result = toColumnDefinition(columnInfo);

            expect(result).toEqual({
                name: 'user_id',
                dataType: 'INTEGER',
                nullable: false,
                primaryKey: true,
                foreignKey: undefined
            });
        });

        it('strips isComputed property', () => {
            const columnInfo = {
                name: 'total',
                dataType: 'DECIMAL',
                nullable: true,
                primaryKey: false,
                foreignKey: undefined,
                isComputed: true
            };

            const result = toColumnDefinition(columnInfo);

            expect(result).not.toHaveProperty('isComputed');
        });

        it('preserves foreignKey reference', () => {
            const columnInfo = {
                name: 'order_id',
                dataType: 'INTEGER',
                nullable: false,
                primaryKey: false,
                foreignKey: { referencedTable: 'orders', referencedColumn: 'id' },
                isComputed: false
            };

            const result = toColumnDefinition(columnInfo);

            expect(result.foreignKey).toEqual({ referencedTable: 'orders', referencedColumn: 'id' });
        });
    });

    describe('toColumnInfo', () => {
        it('converts ColumnDefinition to ColumnInfo', () => {
            const columnDef = {
                name: 'email',
                dataType: 'VARCHAR(255)',
                nullable: true,
                primaryKey: false,
                foreignKey: undefined
            };

            const result = toColumnInfo(columnDef);

            expect(result).toEqual({
                name: 'email',
                dataType: 'VARCHAR(255)',
                nullable: true,
                primaryKey: false,
                foreignKey: undefined,
                isComputed: false
            });
        });

        it('adds isComputed as false', () => {
            const columnDef = {
                name: 'id',
                dataType: 'BIGINT',
                nullable: false,
                primaryKey: true,
                foreignKey: undefined
            };

            const result = toColumnInfo(columnDef);

            expect(result.isComputed).toBe(false);
        });

        it('preserves all original properties', () => {
            const columnDef = {
                name: 'status',
                dataType: 'ENUM',
                nullable: false,
                primaryKey: false,
                foreignKey: { referencedTable: 'statuses', referencedColumn: 'code' }
            };

            const result = toColumnInfo(columnDef);

            expect(result.name).toBe('status');
            expect(result.dataType).toBe('ENUM');
            expect(result.nullable).toBe(false);
            expect(result.primaryKey).toBe(false);
            expect(result.foreignKey).toEqual({ referencedTable: 'statuses', referencedColumn: 'code' });
        });
    });

    describe('DEFAULT_EXTRACTION_OPTIONS', () => {
        it('has expected default dialect', () => {
            expect(DEFAULT_EXTRACTION_OPTIONS.dialect).toBe('MySQL');
        });

        it('has feature flags enabled by default', () => {
            expect(DEFAULT_EXTRACTION_OPTIONS.extractColumns).toBe(true);
            expect(DEFAULT_EXTRACTION_OPTIONS.extractTransformations).toBe(true);
            expect(DEFAULT_EXTRACTION_OPTIONS.trackAliases).toBe(true);
        });

        it('has reasonable performance limits', () => {
            expect(DEFAULT_EXTRACTION_OPTIONS.maxSubqueryDepth).toBeGreaterThan(0);
            expect(DEFAULT_EXTRACTION_OPTIONS.maxColumnsPerQuery).toBeGreaterThan(0);
        });
    });
});
