import { readFileSync } from 'fs';
import { join } from 'path';

describe('export preview wiring', () => {
    const exportDropdownSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/exportDropdown.ts'),
        'utf8'
    );
    const exportPreviewSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/exportPreview.ts'),
        'utf8'
    );
    const exportFeatureSource = readFileSync(
        join(__dirname, '../../../src/webview/features/export.ts'),
        'utf8'
    );
    const indexSource = readFileSync(
        join(__dirname, '../../../src/webview/index.ts'),
        'utf8'
    );
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    it('routes PNG, SVG, and PDF dropdown actions through preview instead of immediate export', () => {
        expect(exportDropdownSource).toContain('PNG Preview');
        expect(exportDropdownSource).toContain('SVG Preview');
        expect(exportDropdownSource).toContain('PDF Preview');
        expect(exportDropdownSource).toContain("callbacks.onOpenExportPreview('png')");
        expect(exportDropdownSource).toContain("callbacks.onOpenExportPreview('svg')");
        expect(exportDropdownSource).toContain("callbacks.onOpenExportPreview('pdf')");
    });

    it('defines a dedicated export preview modal with live preview callbacks', () => {
        expect(exportPreviewSource).toContain("export function showExportPreview");
        expect(exportPreviewSource).toContain('buildPngPreview');
        expect(exportPreviewSource).toContain('buildSvgPreview');
        expect(exportPreviewSource).toContain('buildPdfPreview');
        expect(exportPreviewSource).toContain('Save PDF');
        expect(exportPreviewSource).toContain('Save PNG');
        expect(exportPreviewSource).toContain("selectedFormat === 'png' || selectedFormat === 'svg' || selectedFormat === 'pdf'");
        expect(exportPreviewSource).toContain('flex-shrink: 0;');
    });

    it('wires toolbar and renderer callbacks into the export preview feature', () => {
        expect(indexSource).toContain('onOpenExportPreview: openExportPreview');
        expect(rendererSource).toContain("export function openExportPreview(initialFormat: 'png' | 'svg' | 'pdf' = 'png')");
        expect(exportFeatureSource).toContain('showExportPreview({');
        expect(exportFeatureSource).toContain("command: 'savePdf'");
    });
});
