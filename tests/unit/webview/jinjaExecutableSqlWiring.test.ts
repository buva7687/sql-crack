import { readFileSync } from 'fs';
import { join } from 'path';

describe('webview hasExecutableSql jinja wiring', () => {
    const source = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');

    it('preprocesses Jinja before checking for executable SQL', () => {
        expect(source).toContain("from './parser/dialects/jinjaPreprocessor'");
        expect(source).toContain('const { rewritten } = preprocessJinjaTemplates(sql);');
        expect(source).toContain('stripSqlComments(rewritten).trim().length > 0');
    });
});
