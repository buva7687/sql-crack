import { readFileSync } from 'fs';
import { join } from 'path';

describe('visualization panel theme/config reactivity', () => {
    const source = readFileSync(join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');

    it('listens for active color theme changes and refreshes current panel html', () => {
        expect(source).toContain('vscode.window.onDidChangeActiveColorTheme(() => {');
        expect(source).toContain('this._update(this._currentSql, this._currentOptions);');
    });

    it('listens for sqlCrack configuration changes and refreshes current panel html', () => {
        expect(source).toContain('vscode.workspace.onDidChangeConfiguration((event) => {');
        expect(source).toContain("event.affectsConfiguration('sqlCrack')");
        expect(source).toContain('}, null, this._disposables);');
    });
});
