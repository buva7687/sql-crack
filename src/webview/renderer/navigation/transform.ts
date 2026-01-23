// Transform and focus mode utilities

import { state, mainGroup } from '../state';

export function updateTransform(): void {
    if (mainGroup) {
        mainGroup.setAttribute('transform', `translate(${state.offsetX}, ${state.offsetY}) scale(${state.scale})`);
        // Update minimap viewport when panning/zooming
        const viewport = document.getElementById('minimap-viewport');
        if (viewport) {
            requestAnimationFrame(() => {
                const event = new CustomEvent('transform-update');
                document.dispatchEvent(event);
            });
        }
    }
}

export function clearFocusMode(): void {
    if (!mainGroup) {return;}

    const allNodes = mainGroup.querySelectorAll('.node');
    allNodes.forEach(nodeEl => {
        (nodeEl as SVGGElement).style.opacity = '1';
    });

    const allEdges = mainGroup.querySelectorAll('.edge');
    allEdges.forEach(edgeEl => {
        (edgeEl as SVGPathElement).style.opacity = '1';
    });
}
