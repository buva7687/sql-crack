import { readFileSync } from 'fs';
import { join } from 'path';

describe('details panel expand guard on content display', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );
    const infoPanelSource = readFileSync(
        join(__dirname, '../../../src/webview/panels/infoPanel.ts'),
        'utf8'
    );
    const columnLineageSource = readFileSync(
        join(__dirname, '../../../src/webview/features/columnLineage.ts'),
        'utf8'
    );

    it('defines ensureDetailsPanelExpanded that checks aria-expanded and clicks toggle', () => {
        expect(rendererSource).toContain('function ensureDetailsPanelExpanded()');
        expect(rendererSource).toContain("getAttribute('aria-expanded') === 'false'");
        expect(rendererSource).toContain('.sql-crack-resize-toggle[data-panel-key="details"]');
    });

    it('calls ensureDetailsPanelExpanded before showing lineage path content', () => {
        const showLineageIdx = columnLineageSource.indexOf('export function showLineagePathFeature(');
        const expandCallIdx = columnLineageSource.indexOf('ensureDetailsPanelExpanded()', showLineageIdx);
        const innerHtmlIdx = columnLineageSource.indexOf('detailsPanel.innerHTML', showLineageIdx);
        expect(expandCallIdx).toBeGreaterThan(showLineageIdx);
        expect(expandCallIdx).toBeLessThan(innerHtmlIdx);
    });

    it('calls ensureDetailsPanelExpanded before showing node details content', () => {
        const updateDetailIdx = infoPanelSource.indexOf('export function updateDetailsPanelContent(');
        const expandCallIdx = infoPanelSource.indexOf('ensureDetailsPanelExpanded()', updateDetailIdx);
        const transformIdx = infoPanelSource.indexOf("detailsPanel.style.transform = 'translate(0", expandCallIdx);
        expect(expandCallIdx).toBeGreaterThan(updateDetailIdx);
        expect(expandCallIdx).toBeLessThan(transformIdx);
    });
});
