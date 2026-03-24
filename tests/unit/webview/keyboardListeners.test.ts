import type { EventListenerCallbacks, EventListenerContext } from '../../../src/webview/interaction/eventListenerTypes';
import {
    registerDocumentKeyboardListeners,
    registerSvgKeyboardListeners,
} from '../../../src/webview/interaction/keyboardListeners';
import type { FlowNode, ViewState } from '../../../src/webview/types';

type Listener = (event: any) => void;

type FakeKeyboardTarget = {
    addEventListener: jest.Mock<void, [string, Listener]>;
    emit: (type: string, event: any) => void;
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

function createCallbacks(overrides: Partial<EventListenerCallbacks> = {}): EventListenerCallbacks {
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
        ...overrides,
    };
}

function createKeyboardTarget(): FakeKeyboardTarget {
    const listeners = new Map<string, Listener>();
    return {
        addEventListener: jest.fn((type: string, handler: Listener) => {
            listeners.set(type, handler);
        }),
        emit(type: string, event: any) {
            const listener = listeners.get(type);
            if (listener) {
                listener(event);
            }
        },
    };
}

function createContext(
    state: ViewState,
    svg: FakeKeyboardTarget,
    searchBox: { value: string; focus: jest.Mock<void, []> } | null,
    currentNodes: FlowNode[] = []
): EventListenerContext {
    return {
        state,
        getSvg: () => svg as unknown as SVGSVGElement,
        getMainGroup: () => null,
        getCurrentNodes: () => currentNodes,
        cloudOffsets: new Map(),
        getSearchBox: () => searchBox as unknown as HTMLInputElement | null,
        documentListeners: [],
    };
}

describe('keyboardListeners', () => {
    const originalDocument = global.document;
    const originalRequestAnimationFrame = global.requestAnimationFrame;

    afterEach(() => {
        global.document = originalDocument;
        global.requestAnimationFrame = originalRequestAnimationFrame;
    });

    it('cycles node focus with Tab on the svg listener', () => {
        const svg = createKeyboardTarget();
        const nodeA: FlowNode = { id: 'a', type: 'table', label: 'a', x: 0, y: 0, width: 10, height: 10 };
        const nodeB: FlowNode = { id: 'b', type: 'table', label: 'b', x: 20, y: 0, width: 10, height: 10 };
        const callbacks = createCallbacks({
            getKeyboardNavigationNodes: jest.fn(() => [nodeA, nodeB]),
        });

        registerSvgKeyboardListeners(createContext(createState({ selectedNodeId: 'a' }), svg, null), callbacks);

        const preventDefault = jest.fn();
        const stopPropagation = jest.fn();
        svg.emit('keydown', {
            key: 'Tab',
            shiftKey: false,
            preventDefault,
            stopPropagation,
        });

        expect(preventDefault).toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalled();
        expect(callbacks.moveKeyboardFocusToNode).toHaveBeenCalledWith(nodeB);
    });

    it('handles document escape by clearing state, search, and scheduling a reset', () => {
        const svg = createKeyboardTarget();
        const searchBox = { value: 'orders', focus: jest.fn() };
        const state = createState({
            selectedNodeId: 'n1',
            showColumnFlows: false,
            isFullscreen: true,
        });
        const callbacks = createCallbacks();
        const raf = jest.fn((cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });
        global.requestAnimationFrame = raf;

        const activeElement = { tagName: 'DIV' };
        const listeners = new Map<string, Listener>();
        global.document = {
            activeElement,
            addEventListener: jest.fn((type: string, handler: Listener) => {
                listeners.set(type, handler);
            }),
        } as unknown as Document;

        const context = createContext(state, svg, searchBox);
        registerDocumentKeyboardListeners(context, callbacks);

        const keydown = listeners.get('keydown');
        expect(keydown).toBeDefined();

        const preventDefault = jest.fn();
        keydown!({
            key: 'Escape',
            preventDefault,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
        });

        expect(callbacks.toggleFullscreen).toHaveBeenCalledWith(false);
        expect(callbacks.selectNode).toHaveBeenCalledWith(null);
        expect(callbacks.clearFocusMode).toHaveBeenCalled();
        expect(callbacks.hideContextMenu).toHaveBeenCalled();
        expect(searchBox.value).toBe('');
        expect(callbacks.clearSearch).toHaveBeenCalled();
        expect(callbacks.resetView).toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();
    });

    it('handles search focus, command bar, layout shortcuts, and arrow navigation', () => {
        const svg = createKeyboardTarget();
        const searchBox = { value: '', focus: jest.fn() };
        const selectedNode: FlowNode = {
            id: 'n1',
            type: 'table',
            label: 'users',
            x: 10,
            y: 20,
            width: 100,
            height: 40,
        };
        const callbacks = createCallbacks({
            isCommandBarVisible: jest.fn(() => true),
        });
        const listeners = new Map<string, Listener>();
        global.document = {
            activeElement: { tagName: 'DIV' },
            addEventListener: jest.fn((type: string, handler: Listener) => {
                listeners.set(type, handler);
            }),
        } as unknown as Document;

        registerDocumentKeyboardListeners(
            createContext(createState({ selectedNodeId: 'n1' }), svg, searchBox, [selectedNode]),
            callbacks
        );

        const keydown = listeners.get('keydown');
        expect(keydown).toBeDefined();

        keydown!({
            key: 'f',
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: jest.fn(),
        });
        expect(searchBox.focus).toHaveBeenCalled();

        keydown!({
            key: 'P',
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: true,
            preventDefault: jest.fn(),
        });
        expect(callbacks.toggleCommandBar).toHaveBeenCalled();

        keydown!({
            key: 'Escape',
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: jest.fn(),
        });
        expect(callbacks.hideCommandBar).toHaveBeenCalled();

        keydown!({
            key: '1',
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: jest.fn(),
        });
        expect(callbacks.switchLayout).toHaveBeenCalledWith('vertical');

        keydown!({
            key: 'ArrowUp',
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: jest.fn(),
        });
        expect(callbacks.navigateToConnectedNode).toHaveBeenCalledWith('upstream', 'n1');

        keydown!({
            key: 'ArrowRight',
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: jest.fn(),
        });
        expect(callbacks.navigateToSiblingNode).toHaveBeenCalledWith(selectedNode, 'next');
    });

    it('does not duplicate search navigation when Enter is handled by the search box', () => {
        const svg = createKeyboardTarget();
        const searchBox = { value: 'orders', focus: jest.fn() };
        const state = createState();
        const callbacks = createCallbacks();
        const listeners = new Map<string, Listener>();

        global.document = {
            activeElement: searchBox,
            addEventListener: jest.fn((type: string, handler: Listener) => {
                listeners.set(type, handler);
            }),
        } as unknown as Document;

        registerDocumentKeyboardListeners(createContext(state, svg, searchBox), callbacks);

        const keydown = listeners.get('keydown');
        expect(keydown).toBeDefined();

        keydown!({
            key: 'Enter',
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            shiftKey: false,
            preventDefault: jest.fn(),
        });

        expect(callbacks.navigateSearch).not.toHaveBeenCalled();
    });
});
