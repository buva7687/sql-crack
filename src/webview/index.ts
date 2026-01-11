// Polyfill for process (required by node-sql-parser)
import process from 'process/browser';
(window as unknown as { process: typeof process }).process = process;

import { parseSqlBatch, ParseResult, SqlDialect, BatchParseResult } from './sqlParser';
import { diffSql, generateDiffHtml } from './sqlFormatter';
import {
    initRenderer,
    render,
    zoomIn,
    zoomOut,
    resetView,
    exportToPng,
    exportToSvg,
    copyToClipboard,
    setSearchBox,
    nextSearchResult,
    prevSearchResult,
    toggleLegend,
    toggleFocusMode,
    toggleSqlPreview,
    highlightColumnSources,
    toggleFullscreen,
    isFullscreen,
    toggleTheme,
    isDarkTheme,
    getKeyboardShortcuts,
    highlightNodeAtLine
} from './renderer';

declare global {
    interface Window {
        initialSqlCode: string;
        vscodeTheme?: string;
        defaultDialect?: string;
        fileName?: string;
        vscodeApi?: {
            postMessage: (message: any) => void;
        };
    }
}

// Pinned visualization tabs
interface PinnedTab {
    id: string;
    name: string;
    sql: string;
    dialect: SqlDialect;
    result: BatchParseResult | null;
}

// Current state
let currentDialect: SqlDialect = (window.defaultDialect as SqlDialect) || 'MySQL';
let batchResult: BatchParseResult | null = null;
let currentQueryIndex = 0;
let pinnedTabs: PinnedTab[] = [];
let activeTabId: string | null = null;
let isStale: boolean = false;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
    setupVSCodeMessageListener();
});

// Listen for messages from VS Code extension
function setupVSCodeMessageListener(): void {
    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
            case 'refresh':
                handleRefresh(message.sql, message.options);
                break;
            case 'cursorPosition':
                handleCursorPosition(message.line);
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

    // Update dialect dropdown
    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement;
    if (dialectSelect) {
        dialectSelect.value = currentDialect;
    }

    visualize(sql);
    clearStaleIndicator();
}

function handleCursorPosition(line: number): void {
    // Import from renderer - highlight node at line
    highlightNodeAtLine(line);
}

function handleSwitchToQuery(queryIndex: number): void {
    if (!batchResult || queryIndex < 0 || queryIndex >= batchResult.queries.length) {
        return;
    }
    
    // Only switch if it's a different query
    if (currentQueryIndex !== queryIndex) {
        currentQueryIndex = queryIndex;
        renderCurrentQuery();
        updateBatchTabs();
    }
    
    // Also highlight the node at the cursor position
    // This will be handled by the cursorPosition message that follows
}

function markAsStale(): void {
    isStale = true;
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.style.background = 'rgba(234, 179, 8, 0.3)';
        refreshBtn.title = 'Query changed - click to refresh';
    }
}

function clearStaleIndicator(): void {
    isStale = false;
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.style.background = 'transparent';
        refreshBtn.title = 'Refresh visualization';
    }
}

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

    // Create toolbar
    createToolbar(container);

    // Create batch tabs
    createBatchTabs(container);

    // Parse and render initial SQL
    const sql = window.initialSqlCode || '';
    if (sql) {
        visualize(sql);
    }
}

function createToolbar(container: HTMLElement): void {
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
        position: absolute;
        top: 16px;
        left: 16px;
        display: flex;
        gap: 8px;
        z-index: 100;
    `;

    // Title and dialect selector
    const title = document.createElement('div');
    title.style.cssText = `
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 16px;
        color: #f1f5f9;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 12px;
    `;
    title.innerHTML = `
        <span>SQL Flow</span>
        <select id="dialect-select" style="
            background: #1e293b;
            color: #f1f5f9;
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
    `;
    toolbar.appendChild(title);

    // Search box
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 4px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const searchIcon = document.createElement('span');
    searchIcon.textContent = '🔍';
    searchIcon.style.fontSize = '12px';
    searchContainer.appendChild(searchIcon);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search nodes... (Ctrl+F)';
    searchInput.style.cssText = `
        background: transparent;
        border: none;
        color: #f1f5f9;
        font-size: 12px;
        width: 140px;
        outline: none;
    `;
    searchInput.id = 'search-input';
    searchContainer.appendChild(searchInput);

    // Search navigation buttons
    const searchNav = document.createElement('div');
    searchNav.style.cssText = `
        display: flex;
        gap: 4px;
    `;

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
    prevBtn.addEventListener('click', prevSearchResult);
    searchNav.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '↓';
    nextBtn.style.cssText = `
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 12px;
    `;
    nextBtn.addEventListener('click', nextSearchResult);
    searchNav.appendChild(nextBtn);

    searchContainer.appendChild(searchNav);
    toolbar.appendChild(searchContainer);

    container.appendChild(toolbar);

    // Action buttons (top right)
    const actions = document.createElement('div');
    actions.style.cssText = `
        position: absolute;
        top: 16px;
        right: 16px;
        display: flex;
        gap: 8px;
        z-index: 100;
    `;

    // Zoom controls
    const zoomGroup = document.createElement('div');
    zoomGroup.style.cssText = `
        display: flex;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        overflow: hidden;
    `;

    const btnStyle = `
        background: transparent;
        border: none;
        color: #f1f5f9;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s;
    `;

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.innerHTML = '−';
    zoomOutBtn.style.cssText = btnStyle;
    zoomOutBtn.addEventListener('click', zoomOut);
    zoomOutBtn.addEventListener('mouseenter', () => zoomOutBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    zoomOutBtn.addEventListener('mouseleave', () => zoomOutBtn.style.background = 'transparent');
    zoomGroup.appendChild(zoomOutBtn);

    const fitBtn = document.createElement('button');
    fitBtn.innerHTML = '⊡';
    fitBtn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2); border-right: 1px solid rgba(148, 163, 184, 0.2);';
    fitBtn.addEventListener('click', resetView);
    fitBtn.addEventListener('mouseenter', () => fitBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    fitBtn.addEventListener('mouseleave', () => fitBtn.style.background = 'transparent');
    zoomGroup.appendChild(fitBtn);

    const zoomInBtn = document.createElement('button');
    zoomInBtn.innerHTML = '+';
    zoomInBtn.style.cssText = btnStyle;
    zoomInBtn.addEventListener('click', zoomIn);
    zoomInBtn.addEventListener('mouseenter', () => zoomInBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    zoomInBtn.addEventListener('mouseleave', () => zoomInBtn.style.background = 'transparent');
    zoomGroup.appendChild(zoomInBtn);

    actions.appendChild(zoomGroup);

    // Export buttons
    const exportGroup = document.createElement('div');
    exportGroup.style.cssText = `
        display: flex;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        overflow: hidden;
    `;

    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = '📋';
    copyBtn.title = 'Copy to clipboard';
    copyBtn.style.cssText = btnStyle;
    copyBtn.addEventListener('click', () => {
        copyToClipboard();
        copyBtn.innerHTML = '✓';
        setTimeout(() => copyBtn.innerHTML = '📋', 1500);
    });
    copyBtn.addEventListener('mouseenter', () => copyBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    copyBtn.addEventListener('mouseleave', () => copyBtn.style.background = 'transparent');
    exportGroup.appendChild(copyBtn);

    const pngBtn = document.createElement('button');
    pngBtn.innerHTML = 'PNG';
    pngBtn.title = 'Export as PNG';
    pngBtn.style.cssText = btnStyle + 'font-size: 11px; font-weight: 600; border-left: 1px solid rgba(148, 163, 184, 0.2);';
    pngBtn.addEventListener('click', exportToPng);
    pngBtn.addEventListener('mouseenter', () => pngBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    pngBtn.addEventListener('mouseleave', () => pngBtn.style.background = 'transparent');
    exportGroup.appendChild(pngBtn);

    const svgBtn = document.createElement('button');
    svgBtn.innerHTML = 'SVG';
    svgBtn.title = 'Export as SVG';
    svgBtn.style.cssText = btnStyle + 'font-size: 11px; font-weight: 600; border-left: 1px solid rgba(148, 163, 184, 0.2);';
    svgBtn.addEventListener('click', exportToSvg);
    svgBtn.addEventListener('mouseenter', () => svgBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    svgBtn.addEventListener('mouseleave', () => svgBtn.style.background = 'transparent');
    exportGroup.appendChild(svgBtn);

    actions.appendChild(exportGroup);

    // Feature buttons (new features)
    const featureGroup = document.createElement('div');
    featureGroup.style.cssText = `
        display: flex;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        overflow: hidden;
    `;

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refresh-btn';
    refreshBtn.innerHTML = '↻';
    refreshBtn.title = 'Refresh visualization';
    refreshBtn.style.cssText = btnStyle + 'font-size: 16px;';
    refreshBtn.addEventListener('click', () => {
        // Request refresh from VS Code extension
        if (window.vscodeApi) {
            window.vscodeApi.postMessage({ command: 'requestRefresh' });
        } else {
            // Fallback: re-visualize current SQL
            const sql = window.initialSqlCode || '';
            if (sql) {
                visualize(sql);
                clearStaleIndicator();
            }
        }
    });
    refreshBtn.addEventListener('mouseenter', () => {
        if (!isStale) refreshBtn.style.background = 'rgba(148, 163, 184, 0.1)';
    });
    refreshBtn.addEventListener('mouseleave', () => {
        if (!isStale) refreshBtn.style.background = 'transparent';
    });
    featureGroup.appendChild(refreshBtn);

    // Pin/Save tab button
    const pinBtn = document.createElement('button');
    pinBtn.innerHTML = '📌';
    pinBtn.title = 'Pin current visualization (save as tab)';
    pinBtn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2);';
    pinBtn.addEventListener('click', () => {
        pinCurrentVisualization();
    });
    pinBtn.addEventListener('mouseenter', () => pinBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    pinBtn.addEventListener('mouseleave', () => pinBtn.style.background = 'transparent');
    featureGroup.appendChild(pinBtn);

    // Legend button
    const legendBtn = document.createElement('button');
    legendBtn.innerHTML = '🎨';
    legendBtn.title = 'Show color legend (L)';
    legendBtn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2);';
    legendBtn.addEventListener('click', () => {
        toggleLegend();
    });
    legendBtn.addEventListener('mouseenter', () => legendBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    legendBtn.addEventListener('mouseleave', () => legendBtn.style.background = 'transparent');
    featureGroup.appendChild(legendBtn);

    // Focus Mode button
    let focusModeActive = false;
    const focusBtn = document.createElement('button');
    focusBtn.innerHTML = '👁';
    focusBtn.title = 'Focus mode - highlight connected nodes';
    focusBtn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2);';
    focusBtn.addEventListener('click', () => {
        focusModeActive = !focusModeActive;
        toggleFocusMode(focusModeActive);
        focusBtn.style.background = focusModeActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
    });
    focusBtn.addEventListener('mouseenter', () => {
        if (!focusModeActive) focusBtn.style.background = 'rgba(148, 163, 184, 0.1)';
    });
    focusBtn.addEventListener('mouseleave', () => {
        if (!focusModeActive) focusBtn.style.background = 'transparent';
    });
    featureGroup.appendChild(focusBtn);

    // SQL Preview button
    const sqlBtn = document.createElement('button');
    sqlBtn.innerHTML = '{ }';
    sqlBtn.title = 'Show formatted SQL (S)';
    sqlBtn.style.cssText = btnStyle + 'font-size: 11px; font-weight: 700; border-left: 1px solid rgba(148, 163, 184, 0.2);';
    sqlBtn.addEventListener('click', () => toggleSqlPreview());
    sqlBtn.addEventListener('mouseenter', () => sqlBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    sqlBtn.addEventListener('mouseleave', () => sqlBtn.style.background = 'transparent');
    featureGroup.appendChild(sqlBtn);

    // Theme Toggle button
    const themeBtn = document.createElement('button');
    themeBtn.innerHTML = '◐';
    themeBtn.title = 'Toggle dark/light theme (T)';
    themeBtn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2);';
    themeBtn.addEventListener('click', () => {
        toggleTheme();
        themeBtn.innerHTML = isDarkTheme() ? '◐' : '◑';
    });
    themeBtn.addEventListener('mouseenter', () => themeBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    themeBtn.addEventListener('mouseleave', () => themeBtn.style.background = 'transparent');
    featureGroup.appendChild(themeBtn);

    // Fullscreen button
    let fullscreenActive = false;
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.innerHTML = '⛶';
    fullscreenBtn.title = 'Toggle fullscreen (F)';
    fullscreenBtn.style.cssText = btnStyle + 'border-left: 1px solid rgba(148, 163, 184, 0.2);';
    fullscreenBtn.addEventListener('click', () => {
        fullscreenActive = !fullscreenActive;
        toggleFullscreen(fullscreenActive);
        fullscreenBtn.innerHTML = fullscreenActive ? '⛶' : '⛶';
        fullscreenBtn.style.background = fullscreenActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent';
    });
    fullscreenBtn.addEventListener('mouseenter', () => {
        if (!fullscreenActive) fullscreenBtn.style.background = 'rgba(148, 163, 184, 0.1)';
    });
    fullscreenBtn.addEventListener('mouseleave', () => {
        if (!fullscreenActive) fullscreenBtn.style.background = 'transparent';
    });
    featureGroup.appendChild(fullscreenBtn);

    // Query Diff button
    const diffBtn = document.createElement('button');
    diffBtn.innerHTML = '⇄';
    diffBtn.title = 'Compare SQL queries (D)';
    diffBtn.style.cssText = btnStyle + 'font-size: 14px; border-left: 1px solid rgba(148, 163, 184, 0.2);';
    diffBtn.addEventListener('click', () => {
        showQueryDiffModal();
    });
    diffBtn.addEventListener('mouseenter', () => diffBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    diffBtn.addEventListener('mouseleave', () => diffBtn.style.background = 'transparent');
    featureGroup.appendChild(diffBtn);

    // Keyboard shortcuts help button
    const helpBtn = document.createElement('button');
    helpBtn.innerHTML = '?';
    helpBtn.title = 'Keyboard shortcuts';
    helpBtn.style.cssText = btnStyle + 'font-weight: 700; border-left: 1px solid rgba(148, 163, 184, 0.2);';
    helpBtn.addEventListener('click', () => {
        showKeyboardShortcutsHelp();
    });
    helpBtn.addEventListener('mouseenter', () => helpBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    helpBtn.addEventListener('mouseleave', () => helpBtn.style.background = 'transparent');
    featureGroup.appendChild(helpBtn);

    actions.appendChild(featureGroup);

    container.appendChild(actions);

    // Listen for theme change events to update toolbar
    document.addEventListener('theme-change', ((e: CustomEvent) => {
        const dark = e.detail.dark;
        themeBtn.innerHTML = dark ? '◐' : '◑';
        // Update toolbar styles for light theme
        updateToolbarTheme(dark, toolbar, actions, searchContainer);
    }) as EventListener);

    // Listen for show-diff-modal event (from keyboard shortcut)
    document.addEventListener('show-diff-modal', () => {
        showQueryDiffModal();
    });

    // Dialect change handler
    const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement;
    dialectSelect?.addEventListener('change', (e) => {
        currentDialect = (e.target as HTMLSelectElement).value as SqlDialect;
        const sql = window.initialSqlCode || '';
        if (sql) {
            visualize(sql);
        }
    });

    // Setup search box
    setSearchBox(searchInput);
}

function createBatchTabs(container: HTMLElement): void {
    const tabsContainer = document.createElement('div');
    tabsContainer.id = 'batch-tabs';
    tabsContainer.style.cssText = `
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 4px;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 6px 12px;
        z-index: 100;
    `;
    container.appendChild(tabsContainer);
}

function updateBatchTabs(): void {
    const tabsContainer = document.getElementById('batch-tabs');
    if (!tabsContainer || !batchResult) { return; }

    const queryCount = batchResult.queries.length;

    if (queryCount <= 1) {
        tabsContainer.style.display = 'none';
        return;
    }

    tabsContainer.style.display = 'flex';
    tabsContainer.innerHTML = '';

    const navBtnStyle = (enabled: boolean) => `
        background: transparent;
        border: none;
        color: ${enabled ? '#f1f5f9' : '#475569'};
        cursor: ${enabled ? 'pointer' : 'default'};
        padding: 4px 8px;
        font-size: 12px;
    `;

    // First button
    const firstBtn = document.createElement('button');
    firstBtn.innerHTML = '⏮';
    firstBtn.title = 'First query';
    firstBtn.style.cssText = navBtnStyle(currentQueryIndex > 0);
    firstBtn.disabled = currentQueryIndex === 0;
    firstBtn.addEventListener('click', () => {
        if (currentQueryIndex > 0) {
            currentQueryIndex = 0;
            renderCurrentQuery();
            updateBatchTabs();
        }
    });
    tabsContainer.appendChild(firstBtn);

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '◀';
    prevBtn.title = 'Previous query';
    prevBtn.style.cssText = navBtnStyle(currentQueryIndex > 0);
    prevBtn.disabled = currentQueryIndex === 0;
    prevBtn.addEventListener('click', () => {
        if (currentQueryIndex > 0) {
            currentQueryIndex--;
            renderCurrentQuery();
            updateBatchTabs();
        }
    });
    tabsContainer.appendChild(prevBtn);

    // Query tabs (show up to 7)
    const maxTabs = 7;
    const startIdx = Math.max(0, Math.min(currentQueryIndex - Math.floor(maxTabs / 2), queryCount - maxTabs));
    const endIdx = Math.min(startIdx + maxTabs, queryCount);

    for (let i = startIdx; i < endIdx; i++) {
        const tab = document.createElement('button');
        const query = batchResult.queries[i];
        const isActive = i === currentQueryIndex;
        const hasError = !!query.error;

        tab.innerHTML = `Q${i + 1}`;
        tab.title = truncateSql(query.sql, 100);
        tab.style.cssText = `
            background: ${isActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent'};
            border: 1px solid ${isActive ? '#6366f1' : hasError ? '#ef4444' : 'transparent'};
            border-radius: 4px;
            color: ${hasError ? '#f87171' : isActive ? '#a5b4fc' : '#94a3b8'};
            cursor: pointer;
            padding: 4px 10px;
            font-size: 11px;
            font-weight: ${isActive ? '600' : '400'};
            transition: all 0.2s;
        `;

        tab.addEventListener('click', () => {
            currentQueryIndex = i;
            renderCurrentQuery();
            updateBatchTabs();
        });

        tab.addEventListener('mouseenter', () => {
            if (!isActive) {
                tab.style.background = 'rgba(148, 163, 184, 0.1)';
            }
        });

        tab.addEventListener('mouseleave', () => {
            if (!isActive) {
                tab.style.background = 'transparent';
            }
        });

        tabsContainer.appendChild(tab);
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '▶';
    nextBtn.title = 'Next query';
    nextBtn.style.cssText = navBtnStyle(currentQueryIndex < queryCount - 1);
    nextBtn.disabled = currentQueryIndex >= queryCount - 1;
    nextBtn.addEventListener('click', () => {
        if (currentQueryIndex < queryCount - 1) {
            currentQueryIndex++;
            renderCurrentQuery();
            updateBatchTabs();
        }
    });
    tabsContainer.appendChild(nextBtn);

    // Last button
    const lastBtn = document.createElement('button');
    lastBtn.innerHTML = '⏭';
    lastBtn.title = 'Last query';
    lastBtn.style.cssText = navBtnStyle(currentQueryIndex < queryCount - 1);
    lastBtn.disabled = currentQueryIndex >= queryCount - 1;
    lastBtn.addEventListener('click', () => {
        if (currentQueryIndex < queryCount - 1) {
            currentQueryIndex = queryCount - 1;
            renderCurrentQuery();
            updateBatchTabs();
        }
    });
    tabsContainer.appendChild(lastBtn);

    // Query counter
    const counter = document.createElement('span');
    counter.style.cssText = `
        color: #64748b;
        font-size: 11px;
        margin-left: 8px;
        padding-left: 8px;
        border-left: 1px solid rgba(148, 163, 184, 0.2);
    `;
    counter.textContent = `${currentQueryIndex + 1} / ${queryCount}`;
    tabsContainer.appendChild(counter);
}

function visualize(sql: string): void {
    batchResult = parseSqlBatch(sql, currentDialect);
    currentQueryIndex = 0;
    updateBatchTabs();
    renderCurrentQuery();
}

function renderCurrentQuery(): void {
    if (!batchResult || batchResult.queries.length === 0) { return; }

    const query = batchResult.queries[currentQueryIndex];
    render(query);
}

function truncateSql(sql: string, maxLen: number): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) { return normalized; }
    return normalized.substring(0, maxLen - 3) + '...';
}

// Helper function to show keyboard shortcuts help modal
function showKeyboardShortcutsHelp(): void {
    const shortcuts = getKeyboardShortcuts();

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'shortcuts-modal';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        padding: 24px;
        min-width: 320px;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: #f1f5f9; font-size: 16px;">Keyboard Shortcuts</h3>
            <button id="close-shortcuts" style="
                background: none;
                border: none;
                color: #94a3b8;
                cursor: pointer;
                font-size: 20px;
                padding: 4px;
            ">&times;</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
            ${shortcuts.map(s => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
                    <span style="color: #94a3b8; font-size: 13px;">${s.description}</span>
                    <kbd style="
                        background: rgba(99, 102, 241, 0.2);
                        border: 1px solid rgba(99, 102, 241, 0.3);
                        border-radius: 4px;
                        padding: 4px 8px;
                        color: #a5b4fc;
                        font-size: 11px;
                        font-family: monospace;
                    ">${s.key}</kbd>
                </div>
            `).join('')}
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers
    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    modal.querySelector('#close-shortcuts')?.addEventListener('click', closeModal);

    // Close on Escape
    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Helper function to update toolbar theme
function updateToolbarTheme(dark: boolean, toolbar: HTMLElement, actions: HTMLElement, searchContainer: HTMLElement): void {
    const bgColor = dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const textColor = dark ? '#f1f5f9' : '#1e293b';
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    // Update toolbar children
    toolbar.querySelectorAll('div').forEach(el => {
        if (el.style.background?.includes('rgba(15, 23, 42') || el.style.background?.includes('rgba(255, 255, 255')) {
            el.style.background = bgColor;
            el.style.borderColor = borderColor;
        }
    });

    // Update title color
    const titleSpan = toolbar.querySelector('span');
    if (titleSpan) titleSpan.style.color = textColor;

    // Update search container
    searchContainer.style.background = bgColor;
    searchContainer.style.borderColor = borderColor;

    // Update action buttons
    actions.querySelectorAll('div').forEach(el => {
        if (el.style.background?.includes('rgba(15, 23, 42') || el.style.background?.includes('rgba(255, 255, 255')) {
            el.style.background = bgColor;
            el.style.borderColor = borderColor;
        }
    });

    actions.querySelectorAll('button').forEach(btn => {
        btn.style.color = textColor;
    });
}

// Helper function to show Query Diff modal
function showQueryDiffModal(): void {
    const dark = isDarkTheme();
    const colors = dark ? {
        bg: 'rgba(15, 23, 42, 0.98)',
        panelBg: '#1e293b',
        border: 'rgba(148, 163, 184, 0.2)',
        text: '#f1f5f9',
        textMuted: '#94a3b8',
        inputBg: '#0f172a',
        inputBorder: 'rgba(148, 163, 184, 0.3)'
    } : {
        bg: 'rgba(255, 255, 255, 0.98)',
        panelBg: '#f8fafc',
        border: 'rgba(148, 163, 184, 0.3)',
        text: '#1e293b',
        textMuted: '#64748b',
        inputBg: '#ffffff',
        inputBorder: 'rgba(148, 163, 184, 0.4)'
    };

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'diff-modal';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: ${colors.bg};
        border: 1px solid ${colors.border};
        border-radius: 12px;
        padding: 24px;
        width: 90vw;
        max-width: 1200px;
        height: 85vh;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Pre-fill query 1 with current SQL
    const currentSql = window.initialSqlCode || '';

    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin: 0; color: ${colors.text}; font-size: 18px;">
                ⇄ Query Diff
            </h3>
            <button id="close-diff" style="
                background: none;
                border: none;
                color: ${colors.textMuted};
                cursor: pointer;
                font-size: 24px;
                padding: 4px;
            ">&times;</button>
        </div>

        <div id="diff-input-section" style="display: flex; gap: 16px; flex: 1; min-height: 0;">
            <!-- Query 1 input -->
            <div style="flex: 1; display: flex; flex-direction: column;">
                <label style="color: ${colors.textMuted}; font-size: 12px; margin-bottom: 8px; font-weight: 600;">
                    Query 1 (Original)
                </label>
                <textarea id="diff-query1" placeholder="Paste first SQL query here..." style="
                    flex: 1;
                    background: ${colors.inputBg};
                    border: 1px solid ${colors.inputBorder};
                    border-radius: 8px;
                    padding: 12px;
                    color: ${colors.text};
                    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
                    font-size: 12px;
                    resize: none;
                    outline: none;
                ">${escapeHtml(currentSql)}</textarea>
            </div>

            <!-- Query 2 input -->
            <div style="flex: 1; display: flex; flex-direction: column;">
                <label style="color: ${colors.textMuted}; font-size: 12px; margin-bottom: 8px; font-weight: 600;">
                    Query 2 (Modified)
                </label>
                <textarea id="diff-query2" placeholder="Paste second SQL query here..." style="
                    flex: 1;
                    background: ${colors.inputBg};
                    border: 1px solid ${colors.inputBorder};
                    border-radius: 8px;
                    padding: 12px;
                    color: ${colors.text};
                    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
                    font-size: 12px;
                    resize: none;
                    outline: none;
                "></textarea>
            </div>
        </div>

        <div id="diff-result-section" style="display: none; flex: 1; flex-direction: column; min-height: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div id="diff-stats" style="display: flex; gap: 16px;"></div>
                <button id="back-to-input" style="
                    background: transparent;
                    border: 1px solid ${colors.border};
                    border-radius: 6px;
                    color: ${colors.textMuted};
                    padding: 6px 12px;
                    font-size: 12px;
                    cursor: pointer;
                ">← Edit Queries</button>
            </div>
            <div id="diff-output" style="
                flex: 1;
                overflow-y: auto;
                background: ${colors.panelBg};
                border: 1px solid ${colors.border};
                border-radius: 8px;
                padding: 12px;
            "></div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px;">
            <button id="swap-queries" style="
                background: transparent;
                border: 1px solid ${colors.border};
                border-radius: 6px;
                color: ${colors.textMuted};
                padding: 8px 16px;
                font-size: 13px;
                cursor: pointer;
            ">⇄ Swap</button>
            <button id="clear-queries" style="
                background: transparent;
                border: 1px solid ${colors.border};
                border-radius: 6px;
                color: ${colors.textMuted};
                padding: 8px 16px;
                font-size: 13px;
                cursor: pointer;
            ">Clear</button>
            <button id="compare-queries" style="
                background: rgba(99, 102, 241, 0.9);
                border: none;
                border-radius: 6px;
                color: white;
                padding: 8px 24px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
            ">Compare</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Get elements
    const query1Input = modal.querySelector('#diff-query1') as HTMLTextAreaElement;
    const query2Input = modal.querySelector('#diff-query2') as HTMLTextAreaElement;
    const inputSection = modal.querySelector('#diff-input-section') as HTMLElement;
    const resultSection = modal.querySelector('#diff-result-section') as HTMLElement;
    const diffOutput = modal.querySelector('#diff-output') as HTMLElement;
    const diffStats = modal.querySelector('#diff-stats') as HTMLElement;

    // Close handlers
    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    modal.querySelector('#close-diff')?.addEventListener('click', closeModal);

    // Swap queries
    modal.querySelector('#swap-queries')?.addEventListener('click', () => {
        const temp = query1Input.value;
        query1Input.value = query2Input.value;
        query2Input.value = temp;
    });

    // Clear queries
    modal.querySelector('#clear-queries')?.addEventListener('click', () => {
        query1Input.value = '';
        query2Input.value = '';
        inputSection.style.display = 'flex';
        resultSection.style.display = 'none';
    });

    // Back to input
    modal.querySelector('#back-to-input')?.addEventListener('click', () => {
        inputSection.style.display = 'flex';
        resultSection.style.display = 'none';
    });

    // Compare queries
    modal.querySelector('#compare-queries')?.addEventListener('click', () => {
        const sql1 = query1Input.value.trim();
        const sql2 = query2Input.value.trim();

        if (!sql1 || !sql2) {
            alert('Please enter both SQL queries to compare.');
            return;
        }

        // Compute diff
        const diff = diffSql(sql1, sql2);

        // Show stats
        diffStats.innerHTML = `
            <span style="
                background: rgba(34, 197, 94, 0.2);
                color: ${dark ? '#86efac' : '#166534'};
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
            ">+${diff.stats.added} added</span>
            <span style="
                background: rgba(239, 68, 68, 0.2);
                color: ${dark ? '#fca5a5' : '#991b1b'};
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
            ">-${diff.stats.removed} removed</span>
            <span style="
                background: rgba(234, 179, 8, 0.2);
                color: ${dark ? '#fde047' : '#854d0e'};
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
            ">~${diff.stats.modified} modified</span>
            <span style="
                color: ${colors.textMuted};
                padding: 4px 10px;
                font-size: 12px;
            ">${diff.stats.same} unchanged</span>
        `;

        // Generate and show diff HTML
        diffOutput.innerHTML = generateDiffHtml(diff, dark);

        // Switch to result view
        inputSection.style.display = 'none';
        resultSection.style.display = 'flex';
    });

    // Close on Escape
    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Focus on query 2 input
    query2Input.focus();
}

// Helper to escape HTML
function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// FEATURE: Pinned Visualization Tabs
// ============================================================

function pinCurrentVisualization(): void {
    const sql = window.initialSqlCode || '';
    if (!sql.trim()) {
        alert('No visualization to pin');
        return;
    }

    const tabId = 'tab-' + Date.now();
    const tabName = window.fileName || `Query ${pinnedTabs.length + 1}`;

    const pinnedTab: PinnedTab = {
        id: tabId,
        name: tabName.replace('.sql', ''),
        sql: sql,
        dialect: currentDialect,
        result: batchResult
    };

    pinnedTabs.push(pinnedTab);
    activeTabId = tabId;

    updateTabsUI();
}

function updateTabsUI(): void {
    let tabsContainer = document.getElementById('pinned-tabs-container');

    if (!tabsContainer) {
        tabsContainer = createTabsContainer();
    }

    // Show tabs container if there are pinned tabs
    tabsContainer.style.display = pinnedTabs.length > 0 ? 'flex' : 'none';

    // Render tabs
    const tabsList = tabsContainer.querySelector('#tabs-list') as HTMLElement;
    if (!tabsList) return;

    tabsList.innerHTML = '';

    // Add "Current" tab
    const currentTab = createTabElement({
        id: 'current',
        name: 'Current',
        sql: window.initialSqlCode || '',
        dialect: currentDialect,
        result: batchResult
    }, activeTabId === null);
    tabsList.appendChild(currentTab);

    // Add pinned tabs
    for (const tab of pinnedTabs) {
        const tabEl = createTabElement(tab, activeTabId === tab.id);
        tabsList.appendChild(tabEl);
    }
}

function createTabsContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'pinned-tabs-container';
    container.style.cssText = `
        position: absolute;
        top: 60px;
        left: 16px;
        display: none;
        align-items: center;
        gap: 4px;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 4px;
        z-index: 100;
        max-width: calc(100% - 350px);
        overflow-x: auto;
    `;

    const tabsList = document.createElement('div');
    tabsList.id = 'tabs-list';
    tabsList.style.cssText = `
        display: flex;
        gap: 4px;
    `;
    container.appendChild(tabsList);

    const root = document.getElementById('root');
    if (root) {
        root.appendChild(container);
    }

    return container;
}

function createTabElement(tab: PinnedTab, isActive: boolean): HTMLElement {
    const tabEl = document.createElement('div');
    tabEl.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: ${isActive ? 'rgba(99, 102, 241, 0.3)' : 'transparent'};
        color: ${isActive ? '#f1f5f9' : '#94a3b8'};
        transition: background 0.15s;
        white-space: nowrap;
    `;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = tab.name;
    nameSpan.style.maxWidth = '120px';
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    tabEl.appendChild(nameSpan);

    // Click to switch tab
    tabEl.addEventListener('click', () => {
        switchToTab(tab.id === 'current' ? null : tab.id);
    });

    // Hover effect
    tabEl.addEventListener('mouseenter', () => {
        if (!isActive) tabEl.style.background = 'rgba(148, 163, 184, 0.1)';
    });
    tabEl.addEventListener('mouseleave', () => {
        if (!isActive) tabEl.style.background = 'transparent';
    });

    // Close button for pinned tabs (not current)
    if (tab.id !== 'current') {
        const closeBtn = document.createElement('span');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            opacity: 0.6;
            padding: 0 2px;
        `;
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            unpinTab(tab.id);
        });
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.6');
        tabEl.appendChild(closeBtn);
    }

    return tabEl;
}

function switchToTab(tabId: string | null): void {
    activeTabId = tabId;

    if (tabId === null) {
        // Switch to current (live) view
        const sql = window.initialSqlCode || '';
        if (sql) {
            visualize(sql);
        }
    } else {
        // Switch to pinned tab
        const tab = pinnedTabs.find(t => t.id === tabId);
        if (tab && tab.result) {
            currentDialect = tab.dialect;
            batchResult = tab.result;
            currentQueryIndex = 0;
            renderCurrentQuery();

            // Update dialect dropdown
            const dialectSelect = document.getElementById('dialect-select') as HTMLSelectElement;
            if (dialectSelect) {
                dialectSelect.value = currentDialect;
            }
        }
    }

    updateTabsUI();
}

function unpinTab(tabId: string): void {
    const index = pinnedTabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    pinnedTabs.splice(index, 1);

    // If we unpinned the active tab, switch to current
    if (activeTabId === tabId) {
        activeTabId = null;
        const sql = window.initialSqlCode || '';
        if (sql) {
            visualize(sql);
        }
    }

    updateTabsUI();
}
