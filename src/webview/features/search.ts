import type { FlowNode, ViewState } from '../types';

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
        }

        callbacks.onHighlightMatches(input.value);
        callbacks.onUpdateSearchCountDisplay();

        runtime.searchDebounceTimer = setTimeout(() => {
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
            runtime.searchCountIndicator.style.color = '#94a3b8';
        } else {
            runtime.searchCountIndicator.textContent = 'No matches';
            runtime.searchCountIndicator.style.color = '#f87171';
        }
        return;
    }

    const current = state.currentSearchIndex + 1;
    runtime.searchCountIndicator.textContent = `${current > 0 ? current : 1}/${total}`;
    runtime.searchCountIndicator.style.color = '#64748b';
}

function clearExistingMatchHighlights(mainGroup: SVGGElement | null, selectedNodeId: string | null): void {
    const allNodes = mainGroup?.querySelectorAll('.node');
    allNodes?.forEach((group) => {
        group.classList.remove('search-match');
        const rect = group.querySelector('.node-rect');
        if (rect && selectedNodeId !== group.getAttribute('data-id')) {
            rect.removeAttribute('stroke');
            rect.removeAttribute('stroke-width');
        }
    });
}

export function highlightMatchesFeature(options: SearchMatchOptions): void {
    const { term, state, mainGroup, selectedNodeId, highlightColor } = options;
    state.searchTerm = term.toLowerCase();
    state.searchResults = [];
    state.currentSearchIndex = -1;

    clearExistingMatchHighlights(mainGroup, selectedNodeId);
    if (!term) {
        return;
    }

    const allNodes = mainGroup?.querySelectorAll('.node');
    allNodes?.forEach((group) => {
        const label = group.getAttribute('data-label') || '';
        const id = group.getAttribute('data-id') || '';
        if (label.includes(state.searchTerm) || id.includes(state.searchTerm)) {
            state.searchResults.push(id);
            group.classList.add('search-match');
            const rect = group.querySelector('.node-rect');
            if (rect) {
                rect.setAttribute('stroke', highlightColor);
                rect.setAttribute('stroke-width', '2');
            }
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
