import type { FlowEdge, ViewState } from '../types';

interface ApplyFocusModeOptions {
    enabled: boolean;
    nodeId: string;
    mainGroup: SVGGElement | null;
    connectedIds: Set<string>;
}

export function applyFocusModeFeature(options: ApplyFocusModeOptions): void {
    const { enabled, mainGroup, connectedIds, nodeId } = options;
    if (!enabled || !mainGroup) {
        return;
    }

    connectedIds.add(nodeId);

    mainGroup.querySelectorAll('.node').forEach((nodeEl) => {
        const id = nodeEl.getAttribute('data-id');
        (nodeEl as SVGGElement).style.opacity = id && !connectedIds.has(id) ? '0.25' : '1';
    });

    mainGroup.querySelectorAll('.edge').forEach((edgeEl) => {
        const source = edgeEl.getAttribute('data-source');
        const target = edgeEl.getAttribute('data-target');
        (edgeEl as SVGPathElement).style.opacity =
            source && target && connectedIds.has(source) && connectedIds.has(target) ? '1' : '0.15';
    });
}

interface ClearFocusModeOptions {
    mainGroup: SVGGElement | null;
    state: ViewState;
}

export function clearFocusModeFeature(options: ClearFocusModeOptions): void {
    const { mainGroup, state } = options;
    if (!mainGroup) {
        return;
    }

    state.zoomedNodeId = null;
    state.previousZoomState = null;
    state.focusModeEnabled = false;

    mainGroup.querySelectorAll('.node').forEach((nodeEl) => {
        (nodeEl as SVGGElement).style.display = '';
        (nodeEl as SVGGElement).style.opacity = '1';
    });

    mainGroup.querySelectorAll('.edge').forEach((edgeEl) => {
        (edgeEl as SVGPathElement).style.display = '';
        (edgeEl as SVGPathElement).style.opacity = '1';
    });
}

/** Keep the zoom-to-node neighborhood hidden consistently when virtualized elements remount. */
export function applyNodeZoomVisibilityFeature(nodeId: string, mainGroup: SVGGElement, edges: FlowEdge[]): Set<string> {
    const immediateNeighbors = new Set<string>([nodeId]);
    for (const edge of edges) {
        if (edge.target === nodeId) {
            immediateNeighbors.add(edge.source);
        }
        if (edge.source === nodeId) {
            immediateNeighbors.add(edge.target);
        }
    }

    mainGroup.querySelectorAll('.node').forEach((nodeEl) => {
        const id = nodeEl.getAttribute('data-id');
        if (id && !immediateNeighbors.has(id)) {
            (nodeEl as SVGGElement).style.display = 'none';
        } else {
            (nodeEl as SVGGElement).style.display = '';
            (nodeEl as SVGGElement).style.opacity = '1';
        }
    });

    mainGroup.querySelectorAll('.cloud-container').forEach((cloudEl) => {
        const nodeId = cloudEl.getAttribute('data-node-id');
        if (nodeId && immediateNeighbors.has(nodeId)) {
            (cloudEl as SVGGElement).style.display = '';
            (cloudEl as SVGGElement).style.opacity = '1';
        } else {
            (cloudEl as SVGGElement).style.display = 'none';
        }
    });

    mainGroup.querySelectorAll('.edge').forEach((edgeEl) => {
        const source = edgeEl.getAttribute('data-source');
        const target = edgeEl.getAttribute('data-target');
        if (source && target && immediateNeighbors.has(source) && immediateNeighbors.has(target)) {
            (edgeEl as SVGPathElement).style.display = '';
            (edgeEl as SVGPathElement).style.opacity = '1';
        } else {
            (edgeEl as SVGPathElement).style.display = 'none';
        }
    });

    return immediateNeighbors;
}
