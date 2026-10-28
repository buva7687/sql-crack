import { readFileSync } from 'fs';
import { join } from 'path';
import { createFakeElement, installFakeDocument, uninstallFakeDocument, FakeElement } from '../../helpers/fakeDom';
import { updateVisibleNodesFeature, setVirtualizationEnabledFeature } from '../../../src/webview/rendering/virtualizedViewport';
import { highlightMatchesFeature, refreshSearchHighlightsFeature, navigateSearchFeature } from '../../../src/webview/features/search';
import { applyFocusModeFeature, applyNodeZoomVisibilityFeature, clearFocusModeFeature } from '../../../src/webview/features/focusMode';
import type { FlowNode, FlowEdge, ViewState } from '../../../src/webview/types';

const svgElement = (element: FakeElement) => element as unknown as SVGGElement;
function harness() {
    const svg = createFakeElement('svg');
    svg.getBoundingClientRect.mockReturnValue({ width: 800, height: 600 });
    const main = createFakeElement('g'), nodesGroup = createFakeElement('g'), edgesGroup = createFakeElement('g');
    nodesGroup.setAttribute('class', 'nodes'); edgesGroup.setAttribute('class', 'edges');
    main.appendChild(nodesGroup); main.appendChild(edgesGroup);
    const nodes: FlowNode[] = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, label: `table_${i}`, type: 'table', x: i * 300, y: 0, width: 180, height: 60 }));
    const edges: FlowEdge[] = [{ id: 'near', source: 'n0', target: 'n1' }, { id: 'far', source: 'n58', target: 'n59' }];
    const state = { searchTerm: '', searchResults: [], currentSearchIndex: -1, focusModeEnabled: false, selectedNodeId: 'n0', isDarkTheme: true } as unknown as ViewState;
    const renderNode = (node: FlowNode, parent: SVGGElement) => {
        const el = createFakeElement('g');
        el.setAttribute('class', 'node'); el.setAttribute('data-id', node.id); el.setAttribute('data-label', node.label.toLowerCase());
        const classes = new Set<string>();
        (el as any).classList = { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name), contains: (name: string) => classes.has(name) };
        const rect = createFakeElement('rect'); rect.setAttribute('class', 'node-rect'); el.appendChild(rect);
        parent.appendChild(svgElement(el));
    };
    const renderEdge = (edge: FlowEdge, parent: SVGGElement) => {
        const el = createFakeElement('path');
        el.setAttribute('class', 'edge'); el.setAttribute('data-edge-id', edge.id); el.setAttribute('data-source', edge.source); el.setAttribute('data-target', edge.target);
        parent.appendChild(el as unknown as SVGPathElement);
    };
    const searchOptions = { state, mainGroup: svgElement(main), selectedNodeId: state.selectedNodeId, highlightColor: '#ff0' };
    const onElementsChanged = () => {
        if (state.zoomedNodeId) { applyNodeZoomVisibilityFeature(state.zoomedNodeId, svgElement(main), edges); }
        if (state.focusModeEnabled) { applyFocusModeFeature({ enabled: true, nodeId: 'n0', mainGroup: svgElement(main), connectedIds: new Set(['n0', 'n1']) }); }
        refreshSearchHighlightsFeature(searchOptions);
    };
    const options = { svg: svg as unknown as SVGSVGElement, mainGroup: svgElement(main), renderNodes: nodes, renderEdges: edges, scale: 1, offsetX: 0, offsetY: 0, renderedNodeIds: new Set<string>(), renderedEdgeIds: new Set<string>(), currentOffscreenIndicator: null, isDarkTheme: true, renderNode, renderEdge, onElementsChanged };
    const pan = (x: number) => updateVisibleNodesFeature({ ...options, offsetX: x });
    const node = (id: string) => nodesGroup.children.find(el => el.getAttribute('data-id') === id);
    const edge = (id: string) => edgesGroup.children.find(el => el.getAttribute('data-edge-id') === id);
    return { pan, node, edge, state, nodes, options, searchOptions, onElementsChanged };
}

describe('virtualized graph presentation', () => {
    beforeEach(() => installFakeDocument());
    afterEach(() => uninstallFakeDocument());

    it('finds offscreen nodes, navigates to them and restores highlights without losing the active match', () => {
        const h = harness(); h.pan(0);
        expect(h.node('n59')).toBeUndefined();
        highlightMatchesFeature({ ...h.searchOptions, nodes: h.nodes, term: 'TABLE_59' });
        expect(h.state.searchResults).toEqual(['n59']);
        navigateSearchFeature(0, h.state, h.nodes, { onUpdateSearchCountDisplay: jest.fn(), onNodeMatchActivated: () => h.pan(-17400) });
        expect(h.node('n59')).toBeDefined();
        expect((h.node('n59') as any).classList.contains('search-match')).toBe(true);
        expect(h.state.currentSearchIndex).toBe(0);
        h.pan(0); h.pan(-17400);
        expect(h.state.searchResults).toEqual(['n59']);
        expect(h.state.currentSearchIndex).toBe(0);
        expect((h.node('n59') as any).classList.contains('search-match')).toBe(true);
    });

    it('dims newly mounted unrelated nodes and edges, and clears normally', () => {
        const h = harness(); h.state.focusModeEnabled = true; h.pan(0);
        expect(h.node('n2')!.style.opacity).toBe('0.25');
        h.pan(-17400);
        expect(h.node('n59')!.style.opacity).toBe('0.25');
        expect(h.edge('far')!.style.opacity).toBe('0.15');
        clearFocusModeFeature({ state: h.state, mainGroup: h.options.mainGroup });
        expect(h.node('n59')!.style.opacity).toBe('1');
        h.pan(0); h.pan(-17400);
        expect(h.node('n59')!.style.opacity || '1').toBe('1');
    });

    it('preserves zoom-to-node visibility when unrelated nodes remount', () => {
        const h = harness(); h.state.zoomedNodeId = 'n0'; h.pan(0); h.pan(-17400);
        expect(h.node('n59')!.style.display).toBe('none');
        expect(h.edge('far')!.style.display).toBe('none');
    });

    it('also restores focus while materializing the entire graph for export', () => {
        const h = harness(); h.pan(0); h.state.focusModeEnabled = true;
        setVirtualizationEnabledFeature({ ...h.options, enabled: false, currentNodes: h.nodes, currentEdges: h.options.renderEdges, onVirtualizedUpdate: jest.fn() });
        expect(h.node('n59')!.style.opacity).toBe('0.25');
        expect(h.edge('far')!.style.opacity).toBe('0.15');
    });

    it('wires both virtualizer paths to the renderer presentation restore', () => {
        const source = readFileSync(join(__dirname, '../../../src/webview/renderer.ts'), 'utf8');
        expect(source.match(/onElementsChanged: restoreViewportPresentation/g)).toHaveLength(2);
        expect(source).toContain('nodes: renderNodes,');
    });
});
