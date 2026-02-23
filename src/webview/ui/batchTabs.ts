// Batch tabs UI module - for navigating multiple queries in a SQL file

import { BatchParseResult } from '../sqlParser';
import { ICONS } from '../../shared/icons';
import { Z_INDEX } from '../../shared/zIndex';

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface BatchTabsCallbacks {
    onQuerySelect: (index: number) => void;
    isDarkTheme: () => boolean;
}

export type BatchNavigationScope = 'all' | 'ok' | 'failed' | 'partial';

// Store current state for re-rendering on theme change
let currentBatchResult: BatchParseResult | null = null;
let currentQueryIdx: number = 0;
let currentCallbacks: BatchTabsCallbacks | null = null;
let batchTabsAbortController: AbortController | null = null;
let currentNavigationScope: BatchNavigationScope = 'all';

function getBatchTabsListenerOptions(): AddEventListenerOptions | undefined {
    return batchTabsAbortController ? { signal: batchTabsAbortController.signal } : undefined;
}

function getQueryStatus(query: BatchParseResult['queries'][number]): Exclude<BatchNavigationScope, 'all'> {
    if (query.error) { return 'failed'; }
    if (query.partial) { return 'partial'; }
    return 'ok';
}

function queryMatchesScope(
    query: BatchParseResult['queries'][number],
    scope: BatchNavigationScope
): boolean {
    if (scope === 'all') { return true; }
    return getQueryStatus(query) === scope;
}

function getScopedQueryIndices(
    batchResult: BatchParseResult,
    scope: BatchNavigationScope
): number[] {
    if (scope === 'all') {
        return batchResult.queries.map((_query, idx) => idx);
    }
    const indices: number[] = [];
    batchResult.queries.forEach((query, idx) => {
        if (queryMatchesScope(query, scope)) {
            indices.push(idx);
        }
    });
    return indices;
}

function getScopedBoundaryIndex(
    batchResult: BatchParseResult,
    direction: 'first' | 'last'
): number | null {
    const indices = getScopedQueryIndices(batchResult, currentNavigationScope);
    if (indices.length === 0) { return null; }
    return direction === 'first' ? indices[0] : indices[indices.length - 1];
}

export function getBatchNavigationScope(): BatchNavigationScope {
    return currentNavigationScope;
}

export function getScopedAdjacentQueryIndex(
    batchResult: BatchParseResult | null,
    currentIndex: number,
    direction: 'prev' | 'next'
): number | null {
    if (!batchResult || batchResult.queries.length <= 1) { return null; }
    const indices = getScopedQueryIndices(batchResult, currentNavigationScope);
    if (indices.length === 0) { return null; }

    if (direction === 'prev') {
        for (let i = indices.length - 1; i >= 0; i--) {
            if (indices[i] < currentIndex) {
                return indices[i];
            }
        }
        return null;
    }

    for (let i = 0; i < indices.length; i++) {
        if (indices[i] > currentIndex) {
            return indices[i];
        }
    }
    return null;
}

export function createBatchTabs(container: HTMLElement, callbacks: BatchTabsCallbacks): void {
    batchTabsAbortController?.abort();
    batchTabsAbortController = new AbortController();
    const listenerOptions = getBatchTabsListenerOptions();

    const tabsContainer = document.createElement('div');
    tabsContainer.id = 'batch-tabs';

    const isDark = callbacks.isDarkTheme();
    const bgColor = isDark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)';
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
        z-index: ${Z_INDEX.toolbar};
    `;
    container.appendChild(tabsContainer);

    // Listen for theme changes
    document.addEventListener('theme-change', ((e: CustomEvent) => {
        updateBatchTabsTheme(e.detail.dark);
        // Re-render tabs if they exist
        if (currentBatchResult && currentCallbacks) {
            updateBatchTabs(currentBatchResult, currentQueryIdx, currentCallbacks);
        }
    }) as EventListener, listenerOptions);
}

export function disposeBatchTabs(): void {
    batchTabsAbortController?.abort();
    batchTabsAbortController = null;
    currentNavigationScope = 'all';
}

function updateBatchTabsTheme(dark: boolean): void {
    const tabsContainer = document.getElementById('batch-tabs');
    if (!tabsContainer) { return; }

    const bgColor = dark ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const borderColor = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    tabsContainer.style.background = bgColor;
    tabsContainer.style.borderColor = borderColor;
}

export function updateBatchTabs(
    batchResult: BatchParseResult | null,
    currentQueryIndex: number,
    callbacks: BatchTabsCallbacks
): void {
    const listenerOptions = getBatchTabsListenerOptions();

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
    const successColor = isDark ? '#4ade80' : '#16a34a';
    const warningColor = isDark ? '#fbbf24' : '#d97706';
    const counterColor = isDark ? '#64748b' : '#94a3b8';
    const errorBgTint = isDark ? 'rgba(248, 113, 113, 0.14)' : 'rgba(220, 38, 38, 0.10)';
    const errorBgTintHover = isDark ? 'rgba(248, 113, 113, 0.22)' : 'rgba(220, 38, 38, 0.16)';
    const warningBgTint = isDark ? 'rgba(251, 191, 36, 0.14)' : 'rgba(217, 119, 6, 0.10)';
    const warningBgTintHover = isDark ? 'rgba(251, 191, 36, 0.22)' : 'rgba(217, 119, 6, 0.16)';
    const successBgTint = isDark ? 'rgba(74, 222, 128, 0.10)' : 'rgba(22, 163, 74, 0.08)';
    const successBgTintHover = isDark ? 'rgba(74, 222, 128, 0.16)' : 'rgba(22, 163, 74, 0.12)';
    const summaryBorder = isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.45)';

    tabsContainer.style.display = 'flex';
    tabsContainer.innerHTML = '';

    let scopeQueryIndices = getScopedQueryIndices(batchResult, currentNavigationScope);
    if (currentNavigationScope !== 'all' && scopeQueryIndices.length === 0) {
        currentNavigationScope = 'all';
        scopeQueryIndices = getScopedQueryIndices(batchResult, currentNavigationScope);
    }
    const prevScopedIndex = getScopedAdjacentQueryIndex(batchResult, currentQueryIndex, 'prev');
    const nextScopedIndex = getScopedAdjacentQueryIndex(batchResult, currentQueryIndex, 'next');
    const firstScopedIndex = getScopedBoundaryIndex(batchResult, 'first');
    const lastScopedIndex = getScopedBoundaryIndex(batchResult, 'last');

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
    firstBtn.title = currentNavigationScope === 'all' ? 'First query' : `First ${currentNavigationScope} query`;
    firstBtn.style.cssText = navBtnStyle(firstScopedIndex !== null && firstScopedIndex !== currentQueryIndex);
    firstBtn.disabled = firstScopedIndex === null || firstScopedIndex === currentQueryIndex;
    firstBtn.addEventListener('click', () => {
        if (firstScopedIndex !== null && firstScopedIndex !== currentQueryIndex) {
            callbacks.onQuerySelect(firstScopedIndex);
        }
    }, listenerOptions);
    tabsContainer.appendChild(firstBtn);

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '◀';
    prevBtn.title = currentNavigationScope === 'all' ? 'Previous query' : `Previous ${currentNavigationScope} query`;
    prevBtn.style.cssText = navBtnStyle(prevScopedIndex !== null);
    prevBtn.disabled = prevScopedIndex === null;
    prevBtn.addEventListener('click', () => {
        if (prevScopedIndex !== null) {
            callbacks.onQuerySelect(prevScopedIndex);
        }
    }, listenerOptions);
    tabsContainer.appendChild(prevBtn);

    // Query tabs (show up to 7), scoped when a status filter is active
    const maxTabs = 7;
    const tabIndices = currentNavigationScope === 'all'
        ? batchResult.queries.map((_query, idx) => idx)
        : scopeQueryIndices;
    const activePos = tabIndices.indexOf(currentQueryIndex);
    const startPos = Math.max(0, Math.min(
        activePos >= 0 ? activePos - Math.floor(maxTabs / 2) : 0,
        Math.max(0, tabIndices.length - maxTabs)
    ));
    const endPos = Math.min(startPos + maxTabs, tabIndices.length);

    for (let pos = startPos; pos < endPos; pos++) {
        const i = tabIndices[pos];
        const tab = document.createElement('button');
        const query = batchResult.queries[i];
        const isActive = i === currentQueryIndex;
        const hasError = !!query.error;
        const isPartial = !!query.partial && !hasError;

        const stateIcon = hasError ? ICONS.warning : isPartial ? ICONS.bolt : ICONS.check;
        const stateIconColor = hasError ? errorColor : isPartial ? warningColor : successColor;
        const stateBaseColor = hasError ? errorColor : isPartial ? warningColor : textColorMuted;
        const idleBg = hasError ? errorBgTint : isPartial ? warningBgTint : successBgTint;
        const hoverBg = hasError ? errorBgTintHover : isPartial ? warningBgTintHover : successBgTintHover;

        tab.innerHTML = `<span style="color: ${isActive ? activeColor : stateIconColor}; display: inline-flex; width: 12px; height: 12px;">${stateIcon}</span> ${escapeHtml(extractQueryLabel(query.sql, i))}`;
        tab.title = hasError
            ? `Q${i + 1}: ${query.error}`
            : isPartial
                ? `Q${i + 1}: Partial parse (regex fallback) — ${truncateSql(query.sql, 200)}`
                : `Q${i + 1}: ${truncateSql(query.sql, 200)}`;
        tab.style.cssText = `
            background: ${isActive ? 'rgba(99, 102, 241, 0.3)' : idleBg};
            border: 1px solid ${isActive ? '#6366f1' : hasError ? errorColor : isPartial ? warningColor : 'transparent'};
            border-radius: 4px;
            color: ${isActive ? activeColor : stateBaseColor};
            cursor: pointer;
            padding: 4px 10px;
            font-size: 11px;
            font-weight: ${isActive ? '600' : '400'};
            transition: all 0.2s;
        `;

        tab.addEventListener('click', () => {
            callbacks.onQuerySelect(i);
        }, listenerOptions);

        tab.addEventListener('mouseenter', () => {
            if (!isActive) {
                tab.style.background = hoverBg;
            }
        }, listenerOptions);

        tab.addEventListener('mouseleave', () => {
            if (!isActive) {
                tab.style.background = idleBg;
            }
        }, listenerOptions);

        tabsContainer.appendChild(tab);
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '▶';
    nextBtn.title = currentNavigationScope === 'all' ? 'Next query' : `Next ${currentNavigationScope} query`;
    nextBtn.style.cssText = navBtnStyle(nextScopedIndex !== null);
    nextBtn.disabled = nextScopedIndex === null;
    nextBtn.addEventListener('click', () => {
        if (nextScopedIndex !== null) {
            callbacks.onQuerySelect(nextScopedIndex);
        }
    }, listenerOptions);
    tabsContainer.appendChild(nextBtn);

    // Last button
    const lastBtn = document.createElement('button');
    lastBtn.innerHTML = '⏭';
    lastBtn.title = currentNavigationScope === 'all' ? 'Last query' : `Last ${currentNavigationScope} query`;
    lastBtn.style.cssText = navBtnStyle(lastScopedIndex !== null && lastScopedIndex !== currentQueryIndex);
    lastBtn.disabled = lastScopedIndex === null || lastScopedIndex === currentQueryIndex;
    lastBtn.addEventListener('click', () => {
        if (lastScopedIndex !== null && lastScopedIndex !== currentQueryIndex) {
            callbacks.onQuerySelect(lastScopedIndex);
        }
    }, listenerOptions);
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
    if (currentNavigationScope === 'all') {
        counter.textContent = `${currentQueryIndex + 1} / ${queryCount}`;
    } else {
        const scopedPos = scopeQueryIndices.indexOf(currentQueryIndex);
        counter.textContent = `${scopedPos + 1} / ${scopeQueryIndices.length}`;
    }
    tabsContainer.appendChild(counter);

    // Parse status summary chips (compact + scope toggle)
    const errorCount = batchResult.errorCount || 0;
    const partialCount = batchResult.queries.filter(q => q.partial && !q.error).length;
    const successCount = Math.max(0, queryCount - errorCount - partialCount);
    const summary = document.createElement('span');
    summary.style.cssText = `
        margin-left: 8px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    `;

    const chips: Array<{ scope: Exclude<BatchNavigationScope, 'all'>; count: number; color: string; bg: string; bgActive: string }> = [
        {
            scope: 'ok',
            count: successCount,
            color: successColor,
            bg: successBgTint,
            bgActive: successBgTintHover,
        },
        {
            scope: 'failed',
            count: errorCount,
            color: errorColor,
            bg: errorBgTint,
            bgActive: errorBgTintHover,
        },
        {
            scope: 'partial',
            count: partialCount,
            color: warningColor,
            bg: warningBgTint,
            bgActive: warningBgTintHover,
        },
    ];

    chips.forEach(({ scope, count, color, bg, bgActive }) => {
        const isActive = currentNavigationScope === scope;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.textContent = `${count} ${scope}`;
        chip.disabled = count === 0;
        chip.title = count === 0
            ? `No ${scope} queries in this batch`
            : isActive
                ? `Show all queries`
                : `Navigate ${scope} queries with [ and ]`;
        chip.style.cssText = `
            border: 1px solid ${isActive ? color : summaryBorder};
            background: ${isActive ? bgActive : bg};
            color: ${count === 0 ? textColorDim : (isActive ? color : textColorMuted)};
            font-size: 10px;
            font-weight: ${isActive ? '600' : '500'};
            border-radius: 10px;
            padding: 2px 6px;
            cursor: ${count === 0 ? 'default' : 'pointer'};
            opacity: ${count === 0 ? '0.55' : '1'};
            line-height: 1.2;
            transition: all 0.15s ease;
        `;
        chip.addEventListener('click', () => {
            if (count === 0) { return; }
            const nextScope: BatchNavigationScope = isActive ? 'all' : scope;
            currentNavigationScope = nextScope;
            if (nextScope !== 'all' && !queryMatchesScope(batchResult.queries[currentQueryIndex], nextScope)) {
                const nextScopeIndices = getScopedQueryIndices(batchResult, nextScope);
                if (nextScopeIndices.length > 0) {
                    callbacks.onQuerySelect(nextScopeIndices[0]);
                    return;
                }
            }
            updateBatchTabs(batchResult, currentQueryIndex, callbacks);
        }, listenerOptions);
        summary.appendChild(chip);
    });

    tabsContainer.appendChild(summary);
}

function truncateSql(sql: string, maxLen: number): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) { return normalized; }
    return normalized.substring(0, maxLen - 3) + '...';
}

/**
 * Extract a meaningful label from SQL text for tab display.
 * Matches common SQL patterns and returns a short label like "INSERT orders".
 * Falls back to `Q${index}` if no pattern matches.
 */
export function extractQueryLabel(sql: string, fallbackIndex?: number): string {
    // Strip comments before matching so leading comments don't prevent keyword detection
    const stripped = sql
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/--[^\n]*/g, '');            // line comments
    const normalized = stripped.replace(/\s+/g, ' ').trim();

    const patterns: Array<{ regex: RegExp; format: (m: RegExpMatchArray) => string }> = [
        { regex: /^INSERT\s+INTO\s+(\S+)/i, format: m => `INSERT ${m[1]}` },
        { regex: /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?(TABLE|VIEW|INDEX|FUNCTION|PROCEDURE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i, format: m => `CREATE ${m[2]}` },
        { regex: /^UPDATE\s+(\S+)/i, format: m => `UPDATE ${m[1]}` },
        { regex: /^DELETE\s+FROM\s+(\S+)/i, format: m => `DELETE ${m[1]}` },
        { regex: /^MERGE\s+INTO\s+(\S+)/i, format: m => `MERGE ${m[1]}` },
        { regex: /^ALTER\s+TABLE\s+(\S+)/i, format: m => `ALTER ${m[1]}` },
        { regex: /^DROP\s+(TABLE|VIEW)\s+(?:IF\s+EXISTS\s+)?(\S+)/i, format: m => `DROP ${m[2]}` },
        { regex: /^WITH\s+(\w+)\s+AS/i, format: m => `CTE ${m[1]}` },
        { regex: /^SELECT\s+[\s\S]*?\bFROM\s+(\S+)/i, format: m => `SELECT ${m[1]}` },
    ];

    for (const { regex, format } of patterns) {
        const match = normalized.match(regex);
        if (match) {
            const label = format(match);
            if (label.length > 20) {
                return label.substring(0, 19) + '\u2026';
            }
            return label;
        }
    }

    return fallbackIndex !== undefined ? `Q${fallbackIndex + 1}` : 'Q?';
}
