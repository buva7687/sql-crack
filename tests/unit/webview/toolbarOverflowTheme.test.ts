import { readFileSync } from 'fs';
import { join } from 'path';

describe('toolbar overflow theming', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/ui/toolbar.ts'),
        'utf8'
    );

    it('uses theme-aware palette helpers for overflow button and dropdown', () => {
        expect(source).toContain('function getOverflowPalette');
        expect(source).toContain('function applyOverflowMenuTheme');
        expect(source).toContain("const overflowBtn = document.getElementById('sql-crack-overflow-btn')");
        expect(source).toContain("const overflowDropdown = document.getElementById('sql-crack-overflow-dropdown')");
    });

    it('applies overflow theming during toolbar theme updates and row rendering', () => {
        expect(source).toContain('applyOverflowMenuTheme(dark);');
        expect(source).toContain("row.setAttribute('data-overflow-row', 'true');");
        expect(source).toContain('getOverflowPalette(isDarkTheme()).hover');
    });
});
