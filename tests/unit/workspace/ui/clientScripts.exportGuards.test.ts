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
});
