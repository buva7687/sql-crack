export const MINIMAP_NODE_VISIBILITY_THRESHOLD = 2;

export type MinimapMode = 'auto' | 'always' | 'never';

let minimapMode: MinimapMode = 'auto';

/**
 * Set the minimap display mode.
 */
export function setMinimapMode(mode: MinimapMode): void {
    minimapMode = mode;
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
