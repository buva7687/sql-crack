import { readFileSync } from 'fs';
import { join } from 'path';

describe('details panel expand guard on content display', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    it('defines ensureDetailsPanelExpanded that checks aria-expanded and clicks toggle', () => {
        expect(source).toContain('function ensureDetailsPanelExpanded()');
        expect(source).toContain("getAttribute('aria-expanded') === 'false'");
        expect(source).toContain('.sql-crack-resize-toggle[data-panel-key="details"]');
    });

    it('calls ensureDetailsPanelExpanded before showing lineage path content', () => {
        const showLineageIdx = source.indexOf('function showLineagePath(');
        const expandCallIdx = source.indexOf('ensureDetailsPanelExpanded()', showLineageIdx);
        const innerHtmlIdx = source.indexOf('detailsPanel.innerHTML', showLineageIdx);
        expect(expandCallIdx).toBeGreaterThan(showLineageIdx);
        expect(expandCallIdx).toBeLessThan(innerHtmlIdx);
    });

    it('calls ensureDetailsPanelExpanded before showing node details content', () => {
        const updateDetailIdx = source.indexOf('function updateDetailsPanel(');
        const expandCallIdx = source.indexOf('ensureDetailsPanelExpanded()', updateDetailIdx);
        const transformIdx = source.indexOf("detailsPanel.style.transform = 'translate(0", expandCallIdx);
        expect(expandCallIdx).toBeGreaterThan(updateDetailIdx);
        expect(expandCallIdx).toBeLessThan(transformIdx);
    });
});
