// Toolbar UI module

import { SqlDialect } from '../sqlParser';
import { FocusMode, LayoutType } from '../types';
import { ICONS } from '../../shared/icons';
import { escapeHtml } from '../../shared/stringUtils';
import { MONO_FONT_STACK } from '../../shared/themeTokens';
import { Z_INDEX } from '../../shared/zIndex';
import { getComponentUiColors } from '../constants';
import { prefersReducedMotion } from './motion';
import { showKeyboardShortcutsHelpModal } from './toolbar/shortcutsModal';
import { applyOverflowMenuTheme, setupOverflowObserver } from './toolbar/overflowMenu';
import { createSearchBox as createToolbarSearchBox } from './toolbar/searchBox';
import {
    createActionButtons as createToolbarActionButtons,
    ToolbarActionOptions,
} from './toolbar/actionGroups';
import { createFeatureGroupElement } from './toolbar/featureGroup';
export { setErrorBadgeClickHandler, updateErrorBadge, clearErrorBadge } from './toolbar/errorBadge';

// Toolbar callbacks interface
export interface ToolbarCallbacks {
    onUndo: () => void;
    onRedo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetView: () => void;
    getZoomLevel: () => number;
    onExportPng: () => void;
    onExportSvg: () => void;
    onExportMermaid: () => void;
    onCopyToClipboard: () => void;
    onCopyMermaidToClipboard?: () => void;
    onToggleLegend: () => void;
    onToggleFocusMode: (active: boolean) => void;
    onFocusModeChange: (mode: FocusMode) => void;
    getFocusMode: () => FocusMode;
    onToggleSqlPreview: () => void;
    onToggleColumnFlows: (active: boolean) => void;
    onToggleHints: () => void;
    onToggleTheme: () => void;
    onToggleFullscreen: () => void;
    onSearchBoxReady: (input: HTMLInputElement, countIndicator: HTMLSpanElement) => void;
    onNextSearchResult: () => void;
    onPrevSearchResult: () => void;
    onDialectChange: (dialect: SqlDialect) => void;
    onRefresh: () => void;
    onPinVisualization: (sql: string, dialect: SqlDialect, name: string) => void;
    onToggleCompareMode: () => void;
    isCompareMode: () => boolean;
    getCompareBaselineLabel: () => string | null;
    onChangeViewLocation: (location: string) => void;
    onOpenPinnedTab: (pinId: string) => void;
    onUnpinTab: (pinId: string) => void;
    onToggleLayout: () => void;
    onLayoutChange: (layout: LayoutType) => void;
    getCurrentLayout: () => LayoutType;
    isDarkTheme: () => boolean;
    isFullscreen: () => boolean;
    getKeyboardShortcuts: () => Array<{ key: string; description: string }>;
    getCurrentQuerySql: () => { sql: string; name: string };
}

type CreateToolbarOptions = ToolbarActionOptions & {
    currentDialect: SqlDialect;
};

let hintsSummaryBtn: HTMLButtonElement | null = null;
let toolbarAbortController: AbortController | null = null;
const HELP_PULSE_STYLE_ID = 'sql-crack-help-pulse-style';

function getToolbarListenerOptions(): AddEventListenerOptions | undefined {
    return toolbarAbortController ? { signal: toolbarAbortController.signal } : undefined;
}

function createHintsBadgeMarkup(label: string): string {
    return `
        <span style="display: inline-flex; width: 14px; height: 14px;">${ICONS.bolt}</span>
        <span>${escapeHtml(label)}</span>
    `;
}

function applyFirstRunHelpPulse(helpBtn: HTMLButtonElement, enabled: boolean): void {
    if (!enabled || prefersReducedMotion()) {
        return;
    }

    if (!document.getElementById(HELP_PULSE_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = HELP_PULSE_STYLE_ID;
        style.textContent = `
            @keyframes sql-crack-help-pulse {
                0% {
                    transform: scale(1);
                    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.45);
                }
                55% {
                    transform: scale(1.06);
                    box-shadow: 0 0 0 8px rgba(99, 102, 241, 0);
                }
                100% {
                    transform: scale(1);
                    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
                }
            }

            .sql-crack-help-pulse {
                animation: sql-crack-help-pulse 1.1s ease-out 3;
                background: rgba(99, 102, 241, 0.18) !important;
            }
        `;
        document.head.appendChild(style);
    }

    const stopPulse = () => {
        helpBtn.classList.remove('sql-crack-help-pulse');
    };

    helpBtn.classList.add('sql-crack-help-pulse');
    helpBtn.addEventListener('click', stopPulse, { once: true });
    window.setTimeout(stopPulse, 3600);
}

// Button style helper — uses theme-aware text color
function getBtnStyle(dark: boolean): string {
    return `
    background: transparent;
    border: none;
    color: ${dark ? '#f1f5f9' : '#1e293b'};
    padding: 8px 12px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.2s;
    `;
}

/**
 * Cleanup function type for removing event listeners
 */
export type ToolbarCleanup = () => void;

export function createToolbar(
    container: HTMLElement,
    callbacks: ToolbarCallbacks,
    options: CreateToolbarOptions
): { toolbar: HTMLElement; actions: HTMLElement; searchContainer: HTMLElement; cleanup: ToolbarCleanup } {
    // Abort stale listeners before rebuilding toolbar (e.g. re-init/theme rebuild)
    toolbarAbortController?.abort();
    toolbarAbortController = new AbortController();
    const listenerOptions = getToolbarListenerOptions();

    // Store event listeners for cleanup
    const documentListeners: Array<{ type: string; handler: EventListener }> = [];

    // Create a full-width wrapper with horizontal scroll on small screens
    const toolbarWrapper = document.createElement('div');
    toolbarWrapper.id = 'sql-crack-toolbar-wrapper';
    toolbarWrapper.style.cssText = `
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: ${Z_INDEX.toolbar};
        overflow: hidden;
        padding-bottom: 4px;
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
    `;

    // Add webkit scrollbar styles via a style element
    const scrollbarStyle = document.createElement('style');
    scrollbarStyle.textContent = `
        #sql-crack-toolbar-wrapper::-webkit-scrollbar {
            height: 4px;
        }
        #sql-crack-toolbar-wrapper::-webkit-scrollbar-track {
            background: transparent;
        }
        #sql-crack-toolbar-wrapper::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.3);
            border-radius: 2px;
        }
        #sql-crack-toolbar-wrapper::-webkit-scrollbar-thumb:hover {
            background: rgba(148, 163, 184, 0.5);
        }
    `;
    document.head.appendChild(scrollbarStyle);

    const toolbar = document.createElement('div');
    toolbar.id = 'sql-crack-toolbar';
    toolbar.style.cssText = `
        display: flex;
        gap: 8px;
        flex-shrink: 0;
    `;

    // Title and dialect selector
    const isDark = callbacks.isDarkTheme();
    const title = document.createElement('div');
    title.style.cssText = `
        background: ${isDark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'};
        border-radius: 8px;
        padding: 8px 12px;
        color: ${isDark ? '#f1f5f9' : '#1e293b'};
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    const selectBg = isDark ? '#1e293b' : '#f1f5f9';
    const selectColor = isDark ? '#f1f5f9' : '#1e293b';

    title.innerHTML = `
        <span>SQL Flow</span>
        <select id="dialect-select" title="SQL dialect for parsing" style="
            background: ${selectBg};
            color: ${selectColor};
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 11px;
            cursor: pointer;
            outline: none;
        ">
            <option value="MySQL">MySQL</option>
            <option value="PostgreSQL">PostgreSQL</option>
            <option value="TransactSQL">SQL Server</option>
            <option value="Snowflake">Snowflake</option>
            <option value="BigQuery">BigQuery</option>
            <option value="Redshift">Redshift</option>
            <option value="Hive">Hive / Databricks</option>
            <option value="Athena">Athena</option>
            <option value="Trino">Trino</option>
            <option value="MariaDB">MariaDB</option>
            <option value="SQLite">SQLite</option>
        </select>
        <span id="dialect-auto-indicator" style="
            display: none;
            color: ${isDark ? '#818cf8' : '#4f46e5'};
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.01em;
        "></span>
    `;
    toolbar.appendChild(title);

    // Search box
    const searchContainer = createToolbarSearchBox(callbacks, getToolbarListenerOptions);
    toolbar.appendChild(searchContainer);

    // Add toolbar (left side) to wrapper
    toolbarWrapper.appendChild(toolbar);

    // Action buttons (right side) - now inside the wrapper instead of separate absolute
    const actions = createToolbarActionButtons({
        callbacks,
        options,
        documentListeners,
        getListenerOptions: getToolbarListenerOptions,
        getBtnStyle,
        createFeatureGroup: (groupCallbacks, groupOptions, groupListeners) => createFeatureGroupElement({
            callbacks: groupCallbacks,
            options: groupOptions,
            documentListeners: groupListeners,
            getListenerOptions: getToolbarListenerOptions,
            getBtnStyle,
            onHintsButtonReady: (button) => {
                hintsSummaryBtn = button;
            },
            createHintsBadgeMarkup,
            showKeyboardShortcutsHelp,
            applyFirstRunHelpPulse,
        }),
    });
    toolbarWrapper.appendChild(actions);

    // Add the single wrapper to container
    container.appendChild(toolbarWrapper);

    // Set up ResizeObserver for overflow menu
    const resizeObserver = setupOverflowObserver(actions, toolbarWrapper, callbacks.isDarkTheme);
    applyOverflowMenuTheme(callbacks.isDarkTheme());

    // Apply initial theme to toolbar elements (covers light-theme startup)
    updateToolbarTheme(callbacks.isDarkTheme(), toolbar, actions, searchContainer);

    // Set initial dialect value
    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement;
    if (dialectSelect) {
        dialectSelect.value = options.currentDialect;
        dialectSelect.addEventListener('change', (e) => {
            callbacks.onDialectChange((e.target as HTMLSelectElement).value as SqlDialect);
        }, listenerOptions);
    }

    // Listen for theme change events
    const themeChangeHandler = ((e: CustomEvent) => {
        const dark = e.detail.dark;
        updateToolbarTheme(dark, toolbar, actions, searchContainer);
        applyOverflowMenuTheme(dark);
    }) as EventListener;
    document.addEventListener('theme-change', themeChangeHandler, listenerOptions);
    documentListeners.push({ type: 'theme-change', handler: themeChangeHandler });

    // Cleanup function to remove all document event listeners
    const cleanup: ToolbarCleanup = () => {
        toolbarAbortController?.abort();
        toolbarAbortController = null;
        documentListeners.forEach(({ type, handler }) => {
            document.removeEventListener(type, handler);
            window.removeEventListener(type, handler);
        });
        documentListeners.length = 0;
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
        // Remove the overflow dropdown from root container
        const overflowDropdown = document.getElementById('sql-crack-overflow-dropdown');
        if (overflowDropdown) {
            overflowDropdown.remove();
        }
        document.querySelectorAll('.sql-crack-floating-toolbar-menu').forEach((menu) => {
            (menu as HTMLElement).remove();
        });
    };

    return { toolbar, actions, searchContainer, cleanup };
}

export function disposeToolbar(): void {
    toolbarAbortController?.abort();
    toolbarAbortController = null;
}

export function showKeyboardShortcutsHelp(shortcuts: Array<{ key: string; description: string }>, isDark: boolean = true): void {
    showKeyboardShortcutsHelpModal({
        shortcuts,
        isDark,
        zIndex: Z_INDEX.dropdown,
        monoFontStack: MONO_FONT_STACK,
    });
}

export function updateToolbarTheme(
    dark: boolean,
    toolbar: HTMLElement,
    actions: HTMLElement,
    searchContainer: HTMLElement
): void {
    const bgColor = dark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const textColor = dark ? '#f1f5f9' : '#1e293b';
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    toolbar.querySelectorAll('div').forEach(el => {
        if (el.style.background?.includes('rgba(17, 17, 17') || el.style.background?.includes('rgba(255, 255, 255')) {
            el.style.background = bgColor;
            el.style.borderColor = borderColor;
        }
    });

    const titleSpan = toolbar.querySelector('span');
    if (titleSpan) {titleSpan.style.color = textColor;}

    // Update dialect select colors
    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement | null;
    if (dialectSelect) {
        dialectSelect.style.background = dark ? '#1e293b' : '#f1f5f9';
        dialectSelect.style.color = textColor;
    }
    const autoDetectIndicator = document.getElementById('dialect-auto-indicator') as HTMLSpanElement | null;
    if (autoDetectIndicator) {
        autoDetectIndicator.style.color = dark ? '#818cf8' : '#4f46e5';
    }

    // Update search input colors
    const searchInput = searchContainer.querySelector('input');
    if (searchInput) {
        searchInput.style.color = textColor;
    }

    searchContainer.style.background = bgColor;
    searchContainer.style.borderColor = borderColor;

    actions.querySelectorAll('div').forEach(el => {
        if (el.style.background?.includes('rgba(17, 17, 17') || el.style.background?.includes('rgba(255, 255, 255')) {
            el.style.background = bgColor;
            el.style.borderColor = borderColor;
        }
    });

    actions.querySelectorAll('button').forEach(btn => {
        btn.style.color = textColor;
    });

    const compareBtn = document.getElementById('compare-mode-btn') as HTMLButtonElement | null;
    if (compareBtn?.dataset.active === 'true') {
        compareBtn.style.background = 'rgba(99, 102, 241, 0.3)';
        compareBtn.style.color = dark ? '#a5b4fc' : '#4f46e5';
    }

    // Update floating dropdown menus
    const theme = getComponentUiColors(dark);
    document.querySelectorAll('.sql-crack-floating-toolbar-menu').forEach(menu => {
        const el = menu as HTMLElement;
        el.style.background = theme.surfaceElevated;
        el.style.borderColor = theme.border;
        el.style.boxShadow = theme.shadow;
        // Update menu item text colors
        el.querySelectorAll<HTMLElement>('div').forEach(child => {
            const c = child.style.color;
            if (c && c !== theme.textDim && c !== theme.accent) {
                // Update non-accent, non-header text to match theme
                if (c === '#e2e8f0' || c === 'rgb(226, 232, 240)' || c === '#1e293b' || c === 'rgb(30, 41, 59)') {
                    child.style.color = theme.textBright;
                }
            }
        });
    });

    applyOverflowMenuTheme(dark);
}

export function updateAutoDetectIndicator(dialect: string | null): void {
    const indicator = document.getElementById('dialect-auto-indicator') as HTMLSpanElement | null;
    if (!indicator) { return; }

    if (!dialect) {
        indicator.textContent = '';
        indicator.style.display = 'none';
        return;
    }

    indicator.textContent = `auto: ${dialect}`;
    indicator.style.display = 'inline-flex';
}

export function updateHintsSummaryBadge(
    state: { status: 'ok' | 'warning' | 'error'; label: string }
): void {
    if (!hintsSummaryBtn) { return; }

    const colors = {
        ok: { text: '#10b981', bg: 'rgba(16, 185, 129, 0.16)', border: 'rgba(16, 185, 129, 0.35)' },
        warning: { text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)', border: 'rgba(245, 158, 11, 0.35)' },
        error: { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.16)', border: 'rgba(239, 68, 68, 0.35)' },
    };
    const palette = colors[state.status];
    hintsSummaryBtn.innerHTML = createHintsBadgeMarkup(state.label);
    hintsSummaryBtn.style.color = palette.text;
    hintsSummaryBtn.style.background = palette.bg;
    hintsSummaryBtn.style.boxShadow = `inset 0 0 0 1px ${palette.border}`;
}

export function markRefreshButtonStale(): void {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.style.background = 'rgba(234, 179, 8, 0.3)';
        refreshBtn.title = 'Query changed - click to refresh';
    }
}

export function clearRefreshButtonStale(): void {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.style.background = 'transparent';
        refreshBtn.title = 'Refresh visualization';
    }
}
