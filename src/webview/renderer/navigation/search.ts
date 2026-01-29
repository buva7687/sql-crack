// Search functionality

import { state, mainGroup, currentNodes, setSearchBox as setSearchBoxRef } from '../state';
import { zoomToNode } from './zoom';
import { selectNode } from './selection';

// Debounce timer for search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SEARCH_DEBOUNCE_DELAY = 600; // ms - wait for user to stop typing

// Reference to search count indicator element
let searchCountIndicator: HTMLSpanElement | null = null;

export function setSearchBox(input: HTMLInputElement, countIndicator?: HTMLSpanElement): void {
    setSearchBoxRef(input);
    if (countIndicator) {
        searchCountIndicator = countIndicator;
    }
    input.addEventListener('input', () => {
        // Clear any existing debounce timer
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        // Immediately highlight matches without zooming (for visual feedback)
        highlightMatches(input.value);

        // Debounce the zoom/navigation to first result
        searchDebounceTimer = setTimeout(() => {
            navigateToFirstResult();
        }, SEARCH_DEBOUNCE_DELAY);
    });
}

// Highlight matching nodes without navigating (immediate feedback)
function highlightMatches(term: string): void {
    state.searchTerm = term.toLowerCase();
    state.searchResults = [];
    state.currentSearchIndex = -1;

    // Clear previous highlights
    const allNodes = mainGroup?.querySelectorAll('.node');
    allNodes?.forEach(g => {
        g.classList.remove('search-match');
        const rect = g.querySelector('.node-rect');
        if (rect && state.selectedNodeId !== g.getAttribute('data-id')) {
            rect.removeAttribute('stroke');
            rect.removeAttribute('stroke-width');
        }
    });

    if (!term) {
        updateSearchCountIndicator();
        return;
    }

    // Find and highlight matching nodes
    allNodes?.forEach(g => {
        const label = g.getAttribute('data-label') || '';
        const id = g.getAttribute('data-id') || '';
        if (label.includes(state.searchTerm) || id.includes(state.searchTerm)) {
            state.searchResults.push(id);
            g.classList.add('search-match');
            const rect = g.querySelector('.node-rect');
            if (rect) {
                rect.setAttribute('stroke', '#fbbf24');
                rect.setAttribute('stroke-width', '2');
            }
        }
    });

    updateSearchCountIndicator();
}

// Navigate to first result after debounce delay
function navigateToFirstResult(): void {
    if (state.searchResults.length > 0) {
        navigateSearch(0);
    }
}

export function performSearch(term: string): void {
    highlightMatches(term);
    navigateToFirstResult();
}

export function navigateSearch(delta: number): void {
    if (state.searchResults.length === 0) { return; }

    if (delta === 0) {
        state.currentSearchIndex = 0;
    } else {
        state.currentSearchIndex = (state.currentSearchIndex + delta + state.searchResults.length) % state.searchResults.length;
    }

    const nodeId = state.searchResults[state.currentSearchIndex];
    const node = currentNodes.find(n => n.id === nodeId);
    if (node) {
        zoomToNode(node);
        selectNode(nodeId);
    }

    updateSearchCountIndicator();
}

export function clearSearch(): void {
    state.searchTerm = '';
    state.searchResults = [];
    state.currentSearchIndex = -1;

    const allNodes = mainGroup?.querySelectorAll('.node');
    allNodes?.forEach(g => {
        g.classList.remove('search-match');
        const rect = g.querySelector('.node-rect');
        if (rect && state.selectedNodeId !== g.getAttribute('data-id')) {
            rect.removeAttribute('stroke');
            rect.removeAttribute('stroke-width');
        }
    });

    updateSearchCountIndicator();
}

export function getSearchResultCount(): { current: number; total: number } {
    return {
        current: state.currentSearchIndex + 1,
        total: state.searchResults.length
    };
}

// Update the search count indicator UI
function updateSearchCountIndicator(): void {
    if (!searchCountIndicator) { return; }

    const { current, total } = getSearchResultCount();
    if (total === 0) {
        if (state.searchTerm) {
            // Show "0" when there's a search term but no results
            searchCountIndicator.textContent = '0';
            searchCountIndicator.style.display = 'inline';
            searchCountIndicator.style.color = '#ef4444'; // red for no results
        } else {
            // Hide when no search term
            searchCountIndicator.style.display = 'none';
        }
    } else {
        searchCountIndicator.textContent = `${current}/${total}`;
        searchCountIndicator.style.display = 'inline';
        searchCountIndicator.style.color = '#64748b'; // normal color
    }
}

export function nextSearchResult(): void {
    navigateSearch(1);
}

export function prevSearchResult(): void {
    navigateSearch(-1);
}
