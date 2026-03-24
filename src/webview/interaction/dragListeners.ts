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
    let activeDraggedCloudNode: ReturnType<EventListenerContext['getCurrentNodes']>[number] | null = null;
    let activeDraggedNode: ReturnType<EventListenerContext['getCurrentNodes']>[number] | null = null;
    let activeDraggedNodeGroup: SVGGElement | null = null;
    let activeDraggedNodeRectOrigin: { x: number; y: number } | null = null;

    const clearDragCaches = (): void => {
        activeDraggedCloudNode = null;
        activeDraggedNode = null;
        activeDraggedNodeGroup = null;
        activeDraggedNodeRectOrigin = null;
    };

    const canStartCanvasDrag = (target: Element): boolean => {
        const cloudGroup = target.closest('.cloud-container');
        const nodeGroup = target.closest('.node[data-id]');
        if (cloudGroup || nodeGroup) {
            return false;
        }
        return target === svg || target.tagName.toLowerCase() === 'svg';
    };

    svg.addEventListener('mousedown', (e) => {
        const target = e.target as Element;
        if (!canStartCanvasDrag(target)) {
            return;
        }
        state.isDragging = true;
        state.dragStartX = e.clientX - state.offsetX;
        state.dragStartY = e.clientY - state.offsetY;
        svg.style.cursor = 'grabbing';
    });

    svg.addEventListener('mousemove', (e) => {
        if (state.isDraggingCloud && state.draggingCloudNodeId) {
            if (!activeDraggedCloudNode || activeDraggedCloudNode.id !== state.draggingCloudNodeId) {
                activeDraggedCloudNode = getCurrentNodes().find(n => n.id === state.draggingCloudNodeId) || null;
            }
            const node = activeDraggedCloudNode;
            if (node) {
                const lastClientX = state.dragPointerLastClientX ?? e.clientX;
                const lastClientY = state.dragPointerLastClientY ?? e.clientY;
                const deltaX = (e.clientX - lastClientX) / state.scale;
                const deltaY = (e.clientY - lastClientY) / state.scale;
                const currentOffset = cloudOffsets.get(node.id) || {
                    offsetX: state.dragCloudStartOffsetX,
                    offsetY: state.dragCloudStartOffsetY,
                };
                const nextOffset = {
                    offsetX: currentOffset.offsetX + deltaX,
                    offsetY: currentOffset.offsetY + deltaY,
                };

                cloudOffsets.set(node.id, nextOffset);
                state.dragPointerLastClientX = e.clientX;
                state.dragPointerLastClientY = e.clientY;
                callbacks.updateCloudAndArrow(node);
            }
        } else if (state.isDraggingNode && state.draggingNodeId) {
            const rect = svg.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - state.offsetX) / state.scale;
            const mouseY = (e.clientY - rect.top - state.offsetY) / state.scale;

            const deltaX = mouseX - state.dragMouseStartX;
            const deltaY = mouseY - state.dragMouseStartY;

            if (!activeDraggedNode || activeDraggedNode.id !== state.draggingNodeId) {
                activeDraggedNode = getCurrentNodes().find(n => n.id === state.draggingNodeId) || null;
            }
            const node = activeDraggedNode;
            if (node) {
                node.x = state.dragNodeStartX + deltaX;
                node.y = state.dragNodeStartY + deltaY;

                if (!activeDraggedNodeGroup || activeDraggedNodeGroup.getAttribute('data-id') !== node.id) {
                    activeDraggedNodeGroup = getMainGroup()?.querySelector(`.node[data-id="${node.id}"]`) as SVGGElement | null;
                    const nodeRect = activeDraggedNodeGroup?.querySelector('.node-rect') as SVGRectElement | null;
                    activeDraggedNodeRectOrigin = nodeRect
                        ? {
                            x: parseFloat(nodeRect.getAttribute('x') || '0'),
                            y: parseFloat(nodeRect.getAttribute('y') || '0'),
                        }
                        : null;
                }
                const nodeGroup = activeDraggedNodeGroup;
                if (nodeGroup) {
                    if (activeDraggedNodeRectOrigin) {
                        nodeGroup.setAttribute('transform', `translate(${node.x - activeDraggedNodeRectOrigin.x}, ${node.y - activeDraggedNodeRectOrigin.y})`);
                    }
                }

                // Cloud follows via group transform — don't recalculate
                // (updateCloudAndArrow uses absolute node.x/y but coordinates
                // are in group-local space, causing double-offset)
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
        state.dragPointerLastClientX = null;
        state.dragPointerLastClientY = null;
        clearDragCaches();
        svg.style.cursor = 'grab';

        if (shouldRecordHistory) {
            callbacks.recordLayoutHistorySnapshot();
        }
    };

    svg.addEventListener('mouseup', completeDrag);
    svg.addEventListener('mouseleave', completeDrag);

    let activePointerId: number | null = null;
    svg.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' || e.pointerType === 'touch') {
            return;
        }
        const target = e.target as Element;
        if (!canStartCanvasDrag(target)) {
            return;
        }
        activePointerId = e.pointerId;
        state.isDragging = true;
        state.dragStartX = e.clientX - state.offsetX;
        state.dragStartY = e.clientY - state.offsetY;
        svg.style.cursor = 'grabbing';
        if (svg.setPointerCapture) {
            svg.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
    });

    svg.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse' || e.pointerType === 'touch' || activePointerId !== e.pointerId || !state.isDragging) {
            return;
        }
        state.offsetX = e.clientX - state.dragStartX;
        state.offsetY = e.clientY - state.dragStartY;
        callbacks.updateTransform();
        e.preventDefault();
    });

    const completePointerDrag = (e: PointerEvent) => {
        if (e.pointerType === 'mouse' || e.pointerType === 'touch' || activePointerId !== e.pointerId) {
            return;
        }
        if (svg.releasePointerCapture && svg.hasPointerCapture?.(e.pointerId)) {
            svg.releasePointerCapture(e.pointerId);
        }
        activePointerId = null;
        completeDrag();
        e.preventDefault();
    };

    svg.addEventListener('pointerup', completePointerDrag);
    svg.addEventListener('pointercancel', completePointerDrag);
}
