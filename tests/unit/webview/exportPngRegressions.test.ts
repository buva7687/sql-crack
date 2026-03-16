import { readFileSync } from 'fs';
import { join } from 'path';

describe('webview PNG export regressions', () => {
    const exportSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export.ts'),
        'utf8'
    );
    const exportConstantsSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export/constants.ts'),
        'utf8'
    );
    const exportRasterSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export/raster.ts'),
        'utf8'
    );
    const exportSvgPreparationSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export/svgPreparation.ts'),
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
        expect(exportConstantsSource).toContain('export const MAX_EXPORT_DIMENSION = 4096;');
        expect(exportConstantsSource).toContain('export const MAX_RASTER_DIMENSION = 4096;');
        expect(exportSvgPreparationSource).toContain('const rawWidth = Math.max(1, Math.ceil(bounds.width + EXPORT_SVG_PADDING * 2));');
        expect(exportSvgPreparationSource).toContain('const rawHeight = Math.max(1, Math.ceil(bounds.height + EXPORT_SVG_PADDING * 2));');
        expect(exportSvgPreparationSource).toContain('viewBox');
        expect(exportSvgPreparationSource).toContain('${rawWidth} ${rawHeight}');
        expect(exportRasterSource).toContain('export function getRasterScale(width: number, height: number, preferredScale = 2): number {');
        expect(exportSource).toContain('const scale = getRasterScale(width, height);');
    });

    it('strips foreignObject elements from SVG clone before rasterization', () => {
        expect(exportSvgPreparationSource).toContain("querySelectorAll('foreignObject')");
        expect(exportSvgPreparationSource).toContain('foreignObject) => foreignObject.remove()');
    });

    it('resets pan/zoom transform on main group for centered export', () => {
        expect(exportSvgPreparationSource).toContain("mainGroupClone.removeAttribute('transform')");
    });

    it('shows explicit user feedback for copy and save actions', () => {
        expect(exportSource).toContain("showExportToast('Copied! PNG is in clipboard'");
        expect(exportSource).toContain("showExportToast('Copied! Mermaid is in clipboard'");
        expect(exportSource).toContain("showExportToast('Save dialog opened'");
    });
});
