// Legend Bar — Bottom-anchored frosted glass legend strip
// Replaces the old top-left legend panel

import { NODE_ACCENT_COLORS } from '../../shared/themeTokens';
import type { NodeAccentType } from '../../shared/themeTokens';

export interface LegendBarCallbacks {
    isDarkTheme: () => boolean;
}

const NODE_TYPE_LABELS: Record<string, string> = {
    table: 'Table',
    filter: 'Filter',
    join: 'Join',
    aggregate: 'Aggregate',
    sort: 'Sort',
    limit: 'Limit',
    select: 'Select',
    result: 'Result',
    cte: 'CTE',
    union: 'Union',
    subquery: 'Subquery',
    window: 'Window',
};

let legendBarElement: HTMLDivElement | null = null;
let legendVisible = true;
const STORAGE_KEY = 'sqlCrack.legendBarVisible';

/**
 * Create the bottom legend bar element and add to container.
 */
export function createLegendBar(container: HTMLElement, callbacks: LegendBarCallbacks): HTMLDivElement {
    legendBarElement = document.createElement('div');
    legendBarElement.id = 'sql-crack-legend-bar';
    legendBarElement.setAttribute('role', 'complementary');
    legendBarElement.setAttribute('aria-label', 'Node type legend');

    applyLegendStyles(legendBarElement, callbacks.isDarkTheme());
    renderLegendContent(legendBarElement, callbacks.isDarkTheme());

    // Check stored preference
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        // Default visible for first-time users; only explicit "false" hides it.
        legendVisible = stored !== 'false';
    } catch { /* localStorage may not be available */ }

    if (!legendVisible) {
        legendBarElement.style.transform = 'translateY(100%)';
        legendBarElement.style.opacity = '0';
        legendBarElement.style.pointerEvents = 'none';
    }

    container.appendChild(legendBarElement);

    // Listen for theme changes
    document.addEventListener('theme-change', ((e: CustomEvent) => {
        if (legendBarElement) {
            applyLegendStyles(legendBarElement, e.detail.dark);
            renderLegendContent(legendBarElement, e.detail.dark);
        }
    }) as EventListener);

    return legendBarElement;
}

function applyLegendStyles(el: HTMLDivElement, isDark: boolean): void {
    el.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 16px;
        padding: 8px 40px 8px 16px;
        min-height: 36px;
        background: ${isDark ? 'rgba(20, 20, 20, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border-top: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        color: ${isDark ? '#94A3B8' : '#64748B'};
        transition: transform 0.2s ease, opacity 0.2s ease;
    `;
}

function renderLegendContent(el: HTMLDivElement, isDark: boolean): void {
    const palette = isDark ? NODE_ACCENT_COLORS.dark : NODE_ACCENT_COLORS.light;

    const items = Object.entries(NODE_TYPE_LABELS).map(([type, label]) => {
        const color = (palette as Record<string, string>)[type] || palette.select;
        return `<div style="display: flex; align-items: center; gap: 6px;">
            <span style="
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: ${color};
                flex-shrink: 0;
            "></span>
            <span>${label}</span>
        </div>`;
    }).join('');

    // Dismiss button
    const dismissBtn = `<button id="legend-bar-close" aria-label="Dismiss legend" style="
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: ${isDark ? '#64748B' : '#94A3B8'};
        cursor: pointer;
        font-size: 14px;
        padding: 4px 8px;
        border-radius: 4px;
        transition: color 0.15s;
    ">&times;</button>`;

    el.innerHTML = items + dismissBtn;

    // Attach close handler
    const closeBtn = el.querySelector('#legend-bar-close');
    closeBtn?.addEventListener('click', () => {
        toggleLegendBar(false);
    });
}

/**
 * Toggle legend bar visibility. Optionally force show/hide.
 * Dispatches 'legend-bar-toggle' event so other panels can adjust their bottom offset.
 */
export function toggleLegendBar(show?: boolean): void {
    legendVisible = show ?? !legendVisible;

    try {
        localStorage.setItem(STORAGE_KEY, String(legendVisible));
    } catch { /* ignore */ }

    if (!legendBarElement) { return; }

    if (legendVisible) {
        legendBarElement.style.transform = 'translateY(0)';
        legendBarElement.style.opacity = '1';
        legendBarElement.style.pointerEvents = 'auto';
    } else {
        legendBarElement.style.transform = 'translateY(100%)';
        legendBarElement.style.opacity = '0';
        legendBarElement.style.pointerEvents = 'none';
    }

    // Notify other panels so they can shift above the legend bar
    document.dispatchEvent(new CustomEvent('legend-bar-toggle', {
        detail: { visible: legendVisible, height: getLegendBarHeight() }
    }));
}

/**
 * Get the current rendered height of the legend bar (0 when hidden).
 */
export function getLegendBarHeight(): number {
    if (!legendBarElement || !legendVisible) { return 0; }
    return legendBarElement.offsetHeight;
}

/**
 * Check if legend bar is currently visible.
 */
export function isLegendBarVisible(): boolean {
    return legendVisible;
}
