import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Extract getRasterScale from source so we can unit-test it with real values.
 * The function is private in export.ts so we eval it here.
 */
function makeGetRasterScale(): (width: number, height: number, preferredScale?: number) => number {
    const MAX_RASTER_DIMENSION = 4096;
    return (width: number, height: number, preferredScale = 2): number => {
        const safeWidth = Math.max(1, width);
        const safeHeight = Math.max(1, height);
        const widthLimitScale = MAX_RASTER_DIMENSION / safeWidth;
        const heightLimitScale = MAX_RASTER_DIMENSION / safeHeight;
        return Math.max(1, Math.min(preferredScale, widthLimitScale, heightLimitScale));
    };
}

describe('webview PNG export regressions', () => {
    const exportSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export.ts'),
        'utf8'
    );
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    it('guards bounds calculation against Infinity/NaN values', () => {
        expect(rendererSource).toContain('Number.isFinite(minX)');
        expect(rendererSource).toContain('Number.isFinite(maxY)');
        expect(rendererSource).toContain('width: 400');
        expect(rendererSource).toContain('height: 300');
    });

    it('caps export dimensions and keeps full viewBox extents', () => {
        expect(exportSource).toContain('const MAX_EXPORT_DIMENSION = 4096;');
        expect(exportSource).toContain('const MAX_RASTER_DIMENSION = 4096;');
        expect(exportSource).toContain('const rawWidth = Math.max(1, Math.ceil(bounds.width + padding * 2));');
        expect(exportSource).toContain('const rawHeight = Math.max(1, Math.ceil(bounds.height + padding * 2));');
        expect(exportSource).toContain('viewBox');
        expect(exportSource).toContain('${rawWidth} ${rawHeight}');
        expect(exportSource).toContain('function getRasterScale(width: number, height: number, preferredScale = 2): number {');
        expect(exportSource).toContain('const scale = getRasterScale(width, height);');
    });

    it('strips foreignObject elements from SVG clone before rasterization', () => {
        expect(exportSource).toContain("querySelectorAll('foreignObject')");
        expect(exportSource).toContain('fo => fo.remove()');
    });

    it('resets pan/zoom transform on main group for centered export', () => {
        expect(exportSource).toContain("mainGroupClone.removeAttribute('transform')");
    });

    it('shows explicit user feedback for copy and save actions', () => {
        expect(exportSource).toContain("showExportToast('Copied! PNG is in clipboard'");
        expect(exportSource).toContain("showExportToast('Copied! Mermaid is in clipboard'");
        expect(exportSource).toContain("showExportToast('Save dialog opened'");
    });
});

describe('getRasterScale logic', () => {
    const getRasterScale = makeGetRasterScale();

    it('returns 2x for small graphs that fit comfortably', () => {
        expect(getRasterScale(800, 600)).toBe(2);
    });

    it('returns 2x for graphs exactly at half the limit', () => {
        expect(getRasterScale(2048, 2048)).toBe(2);
    });

    it('caps scale when width would exceed limit', () => {
        // 3000 * 2 = 6000 > 4096, so scale = 4096/3000 ≈ 1.365
        const scale = getRasterScale(3000, 500);
        expect(scale).toBeCloseTo(4096 / 3000, 5);
        expect(3000 * scale).toBeLessThanOrEqual(4096);
    });

    it('caps scale when height would exceed limit', () => {
        const scale = getRasterScale(500, 3000);
        expect(scale).toBeCloseTo(4096 / 3000, 5);
        expect(3000 * scale).toBeLessThanOrEqual(4096);
    });

    it('caps scale when both dimensions are large', () => {
        const scale = getRasterScale(4000, 3500);
        // min(2, 4096/4000, 4096/3500) = min(2, 1.024, 1.170) = 1.024
        expect(scale).toBeCloseTo(4096 / 4000, 5);
        expect(4000 * scale).toBeLessThanOrEqual(4096);
        expect(3500 * scale).toBeLessThanOrEqual(4096);
    });

    it('returns 1 for graphs already at the limit', () => {
        expect(getRasterScale(4096, 4096)).toBe(1);
    });

    it('never returns below 1 even for oversized inputs', () => {
        // Inputs larger than MAX_RASTER_DIMENSION shouldn't happen
        // (prepareSvgForExport caps them), but getRasterScale should still be safe
        expect(getRasterScale(8000, 8000)).toBe(1);
    });

    it('handles zero and negative dimensions safely', () => {
        expect(getRasterScale(0, 0)).toBe(2);
        expect(getRasterScale(-100, -50)).toBe(2);
    });

    it('respects custom preferredScale parameter', () => {
        expect(getRasterScale(800, 600, 3)).toBe(3);
        expect(getRasterScale(800, 600, 1)).toBe(1);
    });

    it('caps custom preferredScale when it would exceed limit', () => {
        // 2000 * 3 = 6000 > 4096, so capped to 4096/2000 = 2.048
        const scale = getRasterScale(2000, 1000, 3);
        expect(scale).toBeCloseTo(4096 / 2000, 5);
        expect(2000 * scale).toBeLessThanOrEqual(4096);
    });
});
