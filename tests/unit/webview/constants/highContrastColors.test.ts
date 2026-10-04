import { getComponentUiColors, getHighContrastTextColor, setHighContrastMode, UI_COLORS } from '../../../../src/webview/constants/colors';

function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

describe('SQL Flow high-contrast colors', () => {
    afterEach(() => setHighContrastMode(false));

    it('keeps muted component and legacy panel labels readable on dark panels and badges', () => {
        setHighContrastMode(true);
        const colors = [getComponentUiColors(true).textMuted, getComponentUiColors(true).textDim, UI_COLORS.textMuted, UI_COLORS.textDim];
        for (const color of colors) {
            for (const background of ['#111111', '#222222', '#2b2e32']) {
                expect(contrast(color, background)).toBeGreaterThanOrEqual(7);
            }
        }
    });

    it('keeps muted labels readable in light high contrast', () => {
        setHighContrastMode(true);
        const colors = [getComponentUiColors(false).textMuted, getComponentUiColors(false).textDim, UI_COLORS.textLightMuted, UI_COLORS.textLightDim];
        for (const color of colors) {
            for (const background of ['#fafafa', '#ffffff', '#e2e8f0']) {
                expect(contrast(color, background)).toBeGreaterThanOrEqual(7);
            }
        }
    });

    it('updates existing palettes and restores regular text colors when high contrast is turned off', () => {
        const palette = getComponentUiColors(true);
        const regularDark = { muted: palette.textMuted, dim: palette.textDim };
        const regularLight = getComponentUiColors(false).textMuted;
        setHighContrastMode(true);
        expect(palette.textMuted).not.toBe(regularDark.muted);
        expect(getHighContrastTextColor('#64748b', true)).toBe(palette.textMuted);
        setHighContrastMode(false);
        expect(palette.textMuted).toBe(regularDark.muted);
        expect(palette.textDim).toBe(regularDark.dim);
        expect(getComponentUiColors(false).textMuted).toBe(regularLight);
        expect(getHighContrastTextColor('#64748b', true)).toBe('#64748b');
    });
});
