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

// Store current state for re-rendering on theme change
let currentBatchResult: BatchParseResult | null = null;
let currentQueryIdx: number = 0;
let currentCallbacks: BatchTabsCallbacks | null = null;
let errorSummaryCleanup: (() => void) | null = null;
let batchTabsAbortController: AbortController | null = null;

function getBatchTabsListenerOptions(): AddEventListenerOptions | undefined {
    return batchTabsAbortController ? { signal: batchTabsAbortController.signal } : undefined;
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
    if (errorSummaryCleanup) {
        errorSummaryCleanup();
        errorSummaryCleanup = null;
    }
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

    if (errorSummaryCleanup) {
        errorSummaryCleanup();
        errorSummaryCleanup = null;
    }

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
    }, listenerOptions);
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
    }, listenerOptions);
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
    nextBtn.title = 'Next query';
    nextBtn.style.cssText = navBtnStyle(currentQueryIndex < queryCount - 1);
    nextBtn.disabled = currentQueryIndex >= queryCount - 1;
    nextBtn.addEventListener('click', () => {
        if (currentQueryIndex < queryCount - 1) {
            callbacks.onQuerySelect(currentQueryIndex + 1);
        }
    }, listenerOptions);
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
    counter.textContent = `${currentQueryIndex + 1} / ${queryCount}`;
    tabsContainer.appendChild(counter);

    // Parse status summary indicator (errors + partial parse count)
    const errorCount = batchResult.errorCount || 0;
    const partialCount = batchResult.queries.filter(q => q.partial && !q.error).length;
    const successCount = Math.max(0, queryCount - errorCount - partialCount);
    if (errorCount > 0 || partialCount > 0) {
        const errorSummary = document.createElement('span');
        errorSummary.style.cssText = `
            position: relative;
            color: ${errorCount > 0 ? errorColor : warningColor};
            font-size: 10px;
            margin-left: 8px;
            padding: 2px 6px;
            background: ${errorCount > 0
                ? (isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.1)')
                : (isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(217, 119, 6, 0.1)')};
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        `;
        const statusIcon = errorCount > 0 ? ICONS.warning : ICONS.bolt;
        const failedPart = errorCount > 0
            ? `<button type="button" id="batch-tabs-failed-trigger" style="
                border: none;
                background: transparent;
                color: ${errorColor};
                font-size: 10px;
                cursor: pointer;
                font-weight: 600;
                padding: 0;
                text-decoration: underline;
                text-underline-offset: 1px;
            ">${errorCount} failed</button>`
            : `0 failed`;
        errorSummary.innerHTML = `
            <span style="font-size: 10px; display: inline-flex; width: 12px; height: 12px;">${statusIcon}</span>
            <span>
                ${successCount} ok, ${failedPart}, ${partialCount} partial
            </span>
        `;
        errorSummary.title = `${successCount} ok, ${errorCount} failed, ${partialCount} partial`;
        tabsContainer.appendChild(errorSummary);

        if (errorCount > 0) {
            const trigger = errorSummary.querySelector('#batch-tabs-failed-trigger') as HTMLButtonElement | null;
            if (trigger) {
                const errorList = document.createElement('div');
                errorList.style.cssText = `
                    display: none;
                    position: absolute;
                    top: calc(100% + 6px);
                    right: 0;
                    min-width: 280px;
                    max-width: 420px;
                    max-height: 220px;
                    overflow-y: auto;
                    background: ${isDark ? 'rgba(17, 17, 17, 0.98)' : 'rgba(255, 255, 255, 0.98)'};
                    border: 1px solid ${isDark ? 'rgba(248, 113, 113, 0.35)' : 'rgba(220, 38, 38, 0.35)'};
                    border-radius: 6px;
                    box-shadow: ${isDark ? '0 8px 20px rgba(0, 0, 0, 0.4)' : '0 8px 20px rgba(15, 23, 42, 0.2)'};
                    z-index: ${Z_INDEX.floatingPanel};
                `;

                const parseErrors = batchResult.parseErrors || [];
                parseErrors.forEach(parseError => {
                    const item = document.createElement('button');
                    const shortMessage = truncateSql(parseError.message, 120);
                    item.type = 'button';
                    item.style.cssText = `
                        display: block;
                        width: 100%;
                        text-align: left;
                        border: none;
                        background: transparent;
                        color: ${isDark ? '#fecaca' : '#991b1b'};
                        font-size: 11px;
                        padding: 8px 10px;
                        cursor: pointer;
                    `;
                    item.textContent = `Q${parseError.queryIndex + 1}: ${shortMessage}`;
                    item.title = parseError.message;
                    item.addEventListener('mouseenter', () => {
                        item.style.background = isDark ? 'rgba(248, 113, 113, 0.12)' : 'rgba(220, 38, 38, 0.10)';
                    }, listenerOptions);
                    item.addEventListener('mouseleave', () => {
                        item.style.background = 'transparent';
                    }, listenerOptions);
                    item.addEventListener('click', (event) => {
                        event.stopPropagation();
                        errorList.style.display = 'none';
                        callbacks.onQuerySelect(parseError.queryIndex);
                    }, listenerOptions);
                    errorList.appendChild(item);
                });

                errorSummary.appendChild(errorList);

                trigger.addEventListener('click', (event) => {
                    event.stopPropagation();
                    errorList.style.display = errorList.style.display === 'none' ? 'block' : 'none';
                }, listenerOptions);

                const onDocumentClick = (event: Event) => {
                    const target = event.target as Node | null;
                    if (!target || !errorSummary.contains(target)) {
                        errorList.style.display = 'none';
                    }
                };
                document.addEventListener('click', onDocumentClick, listenerOptions);
                errorSummaryCleanup = () => {
                    document.removeEventListener('click', onDocumentClick);
                };
            }
        }
    }
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
