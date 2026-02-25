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
    }, { passive: false });

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

    const getTouchDistance = (touches: TouchList): number => {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    let pinchState: {
        startDistance: number;
        startScale: number;
        startOffsetX: number;
        startOffsetY: number;
    } | null = null;

    svg.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            state.isDragging = true;
            state.dragStartX = touch.clientX - state.offsetX;
            state.dragStartY = touch.clientY - state.offsetY;
            pinchState = null;
            e.preventDefault();
            return;
        }

        if (e.touches.length === 2) {
            state.isDragging = false;
            pinchState = {
                startDistance: getTouchDistance(e.touches),
                startScale: state.scale,
                startOffsetX: state.offsetX,
                startOffsetY: state.offsetY,
            };
            e.preventDefault();
        }
    }, { passive: false });

    svg.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && state.isDragging) {
            const touch = e.touches[0];
            state.offsetX = touch.clientX - state.dragStartX;
            state.offsetY = touch.clientY - state.dragStartY;
            callbacks.updateTransform();
            e.preventDefault();
            return;
        }

        if (e.touches.length === 2 && pinchState) {
            const newDistance = getTouchDistance(e.touches);
            const rect = svg.getBoundingClientRect();
            const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
            const centerY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
            const pinchScale = newDistance / pinchState.startDistance;
            const newScale = Math.min(Math.max(pinchState.startScale * pinchScale, 0.2), 3);

            state.offsetX = centerX - (centerX - pinchState.startOffsetX) * (newScale / pinchState.startScale);
            state.offsetY = centerY - (centerY - pinchState.startOffsetY) * (newScale / pinchState.startScale);
            state.scale = newScale;

            callbacks.updateTransform();
            callbacks.updateZoomIndicator();
            e.preventDefault();
        }
    }, { passive: false });

    svg.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            state.isDragging = false;
            pinchState = null;
            return;
        }

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            state.isDragging = true;
            state.dragStartX = touch.clientX - state.offsetX;
            state.dragStartY = touch.clientY - state.offsetY;
            pinchState = null;
        }
    }, { passive: true });

    svg.addEventListener('touchcancel', () => {
        state.isDragging = false;
        pinchState = null;
    }, { passive: true });
}
