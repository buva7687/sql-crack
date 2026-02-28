import type { FlowNode, ViewState } from '../../../src/webview/types';
import { selectNodeFeature } from '../../../src/webview/interaction/nodeSelection';
import { EDGE_COLORS, UI_COLORS } from '../../../src/webview/constants';

type FakeRect = {
    setAttribute: jest.Mock<void, [string, string]>;
    removeAttribute: jest.Mock<void, [string]>;
};

type FakeNodeGroup = {
    querySelector: jest.Mock<FakeRect | null, [string]>;
    getAttribute: jest.Mock<string | null, [string]>;
};

type FakeEdge = {
    setAttribute: jest.Mock<void, [string, string]>;
};

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
        isDarkTheme: true,
        isHighContrast: false,
        breadcrumbPath: [],
        showColumnLineage: false,
        showColumnFlows: false,
        selectedColumn: null,
        zoomedNodeId: null,
        previousZoomState: null,
        layoutType: 'vertical',
        focusMode: 'all',
        ...overrides,
    };
}

function createRect(): FakeRect {
    return {
        setAttribute: jest.fn(),
        removeAttribute: jest.fn(),
    };
}

function createNodeGroup(id: string, rect: FakeRect): FakeNodeGroup {
    return {
        querySelector: jest.fn((selector: string) => (selector === '.node-rect' ? rect : null)),
        getAttribute: jest.fn((name: string) => (name === 'data-id' ? id : null)),
    };
}

function createEdge(): FakeEdge {
    return {
        setAttribute: jest.fn(),
    };
}

describe('nodeSelection', () => {
    afterEach(() => {
        delete (global as { window?: unknown }).window;
    });

    it('highlights the selected node, clears non-selected styling, and updates panels', () => {
        const selectedRect = createRect();
        const otherRect = createRect();
        const selectedGroup = createNodeGroup('n1', selectedRect);
        const otherGroup = createNodeGroup('n2', otherRect);
        const mainGroup = {
            querySelectorAll: jest.fn((selector: string) => {
                if (selector === '.node') {
                    return [selectedGroup, otherGroup];
                }
                if (selector === '.edge') {
                    return [];
                }
                return [];
            }),
        };
        const highlightConnectedEdges = jest.fn();
        const onUpdateDetailsPanel = jest.fn();
        const onUpdateBreadcrumb = jest.fn();
        const state = createState();

        selectNodeFeature({
            nodeId: 'n1',
            state,
            mainGroup: mainGroup as any,
            currentNodes: [
                { id: 'n1', type: 'table', label: 'users', x: 0, y: 0, width: 100, height: 40, startLine: 3 },
                { id: 'n2', type: 'table', label: 'orders', x: 0, y: 0, width: 100, height: 40 },
            ],
            currentSql: 'select * from users',
            highlightConnectedEdges,
            onUpdateDetailsPanel,
            onUpdateBreadcrumb,
        });

        expect(state.selectedNodeId).toBe('n1');
        expect(selectedRect.setAttribute).toHaveBeenCalledWith('stroke', UI_COLORS.white);
        expect(selectedRect.setAttribute).toHaveBeenCalledWith('stroke-width', '3');
        expect(selectedRect.setAttribute).toHaveBeenCalledWith('filter', 'url(#glow)');
        expect(highlightConnectedEdges).toHaveBeenCalledWith('n1', true);
        expect(otherRect.removeAttribute).toHaveBeenCalledWith('stroke');
        expect(otherRect.removeAttribute).toHaveBeenCalledWith('stroke-width');
        expect(otherRect.setAttribute).toHaveBeenCalledWith('filter', 'url(#shadow)');
        expect(onUpdateDetailsPanel).toHaveBeenCalledWith('n1');
        expect(onUpdateBreadcrumb).toHaveBeenCalledWith('n1');
    });

    it('resets edge styling when selection is cleared', () => {
        const edgeA = createEdge();
        const edgeB = createEdge();
        const mainGroup = {
            querySelectorAll: jest.fn((selector: string) => {
                if (selector === '.node') {
                    return [];
                }
                if (selector === '.edge') {
                    return [edgeA, edgeB];
                }
                return [];
            }),
        };

        selectNodeFeature({
            nodeId: null,
            state: createState({ selectedNodeId: 'old' }),
            mainGroup: mainGroup as any,
            currentNodes: [],
            currentSql: '',
            highlightConnectedEdges: jest.fn(),
            onUpdateDetailsPanel: jest.fn(),
            onUpdateBreadcrumb: jest.fn(),
        });

        expect(edgeA.setAttribute).toHaveBeenCalledWith('stroke', EDGE_COLORS.default);
        expect(edgeA.setAttribute).toHaveBeenCalledWith('stroke-width', '2');
        expect(edgeA.setAttribute).toHaveBeenCalledWith('marker-end', 'url(#arrowhead)');
        expect(edgeB.setAttribute).toHaveBeenCalledWith('stroke', EDGE_COLORS.default);
    });

    it('finds nested nodes for navigation and falls back to SQL line lookup for tables', () => {
        const postMessage = jest.fn();
        (global as { window?: unknown }).window = {
            vscodeApi: { postMessage },
        };

        selectNodeFeature({
            nodeId: 'child_table',
            state: createState(),
            mainGroup: null,
            currentNodes: [
                {
                    id: 'cloud_1',
                    type: 'cte',
                    label: 'cloud',
                    x: 0,
                    y: 0,
                    width: 200,
                    height: 100,
                    children: [
                        {
                            id: 'child_table',
                            type: 'table',
                            label: 'orders',
                            x: 0,
                            y: 0,
                            width: 120,
                            height: 40,
                        },
                    ],
                },
            ],
            currentSql: 'WITH cloud AS (\nSELECT *\nFROM orders\n)\nSELECT * FROM cloud',
            highlightConnectedEdges: jest.fn(),
            onUpdateDetailsPanel: jest.fn(),
            onUpdateBreadcrumb: jest.fn(),
        });

        expect(postMessage).toHaveBeenCalledWith({ command: 'goToLine', line: 3 });
    });
});
