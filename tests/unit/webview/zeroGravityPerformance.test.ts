import { readFileSync } from 'fs';
import { join } from 'path';

describe('zero-gravity rendering performance guards', () => {
    const rendererSource = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');

    it('uses cached rendered node elements and rects while applying animated positions', () => {
        const body = rendererSource.match(/function applyNodePositionsToDom\(\): void {[\s\S]*?function applyEdgePositionsToDom/)?.[0] || '';

        expect(rendererSource).toContain('const renderedNodeRectsById: Map<string, SVGRectElement> = new Map();');
        expect(body).toContain('const nodeGroup = renderedNodeElementsById.get(node.id);');
        expect(body).toContain('const rect = renderedNodeRectsById.get(node.id);');
        expect(body).not.toContain('mainGroup!.querySelector(`.node[data-id="${node.id}"]`)');
    });

    it('uses node maps instead of linear node searches while applying animated edge paths', () => {
        const body = rendererSource.match(/function applyEdgePositionsToDom\(\): void {[\s\S]*?function getZeroGravityBounds/)?.[0] || '';

        expect(body).toContain('const currentNodeMap = new Map(currentNodes.map(node => [node.id, node]));');
        expect(body).toContain('const sourceNode = renderNodeMap.get(sourceId) || currentNodeMap.get(sourceId);');
        expect(body).toContain('const targetNode = renderNodeMap.get(targetId) || currentNodeMap.get(targetId);');
        expect(body).not.toContain('currentNodes.find(node => node.id === sourceId)');
        expect(body).not.toContain('currentNodes.find(node => node.id === targetId)');
    });

    it('resets cluster expansion state for new query renders', () => {
        const body = rendererSource.match(/if \(shouldResetCloudState\) {[\s\S]*?}\n\n {4}\/\/ Reset highlight state/)?.[0] || '';

        expect(body).toContain('currentClusters = [];');
        expect(body).toContain('clusterNodeMap = new Map();');
    });
});
