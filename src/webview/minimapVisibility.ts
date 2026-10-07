export const MINIMAP_NODE_VISIBILITY_THRESHOLD = 2;

export type MinimapMode = 'auto' | 'always' | 'never';

let minimapMode: MinimapMode = 'auto';

const minimapModeListeners = new Set<() => void>();

/**
 * Set the minimap display mode.
 */
export function setMinimapMode(mode: MinimapMode): void {
    if (minimapMode === mode) { return; }
    minimapMode = mode;
    minimapModeListeners.forEach(listener => listener());
}

/** Run `listener` whenever the mode changes; returns the unsubscribe function. */
export function onMinimapModeChange(listener: () => void): () => void {
    minimapModeListeners.add(listener);
    return () => { minimapModeListeners.delete(listener); };
}

export function getMinimapMode(): MinimapMode {
    return minimapMode;
}

/**
 * Show minimap based on the configured mode:
 * - 'auto': show when node count meets threshold (2+)
 * - 'always': always show
 * - 'never': never show
 */
export function shouldShowMinimap(nodeCount: number): boolean {
    if (minimapMode === 'always') { return true; }
    if (minimapMode === 'never') { return false; }
    return nodeCount >= MINIMAP_NODE_VISIBILITY_THRESHOLD;
}
