import type { FlowNode, ViewState } from '../../../src/webview/types';
import { getComponentUiColors } from '../../../src/webview/constants';
import {
    clearSearchFeature,
    createSearchRuntimeState,
    highlightMatchesFeature,
    navigateSearchFeature,
    performSearchFeature,
    setSearchBoxFeature,
    updateSearchCountDisplayFeature,
} from '../../../src/webview/features/search';

function createViewState(overrides: Partial<ViewState> = {}): ViewState {
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

type ListenerMap = Record<string, Array<(event?: any) => void>>;

function createFakeInput(): HTMLInputElement & { emit: (type: string, event?: any) => void } {
    const listeners: ListenerMap = {};
    const input = {
        value: '',
        style: { width: '' },
        addEventListener(type: string, handler: (event?: any) => void) {
            listeners[type] = listeners[type] || [];
            listeners[type].push(handler);
        },
        emit(type: string, event?: any) {
            for (const handler of listeners[type] || []) {
                handler(event);
            }
        },
    };
    return input as HTMLInputElement & { emit: (type: string, event?: any) => void };
}

function createFakeNodeGroup(id: string) {
    const attrs = new Map<string, string>();
    const rect = {
        getAttribute: jest.fn((name: string) => attrs.get(name) || null),
        hasAttribute: jest.fn((name: string) => attrs.has(name)),
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
            if (name === 'stroke' || name === 'stroke-width' || name === 'stroke-dasharray') {
                attrs.set(`data-node-base-${name}`, value);
            }
        }),
        removeAttribute: jest.fn(),
    };
    return {
        classList: {
            add: jest.fn(),
            remove: jest.fn(),
        },
        getAttribute: jest.fn((name: string) => {
            if (name === 'data-id') {
                return id;
            }
            return null;
        }),
        querySelector: jest.fn(() => rect),
        rect,
    };
}

describe('search feature helpers', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('creates empty runtime state', () => {
        expect(createSearchRuntimeState()).toEqual({
            searchDebounceTimer: null,
            searchCountIndicator: null,
            searchBox: null,
        });
    });

    it('updates the search count indicator across empty, missing, and matched states', () => {
        const runtime = createSearchRuntimeState();
        runtime.searchCountIndicator = {
            style: { display: '', color: '' },
            textContent: '',
        } as unknown as HTMLSpanElement;

        const state = createViewState();
        updateSearchCountDisplayFeature(runtime, state, 3);
        expect(runtime.searchCountIndicator.style.display).toBe('none');
        expect(runtime.searchCountIndicator.textContent).toBe('');

        state.searchTerm = 'orders';
        updateSearchCountDisplayFeature(runtime, state, 0);
        expect(runtime.searchCountIndicator.style.display).toBe('block');
        expect(runtime.searchCountIndicator.textContent).toBe('No data');
        expect(runtime.searchCountIndicator.style.color).toBe(getComponentUiColors(true).textMuted);

        updateSearchCountDisplayFeature(runtime, state, 4);
        expect(runtime.searchCountIndicator.textContent).toBe('No matches');
        expect(runtime.searchCountIndicator.style.color).toBe('#f87171');

        state.searchResults = ['n1', 'n2', 'n3'];
        state.currentSearchIndex = 1;
        updateSearchCountDisplayFeature(runtime, state, 4);
        expect(runtime.searchCountIndicator.textContent).toBe('2/3');
        expect(runtime.searchCountIndicator.style.color).toBe(getComponentUiColors(true).textMuted);
    });

    it('uses theme-aware highlight colors for matched search results', () => {
        const darkState = createViewState({ isDarkTheme: true });
        const lightState = createViewState({ isDarkTheme: false });
        const darkNode = createFakeNodeGroup('orders');
        const lightNode = createFakeNodeGroup('orders');

        highlightMatchesFeature({
            term: 'orders',
            state: darkState,
            mainGroup: {
                querySelectorAll: jest.fn(() => [darkNode]),
            } as unknown as SVGGElement,
            selectedNodeId: null,
            highlightColor: '#fbbf24',
        });
        expect(darkNode.rect.setAttribute).toHaveBeenCalledWith('stroke', '#fbbf24');

        highlightMatchesFeature({
            term: 'orders',
            state: lightState,
            mainGroup: {
                querySelectorAll: jest.fn(() => [lightNode]),
            } as unknown as SVGGElement,
            selectedNodeId: null,
            highlightColor: '#fbbf24',
        });
        expect(lightNode.rect.setAttribute).toHaveBeenCalledWith('stroke', getComponentUiColors(false).accent);
    });

    it('registers search input handlers for keyboard navigation and debounce', () => {
        jest.useFakeTimers();
        const runtime = createSearchRuntimeState();
        const input = createFakeInput();
        const countIndicator = {} as HTMLSpanElement;
        const callbacks = {
            onNavigateSearch: jest.fn(),
            onHighlightMatches: jest.fn(),
            onUpdateSearchCountDisplay: jest.fn(),
            onNavigateToFirstResult: jest.fn(),
            onNodeMatchActivated: jest.fn(),
            onAddBreadcrumbSegment: jest.fn(),
            onRemoveBreadcrumbSegment: jest.fn(),
            onClearSearch: jest.fn(),
        };

        setSearchBoxFeature(runtime, input, countIndicator, callbacks);

        input.emit('keydown', { key: 'Enter', shiftKey: false, preventDefault: jest.fn(), stopPropagation: jest.fn() });
        input.emit('keydown', { key: 'Enter', shiftKey: true, preventDefault: jest.fn(), stopPropagation: jest.fn() });
        expect(callbacks.onNavigateSearch).toHaveBeenNthCalledWith(1, 1);
        expect(callbacks.onNavigateSearch).toHaveBeenNthCalledWith(2, -1);

        input.emit('focus');
        expect(input.style.width).toBe('280px');

        input.value = '';
        input.emit('blur');
        expect(input.style.width).toBe('140px');

        input.value = '';
        input.emit('input');
        expect(callbacks.onClearSearch).toHaveBeenCalledTimes(1);
        expect(callbacks.onHighlightMatches).not.toHaveBeenCalled();

        input.value = 'orders';
        input.emit('input');
        expect(callbacks.onHighlightMatches).toHaveBeenCalledWith('orders');
        expect(callbacks.onUpdateSearchCountDisplay).toHaveBeenCalled();
        jest.advanceTimersByTime(600);
        expect(callbacks.onNavigateToFirstResult).toHaveBeenCalledTimes(1);
    });

    it('clears the pending debounce and stops bubbling when Enter is pressed', () => {
        jest.useFakeTimers();
        const runtime = createSearchRuntimeState();
        const input = createFakeInput();
        const countIndicator = {} as HTMLSpanElement;
        const callbacks = {
            onNavigateSearch: jest.fn(),
            onHighlightMatches: jest.fn(),
            onUpdateSearchCountDisplay: jest.fn(),
            onNavigateToFirstResult: jest.fn(),
            onNodeMatchActivated: jest.fn(),
            onAddBreadcrumbSegment: jest.fn(),
            onRemoveBreadcrumbSegment: jest.fn(),
            onClearSearch: jest.fn(),
        };

        setSearchBoxFeature(runtime, input, countIndicator, callbacks);

        input.value = 'orders';
        input.emit('input');
        expect(runtime.searchDebounceTimer).not.toBeNull();

        const preventDefault = jest.fn();
        const stopPropagation = jest.fn();
        input.emit('keydown', { key: 'Enter', shiftKey: false, preventDefault, stopPropagation });

        expect(preventDefault).toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalled();
        expect(runtime.searchDebounceTimer).toBeNull();
        expect(callbacks.onNavigateSearch).toHaveBeenCalledWith(1);

        jest.advanceTimersByTime(600);
        expect(callbacks.onNavigateToFirstResult).not.toHaveBeenCalled();
    });

    it('adds or removes breadcrumb state based on search results', () => {
        const stateWithMatches = createViewState({ searchResults: ['orders'] });
        const callbacks = {
            onHighlightMatches: jest.fn(),
            onNavigateToFirstResult: jest.fn(),
            onAddBreadcrumbSegment: jest.fn(),
            onRemoveBreadcrumbSegment: jest.fn(),
        };

        performSearchFeature('orders', stateWithMatches, callbacks);
        expect(callbacks.onAddBreadcrumbSegment).toHaveBeenCalledWith('orders');
        expect(callbacks.onRemoveBreadcrumbSegment).not.toHaveBeenCalled();

        const emptyState = createViewState({ searchResults: [] });
        performSearchFeature('missing', emptyState, callbacks);
        expect(callbacks.onRemoveBreadcrumbSegment).toHaveBeenCalled();
    });

    it('navigates matches cyclically and activates the selected node', () => {
        const state = createViewState({
            searchResults: ['a', 'b', 'c'],
            currentSearchIndex: -1,
        });
        const currentNodes: FlowNode[] = [
            { id: 'a', type: 'table', label: 'A', x: 0, y: 0, width: 100, height: 40 },
            { id: 'b', type: 'table', label: 'B', x: 0, y: 0, width: 100, height: 40 },
        ];
        const callbacks = {
            onUpdateSearchCountDisplay: jest.fn(),
            onNodeMatchActivated: jest.fn(),
        };

        navigateSearchFeature(0, state, currentNodes, callbacks);
        expect(state.currentSearchIndex).toBe(0);
        expect(callbacks.onNodeMatchActivated).toHaveBeenLastCalledWith('a');

        navigateSearchFeature(1, state, currentNodes, callbacks);
        expect(state.currentSearchIndex).toBe(1);
        expect(callbacks.onNodeMatchActivated).toHaveBeenLastCalledWith('b');

        navigateSearchFeature(1, state, currentNodes, callbacks);
        expect(state.currentSearchIndex).toBe(2);
        expect(callbacks.onNodeMatchActivated).toHaveBeenCalledTimes(2);

        navigateSearchFeature(1, state, currentNodes, callbacks);
        expect(state.currentSearchIndex).toBe(0);
    });

    it('clears search state, removes highlights, and updates breadcrumb/count UI', () => {
        const nodeA = createFakeNodeGroup('a');
        const nodeB = createFakeNodeGroup('b');
        const state = createViewState({
            searchTerm: 'orders',
            searchResults: ['a', 'b'],
            currentSearchIndex: 1,
        });
        const callbacks = {
            onUpdateSearchCountDisplay: jest.fn(),
            onRemoveBreadcrumbSegment: jest.fn(),
        };
        const mainGroup = {
            querySelectorAll: jest.fn(() => [nodeA, nodeB]),
        } as unknown as SVGGElement;

        clearSearchFeature(state, mainGroup, 'b', callbacks);

        expect(state.searchTerm).toBe('');
        expect(state.searchResults).toEqual([]);
        expect(state.currentSearchIndex).toBe(-1);
        expect(nodeA.classList.remove).toHaveBeenCalledWith('search-match');
        expect(nodeB.classList.remove).toHaveBeenCalledWith('search-match');
        expect(nodeA.rect.removeAttribute).toHaveBeenCalledWith('stroke');
        expect(nodeA.rect.removeAttribute).toHaveBeenCalledWith('stroke-width');
        expect(nodeB.rect.removeAttribute).not.toHaveBeenCalled();
        expect(callbacks.onUpdateSearchCountDisplay).toHaveBeenCalled();
        expect(callbacks.onRemoveBreadcrumbSegment).toHaveBeenCalled();
    });
});
