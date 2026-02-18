import { getWebviewScript } from '../../../../src/workspace/ui/clientScripts';

describe('workspace lineage minimap script', () => {
    it('initializes minimap when lineage graph HTML is rendered', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('setupLineageGraphInteractions();');
        expect(script).toContain('setupDirectionButtons();');
        expect(script).toContain('setupMinimap();');
        expect(script).toContain('if (!minimap || !minimapSvg || !minimapViewport || !minimapContent || !container)');
    });

    it('keeps minimap viewport in sync with lineage transforms', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('let refreshLineageMinimapViewport = null;');
        expect(script).toContain("if (typeof refreshLineageMinimapViewport === 'function')");
        expect(script).toContain('refreshLineageMinimapViewport = updateMinimapViewport;');
        expect(script).toContain('document.addEventListener(\'mousemove\', onMinimapMouseMove);');
        expect(script).toContain('if (!Number.isFinite(lineageScale) || lineageScale <= 0) return;');
        expect(script).toContain('if (graphWidth <= 0 || graphHeight <= 0) return;');
        expect(script).toContain('if (minimapRect.width <= 0 || minimapRect.height <= 0) {');
    });
});
