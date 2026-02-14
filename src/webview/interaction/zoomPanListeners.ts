import type { EventListenerCallbacks, EventListenerContext } from './eventListenerTypes';

export function registerZoomPanListeners(
    context: EventListenerContext,
    callbacks: EventListenerCallbacks
): void {
    const { state, getSvg } = context;
    const svg = getSvg();
    if (!svg) {
        return;
    }

    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(state.scale * delta, 0.2), 3);

        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        state.offsetX = mouseX - (mouseX - state.offsetX) * (newScale / state.scale);
        state.offsetY = mouseY - (mouseY - state.offsetY) * (newScale / state.scale);
        state.scale = newScale;

        callbacks.updateTransform();
        callbacks.updateZoomIndicator();
    });

    svg.addEventListener('click', (e) => {
        if (e.target === svg) {
            const wasZoomed = state.zoomedNodeId !== null;
            callbacks.selectNode(null);
            callbacks.clearFocusMode();
            if (wasZoomed) {
                callbacks.fitView();
                callbacks.updateZoomIndicator();
            }
        }
    });
}
