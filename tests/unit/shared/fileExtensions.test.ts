import { normalizeFileExtensions } from '../../../src/shared/fileExtensions';

describe('normalizeFileExtensions', () => {
    it('returns bare lowercase extensions', () => {
        expect(normalizeFileExtensions(['HQL', 'Ddl'])).toEqual(['hql', 'ddl']);
    });

    it('strips a leading dot', () => {
        expect(normalizeFileExtensions(['.hql'])).toEqual(['hql']);
    });

    it('strips leading wildcard/glob forms instead of treating them literally', () => {
        expect(normalizeFileExtensions(['*.hql'])).toEqual(['hql']);
        expect(normalizeFileExtensions(['**/*.hql'])).toEqual(['hql']);
        expect(normalizeFileExtensions(['src/**/*.ddl'])).toEqual(['ddl']);
    });

    it('takes the final extension segment for dotted names', () => {
        expect(normalizeFileExtensions(['archive.sql.bak'])).toEqual(['bak']);
    });

    it('splits comma/space separated values in a single entry', () => {
        expect(normalizeFileExtensions(['hql, ddl bteq'])).toEqual(['hql', 'ddl', 'bteq']);
    });

    it('de-duplicates and drops the always-included sql extension', () => {
        expect(normalizeFileExtensions(['hql', 'HQL', 'sql', '.sql'])).toEqual(['hql']);
    });

    it('drops entries that are not valid extensions after cleanup', () => {
        expect(normalizeFileExtensions(['*', '', '   ', '??', 'a/b/'])).toEqual([]);
    });

    it('keeps underscores and hyphens', () => {
        expect(normalizeFileExtensions(['my_ext', 'pre-sql'])).toEqual(['my_ext', 'pre-sql']);
    });

    it('returns an empty array for non-array / non-string input', () => {
        expect(normalizeFileExtensions(undefined)).toEqual([]);
        expect(normalizeFileExtensions('hql')).toEqual([]);
        expect(normalizeFileExtensions([42, null, 'hql'])).toEqual(['hql']);
    });
});
