import { unwrapIdentifierValue } from '../../../src/webview/parser/astUtils';

describe('unwrapIdentifierValue', () => {
    it('returns plain strings as-is', () => {
        expect(unwrapIdentifierValue('column_name')).toBe('column_name');
    });

    it('returns undefined for null', () => {
        expect(unwrapIdentifierValue(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
        expect(unwrapIdentifierValue(undefined)).toBeUndefined();
    });

    it('returns undefined for numbers', () => {
        expect(unwrapIdentifierValue(42)).toBeUndefined();
    });

    it('returns undefined for booleans', () => {
        expect(unwrapIdentifierValue(true)).toBeUndefined();
    });

    it('unwraps { value: string }', () => {
        expect(unwrapIdentifierValue({ value: 'col' })).toBe('col');
    });

    it('unwraps { expr: { value: string } }', () => {
        expect(unwrapIdentifierValue({ expr: { value: 'col' } })).toBe('col');
    });

    it('unwraps { expr: { expr: { value: string } } } (double-nested)', () => {
        expect(unwrapIdentifierValue({ expr: { expr: { value: 'col' } } })).toBe('col');
    });

    it('unwraps { name: [{ value: string }] }', () => {
        expect(unwrapIdentifierValue({ name: [{ value: 'col' }] })).toBe('col');
    });

    it('returns undefined for empty name array', () => {
        expect(unwrapIdentifierValue({ name: [] })).toBeUndefined();
    });

    it('returns undefined for object with no recognizable shape', () => {
        expect(unwrapIdentifierValue({ foo: 'bar' })).toBeUndefined();
    });

    it('returns undefined when value is a number, not string', () => {
        expect(unwrapIdentifierValue({ value: 123 })).toBeUndefined();
    });

    it('returns undefined for nested expr with non-string value', () => {
        expect(unwrapIdentifierValue({ expr: { value: null } })).toBeUndefined();
    });

    it('prefers direct value over nested expr', () => {
        // When both value and expr.value exist, it should find value first
        expect(unwrapIdentifierValue({ value: 'direct', expr: { value: 'nested' } })).toBe('direct');
    });

    it('handles name array with non-object first element', () => {
        expect(unwrapIdentifierValue({ name: [42] })).toBeUndefined();
    });
});
