export interface PanelLayoutConfig {
    baseBottom: number;
    topClearance: number;
    minPanelHeight: number;
    listChromeHeight: number;
    minListHeight: number;
}

export const PANEL_LAYOUT_DEFAULTS: PanelLayoutConfig = {
    baseBottom: 16,
    topClearance: 92,
    minPanelHeight: 160,
    listChromeHeight: 96,
    minListHeight: 84,
};

export function parsePixelValue(raw: string | null | undefined, fallback: number): number {
    if (!raw) { return fallback; }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function computeHintsPanelMaxHeight(
    viewportHeight: number,
    bottomPx: number,
    config: PanelLayoutConfig = PANEL_LAYOUT_DEFAULTS,
): number {
    const availableHeight = Math.max(
        config.minPanelHeight,
        viewportHeight - bottomPx - config.topClearance
    );
    return Math.floor(availableHeight);
}

export function computeHintsListMaxHeight(
    panelMaxHeight: number,
    config: PanelLayoutConfig = PANEL_LAYOUT_DEFAULTS,
): number {
    return Math.max(config.minListHeight, Math.floor(panelMaxHeight - config.listChromeHeight));
}

export function applyHintsPanelViewportBounds(
    hintsPanel: HTMLDivElement | null,
    bottomPx: number,
    viewportHeight: number,
    config: PanelLayoutConfig = PANEL_LAYOUT_DEFAULTS,
): void {
    if (!hintsPanel) { return; }

    const maxPanelHeight = computeHintsPanelMaxHeight(viewportHeight, bottomPx, config);
    hintsPanel.style.maxHeight = `${maxPanelHeight}px`;

    const hintsList = hintsPanel.querySelector('.hints-list') as HTMLDivElement | null;
    if (hintsList) {
        const maxListHeight = computeHintsListMaxHeight(maxPanelHeight, config);
        hintsList.style.maxHeight = `${maxListHeight}px`;
    }
}

export function applyPanelBottomOffsets(
    panels: { statsPanel?: HTMLDivElement | null; hintsPanel?: HTMLDivElement | null },
    legendHeight: number,
    viewportHeight: number,
    config: PanelLayoutConfig = PANEL_LAYOUT_DEFAULTS,
): number {
    const legendOffset = Math.max(0, Math.ceil(legendHeight));
    const bottomPx = config.baseBottom + legendOffset;
    const bottom = `${bottomPx}px`;

    if (panels.statsPanel) {
        panels.statsPanel.style.bottom = bottom;
    }
    if (panels.hintsPanel) {
        panels.hintsPanel.style.bottom = bottom;
        applyHintsPanelViewportBounds(panels.hintsPanel, bottomPx, viewportHeight, config);
    }

    return bottomPx;
}
