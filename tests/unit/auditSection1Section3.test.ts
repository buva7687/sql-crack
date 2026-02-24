import { readFileSync } from 'fs';
import { join } from 'path';

describe('audit section 1 + section 3 fixes', () => {
    const webviewIndex = readFileSync(join(__dirname, '../../src/webview/index.ts'), 'utf8');
    const extension = readFileSync(join(__dirname, '../../src/extension.ts'), 'utf8');
    const panel = readFileSync(join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

    it('BUG-1: debugLog no longer recurses into itself', () => {
        expect(webviewIndex).toContain('console.log(...args);');
        expect(webviewIndex).not.toContain('debugLog(...args);');
    });

    it('U2: parse path shows loading overlay and yields a paint frame', () => {
        expect(webviewIndex).toContain("showGlobalLoading('Parsing SQL...');");
        expect(webviewIndex).toContain('requestAnimationFrame(() => {');
        expect(webviewIndex).toContain('hideGlobalLoading();');
    });

    it('U3: comments-only SQL is explicitly handled in command and webview flows', () => {
        expect(extension).toContain('if (!hasExecutableSql(sqlCode)) {');
        expect(extension).toContain('Only comments or whitespace found. Add at least one SQL statement to visualize.');
        expect(webviewIndex).toContain('No executable SQL found. File appears to contain only comments or whitespace.');
    });

    it('U4: active editor SQL/non-SQL state is sent to webview for inactive indication', () => {
        expect(extension).toContain('VisualizationPanel.setActiveEditorActivity');
        expect(webviewIndex).toContain("case 'setEditorActivity':");
        expect(webviewIndex).toContain('markRefreshButtonInactive();');
    });

    it('U5: panel UI state is persisted and restored through host/webview messaging', () => {
        expect(webviewIndex).toContain("command: 'persistUiState'");
        expect(webviewIndex).toContain('window.initialUiState');
        expect(panel).toContain("_uiStateStoreKey = 'sqlFlow.panelUiStateByKey'");
        expect(panel).toContain("case 'persistUiState':");
        expect(panel).toContain('window.initialUiState =');
    });

    it('U6: parse errors can surface a one-click dialect switch prompt', () => {
        expect(webviewIndex).toContain('dialect-switch-suggestion');
        expect(webviewIndex).toContain('Switch to ${dialect}');
        expect(webviewIndex).toContain('showDialectSwitchSuggestion');
    });

    it('U7: pinned tabs persist and restore source document URI', () => {
        expect(panel).toContain('sourceDocumentUri?: string;');
        expect(panel).toContain('sourceDocumentUri: options.documentUri?.toString()');
        expect(panel).toContain('vscode.Uri.parse(pin.sourceDocumentUri)');
    });

    it('U8: advanced numeric settings are normalized to safe min/max bounds', () => {
        expect(extension).toContain("normalizeAdvancedLimit(config.get<number>('advanced.maxFileSizeKB', 100), 100, 10, 10000)");
        expect(extension).toContain("normalizeAdvancedLimit(config.get<number>('advanced.maxStatements', 50), 50, 1, 500)");
        expect(panel).toContain("normalizeAdvancedLimit(config.get<number>('advanced.maxFileSizeKB', 100), 100, 10, 10000)");
        expect(panel).toContain("normalizeAdvancedLimit(config.get<number>('advanced.maxStatements', 50), 50, 1, 500)");
        expect(panel).toContain("normalizeAdvancedLimit(config.get<number>('advanced.parseTimeoutSeconds', 5), 5, 1, 60)");
        expect(webviewIndex).toContain('const maxFileSizeKB = normalizeAdvancedLimit(window.maxFileSizeKB, 100, 10, 10000);');
        expect(webviewIndex).toContain('const maxStatements = normalizeAdvancedLimit(window.maxStatements, 50, 1, 500);');
        expect(webviewIndex).toContain('const parseTimeoutSeconds = normalizeAdvancedLimit(window.parseTimeoutSeconds, 5, 1, 60);');
    });

    it('U9: restore pinned tabs command is contributed for command palette discoverability', () => {
        expect(extension).toContain("registerCommand('sql-crack.restorePinnedTabs'");
        expect(pkg.contributes?.menus?.commandPalette).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    command: 'sql-crack.restorePinnedTabs',
                    when: 'workspaceFolderCount > 0',
                }),
            ])
        );
    });
});
