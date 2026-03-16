import { readFileSync } from 'fs';
import { join } from 'path';
import { getRasterScale, svgToBase64 } from '../../../src/webview/features/export/raster';

describe('export helpers', () => {
    const svgPreparationSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export/svgPreparation.ts'),
        'utf8'
    );
    const artifactsSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export/artifacts.ts'),
        'utf8'
    );
    const exportFeatureSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export.ts'),
        'utf8'
    );
    const exportBarrelSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export/index.ts'),
        'utf8'
    );

    it('keeps SVG preparation logic in a dedicated helper module', () => {
        expect(svgPreparationSource).toContain('export function prepareSvgForExport(');
        expect(svgPreparationSource).toContain("mainGroupClone.removeAttribute('transform')");
        expect(svgPreparationSource).toContain("querySelectorAll('foreignObject')");
        expect(svgPreparationSource).toContain("'viewBox'");
        expect(svgPreparationSource).toContain('embedInlineStyles(svgClone, svgElement);');
    });

    it('uses a barrel export for the modular export helpers', () => {
        expect(exportBarrelSource).toContain("export * from './artifacts';");
        expect(exportBarrelSource).toContain("export * from './contracts';");
        expect(exportBarrelSource).toContain("export * from './pdf';");
        expect(exportFeatureSource).toContain("from './export/index';");
    });

    it('applies dark-background contrast overrides and export metadata chips in artifact builders', () => {
        expect(artifactsSource).toContain('applyExportContrastAdjustments(svgClone, options.background)');
        expect(artifactsSource).toContain("querySelectorAll('#arrowhead polygon, #arrowhead-hover polygon')");
        expect(artifactsSource).toContain('`${options.dpi} DPI`');
        expect(artifactsSource).toContain('formatBackgroundChip(options.background)');
    });

    it('encodes unicode-safe SVG strings', () => {
        const encoded = svgToBase64('<svg><text>cafe</text></svg>');
        expect(atob(encoded)).toBe('<svg><text>cafe</text></svg>');
    });

    it('returns 2x for small graphs that fit comfortably', () => {
        expect(getRasterScale(800, 600)).toBe(2);
    });

    it('caps scale when width would exceed the raster limit', () => {
        const scale = getRasterScale(3000, 500);
        expect(scale).toBeCloseTo(4096 / 3000, 5);
        expect(3000 * scale).toBeLessThanOrEqual(4096);
    });

    it('caps scale when height would exceed the raster limit', () => {
        const scale = getRasterScale(500, 3000);
        expect(scale).toBeCloseTo(4096 / 3000, 5);
        expect(3000 * scale).toBeLessThanOrEqual(4096);
    });

    it('returns 1 for graphs already at the limit', () => {
        expect(getRasterScale(4096, 4096)).toBe(1);
    });

    it('never returns below 1 even for oversized inputs', () => {
        expect(getRasterScale(8000, 8000)).toBe(1);
    });

    it('handles zero and negative dimensions safely', () => {
        expect(getRasterScale(0, 0)).toBe(2);
        expect(getRasterScale(-100, -50)).toBe(2);
    });

    it('respects the preferred scale while still enforcing limits', () => {
        expect(getRasterScale(800, 600, 3)).toBe(3);
        expect(getRasterScale(800, 600, 1)).toBe(1);

        const capped = getRasterScale(2000, 1000, 3);
        expect(capped).toBeCloseTo(4096 / 2000, 5);
        expect(2000 * capped).toBeLessThanOrEqual(4096);
    });
});
