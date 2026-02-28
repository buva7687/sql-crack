import {
    REFERENCE_SQL_RESERVED_WORDS,
    SCHEMA_SQL_RESERVED_WORDS,
    TERADATA_RESERVED_WORDS,
} from '../../../../src/workspace/extraction/constants';

describe('workspace extraction keyword constants', () => {
    it('includes core SQL control words in both schema and reference filters', () => {
        for (const word of ['select', 'from', 'where', 'join', 'table', 'view']) {
            expect(SCHEMA_SQL_RESERVED_WORDS.has(word)).toBe(true);
            expect(REFERENCE_SQL_RESERVED_WORDS.has(word)).toBe(true);
        }
    });

    it('keeps common table-like names out of the global reference reserved set', () => {
        for (const word of ['users', 'orders', 'events', 'analytics']) {
            expect(REFERENCE_SQL_RESERVED_WORDS.has(word)).toBe(false);
        }
    });

    it('scopes teradata-only reserved words separately from the global set', () => {
        for (const word of ['sel', 'qualify', 'sample', 'normalize']) {
            expect(TERADATA_RESERVED_WORDS.has(word)).toBe(true);
        }

        expect(REFERENCE_SQL_RESERVED_WORDS.has('qualify')).toBe(false);
        expect(REFERENCE_SQL_RESERVED_WORDS.has('sample')).toBe(false);
        expect(REFERENCE_SQL_RESERVED_WORDS.has('normalize')).toBe(false);
    });
});
