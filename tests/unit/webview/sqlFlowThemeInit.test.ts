import { readFileSync } from 'fs';
import { join } from 'path';

describe('SQL Flow theme initialization respects defaultTheme setting', () => {
    const panelSource = readFileSync(
        join(__dirname, '../../../src/visualizationPanel.ts'),
        'utf8'
    );
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    describe('visualizationPanel.ts', () => {
        it('reads the advanced.defaultTheme setting', () => {
            expect(panelSource).toContain("config.get<string>('advanced.defaultTheme'");
        });

        it('maps light/dark/auto preference to vscodeTheme value', () => {
            expect(panelSource).toContain("themePreference === 'light'");
            expect(panelSource).toContain("themePreference === 'dark'");
            // 'auto' falls through to VS Code theme detection
            expect(panelSource).toContain("// 'auto' - match VS Code theme");
        });

        it('does not hardcode vscodeTheme directly from activeColorTheme without checking setting', () => {
            // vscodeTheme must be declared with let (computed conditionally), not const from theme kind
            expect(panelSource).toContain('let vscodeTheme: string;');
            expect(panelSource).not.toMatch(
                /const vscodeTheme\s*=\s*themeKind\s*===/
            );
        });
    });

    describe('renderer.ts', () => {
        it('initializes isDarkTheme from window.vscodeTheme instead of hardcoding true', () => {
            expect(rendererSource).toContain("isDarkTheme: window.vscodeTheme !== 'light'");
            expect(rendererSource).not.toMatch(/isDarkTheme:\s*true\s*,/);
        });
    });
});
