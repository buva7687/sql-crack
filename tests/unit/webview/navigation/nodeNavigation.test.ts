import {
    fitViewFeature,
    zoomToNodeFeature,
    navigateToConnectedNodeFeature,
    navigateToAdjacentNodeFeature,
    navigateToSiblingNodeFeature,
    isNodeInViewportFeature,
    ensureNodeVisibleFeature,
    centerOnNodeFeature,
    getConnectedNodesFeature,
} from '../../../../src/webview/navigation/nodeNavigation';
import { FlowEdge, FlowNode, ViewState } from '../../../../src/webview/types';

function createNode(id: string, x: number, y: number, overrides: Partial<FlowNode> = {}): FlowNode {
    return {
        id,
        type: 'table',
        label: id.toUpperCase(),
        x,
        y,
        width: 120,
        height: 50,
        ...overrides,
    };
}

function createState(overrides: Partial<ViewState> = {}): ViewState {
    return {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        selectedNodeId: null,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        isDraggingNode: false,
        isDraggingCloud: false,
        draggingNodeId: null,
        draggingCloudNodeId: null,
        dragNodeStartX: 0,
        dragNodeStartY: 0,
        dragCloudStartOffsetX: 0,
        dragCloudStartOffsetY: 0,
        dragMouseStartX: 0,
        dragMouseStartY: 0,
        searchTerm: '',
        searchResults: [],
        currentSearchIndex: -1,
        focusModeEnabled: false,
        legendVisible: true,
        highlightedColumnSources: [],
        isFullscreen: false,
        isDarkTheme: false,
        isHighContrast: false,
        breadcrumbPath: [],
        showColumnLineage: false,
        showColumnFlows: false,
        selectedColumn: null,
        zoomedNodeId: null,
        previousZoomState: null,
        focusMode: 'all',
        ...overrides,
    };
}

function createMockSvg(width: number, height: number): SVGSVGElement {
    return {
        getBoundingClientRect: () => ({ width, height }),
    } as unknown as SVGSVGElement;
}

function createMockMainGroup(elements: Element[] = []): SVGGElement {
    return {
        querySelectorAll: (selector: string) => elements as unknown as NodeListOf<Element>,
    } as unknown as SVGGElement;
}

describe('nodeNavigation', () => {
    describe('navigateToConnectedNodeFeature', () => {
        it('returns false when no source node id', () => {
            const state = createState();
            const onMoveToNode = jest.fn();
            const result = navigateToConnectedNodeFeature({
                direction: 'upstream',
                nodes: [],
                edges: [],
                state,
                onMoveToNode,
            });
            expect(result).toBe(false);
            expect(onMoveToNode).not.toHaveBeenCalled();
        });

        it('returns false when node not found', () => {
            const state = createState({ selectedNodeId: 'missing' });
            const onMoveToNode = jest.fn();
            const result = navigateToConnectedNodeFeature({
                direction: 'upstream',
                nodes: [],
                edges: [],
                state,
                onMoveToNode,
            });
            expect(result).toBe(false);
        });

        it('returns false when no connected nodes', () => {
            const node = createNode('a', 0, 0);
            const state = createState({ selectedNodeId: 'a' });
            const onMoveToNode = jest.fn();
            const result = navigateToConnectedNodeFeature({
                direction: 'upstream',
                nodes: [node],
                edges: [],
                state,
                onMoveToNode,
            });
            expect(result).toBe(false);
        });

        it('navigates upstream to connected node', () => {
            const nodeA = createNode('a', 0, 0);
            const nodeB = createNode('b', 200, 0);
            const edge: FlowEdge = { id: "edge", source: 'b', target: 'a' };
            const state = createState({ selectedNodeId: 'a' });
            const onMoveToNode = jest.fn();

            const result = navigateToConnectedNodeFeature({
                direction: 'upstream',
                nodes: [nodeA, nodeB],
                edges: [edge],
                state,
                onMoveToNode,
            });

            expect(result).toBe(true);
            expect(onMoveToNode).toHaveBeenCalledWith(nodeB);
        });

        it('navigates downstream to connected node', () => {
            const nodeA = createNode('a', 0, 0);
            const nodeB = createNode('b', 200, 0);
            const edge: FlowEdge = { id: "edge", source: 'a', target: 'b' };
            const state = createState({ selectedNodeId: 'a' });
            const onMoveToNode = jest.fn();

            const result = navigateToConnectedNodeFeature({
                direction: 'downstream',
                nodes: [nodeA, nodeB],
                edges: [edge],
                state,
                onMoveToNode,
            });

            expect(result).toBe(true);
            expect(onMoveToNode).toHaveBeenCalledWith(nodeB);
        });

        it('cycles through multiple connected nodes', () => {
            const nodeA = createNode('a', 0, 0);
            const nodeB = createNode('b', 200, 0);
            const nodeC = createNode('c', 400, 0);
            const edge1: FlowEdge = { id: 'e1', source: 'b', target: 'a' };
            const edge2: FlowEdge = { id: 'e2', source: 'c', target: 'a' };
            const state = createState({ selectedNodeId: 'a' });
            const onMoveToNode = jest.fn();

            navigateToConnectedNodeFeature({
                direction: 'upstream',
                nodes: [nodeA, nodeB, nodeC],
                edges: [edge1, edge2],
                state,
                onMoveToNode,
            });
            expect(onMoveToNode).toHaveBeenLastCalledWith(nodeB);

            navigateToConnectedNodeFeature({
                direction: 'upstream',
                nodes: [nodeA, nodeB, nodeC],
                edges: [edge1, edge2],
                state,
                onMoveToNode,
            });
            expect(onMoveToNode).toHaveBeenLastCalledWith(nodeC);

            navigateToConnectedNodeFeature({
                direction: 'upstream',
                nodes: [nodeA, nodeB, nodeC],
                edges: [edge1, edge2],
                state,
                onMoveToNode,
            });
            expect(onMoveToNode).toHaveBeenLastCalledWith(nodeB);
        });

        it('uses fromNodeId override', () => {
            const nodeA = createNode('a', 0, 0);
            const nodeB = createNode('b', 200, 0);
            const edge: FlowEdge = { id: "edge", source: 'b', target: 'a' };
            const state = createState();
            const onMoveToNode = jest.fn();

            const result = navigateToConnectedNodeFeature({
                direction: 'upstream',
                fromNodeId: 'a',
                nodes: [nodeA, nodeB],
                edges: [edge],
                state,
                onMoveToNode,
            });

            expect(result).toBe(true);
            expect(onMoveToNode).toHaveBeenCalledWith(nodeB);
        });

        it('filters by focus mode when enabled', () => {
            const nodeA = createNode('a', 0, 0);
            const nodeB = createNode('b', 200, 0);
            const nodeC = createNode('c', 400, 0);
            const edges: FlowEdge[] = [
                { id: 'e3', source: 'b', target: 'a' },
                { id: 'e4', source: 'c', target: 'a' },
            ];
            const state = createState({ selectedNodeId: 'a', focusModeEnabled: true, focusMode: 'upstream' });
            const onMoveToNode = jest.fn();

            const result = navigateToConnectedNodeFeature({
                direction: 'upstream',
                nodes: [nodeA, nodeB, nodeC],
                edges,
                state,
                onMoveToNode,
            });

            expect(result).toBe(true);
        });
    });

    describe('navigateToAdjacentNodeFeature', () => {
        it('calls onMoveToNode with next node', () => {
            const nodeA = createNode('a', 0, 0);
            const nodeB = createNode('b', 200, 0);
            const state = createState();
            const onMoveToNode = jest.fn();

            navigateToAdjacentNodeFeature({
                currentNode: nodeA,
                direction: 'next',
                nodes: [nodeA, nodeB],
                edges: [],
                state,
                onMoveToNode,
            });

            expect(onMoveToNode).toHaveBeenCalled();
        });

        it('calls onMoveToNode with prev node', () => {
            const nodeA = createNode('a', 0, 0);
            const nodeB = createNode('b', 200, 0);
            const state = createState();
            const onMoveToNode = jest.fn();

            navigateToAdjacentNodeFeature({
                currentNode: nodeB,
                direction: 'prev',
                nodes: [nodeA, nodeB],
                edges: [],
                state,
                onMoveToNode,
            });

            expect(onMoveToNode).toHaveBeenCalled();
        });
    });

    describe('navigateToSiblingNodeFeature', () => {
        it('returns false when no sibling available', () => {
            const node = createNode('a', 0, 0);
            const state = createState();
            const onMoveToNode = jest.fn();

            const result = navigateToSiblingNodeFeature({
                currentNode: node,
                direction: 'next',
                layoutType: 'vertical',
                nodes: [node],
                edges: [],
                state,
                onMoveToNode,
            });

            expect(result).toBe(false);
        });
    });

    describe('isNodeInViewportFeature', () => {
        it('returns true when svg is null', () => {
            const node = createNode('a', 0, 0);
            const state = createState();

            const result = isNodeInViewportFeature({
                node,
                svg: null,
                state,
            });

            expect(result).toBe(true);
        });

        it('returns true for node fully in viewport', () => {
            const node = createNode('a', 100, 100);
            const state = createState({ scale: 1, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);

            const result = isNodeInViewportFeature({
                node,
                svg,
                state,
            });

            expect(result).toBe(true);
        });

        it('returns false for node outside viewport right', () => {
            const node = createNode('a', 1000, 100);
            const state = createState({ scale: 1, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);

            const result = isNodeInViewportFeature({
                node,
                svg,
                state,
            });

            expect(result).toBe(false);
        });

        it('returns false for node outside viewport bottom', () => {
            const node = createNode('a', 100, 800);
            const state = createState({ scale: 1, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);

            const result = isNodeInViewportFeature({
                node,
                svg,
                state,
            });

            expect(result).toBe(false);
        });

        it('respects custom margin', () => {
            const node = createNode('a', 900, 100);
            const state = createState({ scale: 1, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);

            const resultWithMargin = isNodeInViewportFeature({
                node,
                svg,
                state,
                margin: 10,
            });

            expect(resultWithMargin).toBe(false);
        });

        it('accounts for scale', () => {
            const node = createNode('a', 100, 100);
            const state = createState({ scale: 2, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);

            const result = isNodeInViewportFeature({
                node,
                svg,
                state,
            });

            expect(result).toBe(true);
        });

        it('accounts for offset', () => {
            const node = createNode('a', 500, 100);
            const state = createState({ scale: 1, offsetX: -200, offsetY: 0 });
            const svg = createMockSvg(800, 600);

            const result = isNodeInViewportFeature({
                node,
                svg,
                state,
            });

            expect(result).toBe(true);
        });
    });

    describe('ensureNodeVisibleFeature', () => {
        it('does nothing when svg is null', () => {
            const node = createNode('a', 0, 0);
            const state = createState();
            const onUpdateTransform = jest.fn();

            ensureNodeVisibleFeature({
                node,
                svg: null,
                state,
                onUpdateTransform,
            });

            expect(onUpdateTransform).not.toHaveBeenCalled();
        });

        it('does nothing when node is already visible', () => {
            const node = createNode('a', 100, 100);
            const state = createState({ scale: 1, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);
            const onUpdateTransform = jest.fn();

            ensureNodeVisibleFeature({
                node,
                svg,
                state,
                onUpdateTransform,
            });

            expect(onUpdateTransform).not.toHaveBeenCalled();
        });

        it('pans viewport when node is outside right', () => {
            const node = createNode('a', 900, 100);
            const state = createState({ scale: 1, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);
            const onUpdateTransform = jest.fn();

            ensureNodeVisibleFeature({
                node,
                svg,
                state,
                onUpdateTransform,
            });

            expect(state.offsetX).toBeLessThan(0);
            expect(onUpdateTransform).toHaveBeenCalled();
        });

        it('pans viewport when node is outside bottom', () => {
            const node = createNode('a', 100, 700);
            const state = createState({ scale: 1, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);
            const onUpdateTransform = jest.fn();

            ensureNodeVisibleFeature({
                node,
                svg,
                state,
                onUpdateTransform,
            });

            expect(state.offsetY).toBeLessThan(0);
            expect(onUpdateTransform).toHaveBeenCalled();
        });

        it('pans viewport when node is outside left', () => {
            const node = createNode('a', -100, 100);
            const state = createState({ scale: 1, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);
            const onUpdateTransform = jest.fn();

            ensureNodeVisibleFeature({
                node,
                svg,
                state,
                onUpdateTransform,
            });

            expect(state.offsetX).toBeGreaterThan(0);
            expect(onUpdateTransform).toHaveBeenCalled();
        });

        it('pans viewport when node is outside top', () => {
            const node = createNode('a', 100, -100);
            const state = createState({ scale: 1, offsetX: 0, offsetY: 0 });
            const svg = createMockSvg(800, 600);
            const onUpdateTransform = jest.fn();

            ensureNodeVisibleFeature({
                node,
                svg,
                state,
                onUpdateTransform,
            });

            expect(state.offsetY).toBeGreaterThan(0);
            expect(onUpdateTransform).toHaveBeenCalled();
        });
    });

    describe('centerOnNodeFeature', () => {
        it('does nothing when svg is null', () => {
            const node = createNode('a', 100, 100);
            const state = createState();
            const onUpdateTransform = jest.fn();

            centerOnNodeFeature({
                node,
                svg: null,
                state,
                onUpdateTransform,
            });

            expect(onUpdateTransform).not.toHaveBeenCalled();
        });

        it('centers on node position', () => {
            const node = createNode('a', 200, 150);
            const state = createState({ scale: 1 });
            const svg = createMockSvg(800, 600);
            const onUpdateTransform = jest.fn();

            centerOnNodeFeature({
                node,
                svg,
                state,
                onUpdateTransform,
            });

            const expectedOffsetX = 400 - (200 + 60);
            const expectedOffsetY = 300 - (150 + 25);
            expect(state.offsetX).toBeCloseTo(expectedOffsetX, 0);
            expect(state.offsetY).toBeCloseTo(expectedOffsetY, 0);
            expect(onUpdateTransform).toHaveBeenCalled();
        });

        it('accounts for scale', () => {
            const node = createNode('a', 200, 150);
            const state = createState({ scale: 2 });
            const svg = createMockSvg(800, 600);
            const onUpdateTransform = jest.fn();

            centerOnNodeFeature({
                node,
                svg,
                state,
                onUpdateTransform,
            });

            expect(state.offsetX).toBeDefined();
            expect(state.offsetY).toBeDefined();
            expect(onUpdateTransform).toHaveBeenCalled();
        });
    });

    describe('fitViewFeature', () => {
        it('does nothing when svg is null', () => {
            const state = createState();
            const onUpdateTransform = jest.fn();

            fitViewFeature({
                svg: null,
                renderNodes: [],
                currentNodes: [createNode('a', 0, 0)],
                cloudOffsets: new Map(),
                state,
                onUpdateTransform,
                onUpdateZoomIndicator: jest.fn(),
                onSetFitViewScale: jest.fn(),
                layoutSubflowNodesVertical: () => ({ width: 200, height: 120 }),
            });

            expect(onUpdateTransform).not.toHaveBeenCalled();
        });

        it('does nothing when no nodes', () => {
            const state = createState();
            const onUpdateTransform = jest.fn();

            fitViewFeature({
                svg: createMockSvg(800, 600),
                renderNodes: [],
                currentNodes: [],
                cloudOffsets: new Map(),
                state,
                onUpdateTransform,
                onUpdateZoomIndicator: jest.fn(),
                onSetFitViewScale: jest.fn(),
                layoutSubflowNodesVertical: () => ({ width: 200, height: 120 }),
            });

            expect(onUpdateTransform).not.toHaveBeenCalled();
        });

        it('falls back safely when bounds become non-finite', () => {
            const badNode = createNode('bad', Number.NaN, 10);
            const state = createState();
            const onUpdateTransform = jest.fn();
            const onUpdateZoomIndicator = jest.fn();
            const onSetFitViewScale = jest.fn();

            fitViewFeature({
                svg: createMockSvg(1000, 700),
                renderNodes: [],
                currentNodes: [badNode],
                cloudOffsets: new Map(),
                state,
                onUpdateTransform,
                onUpdateZoomIndicator,
                onSetFitViewScale,
                layoutSubflowNodesVertical: () => ({ width: 200, height: 120 }),
            });

            expect(state.scale).toBe(1);
            expect(state.offsetX).toBe(50);
            expect(state.offsetY).toBe(50);
            expect(onSetFitViewScale).toHaveBeenCalledWith(1);
            expect(onUpdateTransform).toHaveBeenCalled();
            expect(onUpdateZoomIndicator).toHaveBeenCalled();
        });

        it('fits single node in viewport', () => {
            const node = createNode('a', 0, 0);
            const state = createState();
            const onUpdateTransform = jest.fn();
            const onSetFitViewScale = jest.fn();

            fitViewFeature({
                svg: createMockSvg(800, 600),
                renderNodes: [],
                currentNodes: [node],
                cloudOffsets: new Map(),
                state,
                onUpdateTransform,
                onUpdateZoomIndicator: jest.fn(),
                onSetFitViewScale,
                layoutSubflowNodesVertical: () => ({ width: 200, height: 120 }),
            });

            expect(state.scale).toBeGreaterThan(0);
            expect(onSetFitViewScale).toHaveBeenCalled();
            expect(onUpdateTransform).toHaveBeenCalled();
        });

        it('fits multiple nodes in viewport', () => {
            const nodes = [
                createNode('a', 0, 0),
                createNode('b', 300, 0),
                createNode('c', 600, 0),
            ];
            const state = createState();
            const onUpdateTransform = jest.fn();

            fitViewFeature({
                svg: createMockSvg(800, 600),
                renderNodes: [],
                currentNodes: nodes,
                cloudOffsets: new Map(),
                state,
                onUpdateTransform,
                onUpdateZoomIndicator: jest.fn(),
                onSetFitViewScale: jest.fn(),
                layoutSubflowNodesVertical: () => ({ width: 200, height: 120 }),
            });

            expect(state.scale).toBeGreaterThan(0);
            expect(state.zoomedNodeId).toBeNull();
            expect(state.previousZoomState).toBeNull();
        });

        it('uses renderNodes over currentNodes', () => {
            const renderNode = createNode('render', 0, 0);
            const currentNode = createNode('current', 500, 500);
            const state = createState();
            const onSetFitViewScale = jest.fn();

            fitViewFeature({
                svg: createMockSvg(800, 600),
                renderNodes: [renderNode],
                currentNodes: [currentNode],
                cloudOffsets: new Map(),
                state,
                onUpdateTransform: jest.fn(),
                onUpdateZoomIndicator: jest.fn(),
                onSetFitViewScale,
                layoutSubflowNodesVertical: () => ({ width: 200, height: 120 }),
            });

            expect(state.scale).toBeGreaterThan(0);
        });

        it('handles expanded CTE nodes with children', () => {
            const cteNode = createNode('cte', 100, 100, {
                type: 'cte',
                expanded: true,
                children: [createNode('child', 0, 0)],
                childEdges: [],
            });
            const state = createState();
            const cloudOffsets = new Map([['cte', { offsetX: -200, offsetY: 0 }]]);

            fitViewFeature({
                svg: createMockSvg(800, 600),
                renderNodes: [],
                currentNodes: [cteNode],
                cloudOffsets,
                state,
                onUpdateTransform: jest.fn(),
                onUpdateZoomIndicator: jest.fn(),
                onSetFitViewScale: jest.fn(),
                layoutSubflowNodesVertical: () => ({ width: 200, height: 120 }),
            });

            expect(state.scale).toBeGreaterThan(0);
        });

        it('clears zoom state on fit', () => {
            const node = createNode('a', 0, 0);
            const state = createState({ zoomedNodeId: 'old', previousZoomState: { scale: 1, offsetX: 0, offsetY: 0 } });

            fitViewFeature({
                svg: createMockSvg(800, 600),
                renderNodes: [],
                currentNodes: [node],
                cloudOffsets: new Map(),
                state,
                onUpdateTransform: jest.fn(),
                onUpdateZoomIndicator: jest.fn(),
                onSetFitViewScale: jest.fn(),
                layoutSubflowNodesVertical: () => ({ width: 200, height: 120 }),
            });

            expect(state.zoomedNodeId).toBeNull();
            expect(state.previousZoomState).toBeNull();
        });
    });

    describe('zoomToNodeFeature', () => {
        it('does nothing when svg is null', () => {
            const node = createNode('a', 0, 0);
            const state = createState();
            const onFitView = jest.fn();

            zoomToNodeFeature({
                node,
                svg: null,
                mainGroup: createMockMainGroup(),
                currentNodes: [node],
                currentEdges: [],
                cloudOffsets: new Map(),
                state,
                fitViewScale: 1,
                onClearFocusMode: jest.fn(),
                onFitView,
                onSelectNode: jest.fn(),
                onUpdateTransform: jest.fn(),
                onUpdateZoomIndicator: jest.fn(),
            });

            expect(onFitView).not.toHaveBeenCalled();
        });

        it('does nothing when mainGroup is null', () => {
            const node = createNode('a', 0, 0);
            const state = createState();
            const onFitView = jest.fn();

            zoomToNodeFeature({
                node,
                svg: createMockSvg(800, 600),
                mainGroup: null,
                currentNodes: [node],
                currentEdges: [],
                cloudOffsets: new Map(),
                state,
                fitViewScale: 1,
                onClearFocusMode: jest.fn(),
                onFitView,
                onSelectNode: jest.fn(),
                onUpdateTransform: jest.fn(),
                onUpdateZoomIndicator: jest.fn(),
            });

            expect(onFitView).not.toHaveBeenCalled();
        });

        it('exits zoom mode when already zoomed', () => {
            const node = createNode('a', 0, 0);
            const state = createState({ zoomedNodeId: 'old-zoom' });
            const mockElements: any[] = [];
            const mainGroup = {
                querySelectorAll: () => mockElements as unknown as NodeListOf<Element>,
            } as unknown as SVGGElement;
            const onClearFocusMode = jest.fn();
            const onFitView = jest.fn();

            zoomToNodeFeature({
                node,
                svg: createMockSvg(800, 600),
                mainGroup,
                currentNodes: [node],
                currentEdges: [],
                cloudOffsets: new Map(),
                state,
                fitViewScale: 1,
                onClearFocusMode,
                onFitView,
                onSelectNode: jest.fn(),
                onUpdateTransform: jest.fn(),
                onUpdateZoomIndicator: jest.fn(),
            });

            expect(onClearFocusMode).toHaveBeenCalled();
            expect(onFitView).toHaveBeenCalled();
            expect(state.focusModeEnabled).toBe(false);
        });

        it('falls back to fit view when visible-node bounds are invalid', () => {
            const node = createNode('orphan', 100, 80);
            const state = createState();
            const onFitView = jest.fn();

            zoomToNodeFeature({
                node,
                svg: createMockSvg(1000, 700),
                mainGroup: createMockMainGroup(),
                currentNodes: [],
                currentEdges: [],
                cloudOffsets: new Map(),
                state,
                fitViewScale: 1,
                onClearFocusMode: jest.fn(),
                onFitView,
                onSelectNode: jest.fn(),
                onUpdateTransform: jest.fn(),
                onUpdateZoomIndicator: jest.fn(),
            });

            expect(onFitView).toHaveBeenCalled();
            expect(Number.isFinite(state.scale)).toBe(true);
        });

        it('stores previous zoom state on first zoom', () => {
            const node = createNode('a', 100, 100);
            const state = createState({ scale: 0.8, offsetX: 50, offsetY: 50 });
            const onSelectNode = jest.fn();
            const onUpdateTransform = jest.fn();

            zoomToNodeFeature({
                node,
                svg: createMockSvg(800, 600),
                mainGroup: createMockMainGroup(),
                currentNodes: [node],
                currentEdges: [],
                cloudOffsets: new Map(),
                state,
                fitViewScale: 1,
                onClearFocusMode: jest.fn(),
                onFitView: jest.fn(),
                onSelectNode,
                onUpdateTransform,
                onUpdateZoomIndicator: jest.fn(),
            });

            expect(state.previousZoomState).toEqual({ scale: 0.8, offsetX: 50, offsetY: 50 });
            expect(onSelectNode).toHaveBeenCalledWith('a');
            expect(onUpdateTransform).toHaveBeenCalled();
        });

        it('sets zoomedNodeId to target node', () => {
            const node = createNode('a', 100, 100);
            const state = createState();

            zoomToNodeFeature({
                node,
                svg: createMockSvg(800, 600),
                mainGroup: createMockMainGroup(),
                currentNodes: [node],
                currentEdges: [],
                cloudOffsets: new Map(),
                state,
                fitViewScale: 1,
                onClearFocusMode: jest.fn(),
                onFitView: jest.fn(),
                onSelectNode: jest.fn(),
                onUpdateTransform: jest.fn(),
                onUpdateZoomIndicator: jest.fn(),
            });

            expect(state.zoomedNodeId).toBe('a');
        });

        it('includes immediate neighbors in visible set', () => {
            const nodeA = createNode('a', 100, 100);
            const nodeB = createNode('b', 300, 100);
            const nodeC = createNode('c', 500, 100);
            const edges: FlowEdge[] = [
                { id: 'e5', source: 'a', target: 'b' },
            ];
            const state = createState();

            zoomToNodeFeature({
                node: nodeA,
                svg: createMockSvg(800, 600),
                mainGroup: createMockMainGroup(),
                currentNodes: [nodeA, nodeB, nodeC],
                currentEdges: edges,
                cloudOffsets: new Map(),
                state,
                fitViewScale: 1,
                onClearFocusMode: jest.fn(),
                onFitView: jest.fn(),
                onSelectNode: jest.fn(),
                onUpdateTransform: jest.fn(),
                onUpdateZoomIndicator: jest.fn(),
            });

            expect(state.zoomedNodeId).toBe('a');
        });
    });

    describe('getConnectedNodesFeature', () => {
        it('returns set of connected node ids', () => {
            const edges: FlowEdge[] = [
                { id: 'e6', source: 'a', target: 'b' },
                { id: 'e7', source: 'b', target: 'c' },
            ];

            const result = getConnectedNodesFeature('a', edges, 'downstream');

            expect(result).toBeInstanceOf(Set);
            expect(result.has('b')).toBe(true);
        });

        it('returns empty set for node with no connections', () => {
            const result = getConnectedNodesFeature('isolated', [], 'all');

            expect(result.size).toBe(0);
        });
    });
});
