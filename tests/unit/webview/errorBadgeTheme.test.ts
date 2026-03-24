import { readFileSync } from 'fs';
import { join } from 'path';

describe('error badge theming', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/ui/toolbar/errorBadge.ts'),
        'utf8'
    );

    it('applies the component palette and theme-change updates to the error badge', () => {
        expect(source).toContain('import { getComponentUiColors } from \'../../constants\'');
        expect(source).toContain('function applyErrorBadgeTheme(');
        expect(source).toContain('badge.dataset.theme = isDark ? \'dark\' : \'light\';');
        expect(source).toContain('badge.style.background = background;');
        expect(source).toContain('badge.onmouseenter = () => {');
        expect(source).toContain("document.addEventListener('theme-change', ((event: CustomEvent<{ dark: boolean }>) => {");
        expect(source).toContain('data-role="error-badge-icon"');
        expect(source).toContain('data-role="error-badge-label"');
    });
});
