import { readFileSync } from 'fs';
import { join } from 'path';

describe('parser worker wiring prep', () => {
    const panelSource = readFileSync(join(__dirname, '../../../src/visualizationPanel.ts'), 'utf8');
    const parserClientSource = readFileSync(join(__dirname, '../../../src/webview/parserClient.ts'), 'utf8');
    const workerSource = readFileSync(join(__dirname, '../../../src/webview/parser.worker.ts'), 'utf8');
    const webpackSource = readFileSync(join(__dirname, '../../../webpack.config.js'), 'utf8');

    it('keeps strict nonce-based script CSP in SQL flow webview html', () => {
        expect(panelSource).toContain("default-src 'none'");
        expect(panelSource).toContain("script-src 'nonce-${nonce}'");
    });

    it('loads the main webview bundle through asWebviewUri', () => {
        expect(panelSource).toContain("const scriptUri = webview.asWebviewUri(");
        expect(panelSource).toContain("vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')");
    });

    it('adds worker support detection and a worker-backed parser path in parser client', () => {
        expect(parserClientSource).toContain('isWorkerSupported(): boolean');
        expect(parserClientSource).toContain("typeof Worker !== 'undefined'");
        expect(parserClientSource).toContain('new Worker(workerUri)');
        expect(parserClientSource).toContain('cancelPendingParse(): void');
    });

    it('adds worker-src to SQL flow webview CSP to permit parser worker execution', () => {
        expect(panelSource).toContain("worker-src ${webview.cspSource} blob:;");
    });

    it('adds a parser worker entry wrapper around parseSql / parseSqlBatch / validateSql', () => {
        expect(workerSource).toContain("type: 'parse'");
        expect(workerSource).toContain("type: 'parseBatch'");
        expect(workerSource).toContain("type: 'validate'");
        expect(workerSource).toContain('parseSql(');
        expect(workerSource).toContain('parseSqlBatch(');
        expect(workerSource).toContain('validateSql(');
    });

    it('injects parser worker URI via asWebviewUri (window.parserWorkerUri)', () => {
        expect(panelSource).toContain("vscode.Uri.joinPath(this._extensionUri, 'dist', 'parser.worker.js')");
        expect(panelSource).toContain('window.parserWorkerUri =');
        expect(panelSource).toContain('parserWorkerUri: ${this._escapeForInlineScript');
    });

    it('emits a dedicated parser worker bundle from webpack', () => {
        expect(webpackSource).toContain("parser_worker: './src/webview/parser.worker.ts'");
        expect(webpackSource).toContain("? 'parser.worker.js'");
    });

    it('instantiates worker from injected URI in parserClient worker manager path', () => {
        expect(parserClientSource).toContain('getParserWorkerUri()');
        expect(parserClientSource).toContain('new Worker(workerUri)');
        expect(parserClientSource).toContain('queueWorkerRequest<ParseResult>');
        expect(parserClientSource).toContain('queueWorkerRequest<BatchParseResult>');
    });
});
