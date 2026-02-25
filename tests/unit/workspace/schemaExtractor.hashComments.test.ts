import { SchemaExtractor } from '../../../src/workspace/extraction/schemaExtractor';

describe('SchemaExtractor hash comment handling', () => {
    it('ignores MySQL hash comments in regex fallback extraction', () => {
        const sql = `
# CREATE TABLE fake_table (id INT);
CREATE TABLE real_table (id INT);
@@invalid@@
`;
        const extractor = new SchemaExtractor();
        const defs = extractor.extractDefinitions(sql, 'hash-comment.sql', 'MySQL');
        const names = defs.map(def => def.name.toLowerCase());

        expect(names).toContain('real_table');
        expect(names).not.toContain('fake_table');
    });
});
