import { readFileSync } from 'fs';
import { join } from 'path';

describe('parser worker wiring prep', () => {
    const panelSource = readFileSync(join(__dirname, '../../../src/visualizationPanel.ts'), 'utf8');
    const parserClientSource = readFileSync(join(__dirname, '../../../src/webview/parserClient.ts'), 'utf8');

    it('keeps strict nonce-based script CSP in SQL flow webview html', () => {
        expect(panelSource).toContain("default-src 'none'");
        expect(panelSource).toContain("script-src 'nonce-${nonce}'");
    });

    it('loads the main webview bundle through asWebviewUri', () => {
        expect(panelSource).toContain("const scriptUri = webview.asWebviewUri(");
        expect(panelSource).toContain("vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')");
    });

    it('keeps worker entrypoints deferred in parser client until migration starts', () => {
        expect(parserClientSource).toContain('isWorkerSupported(): boolean');
        expect(parserClientSource).toContain('return false;');
        expect(parserClientSource).toContain('cancelPendingParse(): void');
    });

    it.todo('adds worker-src to SQL flow webview CSP to permit parser worker execution');
    it.todo('injects parser worker URI via asWebviewUri (window.parserWorkerUri)');
    it.todo('instantiates worker from injected URI in parserClient worker manager path');
});
