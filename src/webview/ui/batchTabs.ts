// Batch tabs UI module - for navigating multiple queries in a SQL file

import { BatchParseResult } from '../sqlParser';

export interface BatchTabsCallbacks {
    onQuerySelect: (index: number) => void;
    isDarkTheme: () => boolean;
}

// Store current state for re-rendering on theme change
let currentBatchResult: BatchParseResult | null = null;
let currentQueryIdx: number = 0;
let currentCallbacks: BatchTabsCallbacks | null = null;

export function createBatchTabs(container: HTMLElement, callbacks: BatchTabsCallbacks): void {
    const tabsContainer = document.createElement('div');
    tabsContainer.id = 'batch-tabs';

    const isDark = callbacks.isDarkTheme();
    const bgColor = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const borderColor = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    tabsContainer.style.cssText = `
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 4px;
        background: ${bgColor};
        border: 1px solid ${borderColor};
        border-radius: 8px;
        padding: 6px 12px;
        z-index: 100;
    `;
    container.appendChild(tabsContainer);

    // Listen for theme changes
    document.addEventListener('theme-change', ((e: CustomEvent) => {
        updateBatchTabsTheme(e.detail.dark);
        // Re-render tabs if they exist
        if (currentBatchResult && currentCallbacks) {
            updateBatchTabs(currentBatchResult, currentQueryIdx, currentCallbacks);
        }
    }) as EventListener);
}

function updateBatchTabsTheme(dark: boolean): void {
    const tabsContainer = document.getElementById('batch-tabs');
    if (!tabsContainer) { return; }

    const bgColor = dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    tabsContainer.style.background = bgColor;
    tabsContainer.style.borderColor = borderColor;
}

export function updateBatchTabs(
    batchResult: BatchParseResult | null,
    currentQueryIndex: number,
    callbacks: BatchTabsCallbacks
): void {
    // Store for theme change re-renders
    currentBatchResult = batchResult;
    currentQueryIdx = currentQueryIndex;
    currentCallbacks = callbacks;

    const tabsContainer = document.getElementById('batch-tabs');
    if (!tabsContainer || !batchResult) { return; }

    const queryCount = batchResult.queries.length;

    if (queryCount <= 1) {
        tabsContainer.style.display = 'none';
        return;
    }

    // Theme-aware colors
    const isDark = callbacks.isDarkTheme();
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const textColorMuted = isDark ? '#94a3b8' : '#64748b';
    const textColorDim = isDark ? '#475569' : '#94a3b8';
    const activeColor = isDark ? '#a5b4fc' : '#4f46e5';
    const errorColor = isDark ? '#f87171' : '#dc2626';
    const counterColor = isDark ? '#64748b' : '#94a3b8';

    tabsContainer.style.display = 'flex';
    tabsContainer.innerHTML = '';

    const navBtnStyle = (enabled: boolean) => `
        background: transparent;
        border: none;
        color: ${enabled ? textColor : textColorDim};
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
            callbacks.onQuerySelect(0);
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
            callbacks.onQuerySelect(currentQueryIndex - 1);
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
            border: 1px solid ${isActive ? '#6366f1' : hasError ? errorColor : 'transparent'};
            border-radius: 4px;
            color: ${hasError ? errorColor : isActive ? activeColor : textColorMuted};
            cursor: pointer;
            padding: 4px 10px;
            font-size: 11px;
            font-weight: ${isActive ? '600' : '400'};
            transition: all 0.2s;
        `;

        tab.addEventListener('click', () => {
            callbacks.onQuerySelect(i);
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
            callbacks.onQuerySelect(currentQueryIndex + 1);
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
            callbacks.onQuerySelect(queryCount - 1);
        }
    });
    tabsContainer.appendChild(lastBtn);

    // Query counter
    const counter = document.createElement('span');
    counter.style.cssText = `
        color: ${counterColor};
        font-size: 11px;
        margin-left: 8px;
        padding-left: 8px;
        border-left: 1px solid rgba(148, 163, 184, 0.2);
    `;
    counter.textContent = `${currentQueryIndex + 1} / ${queryCount}`;
    tabsContainer.appendChild(counter);
}

function truncateSql(sql: string, maxLen: number): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) { return normalized; }
    return normalized.substring(0, maxLen - 3) + '...';
}
