export const MINIMAP_NODE_VISIBILITY_THRESHOLD = 2;

/**
 * Show minimap for normal parsed query graphs (2+ nodes), and hide for
 * trivial/empty/error states.
 */
export function shouldShowMinimap(nodeCount: number): boolean {
    return nodeCount >= MINIMAP_NODE_VISIBILITY_THRESHOLD;
}

