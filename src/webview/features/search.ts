import type { FlowNode, ViewState } from '../types';
import { restoreNodeBorderState } from '../nodeBorderState';
import { getComponentUiColors } from '../constants';

export interface SearchRuntimeState {
    searchDebounceTimer: ReturnType<typeof setTimeout> | null;
    searchCountIndicator: HTMLSpanElement | null;
    searchBox: HTMLInputElement | null;
}

export interface SearchCallbacks {
    onNavigateSearch: (delta: number) => void;
    onHighlightMatches: (term: string) => void;
    onUpdateSearchCountDisplay: () => void;
    onNavigateToFirstResult: () => void;
    onNodeMatchActivated: (nodeId: string) => void;
    onAddBreadcrumbSegment: (term: string) => void;
    onRemoveBreadcrumbSegment: () => void;
    onClearSearch: () => void;
}

export interface SearchMatchOptions {
    term: string;
    nodes: FlowNode[];
    state: ViewState;
    mainGroup: SVGGElement | null;
    selectedNodeId: string | null;
    highlightColor: string;
}

const SEARCH_DEBOUNCE_DELAY = 600;

export function createSearchRuntimeState(): SearchRuntimeState {
    return {
        searchDebounceTimer: null,
        searchCountIndicator: null,
        searchBox: null,
    };
}

export function setSearchBoxFeature(
    runtime: SearchRuntimeState,
    input: HTMLInputElement,
    countIndicator: HTMLSpanElement,
    callbacks: SearchCallbacks
): void {
    runtime.searchBox = input;
    runtime.searchCountIndicator = countIndicator;

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (runtime.searchDebounceTimer) {
                clearTimeout(runtime.searchDebounceTimer);
                runtime.searchDebounceTimer = null;
            }
            if (event.shiftKey) {
                callbacks.onNavigateSearch(-1);
            } else {
                callbacks.onNavigateSearch(1);
            }
        }
    });

    input.addEventListener('focus', () => {
        input.style.width = '280px';
    });

    input.addEventListener('blur', () => {
        if (!input.value) {
            input.style.width = '140px';
        }
    });

    input.addEventListener('input', () => {
        if (runtime.searchDebounceTimer) {
            clearTimeout(runtime.searchDebounceTimer);
            runtime.searchDebounceTimer = null;
        }

        if (!input.value) {
            callbacks.onClearSearch();
            return;
        }

        callbacks.onHighlightMatches(input.value);
        callbacks.onUpdateSearchCountDisplay();

        runtime.searchDebounceTimer = setTimeout(() => {
            runtime.searchDebounceTimer = null;
            callbacks.onNavigateToFirstResult();
        }, SEARCH_DEBOUNCE_DELAY);
    });
}

export function updateSearchCountDisplayFeature(
    runtime: SearchRuntimeState,
    state: ViewState,
    currentNodesLength: number
): void {
    if (!runtime.searchCountIndicator) {
        return;
    }

    const term = state.searchTerm;
    const total = state.searchResults.length;
    const hasNodes = currentNodesLength > 0;

    if (!term) {
        runtime.searchCountIndicator.style.display = 'none';
        runtime.searchCountIndicator.textContent = '';
        return;
    }

    runtime.searchCountIndicator.style.display = 'block';

    if (total === 0) {
        if (!hasNodes) {
            runtime.searchCountIndicator.textContent = 'No data';
            runtime.searchCountIndicator.style.color = getComponentUiColors(state.isDarkTheme).textMuted;
        } else {
            runtime.searchCountIndicator.textContent = 'No matches';
            runtime.searchCountIndicator.style.color = state.isDarkTheme ? '#f87171' : '#dc2626';
        }
        return;
    }

    const current = state.currentSearchIndex + 1;
    runtime.searchCountIndicator.textContent = `${current > 0 ? current : 1}/${total}`;
    runtime.searchCountIndicator.style.color = getComponentUiColors(state.isDarkTheme).textMuted;
}

function clearExistingMatchHighlights(mainGroup: SVGGElement | null, selectedNodeId: string | null): void {
    const allNodes = mainGroup?.querySelectorAll('.node');
    allNodes?.forEach((group) => {
        group.classList.remove('search-match');
        const rect = group.querySelector('.node-rect');
        if (rect && selectedNodeId !== group.getAttribute('data-id')) {
            restoreNodeBorderState(rect as SVGRectElement);
        }
    });
}

/** Match the complete render model; mounted SVG elements are only a presentation cache. */
export function highlightMatchesFeature(options: SearchMatchOptions): void {
    const { term, nodes, state } = options;
    state.searchTerm = term.toLowerCase();
    state.searchResults = nodes
        .filter(node => node.label.toLowerCase().includes(state.searchTerm) || node.id.toLowerCase().includes(state.searchTerm))
        .map(node => node.id);
    if (!term) {
        state.searchResults = [];
    }
    // Keep searches of already expanded cloud children working as before.
    options.mainGroup?.querySelectorAll('.node').forEach(group => {
        const id = group.getAttribute('data-id') || '';
        const label = group.getAttribute('data-label') || '';
        if (term && (label.includes(state.searchTerm) || id.toLowerCase().includes(state.searchTerm)) && !state.searchResults.includes(id)) {
            state.searchResults.push(id);
        }
    });
    state.currentSearchIndex = -1;
    refreshSearchHighlightsFeature(options);
}

/** Restore highlights after viewport culling without replacing the match list or active index. */
export function refreshSearchHighlightsFeature(options: Pick<SearchMatchOptions, 'state' | 'mainGroup' | 'selectedNodeId' | 'highlightColor'>): void {
    const { state, mainGroup, selectedNodeId, highlightColor } = options;
    const theme = getComponentUiColors(state.isDarkTheme);
    clearExistingMatchHighlights(mainGroup, selectedNodeId);
    const matches = new Set(state.searchResults);
    mainGroup?.querySelectorAll('.node').forEach(group => {
        const id = group.getAttribute('data-id') || '';
        if (!matches.has(id)) { return; }
        group.classList.add('search-match');
        const rect = group.querySelector('.node-rect');
        if (rect && id !== selectedNodeId) {
            rect.setAttribute('stroke', state.isDarkTheme ? highlightColor : theme.accent);
            rect.setAttribute('stroke-width', '2');
        }
    });
}

export function navigateToFirstResultFeature(state: ViewState, callbacks: Pick<SearchCallbacks, 'onNavigateSearch'>): void {
    if (state.searchResults.length > 0) {
        callbacks.onNavigateSearch(0);
    }
}

export function performSearchFeature(
    term: string,
    state: ViewState,
    callbacks: Pick<SearchCallbacks, 'onHighlightMatches' | 'onNavigateToFirstResult' | 'onAddBreadcrumbSegment' | 'onRemoveBreadcrumbSegment'>
): void {
    callbacks.onHighlightMatches(term);
    callbacks.onNavigateToFirstResult();
    if (term && state.searchResults.length > 0) {
        callbacks.onAddBreadcrumbSegment(term);
        return;
    }
    callbacks.onRemoveBreadcrumbSegment();
}

export function navigateSearchFeature(
    delta: number,
    state: ViewState,
    currentNodes: FlowNode[],
    callbacks: Pick<SearchCallbacks, 'onUpdateSearchCountDisplay' | 'onNodeMatchActivated'>
): void {
    if (state.searchResults.length === 0) {
        return;
    }

    if (delta === 0) {
        state.currentSearchIndex = 0;
    } else {
        state.currentSearchIndex = (state.currentSearchIndex + delta + state.searchResults.length) % state.searchResults.length;
    }

    callbacks.onUpdateSearchCountDisplay();

    const nodeId = state.searchResults[state.currentSearchIndex];
    const node = currentNodes.find((candidate) => candidate.id === nodeId);
    if (node) {
        callbacks.onNodeMatchActivated(nodeId);
    }
}

export function clearSearchFeature(
    state: ViewState,
    mainGroup: SVGGElement | null,
    selectedNodeId: string | null,
    callbacks: Pick<SearchCallbacks, 'onUpdateSearchCountDisplay' | 'onRemoveBreadcrumbSegment'>
): void {
    state.searchTerm = '';
    state.searchResults = [];
    state.currentSearchIndex = -1;
    clearExistingMatchHighlights(mainGroup, selectedNodeId);
    callbacks.onUpdateSearchCountDisplay();
    callbacks.onRemoveBreadcrumbSegment();
}
