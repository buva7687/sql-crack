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

    it('keeps SELECT flow anchoring null-safe when there is no base table', () => {
        const source = readFileSync(join(__dirname, '../../../src/webview/parser/statements/select.ts'), 'utf8');
        expect(source).toContain('const baseTableId = tableIds[0] ?? null;');
        expect(source).toContain('let lastOutputId: string | null = baseTableId;');
        expect(source).toContain('let previousId: string | null = lastOutputId ?? baseTableId;');
    });

    it('keeps unicode-aware identifier matching in regex fallback parser', () => {
        const source = readFileSync(join(__dirname, '../../../src/webview/parser/dialects/fallback.ts'), 'utf8');
        expect(source).toContain("const identifierPart = '#?[\\\\p{L}\\\\p{N}_$]+';");
        expect(source).toContain("new RegExp(`\\\\bFROM\\\\s+(${qualifiedIdentifier})`, 'giu')");
    });

    it('preserves temp-table identifiers when normalizing SQL for advanced issue detection', () => {
        const source = readFileSync(join(__dirname, '../../../src/webview/parser/hints/advancedIssues.ts'), 'utf8');
        expect(source).toContain(".replace(/#(?![A-Za-z0-9_])[^\\n]*/g, '')");
    });

    it('quotes hash temp-table identifiers before AST parsing for Redshift and TransactSQL', () => {
        const source = readFileSync(join(__dirname, '../../../src/webview/parser/dialects/preprocessing.ts'), 'utf8');
        expect(source).toContain("dialect !== 'Redshift' && dialect !== 'TransactSQL'");
        expect(source).toContain('const tempIdentifierRegex = /##?[A-Za-z0-9_]+/g;');
    });
});
