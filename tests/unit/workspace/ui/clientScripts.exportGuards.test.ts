import { getWebviewScript } from '../../../../src/workspace/ui/clientScripts';

describe('workspace export script guards', () => {
    it('checks canvas 2D context availability before drawing PNG', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain("if (!ctx) {");
        expect(script).toContain("error: 'Canvas 2D context unavailable'");
    });

    it('caps PNG raster scale and canvas dimensions for large workspace graphs', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('const MAX_RASTER_DIMENSION = 16384;');
        expect(script).toContain('function getRasterScale(width, height, preferredScale = 2)');
        expect(script).toContain('const scale = getRasterScale(width, height, 2);');
        expect(script).toContain('canvas.width = Math.max(1, Math.min(MAX_RASTER_DIMENSION, Math.floor(width * scale)));');
        expect(script).toContain('canvas.height = Math.max(1, Math.min(MAX_RASTER_DIMENSION, Math.floor(height * scale)));');
    });
});
