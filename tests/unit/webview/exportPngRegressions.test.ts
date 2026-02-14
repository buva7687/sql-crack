import { readFileSync } from 'fs';
import { join } from 'path';

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
        expect(exportSource).toContain('const rawWidth = Math.max(1, Math.ceil(bounds.width + padding * 2));');
        expect(exportSource).toContain('const rawHeight = Math.max(1, Math.ceil(bounds.height + padding * 2));');
        expect(exportSource).toContain('viewBox');
        expect(exportSource).toContain('${rawWidth} ${rawHeight}');
    });

    it('shows explicit user feedback for copy and save actions', () => {
        expect(exportSource).toContain("showExportToast('Copied! PNG is in clipboard'");
        expect(exportSource).toContain("showExportToast('Copied! Mermaid is in clipboard'");
        expect(exportSource).toContain("showExportToast('Save dialog opened'");
    });
});
