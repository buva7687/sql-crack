import { getMinimapMode, onMinimapModeChange } from '../minimapVisibility';
import { FLOATING_PANEL_GAP, PANEL_LAYOUT_DEFAULTS, computeHintsListMaxHeight, computeMinimapPlacement } from './panelLayout';

interface CompactPanelLayoutOptions {
    stats: HTMLElement | null;
    hints: HTMLElement | null;
    minimap: HTMLElement | null;
    width: number;
    height: number;
    legendHeight: number;
    /** `sqlCrack.showMinimap` is `always`: keep the minimap in compact layouts and make the hints panel yield. */
    minimapPinned?: boolean;
    /** Highest position the minimap may take, below the toolbar and query tabs. */
    minimapMinTop?: number;
}

type LayoutStyleProperty = 'maxWidth' | 'maxHeight' | 'overflowY' | 'bottom' | 'visibility' | 'top' | 'transform';

function setStyle(element: HTMLElement | null, property: LayoutStyleProperty, value: string): void {
    if (element && element.style[property] !== value) { element.style[property] = value; }
}

function isPanelVisible(panel: HTMLElement | null): boolean {
    return Boolean(panel && panel.style.display !== 'none'
        && panel.style.visibility !== 'hidden' && panel.style.opacity !== '0');
}

function requestedWidth(panel: HTMLElement | null): number {
    return panel ? Number.parseFloat(panel.style.width) || panel.getBoundingClientRect().width : 0;
}

/** Whether the stats and hints panels no longer fit side by side and are stacked instead. */
export function isCompactPanelLayout(stats: HTMLElement | null, hints: HTMLElement | null, width: number): boolean {
    return width < 700 || (isPanelVisible(stats) && isPanelVisible(hints) && requestedWidth(stats) + requestedWidth(hints) + 48 > width);
}

/**
 * Height the hints panel takes when only `maxHeight` limits it. `scrollHeight`
 * ignores the panel's own max-height, so a limit applied for the minimap below
 * does not feed back into the next measurement.
 */
function unconstrainedHeight(panel: HTMLElement, maxHeight: number): number {
    const contentHeight = typeof panel.scrollHeight === 'number'
        ? panel.scrollHeight + (panel.offsetHeight - panel.clientHeight)
        : panel.getBoundingClientRect().height;
    return Math.min(contentHeight, maxHeight);
}

/**
 * Keep the minimap off the hints panel, which grows up the same edge.
 * Returns the top limit the hints panel must respect, or null.
 */
function placeMinimap(
    minimap: HTMLElement | null,
    options: { compact: boolean; pinned: boolean; height: number; minTop: number; hintsTop: number | null; hintsBottom: number },
): number | null {
    if (!minimap) { return null; }
    if (options.compact && !options.pinned) {
        setStyle(minimap, 'visibility', 'hidden');
        return null;
    }
    const minimapHeight = minimap.getBoundingClientRect().height;
    if (!minimapHeight) {
        // Not displayed for this graph; nothing to place.
        setStyle(minimap, 'visibility', '');
        return null;
    }
    const placement = computeMinimapPlacement({
        pinned: options.pinned,
        containerHeight: options.height,
        minimapHeight,
        minTop: options.minTop,
        hintsTop: options.hintsTop,
        hintsBottom: options.hintsBottom,
    });
    setStyle(minimap, 'visibility', placement.visible ? '' : 'hidden');
    if (!placement.visible) { return null; }
    setStyle(minimap, 'top', placement.top === null ? '50%' : `${placement.top}px`);
    setStyle(minimap, 'transform', placement.top === null ? 'translateY(-50%)' : 'none');
    return placement.hintsTopLimit;
}

export function applyCompactPanelLayout({
    stats, hints, minimap, width, height, legendHeight, minimapPinned = false, minimapMinTop = 0,
}: CompactPanelLayoutOptions): void {
    const bottom = PANEL_LAYOUT_DEFAULTS.baseBottom + Math.max(0, legendHeight);
    const statsVisible = isPanelVisible(stats);
    const hintsVisible = isPanelVisible(hints);
    const compact = isCompactPanelLayout(stats, hints, width);
    const availableHeight = Math.max(0, height - bottom - PANEL_LAYOUT_DEFAULTS.topClearance);
    const gap = compact && statsVisible && hintsVisible ? FLOATING_PANEL_GAP : 0;
    const maxHeight = compact && gap ? Math.max(0, Math.floor((availableHeight - gap) / 2)) : availableHeight;

    setStyle(stats, 'maxWidth', compact ? `${Math.max(0, width - 32)}px` : 'none');
    setStyle(hints, 'maxWidth', compact ? `${Math.max(0, width - 32)}px` : 'none');
    setStyle(stats, 'maxHeight', compact ? `${maxHeight}px` : '');
    setStyle(stats, 'overflowY', compact ? 'auto' : '');
    setStyle(stats, 'bottom', `${bottom}px`);
    const statsHeight = compact && statsVisible && stats ? stats.getBoundingClientRect().height : 0;
    const hintsBottom = bottom + (hintsVisible ? statsHeight + gap : 0);
    setStyle(hints, 'bottom', `${hintsBottom}px`);
    const list = hints?.querySelector<HTMLElement>('.hints-list') || null;
    setStyle(list, 'maxHeight', `${compact ? Math.max(0, maxHeight - PANEL_LAYOUT_DEFAULTS.listChromeHeight) : computeHintsListMaxHeight(maxHeight)}px`);

    const hintsHeight = hintsVisible && hints ? unconstrainedHeight(hints, maxHeight) : 0;
    const hintsTopLimit = placeMinimap(minimap, {
        compact,
        pinned: minimapPinned,
        height,
        minTop: minimapMinTop,
        hintsTop: hintsHeight > 0 ? height - hintsBottom - hintsHeight : null,
        hintsBottom: height - hintsBottom,
    });
    // The list keeps its own limit: the panel scrolls as a whole when the minimap bounds it.
    setStyle(hints, 'maxHeight', `${hintsTopLimit === null ? maxHeight : Math.min(maxHeight, Math.floor(height - hintsBottom - hintsTopLimit))}px`);
}

/** Lowest edge of the toolbar and query tabs where they reach into the minimap's column. */
function measureMinimapMinTop(container: HTMLElement, minimap: HTMLElement | null): number {
    if (!minimap) { return 0; }
    const containerRect = container.getBoundingClientRect();
    const minimapLeft = minimap.getBoundingClientRect().left;
    let chromeBottom = 0;
    for (const id of ['sql-crack-toolbar-wrapper', 'batch-tabs']) {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        if (rect && rect.height > 0 && rect.right > minimapLeft) {
            chromeBottom = Math.max(chromeBottom, rect.bottom - containerRect.top);
        }
    }
    return chromeBottom + FLOATING_PANEL_GAP;
}

/** React to content, collapse and viewport changes without changing saved panel preferences. */
export function installCompactPanelLayout(container: HTMLElement): () => void {
    const stats = container.querySelector<HTMLElement>('.stats-panel');
    const hints = container.querySelector<HTMLElement>('.hints-panel');
    const minimap = container.querySelector<HTMLElement>('#minimap-container');
    const legend = container.querySelector<HTMLElement>('#sql-crack-legend-bar');
    let frame: number | null = null;
    const apply = (): void => {
        frame = null;
        if (!container.isConnected) { return; }
        applyCompactPanelLayout({
            stats, hints, minimap, width: container.clientWidth, height: container.clientHeight,
            legendHeight: legend && legend.style.display !== 'none' ? legend.getBoundingClientRect().height : 0,
            minimapPinned: getMinimapMode() === 'always',
            minimapMinTop: measureMinimapMinTop(container, minimap),
        });
    };
    const schedule = (): void => {
        if (frame === null) { frame = requestAnimationFrame(apply); }
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    for (const element of [container, stats, hints, legend]) {
        if (element) { resize?.observe(element); }
    }
    for (const element of [stats, hints]) {
        if (element) {
            mutations?.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        }
    }
    // The renderer shows or hides the minimap per graph and setting. Its own
    // style only: the viewport marker inside it moves on every pan and zoom.
    if (minimap) { mutations?.observe(minimap, { attributes: true, attributeFilter: ['style'] }); }
    // Switching between `auto` and `always` changes the placement without touching any style.
    const stopWatchingMinimapMode = onMinimapModeChange(schedule);
    document.addEventListener('layout-state-changed', schedule);
    document.addEventListener('legend-bar-toggle', schedule);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
        resize?.disconnect();
        mutations?.disconnect();
        stopWatchingMinimapMode();
        document.removeEventListener('layout-state-changed', schedule);
        document.removeEventListener('legend-bar-toggle', schedule);
        window.removeEventListener('resize', schedule);
        if (frame !== null) { cancelAnimationFrame(frame); }
    };
}
