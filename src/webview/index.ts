// Polyfill for process (required by node-sql-parser)
import process from 'process/browser';
(window as unknown as { process: typeof process }).process = process;

import { parseSqlBatch, SqlDialect, BatchParseResult } from './sqlParser';
import { LayoutType } from './types';
import {
    initRenderer,
    render,
    zoomIn,
    zoomOut,
    resetView,
    getZoomLevel,
    exportToPng,
    exportToSvg,
    exportToMermaid,
    copyToClipboard,
    setSearchBox,
    nextSearchResult,
    prevSearchResult,
    toggleLegend,
    toggleFocusMode,
    setFocusMode,
    getFocusMode,
    toggleSqlPreview,
    toggleColumnFlows,
    toggleFullscreen,
    toggleLayout,
    switchLayout,
    getCurrentLayout,
    isFullscreen,
    toggleTheme,
    isDarkTheme,
    getKeyboardShortcuts,
    highlightNodeAtLine
} from './renderer';

import {
    createToolbar,
    markRefreshButtonStale,
    clearRefreshButtonStale,
    createBatchTabs,
    updateBatchTabs,
    findPinnedTab,
    switchToTab,
    getActiveTabId,
    setActiveTabId,
    ToolbarCallbacks,
    ToolbarCleanup
} from './ui';

// Global type declarations
declare global {
    interface Window {
        initialSqlCode: string;
        vscodeTheme?: string;
        defaultDialect?: string;
        fileName?: string;
        isPinnedView?: boolean;
        pinId?: string | null;
        viewLocation?: string;
        defaultLayout?: string;
        showDeadColumnHints?: boolean;
        persistedPinnedTabs?: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>;
        vscodeApi?: {
            postMessage: (message: any) => void;
        };
    }
}

// Current state
let currentDialect: SqlDialect = (window.defaultDialect as SqlDialect) || 'MySQL';
let batchResult: BatchParseResult | null = null;
let currentQueryIndex = 0;
let isStale: boolean = false;
let toolbarCleanup: ToolbarCleanup | null = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
    setupVSCodeMessageListener();
});

// ============================================================
// VS Code Message Handling
// ============================================================

function setupVSCodeMessageListener(): void {
    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
            case 'refresh':
                handleRefresh(message.sql, message.options);
                break;
            case 'cursorPosition':
                highlightNodeAtLine(message.line);
                break;
            case 'switchToQuery':
                handleSwitchToQuery(message.queryIndex);
                break;
            case 'markStale':
                markAsStale();
                break;
        }
    });
}

function handleRefresh(sql: string, options: { dialect: string; fileName: string }): void {
    window.initialSqlCode = sql;
    currentDialect = options.dialect as SqlDialect;

    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement;
    if (dialectSelect) {
        dialectSelect.value = currentDialect;
    }

    visualize(sql);
    clearStaleIndicator();
}

function handleSwitchToQuery(queryIndex: number): void {
    if (!batchResult || queryIndex < 0 || queryIndex >= batchResult.queries.length) {
        return;
    }

    if (currentQueryIndex !== queryIndex) {
        currentQueryIndex = queryIndex;
        renderCurrentQuery();
        updateBatchTabsUI();
    }
}

function markAsStale(): void {
    isStale = true;
    markRefreshButtonStale();
}

function clearStaleIndicator(): void {
    isStale = false;
    clearRefreshButtonStale();
}

// ============================================================
// Initialization
// ============================================================

function init(): void {
    const container = document.getElementById('root');
    if (!container) { return; }

    // Setup container styles
    container.style.cssText = `
        width: 100%;
        height: 100vh;
        position: relative;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Initialize SVG renderer
    initRenderer(container);

    // Create toolbar with callbacks
    const toolbarResult = createToolbar(container, createToolbarCallbacks(), {
        currentDialect,
        isPinnedView: window.isPinnedView || false,
        pinId: window.pinId || null,
        viewLocation: window.viewLocation || 'beside',
        persistedPinnedTabs: window.persistedPinnedTabs || []
    });
    toolbarCleanup = toolbarResult.cleanup;

    // Create batch tabs
    createBatchTabs(container, {
        onQuerySelect: (index: number) => {
            currentQueryIndex = index;
            renderCurrentQuery();
            updateBatchTabsUI();
        },
        isDarkTheme
    });

    // Keyboard shortcuts for query navigation
    document.addEventListener('keydown', (e) => {
        // Don't trigger when typing in input fields
        const isInputFocused = document.activeElement?.tagName === 'INPUT' ||
                               document.activeElement?.tagName === 'TEXTAREA';
        if (isInputFocused) { return; }

        // Skip if modifier keys are pressed (except for these shortcuts)
        if (e.metaKey || e.ctrlKey || e.altKey) { return; }

        // [ for previous query
        if (e.key === '[') {
            e.preventDefault();
            if (batchResult && currentQueryIndex > 0) {
                currentQueryIndex--;
                renderCurrentQuery();
                updateBatchTabsUI();
            }
        }
        // ] for next query
        if (e.key === ']') {
            e.preventDefault();
            if (batchResult && currentQueryIndex < batchResult.queries.length - 1) {
                currentQueryIndex++;
                renderCurrentQuery();
                updateBatchTabsUI();
            }
        }
    });

    // Parse and render initial SQL
    const sql = window.initialSqlCode || '';
    if (sql) {
        visualize(sql);
    }
}

function createToolbarCallbacks(): ToolbarCallbacks {
    return {
        onZoomIn: zoomIn,
        onZoomOut: zoomOut,
        onResetView: resetView,
        getZoomLevel: getZoomLevel,
        onExportPng: exportToPng,
        onExportSvg: exportToSvg,
        onExportMermaid: exportToMermaid,
        onCopyToClipboard: copyToClipboard,
        onToggleLegend: toggleLegend,
        onToggleFocusMode: toggleFocusMode,
        onFocusModeChange: setFocusMode,
        getFocusMode: getFocusMode,
        onToggleSqlPreview: toggleSqlPreview,
        onToggleColumnFlows: toggleColumnFlows,
        onToggleLayout: toggleLayout,
        onLayoutChange: (layout: LayoutType) => {
            switchLayout(layout);
        },
        getCurrentLayout: getCurrentLayout,
        onToggleTheme: toggleTheme,
        onToggleFullscreen: toggleFullscreen,
        onSearchBoxReady: setSearchBox,
        onNextSearchResult: nextSearchResult,
        onPrevSearchResult: prevSearchResult,
        onDialectChange: (dialect: SqlDialect) => {
            currentDialect = dialect;
            const sql = window.initialSqlCode || '';
            if (sql) {
                visualize(sql);
            }
        },
        onRefresh: () => {
            if (window.vscodeApi) {
                window.vscodeApi.postMessage({ command: 'requestRefresh' });
            } else {
                const sql = window.initialSqlCode || '';
                if (sql) {
                    visualize(sql);
                    clearStaleIndicator();
                }
            }
        },
        onPinVisualization: (sql: string, dialect: SqlDialect, name: string) => {
            if (window.vscodeApi) {
                const { sql: querySql, name: queryName } = getCurrentQuerySql();
                window.vscodeApi.postMessage({
                    command: 'pinVisualization',
                    sql: querySql,
                    dialect: currentDialect,
                    name: queryName
                });
            }
        },
        onChangeViewLocation: (location: string) => {
            if (window.vscodeApi) {
                window.vscodeApi.postMessage({
                    command: 'changeViewLocation',
                    location
                });
            }
        },
        onOpenPinnedTab: (pinId: string) => {
            if (window.vscodeApi) {
                window.vscodeApi.postMessage({
                    command: 'openPinnedTab',
                    pinId
                });
            }
        },
        onUnpinTab: (pinId: string) => {
            if (window.vscodeApi) {
                window.vscodeApi.postMessage({
                    command: 'unpinTab',
                    pinId
                });
            }
        },
        isDarkTheme,
        isFullscreen,
        getKeyboardShortcuts,
        getCurrentQuerySql
    };
}

// ============================================================
// Query Visualization
// ============================================================

function visualize(sql: string): void {
    batchResult = parseSqlBatch(sql, currentDialect);

    // Filter out dead column hints/warnings if the setting is disabled
    // This addresses false positives where columns are used by the application layer
    if (window.showDeadColumnHints === false && batchResult) {
        batchResult.queries.forEach(query => {
            // Filter hints
            query.hints = query.hints.filter(h =>
                !h.message.toLowerCase().includes('dead column')
            );
            // Filter node warnings
            query.nodes.forEach(node => {
                if (node.warnings) {
                    node.warnings = node.warnings.filter(w => w.type !== 'dead-column');
                }
            });
        });
    }

    currentQueryIndex = 0;
    updateBatchTabsUI();
    renderCurrentQuery();
}

function renderCurrentQuery(): void {
    if (!batchResult || batchResult.queries.length === 0) { return; }

    const query = batchResult.queries[currentQueryIndex];
    render(query);
}

function updateBatchTabsUI(): void {
    updateBatchTabs(batchResult, currentQueryIndex, {
        onQuerySelect: (index: number) => {
            currentQueryIndex = index;
            renderCurrentQuery();
            updateBatchTabsUI();
        },
        isDarkTheme
    });
}

function getCurrentQuerySql(): { sql: string; name: string } {
    let sqlToPin = window.initialSqlCode || '';
    let queryName = window.fileName || 'Query';

    if (batchResult && batchResult.queries.length > 1) {
        const currentQuery = batchResult.queries[currentQueryIndex];
        if (currentQuery && currentQuery.sql) {
            sqlToPin = currentQuery.sql;
            queryName = `${(window.fileName || 'Query').replace('.sql', '')} Q${currentQueryIndex + 1}`;
        }
    } else if (batchResult && batchResult.queries.length === 1) {
        const currentQuery = batchResult.queries[0];
        if (currentQuery && currentQuery.sql) {
            sqlToPin = currentQuery.sql;
        }
    }

    return { sql: sqlToPin, name: queryName };
}

// ============================================================
// Legacy Pinned Tabs (in-panel)
// ============================================================

function handlePinnedTabSwitch(tabId: string | null): void {
    setActiveTabId(tabId);

    if (tabId === null) {
        const sql = window.initialSqlCode || '';
        if (sql) {
            visualize(sql);
        }
    } else {
        const tab = findPinnedTab(tabId);
        if (tab && tab.result) {
            currentDialect = tab.dialect;
            batchResult = tab.result;
            currentQueryIndex = 0;
            renderCurrentQuery();

            const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement;
            if (dialectSelect) {
                dialectSelect.value = currentDialect;
            }
        }
    }
}
