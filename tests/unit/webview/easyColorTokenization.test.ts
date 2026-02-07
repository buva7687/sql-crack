import { readFileSync } from 'fs';
import { join } from 'path';

describe('easy webview color tokenization', () => {
    const layoutPickerSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/layoutPicker.ts'),
        'utf8'
    );
    const exportDropdownSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/exportDropdown.ts'),
        'utf8'
    );
    const breadcrumbBarSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/breadcrumbBar.ts'),
        'utf8'
    );
    const constantsSource = readFileSync(
        join(__dirname, '../../../src/webview/constants/index.ts'),
        'utf8'
    );

    it('keeps layout picker colors sourced from shared component tokens', () => {
        expect(layoutPickerSource).toContain('getComponentUiColors');
        expect(layoutPickerSource).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
        expect(layoutPickerSource).not.toMatch(/rgba?\(/);
    });

    it('keeps export dropdown colors sourced from shared component tokens', () => {
        expect(exportDropdownSource).toContain('getComponentUiColors');
        expect(exportDropdownSource).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
        expect(exportDropdownSource).not.toMatch(/rgba?\(/);
    });

    it('keeps breadcrumb bar colors sourced from shared component tokens', () => {
        expect(breadcrumbBarSource).toContain('getComponentUiColors');
        expect(breadcrumbBarSource).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
        expect(breadcrumbBarSource).not.toMatch(/rgba?\(/);
    });

    it('re-exports shared component token helpers from constants index', () => {
        expect(constantsSource).toContain('COMPONENT_UI_COLORS');
        expect(constantsSource).toContain('getComponentUiColors');
    });
});
