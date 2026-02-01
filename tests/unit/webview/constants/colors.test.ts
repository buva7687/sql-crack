/**
 * Constants Colors Tests
 *
 * Tests for color constants and utility functions in webview/constants/colors.ts
 */

import {
    UI_COLORS,
    NODE_COLORS,
    WARNING_COLORS,
    TRANSFORMATION_COLORS,
    getTransformationColor,
    getNodeColor,
    getWarningColor
} from '../../../../src/webview/constants/colors';

describe('Constants Colors', () => {
    describe('UI_COLORS', () => {
        it('has background colors defined', () => {
            expect(UI_COLORS.background).toBeDefined();
            expect(UI_COLORS.backgroundDark).toBeDefined();
            expect(UI_COLORS.backgroundLight).toBeDefined();
        });

        it('has text colors defined', () => {
            expect(UI_COLORS.text).toBeDefined();
            expect(UI_COLORS.textMuted).toBeDefined();
            expect(UI_COLORS.textLight).toBeDefined();
        });

        it('has border colors defined', () => {
            expect(UI_COLORS.border).toBeDefined();
            expect(UI_COLORS.borderMedium).toBeDefined();
        });
    });

    describe('NODE_COLORS', () => {
        it('has colors for common node types', () => {
            expect(NODE_COLORS.table).toBeDefined();
            expect(NODE_COLORS.filter).toBeDefined();
            expect(NODE_COLORS.join).toBeDefined();
            expect(NODE_COLORS.aggregate).toBeDefined();
        });

        it('all colors are valid hex values', () => {
            for (const [type, color] of Object.entries(NODE_COLORS)) {
                expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
            }
        });
    });

    describe('WARNING_COLORS', () => {
        it('has colors for all severity levels', () => {
            expect(WARNING_COLORS.low).toBeDefined();
            expect(WARNING_COLORS.medium).toBeDefined();
            expect(WARNING_COLORS.high).toBeDefined();
        });

        it('all colors are valid hex values', () => {
            for (const [severity, color] of Object.entries(WARNING_COLORS)) {
                expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
            }
        });
    });

    describe('TRANSFORMATION_COLORS', () => {
        it('has colors for transformation types', () => {
            expect(TRANSFORMATION_COLORS.passthrough).toBeDefined();
            expect(TRANSFORMATION_COLORS.renamed).toBeDefined();
            expect(TRANSFORMATION_COLORS.aggregated).toBeDefined();
            expect(TRANSFORMATION_COLORS.calculated).toBeDefined();
            expect(TRANSFORMATION_COLORS.default).toBeDefined();
        });
    });

    describe('getTransformationColor', () => {
        it('returns correct color for known transformation types', () => {
            expect(getTransformationColor('passthrough')).toBe(TRANSFORMATION_COLORS.passthrough);
            expect(getTransformationColor('renamed')).toBe(TRANSFORMATION_COLORS.renamed);
            expect(getTransformationColor('aggregated')).toBe(TRANSFORMATION_COLORS.aggregated);
            expect(getTransformationColor('calculated')).toBe(TRANSFORMATION_COLORS.calculated);
        });

        it('returns default color for unknown transformation type', () => {
            expect(getTransformationColor('unknown')).toBe(TRANSFORMATION_COLORS.default);
            expect(getTransformationColor('')).toBe(TRANSFORMATION_COLORS.default);
            expect(getTransformationColor('not-a-type')).toBe(TRANSFORMATION_COLORS.default);
        });
    });

    describe('getNodeColor', () => {
        it('returns correct color for known node types', () => {
            expect(getNodeColor('table')).toBe(NODE_COLORS.table);
            expect(getNodeColor('filter')).toBe(NODE_COLORS.filter);
            expect(getNodeColor('join')).toBe(NODE_COLORS.join);
            expect(getNodeColor('aggregate')).toBe(NODE_COLORS.aggregate);
            expect(getNodeColor('select')).toBe(NODE_COLORS.select);
        });

        it('returns fallback color for unknown node type', () => {
            const fallback = '#6366f1';
            expect(getNodeColor('unknown' as any)).toBe(fallback);
            expect(getNodeColor('' as any)).toBe(fallback);
        });
    });

    describe('getWarningColor', () => {
        it('returns correct color for known severities', () => {
            expect(getWarningColor('low')).toBe(WARNING_COLORS.low);
            expect(getWarningColor('medium')).toBe(WARNING_COLORS.medium);
            expect(getWarningColor('high')).toBe(WARNING_COLORS.high);
        });

        it('returns low severity color for unknown severity', () => {
            expect(getWarningColor('unknown' as any)).toBe(WARNING_COLORS.low);
            expect(getWarningColor('' as any)).toBe(WARNING_COLORS.low);
        });
    });
});
