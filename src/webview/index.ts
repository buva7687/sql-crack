// Polyfill for process (required by node-sql-parser)
import process from 'process/browser';
(window as unknown as { process: typeof process }).process = process;

import { parseAsync, parseBatchAsync } from './parserClient';
import { setMinimapMode, MinimapMode } from './minimapVisibility';
import { detectDialect, setParseTimeout } from './sqlParser';
import { BatchParseResult, LayoutType, ParseError, ParseResult, QueryLineRange, SqlDialect } from './types';
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
    isLegendVisible,
    isHintsVisible,
    isSqlPreviewVisible,
    isColumnFlowsVisible,
    isFocusModeEnabled,
    isFullscreen,
    toggleTheme,
    isDarkTheme,
    getKeyboardShortcuts,
    highlightNodeAtLine,
    copyMermaidToClipboard,
    showGlobalLoading,
    hideGlobalLoading,
    getLayoutHistoryState,
    restoreLayoutHistoryState,
    LayoutHistoryStateSnapshot,
    setColorblindMode as setRendererColorblindMode,
} from './renderer';
import type { ColorblindMode } from '../shared/theme';

import {
    createToolbar,
    markRefreshButtonStale,
    markRefreshButtonInactive,
    clearRefreshButtonStale,
    updateErrorBadge,
    clearErrorBadge,
    updateAutoDetectIndicator,
    setErrorBadgeClickHandler,
    createBatchTabs,
    updateBatchTabs,
    getScopedAdjacentQueryIndex,
    getActiveTabId,
    showFirstRunOverlay,
    showCompareView,
    hideCompareView,
    isCompareViewActive,
    ToolbarCallbacks,
    ToolbarCleanup
} from './ui';
import {
    HINT_ACTION_EVENT_NAME,
    HintActionEventDetail,
    parseHintActionCommand,
} from './hintActions';

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
        persistedPinnedTabs?: Array<{ id: string; name: string; sql: string; dialect: string; timestamp: number; sourceDocumentUri?: string }>;
        initialUiState?: unknown;
        debugLogging?: boolean;
        vscodeApi?: {
            postMessage: (message: any) => void;
        };
    }
}

/** Debug log helper - only outputs when debugLogging is enabled */
function debugLog(...args: unknown[]): void {
    if (window.debugLogging) {
        console.log(...args);
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
let isInactiveEditor = false;
let persistStateIntervalId: number | null = null;
let persistStateDebounceId: number | null = null;
let applyInitialStatePending = true;
let cleanupDialectSuggestion: (() => void) | null = null;
let hintActionListenerRegistered = false;
const deferredQueryIndexes: Set<number> = new Set();
const hydrationPromises: Map<number, Promise<void>> = new Map();
const DEFERRED_QUERY_THRESHOLD = 12;

// Store view state per query index for zoom/pan persistence
const queryViewStates: Map<number, TabViewState> = new Map();

interface PersistedRendererUiState {
    viewState: TabViewState;
    layout: LayoutType;
    legendVisible: boolean;
    hintsVisible: boolean;
    sqlPreviewVisible: boolean;
    columnFlowsVisible: boolean;
    focusMode: ReturnType<typeof getFocusMode>;
    focusModeEnabled: boolean;
    layoutHistory: LayoutHistoryStateSnapshot;
}

interface PersistedWebviewState {
    version: 1;
    currentDialect: SqlDialect;
    currentQueryIndex: number;
    userExplicitlySetDialect: boolean;
    compareModeActive: boolean;
    activeTabId: string | null;
    queryViewStates: Array<{ queryIndex: number; viewState: TabViewState }>;
    renderer: PersistedRendererUiState;
}

function stripSqlComments(sql: string): string {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n\r]*/g, ' ')
        .replace(/#[^\n\r]*/g, ' ');
}

function hasExecutableSql(sql: string): boolean {
    return stripSqlComments(sql).trim().length > 0;
}

function normalizeAdvancedLimit(raw: unknown, fallback: number, min: number, max: number): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return fallback;
    }
    const rounded = Math.round(raw);
    return Math.min(max, Math.max(min, rounded));
}

function normalizeRuntimeConfig(): { maxFileSizeKB: number; maxStatements: number; parseTimeoutSeconds: number } {
    const maxFileSizeKB = normalizeAdvancedLimit(window.maxFileSizeKB, 100, 10, 10000);
    const maxStatements = normalizeAdvancedLimit(window.maxStatements, 50, 1, 500);
    const parseTimeoutSeconds = normalizeAdvancedLimit(window.parseTimeoutSeconds, 5, 1, 60);

    window.maxFileSizeKB = maxFileSizeKB;
    window.maxStatements = maxStatements;
    window.parseTimeoutSeconds = parseTimeoutSeconds;

    return { maxFileSizeKB, maxStatements, parseTimeoutSeconds };
}

function syncRefreshButtonState(): void {
    if (isInactiveEditor) {
        markRefreshButtonInactive();
        return;
    }
    if (isStale) {
        markRefreshButtonStale();
        return;
    }
    clearRefreshButtonStale();
}

function buildFallbackQueryErrorResult(sql: string, message: string) {
    return {
        nodes: [],
        edges: [],
        stats: {
            tables: 0,
            joins: 0,
            subqueries: 0,
            ctes: 0,
            aggregations: 0,
            windowFunctions: 0,
            unions: 0,
            conditions: 0,
            complexity: 'Simple' as const,
            complexityScore: 0,
        },
        hints: [],
        sql,
        columnLineage: [],
        columnFlows: [],
        tableUsage: new Map<string, number>(),
        error: message,
    };
}

function normalizeSqlDialect(token: string): SqlDialect | null {
    const normalized = token.trim().toLowerCase();
    const map: Record<string, SqlDialect> = {
        mysql: 'MySQL',
        postgresql: 'PostgreSQL',
        postgres: 'PostgreSQL',
        transactsql: 'TransactSQL',
        'sql server': 'TransactSQL',
        sqlserver: 'TransactSQL',
        snowflake: 'Snowflake',
        bigquery: 'BigQuery',
        redshift: 'Redshift',
        hive: 'Hive',
        athena: 'Athena',
        trino: 'Trino',
        mariadb: 'MariaDB',
        sqlite: 'SQLite',
        oracle: 'Oracle',
        teradata: 'Teradata',
    };
    return map[normalized] ?? null;
}

function setDialectAndVisualize(dialect: SqlDialect): void {
    if (currentDialect === dialect) {
        return;
    }
    userExplicitlySetDialect = true;
    currentDialect = dialect;
    updateAutoDetectIndicator(null);
    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement | null;
    if (dialectSelect) {
        dialectSelect.value = dialect;
    }
    const sql = window.initialSqlCode || '';
    if (sql) {
        void visualize(sql);
    }
}

function getSuggestedDialectFromMessage(message: string): SqlDialect | null {
    const candidates = [
        ...Array.from(message.matchAll(/try\s+([a-zA-Z ]+?)\s+dialect/gi)).map(match => match[1]),
        ...Array.from(message.matchAll(/try\s+([a-zA-Z ]+?)\s+or\s+([a-zA-Z ]+?)\s+dialect/gi)).flatMap(match => [match[1], match[2]]),
    ];
    for (const candidate of candidates) {
        const dialect = normalizeSqlDialect(candidate);
        if (dialect) {
            return dialect;
        }
    }
    return null;
}

function clearDialectSwitchSuggestion(): void {
    cleanupDialectSuggestion?.();
    cleanupDialectSuggestion = null;
}

function showDialectSwitchSuggestion(dialect: SqlDialect, sql: string): void {
    clearDialectSwitchSuggestion();
    const root = document.getElementById('root');
    if (!root) {
        return;
    }

    const card = document.createElement('div');
    card.id = 'dialect-switch-suggestion';
    card.style.cssText = `
        position: absolute;
        top: 56px;
        right: 12px;
        z-index: 3000;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid rgba(99, 102, 241, 0.35);
        background: rgba(15, 23, 42, 0.92);
        color: #e2e8f0;
        font-size: 12px;
        box-shadow: 0 6px 14px rgba(0, 0, 0, 0.3);
    `;

    const message = document.createElement('span');
    message.textContent = `Parser hint: switch to ${dialect}?`;
    card.appendChild(message);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Switch to ${dialect}`;
    button.style.cssText = `
        border: 1px solid rgba(129, 140, 248, 0.7);
        border-radius: 6px;
        background: rgba(99, 102, 241, 0.25);
        color: #eef2ff;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
    `;
    card.appendChild(button);

    const onClick = (): void => {
        clearDialectSwitchSuggestion();
        setDialectAndVisualize(dialect);
    };
    button.addEventListener('click', onClick);
    root.appendChild(card);

    cleanupDialectSuggestion = () => {
        button.removeEventListener('click', onClick);
        card.remove();
    };
}

function capturePersistedState(): PersistedWebviewState {
    queryViewStates.set(currentQueryIndex, getViewState());
    return {
        version: 1,
        currentDialect,
        currentQueryIndex,
        userExplicitlySetDialect,
        compareModeActive,
        activeTabId: getActiveTabId(),
        queryViewStates: Array.from(queryViewStates.entries()).map(([queryIndex, viewState]) => ({ queryIndex, viewState })),
        renderer: {
            viewState: getViewState(),
            layout: getCurrentLayout(),
            legendVisible: isLegendVisible(),
            hintsVisible: isHintsVisible(),
            sqlPreviewVisible: isSqlPreviewVisible(),
            columnFlowsVisible: isColumnFlowsVisible(),
            focusMode: getFocusMode(),
            focusModeEnabled: isFocusModeEnabled(),
            layoutHistory: getLayoutHistoryState(),
        },
    };
}

function persistUiStateNow(): void {
    if (!window.vscodeApi) {
        return;
    }
    window.vscodeApi.postMessage({
        command: 'persistUiState',
        state: capturePersistedState(),
    });
}

function schedulePersistUiState(delayMs = 150): void {
    if (!window.vscodeApi) {
        return;
    }
    if (persistStateDebounceId !== null) {
        window.clearTimeout(persistStateDebounceId);
    }
    persistStateDebounceId = window.setTimeout(() => {
        persistStateDebounceId = null;
        persistUiStateNow();
    }, delayMs);
}

function parseInitialUiState(raw: unknown): PersistedWebviewState | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const candidate = raw as Partial<PersistedWebviewState>;
    if (candidate.version !== 1 || !candidate.renderer || !Array.isArray(candidate.queryViewStates)) {
        return null;
    }
    return candidate as PersistedWebviewState;
}

async function applyInitialUiStateIfAvailable(): Promise<void> {
    if (!applyInitialStatePending || !batchResult) {
        return;
    }
    applyInitialStatePending = false;

    const state = parseInitialUiState(window.initialUiState);
    if (!state || batchResult.queries.length === 0) {
        return;
    }

    currentDialect = state.currentDialect;
    userExplicitlySetDialect = state.userExplicitlySetDialect;
    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement | null;
    if (dialectSelect) {
        dialectSelect.value = currentDialect;
    }

    queryViewStates.clear();
    for (const entry of state.queryViewStates) {
        if (entry.queryIndex >= 0 && entry.queryIndex < batchResult.queries.length) {
            queryViewStates.set(entry.queryIndex, entry.viewState);
        }
    }

    const targetIndex = Math.max(0, Math.min(state.currentQueryIndex, batchResult.queries.length - 1));
    if (targetIndex !== currentQueryIndex) {
        await switchToQueryIndex(targetIndex);
    }

    const activeQueryViewState = queryViewStates.get(currentQueryIndex) || state.renderer.viewState;
    if (activeQueryViewState) {
        setViewState(activeQueryViewState);
    }

    if (state.renderer.layout !== getCurrentLayout()) {
        switchLayout(state.renderer.layout);
    }
    toggleLegend(state.renderer.legendVisible);
    toggleHints(state.renderer.hintsVisible);
    toggleSqlPreview(state.renderer.sqlPreviewVisible);
    toggleColumnFlows(state.renderer.columnFlowsVisible);
    if (state.renderer.focusModeEnabled) {
        setFocusMode(state.renderer.focusMode);
        toggleFocusMode(true);
    } else {
        toggleFocusMode(false);
    }
    restoreLayoutHistoryState(state.renderer.layoutHistory);

}

function clearDeferredQueryState(): void {
    deferredQueryIndexes.clear();
    hydrationPromises.clear();
}

function compactBatchResultMemory(result: BatchParseResult, activeIndex: number): void {
    clearDeferredQueryState();
    if (result.queries.length <= DEFERRED_QUERY_THRESHOLD) {
        return;
    }

    result.queries.forEach((query, index) => {
        if (index === activeIndex || query.error) {
            return;
        }

        const compacted: ParseResult = {
            ...query,
            nodes: [],
            edges: [],
            hints: [],
            columnLineage: [],
            columnFlows: [],
            tableUsage: new Map<string, number>(),
        };
        result.queries[index] = compacted;
        deferredQueryIndexes.add(index);
    });
}

async function hydrateQueryIfNeeded(queryIndex: number): Promise<void> {
    if (!batchResult || !deferredQueryIndexes.has(queryIndex)) {
        return;
    }

    const existingPromise = hydrationPromises.get(queryIndex);
    if (existingPromise) {
        await existingPromise;
        return;
    }

    const parseToken = parseRequestId;
    const query = batchResult.queries[queryIndex];
    const querySql = query?.sql;
    if (!querySql) {
        deferredQueryIndexes.delete(queryIndex);
        return;
    }

    const hydrationPromise = (async () => {
        const runtimeConfig = normalizeRuntimeConfig();
        const hydrated = await parseBatchAsync(
            querySql,
            currentDialect,
            {
                maxSqlSizeBytes: Math.max(runtimeConfig.maxFileSizeKB * 1024, querySql.length + 1024),
                maxQueryCount: Number.POSITIVE_INFINITY,
            },
            {
                combineDdlStatements: window.combineDdlStatements === true
            }
        );

        if (!batchResult || parseToken !== parseRequestId || !deferredQueryIndexes.has(queryIndex)) {
            return;
        }

        const hydratedQuery = hydrated.queries[0] || buildFallbackQueryErrorResult(querySql, 'Failed to hydrate deferred query');
        hydratedQuery.sql = querySql;
        if (query.partial) {
            hydratedQuery.partial = true;
        }
        if (query.error && !hydratedQuery.error) {
            hydratedQuery.error = query.error;
        }

        batchResult.queries[queryIndex] = hydratedQuery;
        deferredQueryIndexes.delete(queryIndex);
    })();

    hydrationPromises.set(queryIndex, hydrationPromise);
    try {
        await hydrationPromise;
    } finally {
        hydrationPromises.delete(queryIndex);
    }
}

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

function handleHintActionCommand(command: string): void {
    const parsedAction = parseHintActionCommand(command, normalizeSqlDialect);
    if (parsedAction.type !== 'switchDialect') {
        return;
    }
    setDialectAndVisualize(parsedAction.dialect);
}

function setupHintActionListener(): void {
    if (hintActionListenerRegistered) {
        return;
    }
    hintActionListenerRegistered = true;

    document.addEventListener(HINT_ACTION_EVENT_NAME, (event: Event) => {
        const detail = (event as CustomEvent<HintActionEventDetail>).detail;
        handleHintActionCommand(detail?.command || '');
    });
}

// Initialize when DOM is ready (guard against cached webview where DOMContentLoaded already fired)
function setup(): void {
    setupHintActionListener();
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
            case 'setEditorActivity':
                isInactiveEditor = message.isSqlLikeActiveEditor !== true;
                syncRefreshButtonState();
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
    schedulePersistUiState();
}

function handleSwitchToQuery(queryIndex: number): void {
    if (!batchResult || queryIndex < 0 || queryIndex >= batchResult.queries.length) {
        return;
    }

    if (currentQueryIndex !== queryIndex) {
        void switchToQueryIndex(queryIndex);
    }
}

function markAsStale(): void {
    isStale = true;
    syncRefreshButtonState();
}

function clearStaleIndicator(): void {
    isStale = false;
    syncRefreshButtonState();
}

// ============================================================
// Initialization
// ============================================================

function init(): void {
    const container = document.getElementById('root');
    if (!container) { return; }
    const runtimeConfig = normalizeRuntimeConfig();

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
    setParseTimeout(runtimeConfig.parseTimeoutSeconds * 1000);

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
    syncRefreshButtonState();

    // Create batch tabs
    createBatchTabs(container, {
        onQuerySelect: (index: number) => {
            void switchToQueryIndex(index);
        },
        isDarkTheme
    });

    // Wire error badge click to switch to the errored query
    setErrorBadgeClickHandler((queryIndex: number) => {
        void switchToQueryIndex(queryIndex);
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
                void switchToQueryIndex(prevIndex);
            }
        }
        // ] for next query
        if (e.key === ']') {
            e.preventDefault();
            const nextIndex = getScopedAdjacentQueryIndex(batchResult, currentQueryIndex, 'next');
            if (nextIndex !== null) {
                void switchToQueryIndex(nextIndex);
            }
        }
    });

    // Parse and render initial SQL
    const sql = window.initialSqlCode || '';
    if (sql) {
        void visualize(sql);
    }

    if (persistStateIntervalId !== null) {
        window.clearInterval(persistStateIntervalId);
    }
    persistStateIntervalId = window.setInterval(() => {
        if (batchResult) {
            persistUiStateNow();
        }
    }, 1500);

    window.addEventListener('beforeunload', () => {
        if (persistStateIntervalId !== null) {
            window.clearInterval(persistStateIntervalId);
            persistStateIntervalId = null;
        }
        if (persistStateDebounceId !== null) {
            window.clearTimeout(persistStateDebounceId);
            persistStateDebounceId = null;
        }
        clearDialectSwitchSuggestion();
        persistUiStateNow();
        toolbarCleanup?.();
        toolbarCleanup = null;
    });

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
        onUndo: () => {
            undoLayoutChange();
            schedulePersistUiState();
        },
        onRedo: () => {
            redoLayoutChange();
            schedulePersistUiState();
        },
        canUndo: canUndoLayoutChanges,
        canRedo: canRedoLayoutChanges,
        onZoomIn: () => {
            zoomIn();
            schedulePersistUiState();
        },
        onZoomOut: () => {
            zoomOut();
            schedulePersistUiState();
        },
        onResetView: resetView,
        getZoomLevel: getZoomLevel,
        onExportPng: exportToPng,
        onExportSvg: exportToSvg,
        onExportMermaid: exportToMermaid,
        onCopyToClipboard: copyToClipboard,
        onCopyMermaidToClipboard: copyMermaidToClipboard,
        onToggleLegend: (show?: boolean) => {
            toggleLegend(show);
            schedulePersistUiState();
        },
        onToggleFocusMode: (enable?: boolean) => {
            toggleFocusMode(enable);
            schedulePersistUiState();
        },
        onFocusModeChange: (mode) => {
            setFocusMode(mode);
            schedulePersistUiState();
        },
        getFocusMode: getFocusMode,
        onToggleSqlPreview: (show?: boolean) => {
            toggleSqlPreview(show);
            schedulePersistUiState();
        },
        onToggleColumnFlows: (show?: boolean) => {
            toggleColumnFlows(show);
            schedulePersistUiState();
        },
        onToggleHints: (show?: boolean) => {
            toggleHints(show);
            schedulePersistUiState();
        },
        onToggleLayout: () => {
            toggleLayout();
            schedulePersistUiState();
        },
        onLayoutChange: (layout: LayoutType) => {
            switchLayout(layout);
            schedulePersistUiState();
        },
        getCurrentLayout: getCurrentLayout,
        onToggleTheme: toggleTheme,
        onToggleFullscreen: toggleFullscreen,
        onSearchBoxReady: setSearchBox,
        onNextSearchResult: nextSearchResult,
        onPrevSearchResult: prevSearchResult,
        onDialectChange: (dialect: SqlDialect) => {
            setDialectAndVisualize(dialect);
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
    clearDialectSwitchSuggestion();
    clearDeferredQueryState();

    if (!hasExecutableSql(sql)) {
        const message = 'No executable SQL found. File appears to contain only comments or whitespace.';
        updateErrorBadge(1, [{ queryIndex: 0, message }]);
        batchResult = {
            queries: [buildFallbackQueryErrorResult(sql, message)],
            errorCount: 1,
            parseErrors: [{ queryIndex: 0, message, sql }],
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
        currentQueryIndex = 0;
        updateBatchTabsUI();
        renderCurrentQuery();
        schedulePersistUiState();
        return;
    }

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

    showGlobalLoading('Parsing SQL...');
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
        });
    });

    try {
        const t0 = performance.now();
        const runtimeConfig = normalizeRuntimeConfig();
        const customLimits = {
            maxSqlSizeBytes: runtimeConfig.maxFileSizeKB * 1024,
            maxQueryCount: runtimeConfig.maxStatements,
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
        compactBatchResultMemory(result, 0);
        batchResult = result;
    } catch (error) {
        if (requestId !== parseRequestId) {
            return;
        }
        const message = error instanceof Error ? error.message : 'Failed to parse SQL';
        updateErrorBadge(1, [{ queryIndex: 0, message }]);
        batchResult = {
            queries: [buildFallbackQueryErrorResult(sql, message)],
            errorCount: 1,
            parseErrors: [{ queryIndex: 0, message, sql }],
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
    } finally {
        if (requestId === parseRequestId) {
            hideGlobalLoading();
        }
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

    if (!batchResult) {
        return;
    }

    if (batchResult.queries.length === 0) {
        const message = hasExecutableSql(sql)
            ? 'No SQL statements could be parsed from this input.'
            : 'No executable SQL found. File appears to contain only comments or whitespace.';
        updateErrorBadge(1, [{ queryIndex: 0, message }]);
        render(buildFallbackQueryErrorResult(sql, message));
        schedulePersistUiState();
        return;
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

        const suggestedDialect = batchResult.parseErrors
            ?.map(error => getSuggestedDialectFromMessage(error.message))
            .find((dialect): dialect is SqlDialect => Boolean(dialect)) ?? null;
        if (suggestedDialect && suggestedDialect !== currentDialect) {
            showDialectSwitchSuggestion(suggestedDialect, sql);
        }
    } else {
        clearErrorBadge();
        clearDialectSwitchSuggestion();
    }

    currentQueryIndex = 0;
    updateBatchTabsUI();
    renderCurrentQuery();
    await applyInitialUiStateIfAvailable();
    schedulePersistUiState();
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
    schedulePersistUiState();
}

/**
 * Switch to a different query index, preserving view state
 */
async function switchToQueryIndex(newIndex: number): Promise<void> {
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

    if (deferredQueryIndexes.has(newIndex)) {
        showGlobalLoading('Loading query details...');
        try {
            await hydrateQueryIfNeeded(newIndex);
        } finally {
            hideGlobalLoading();
        }
        if (currentQueryIndex !== newIndex) {
            return;
        }
    }

    renderCurrentQuery();
    updateBatchTabsUI();

    // Restore view state for the new query if we have one
    const savedState = queryViewStates.get(newIndex);
    if (savedState) {
        // Use requestAnimationFrame to ensure render completes first
        requestAnimationFrame(() => {
            setViewState(savedState);
            schedulePersistUiState();
        });
    }
    schedulePersistUiState();
}

function updateBatchTabsUI(): void {
    updateBatchTabs(batchResult, currentQueryIndex, {
        onQuerySelect: (index: number) => {
            void switchToQueryIndex(index);
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
