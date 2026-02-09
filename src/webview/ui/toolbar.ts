// Toolbar UI module

import { SqlDialect } from '../sqlParser';
import { FocusMode, LayoutType } from '../types';
import { createExportDropdown } from './exportDropdown';
import { createLayoutPicker } from './layoutPicker';
import { ICONS } from '../../shared/icons';
import { getComponentUiColors } from '../constants';
import { repositionBreadcrumbBar } from './breadcrumbBar';

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

let hintsSummaryBtn: HTMLButtonElement | null = null;
const HELP_PULSE_STYLE_ID = 'sql-crack-help-pulse-style';
const LINEAGE_PULSE_STYLE_ID = 'sql-crack-lineage-pulse-style';
let lineagePulseApplied = false;

/**
 * Format a timestamp as a relative time string like "5m ago", "2h ago", "3d ago".
 */
function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) { return 'just now'; }
    if (diffMin < 60) { return `${diffMin}m ago`; }
    if (diffHr < 24) { return `${diffHr}h ago`; }
    if (diffDay < 30) { return `${diffDay}d ago`; }
    return `${Math.floor(diffDay / 30)}mo ago`;
}

function getOverflowPalette(dark: boolean): {
    background: string;
    border: string;
    text: string;
    hover: string;
    shadow: string;
} {
    return dark ? {
        background: 'rgba(15, 23, 42, 0.95)',
        border: 'rgba(148, 163, 184, 0.2)',
        text: '#e2e8f0',
        hover: 'rgba(148, 163, 184, 0.2)',
        shadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    } : {
        background: 'rgba(255, 255, 255, 0.98)',
        border: 'rgba(148, 163, 184, 0.3)',
        text: '#1e293b',
        hover: 'rgba(15, 23, 42, 0.06)',
        shadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
    };
}

function isReducedMotionPreferred(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyFirstRunHelpPulse(helpBtn: HTMLButtonElement, enabled: boolean): void {
    if (!enabled || isReducedMotionPreferred()) {
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

function applyOverflowMenuTheme(dark: boolean): void {
    const overflowBtn = document.getElementById('sql-crack-overflow-btn') as HTMLButtonElement | null;
    const overflowDropdown = document.getElementById('sql-crack-overflow-dropdown') as HTMLDivElement | null;
    const palette = getOverflowPalette(dark);

    if (overflowBtn) {
        overflowBtn.style.background = palette.background;
        overflowBtn.style.borderColor = palette.border;
        overflowBtn.style.color = palette.text;
    }

    if (overflowDropdown) {
        overflowDropdown.style.background = dark ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)';
        overflowDropdown.style.borderColor = palette.border;
        overflowDropdown.style.boxShadow = palette.shadow;
        overflowDropdown.querySelectorAll('[data-overflow-row="true"]').forEach((row) => {
            const rowEl = row as HTMLElement;
            rowEl.style.color = palette.text;
        });
    }
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
    options: {
        currentDialect: SqlDialect;
        isPinnedView: boolean;
        pinId: string | null;
        viewLocation: string;
        persistedPinnedTabs: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>;
        isFirstRun: boolean;
    }
): { toolbar: HTMLElement; actions: HTMLElement; searchContainer: HTMLElement; cleanup: ToolbarCleanup } {
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
        z-index: 100;
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
        background: ${isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
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
    const searchContainer = createSearchBox(callbacks);
    toolbar.appendChild(searchContainer);

    // Add toolbar (left side) to wrapper
    toolbarWrapper.appendChild(toolbar);

    // Action buttons (right side) - now inside the wrapper instead of separate absolute
    const actions = createActionButtons(callbacks, options, documentListeners);
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
        });
    }

    // Listen for theme change events
    const themeChangeHandler = ((e: CustomEvent) => {
        const dark = e.detail.dark;
        updateToolbarTheme(dark, toolbar, actions, searchContainer);
        applyOverflowMenuTheme(dark);
    }) as EventListener;
    document.addEventListener('theme-change', themeChangeHandler);
    documentListeners.push({ type: 'theme-change', handler: themeChangeHandler });

    // Cleanup function to remove all document event listeners
    const cleanup: ToolbarCleanup = () => {
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

function createSearchBox(callbacks: ToolbarCallbacks): HTMLElement {
    const dark = callbacks.isDarkTheme();
    const searchContainer = document.createElement('div');
    searchContainer.id = 'search-container';
    searchContainer.style.cssText = `
        background: ${dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'};
        border-radius: 8px;
        padding: 4px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const searchIcon = document.createElement('span');
    searchIcon.textContent = '🔍';
    searchIcon.style.cssText = 'font-size: 12px;';
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

    // Search result count indicator
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

    // Search navigation buttons
    const searchNav = document.createElement('div');
    searchNav.style.cssText = `display: flex; gap: 4px;`;

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
    prevBtn.addEventListener('click', callbacks.onPrevSearchResult);
    searchNav.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '↓';
    nextBtn.style.cssText = prevBtn.style.cssText;
    nextBtn.addEventListener('click', callbacks.onNextSearchResult);
    searchNav.appendChild(nextBtn);

    searchContainer.appendChild(searchNav);

    // Notify callback when search input is ready
    callbacks.onSearchBoxReady(searchInput, searchCount);

    return searchContainer;
}

function createActionButtons(
    callbacks: ToolbarCallbacks,
    options: {
        isPinnedView: boolean;
        pinId: string | null;
        viewLocation: string;
        persistedPinnedTabs: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>;
        isFirstRun: boolean;
    },
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const actions = document.createElement('div');
    actions.id = 'sql-crack-actions';
    actions.style.cssText = `
        display: flex;
        gap: 8px;
        flex-shrink: 0;
        margin-left: auto;
    `;

    // Zoom controls
    actions.appendChild(createZoomGroup(callbacks, documentListeners));

    // Feature buttons
    actions.appendChild(createFeatureGroup(callbacks, options, documentListeners));

    // Export dropdown (consolidated) — placed last so dropdown opens cleanly
    actions.appendChild(createExportGroup(callbacks, documentListeners));

    // Overflow menu container (positioned relative for dropdown)
    const overflowContainer = document.createElement('div');
    overflowContainer.id = 'sql-crack-overflow-container';
    overflowContainer.style.cssText = `
        position: relative;
        display: none;
        flex-shrink: 0;
    `;

    const overflowBtn = document.createElement('button');
    overflowBtn.id = 'sql-crack-overflow-btn';
    overflowBtn.innerHTML = '⋯';
    overflowBtn.title = 'More actions';
    overflowBtn.setAttribute('aria-label', 'More actions');
    overflowBtn.setAttribute('role', 'button');
    overflowBtn.style.cssText = `
        ${getBtnStyle(callbacks.isDarkTheme())}
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        font-size: 18px;
        letter-spacing: 1px;
        line-height: 1;
        padding: 8px 10px;
    `;
    overflowBtn.addEventListener('mouseenter', () => {
        overflowBtn.style.background = getOverflowPalette(callbacks.isDarkTheme()).hover;
    });
    overflowBtn.addEventListener('mouseleave', () => {
        applyOverflowMenuTheme(callbacks.isDarkTheme());
    });

    const overflowDropdown = document.createElement('div');
    overflowDropdown.id = 'sql-crack-overflow-dropdown';
    overflowDropdown.style.cssText = `
        display: none;
        position: fixed;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 8px 0;
        min-width: 200px;
        z-index: 1000;
        box-shadow: none;
    `;

    // Append dropdown to root container so it escapes overflow:hidden clipping
    const rootContainer = document.getElementById('root') || document.body;
    rootContainer.appendChild(overflowDropdown);

    const positionDropdown = () => {
        const rect = overflowBtn.getBoundingClientRect();
        overflowDropdown.style.top = `${rect.bottom + 4}px`;
        overflowDropdown.style.right = `${window.innerWidth - rect.right}px`;
    };

    overflowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = overflowDropdown.style.display === 'none';
        overflowDropdown.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            positionDropdown();
        }
    });

    const overflowClickHandler = () => {
        overflowDropdown.style.display = 'none';
    };
    document.addEventListener('click', overflowClickHandler);
    documentListeners.push({ type: 'click', handler: overflowClickHandler });

    overflowContainer.appendChild(overflowBtn);
    actions.appendChild(overflowContainer);

    return actions;
}

/**
 * Extract only direct text nodes from an element (ignoring child element text).
 */
function getDirectText(el: HTMLElement): string {
    for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            return node.textContent.trim();
        }
    }
    return '';
}

/**
 * Clean up a title for use as a short overflow menu label.
 * Strips keyboard shortcut hints and common verbose prefixes.
 */
function cleanOverflowLabel(title: string): string {
    return title
        .replace(/\s*\([^)]*\)\s*$/, '')   // "(L)", "(S)", "(F)", etc.
        .replace(/^Toggle\s+/i, '')
        .replace(/^Show\s+/i, '')
        .replace(/^Export as\s+/i, 'Export ')
        .trim();
}

/**
 * Collects all individually-hideable buttons from export and feature groups.
 * Returns them in priority order (highest priority first = hidden last).
 */
function collectOverflowableButtons(actions: HTMLElement): Array<{ btn: HTMLElement; label: string; icon: string }> {
    const result: Array<{ btn: HTMLElement; label: string; icon: string }> = [];

    // Children of actions: [zoomGroup, featureGroup, exportGroup, overflowContainer]
    const children = Array.from(actions.children) as HTMLElement[];
    const featureGroup = children[1];
    const exportGroup = children[2];

    if (!exportGroup || !featureGroup) {return result;}

    // Extract icon and label from any toolbar element (button or div container)
    const extractMeta = (el: HTMLElement): { icon: string; label: string } => {
        // Try direct text nodes first (avoids grabbing dropdown/child content)
        let icon = getDirectText(el);
        let title = el.title || '';

        if (!icon) {
            // For containers, look for an inner button or select
            const innerBtn = el.querySelector('button');
            const select = el.querySelector('select');
            if (innerBtn) {
                icon = getDirectText(innerBtn) || innerBtn.innerHTML.trim().slice(0, 3);
                title = title || innerBtn.title || '';
            } else if (select) {
                icon = '📐';
                title = title || 'Layout';
            } else {
                icon = el.textContent?.trim().slice(0, 2) || '';
            }
        }

        const label = cleanOverflowLabel(title) || icon;
        return { icon, label };
    };

    // Feature group items (lower priority - hidden first, right-to-left)
    for (const el of Array.from(featureGroup.children) as HTMLElement[]) {
        // Keep complex popover controls visible; hidden popovers cannot be opened reliably from overflow.
        if (el.dataset.overflowKeepVisible === 'true') {continue;}
        if (el.tagName !== 'BUTTON') {continue;}
        const meta = extractMeta(el);
        result.push({ btn: el, ...meta });
    }

    // Export group buttons (higher priority - hidden after feature group)
    for (const el of Array.from(exportGroup.children) as HTMLElement[]) {
        if (el.dataset.overflowKeepVisible === 'true') {continue;}
        if (el.tagName !== 'BUTTON') {continue;}
        const meta = extractMeta(el);
        result.push({ btn: el, ...meta });
    }

    return result;
}

/**
 * Sets up a ResizeObserver that hides overflowing action buttons
 * and populates the overflow dropdown menu.
 */
function setupOverflowObserver(
    actions: HTMLElement,
    toolbarWrapper: HTMLElement,
    isDarkTheme: () => boolean
): ResizeObserver | null {
    const overflowContainer = actions.querySelector('#sql-crack-overflow-container') as HTMLElement;
    const overflowDropdown = document.getElementById('sql-crack-overflow-dropdown') as HTMLElement;
    if (!overflowContainer || !overflowDropdown) {return null;}

    const allButtons = collectOverflowableButtons(actions);

    // Map from button element to its original display style
    const originalDisplays = new Map<HTMLElement, string>();
    for (const { btn } of allButtons) {
        originalDisplays.set(btn, btn.style.display || '');
    }

    const updateOverflow = () => {
        // First, restore all buttons so we can measure properly
        for (const { btn } of allButtons) {
            btn.style.display = originalDisplays.get(btn) || '';
        }
        overflowContainer.style.display = 'none';
        overflowDropdown.style.display = 'none';

        const wrapperWidth = toolbarWrapper.clientWidth;
        // scrollWidth tells us total content width
        const contentWidth = toolbarWrapper.scrollWidth;

        if (contentWidth <= wrapperWidth) {
            // Everything fits
            return;
        }

        // We need to hide buttons. Hide from the end of the allButtons array
        // (feature group right-to-left first, then export group right-to-left)
        // Show overflow button first so it factors into width calculation
        overflowContainer.style.display = 'flex';

        const hiddenButtons: Array<{ btn: HTMLElement; label: string; icon: string }> = [];

        // Hide buttons from the end (lowest priority) until things fit
        for (let i = allButtons.length - 1; i >= 0; i--) {
            if (toolbarWrapper.scrollWidth <= wrapperWidth) {
                break;
            }
            const item = allButtons[i];
            item.btn.style.display = 'none';
            hiddenButtons.push(item);
        }

        if (hiddenButtons.length === 0) {
            overflowContainer.style.display = 'none';
            return;
        }

        // Populate the overflow dropdown
        overflowDropdown.innerHTML = '';
        const palette = getOverflowPalette(isDarkTheme());

        // Reverse so items appear in natural order (top = first hidden from left)
        hiddenButtons.reverse();

        for (const { btn, label, icon } of hiddenButtons) {
            const row = document.createElement('div');
            row.setAttribute('data-overflow-row', 'true');
            row.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                color: ${palette.text};
                transition: background 0.15s;
                font-size: 12px;
                white-space: nowrap;
            `;

            const iconSpan = document.createElement('span');
            iconSpan.style.cssText = 'font-size: 14px; min-width: 20px; text-align: center;';
            iconSpan.textContent = icon;
            row.appendChild(iconSpan);

            const labelSpan = document.createElement('span');
            labelSpan.textContent = label;
            row.appendChild(labelSpan);

            row.addEventListener('mouseenter', () => {
                row.style.background = getOverflowPalette(isDarkTheme()).hover;
            });
            row.addEventListener('mouseleave', () => row.style.background = 'transparent');

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                overflowDropdown.style.display = 'none';
                // Trigger the original button's click
                btn.click();
            });

            overflowDropdown.appendChild(row);
        }
        applyOverflowMenuTheme(isDarkTheme());
    };

    const observer = new ResizeObserver(() => {
        updateOverflow();
    });
    observer.observe(toolbarWrapper);

    // Run once on init
    requestAnimationFrame(() => updateOverflow());

    return observer;
}

function createZoomGroup(
    callbacks: ToolbarCallbacks,
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const zoomGroup = document.createElement('div');
    zoomGroup.style.cssText = `
        display: flex;
        flex-shrink: 0;
        align-items: center;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        overflow: hidden;
    `;

    const undoBtn = createButton('↶', () => {
        callbacks.onUndo();
    }, 'Undo layout change');
    undoBtn.id = 'sql-crack-undo-btn';
    undoBtn.title = 'Undo (Ctrl/Cmd+Z)';
    undoBtn.style.borderRight = '1px solid rgba(148, 163, 184, 0.2)';
    zoomGroup.appendChild(undoBtn);

    const redoBtn = createButton('↷', () => {
        callbacks.onRedo();
    }, 'Redo layout change');
    redoBtn.id = 'sql-crack-redo-btn';
    redoBtn.title = 'Redo (Ctrl/Cmd+Shift+Z)';
    redoBtn.style.borderRight = '1px solid rgba(148, 163, 184, 0.2)';
    zoomGroup.appendChild(redoBtn);

    const zoomOutBtn = createButton('−', () => {
        callbacks.onZoomOut();
    }, 'Zoom out');
    zoomOutBtn.title = 'Zoom out (-)';
    zoomGroup.appendChild(zoomOutBtn);

    // Zoom level indicator
    const zoomLevel = document.createElement('span');
    zoomLevel.id = 'zoom-level';
    zoomLevel.style.cssText = `
        color: #94a3b8;
        font-size: 10px;
        min-width: 36px;
        text-align: center;
        padding: 0 2px;
        border-left: 1px solid rgba(148, 163, 184, 0.2);
        border-right: 1px solid rgba(148, 163, 184, 0.2);
    `;
    zoomLevel.textContent = `${callbacks.getZoomLevel()}%`;
    zoomLevel.title = 'Current zoom level';
    zoomGroup.appendChild(zoomLevel);

    const zoomInBtn = createButton('+', () => {
        callbacks.onZoomIn();
    }, 'Zoom in');
    zoomInBtn.title = 'Zoom in (+)';
    zoomGroup.appendChild(zoomInBtn);

    const fitBtn = createButton('⊡', () => {
        callbacks.onResetView();
    }, 'Fit to view');
    fitBtn.title = 'Fit to view (R)';
    fitBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    zoomGroup.appendChild(fitBtn);

    const updateUndoRedo = (canUndo: boolean, canRedo: boolean) => {
        undoBtn.disabled = !canUndo;
        redoBtn.disabled = !canRedo;
        undoBtn.style.opacity = canUndo ? '1' : '0.45';
        redoBtn.style.opacity = canRedo ? '1' : '0.45';
        undoBtn.style.cursor = canUndo ? 'pointer' : 'default';
        redoBtn.style.cursor = canRedo ? 'pointer' : 'default';
    };

    updateUndoRedo(callbacks.canUndo(), callbacks.canRedo());

    const undoRedoStateHandler = ((event: CustomEvent) => {
        const detail = event.detail || {};
        updateUndoRedo(Boolean(detail.canUndo), Boolean(detail.canRedo));
    }) as EventListener;
    document.addEventListener('undo-redo-state', undoRedoStateHandler);
    documentListeners.push({ type: 'undo-redo-state', handler: undoRedoStateHandler });

    return zoomGroup;
}

function createExportGroup(
    callbacks: ToolbarCallbacks,
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const isDark = callbacks.isDarkTheme();
    const exportGroup = document.createElement('div');
    exportGroup.style.cssText = `
        display: flex;
        flex-shrink: 0;
        background: ${isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'};
        border-radius: 8px;
        overflow: visible;
    `;

    // Use the consolidated export dropdown
    const exportDropdown = createExportDropdown({
        onExportPng: callbacks.onExportPng,
        onExportSvg: callbacks.onExportSvg,
        onExportMermaid: callbacks.onExportMermaid,
        onCopyToClipboard: callbacks.onCopyToClipboard,
        onCopyMermaidToClipboard: callbacks.onCopyMermaidToClipboard,
        isDarkTheme: callbacks.isDarkTheme,
    }, documentListeners);

    exportGroup.appendChild(exportDropdown);

    return exportGroup;
}

function createFeatureGroup(
    callbacks: ToolbarCallbacks,
    options: {
        isPinnedView: boolean;
        pinId: string | null;
        viewLocation: string;
        persistedPinnedTabs: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>;
        isFirstRun: boolean;
    },
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const featureGroup = document.createElement('div');
    featureGroup.style.cssText = `
        display: flex;
        flex-shrink: 0;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        overflow: hidden;
    `;

    // Refresh button
    const refreshBtn = createButton('↻', callbacks.onRefresh, 'Refresh visualization');
    refreshBtn.id = 'refresh-btn';
    refreshBtn.title = 'Refresh visualization';
    refreshBtn.style.fontSize = '16px';
    featureGroup.appendChild(refreshBtn);

    // Optimization hints summary badge
    hintsSummaryBtn = createButton('⚡ ✓', callbacks.onToggleHints, 'Show optimization hints');
    hintsSummaryBtn.id = 'hints-summary-btn';
    hintsSummaryBtn.title = 'Optimization hints';
    hintsSummaryBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    hintsSummaryBtn.style.fontSize = '12px';
    hintsSummaryBtn.style.fontWeight = '700';
    featureGroup.appendChild(hintsSummaryBtn);

    // Pin/View location buttons for non-pinned views
    if (!options.isPinnedView) {
        // Pin button
        const pinBtn = createButton('📌', () => {
            const { sql, name } = callbacks.getCurrentQuerySql();
            callbacks.onPinVisualization(sql, 'MySQL' as SqlDialect, name);
        }, 'Pin visualization as new tab');
        pinBtn.title = 'Pin visualization as new tab';
        pinBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
        featureGroup.appendChild(pinBtn);

        // View location button with dropdown
        const viewLocBtn = createViewLocationButton(callbacks, options.viewLocation, documentListeners);
        featureGroup.appendChild(viewLocBtn);

        // Pinned tabs button
        if (options.persistedPinnedTabs.length > 0) {
            const pinsBtn = createPinnedTabsButton(callbacks, options.persistedPinnedTabs, documentListeners);
            featureGroup.appendChild(pinsBtn);
        }
    } else {
        // Pinned indicator with unpin button
        const pinnedContainer = document.createElement('div');
        pinnedContainer.style.cssText = `
            display: flex;
            align-items: center;
            border-left: 1px solid rgba(148, 163, 184, 0.2);
        `;

        const pinnedIndicator = document.createElement('span');
        pinnedIndicator.innerHTML = '📌 Pinned';
        pinnedIndicator.style.cssText = `
            color: #94a3b8;
            font-size: 11px;
            padding: 4px 8px;
        `;
        pinnedContainer.appendChild(pinnedIndicator);

        // Add unpin button
        if (options.pinId) {
            const unpinBtn = createButton('×', () => {
                callbacks.onUnpinTab(options.pinId!);
            });
            unpinBtn.title = 'Unpin and close this tab';
            unpinBtn.style.cssText = `
                background: transparent;
                border: none;
                color: #94a3b8;
                padding: 4px 8px;
                cursor: pointer;
                font-size: 16px;
                transition: color 0.2s;
            `;
            unpinBtn.addEventListener('mouseenter', () => unpinBtn.style.color = '#ef4444');
            unpinBtn.addEventListener('mouseleave', () => unpinBtn.style.color = '#94a3b8');
            pinnedContainer.appendChild(unpinBtn);
        }

        featureGroup.appendChild(pinnedContainer);
    }

    const compareBtn = createButton('⇆', () => {
        callbacks.onToggleCompareMode();
    }, 'Compare with baseline query');
    compareBtn.id = 'compare-mode-btn';
    compareBtn.title = 'Compare with baseline query';
    compareBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    const setCompareButtonState = (active: boolean) => {
        compareBtn.dataset.active = active ? 'true' : 'false';
        compareBtn.style.background = active ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
        compareBtn.style.color = active ? '#818cf8' : '';
    };
    setCompareButtonState(callbacks.isCompareMode());
    featureGroup.appendChild(compareBtn);

    const compareStateHandler = ((event: CustomEvent) => {
        setCompareButtonState(Boolean(event.detail?.active));
    }) as EventListener;
    document.addEventListener('compare-mode-state', compareStateHandler);
    documentListeners.push({ type: 'compare-mode-state', handler: compareStateHandler });

    // Focus Mode button
    let focusModeActive = false;
    const focusBtn = createButton('👁', () => {
        focusModeActive = !focusModeActive;
        callbacks.onToggleFocusMode(focusModeActive);
        focusBtn.style.background = focusModeActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
    }, 'Toggle focus mode');
    focusBtn.title = 'Focus mode - highlight connected nodes';
    focusBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(focusBtn);

    // Focus Mode Direction selector
    const focusModeSelector = createFocusModeSelector(callbacks, documentListeners);
    featureGroup.appendChild(focusModeSelector);

    // SQL Preview button
    const sqlBtn = createButton('{ }', callbacks.onToggleSqlPreview, 'Show formatted SQL');
    sqlBtn.title = 'Show formatted SQL (S)';
    sqlBtn.style.fontSize = '11px';
    sqlBtn.style.fontWeight = '700';
    sqlBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(sqlBtn);

    // Column Lineage toggle button (SVG icon, one-time pulse on first activation)
    let columnFlowActive = false;
    const columnFlowBtn = createButton(ICONS.columnLineage, () => {
        columnFlowActive = !columnFlowActive;
        callbacks.onToggleColumnFlows(columnFlowActive);
        columnFlowBtn.style.background = columnFlowActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
        columnFlowBtn.style.color = columnFlowActive ? '#818cf8' : '';
        // One-time pulse on first activation
        if (columnFlowActive && !lineagePulseApplied && !isReducedMotionPreferred()) {
            lineagePulseApplied = true;
            if (!document.getElementById(LINEAGE_PULSE_STYLE_ID)) {
                const style = document.createElement('style');
                style.id = LINEAGE_PULSE_STYLE_ID;
                style.textContent = `
                    .sql-crack-lineage-pulse {
                        animation: sql-crack-help-pulse 1.1s ease-out 2;
                    }
                `;
                document.head.appendChild(style);
            }
            columnFlowBtn.classList.add('sql-crack-lineage-pulse');
            const stop = () => columnFlowBtn.classList.remove('sql-crack-lineage-pulse');
            window.setTimeout(stop, 2400);
        }
    }, 'Toggle column lineage');
    columnFlowBtn.title = 'Toggle column lineage (C)';
    columnFlowBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    columnFlowBtn.style.color = '#94a3b8'; // muted gray when inactive
    featureGroup.appendChild(columnFlowBtn);

    // Theme Toggle button
    const themeBtn = createButton(callbacks.isDarkTheme() ? '◐' : '◑', () => {
        callbacks.onToggleTheme();
        themeBtn.innerHTML = callbacks.isDarkTheme() ? '◐' : '◑';
    }, 'Toggle dark or light theme');
    themeBtn.title = 'Toggle dark/light theme (T)';
    themeBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(themeBtn);

    // Layout picker popover (replaces old <select>)
    const layoutPicker = createLayoutPicker({
        onLayoutChange: callbacks.onLayoutChange,
        getCurrentLayout: callbacks.getCurrentLayout,
        isDarkTheme: callbacks.isDarkTheme,
    }, documentListeners);
    featureGroup.appendChild(layoutPicker);

    // Fullscreen button
    const fullscreenBtn = createButton('⛶', () => {
        callbacks.onToggleFullscreen();
        setTimeout(() => {
            fullscreenBtn.style.background = callbacks.isFullscreen() ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
        }, 50);
    }, 'Toggle fullscreen');
    fullscreenBtn.title = 'Toggle fullscreen (F)';
    fullscreenBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(fullscreenBtn);

    const fullscreenHandler = () => {
        fullscreenBtn.style.background = callbacks.isFullscreen() ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
    };
    document.addEventListener('fullscreenchange', fullscreenHandler);
    documentListeners.push({ type: 'fullscreenchange', handler: fullscreenHandler });

    // Help button
    const helpBtn = createButton('?', () => {
        showKeyboardShortcutsHelp(callbacks.getKeyboardShortcuts(), callbacks.isDarkTheme());
    }, 'Show keyboard shortcuts');
    helpBtn.title = 'Keyboard shortcuts';
    helpBtn.style.fontWeight = '700';
    helpBtn.style.borderLeft = '1px solid rgba(148, 163, 184, 0.2)';
    featureGroup.appendChild(helpBtn);
    applyFirstRunHelpPulse(helpBtn, options.isFirstRun);

    return featureGroup;
}

function createButton(label: string, onClick: () => void, ariaLabel?: string, isDark = true): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.style.cssText = getBtnStyle(isDark);
    btn.addEventListener('click', onClick);
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(148, 163, 184, 0.1)');
    btn.addEventListener('mouseleave', () => {
        if (!btn.style.background.includes('102, 241')) {
            btn.style.background = 'transparent';
        }
    });

    // Accessibility: add aria-label for screen readers
    if (ariaLabel) {
        btn.setAttribute('aria-label', ariaLabel);
    }
    btn.setAttribute('role', 'button');

    return btn;
}

function createFocusModeSelector(
    callbacks: ToolbarCallbacks,
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const container = document.createElement('div');
    container.id = 'focus-mode-selector';
    container.dataset.overflowKeepVisible = 'true';
    container.style.cssText = `display: flex; align-items: center;`;

    const btn = document.createElement('button');
    btn.id = 'focus-mode-btn';
    btn.innerHTML = '⇄';
    btn.title = 'Focus Mode Direction (U/D/A)';
    btn.style.cssText = getBtnStyle(callbacks.isDarkTheme()) + 'border-left: 1px solid rgba(148, 163, 184, 0.2);';

    const dropdown = document.createElement('div');
    dropdown.id = 'focus-mode-dropdown';
    dropdown.className = 'sql-crack-floating-toolbar-menu';
    dropdown.style.cssText = `
        display: none;
        position: fixed;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 0;
        min-width: 180px;
        z-index: 11000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    const modes: Array<{ id: FocusMode; label: string; icon: string; shortcut: string }> = [
        { id: 'all', label: 'All Connected', icon: '⇄', shortcut: 'A' },
        { id: 'upstream', label: 'Upstream Only', icon: '↑', shortcut: 'U' },
        { id: 'downstream', label: 'Downstream Only', icon: '↓', shortcut: 'D' }
    ];

    const header = document.createElement('div');
    header.textContent = 'Focus Direction';
    header.style.cssText = `
        padding: 4px 12px 8px;
        font-size: 10px;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.5px;
    `;
    dropdown.appendChild(header);

    modes.forEach(mode => {
        const item = document.createElement('div');
        const isActive = callbacks.getFocusMode() === mode.id;
        item.dataset.mode = mode.id;
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: ${isActive ? '#818cf8' : (callbacks.isDarkTheme() ? '#e2e8f0' : '#1e293b')};
            background: ${isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent'};
            transition: background 0.15s;
        `;

        item.innerHTML = `
            <span style="font-size: 14px;">${mode.icon}</span>
            <div style="flex: 1;">
                <div style="font-size: 12px; font-weight: 500;">${mode.label}</div>
            </div>
            <kbd style="
                background: rgba(99, 102, 241, 0.2);
                border-radius: 3px;
                padding: 2px 6px;
                font-size: 10px;
                color: #a5b4fc;
            ">${mode.shortcut}</kbd>
            ${isActive ? '<span style="color: #818cf8;">✓</span>' : ''}
        `;

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onFocusModeChange(mode.id);
            dropdown.style.display = 'none';
            btn.innerHTML = mode.icon;
            updateFocusModeDropdown(dropdown, mode.id, callbacks.isDarkTheme());
        });

        item.addEventListener('mouseenter', () => {
            if (callbacks.getFocusMode() !== mode.id) {
                item.style.background = 'rgba(148, 163, 184, 0.1)';
            }
        });
        item.addEventListener('mouseleave', () => {
            if (callbacks.getFocusMode() !== mode.id) {
                item.style.background = 'transparent';
            }
        });

        dropdown.appendChild(item);
    });

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = dropdown.style.display === 'none';
        if (isHidden) {
            const rect = btn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
            dropdown.style.left = 'auto';
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    });

    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(148, 163, 184, 0.1)');
    btn.addEventListener('mouseleave', () => {
        if (dropdown.style.display !== 'block') {
            btn.style.background = 'transparent';
        }
    });

    const focusModeClickHandler = () => {
        dropdown.style.display = 'none';
    };
    document.addEventListener('click', focusModeClickHandler);
    documentListeners.push({ type: 'click', handler: focusModeClickHandler });

    const focusModeResizeHandler = () => {
        if (dropdown.style.display === 'block') {
            const rect = btn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
        }
    };
    window.addEventListener('resize', focusModeResizeHandler);
    documentListeners.push({ type: 'resize', handler: focusModeResizeHandler as EventListener });

    container.appendChild(btn);
    document.body.appendChild(dropdown);
    return container;
}

function updateFocusModeDropdown(dropdown: HTMLElement, activeMode: FocusMode, isDark = true): void {
    dropdown.querySelectorAll('[data-mode]').forEach(item => {
        const mode = item.getAttribute('data-mode') as FocusMode;
        const isActive = mode === activeMode;
        (item as HTMLElement).style.color = isActive ? '#818cf8' : (isDark ? '#e2e8f0' : '#1e293b');
        (item as HTMLElement).style.background = isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent';

        // Update checkmark
        const existingCheck = item.querySelector('span:last-child');
        if (existingCheck && existingCheck.textContent === '✓') {
            existingCheck.remove();
        }
        if (isActive) {
            const check = document.createElement('span');
            check.style.color = '#818cf8';
            check.textContent = '✓';
            item.appendChild(check);
        }
    });
}

function createViewLocationButton(
    callbacks: ToolbarCallbacks,
    currentLocation: string,
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const viewLocBtn = document.createElement('button');
    viewLocBtn.id = 'view-location-btn';
    viewLocBtn.dataset.overflowKeepVisible = 'true';
    viewLocBtn.innerHTML = '⊞';
    viewLocBtn.title = 'Change view location';
    viewLocBtn.style.cssText = getBtnStyle(callbacks.isDarkTheme()) + 'border-left: 1px solid rgba(148, 163, 184, 0.2);';

    const dropdown = createViewLocationDropdown(callbacks, currentLocation);
    document.body.appendChild(dropdown);

    viewLocBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = dropdown.style.display === 'none';
        if (isHidden) {
            const rect = viewLocBtn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
            dropdown.style.left = 'auto';
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    });

    const viewLocClickHandler = () => {
        dropdown.style.display = 'none';
    };
    document.addEventListener('click', viewLocClickHandler);
    documentListeners.push({ type: 'click', handler: viewLocClickHandler });

    const viewLocResizeHandler = () => {
        if (dropdown.style.display === 'block') {
            const rect = viewLocBtn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
        }
    };
    window.addEventListener('resize', viewLocResizeHandler);
    documentListeners.push({ type: 'resize', handler: viewLocResizeHandler as EventListener });

    viewLocBtn.addEventListener('mouseenter', () => viewLocBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    viewLocBtn.addEventListener('mouseleave', () => {
        if (dropdown.style.display !== 'block') {
            viewLocBtn.style.background = 'transparent';
        }
    });

    return viewLocBtn;
}

function createViewLocationDropdown(callbacks: ToolbarCallbacks, currentLocation: string): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.id = 'view-location-dropdown';
    dropdown.className = 'sql-crack-floating-toolbar-menu';
    dropdown.style.cssText = `
        display: none;
        position: fixed;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 0;
        min-width: 180px;
        z-index: 11000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    const locations = [
        { id: 'beside', label: 'Side by Side', icon: '⫝', desc: 'Next to SQL file' },
        { id: 'tab', label: 'New Tab', icon: '⊟', desc: 'As editor tab' }
    ];

    const header = document.createElement('div');
    header.textContent = 'View Location';
    header.style.cssText = `
        padding: 4px 12px 8px;
        font-size: 10px;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.5px;
    `;
    dropdown.appendChild(header);

    locations.forEach(loc => {
        const item = document.createElement('div');
        const isActive = currentLocation === loc.id;
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: ${isActive ? '#818cf8' : (callbacks.isDarkTheme() ? '#e2e8f0' : '#1e293b')};
            background: ${isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent'};
            transition: background 0.15s;
        `;

        item.innerHTML = `
            <span style="font-size: 14px;">${loc.icon}</span>
            <div>
                <div style="font-size: 12px; font-weight: 500;">${loc.label}</div>
                <div style="font-size: 10px; color: #64748b;">${loc.desc}</div>
            </div>
            ${isActive ? '<span style="margin-left: auto; color: #818cf8;">✓</span>' : ''}
        `;

        item.addEventListener('mouseenter', () => {
            if (!isActive) {item.style.background = 'rgba(148, 163, 184, 0.1)';}
        });
        item.addEventListener('mouseleave', () => {
            if (!isActive) {item.style.background = 'transparent';}
        });

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onChangeViewLocation(loc.id);
            dropdown.style.display = 'none';
        });

        dropdown.appendChild(item);
    });

    return dropdown;
}

function createPinnedTabsButton(
    callbacks: ToolbarCallbacks,
    pins: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>,
    documentListeners: Array<{ type: string; handler: EventListener }>
): HTMLElement {
    const pinsBtn = document.createElement('button');
    pinsBtn.id = 'pinned-tabs-btn';
    pinsBtn.dataset.overflowKeepVisible = 'true';
    pinsBtn.innerHTML = '📋';
    pinsBtn.title = `Open pinned tabs (${pins.length})`;
    pinsBtn.style.cssText = getBtnStyle(callbacks.isDarkTheme()) + 'border-left: 1px solid rgba(148, 163, 184, 0.2);';

    const dropdown = createPinnedTabsDropdown(callbacks, pins);
    document.body.appendChild(dropdown);

    pinsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = dropdown.style.display === 'none';
        if (isHidden) {
            const rect = pinsBtn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
            dropdown.style.left = 'auto';
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    });

    const pinnedTabsClickHandler = () => {
        dropdown.style.display = 'none';
    };
    document.addEventListener('click', pinnedTabsClickHandler);
    documentListeners.push({ type: 'click', handler: pinnedTabsClickHandler });

    const pinnedTabsResizeHandler = () => {
        if (dropdown.style.display === 'block') {
            const rect = pinsBtn.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
        }
    };
    window.addEventListener('resize', pinnedTabsResizeHandler);
    documentListeners.push({ type: 'resize', handler: pinnedTabsResizeHandler as EventListener });

    pinsBtn.addEventListener('mouseenter', () => pinsBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    pinsBtn.addEventListener('mouseleave', () => {
        if (dropdown.style.display !== 'block') {
            pinsBtn.style.background = 'transparent';
        }
    });

    return pinsBtn;
}

function createPinnedTabsDropdown(
    callbacks: ToolbarCallbacks,
    pins: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>
): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.id = 'pinned-tabs-dropdown';
    dropdown.className = 'sql-crack-floating-toolbar-menu';
    dropdown.style.cssText = `
        display: none;
        position: fixed;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 0;
        min-width: 220px;
        max-height: 300px;
        overflow-y: auto;
        z-index: 11000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

    const header = document.createElement('div');
    header.textContent = 'Pinned Visualizations';
    header.style.cssText = `
        padding: 4px 12px 8px;
        font-size: 10px;
        text-transform: uppercase;
        color: #64748b;
        letter-spacing: 0.5px;
    `;
    dropdown.appendChild(header);

    pins.forEach(pin => {
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: ${callbacks.isDarkTheme() ? '#e2e8f0' : '#1e293b'};
            transition: background 0.15s;
        `;

        const date = new Date(pin.timestamp);
        const absoluteTimeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const relativeTimeStr = formatRelativeTime(pin.timestamp);

        item.innerHTML = `
            <span style="font-size: 12px;">📌</span>
            <div style="flex: 1; overflow: hidden;">
                <div style="font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pin.name}</div>
                <div style="font-size: 10px; color: #64748b;">${pin.dialect} • <span title="${absoluteTimeStr}">${relativeTimeStr}</span></div>
            </div>
        `;

        const deleteBtn = document.createElement('span');
        deleteBtn.innerHTML = '×';
        deleteBtn.style.cssText = `font-size: 16px; color: #64748b; padding: 0 4px; cursor: pointer;`;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onUnpinTab(pin.id);
            item.remove();
        });
        deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.color = '#ef4444');
        deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.color = '#64748b');
        item.appendChild(deleteBtn);

        item.addEventListener('mouseenter', () => item.style.background = 'rgba(148, 163, 184, 0.1)');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onOpenPinnedTab(pin.id);
            dropdown.style.display = 'none';
        });

        dropdown.appendChild(item);
    });

    return dropdown;
}

export function showKeyboardShortcutsHelp(shortcuts: Array<{ key: string; description: string }>, isDark: boolean = true): void {
    // Store the element that had focus before opening modal
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Theme-aware colors
    const overlayBg = isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.4)';
    const modalBg = isDark ? 'rgba(17, 17, 17, 0.98)' : 'rgba(255, 255, 255, 0.98)';
    const modalBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)';
    const titleColor = isDark ? '#f1f5f9' : '#1e293b';
    const descColor = isDark ? '#94a3b8' : '#64748b';
    const closeBtnColor = isDark ? '#94a3b8' : '#64748b';
    const closeBtnHoverColor = isDark ? '#f1f5f9' : '#1e293b';
    const closeBtnHoverBg = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)';
    const rowBorder = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.06)';
    const kbdBg = isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)';
    const kbdBorder = isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)';
    const kbdColor = isDark ? '#a5b4fc' : '#6366f1';

    const overlay = document.createElement('div');
    overlay.id = 'shortcuts-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'shortcuts-title');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: ${overlayBg};
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: ${modalBg};
        border: 1px solid ${modalBorder};
        border-radius: 12px;
        padding: 24px;
        min-width: 500px;
        max-width: 600px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        backdrop-filter: blur(8px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, ${isDark ? '0.4' : '0.15'});
    `;

    // Split shortcuts into two columns
    const midpoint = Math.ceil(shortcuts.length / 2);
    const leftColumn = shortcuts.slice(0, midpoint);
    const rightColumn = shortcuts.slice(midpoint);

    const renderShortcut = (s: { key: string; description: string }) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid ${rowBorder};">
            <span style="color: ${descColor}; font-size: 12px;">${s.description}</span>
            <kbd style="
                background: ${kbdBg};
                border: 1px solid ${kbdBorder};
                border-radius: 4px;
                padding: 3px 6px;
                color: ${kbdColor};
                font-size: 10px;
                font-family: monospace;
                margin-left: 8px;
                white-space: nowrap;
            ">${s.key}</kbd>
        </div>
    `;

    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 id="shortcuts-title" style="margin: 0; color: ${titleColor}; font-size: 15px;">Keyboard Shortcuts</h3>
            <button id="close-shortcuts" aria-label="Close dialog" style="
                background: none;
                border: none;
                color: ${closeBtnColor};
                cursor: pointer;
                font-size: 20px;
                padding: 4px 8px;
                border-radius: 4px;
                transition: all 0.15s;
            ">&times;</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px;">
            <div style="display: flex; flex-direction: column;">
                ${leftColumn.map(renderShortcut).join('')}
            </div>
            <div style="display: flex; flex-direction: column;">
                ${rightColumn.map(renderShortcut).join('')}
            </div>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeBtn = modal.querySelector('#close-shortcuts') as HTMLButtonElement;

    // Close modal and restore focus
    const closeModal = () => {
        document.removeEventListener('keydown', keyHandler);
        overlay.remove();
        // Restore focus to previously focused element
        if (previouslyFocused && previouslyFocused.focus) {
            previouslyFocused.focus();
        }
    };

    // Click outside to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closeModal(); }
    });

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = closeBtnHoverBg;
            closeBtn.style.color = closeBtnHoverColor;
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'none';
            closeBtn.style.color = closeBtnColor;
        });
    }

    // Keyboard handler for Escape and focus trap
    const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
        } else if (e.key === 'Tab') {
            // Focus trap - keep focus within modal
            // Since we only have one focusable element (close button), just prevent Tab from leaving
            e.preventDefault();
            closeBtn?.focus();
        }
    };
    document.addEventListener('keydown', keyHandler);

    // Focus the close button when modal opens
    requestAnimationFrame(() => {
        closeBtn?.focus();
    });
}

export function updateToolbarTheme(
    dark: boolean,
    toolbar: HTMLElement,
    actions: HTMLElement,
    searchContainer: HTMLElement
): void {
    const bgColor = dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const textColor = dark ? '#f1f5f9' : '#1e293b';
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    toolbar.querySelectorAll('div').forEach(el => {
        if (el.style.background?.includes('rgba(15, 23, 42') || el.style.background?.includes('rgba(255, 255, 255')) {
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
        if (el.style.background?.includes('rgba(15, 23, 42') || el.style.background?.includes('rgba(255, 255, 255')) {
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
    hintsSummaryBtn.textContent = `⚡ ${state.label}`;
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

// ============================================================
// Error Badge - Shows parse error count in toolbar
// ============================================================

/**
 * Update or hide the error notification badge in the toolbar
 * Shows number of failed queries when errors exist
 */
let errorBadgeClickCallback: ((queryIndex: number) => void) | null = null;
let errorCycleIndex = 0;
let currentBadgeErrors: Array<{ queryIndex: number; message: string; line?: number }> = [];

/**
 * Register a callback for when the error badge is clicked.
 * Cycles through error query indices on each click.
 */
export function setErrorBadgeClickHandler(callback: (queryIndex: number) => void): void {
    errorBadgeClickCallback = callback;
}

export function updateErrorBadge(errorCount: number, errors?: Array<{ queryIndex: number; message: string; line?: number }>): void {
    const existingBadge = document.getElementById('sql-crack-error-badge');

    if (errorCount === 0) {
        // Remove badge if no errors
        if (existingBadge) {
            existingBadge.remove();
        }
        return;
    }

    // Store current errors for click handler and reset cycle
    currentBadgeErrors = errors || [];
    errorCycleIndex = 0;

    // Create or update badge
    // Position below the toolbar row to avoid overlap with batch tabs
    let badge = existingBadge;
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'sql-crack-error-badge';
        badge.style.cssText = `
            position: absolute;
            top: 56px;
            left: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            padding: 6px 12px;
            z-index: 101;
            cursor: pointer;
            transition: background 0.2s;
        `;
        badge.addEventListener('mouseenter', () => {
            badge!.style.background = 'rgba(239, 68, 68, 0.25)';
        });
        badge.addEventListener('mouseleave', () => {
            badge!.style.background = 'rgba(239, 68, 68, 0.15)';
        });

        // Click to cycle through errors
        badge.addEventListener('click', () => {
            if (currentBadgeErrors.length > 0 && errorBadgeClickCallback) {
                errorBadgeClickCallback(currentBadgeErrors[errorCycleIndex % currentBadgeErrors.length].queryIndex);
                errorCycleIndex = (errorCycleIndex + 1) % currentBadgeErrors.length;
            }
        });

        // Insert into root container
        const container = document.getElementById('root');
        if (container) {
            container.appendChild(badge);
        }
    }

    // Build tooltip content — include line numbers when available
    const tooltipText = errors?.map(e => {
        const prefix = e.line ? `Q${e.queryIndex + 1} (line ${e.line})` : `Q${e.queryIndex + 1}`;
        return `${prefix}: ${e.message}`;
    }).join('\n') ||
        `${errorCount} query${errorCount > 1 ? 'ies' : ''} failed to parse`;

    badge.innerHTML = `
        <span style="color: #f87171; font-size: 14px;">⚠</span>
        <span style="color: #fca5a5; font-size: 12px; font-weight: 500;">
            ${errorCount} parse error${errorCount > 1 ? 's' : ''}
        </span>
    `;
    badge.title = tooltipText;
    requestAnimationFrame(() => repositionBreadcrumbBar());
}

/**
 * Clear the error badge from the toolbar
 */
export function clearErrorBadge(): void {
    const badge = document.getElementById('sql-crack-error-badge');
    if (badge) {
        badge.remove();
        repositionBreadcrumbBar();
    }
}
