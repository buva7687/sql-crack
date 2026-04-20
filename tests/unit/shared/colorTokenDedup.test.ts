import { readFileSync } from 'fs';
import { join } from 'path';

const readSource = (relativePath: string): string =>
    readFileSync(join(__dirname, '../../..', relativePath), 'utf8');

describe('shared color token dedup', () => {
    it('sources workspace accent colors and ui theme surfaces from shared theme tokens', () => {
        const themeSource = readSource('src/shared/theme.ts');

        expect(themeSource).toContain("import { UI_SURFACE, WORKSPACE_ACCENT_COLORS } from './themeTokens';");
        expect(themeSource).toContain('...WORKSPACE_ACCENT_COLORS.light,');
        expect(themeSource).toContain('...WORKSPACE_ACCENT_COLORS.dark,');
        expect(themeSource).toContain('background: UI_SURFACE.dark.background,');
        expect(themeSource).toContain('textMuted: UI_SURFACE.dark.textMuted,');
        expect(themeSource).toContain('background: UI_SURFACE.light.background,');
        expect(themeSource).toContain('textMuted: UI_SURFACE.light.textMuted,');
    });

    it('reuses shared node surface and ui surface tokens in webview colors', () => {
        const colorsSource = readSource('src/webview/constants/colors.ts');

        expect(colorsSource).toContain("import { NODE_SURFACE as SHARED_NODE_SURFACE, UI_SURFACE } from '../../shared/themeTokens';");
        expect(colorsSource).toContain('background: UI_SURFACE.dark.background,');
        expect(colorsSource).toContain('textMuted: UI_SURFACE.dark.textMuted,');
        expect(colorsSource).toContain('textDim: UI_SURFACE.dark.textDim,');
        expect(colorsSource).toContain('backgroundLight: UI_SURFACE.light.background,');
        expect(colorsSource).toContain('textLightMuted: UI_SURFACE.light.textMuted,');
        expect(colorsSource).toContain('textLightDim: UI_SURFACE.light.textDim,');
        expect(colorsSource).toContain("export { NODE_ACCENT_COLORS, getNodeAccentColor } from '../../shared/themeTokens';");
        expect(colorsSource).toContain('export const NODE_SURFACE = SHARED_NODE_SURFACE;');
        expect(colorsSource).not.toContain("export const NODE_SURFACE = {");
    });
});
