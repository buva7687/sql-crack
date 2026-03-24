import { ICONS } from '../../../shared/icons';
import { getComponentUiColors } from '../../constants';

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
        background: transparent;
        border: 1px solid transparent;
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
    searchInput.setAttribute('aria-label', 'Search nodes');
    searchInput.style.cssText = `
        background: transparent;
        border: none;
        font-size: 12px;
        width: 140px;
        outline: none;
    `;
    searchInput.id = 'search-input';
    searchContainer.appendChild(searchInput);

    const searchCount = document.createElement('span');
    searchCount.id = 'search-count';
    searchCount.setAttribute('aria-live', 'polite');
    searchCount.setAttribute('aria-atomic', 'true');
    searchCount.style.cssText = `
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
    prevBtn.setAttribute('aria-label', 'Previous match');
    prevBtn.title = 'Previous match';
    prevBtn.style.cssText = `
        background: transparent;
        border: none;
        cursor: pointer;
        width: 44px;
        height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        padding: 0;
        font-size: 12px;
        touch-action: manipulation;
    `;
    prevBtn.addEventListener('click', callbacks.onPrevSearchResult, listenerOptions);
    searchNav.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '↓';
    nextBtn.setAttribute('aria-label', 'Next match');
    nextBtn.title = 'Next match';
    nextBtn.style.cssText = prevBtn.style.cssText;
    nextBtn.addEventListener('click', callbacks.onNextSearchResult, listenerOptions);
    searchNav.appendChild(nextBtn);

    searchContainer.appendChild(searchNav);
    const applyTheme = (isDark: boolean): void => {
        const theme = getComponentUiColors(isDark);
        searchContainer.style.background = theme.surface;
        searchContainer.style.borderColor = theme.border;
        searchInput.style.color = theme.text;
        searchInput.style.caretColor = theme.accent;
        searchIcon.style.color = theme.textMuted;
        prevBtn.style.color = theme.textMuted;
        nextBtn.style.color = theme.textMuted;

        if (searchCount.textContent === 'No matches') {
            searchCount.style.color = isDark ? '#f87171' : '#dc2626';
        } else {
            searchCount.style.color = theme.textMuted;
        }
    };
    applyTheme(dark);

    const themeChangeHandler = ((event: CustomEvent<{ dark: boolean }>) => {
        applyTheme(Boolean(event.detail?.dark));
    }) as EventListener;
    document.addEventListener('theme-change', themeChangeHandler, listenerOptions);

    callbacks.onSearchBoxReady(searchInput, searchCount);

    return searchContainer;
}
