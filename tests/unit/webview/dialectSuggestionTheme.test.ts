import { readFileSync } from 'fs';
import { join } from 'path';

describe('dialect suggestion theming', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/index.ts'),
        'utf8'
    );

    it('uses the component palette for the dialect switch suggestion card and button', () => {
        expect(source).toContain('import { getComponentUiColors } from \'./constants\'');
        expect(source).toContain('function applyDialectSwitchSuggestionTheme(');
        expect(source).toContain('card.style.background = theme.surfaceElevated;');
        expect(source).toContain('button.style.background = theme.accentBg;');
        expect(source).toContain('button.style.background = theme.accentBgStrong;');
        expect(source).toContain("document.addEventListener('theme-change', themeChangeHandler);");
    });
});
