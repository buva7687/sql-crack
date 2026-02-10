// Command Bar — Floating command palette for quick actions
// Triggered by Ctrl+Shift+P (inside webview) or / key
import { prefersReducedMotion } from './motion';

export interface CommandBarAction {
    id: string;
    label: string;
    shortcut?: string;
    category?: string;
    action: () => void;
}

let commandBarElement: HTMLDivElement | null = null;
let commandInputElement: HTMLInputElement | null = null;
let commandPaletteElement: HTMLDivElement | null = null;
let isVisible = false;
let registeredActions: CommandBarAction[] = [];
let commandBarThemeResolver: (() => boolean) | null = null;
let commandBarAbortController: AbortController | null = null;

/**
 * Register a list of actions that the command bar can execute.
 */
export function registerCommandBarActions(actions: CommandBarAction[]): void {
    registeredActions = actions;
}

/**
 * Create the command bar overlay element.
 */
export function createCommandBar(
    container: HTMLElement,
    isDarkTheme: () => boolean
): HTMLDivElement {
    commandBarThemeResolver = isDarkTheme;
    // Abort previous listeners if re-initialized
    commandBarAbortController?.abort();
    commandBarAbortController = new AbortController();
    const signal = commandBarAbortController.signal;

    commandBarElement = document.createElement('div');
    commandBarElement.id = 'sql-crack-command-bar';
    commandBarElement.setAttribute('role', 'dialog');
    commandBarElement.setAttribute('aria-label', 'Command palette');
    const reducedMotion = prefersReducedMotion();
    commandBarElement.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2000;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding-top: 20%;
        background: rgba(0, 0, 0, 0.3);
        opacity: 0;
        transition: ${reducedMotion ? 'none' : 'opacity 0.15s ease'};
    `;

    const isDark = isDarkTheme();
    const palette = document.createElement('div');
    palette.style.cssText = `
        width: 400px;
        max-height: 320px;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, ${isDark ? '0.5' : '0.2'});
        background: ${isDark ? '#1A1A1A' : '#FFFFFF'};
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
        opacity: 0;
        transform: translateY(-8px);
        transition: ${reducedMotion ? 'none' : 'opacity 0.15s ease, transform 0.15s ease'};
    `;
    commandPaletteElement = palette;

    // Search input
    commandInputElement = document.createElement('input');
    commandInputElement.type = 'text';
    commandInputElement.placeholder = 'Type a command...';
    commandInputElement.setAttribute('aria-label', 'Search commands');
    commandInputElement.style.cssText = `
        width: 100%;
        padding: 12px 16px;
        border: none;
        border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
        background: transparent;
        color: ${isDark ? '#F1F5F9' : '#1E293B'};
        font-size: 14px;
        outline: none;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    palette.appendChild(commandInputElement);

    // Results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'command-bar-results';
    resultsContainer.style.cssText = `
        max-height: 260px;
        overflow-y: auto;
        padding: 4px 0;
    `;
    palette.appendChild(resultsContainer);

    commandBarElement.appendChild(palette);
    container.appendChild(commandBarElement);

    // Input event — filter results
    commandInputElement.addEventListener('input', () => {
        const query = commandInputElement?.value.toLowerCase() || '';
        renderResults(resultsContainer, query, isDarkTheme);
    }, { signal });

    // Keyboard navigation
    commandInputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideCommandBar();
            return;
        }
        if (e.key === 'Enter') {
            const firstActive = resultsContainer.querySelector('[data-active="true"]') as HTMLElement;
            if (firstActive) {
                firstActive.click();
            } else {
                const first = resultsContainer.querySelector('[data-action-id]') as HTMLElement;
                first?.click();
            }
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            navigateResults(resultsContainer, e.key === 'ArrowDown' ? 1 : -1, isDarkTheme);
        }
    }, { signal });

    // Click overlay to dismiss
    commandBarElement.addEventListener('click', (e) => {
        if (e.target === commandBarElement) {
            hideCommandBar();
        }
    }, { signal });

    // Theme change
    document.addEventListener('theme-change', ((e: CustomEvent) => {
        const dark = e.detail.dark;
        palette.style.background = dark ? '#1A1A1A' : '#FFFFFF';
        palette.style.borderColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        if (commandInputElement) {
            commandInputElement.style.color = dark ? '#F1F5F9' : '#1E293B';
            commandInputElement.style.borderBottomColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        }
    }) as EventListener, { signal });

    return commandBarElement;
}

/**
 * Dispose command bar event listeners.
 */
export function disposeCommandBar(): void {
    commandBarAbortController?.abort();
    commandBarAbortController = null;
}

function renderResults(
    container: HTMLElement,
    query: string,
    isDarkTheme: () => boolean
): void {
    const isDark = isDarkTheme();
    const filtered = query
        ? registeredActions.filter(a =>
            a.label.toLowerCase().includes(query) ||
            (a.category && a.category.toLowerCase().includes(query))
        )
        : registeredActions;

    container.innerHTML = '';

    filtered.forEach((action, index) => {
        const row = document.createElement('div');
        row.setAttribute('data-action-id', action.id);
        if (index === 0) { row.setAttribute('data-active', 'true'); }
        row.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: ${isDark ? '#E2E8F0' : '#1E293B'};
            font-size: 13px;
            background: ${index === 0 ? (isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)') : 'transparent'};
            transition: ${prefersReducedMotion() ? 'none' : 'background 0.1s'};
        `;

        const label = document.createElement('span');
        label.textContent = action.label;
        row.appendChild(label);

        if (action.shortcut) {
            const kbd = document.createElement('kbd');
            kbd.textContent = action.shortcut;
            kbd.style.cssText = `
                background: ${isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)'};
                border-radius: 3px;
                padding: 2px 6px;
                font-size: 10px;
                color: ${isDark ? '#A5B4FC' : '#6366F1'};
                font-family: monospace;
            `;
            row.appendChild(kbd);
        }

        row.addEventListener('mouseenter', () => {
            clearActiveResults(container);
            row.setAttribute('data-active', 'true');
            row.style.background = isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)';
        });
        row.addEventListener('mouseleave', () => {
            row.style.background = 'transparent';
            row.removeAttribute('data-active');
        });

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            hideCommandBar();
            action.action();
        });

        container.appendChild(row);
    });
}

function clearActiveResults(container: HTMLElement): void {
    container.querySelectorAll('[data-active]').forEach(el => {
        el.removeAttribute('data-active');
        (el as HTMLElement).style.background = 'transparent';
    });
}

function navigateResults(container: HTMLElement, direction: number, isDarkTheme: () => boolean): void {
    const isDark = isDarkTheme();
    const items = Array.from(container.querySelectorAll('[data-action-id]')) as HTMLElement[];
    if (items.length === 0) { return; }

    const activeIndex = items.findIndex(el => el.getAttribute('data-active') === 'true');
    clearActiveResults(container);

    let newIndex = activeIndex + direction;
    if (newIndex < 0) { newIndex = items.length - 1; }
    if (newIndex >= items.length) { newIndex = 0; }

    items[newIndex].setAttribute('data-active', 'true');
    items[newIndex].style.background = isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)';
    items[newIndex].scrollIntoView({ block: 'nearest' });
}

/**
 * Show the command bar.
 */
export function showCommandBar(): void {
    if (!commandBarElement || !commandPaletteElement) { return; }
    isVisible = true;
    commandBarElement.style.display = 'flex';
    if (prefersReducedMotion()) {
        commandBarElement.style.opacity = '1';
        commandPaletteElement.style.opacity = '1';
        commandPaletteElement.style.transform = 'translateY(0)';
    } else {
        commandBarElement.style.opacity = '0';
        commandPaletteElement.style.opacity = '0';
        commandPaletteElement.style.transform = 'translateY(-8px)';
        requestAnimationFrame(() => {
            if (!isVisible || !commandBarElement || !commandPaletteElement) { return; }
            commandBarElement.style.opacity = '1';
            commandPaletteElement.style.opacity = '1';
            commandPaletteElement.style.transform = 'translateY(0)';
        });
    }
    if (commandInputElement) {
        commandInputElement.value = '';
        commandInputElement.focus();
    }
    // Render initial results
    const results = commandBarElement.querySelector('#command-bar-results') as HTMLElement;
    if (results) {
        renderResults(results, '', commandBarThemeResolver ?? (() => true));
    }
}

/**
 * Hide the command bar.
 */
export function hideCommandBar(): void {
    if (!commandBarElement || !commandPaletteElement) { return; }
    isVisible = false;
    if (prefersReducedMotion()) {
        commandBarElement.style.display = 'none';
        commandBarElement.style.opacity = '0';
        commandPaletteElement.style.opacity = '0';
        commandPaletteElement.style.transform = 'translateY(-8px)';
        return;
    }

    commandBarElement.style.opacity = '0';
    commandPaletteElement.style.opacity = '0';
    commandPaletteElement.style.transform = 'translateY(-8px)';
    window.setTimeout(() => {
        if (isVisible || !commandBarElement) { return; }
        commandBarElement.style.display = 'none';
    }, 150);
}

/**
 * Toggle the command bar.
 */
export function toggleCommandBar(): void {
    if (isVisible) {
        hideCommandBar();
    } else {
        showCommandBar();
    }
}

export function isCommandBarVisible(): boolean {
    return isVisible;
}
