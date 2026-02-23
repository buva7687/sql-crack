import {
    fitViewFeature,
    zoomToNodeFeature,
} from '../../../../src/webview/navigation/nodeNavigation';
import { FlowEdge, FlowNode, ViewState } from '../../../../src/webview/types';

function createNode(id: string, x: number, y: number): FlowNode {
    return {
        id,
        type: 'table',
        label: id.toUpperCase(),
        x,
        y,
        width: 120,
        height: 50,
    };
}

function createState(): ViewState {
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
    };
}

describe('nodeNavigation fit/zoom guards', () => {
    it('fitViewFeature falls back safely when bounds become non-finite', () => {
        const badNode = createNode('bad', Number.NaN, 10);
        const state = createState();
        const onUpdateTransform = jest.fn();
        const onUpdateZoomIndicator = jest.fn();
        const onSetFitViewScale = jest.fn();

        fitViewFeature({
            svg: {
                getBoundingClientRect: () => ({ width: 1000, height: 700 }),
            } as unknown as SVGSVGElement,
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

    it('zoomToNodeFeature falls back to fit view when visible-node bounds are invalid', () => {
        const node = createNode('orphan', 100, 80);
        const state = createState();
        const onFitView = jest.fn();

        zoomToNodeFeature({
            node,
            svg: {
                getBoundingClientRect: () => ({ width: 1000, height: 700 }),
            } as unknown as SVGSVGElement,
            mainGroup: {
                querySelectorAll: () => [] as unknown as NodeListOf<Element>,
            } as unknown as SVGGElement,
            currentNodes: [],
            currentEdges: [] as FlowEdge[],
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
});
