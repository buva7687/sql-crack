import { readFileSync } from 'fs';
import { join } from 'path';
import { ICONS } from '../../../src/shared/icons';

describe('layout picker icon consistency', () => {
    const layoutPickerSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/layoutPicker.ts'),
        'utf8'
    );

    it('uses shared SVG icon tokens instead of unicode glyphs for layout options', () => {
        expect(layoutPickerSource).toContain('import { ICONS } from');
        expect(layoutPickerSource).toContain('ICONS.layoutVertical');
        expect(layoutPickerSource).toContain('ICONS.layoutHorizontal');
        expect(layoutPickerSource).toContain('ICONS.layoutCompact');
        expect(layoutPickerSource).toContain('ICONS.layoutForce');
        expect(layoutPickerSource).toContain('ICONS.layoutRadial');
        expect(layoutPickerSource).not.toMatch(/[↓→⊞◎◉]/u);
    });

    it('defines dedicated SVG assets for each layout option', () => {
        const layoutIcons = [
            ICONS.layoutVertical,
            ICONS.layoutHorizontal,
            ICONS.layoutCompact,
            ICONS.layoutForce,
            ICONS.layoutRadial,
        ];
        for (const icon of layoutIcons) {
            expect(icon).toContain('<svg');
            expect(icon).toContain('aria-hidden="true"');
        }
    });
});
