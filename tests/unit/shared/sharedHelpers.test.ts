import { normalizeAdvancedLimit } from '../../../src/shared/limits';
import { escapeForInlineScriptValue } from '../../../src/shared/stringUtils';
import { normalizeDialect } from '../../../src/shared/dialect';

describe('normalizeAdvancedLimit (consolidated)', () => {
    it('coerces non-numbers to the fallback', () => {
        expect(normalizeAdvancedLimit('x', 50, 1, 100)).toBe(50);
        expect(normalizeAdvancedLimit(undefined, 50, 1, 100)).toBe(50);
        expect(normalizeAdvancedLimit(NaN, 50, 1, 100)).toBe(50);
        expect(normalizeAdvancedLimit(Infinity, 50, 1, 100)).toBe(50);
    });

    it('rounds and clamps into [min, max]', () => {
        expect(normalizeAdvancedLimit(12.4, 50, 1, 100)).toBe(12);
        expect(normalizeAdvancedLimit(12.6, 50, 1, 100)).toBe(13);
        expect(normalizeAdvancedLimit(0, 50, 1, 100)).toBe(1);
        expect(normalizeAdvancedLimit(9999, 50, 1, 100)).toBe(100);
    });

    it('matches across the extension re-export', () => {
        // extension.ts re-exports the same shared implementation.
        const { normalizeAdvancedLimit: fromExtension } = require('../../../src/extension');
        expect(fromExtension(7.5, 50, 1, 100)).toBe(normalizeAdvancedLimit(7.5, 50, 1, 100));
    });
});

describe('escapeForInlineScriptValue (consolidated)', () => {
    it('JSON-encodes and neutralizes script-context breakouts', () => {
        expect(escapeForInlineScriptValue('</script>')).toBe('"<\\/script>"');
        expect(escapeForInlineScriptValue('<!--')).toBe('"<\\!--"');
        expect(escapeForInlineScriptValue('-->')).toBe('"--\\>"');
        expect(escapeForInlineScriptValue(']]>')).toBe('"]\\]>"');
    });

    it('handles non-string values', () => {
        expect(escapeForInlineScriptValue(true)).toBe('true');
        expect(escapeForInlineScriptValue(42)).toBe('42');
        expect(escapeForInlineScriptValue(null)).toBe('null');
    });
});

describe('normalizeDialect (shared, used by workspace alias mapping)', () => {
    it('maps user-friendly aliases to internal dialects', () => {
        expect(normalizeDialect('SQL Server')).toBe('TransactSQL');
        expect(normalizeDialect('PL/SQL')).toBe('Oracle');
        expect(normalizeDialect('PostgreSQL')).toBe('PostgreSQL');
    });
});
