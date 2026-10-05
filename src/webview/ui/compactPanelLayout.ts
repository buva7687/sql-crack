import { PANEL_LAYOUT_DEFAULTS, computeHintsListMaxHeight } from './panelLayout';

interface CompactPanelLayoutOptions {
    stats: HTMLElement | null;
    hints: HTMLElement | null;
    minimap: HTMLElement | null;
    width: number;
    height: number;
    legendHeight: number;
}

function setStyle(element: HTMLElement | null, property: 'maxWidth' | 'maxHeight' | 'overflowY' | 'bottom' | 'visibility', value: string): void {
    if (element && element.style[property] !== value) { element.style[property] = value; }
}

export function applyCompactPanelLayout({ stats, hints, minimap, width, height, legendHeight }: CompactPanelLayoutOptions): void {
    const bottom = PANEL_LAYOUT_DEFAULTS.baseBottom + Math.max(0, legendHeight);
    const visible = (panel: HTMLElement | null): boolean => Boolean(panel && panel.style.display !== 'none'
        && panel.style.visibility !== 'hidden' && panel.style.opacity !== '0');
    const statsVisible = visible(stats);
    const hintsVisible = visible(hints);
    const requestedWidth = (panel: HTMLElement | null): number => panel
        ? Number.parseFloat(panel.style.width) || panel.getBoundingClientRect().width : 0;
    const compact = width < 700 || (statsVisible && hintsVisible && requestedWidth(stats) + requestedWidth(hints) + 48 > width);
    const availableHeight = Math.max(0, height - bottom - PANEL_LAYOUT_DEFAULTS.topClearance);
    const gap = compact && statsVisible && hintsVisible ? 8 : 0;
    const maxHeight = compact && gap ? Math.max(0, Math.floor((availableHeight - gap) / 2)) : availableHeight;

    setStyle(stats, 'maxWidth', compact ? `${Math.max(0, width - 32)}px` : 'none');
    setStyle(hints, 'maxWidth', compact ? `${Math.max(0, width - 32)}px` : 'none');
    setStyle(stats, 'maxHeight', compact ? `${maxHeight}px` : '');
    setStyle(stats, 'overflowY', compact ? 'auto' : '');
    setStyle(hints, 'maxHeight', `${maxHeight}px`);
    setStyle(stats, 'bottom', `${bottom}px`);
    const statsHeight = compact && statsVisible && stats ? stats.getBoundingClientRect().height : 0;
    setStyle(hints, 'bottom', `${bottom + (hintsVisible ? statsHeight + gap : 0)}px`);
    const list = hints?.querySelector<HTMLElement>('.hints-list') || null;
    setStyle(list, 'maxHeight', `${compact ? Math.max(0, maxHeight - PANEL_LAYOUT_DEFAULTS.listChromeHeight) : computeHintsListMaxHeight(maxHeight)}px`);
    setStyle(minimap, 'visibility', compact ? 'hidden' : '');
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
    document.addEventListener('layout-state-changed', schedule);
    document.addEventListener('legend-bar-toggle', schedule);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
        resize?.disconnect();
        mutations?.disconnect();
        document.removeEventListener('layout-state-changed', schedule);
        document.removeEventListener('legend-bar-toggle', schedule);
        window.removeEventListener('resize', schedule);
        if (frame !== null) { cancelAnimationFrame(frame); }
    };
}
