import type { FlowNode } from '../types';

export interface MinimapState {
    offsetX: number;
    offsetY: number;
    scale: number;
}

export interface MinimapContext {
    calculateBounds: () => { minX: number; minY: number; width: number; height: number };
    currentNodes: FlowNode[];
    getNodeColor: (type: FlowNode['type']) => string;
    renderNodes: FlowNode[];
    shouldShowMinimap: (nodeCount: number) => boolean;
    state: MinimapState;
    svg: SVGSVGElement | null;
}

export function updateMinimap(context: MinimapContext, updateViewport: () => void): void {
    const minimapContainer = document.getElementById('minimap-container');
    const minimapSvg = document.getElementById('minimap-svg') as SVGSVGElement | null;
    const nodesForMinimap = context.renderNodes.length > 0 ? context.renderNodes : context.currentNodes;

    if (!minimapContainer || !minimapSvg || !context.shouldShowMinimap(nodesForMinimap.length)) {
        if (minimapContainer) {
            minimapContainer.style.display = 'none';
        }
        return;
    }

    minimapContainer.style.display = 'block';

    const bounds = context.calculateBounds();
    const padding = 10;
    const mapWidth = 150;
    const mapHeight = 100;

    const scaleX = (mapWidth - padding * 2) / bounds.width;
    const scaleY = (mapHeight - padding * 2) / bounds.height;
    const mapScale = Math.min(scaleX, scaleY, 0.15);

    minimapSvg.innerHTML = '';

    for (const node of nodesForMinimap) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String((node.x - bounds.minX) * mapScale + padding));
        rect.setAttribute('y', String((node.y - bounds.minY) * mapScale + padding));
        rect.setAttribute('width', String(Math.max(4, node.width * mapScale)));
        rect.setAttribute('height', String(Math.max(3, node.height * mapScale)));
        rect.setAttribute('fill', context.getNodeColor(node.type));
        rect.setAttribute('rx', '1');
        minimapSvg.appendChild(rect);
    }

    updateViewport();
}

export function updateMinimapViewport(context: MinimapContext): void {
    const viewport = document.getElementById('minimap-viewport');
    const minimapContainer = document.getElementById('minimap-container');
    const nodesForMinimap = context.renderNodes.length > 0 ? context.renderNodes : context.currentNodes;

    if (!viewport || !minimapContainer || !context.svg || !context.shouldShowMinimap(nodesForMinimap.length)) {
        return;
    }

    const bounds = context.calculateBounds();
    const svgRect = context.svg.getBoundingClientRect();
    const mapWidth = 150;
    const mapHeight = 100;
    const padding = 10;

    const scaleX = (mapWidth - padding * 2) / bounds.width;
    const scaleY = (mapHeight - padding * 2) / bounds.height;
    const mapScale = Math.min(scaleX, scaleY, 0.15);

    const visibleLeft = -context.state.offsetX / context.state.scale;
    const visibleTop = -context.state.offsetY / context.state.scale;
    const visibleWidth = svgRect.width / context.state.scale;
    const visibleHeight = svgRect.height / context.state.scale;

    const vpLeft = (visibleLeft - bounds.minX) * mapScale + padding;
    const vpTop = (visibleTop - bounds.minY) * mapScale + padding;
    const vpWidth = visibleWidth * mapScale;
    const vpHeight = visibleHeight * mapScale;

    viewport.style.left = `${Math.max(0, vpLeft)}px`;
    viewport.style.top = `${Math.max(0, vpTop)}px`;
    viewport.style.width = `${Math.min(mapWidth, vpWidth)}px`;
    viewport.style.height = `${Math.min(mapHeight, vpHeight)}px`;
}

export function setupMinimapDrag(
    minimapContainer: HTMLDivElement,
    context: MinimapContext,
    updateTransform: () => void
): void {
    let dragging = false;

    function panToMinimapPosition(event: MouseEvent): void {
        if (!context.svg) {
            return;
        }
        const nodesForMinimap = context.renderNodes.length > 0 ? context.renderNodes : context.currentNodes;
        if (!context.shouldShowMinimap(nodesForMinimap.length)) {
            return;
        }

        const bounds = context.calculateBounds();
        const svgRect = context.svg.getBoundingClientRect();
        const containerRect = minimapContainer.getBoundingClientRect();
        const mapWidth = 150;
        const mapHeight = 100;
        const padding = 10;

        const scaleX = (mapWidth - padding * 2) / bounds.width;
        const scaleY = (mapHeight - padding * 2) / bounds.height;
        const mapScale = Math.min(scaleX, scaleY, 0.15);

        const clickX = event.clientX - containerRect.left;
        const clickY = event.clientY - containerRect.top;

        const graphX = (clickX - padding) / mapScale + bounds.minX;
        const graphY = (clickY - padding) / mapScale + bounds.minY;

        const visibleWidth = svgRect.width / context.state.scale;
        const visibleHeight = svgRect.height / context.state.scale;

        context.state.offsetX = -(graphX - visibleWidth / 2) * context.state.scale;
        context.state.offsetY = -(graphY - visibleHeight / 2) * context.state.scale;

        updateTransform();
    }

    function onMouseMove(event: MouseEvent): void {
        if (dragging) {
            panToMinimapPosition(event);
        }
    }

    function onMouseUp(): void {
        dragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    minimapContainer.addEventListener('mousedown', (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        dragging = true;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        panToMinimapPosition(event);
    });
}
