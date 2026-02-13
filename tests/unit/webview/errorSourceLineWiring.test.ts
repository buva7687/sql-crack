import { readFileSync } from 'fs';
import { join } from 'path';

describe('error source-line wiring', () => {
    const indexSource = readFileSync(
        join(__dirname, '../../../src/webview/index.ts'),
        'utf8'
    );
    const toolbarSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/toolbar.ts'),
        'utf8'
    );
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );
    const parserSource = readFileSync(
        join(__dirname, '../../../src/webview/sqlParser.ts'),
        'utf8'
    );

    it('maps absolute parse error lines back to statement-relative lines before extracting source text', () => {
        expect(indexSource).toContain('function extractSourceLineFromParseError');
        expect(indexSource).toContain('errorLine - lineRange.startLine + 1');
        expect(indexSource).toContain('extractSourceLineFromParseError(e, lineRange)');
        expect(indexSource).toContain('query.errorSourceLine = extractSourceLineFromParseError(parseError, lineRange);');
    });

    it('shows source line in badge tooltip and renderer overlay', () => {
        expect(toolbarSource).toContain('sourceLine?: string');
        expect(toolbarSource).toContain("text += `\\n→ ${e.sourceLine}`;");
        expect(rendererSource).toContain('function renderError(message: string, sourceLine?: string): void');
        expect(rendererSource).toContain('sourceText.textContent = `→ ${sourceLine}`;');
        expect(rendererSource).toContain('renderError(result.error, result.errorSourceLine);');
    });

    it('stores longer failing SQL snippets to improve source-line extraction', () => {
        expect(parserSource).toContain('query.sql.substring(0, 500)');
        expect(parserSource).toContain("query.sql.length > 500 ? '...' : ''");
    });
});
