import type {
    CloudElements,
    CloudViewState,
    FlowEdge,
    FlowNode,
    ViewState,
} from '../types';
import { CLOSE_BUTTON_COLORS, UI_COLORS } from '../constants';
import { MONO_FONT_STACK } from '../../shared/themeTokens';
import { getNodeAccentColor, NODE_SURFACE } from '../constants/colors';
import {
    EXPANDABLE_CLOUD_GAP,
    EXPANDABLE_CLOUD_HEADER_HEIGHT,
    EXPANDABLE_CLOUD_PADDING,
    EXPANDABLE_NODE_HEIGHT,
    EXPANDABLE_NODE_WIDTH,
} from './expandableNodeConstants';

export interface ContainerNodeRendererDeps {
    state: ViewState;
    svg: SVGSVGElement;
    cloudOffsets: Map<string, { offsetX: number; offsetY: number }>;
    cloudElements: Map<string, CloudElements>;
    cloudViewStates: Map<string, CloudViewState>;
    getNodeIcon: (type: FlowNode['type']) => string;
    truncate: (value: string, maxLen: number) => string;
    ensureCloudViewState: (nodeId: string) => CloudViewState;
    layoutSubflowNodesVertical: (children: FlowNode[], edges: FlowEdge[]) => { width: number; height: number };
    renderCloudSubflow: (
        parentNode: FlowNode,
        children: FlowNode[],
        childEdges: FlowEdge[],
        group: SVGGElement,
        offsetX: number,
        offsetY: number,
        containerWidth: number,
        containerHeight: number
    ) => void;
    onRequestRerender: () => void;
}

export function renderSubqueryNodeVisual(
    node: FlowNode,
    group: SVGGElement,
    isExpanded: boolean,
    hasChildren: boolean | undefined,
    deps: ContainerNodeRendererDeps
): void {
    const nodeWidth = EXPANDABLE_NODE_WIDTH;
    const nodeHeight = EXPANDABLE_NODE_HEIGHT;
    const cloudGap = EXPANDABLE_CLOUD_GAP;
    const cloudPadding = EXPANDABLE_CLOUD_PADDING;

    node.width = nodeWidth;
    node.height = nodeHeight;

    let cloudWidth = 160;
    let cloudHeight = 150;
    const childEdges = node.childEdges || [];
    if (isExpanded && hasChildren && node.children) {
        const layoutSize = deps.layoutSubflowNodesVertical(node.children, childEdges);
        cloudWidth = layoutSize.width + cloudPadding * 2;
        cloudHeight = layoutSize.height + cloudPadding * 2 + EXPANDABLE_CLOUD_HEADER_HEIGHT;
    }

    if (isExpanded && hasChildren && node.children) {
        renderExpandedCloud({
            accentType: 'subquery',
            childEdges,
            cloudGap,
            cloudHeight,
            cloudPadding,
            cloudWidth,
            deps,
            group,
            node,
            nodeHeight,
            nodeWidth,
            titleText: node.label,
            titleTruncatePrefix: '',
        });
    }

    const sqIsDark = deps.state.isDarkTheme;
    const sqSurface = sqIsDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const sqAccent = getNodeAccentColor('subquery', sqIsDark);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(nodeWidth));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', sqSurface.fill);
    rect.setAttribute('stroke', sqAccent);
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '6,3');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    const sqAccentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    sqAccentStrip.setAttribute('x', String(node.x));
    sqAccentStrip.setAttribute('y', String(node.y));
    sqAccentStrip.setAttribute('width', '3');
    sqAccentStrip.setAttribute('height', String(nodeHeight));
    sqAccentStrip.setAttribute('clip-path', 'inset(0 0 0 0 round 6px 0 0 6px)');
    sqAccentStrip.setAttribute('fill', sqAccent);
    group.appendChild(sqAccentStrip);

    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', String(node.x + 12));
    iconText.setAttribute('y', String(node.y + 26));
    iconText.setAttribute('fill', sqAccent);
    iconText.setAttribute('font-size', '14');
    iconText.textContent = '⊂';
    group.appendChild(iconText);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 30));
    label.setAttribute('y', String(node.y + 26));
    label.setAttribute('fill', sqSurface.text);
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', MONO_FONT_STACK);
    label.textContent = deps.truncate(node.label, 14);
    group.appendChild(label);

    const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    descText.setAttribute('x', String(node.x + 12));
    descText.setAttribute('y', String(node.y + 45));
    descText.setAttribute('fill', sqSurface.textMuted);
    descText.setAttribute('font-size', '10');
    descText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    if (hasChildren && node.children) {
        descText.textContent = isExpanded ? 'Click to collapse' : `${node.children.length} operations`;
    } else {
        descText.textContent = 'Derived Table';
    }
    group.appendChild(descText);
}

export function renderCteNodeVisual(
    node: FlowNode,
    group: SVGGElement,
    isExpanded: boolean,
    hasChildren: boolean | undefined,
    deps: ContainerNodeRendererDeps
): void {
    const nodeWidth = EXPANDABLE_NODE_WIDTH;
    const nodeHeight = EXPANDABLE_NODE_HEIGHT;
    const cloudGap = EXPANDABLE_CLOUD_GAP;
    const cloudPadding = EXPANDABLE_CLOUD_PADDING;

    node.width = nodeWidth;
    node.height = nodeHeight;

    let cloudWidth = 160;
    let cloudHeight = 150;
    const childEdges = node.childEdges || [];
    if (isExpanded && hasChildren && node.children) {
        const layoutSize = deps.layoutSubflowNodesVertical(node.children, childEdges);
        cloudWidth = layoutSize.width + cloudPadding * 2;
        cloudHeight = layoutSize.height + cloudPadding * 2 + EXPANDABLE_CLOUD_HEADER_HEIGHT;
    }

    if (isExpanded && hasChildren && node.children) {
        renderExpandedCloud({
            accentType: 'cte',
            childEdges,
            cloudGap,
            cloudHeight,
            cloudPadding,
            cloudWidth,
            deps,
            group,
            node,
            nodeHeight,
            nodeWidth,
            titleText: node.label,
            titleTruncatePrefix: 'WITH ',
        });
    }

    const isDark = deps.state.isDarkTheme;
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const accentColor = getNodeAccentColor('cte', isDark);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(nodeWidth));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    const cteAccent = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    cteAccent.setAttribute('x', String(node.x));
    cteAccent.setAttribute('y', String(node.y));
    cteAccent.setAttribute('width', '3');
    cteAccent.setAttribute('height', String(nodeHeight));
    cteAccent.setAttribute('clip-path', 'inset(0 0 0 0 round 6px 0 0 6px)');
    cteAccent.setAttribute('fill', accentColor);
    group.appendChild(cteAccent);

    const icon = deps.getNodeIcon(node.type);
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', String(node.x + 14));
    iconText.setAttribute('y', String(node.y + 26));
    iconText.setAttribute('fill', accentColor);
    iconText.setAttribute('font-size', '14');
    iconText.textContent = icon;
    group.appendChild(iconText);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 34));
    label.setAttribute('y', String(node.y + 26));
    label.setAttribute('fill', surface.text);
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = deps.truncate(node.label, 16);
    group.appendChild(label);

    const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    descText.setAttribute('x', String(node.x + 14));
    descText.setAttribute('y', String(node.y + 45));
    descText.setAttribute('fill', surface.textMuted);
    descText.setAttribute('font-size', '10');
    descText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    if (hasChildren && node.children) {
        descText.textContent = isExpanded ? 'Click to collapse' : `${node.children.length} operations`;
    } else {
        descText.textContent = 'Common Table Expression';
    }
    group.appendChild(descText);
}

interface ExpandedCloudOptions {
    node: FlowNode;
    group: SVGGElement;
    deps: ContainerNodeRendererDeps;
    childEdges: FlowEdge[];
    nodeWidth: number;
    nodeHeight: number;
    cloudGap: number;
    cloudPadding: number;
    cloudWidth: number;
    cloudHeight: number;
    accentType: 'subquery' | 'cte';
    titleText: string;
    titleTruncatePrefix: string;
}

function renderExpandedCloud(options: ExpandedCloudOptions): void {
    const {
        node,
        group,
        deps,
        childEdges,
        nodeWidth,
        nodeHeight,
        cloudGap,
        cloudPadding,
        cloudWidth,
        cloudHeight,
        accentType,
        titleText,
        titleTruncatePrefix,
    } = options;
    const offset = deps.cloudOffsets.get(node.id) || {
        offsetX: -cloudWidth - cloudGap,
        offsetY: -(cloudHeight - nodeHeight) / 2,
    };
    const cloudX = node.x + offset.offsetX;
    const cloudY = node.y + offset.offsetY;

    const cloudGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cloudGroup.setAttribute('class', 'cloud-container');
    cloudGroup.setAttribute('data-node-id', node.id);
    cloudGroup.style.cursor = 'move';

    const isDark = deps.state.isDarkTheme;
    const cloudSurface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const cloudAccent = getNodeAccentColor(accentType, isDark);

    const cloud = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    cloud.setAttribute('x', String(cloudX));
    cloud.setAttribute('y', String(cloudY));
    cloud.setAttribute('width', String(cloudWidth));
    cloud.setAttribute('height', String(cloudHeight));
    cloud.setAttribute('rx', '16');
    cloud.setAttribute('fill', cloudSurface.fill);
    cloud.setAttribute('stroke', cloudAccent);
    cloud.setAttribute('stroke-width', '2');
    if (accentType === 'subquery') {
        cloud.setAttribute('stroke-dasharray', '6,3');
    }
    cloud.setAttribute('filter', 'url(#shadow)');
    cloudGroup.appendChild(cloud);

    const cloudTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    cloudTitle.setAttribute('x', String(cloudX + cloudWidth / 2));
    cloudTitle.setAttribute('y', String(cloudY + 20));
    cloudTitle.setAttribute('text-anchor', 'middle');
    cloudTitle.setAttribute('fill', cloudSurface.textMuted);
    cloudTitle.setAttribute('font-size', '11');
    cloudTitle.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    cloudTitle.textContent = titleTruncatePrefix ? titleText.replace(titleTruncatePrefix, '') : titleText;
    cloudGroup.appendChild(cloudTitle);

    const closeButton = addCloudCloseButton(node, cloudGroup, cloudX, cloudY, cloudWidth, deps.onRequestRerender);

    const nestedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    nestedSvg.setAttribute('x', String(cloudX + cloudPadding));
    nestedSvg.setAttribute('y', String(cloudY + EXPANDABLE_CLOUD_HEADER_HEIGHT));
    nestedSvg.setAttribute('width', String(cloudWidth - cloudPadding * 2));
    nestedSvg.setAttribute('height', String(cloudHeight - EXPANDABLE_CLOUD_HEADER_HEIGHT - cloudPadding));
    nestedSvg.setAttribute('overflow', 'hidden');
    nestedSvg.style.cursor = 'grab';

    const cloudState = deps.ensureCloudViewState(node.id);
    const subflowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    subflowGroup.setAttribute('class', 'cloud-subflow-group cloud-content');
    subflowGroup.setAttribute('transform', `translate(${cloudState.offsetX}, ${cloudState.offsetY}) scale(${cloudState.scale})`);

    deps.renderCloudSubflow(
        node,
        node.children!,
        childEdges,
        subflowGroup,
        0,
        0,
        cloudWidth - cloudPadding * 2,
        cloudHeight - EXPANDABLE_CLOUD_HEADER_HEIGHT - cloudPadding
    );
    nestedSvg.appendChild(subflowGroup);
    cloudGroup.appendChild(nestedSvg);

    attachCloudPanZoomListeners(node.id, nestedSvg, subflowGroup, deps);

    const cloudCenterX = cloudX + cloudWidth / 2;
    const nodeCenterX = node.x + nodeWidth / 2;
    const cloudIsOnRight = cloudCenterX > nodeCenterX;

    let arrowStartX: number;
    let arrowStartY: number;
    let arrowEndX: number;
    let arrowEndY: number;

    if (cloudIsOnRight) {
        arrowStartX = cloudX;
        arrowStartY = cloudY + cloudHeight / 2;
        arrowEndX = node.x + nodeWidth;
        arrowEndY = node.y + nodeHeight / 2;
    } else {
        arrowStartX = cloudX + cloudWidth;
        arrowStartY = cloudY + cloudHeight / 2;
        arrowEndX = node.x;
        arrowEndY = node.y + nodeHeight / 2;
    }

    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const midX = (arrowStartX + arrowEndX) / 2;
    arrowPath.setAttribute('d', `M ${arrowStartX} ${arrowStartY} C ${midX} ${arrowStartY}, ${midX} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`);
    arrowPath.setAttribute('fill', 'none');
    arrowPath.setAttribute('stroke', cloudAccent);
    arrowPath.setAttribute('stroke-width', '2');
    arrowPath.setAttribute('stroke-dasharray', '5,3');
    arrowPath.setAttribute('marker-end', 'url(#arrowhead)');
    cloudGroup.appendChild(arrowPath);

    group.appendChild(cloudGroup);

    deps.cloudElements.set(node.id, { cloud, title: cloudTitle, arrow: arrowPath, subflowGroup, nestedSvg, closeButton });

    cloud.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const rect = deps.svg.getBoundingClientRect();
        deps.state.isDraggingCloud = true;
        deps.state.draggingCloudNodeId = node.id;

        const currentOffset = deps.cloudOffsets.get(node.id) || {
            offsetX: -cloudWidth - cloudGap,
            offsetY: -(cloudHeight - nodeHeight) / 2,
        };
        deps.state.dragCloudStartOffsetX = currentOffset.offsetX;
        deps.state.dragCloudStartOffsetY = currentOffset.offsetY;
        deps.state.dragMouseStartX = (e.clientX - rect.left - deps.state.offsetX) / deps.state.scale;
        deps.state.dragMouseStartY = (e.clientY - rect.top - deps.state.offsetY) / deps.state.scale;
        cloudGroup.style.opacity = '0.8';
    });
}

function attachCloudPanZoomListeners(
    nodeId: string,
    nestedSvg: SVGSVGElement,
    subflowGroup: SVGGElement,
    deps: ContainerNodeRendererDeps
): void {
    nestedSvg.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cloudState = deps.ensureCloudViewState(nodeId);
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(cloudState.scale * delta, 0.5), 2);

        const rect = nestedSvg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        cloudState.offsetX = mouseX - (mouseX - cloudState.offsetX) * (newScale / cloudState.scale);
        cloudState.offsetY = mouseY - (mouseY - cloudState.offsetY) * (newScale / cloudState.scale);
        cloudState.scale = newScale;

        subflowGroup.setAttribute('transform', `translate(${cloudState.offsetX}, ${cloudState.offsetY}) scale(${cloudState.scale})`);
    });
}

function addCloudCloseButton(
    node: FlowNode,
    cloudGroup: SVGGElement,
    cloudX: number,
    cloudY: number,
    cloudWidth: number,
    onRequestRerender: () => void
): SVGGElement {
    const buttonSize = 20;
    const buttonPadding = 8;
    const buttonX = cloudX + cloudWidth - buttonSize - buttonPadding;
    const buttonY = cloudY + buttonPadding;

    const closeButtonGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    closeButtonGroup.setAttribute('class', 'cloud-close-btn');
    closeButtonGroup.setAttribute('transform', `translate(${buttonX}, ${buttonY})`);
    closeButtonGroup.style.cursor = 'pointer';

    const buttonBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    buttonBg.setAttribute('cx', String(buttonSize / 2));
    buttonBg.setAttribute('cy', String(buttonSize / 2));
    buttonBg.setAttribute('r', String(buttonSize / 2));
    buttonBg.setAttribute('fill', CLOSE_BUTTON_COLORS.background);
    buttonBg.setAttribute('stroke', UI_COLORS.borderWhite);
    buttonBg.setAttribute('stroke-width', '1');
    closeButtonGroup.appendChild(buttonBg);

    const xIcon = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const centerX = buttonSize / 2;
    const centerY = buttonSize / 2;
    const offset = 5;
    xIcon.setAttribute('d', `
        M ${centerX - offset} ${centerY - offset} L ${centerX + offset} ${centerY + offset}
        M ${centerX + offset} ${centerY - offset} L ${centerX - offset} ${centerY + offset}
    `);
    xIcon.setAttribute('stroke', 'white');
    xIcon.setAttribute('stroke-width', '2');
    xIcon.setAttribute('stroke-linecap', 'round');
    xIcon.style.pointerEvents = 'none';
    closeButtonGroup.appendChild(xIcon);

    closeButtonGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        node.expanded = false;
        onRequestRerender();
    });

    closeButtonGroup.addEventListener('mouseenter', () => {
        buttonBg.setAttribute('fill', CLOSE_BUTTON_COLORS.backgroundHover);
    });
    closeButtonGroup.addEventListener('mouseleave', () => {
        buttonBg.setAttribute('fill', CLOSE_BUTTON_COLORS.background);
    });

    cloudGroup.appendChild(closeButtonGroup);
    return closeButtonGroup;
}
