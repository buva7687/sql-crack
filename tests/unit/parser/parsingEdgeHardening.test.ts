import { readFileSync } from 'fs';
import { join } from 'path';

describe('parsing edge hardening guards', () => {
    it('uses splitSqlStatements for validation statement counts', () => {
        const source = readFileSync(join(__dirname, '../../../src/webview/parser/validation/validate.ts'), 'utf8');
        expect(source).toContain("import { countSqlStatements } from './splitting';");
        expect(source).toContain('return countSqlStatements(sql);');
    });

    it('guards expression subquery traversal with a visited WeakSet', () => {
        const source = readFileSync(join(__dirname, '../../../src/webview/parser/statements/select.ts'), 'utf8');
        expect(source).toContain('visited: WeakSet<object> = new WeakSet<object>()');
        expect(source).toContain('if (visited.has(expr)) {');
    });

    it('keeps unicode-aware identifier matching in regex fallback parser', () => {
        const source = readFileSync(join(__dirname, '../../../src/webview/parser/dialects/fallback.ts'), 'utf8');
        expect(source).toContain("const identifierPart = '[\\\\p{L}\\\\p{N}_$]+';");
        expect(source).toContain("new RegExp(`\\\\bFROM\\\\s+(${qualifiedIdentifier})`, 'giu')");
    });
});
