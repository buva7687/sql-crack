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

/** Smallest space left between two floating panels. */
export const FLOATING_PANEL_GAP = 8;
/** Lowest height the hints panel is squeezed to so a pinned minimap can stay above it. */
export const HINTS_MIN_HEIGHT_BELOW_MINIMAP = 48;

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
    panels: { statsPanel?: HTMLDivElement | null; hintsPanel?: HTMLDivElement | null; clausePanel?: HTMLElement | null },
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
    if (panels.clausePanel) {
        panels.clausePanel.style.bottom = bottom;
    }

    return bottomPx;
}

export interface MinimapPlacementInput {
    /** `sqlCrack.showMinimap` is `always`: the minimap stays and the hints panel yields. */
    pinned: boolean;
    containerHeight: number;
    minimapHeight: number;
    /** Highest position the minimap may take, below the toolbar and query tabs. */
    minTop: number;
    /** Top edge of the visible hints panel, or null when it is hidden. */
    hintsTop: number | null;
    /** Bottom edge of the hints panel; lets a pinned minimap give way when the panel would be squeezed away. */
    hintsBottom?: number;
    gap?: number;
}

export interface MinimapPlacement {
    visible: boolean;
    /** Top offset in px, or null to keep the default vertically centred position. */
    top: number | null;
    /** Set when the hints panel has to shrink to stay below a pinned minimap. */
    hintsTopLimit: number | null;
}

/**
 * The minimap sits at the vertical centre of the right edge and the hints panel
 * grows up from the bottom of the same edge. When the two would meet, raise the
 * minimap just enough to clear the panel. If it cannot go that high, hide an
 * `auto` minimap, or keep a pinned one and bound the hints panel instead. Even
 * a pinned minimap is hidden when that would leave the panel less than its header.
 */
export function computeMinimapPlacement(input: MinimapPlacementInput): MinimapPlacement {
    const { pinned, containerHeight, minimapHeight, minTop, hintsTop } = input;
    const gap = input.gap ?? FLOATING_PANEL_GAP;
    const centredTop = (containerHeight - minimapHeight) / 2;

    if (hintsTop === null || hintsTop - gap >= centredTop + minimapHeight) {
        return { visible: true, top: null, hintsTopLimit: null };
    }

    const raisedTop = Math.floor(hintsTop - gap - minimapHeight);
    if (raisedTop >= minTop) {
        return { visible: true, top: raisedTop, hintsTopLimit: null };
    }
    if (!pinned) {
        return { visible: false, top: null, hintsTopLimit: null };
    }

    const pinnedTop = Math.min(Math.ceil(minTop), Math.floor(centredTop));
    const hintsTopLimit = pinnedTop + minimapHeight + gap;
    if (input.hintsBottom !== undefined && input.hintsBottom - hintsTopLimit < HINTS_MIN_HEIGHT_BELOW_MINIMAP) {
        return { visible: false, top: null, hintsTopLimit: null };
    }
    return { visible: true, top: pinnedTop, hintsTopLimit };
}
