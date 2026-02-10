import { readFileSync } from 'fs';
import { join } from 'path';

describe('extension diagnostics wiring', () => {
    const source = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');

    it('creates and uses a diagnostic collection for SQL Crack hints', () => {
        expect(source).toContain("vscode.languages.createDiagnosticCollection('sql-crack')");
        expect(source).toContain('createDiagnosticsFromBatch(document, batch)');
        expect(source).toContain('diagnosticsCollection.set(document.uri');
    });

    it('updates diagnostics on open/save and clears diagnostics on close', () => {
        expect(source).toContain('vscode.workspace.onDidOpenTextDocument');
        expect(source).toContain('vscode.workspace.onDidSaveTextDocument');
        expect(source).toContain('vscode.workspace.onDidCloseTextDocument');
        expect(source).toContain('diagnosticsCollection.delete(document.uri);');
    });

    it('gates problems diagnostics behind advanced.showDiagnosticsInProblems and clears on disable', () => {
        expect(source).toContain("get<boolean>('advanced.showDiagnosticsInProblems', false)");
        expect(source).toContain("if (!shouldShowDiagnosticsInProblems()) {");
        expect(source).toContain("e.affectsConfiguration('sqlCrack.advanced.showDiagnosticsInProblems')");
        expect(source).toContain('diagnosticsCollection.clear();');
    });

    it('registers quick-fix code actions for SQL diagnostics', () => {
        expect(source).toContain('vscode.languages.registerCodeActionsProvider');
        expect(source).toContain('new SqlCrackCodeActionProvider()');
        expect(source).toContain('providedCodeActionKinds: SqlCrackCodeActionProvider.providedCodeActionKinds');
    });
});
