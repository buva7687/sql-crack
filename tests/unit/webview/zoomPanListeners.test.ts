import type { EventListenerCallbacks, EventListenerContext } from '../../../src/webview/interaction/eventListenerTypes';
import { registerZoomPanListeners } from '../../../src/webview/interaction/zoomPanListeners';
import type { ViewState } from '../../../src/webview/types';
import { getMinZoomScale, MIN_MANUAL_ZOOM } from '../../../src/webview/interaction/zoomLimits';

type Listener = (event: any) => void;

type FakeSvg = {
    addEventListener: jest.Mock<void, [string, Listener, AddEventListenerOptions?]>;
    getBoundingClientRect: jest.Mock<{ left: number; top: number }, []>;
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

function createCallbacks(): EventListenerCallbacks {
    return {
        updateCloudAndArrow: jest.fn(),
        updateNodeEdges: jest.fn(),
        updateTransform: jest.fn(),
        updateZoomIndicator: jest.fn(),
        recordLayoutHistorySnapshot: jest.fn(),
        onViewStateChanged: jest.fn(),
        selectNode: jest.fn(),
        clearFocusMode: jest.fn(),
        fitView: jest.fn(),
        getKeyboardNavigationNodes: jest.fn(() => []),
        moveKeyboardFocusToNode: jest.fn(),
        toggleColumnFlows: jest.fn(),
        hideContextMenu: jest.fn(),
        clearSearch: jest.fn(),
        resetView: jest.fn(),
        refreshVisualization: jest.fn(),
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

function createContext(state: ViewState, svg: FakeSvg): EventListenerContext {
    return {
        state,
        getSvg: () => svg as unknown as SVGSVGElement,
        getMainGroup: () => null,
        getCurrentNodes: () => [],
        cloudOffsets: new Map(),
        getSearchBox: () => null,
        documentListeners: [],
    };
}

function createSvg(): FakeSvg {
    const listeners = new Map<string, Listener>();
    return {
        addEventListener: jest.fn((type: string, handler: Listener) => {
            listeners.set(type, handler);
        }),
        getBoundingClientRect: jest.fn(() => ({ left: 10, top: 20 })),
        emit(type: string, event: any) {
            const listener = listeners.get(type);
            if (listener) {
                listener(event);
            }
        },
    };
}

describe('zoomPanListeners', () => {
    it('zooms around the mouse position and updates the transform state', () => {
        const state = createState({ scale: 1, offsetX: 5, offsetY: 7 });
        const svg = createSvg();
        const callbacks = createCallbacks();

        registerZoomPanListeners(createContext(state, svg), callbacks);

        const preventDefault = jest.fn();
        svg.emit('wheel', {
            deltaY: -1,
            clientX: 110,
            clientY: 220,
            preventDefault,
        });

        expect(preventDefault).toHaveBeenCalled();
        expect(state.scale).toBeCloseTo(1.1);
        expect(state.offsetX).toBeCloseTo(-4.5);
        expect(state.offsetY).toBeCloseTo(-12.3);
        expect(callbacks.updateTransform).toHaveBeenCalled();
        expect(callbacks.updateZoomIndicator).toHaveBeenCalled();
        // Wheel zoom is not a layout change; the persisted viewport must still be saved (S8).
        expect(callbacks.onViewStateChanged).toHaveBeenCalledTimes(1);
    });

    it('reports a view-state change when a touch gesture ends (S8)', () => {
        const state = createState();
        const svg = createSvg();
        const callbacks = createCallbacks();

        registerZoomPanListeners(createContext(state, svg), callbacks);

        svg.emit('touchstart', { touches: [{ clientX: 10, clientY: 10 }], preventDefault: jest.fn() });
        expect(callbacks.onViewStateChanged).not.toHaveBeenCalled();
        svg.emit('touchend', { touches: [] });
        expect(callbacks.onViewStateChanged).toHaveBeenCalledTimes(1);
    });

    it('clears selection on background click and refits when exiting a zoomed node', () => {
        const state = createState({ zoomedNodeId: 'n1' });
        const svg = createSvg();
        const callbacks = createCallbacks();

        registerZoomPanListeners(createContext(state, svg), callbacks);

        svg.emit('click', { target: svg });

        expect(callbacks.selectNode).toHaveBeenCalledWith(null);
        expect(callbacks.clearFocusMode).toHaveBeenCalled();
        expect(callbacks.fitView).toHaveBeenCalled();
        expect(callbacks.updateZoomIndicator).toHaveBeenCalled();
    });

    it('handles drag and pinch touch gestures by mutating offsets and scale', () => {
        const state = createState({ scale: 1, offsetX: 10, offsetY: 15 });
        const svg = createSvg();
        const callbacks = createCallbacks();

        registerZoomPanListeners(createContext(state, svg), callbacks);

        const dragStartPrevent = jest.fn();
        svg.emit('touchstart', {
            touches: [{ clientX: 70, clientY: 90 }],
            preventDefault: dragStartPrevent,
        });
        expect(state.isDragging).toBe(true);
        expect(state.dragStartX).toBe(60);
        expect(state.dragStartY).toBe(75);
        expect(dragStartPrevent).toHaveBeenCalled();

        const dragMovePrevent = jest.fn();
        svg.emit('touchmove', {
            touches: [{ clientX: 95, clientY: 120 }],
            preventDefault: dragMovePrevent,
        });
        expect(state.offsetX).toBe(35);
        expect(state.offsetY).toBe(45);
        expect(callbacks.updateTransform).toHaveBeenCalled();
        expect(dragMovePrevent).toHaveBeenCalled();

        const pinchStartPrevent = jest.fn();
        svg.emit('touchstart', {
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 0, clientY: 100 },
            ],
            preventDefault: pinchStartPrevent,
        });
        expect(state.isDragging).toBe(false);
        expect(pinchStartPrevent).toHaveBeenCalled();

        const pinchMovePrevent = jest.fn();
        svg.emit('touchmove', {
            touches: [
                { clientX: 0, clientY: 0 },
                { clientX: 0, clientY: 200 },
            ],
            preventDefault: pinchMovePrevent,
        });
        expect(state.scale).toBeCloseTo(2);
        expect(callbacks.updateZoomIndicator).toHaveBeenCalled();
        expect(pinchMovePrevent).toHaveBeenCalled();
    });

    describe('zoom-out floor after a fit below the manual minimum', () => {
        const wheelOut = (svg: FakeSvg) => svg.emit('wheel', { deltaY: 1, clientX: 110, clientY: 220, preventDefault: jest.fn() });
        const pinch = (svg: FakeSvg, from: number, to: number) => {
            const touches = (gap: number) => [{ clientX: 100, clientY: 100 }, { clientX: 100 + gap, clientY: 100 }];
            svg.emit('touchstart', { touches: touches(from), preventDefault: jest.fn() });
            svg.emit('touchmove', { touches: touches(to), preventDefault: jest.fn() });
        };

        it('never zooms in when scrolling out from a small fitted scale', () => {
            const state = createState({ scale: 0.09 });
            const svg = createSvg();
            registerZoomPanListeners({ ...createContext(state, svg), getMinZoomScale: () => getMinZoomScale(0.09) } as EventListenerContext, createCallbacks());

            wheelOut(svg);
            expect(state.scale).toBeCloseTo(0.09);
            expect(state.scale).toBeLessThan(MIN_MANUAL_ZOOM);
        });

        it('never zooms in when pinching out from a small fitted scale', () => {
            const state = createState({ scale: 0.09 });
            const svg = createSvg();
            registerZoomPanListeners({ ...createContext(state, svg), getMinZoomScale: () => getMinZoomScale(0.09) } as EventListenerContext, createCallbacks());

            pinch(svg, 200, 100);
            expect(state.scale).toBeLessThanOrEqual(0.09);
        });

        it('keeps the manual 20% floor when the fit was larger', () => {
            const state = createState({ scale: 0.21 });
            const svg = createSvg();
            registerZoomPanListeners({ ...createContext(state, svg), getMinZoomScale: () => getMinZoomScale(0.8) } as EventListenerContext, createCallbacks());

            wheelOut(svg);
            expect(state.scale).toBe(MIN_MANUAL_ZOOM);
        });

        it('does not raise a scale that is already below the floor, even without a fitted floor', () => {
            const state = createState({ scale: 0.1 });
            const svg = createSvg();
            registerZoomPanListeners(createContext(state, svg), createCallbacks());

            wheelOut(svg);
            expect(state.scale).toBeLessThanOrEqual(0.1);
        });

        it('uses the fitted scale as the floor only when it is below the manual minimum', () => {
            expect(getMinZoomScale(0.05)).toBe(0.05);
            expect(getMinZoomScale(0.6)).toBe(MIN_MANUAL_ZOOM);
            expect(getMinZoomScale(0)).toBe(MIN_MANUAL_ZOOM);
            expect(getMinZoomScale(Number.NaN)).toBe(MIN_MANUAL_ZOOM);
        });

        it('applies the same floor to the toolbar Zoom out button', () => {
            const rendererSource = require('fs').readFileSync(require('path').join(__dirname, '../../../src/webview/renderer.ts'), 'utf8') as string;
            const zoomOut = rendererSource.match(/export function zoomOut\(\): void \{[\s\S]*?\n}/);
            expect(zoomOut).not.toBeNull();
            expect(zoomOut![0]).toContain('Math.min(getMinZoomScale(fitViewScale), state.scale)');
            expect(rendererSource).toContain('getMinZoomScale: () => getMinZoomScale(fitViewScale),');
        });
    });
});
