import type { ViewState } from '../types';

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
