import dagre from 'dagre';
import type { FlowEdge, FlowNode } from '../types';
import { getNodeAccentColor, NODE_SURFACE } from '../constants/colors';

export interface CloudSubflowRenderCallbacks {
    getNodeIcon: (type: FlowNode['type']) => string;
    hideTooltip: () => void;
    selectNode: (nodeId: string, options?: { skipNavigation?: boolean }) => void;
    showTooltip: (node: FlowNode, event: MouseEvent) => void;
    truncate: (value: string, maxLen: number) => string;
    updateTooltipPosition: (event: MouseEvent) => void;
}

export interface RenderCloudSubflowOptions extends CloudSubflowRenderCallbacks {
    childEdges: FlowEdge[];
    children: FlowNode[];
    group: SVGGElement;
    isDarkTheme: boolean;
    offsetX: number;
    offsetY: number;
}

export interface RenderSubflowOptions {
    childEdges: FlowEdge[];
    children: FlowNode[];
    containerHeight: number;
    containerWidth: number;
    getNodeIcon: (type: FlowNode['type']) => string;
    group: SVGGElement;
    isDarkTheme: boolean;
    offsetX: number;
    offsetY: number;
    parentNode: FlowNode;
    truncate: (value: string, maxLen: number) => string;
}

export function layoutSubflowNodes(children: FlowNode[], edges: FlowEdge[]): { width: number; height: number } {
    if (children.length === 0) {
        return { width: 200, height: 100 };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: 'LR',
        nodesep: 30,
        ranksep: 40,
        marginx: 20,
        marginy: 20,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const child of children) {
        const labelWidth = Math.max(80, child.label.length * 7 + 30);
        child.width = labelWidth;
        child.height = 36;
        g.setNode(child.id, { width: child.width, height: child.height });
    }

    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    let maxX = 0;
    let maxY = 0;
    for (const child of children) {
        const layoutNode = g.node(child.id);
        if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
            child.x = layoutNode.x - child.width / 2;
            child.y = layoutNode.y - child.height / 2;
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
        }
    }

    return {
        width: maxX + 20,
        height: maxY + 20,
    };
}

export function layoutSubflowNodesVertical(children: FlowNode[], edges: FlowEdge[]): { width: number; height: number } {
    if (children.length === 0) {
        return { width: 120, height: 100 };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: 'TB',
        nodesep: 20,
        ranksep: 35,
        marginx: 15,
        marginy: 15,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const child of children) {
        child.width = 180;
        child.height = 60;
        g.setNode(child.id, { width: child.width, height: child.height });
    }

    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    let maxX = 0;
    let maxY = 0;
    for (const child of children) {
        const layoutNode = g.node(child.id);
        if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
            child.x = layoutNode.x - child.width / 2;
            child.y = layoutNode.y - child.height / 2;
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
        }
    }

    return {
        width: maxX + 10,
        height: maxY + 10,
    };
}

export function renderCloudSubflow(options: RenderCloudSubflowOptions): void {
    const {
        childEdges,
        children,
        getNodeIcon,
        group,
        hideTooltip,
        isDarkTheme,
        offsetX,
        offsetY,
        selectNode,
        showTooltip,
        truncate,
        updateTooltipPosition,
    } = options;

    for (const edge of childEdges) {
        const sourceNode = children.find(n => n.id === edge.source);
        const targetNode = children.find(n => n.id === edge.target);

        if (!sourceNode || !targetNode) {
            continue;
        }

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const sourceX = offsetX + sourceNode.x + sourceNode.width / 2;
        const sourceY = offsetY + sourceNode.y + sourceNode.height;
        const targetX = offsetX + targetNode.x + targetNode.width / 2;
        const targetY = offsetY + targetNode.y;
        const midY = (sourceY + targetY) / 2;
        const d = `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;

        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', isDarkTheme ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        group.appendChild(path);
    }

    const cloudChildSurface = isDarkTheme ? NODE_SURFACE.dark : NODE_SURFACE.light;

    for (const child of children) {
        const childGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        childGroup.setAttribute('class', 'cloud-subflow-node');
        childGroup.setAttribute('data-node-id', child.id);
        childGroup.style.cursor = 'pointer';

        const childX = offsetX + child.x;
        const childY = offsetY + child.y;
        const childAccent = getNodeAccentColor(child.type, isDarkTheme);
        const hoverFill = isDarkTheme ? '#222222' : '#F1F5F9';

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(childX));
        rect.setAttribute('y', String(childY));
        rect.setAttribute('width', String(child.width));
        rect.setAttribute('height', String(child.height));
        rect.setAttribute('rx', '6');
        rect.setAttribute('fill', cloudChildSurface.fill);
        rect.setAttribute('stroke', cloudChildSurface.border);
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('filter', 'url(#shadow)');
        childGroup.appendChild(rect);

        const childAccentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        childAccentStrip.setAttribute('x', String(childX));
        childAccentStrip.setAttribute('y', String(childY));
        childAccentStrip.setAttribute('width', '3');
        childAccentStrip.setAttribute('height', String(child.height));
        childAccentStrip.setAttribute('clip-path', 'inset(0 0 0 0 round 6px 0 0 6px)');
        childAccentStrip.setAttribute('fill', childAccent);
        childGroup.appendChild(childAccentStrip);

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        icon.setAttribute('x', String(childX + 14));
        icon.setAttribute('y', String(childY + 26));
        icon.setAttribute('fill', childAccent);
        icon.setAttribute('font-size', '14');
        icon.textContent = getNodeIcon(child.type);
        childGroup.appendChild(icon);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(childX + 34));
        label.setAttribute('y', String(childY + 26));
        label.setAttribute('fill', cloudChildSurface.text);
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', '600');
        label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        label.textContent = truncate(child.label, 18);
        childGroup.appendChild(label);

        if (child.description) {
            const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            descText.setAttribute('x', String(childX + 14));
            descText.setAttribute('y', String(childY + 45));
            descText.setAttribute('fill', cloudChildSurface.textMuted);
            descText.setAttribute('font-size', '10');
            descText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
            descText.textContent = truncate(child.description, 22);
            childGroup.appendChild(descText);
        }

        childGroup.addEventListener('mouseenter', e => {
            rect.setAttribute('fill', hoverFill);
            showTooltip(child, e as MouseEvent);
        });
        childGroup.addEventListener('mousemove', e => {
            updateTooltipPosition(e as MouseEvent);
        });
        childGroup.addEventListener('mouseleave', () => {
            rect.setAttribute('fill', cloudChildSurface.fill);
            hideTooltip();
        });

        childGroup.addEventListener('click', (event) => {
            event.stopPropagation();
            const skipNav = !(event.ctrlKey || event.metaKey);
            selectNode(child.id, { skipNavigation: skipNav });
            hideTooltip();
        });

        group.appendChild(childGroup);
    }
}

export function renderSubflow(options: RenderSubflowOptions): void {
    const {
        childEdges,
        children,
        containerHeight,
        containerWidth,
        getNodeIcon,
        group,
        isDarkTheme,
        offsetX,
        offsetY,
        parentNode,
        truncate,
    } = options;

    const clipId = `clip-${parentNode.id}`;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', clipId);
    const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    clipRect.setAttribute('x', String(offsetX));
    clipRect.setAttribute('y', String(offsetY));
    clipRect.setAttribute('width', String(containerWidth));
    clipRect.setAttribute('height', String(containerHeight));
    clipRect.setAttribute('rx', '6');
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    group.appendChild(defs);

    const subflowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    subflowGroup.setAttribute('class', 'subflow-group');
    subflowGroup.setAttribute('clip-path', `url(#${clipId})`);

    const sfSurface = isDarkTheme ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const sfEdgeColor = isDarkTheme ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
    const sfBgColor = isDarkTheme ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.03)';

    const subflowBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    subflowBg.setAttribute('x', String(offsetX));
    subflowBg.setAttribute('y', String(offsetY));
    subflowBg.setAttribute('width', String(containerWidth));
    subflowBg.setAttribute('height', String(containerHeight));
    subflowBg.setAttribute('rx', '6');
    subflowBg.setAttribute('fill', sfBgColor);
    subflowGroup.appendChild(subflowBg);

    for (const edge of childEdges) {
        const sourceNode = children.find(n => n.id === edge.source);
        const targetNode = children.find(n => n.id === edge.target);

        if (!sourceNode || !targetNode) {
            continue;
        }

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const sourceX = offsetX + sourceNode.x + sourceNode.width;
        const sourceY = offsetY + sourceNode.y + sourceNode.height / 2;
        const targetX = offsetX + targetNode.x;
        const targetY = offsetY + targetNode.y + targetNode.height / 2;
        const midX = (sourceX + targetX) / 2;
        const d = `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;

        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', sfEdgeColor);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        subflowGroup.appendChild(path);
    }

    for (const child of children) {
        const childGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        childGroup.setAttribute('class', 'subflow-node');

        const childX = offsetX + child.x;
        const childY = offsetY + child.y;
        const sfChildAccent = getNodeAccentColor(child.type, isDarkTheme);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(childX));
        rect.setAttribute('y', String(childY));
        rect.setAttribute('width', String(child.width));
        rect.setAttribute('height', String(child.height));
        rect.setAttribute('rx', '6');
        rect.setAttribute('fill', sfSurface.fill);
        rect.setAttribute('stroke', sfSurface.border);
        rect.setAttribute('stroke-width', '1');
        childGroup.appendChild(rect);

        const sfAccent = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        sfAccent.setAttribute('x', String(childX));
        sfAccent.setAttribute('y', String(childY));
        sfAccent.setAttribute('width', '3');
        sfAccent.setAttribute('height', String(child.height));
        sfAccent.setAttribute('clip-path', 'inset(0 0 0 0 round 6px 0 0 6px)');
        sfAccent.setAttribute('fill', sfChildAccent);
        childGroup.appendChild(sfAccent);

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        icon.setAttribute('x', String(childX + 8));
        icon.setAttribute('y', String(childY + child.height / 2 + 4));
        icon.setAttribute('fill', sfChildAccent);
        icon.setAttribute('font-size', '11');
        icon.textContent = getNodeIcon(child.type);
        childGroup.appendChild(icon);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(childX + 22));
        label.setAttribute('y', String(childY + child.height / 2 + 4));
        label.setAttribute('fill', sfSurface.text);
        label.setAttribute('font-size', '10');
        label.setAttribute('font-weight', '500');
        label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        label.textContent = truncate(child.label, 14);
        childGroup.appendChild(label);

        subflowGroup.appendChild(childGroup);
    }

    group.appendChild(subflowGroup);
}
