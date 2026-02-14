import type { EventListenerCallbacks, EventListenerContext } from './eventListenerTypes';

export function registerDragListeners(
    context: EventListenerContext,
    callbacks: EventListenerCallbacks
): void {
    const { state, getSvg, getMainGroup, getCurrentNodes, cloudOffsets } = context;
    const svg = getSvg();
    if (!svg) {
        return;
    }

    svg.addEventListener('mousedown', (e) => {
        const target = e.target as Element;
        const cloudGroup = target.closest('.cloud-container');
        const nodeGroup = target.closest('.node[data-id]');
        if (cloudGroup || nodeGroup) {
            return;
        }
        if (e.target === svg || target.tagName === 'svg') {
            state.isDragging = true;
            state.dragStartX = e.clientX - state.offsetX;
            state.dragStartY = e.clientY - state.offsetY;
            svg.style.cursor = 'grabbing';
        }
    });

    svg.addEventListener('mousemove', (e) => {
        if (state.isDraggingCloud && state.draggingCloudNodeId) {
            const rect = svg.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - state.offsetX) / state.scale;
            const mouseY = (e.clientY - rect.top - state.offsetY) / state.scale;

            const node = getCurrentNodes().find(n => n.id === state.draggingCloudNodeId);
            if (node) {
                const deltaX = mouseX - state.dragMouseStartX;
                const deltaY = mouseY - state.dragMouseStartY;

                const newOffsetX = state.dragCloudStartOffsetX + deltaX;
                const newOffsetY = state.dragCloudStartOffsetY + deltaY;

                cloudOffsets.set(node.id, { offsetX: newOffsetX, offsetY: newOffsetY });
                callbacks.updateCloudAndArrow(node);
            }
        } else if (state.isDraggingNode && state.draggingNodeId) {
            const rect = svg.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - state.offsetX) / state.scale;
            const mouseY = (e.clientY - rect.top - state.offsetY) / state.scale;

            const deltaX = mouseX - state.dragMouseStartX;
            const deltaY = mouseY - state.dragMouseStartY;

            const node = getCurrentNodes().find(n => n.id === state.draggingNodeId);
            if (node) {
                node.x = state.dragNodeStartX + deltaX;
                node.y = state.dragNodeStartY + deltaY;

                const nodeGroup = getMainGroup()?.querySelector(`.node[data-id="${node.id}"]`) as SVGGElement;
                if (nodeGroup) {
                    const nodeRect = nodeGroup.querySelector('.node-rect') as SVGRectElement;
                    if (nodeRect) {
                        const origX = parseFloat(nodeRect.getAttribute('x') || '0');
                        const origY = parseFloat(nodeRect.getAttribute('y') || '0');
                        nodeGroup.setAttribute('transform', `translate(${node.x - origX}, ${node.y - origY})`);
                    }
                }

                callbacks.updateCloudAndArrow(node);
                callbacks.updateNodeEdges(node);
            }
        } else if (state.isDragging) {
            state.offsetX = e.clientX - state.dragStartX;
            state.offsetY = e.clientY - state.dragStartY;
            callbacks.updateTransform();
        }
    });

    const completeDrag = () => {
        const shouldRecordHistory = state.isDragging || state.isDraggingNode || state.isDraggingCloud;

        if (state.isDraggingCloud && state.draggingCloudNodeId) {
            const cloudGroup = getMainGroup()?.querySelector(`.cloud-container[data-node-id="${state.draggingCloudNodeId}"]`) as SVGGElement;
            if (cloudGroup) {
                cloudGroup.style.opacity = '1';
            }
        }

        if (state.isDraggingNode && state.draggingNodeId) {
            const nodeGroup = getMainGroup()?.querySelector(`.node[data-id="${state.draggingNodeId}"]`) as SVGGElement;
            if (nodeGroup) {
                nodeGroup.style.opacity = '1';
            }
        }

        state.isDragging = false;
        state.isDraggingNode = false;
        state.isDraggingCloud = false;
        state.draggingNodeId = null;
        state.draggingCloudNodeId = null;
        svg.style.cursor = 'grab';

        if (shouldRecordHistory) {
            callbacks.recordLayoutHistorySnapshot();
        }
    };

    svg.addEventListener('mouseup', completeDrag);
    svg.addEventListener('mouseleave', completeDrag);
}
