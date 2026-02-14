import { ICONS } from '../../../shared/icons';

export interface SearchBoxCallbacks {
    isDarkTheme: () => boolean;
    onPrevSearchResult: () => void;
    onNextSearchResult: () => void;
    onSearchBoxReady: (input: HTMLInputElement, countIndicator: HTMLSpanElement) => void;
}

export function createSearchBox(
    callbacks: SearchBoxCallbacks,
    getListenerOptions: () => AddEventListenerOptions | undefined
): HTMLElement {
    const dark = callbacks.isDarkTheme();
    const listenerOptions = getListenerOptions();
    const searchContainer = document.createElement('div');
    searchContainer.id = 'search-container';
    searchContainer.style.cssText = `
        background: ${dark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'};
        border-radius: 8px;
        padding: 4px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const searchIcon = document.createElement('span');
    searchIcon.innerHTML = ICONS.search;
    searchIcon.style.cssText = 'display: inline-flex; width: 14px; height: 14px;';
    searchContainer.appendChild(searchIcon);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search nodes... (Ctrl+F)';
    searchInput.title = 'Search by table name, type, or column. Supports regex patterns.';
    searchInput.style.cssText = `
        background: transparent;
        border: none;
        color: ${dark ? '#f1f5f9' : '#1e293b'};
        font-size: 12px;
        width: 140px;
        outline: none;
    `;
    searchInput.id = 'search-input';
    searchContainer.appendChild(searchInput);

    const searchCount = document.createElement('span');
    searchCount.id = 'search-count';
    searchCount.style.cssText = `
        color: #64748b;
        font-size: 11px;
        min-width: 32px;
        text-align: center;
        display: none;
    `;
    searchContainer.appendChild(searchCount);

    const searchNav = document.createElement('div');
    searchNav.style.cssText = 'display: flex; gap: 4px;';

    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '↑';
    prevBtn.style.cssText = `
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 12px;
    `;
    prevBtn.addEventListener('click', callbacks.onPrevSearchResult, listenerOptions);
    searchNav.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '↓';
    nextBtn.style.cssText = prevBtn.style.cssText;
    nextBtn.addEventListener('click', callbacks.onNextSearchResult, listenerOptions);
    searchNav.appendChild(nextBtn);

    searchContainer.appendChild(searchNav);
    callbacks.onSearchBoxReady(searchInput, searchCount);

    return searchContainer;
}
