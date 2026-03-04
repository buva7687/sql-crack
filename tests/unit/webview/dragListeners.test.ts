import type { EventListenerCallbacks, EventListenerContext } from '../../../src/webview/interaction/eventListenerTypes';
import { registerDragListeners } from '../../../src/webview/interaction/dragListeners';
import type { FlowNode, ViewState } from '../../../src/webview/types';

type Listener = (event: any) => void;

type FakeElement = {
    tagName: string;
    style: { opacity: string; cursor?: string };
    setAttribute: jest.Mock<void, [string, string]>;
    getAttribute: jest.Mock<string | null, [string]>;
    querySelector: jest.Mock<any, [string]>;
    closest: jest.Mock<any, [string]>;
};

type FakeSvg = FakeElement & {
    addEventListener: jest.Mock<void, [string, Listener]>;
    emit: (type: string, event: any) => void;
    getBoundingClientRect: jest.Mock<{ left: number; top: number }, []>;
    setPointerCapture: jest.Mock<void, [number]>;
    releasePointerCapture: jest.Mock<void, [number]>;
    hasPointerCapture: jest.Mock<boolean, [number]>;
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

function createCallbacks(): EventListenerCallbacks {
    return {
        updateCloudAndArrow: jest.fn(),
        updateNodeEdges: jest.fn(),
        updateTransform: jest.fn(),
        updateZoomIndicator: jest.fn(),
        recordLayoutHistorySnapshot: jest.fn(),
        selectNode: jest.fn(),
        clearFocusMode: jest.fn(),
        fitView: jest.fn(),
        getKeyboardNavigationNodes: jest.fn(() => []),
        moveKeyboardFocusToNode: jest.fn(),
        toggleColumnFlows: jest.fn(),
        hideContextMenu: jest.fn(),
        clearSearch: jest.fn(),
        resetView: jest.fn(),
        undoLayoutChange: jest.fn(),
        redoLayoutChange: jest.fn(),
        toggleCommandBar: jest.fn(),
        isCommandBarVisible: jest.fn(() => false),
        hideCommandBar: jest.fn(),
        navigateSearch: jest.fn(),
        switchLayout: jest.fn(),
        zoomIn: jest.fn(),
        zoomOut: jest.fn(),
        toggleFullscreen: jest.fn(),
        toggleTheme: jest.fn(),
        toggleLayout: jest.fn(),
        toggleSqlPreview: jest.fn(),
        toggleStats: jest.fn(),
        toggleHints: jest.fn(),
        setFocusMode: jest.fn(),
        toggleExpandAll: jest.fn(),
        toggleLegend: jest.fn(),
        triggerMatrixRainOverlay: jest.fn(),
        toggleZeroGravityMode: jest.fn(),
        isZeroGravityModeActive: jest.fn(() => false),
        showKeyboardShortcutsHelp: jest.fn(),
        getKeyboardShortcuts: jest.fn(() => []),
        navigateToConnectedNode: jest.fn(),
        navigateToSiblingNode: jest.fn(),
    };
}

function createElement(tagName: string): FakeElement {
    const attrs = new Map<string, string>();
    return {
        tagName,
        style: { opacity: '1' },
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
        }),
        getAttribute: jest.fn((name: string) => attrs.get(name) || null),
        querySelector: jest.fn((_selector: string) => null),
        closest: jest.fn((_selector: string) => null),
    };
}

function createSvg(): FakeSvg {
    const listeners = new Map<string, Listener>();
    const base = createElement('svg');
    return {
        ...base,
        style: { opacity: '1', cursor: 'grab' },
        addEventListener: jest.fn((type: string, handler: Listener) => {
            listeners.set(type, handler);
        }),
        emit(type: string, event: any) {
            const listener = listeners.get(type);
            if (listener) {
                listener(event);
            }
        },
        getBoundingClientRect: jest.fn(() => ({ left: 10, top: 20 })),
        setPointerCapture: jest.fn(),
        releasePointerCapture: jest.fn(),
        hasPointerCapture: jest.fn((_pointerId: number) => true),
    };
}

function createContext(
    state: ViewState,
    svg: FakeSvg,
    mainGroup: { querySelector: jest.Mock<any, [string]> } | null,
    currentNodes: FlowNode[],
    cloudOffsets: Map<string, { offsetX: number; offsetY: number }>
): EventListenerContext {
    return {
        state,
        getSvg: () => svg as unknown as SVGSVGElement,
        getMainGroup: () => mainGroup as unknown as SVGGElement | null,
        getCurrentNodes: () => currentNodes,
        cloudOffsets,
        getSearchBox: () => null,
        documentListeners: [],
    };
}

describe('dragListeners', () => {
    it('drags the canvas and records history on mouseup', () => {
        const state = createState({ offsetX: 5, offsetY: 10 });
        const svg = createSvg();
        const callbacks = createCallbacks();
        const cloudOffsets = new Map<string, { offsetX: number; offsetY: number }>();

        registerDragListeners(createContext(state, svg, null, [], cloudOffsets), callbacks);

        const target = createElement('svg');
        svg.emit('mousedown', {
            target,
            clientX: 50,
            clientY: 70,
        });
        expect(state.isDragging).toBe(true);
        expect(svg.style.cursor).toBe('grabbing');

        svg.emit('mousemove', {
            clientX: 80,
            clientY: 100,
        });
        expect(state.offsetX).toBe(35);
        expect(state.offsetY).toBe(40);
        expect(callbacks.updateTransform).toHaveBeenCalled();

        svg.emit('mouseup', {});
        expect(state.isDragging).toBe(false);
        expect(svg.style.cursor).toBe('grab');
        expect(callbacks.recordLayoutHistorySnapshot).toHaveBeenCalled();
    });

    it('drags a node, updates its transform, and restores opacity on completion', () => {
        const node: FlowNode = {
            id: 'n1',
            type: 'table',
            label: 'users',
            x: 20,
            y: 30,
            width: 100,
            height: 40,
        };
        const state = createState({
            isDraggingNode: true,
            draggingNodeId: 'n1',
            dragNodeStartX: 20,
            dragNodeStartY: 30,
            dragMouseStartX: 5,
            dragMouseStartY: 10,
        });
        const svg = createSvg();
        const nodeRect = createElement('rect');
        nodeRect.getAttribute.mockImplementation((name: string) => {
            if (name === 'x') { return '20'; }
            if (name === 'y') { return '30'; }
            return null;
        });
        const nodeGroup = createElement('g');
        nodeGroup.style.opacity = '0.5';
        nodeGroup.querySelector.mockImplementation((selector: string) => (
            selector === '.node-rect' ? nodeRect : null
        ));
        const mainGroup = {
            querySelector: jest.fn((selector: string) => (
                selector === '.node[data-id="n1"]' ? nodeGroup : null
            )),
        };
        const callbacks = createCallbacks();

        registerDragListeners(createContext(state, svg, mainGroup, [node], new Map()), callbacks);

        svg.emit('mousemove', {
            clientX: 55,
            clientY: 90,
        });

        expect(node.x).toBe(60);
        expect(node.y).toBe(90);
        expect(nodeGroup.setAttribute).toHaveBeenCalledWith('transform', 'translate(40, 60)');
        expect(callbacks.updateNodeEdges).toHaveBeenCalledWith(node);

        svg.emit('mouseup', {});
        expect(nodeGroup.style.opacity).toBe('1');
        expect(state.isDraggingNode).toBe(false);
        expect(state.draggingNodeId).toBeNull();
    });

    it('drags cloud containers through cloudOffsets and restores opacity on completion', () => {
        const node: FlowNode = {
            id: 'cloud_1',
            type: 'cte',
            label: 'cte',
            x: 10,
            y: 15,
            width: 120,
            height: 50,
        };
        const state = createState({
            isDraggingCloud: true,
            draggingCloudNodeId: 'cloud_1',
            dragCloudStartOffsetX: 30,
            dragCloudStartOffsetY: 40,
            dragPointerLastClientX: 15,
            dragPointerLastClientY: 20,
        });
        const svg = createSvg();
        const cloudGroup = createElement('g');
        cloudGroup.style.opacity = '0.4';
        const mainGroup = {
            querySelector: jest.fn((selector: string) => (
                selector === '.cloud-container[data-node-id="cloud_1"]' ? cloudGroup : null
            )),
        };
        const cloudOffsets = new Map<string, { offsetX: number; offsetY: number }>();
        const callbacks = createCallbacks();

        registerDragListeners(createContext(state, svg, mainGroup, [node], cloudOffsets), callbacks);

        svg.emit('mousemove', {
            clientX: 35,
            clientY: 50,
        });

        expect(cloudOffsets.get('cloud_1')).toEqual({ offsetX: 50, offsetY: 70 });
        expect(state.dragPointerLastClientX).toBe(35);
        expect(state.dragPointerLastClientY).toBe(50);
        expect(callbacks.updateCloudAndArrow).toHaveBeenCalledWith(node);

        svg.emit('mousemove', {
            clientX: 45,
            clientY: 55,
        });

        expect(cloudOffsets.get('cloud_1')).toEqual({ offsetX: 60, offsetY: 75 });

        svg.emit('mouseleave', {});
        expect(cloudGroup.style.opacity).toBe('1');
        expect(state.isDraggingCloud).toBe(false);
        expect(state.draggingCloudNodeId).toBeNull();
        expect(state.dragPointerLastClientX).toBeNull();
        expect(state.dragPointerLastClientY).toBeNull();
    });

    it('supports non-mouse pointer dragging with pointer capture', () => {
        const state = createState({ offsetX: 10, offsetY: 20 });
        const svg = createSvg();
        const callbacks = createCallbacks();

        registerDragListeners(createContext(state, svg, null, [], new Map()), callbacks);

        const target = createElement('svg');
        const preventDefault = jest.fn();
        svg.emit('pointerdown', {
            pointerType: 'pen',
            pointerId: 9,
            target,
            clientX: 40,
            clientY: 60,
            preventDefault,
        });

        expect(state.isDragging).toBe(true);
        expect(svg.setPointerCapture).toHaveBeenCalledWith(9);
        expect(preventDefault).toHaveBeenCalled();

        const movePreventDefault = jest.fn();
        svg.emit('pointermove', {
            pointerType: 'pen',
            pointerId: 9,
            clientX: 70,
            clientY: 100,
            preventDefault: movePreventDefault,
        });

        expect(state.offsetX).toBe(40);
        expect(state.offsetY).toBe(60);
        expect(callbacks.updateTransform).toHaveBeenCalled();

        const upPreventDefault = jest.fn();
        svg.emit('pointerup', {
            pointerType: 'pen',
            pointerId: 9,
            preventDefault: upPreventDefault,
        });

        expect(svg.releasePointerCapture).toHaveBeenCalledWith(9);
        expect(state.isDragging).toBe(false);
        expect(upPreventDefault).toHaveBeenCalled();
    });
});
