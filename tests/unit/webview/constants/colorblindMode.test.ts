import {
    COLORBLIND_NODE_COLORS,
    getColorblindMode,
    getEdgeDashPattern,
    getNodeColor,
    getSeverityIcon,
    getWarningColor,
    setColorblindMode,
} from '../../../../src/webview/constants/colors';

function hexToRgb(hex: string): [number, number, number] {
    const value = hex.replace('#', '');
    return [
        Number.parseInt(value.slice(0, 2), 16),
        Number.parseInt(value.slice(2, 4), 16),
        Number.parseInt(value.slice(4, 6), 16),
    ];
}

function luminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex).map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function contrastRatio(a: string, b: string): number {
    const l1 = luminance(a);
    const l2 = luminance(b);
    const brighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (brighter + 0.05) / (darker + 0.05);
}

describe('colorblind mode constants', () => {
    afterEach(() => {
        setColorblindMode('off');
    });

    it('switches node and warning colors when colorblind mode changes', () => {
        setColorblindMode('deuteranopia');
        expect(getColorblindMode()).toBe('deuteranopia');
        expect(getNodeColor('table')).toBe(COLORBLIND_NODE_COLORS.deuteranopia.table);
        expect(getWarningColor('high')).not.toBe(getWarningColor('medium'));

        setColorblindMode('off');
        expect(getColorblindMode()).toBe('off');
    });

    it('keeps deuteranopia node accents readable against at least one node surface theme', () => {
        const lightSurface = '#FFFFFF';
        const darkSurface = '#1A1A1A';

        for (const color of Object.values(COLORBLIND_NODE_COLORS.deuteranopia)) {
            const lightContrast = contrastRatio(color, lightSurface);
            const darkContrast = contrastRatio(color, darkSurface);
            expect(Math.max(lightContrast, darkContrast)).toBeGreaterThanOrEqual(3);
        }
    });

    it('provides edge dash patterns so edge types remain distinguishable without color', () => {
        setColorblindMode('deuteranopia');

        const join = getEdgeDashPattern('join');
        const where = getEdgeDashPattern('where');
        const having = getEdgeDashPattern('having');

        expect(join).toBeTruthy();
        expect(where).toBeTruthy();
        expect(having).toBeTruthy();
        expect(new Set([join, where, having]).size).toBe(3);

        setColorblindMode('off');
        expect(getEdgeDashPattern('join')).toBeNull();
    });

    it('uses severity icons as non-color indicators', () => {
        expect(getSeverityIcon('low')).toBe('i');
        expect(getSeverityIcon('medium')).toBe('▲');
        expect(getSeverityIcon('high')).toBe('✕');
    });
});
