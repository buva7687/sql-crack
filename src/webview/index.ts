// Polyfill for process (required by node-sql-parser)
import process from 'process/browser';
(window as unknown as { process: typeof process }).process = process;

import { parseSqlBatch, ParseResult, SqlDialect, BatchParseResult } from './sqlParser';
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
    highlightColumnSources
} from './renderer';

declare global {
    interface Window {
        initialSqlCode: string;
        vscodeTheme?: string;
    }
}

// Current state
let currentDialect: SqlDialect = 'MySQL';
let batchResult: BatchParseResult | null = null;
let currentQueryIndex = 0;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
});

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
            <option value="Transact-SQL">SQL Server</option>
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

    // Legend button
    const legendBtn = document.createElement('button');
    legendBtn.innerHTML = '🎨';
    legendBtn.title = 'Show color legend';
    legendBtn.style.cssText = btnStyle;
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
    sqlBtn.title = 'Show formatted SQL';
    sqlBtn.style.cssText = btnStyle + 'font-size: 11px; font-weight: 700; border-left: 1px solid rgba(148, 163, 184, 0.2);';
    sqlBtn.addEventListener('click', () => toggleSqlPreview());
    sqlBtn.addEventListener('mouseenter', () => sqlBtn.style.background = 'rgba(148, 163, 184, 0.1)');
    sqlBtn.addEventListener('mouseleave', () => sqlBtn.style.background = 'transparent');
    featureGroup.appendChild(sqlBtn);

    actions.appendChild(featureGroup);

    container.appendChild(actions);

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
