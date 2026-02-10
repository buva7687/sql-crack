import { readFileSync } from 'fs';
import { join } from 'path';

describe('command bar theme detection', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/ui/commandBar.ts'),
        'utf8'
    );

    it('uses the createCommandBar theme callback instead of hardcoded class checks', () => {
        expect(source).toContain('let commandBarThemeResolver: (() => boolean) | null = null;');
        expect(source).toContain('commandBarThemeResolver = isDarkTheme;');
        expect(source).toContain("renderResults(results, '', commandBarThemeResolver ?? (() => true));");
        expect(source).not.toContain("document.documentElement.classList.contains('vscode-dark')");
    });
});
