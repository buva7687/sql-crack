/**
 * Identifier Utilities Tests
 *
 * Tests for schema-aware identifier normalization and key building.
 */

import {
    normalizeIdentifier,
    getQualifiedKey,
    getDisplayName,
    parseQualifiedKey,
    getIdentifierSemantics,
    getColumnKey,
    splitLastQualifiedKeyComponent,
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

        it('preserves case for quoted identifiers', () => {
            expect(normalizeIdentifier('Users', true)).toBe('Users');
            expect(normalizeIdentifier('users', true)).toBe('users');
        });

        it('preserves BigQuery table-name case', () => {
            const semantics = getIdentifierSemantics('BigQuery');
            expect(getQualifiedKey('Events', undefined, semantics)).toBe('Events');
            expect(getQualifiedKey('events', undefined, semantics)).toBe('events');
        });
    });

    describe('column keys', () => {
        it('keeps quoted case distinct and parses dotted column components safely', () => {
            expect(getColumnKey('orders', 'OrderID', {
                nameQuoted: true,
                identifierCaseFolding: 'lower',
                quotedIdentifiersCaseSensitive: true,
            })).toBe('orders.OrderID');
            expect(getColumnKey('orders', 'orderid', {
                nameQuoted: true,
                identifierCaseFolding: 'lower',
                quotedIdentifiersCaseSensitive: true,
            })).toBe('orders.orderid');

            const dotted = getColumnKey('orders', 'customer.id', { nameQuoted: true });
            expect(dotted).toBe('orders.customer\\.id');
            expect(splitLastQualifiedKeyComponent(dotted)).toEqual({
                prefix: 'orders',
                component: 'customer.id',
            });
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

        it('keeps quoted names distinct and retains catalog plus schema', () => {
            expect(getQualifiedKey('Users', undefined, { nameQuoted: true })).toBe('Users');
            expect(getQualifiedKey('users', undefined, { nameQuoted: true })).toBe('users');
            expect(getQualifiedKey('orders', 'sales', { catalog: 'db1' })).toBe('db1.sales.orders');
            expect(getQualifiedKey('Orders', 'Sales', {
                catalog: 'Db1',
                nameQuoted: true,
                schemaQuoted: true,
                catalogQuoted: true,
            })).toBe('Db1.Sales.Orders');
        });

        it('escapes component dots so quoted names cannot collide with qualification', () => {
            const dottedName = getQualifiedKey('a.b', undefined, { nameQuoted: true });
            const qualifiedName = getQualifiedKey('b', 'a');

            expect(dottedName).toBe('a\\.b');
            expect(qualifiedName).toBe('a.b');
            expect(dottedName).not.toBe(qualifiedName);
            expect(parseQualifiedKey(dottedName)).toEqual({ name: 'a.b' });
            expect(parseQualifiedKey(qualifiedName)).toEqual({ schema: 'a', name: 'b' });
        });

        it('uses dialect-provided folding and quote sensitivity', () => {
            expect(getQualifiedKey('users', undefined, {
                identifierCaseFolding: 'upper',
            })).toBe('USERS');
            expect(getQualifiedKey('USERS', undefined, {
                nameQuoted: true,
                identifierCaseFolding: 'upper',
            })).toBe('USERS');
            expect(getQualifiedKey('Users', undefined, {
                nameQuoted: true,
                quotedIdentifiersCaseSensitive: false,
            })).toBe('users');
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

        it('renders catalog.schema.name', () => {
            expect(getDisplayName('orders', 'sales', 'db1')).toBe('db1.sales.orders');
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

        it('parses catalog.schema.table', () => {
            const result = parseQualifiedKey('catalog.schema.table');
            expect(result).toEqual({ catalog: 'catalog', schema: 'schema', name: 'table' });
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
