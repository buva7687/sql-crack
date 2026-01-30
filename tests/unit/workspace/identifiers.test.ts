/**
 * Identifier Utilities Tests
 *
 * Tests for schema-aware identifier normalization and key building.
 */

import {
    normalizeIdentifier,
    getQualifiedKey,
    getDisplayName,
    parseQualifiedKey
} from '../../../src/workspace/identifiers';

describe('Identifier Utilities', () => {
    describe('normalizeIdentifier', () => {
        it('converts to lowercase', () => {
            expect(normalizeIdentifier('Users')).toBe('users');
            expect(normalizeIdentifier('ORDERS')).toBe('orders');
            expect(normalizeIdentifier('MixedCase')).toBe('mixedcase');
        });

        it('trims whitespace', () => {
            expect(normalizeIdentifier('  users  ')).toBe('users');
            expect(normalizeIdentifier('\tusers\n')).toBe('users');
        });

        it('returns undefined for null/undefined', () => {
            expect(normalizeIdentifier(undefined)).toBeUndefined();
            expect(normalizeIdentifier(null as any)).toBeUndefined();
        });

        it('returns undefined for empty string', () => {
            expect(normalizeIdentifier('')).toBeUndefined();
        });

        it('returns undefined for whitespace-only string', () => {
            expect(normalizeIdentifier('   ')).toBeUndefined();
            expect(normalizeIdentifier('\t\n')).toBeUndefined();
        });

        it('handles special characters', () => {
            expect(normalizeIdentifier('user_table')).toBe('user_table');
            expect(normalizeIdentifier('user-table')).toBe('user-table');
            expect(normalizeIdentifier('user.table')).toBe('user.table');
        });
    });

    describe('getQualifiedKey', () => {
        it('returns just name when no schema', () => {
            expect(getQualifiedKey('users')).toBe('users');
            expect(getQualifiedKey('Users')).toBe('users');
        });

        it('returns schema.name when schema provided', () => {
            expect(getQualifiedKey('users', 'public')).toBe('public.users');
            expect(getQualifiedKey('Users', 'Public')).toBe('public.users');
        });

        it('normalizes both schema and name', () => {
            expect(getQualifiedKey('USERS', 'PUBLIC')).toBe('public.users');
            expect(getQualifiedKey('  users  ', '  public  ')).toBe('public.users');
        });

        it('handles undefined schema', () => {
            expect(getQualifiedKey('users', undefined)).toBe('users');
        });

        it('handles empty schema', () => {
            expect(getQualifiedKey('users', '')).toBe('users');
        });

        it('handles empty name', () => {
            expect(getQualifiedKey('', 'public')).toBe('public.');
            expect(getQualifiedKey('')).toBe('');
        });
    });

    describe('getDisplayName', () => {
        it('returns just name when no schema', () => {
            expect(getDisplayName('users')).toBe('users');
            expect(getDisplayName('Users')).toBe('Users'); // Preserves case
        });

        it('returns schema.name when schema provided', () => {
            expect(getDisplayName('users', 'public')).toBe('public.users');
        });

        it('preserves original case (unlike getQualifiedKey)', () => {
            expect(getDisplayName('Users', 'Public')).toBe('Public.Users');
        });

        it('handles undefined schema', () => {
            expect(getDisplayName('users', undefined)).toBe('users');
        });

        it('handles empty schema', () => {
            expect(getDisplayName('users', '')).toBe('users');
        });
    });

    describe('parseQualifiedKey', () => {
        it('parses simple name', () => {
            const result = parseQualifiedKey('users');
            expect(result).toEqual({ name: 'users' });
            expect(result.schema).toBeUndefined();
        });

        it('parses schema.name', () => {
            const result = parseQualifiedKey('public.users');
            expect(result).toEqual({ schema: 'public', name: 'users' });
        });

        it('handles multiple dots (schema.table)', () => {
            const result = parseQualifiedKey('catalog.schema.table');
            expect(result).toEqual({ schema: 'catalog', name: 'schema.table' });
        });

        it('handles empty string', () => {
            const result = parseQualifiedKey('');
            expect(result).toEqual({ name: '' });
        });

        it('handles single dot', () => {
            const result = parseQualifiedKey('schema.');
            expect(result).toEqual({ schema: 'schema', name: '' });
        });

        it('handles leading dot', () => {
            const result = parseQualifiedKey('.table');
            expect(result).toEqual({ schema: '', name: 'table' });
        });
    });
});
