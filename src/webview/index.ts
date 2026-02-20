// Polyfill for process (required by node-sql-parser)
import process from 'process/browser';
(window as unknown as { process: typeof process }).process = process;

import { parseAsync, parseBatchAsync } from './parserClient';
import { setMinimapMode, MinimapMode } from './minimapVisibility';
import { detectDialect, setParseTimeout } from './sqlParser';
import { BatchParseResult, LayoutType, ParseError, QueryLineRange, SqlDialect } from './types';
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
    undoLayoutChange,
    redoLayoutChange,
    canUndoLayoutChanges,
    canRedoLayoutChanges,
    clearUndoHistory,
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
    toggleHints,
    toggleFullscreen,
    toggleLayout,
    switchLayout,
    getCurrentLayout,
    isFullscreen,
    toggleTheme,
    isDarkTheme,
    getKeyboardShortcuts,
    highlightNodeAtLine,
    copyMermaidToClipboard,
    setColorblindMode as setRendererColorblindMode,
} from './renderer';
import type { ColorblindMode } from '../shared/theme';

import {
    createToolbar,
    markRefreshButtonStale,
    clearRefreshButtonStale,
    updateErrorBadge,
    clearErrorBadge,
    updateAutoDetectIndicator,
    setErrorBadgeClickHandler,
    createBatchTabs,
    updateBatchTabs,
    getScopedAdjacentQueryIndex,
    switchToTab,
    getActiveTabId,
    showFirstRunOverlay,
    showCompareView,
    hideCompareView,
    isCompareViewActive,
    ToolbarCallbacks,
    ToolbarCleanup
} from './ui';

// Global type declarations
declare global {
    interface Window {
        initialSqlCode: string;
        vscodeTheme?: string;
        isHighContrast?: boolean;
        defaultDialect?: string;
        fileName?: string;
        isPinnedView?: boolean;
        pinId?: string | null;
        viewLocation?: string;
        defaultLayout?: string;
        flowDirection?: string;
        showDeadColumnHints?: boolean;
        combineDdlStatements?: boolean;
        gridStyle?: string;
        nodeAccentPosition?: string;
        showMinimap?: string;
        colorblindMode?: ColorblindMode;
        maxFileSizeKB?: number;
        maxStatements?: number;
        parseTimeoutSeconds?: number;
        isFirstRun?: boolean;
        persistedPinnedTabs?: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number }>;
        debugLogging?: boolean;
        vscodeApi?: {
            postMessage: (message: any) => void;
        };
    }
}

/** Debug log helper - only outputs when debugLogging is enabled */
function debugLog(...args: unknown[]): void {
    if (window.debugLogging) {
        debugLog(...args);
    }
}

// Current state
let currentDialect: SqlDialect = (window.defaultDialect as SqlDialect) || 'MySQL';
let batchResult: BatchParseResult | null = null;
let currentQueryIndex = 0;
let isStale: boolean = false;
let toolbarCleanup: ToolbarCleanup | null = null;
let parseRequestId = 0;
let userExplicitlySetDialect = false;
let compareModeActive = false;

// Store view state per query index for zoom/pan persistence
const queryViewStates: Map<number, TabViewState> = new Map();

function truncateSourceLine(line: string, maxLength = 120): string {
    return line.length > maxLength ? `${line.substring(0, maxLength)}...` : line;
}

function extractSourceLineFromParseError(parseError: ParseError, lineRange?: QueryLineRange): string | undefined {
    if (!parseError.sql) {
        return undefined;
    }

    const lines = parseError.sql.split('\n');
    const candidateLines: number[] = [];

    if (Number.isFinite(parseError.line)) {
        const errorLine = parseError.line as number;
        candidateLines.push(errorLine);

        // parseSqlBatch offsets to absolute file lines; convert to statement-relative when possible.
        if (lineRange?.startLine && lineRange.startLine > 0) {
            candidateLines.push(errorLine - lineRange.startLine + 1);
        }
    }

    for (const candidate of candidateLines) {
        if (candidate >= 1 && candidate <= lines.length) {
            const raw = lines[candidate - 1]?.trim();
            if (raw) {
                return truncateSourceLine(raw);
            }
        }
    }

    const firstNonEmpty = lines.find(line => line.trim().length > 0)?.trim();
    return firstNonEmpty ? truncateSourceLine(firstNonEmpty) : undefined;
}

// Initialize when DOM is ready (guard against cached webview where DOMContentLoaded already fired)
function setup(): void {
    init();
    setupVSCodeMessageListener();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
} else {
    setup();
}

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
            case 'viewLocationOptions':
                // Response from extension with current view location and pinned tabs
                // Currently informational — the toolbar reads initial location from options
                break;
            case 'pinCreated':
                // Confirmation that a pinned panel was created
                // The extension already shows a toast via showInformationMessage
                break;
        }
    });
}

function handleRefresh(sql: string, options: { dialect: string; fileName: string }): void {
    window.initialSqlCode = sql;
    currentDialect = options.dialect as SqlDialect;
    userExplicitlySetDialect = false;
    updateAutoDetectIndicator(null);

    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement;
    if (dialectSelect) {
        dialectSelect.value = currentDialect;
    }

    hideCompareView();
    setCompareModeState(false);
    void visualize(sql);
    clearStaleIndicator();
}

function handleSwitchToQuery(queryIndex: number): void {
    if (!batchResult || queryIndex < 0 || queryIndex >= batchResult.queries.length) {
        return;
    }

    if (currentQueryIndex !== queryIndex) {
        currentQueryIndex = queryIndex;
        hideCompareView();
        setCompareModeState(false);
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
    setRendererColorblindMode((window.colorblindMode as ColorblindMode) || 'off');

    // R key triggers a full re-visualize (same as toolbar refresh)
    document.addEventListener('sql-crack-reset-view', () => {
        if (window.vscodeApi) {
            window.vscodeApi.postMessage({ command: 'requestRefresh' });
        } else {
            const sql = window.initialSqlCode || '';
            if (sql) {
                void visualize(sql);
                clearStaleIndicator();
            }
        }
    });

    // Apply minimap mode from settings
    const minimapMode = (window.showMinimap as MinimapMode) || 'auto';
    setMinimapMode(minimapMode);

    // Apply configurable parse timeout
    if (window.parseTimeoutSeconds) {
        setParseTimeout(window.parseTimeoutSeconds * 1000);
    }

    // Create toolbar with callbacks
    const toolbarResult = createToolbar(container, createToolbarCallbacks(), {
        currentDialect,
        isPinnedView: window.isPinnedView || false,
        pinId: window.pinId || null,
        viewLocation: window.viewLocation || 'tab',
        persistedPinnedTabs: window.persistedPinnedTabs || [],
        isFirstRun: window.isFirstRun || false
    });
    toolbarCleanup = toolbarResult.cleanup;

    // Create batch tabs
    createBatchTabs(container, {
        onQuerySelect: (index: number) => {
            switchToQueryIndex(index);
        },
        isDarkTheme
    });

    // Wire error badge click to switch to the errored query
    setErrorBadgeClickHandler((queryIndex: number) => {
        switchToQueryIndex(queryIndex);
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
            const prevIndex = getScopedAdjacentQueryIndex(batchResult, currentQueryIndex, 'prev');
            if (prevIndex !== null) {
                switchToQueryIndex(prevIndex);
            }
        }
        // ] for next query
        if (e.key === ']') {
            e.preventDefault();
            const nextIndex = getScopedAdjacentQueryIndex(batchResult, currentQueryIndex, 'next');
            if (nextIndex !== null) {
                switchToQueryIndex(nextIndex);
            }
        }
    });

    // Parse and render initial SQL
    const sql = window.initialSqlCode || '';
    if (sql) {
        void visualize(sql);
    }

    // Show first-run onboarding overlay
    if (window.isFirstRun) {
        requestAnimationFrame(() => {
            showFirstRunOverlay(container, {
                isDarkTheme,
                onDismiss: () => {
                    // Notify extension to persist dismissal
                    window.vscodeApi?.postMessage({ type: 'firstRunDismissed' });
                },
            });
        });
    }
}

function setCompareModeState(active: boolean): void {
    compareModeActive = active;
    document.dispatchEvent(new CustomEvent('compare-mode-state', {
        detail: { active: compareModeActive },
    }));
}

function resolveCompareBaseline(): { label: string; sql: string; dialect: SqlDialect } | null {
    const currentSql = getCurrentQuerySql().sql.trim();
    const pinned = (window.persistedPinnedTabs || [])
        .filter(pin => pin.sql?.trim() && pin.sql.trim() !== currentSql)
        .sort((a, b) => b.timestamp - a.timestamp);

    if (pinned.length > 0) {
        const baseline = pinned[0];
        return {
            label: `Pinned • ${baseline.name}`,
            sql: baseline.sql,
            dialect: (baseline.dialect as SqlDialect) || currentDialect,
        };
    }

    if (batchResult && batchResult.queries.length > 1) {
        const fallbackIndex = currentQueryIndex > 0 ? currentQueryIndex - 1 : 1;
        const baselineQuery = batchResult.queries[fallbackIndex];
        if (baselineQuery?.sql && baselineQuery.sql.trim() !== currentSql) {
            return {
                label: `Query ${fallbackIndex + 1}`,
                sql: baselineQuery.sql,
                dialect: currentDialect,
            };
        }
    }

    return null;
}

async function toggleCompareMode(): Promise<void> {
    if (isCompareViewActive()) {
        hideCompareView();
        setCompareModeState(false);
        return;
    }

    if (!batchResult || batchResult.queries.length === 0) {
        return;
    }

    const baseline = resolveCompareBaseline();
    if (!baseline) {
        alert('No baseline available. Baseline is the newest pinned query (if any), otherwise another query in this file. Pin another query first, or open a multi-query file.');
        return;
    }

    const root = document.getElementById('root');
    if (!root) {
        return;
    }

    const currentQuery = batchResult.queries[currentQueryIndex];
    if (!currentQuery?.sql) {
        return;
    }

    const baselineResult = await parseAsync(baseline.sql, baseline.dialect);
    const currentTitle = batchResult.queries.length > 1
        ? `Current • Q${currentQueryIndex + 1}`
        : (window.fileName || 'Current query');

    showCompareView({
        container: root,
        left: {
            label: baseline.label,
            result: baselineResult,
        },
        right: {
            label: currentTitle,
            result: currentQuery,
        },
        isDarkTheme: isDarkTheme(),
        onClose: () => {
            setCompareModeState(false);
        },
    });

    setCompareModeState(true);
}

function createToolbarCallbacks(): ToolbarCallbacks {
    return {
        onUndo: undoLayoutChange,
        onRedo: redoLayoutChange,
        canUndo: canUndoLayoutChanges,
        canRedo: canRedoLayoutChanges,
        onZoomIn: zoomIn,
        onZoomOut: zoomOut,
        onResetView: resetView,
        getZoomLevel: getZoomLevel,
        onExportPng: exportToPng,
        onExportSvg: exportToSvg,
        onExportMermaid: exportToMermaid,
        onCopyToClipboard: copyToClipboard,
        onCopyMermaidToClipboard: copyMermaidToClipboard,
        onToggleLegend: toggleLegend,
        onToggleFocusMode: toggleFocusMode,
        onFocusModeChange: setFocusMode,
        getFocusMode: getFocusMode,
        onToggleSqlPreview: toggleSqlPreview,
        onToggleColumnFlows: toggleColumnFlows,
        onToggleHints: toggleHints,
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
            userExplicitlySetDialect = true;
            currentDialect = dialect;
            updateAutoDetectIndicator(null);
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
        onToggleCompareMode: () => {
            void toggleCompareMode();
        },
        isCompareMode: () => compareModeActive,
        getCompareBaselineLabel: () => resolveCompareBaseline()?.label || null,
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
    hideCompareView();
    setCompareModeState(false);
    queryViewStates.clear();
    clearUndoHistory();

    if (!userExplicitlySetDialect) {
        const detection = detectDialect(sql);
        const detectedDialect = detection.confidence === 'high' ? detection.dialect : null;
        updateAutoDetectIndicator(detectedDialect);
        if (detectedDialect && detectedDialect !== currentDialect) {
            currentDialect = detectedDialect;
            const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement | null;
            if (dialectSelect) {
                dialectSelect.value = currentDialect;
            }
        }
    }

    try {
        const t0 = performance.now();
        const customLimits = {
            maxSqlSizeBytes: (window.maxFileSizeKB || 100) * 1024,
            maxQueryCount: window.maxStatements || 50,
        };
        const result = await parseBatchAsync(
            sql,
            currentDialect,
            customLimits,
            {
                combineDdlStatements: window.combineDdlStatements === true
            }
        );
        const t1 = performance.now();
        debugLog(`[SQL Crack] Parse completed in ${(t1 - t0).toFixed(1)}ms (${result.queries.length} queries, dialect: ${currentDialect})`);
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
        const errorDetails = batchResult.parseErrors?.map(e => {
            const lineRange = batchResult?.queryLineRanges?.[e.queryIndex];
            const sourceLine = extractSourceLineFromParseError(e, lineRange);
            return {
                queryIndex: e.queryIndex,
                message: e.message.length > 100 ? e.message.substring(0, 100) + '...' : e.message,
                line: e.line,
                sourceLine
            };
        });
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

    // If this query has a parse error, attach the source line for the renderer's error overlay
    if (query.error && batchResult.parseErrors) {
        const parseError = batchResult.parseErrors.find(e => e.queryIndex === currentQueryIndex);
        if (parseError) {
            const lineRange = batchResult.queryLineRanges?.[currentQueryIndex];
            query.errorSourceLine = extractSourceLineFromParseError(parseError, lineRange);
        }
    }

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
    hideCompareView();
    setCompareModeState(false);
    clearUndoHistory();
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
