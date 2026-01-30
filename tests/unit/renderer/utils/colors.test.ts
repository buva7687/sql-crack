/**
 * Color Utility Tests
 *
 * Tests for color manipulation and icon/color lookups.
 * These are pure functions with no DOM dependencies.
 */

import {
    WARNING_ICONS,
    WARNING_COLORS,
    NODE_TYPE_INFO,
    getWarningIcon,
    getWarningColor,
    lightenColor,
    darkenColor,
    getNodeIcon
} from '../../../../src/webview/renderer/utils/colors';

describe('Color Utilities', () => {
    describe('getWarningIcon', () => {
        it('returns correct icon for known warning types', () => {
            expect(getWarningIcon('unused')).toBe('⚠');
            expect(getWarningIcon('dead-column')).toBe('⊗');
            expect(getWarningIcon('expensive')).toBe('⚠');
            expect(getWarningIcon('fan-out')).toBe('📊');
            expect(getWarningIcon('repeated-scan')).toBe('🔄');
        });

        it('returns default icon for unknown warning type', () => {
            expect(getWarningIcon('unknown')).toBe('⚠');
            expect(getWarningIcon('')).toBe('⚠');
        });
    });

    describe('getWarningColor', () => {
        it('returns correct color for known severities', () => {
            expect(getWarningColor('low')).toBe('#f59e0b');
            expect(getWarningColor('medium')).toBe('#f97316');
            expect(getWarningColor('high')).toBe('#ef4444');
        });

        it('returns default color for unknown severity', () => {
            expect(getWarningColor('unknown')).toBe('#f59e0b');
            expect(getWarningColor('')).toBe('#f59e0b');
        });
    });

    describe('getNodeIcon', () => {
        it('returns correct icon for known node types', () => {
            expect(getNodeIcon('table')).toBe('⊞');
            expect(getNodeIcon('filter')).toBe('⧩');
            expect(getNodeIcon('join')).toBe('⋈');
            expect(getNodeIcon('aggregate')).toBe('Σ');
            expect(getNodeIcon('sort')).toBe('↕');
            expect(getNodeIcon('limit')).toBe('⊟');
            expect(getNodeIcon('select')).toBe('▤');
            expect(getNodeIcon('result')).toBe('◉');
            expect(getNodeIcon('cte')).toBe('↻');
            expect(getNodeIcon('union')).toBe('∪');
            expect(getNodeIcon('subquery')).toBe('⊂');
            expect(getNodeIcon('window')).toBe('▦');
        });

        it('returns default icon for unknown node type', () => {
            expect(getNodeIcon('unknown')).toBe('○');
            expect(getNodeIcon('')).toBe('○');
        });
    });

    describe('lightenColor', () => {
        it('lightens a hex color', () => {
            const result = lightenColor('#000000', 50);
            // Should be lighter than black
            expect(result).not.toBe('#000000');
            expect(result.startsWith('#')).toBe(true);
            expect(result).toHaveLength(7);
        });

        it('handles color with hash prefix', () => {
            const result = lightenColor('#ff0000', 10);
            expect(result.startsWith('#')).toBe(true);
        });

        it('clamps to max 255 per channel', () => {
            // Lightening white should still be white
            const result = lightenColor('#ffffff', 50);
            expect(result).toBe('#ffffff');
        });

        it('works with 0 percent (no change)', () => {
            const result = lightenColor('#808080', 0);
            expect(result).toBe('#808080');
        });

        it('works with various colors', () => {
            // Red
            const red = lightenColor('#ff0000', 20);
            expect(red.startsWith('#')).toBe(true);

            // Blue
            const blue = lightenColor('#0000ff', 20);
            expect(blue.startsWith('#')).toBe(true);

            // Mixed
            const mixed = lightenColor('#336699', 15);
            expect(mixed.startsWith('#')).toBe(true);
        });
    });

    describe('darkenColor', () => {
        it('darkens a hex color', () => {
            const result = darkenColor('#ffffff', 50);
            // Should be darker than white
            expect(result).not.toBe('#ffffff');
            expect(result.startsWith('#')).toBe(true);
            expect(result).toHaveLength(7);
        });

        it('handles color with hash prefix', () => {
            const result = darkenColor('#ff0000', 10);
            expect(result.startsWith('#')).toBe(true);
        });

        it('clamps to min 0 per channel', () => {
            // Darkening black should still be black
            const result = darkenColor('#000000', 50);
            expect(result).toBe('#000000');
        });

        it('works with 0 percent (no change)', () => {
            const result = darkenColor('#808080', 0);
            expect(result).toBe('#808080');
        });

        it('works with various colors', () => {
            // Red
            const red = darkenColor('#ff0000', 20);
            expect(red.startsWith('#')).toBe(true);

            // Green
            const green = darkenColor('#00ff00', 20);
            expect(green.startsWith('#')).toBe(true);

            // Mixed
            const mixed = darkenColor('#cc9966', 15);
            expect(mixed.startsWith('#')).toBe(true);
        });
    });

    describe('constants', () => {
        it('WARNING_ICONS has expected keys', () => {
            expect(Object.keys(WARNING_ICONS)).toContain('unused');
            expect(Object.keys(WARNING_ICONS)).toContain('dead-column');
            expect(Object.keys(WARNING_ICONS)).toContain('expensive');
        });

        it('WARNING_COLORS has expected severities', () => {
            expect(Object.keys(WARNING_COLORS)).toEqual(['low', 'medium', 'high']);
        });

        it('NODE_TYPE_INFO has expected node types', () => {
            const types = Object.keys(NODE_TYPE_INFO);
            expect(types).toContain('table');
            expect(types).toContain('filter');
            expect(types).toContain('join');
            expect(types).toContain('aggregate');
            expect(types).toContain('select');
        });

        it('NODE_TYPE_INFO entries have required properties', () => {
            for (const [type, info] of Object.entries(NODE_TYPE_INFO)) {
                expect(info).toHaveProperty('color');
                expect(info).toHaveProperty('icon');
                expect(info).toHaveProperty('description');
                expect(info.color.startsWith('#')).toBe(true);
            }
        });
    });
});
