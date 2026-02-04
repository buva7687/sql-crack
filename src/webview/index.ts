// Polyfill for process (required by node-sql-parser)
import process from 'process/browser';
(window as unknown as { process: typeof process }).process = process;

import { parseBatchAsync } from './parserClient';
import { BatchParseResult, LayoutType, SqlDialect } from './types';
import {
    initRenderer,
    render,
    zoomIn,
    zoomOut,
    resetView,
    getZoomLevel,
    getViewState,
    setViewState,
    TabViewState,
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
    updateErrorBadge,
    clearErrorBadge,
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
        flowDirection?: string;
        showDeadColumnHints?: boolean;
        combineDdlStatements?: boolean;
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
let parseRequestId = 0;

// Store view state per query index for zoom/pan persistence
const queryViewStates: Map<number, TabViewState> = new Map();

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

    void visualize(sql);
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
            switchToQueryIndex(index);
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
                switchToQueryIndex(currentQueryIndex - 1);
            }
        }
        // ] for next query
        if (e.key === ']') {
            e.preventDefault();
            if (batchResult && currentQueryIndex < batchResult.queries.length - 1) {
                switchToQueryIndex(currentQueryIndex + 1);
            }
        }
    });

    // Parse and render initial SQL
    const sql = window.initialSqlCode || '';
    if (sql) {
        void visualize(sql);
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
                void visualize(sql);
            }
        },
        onRefresh: () => {
            if (window.vscodeApi) {
                window.vscodeApi.postMessage({ command: 'requestRefresh' });
            } else {
                const sql = window.initialSqlCode || '';
                if (sql) {
                    void visualize(sql);
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

async function visualize(sql: string): Promise<void> {
    const requestId = ++parseRequestId;

    // Clear view states when loading new SQL
    queryViewStates.clear();

    try {
        const result = await parseBatchAsync(
            sql,
            currentDialect,
            undefined,
            {
                combineDdlStatements: window.combineDdlStatements === true
            }
        );
        if (requestId !== parseRequestId) {
            return;
        }
        batchResult = result;
    } catch (error) {
        if (requestId !== parseRequestId) {
            return;
        }
        const message = error instanceof Error ? error.message : 'Failed to parse SQL';
        updateErrorBadge(1, [{ queryIndex: 0, message }]);
        batchResult = {
            queries: [],
            errorCount: 1,
            parseErrors: [{ queryIndex: 0, message, sql: '' }],
            totalStats: {
                tables: 0,
                joins: 0,
                subqueries: 0,
                ctes: 0,
                aggregations: 0,
                windowFunctions: 0,
                unions: 0,
                conditions: 0,
                complexity: 'Simple',
                complexityScore: 0
            }
        };
        return;
    }

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

    // Update error badge in toolbar if there are parse errors
    if (batchResult && batchResult.errorCount && batchResult.errorCount > 0) {
        const errorDetails = batchResult.parseErrors?.map(e => ({
            queryIndex: e.queryIndex,
            message: e.message.length > 100 ? e.message.substring(0, 100) + '...' : e.message
        }));
        updateErrorBadge(batchResult.errorCount, errorDetails);
    } else {
        clearErrorBadge();
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

/**
 * Switch to a different query index, preserving view state
 */
function switchToQueryIndex(newIndex: number): void {
    if (!batchResult || newIndex < 0 || newIndex >= batchResult.queries.length) {
        return;
    }

    // Save current view state before switching
    queryViewStates.set(currentQueryIndex, getViewState());

    // Switch to new query
    currentQueryIndex = newIndex;
    renderCurrentQuery();
    updateBatchTabsUI();

    // Restore view state for the new query if we have one
    const savedState = queryViewStates.get(newIndex);
    if (savedState) {
        // Use requestAnimationFrame to ensure render completes first
        requestAnimationFrame(() => {
            setViewState(savedState);
        });
    }
}

function updateBatchTabsUI(): void {
    updateBatchTabs(batchResult, currentQueryIndex, {
        onQuerySelect: (index: number) => {
            switchToQueryIndex(index);
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
            void visualize(sql);
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
