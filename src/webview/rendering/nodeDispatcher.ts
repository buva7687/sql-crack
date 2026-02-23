import type { CloudViewState, FlowNode, ViewState } from '../types';
import { UI_COLORS } from '../constants';
import { NODE_SURFACE } from '../constants/colors';

type NodeSiblingDirection = 'next' | 'prev';
type ConnectedDirection = 'upstream' | 'downstream';

export interface RenderNodeDispatcherOptions {
    node: FlowNode;
    parent: SVGGElement;
    state: ViewState;
    svg: SVGSVGElement | null;
    cloudViewStates: Map<string, CloudViewState>;
    renderClusterNode: (node: FlowNode, group: SVGGElement) => void;
    renderContainerNode: (node: FlowNode, group: SVGGElement) => void;
    renderWindowNode: (node: FlowNode, group: SVGGElement) => void;
    renderAggregateNode: (node: FlowNode, group: SVGGElement) => void;
    renderCaseNode: (node: FlowNode, group: SVGGElement) => void;
    renderJoinNode: (node: FlowNode, group: SVGGElement) => void;
    renderStandardNode: (node: FlowNode, group: SVGGElement) => void;
    onClusterToggle: (clusterNodeId: string) => void;
    highlightConnectedEdges: (nodeId: string, highlight: boolean) => void;
    showTooltip: (node: FlowNode, event: MouseEvent) => void;
    updateTooltipPosition: (event: MouseEvent) => void;
    hideTooltip: () => void;
    selectNode: (nodeId: string | null, options?: { skipNavigation?: boolean }) => void;
    navigateToAdjacentNode: (currentNode: FlowNode, direction: NodeSiblingDirection) => void;
    navigateToConnectedNode: (direction: ConnectedDirection, fromNodeId?: string) => boolean;
    navigateToSiblingNode: (currentNode: FlowNode, direction: NodeSiblingDirection) => boolean;
    announceFocusedNode: (node: FlowNode) => void;
    onContainerExpandRequested: (node: FlowNode) => void;
    onZoomPulseRequested: (node: FlowNode) => void;
    showContextMenu: (node: FlowNode, event: MouseEvent) => void;
    onToggleNodeCollapse: (nodeId: string) => void;
}

export function addCollapseButtonFeature(
    node: FlowNode,
    group: SVGGElement,
    onToggleNodeCollapse: (nodeId: string) => void
): void {
    const isExpanded = node.expanded !== false;
    const buttonSize = 16;
    const buttonX = node.x + node.width - buttonSize - 6;
    const buttonY = node.y + 6;

    const buttonBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    buttonBg.setAttribute('x', String(buttonX));
    buttonBg.setAttribute('y', String(buttonY));
    buttonBg.setAttribute('width', String(buttonSize));
    buttonBg.setAttribute('height', String(buttonSize));
    buttonBg.setAttribute('rx', '3');
    buttonBg.setAttribute('fill', 'rgba(0, 0, 0, 0.3)');
    buttonBg.setAttribute('class', 'collapse-btn');
    buttonBg.style.cursor = 'pointer';
    group.appendChild(buttonBg);

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(buttonX + buttonSize / 2));
    icon.setAttribute('y', String(buttonY + buttonSize / 2 + 4));
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('fill', 'white');
    icon.setAttribute('font-size', '12');
    icon.setAttribute('font-weight', '600');
    icon.setAttribute('class', 'collapse-icon');
    icon.style.pointerEvents = 'none';
    icon.textContent = isExpanded ? '−' : '+';
    group.appendChild(icon);

    buttonBg.addEventListener('click', (event) => {
        event.stopPropagation();
        onToggleNodeCollapse(node.id);
    });

    buttonBg.addEventListener('mouseenter', () => {
        buttonBg.setAttribute('fill', 'rgba(99, 102, 241, 0.5)');
    });
    buttonBg.addEventListener('mouseleave', () => {
        buttonBg.setAttribute('fill', 'rgba(0, 0, 0, 0.3)');
    });
}

export function renderNodeFeature(options: RenderNodeDispatcherOptions): void {
    const {
        node,
        parent,
        state,
        svg,
        cloudViewStates,
        renderClusterNode,
        renderContainerNode,
        renderWindowNode,
        renderAggregateNode,
        renderCaseNode,
        renderJoinNode,
        renderStandardNode,
        onClusterToggle,
        highlightConnectedEdges,
        showTooltip,
        updateTooltipPosition,
        hideTooltip,
        selectNode,
        navigateToAdjacentNode,
        navigateToConnectedNode,
        navigateToSiblingNode,
        announceFocusedNode,
        onContainerExpandRequested,
        onZoomPulseRequested,
        showContextMenu,
        onToggleNodeCollapse,
    } = options;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'node');
    group.setAttribute('data-id', node.id);
    group.setAttribute('data-label', node.label.toLowerCase());
    group.setAttribute('data-node-type', node.type);
    if (node.accessMode) {
        group.setAttribute('data-access-mode', node.accessMode);
    }
    group.style.cursor = 'pointer';

    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    const nodeDescription = node.description ? `. ${node.description}` : '';
    group.setAttribute('aria-label', `${node.type} node: ${node.label}${nodeDescription}`);

    if (node.type === 'cluster') {
        renderClusterNode(node, group);
        group.addEventListener('click', (event) => {
            event.stopPropagation();
            onClusterToggle(node.id);
        });
        group.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                group.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
        });
        parent.appendChild(group);
        return;
    }

    const isContainer = (node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0;
    const isWindowNode = node.type === 'window' && node.windowDetails;
    const isAggregateNode = node.type === 'aggregate' && node.aggregateDetails && node.label === 'AGGREGATE';
    const isCaseNode = node.type === 'case' && node.caseDetails;
    const isJoinNode = node.type === 'join';

    if (isContainer) {
        renderContainerNode(node, group);
    } else if (isWindowNode) {
        renderWindowNode(node, group);
    } else if (isAggregateNode) {
        renderAggregateNode(node, group);
    } else if (isCaseNode) {
        renderCaseNode(node, group);
    } else if (isJoinNode) {
        renderJoinNode(node, group);
    } else {
        renderStandardNode(node, group);
    }

    const rect = group.querySelector('.node-rect') as SVGRectElement | null;
    if (rect) {
        const surface = state.isDarkTheme ? NODE_SURFACE.dark : NODE_SURFACE.light;
        const hoverFill = state.isDarkTheme ? '#222222' : '#F1F5F9';

        group.addEventListener('mouseenter', (event) => {
            rect.setAttribute('fill', hoverFill);
            highlightConnectedEdges(node.id, true);
            showTooltip(node, event as MouseEvent);
        });

        group.addEventListener('mousemove', (event) => {
            updateTooltipPosition(event as MouseEvent);
        });

        group.addEventListener('mouseleave', () => {
            rect.setAttribute('fill', surface.fill);
            if (state.selectedNodeId !== node.id) {
                highlightConnectedEdges(node.id, false);
            }
            hideTooltip();
        });
    }

    if (node.type === 'cte' || node.type === 'subquery') {
        group.style.cursor = 'move';
        group.addEventListener('mousedown', (event) => {
            const target = event.target as Element;
            if (target.closest('.collapse-button') || target.closest('.cloud-container')) {
                return;
            }
            if (!svg) {
                return;
            }
            event.stopPropagation();
            const rectBounds = svg.getBoundingClientRect();
            state.isDraggingNode = true;
            state.draggingNodeId = node.id;
            state.dragNodeStartX = node.x;
            state.dragNodeStartY = node.y;
            state.dragMouseStartX = (event.clientX - rectBounds.left - state.offsetX) / state.scale;
            state.dragMouseStartY = (event.clientY - rectBounds.top - state.offsetY) / state.scale;
            group.style.opacity = '0.8';
        });
    }

    let dragStartX = 0;
    let dragStartY = 0;
    let hasDragged = false;

    group.addEventListener('mousedown', (event) => {
        if (!svg) {
            return;
        }
        const rectBounds = svg.getBoundingClientRect();
        dragStartX = (event.clientX - rectBounds.left - state.offsetX) / state.scale;
        dragStartY = (event.clientY - rectBounds.top - state.offsetY) / state.scale;
        hasDragged = false;
    });

    group.addEventListener('mousemove', (event) => {
        if (!svg || (!state.isDraggingNode && !state.isDraggingCloud)) {
            return;
        }
        const rectBounds = svg.getBoundingClientRect();
        const currentX = (event.clientX - rectBounds.left - state.offsetX) / state.scale;
        const currentY = (event.clientY - rectBounds.top - state.offsetY) / state.scale;
        const distance = Math.sqrt(Math.pow(currentX - dragStartX, 2) + Math.pow(currentY - dragStartY, 2));
        if (distance > 5) {
            hasDragged = true;
        }
    });

    group.addEventListener('click', (event) => {
        event.stopPropagation();
        if (hasDragged || state.isDraggingNode || state.isDraggingCloud) {
            hasDragged = false;
            return;
        }

        const skipNav = !(event.ctrlKey || event.metaKey);
        selectNode(node.id, { skipNavigation: skipNav });
        hideTooltip();
        svg?.focus();
    });

    group.addEventListener('keydown', (event) => {
        const key = event.key;

        if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            selectNode(node.id, { skipNavigation: true });
            hideTooltip();
            return;
        }

        if (key === 'Tab') {
            event.preventDefault();
            event.stopPropagation();
            navigateToAdjacentNode(node, event.shiftKey ? 'prev' : 'next');
            return;
        }

        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            if (key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                navigateToConnectedNode('upstream', node.id);
                return;
            }
            if (key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                navigateToConnectedNode('downstream', node.id);
                return;
            }
            if (key === 'ArrowRight') {
                event.preventDefault();
                event.stopPropagation();
                navigateToSiblingNode(node, 'next');
                return;
            }
            if (key === 'ArrowLeft') {
                event.preventDefault();
                event.stopPropagation();
                navigateToSiblingNode(node, 'prev');
                return;
            }
        }

        if (key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            selectNode(null);
            svg?.focus();
        }
    });

    group.addEventListener('focus', () => {
        const rectEl = group.querySelector('.node-rect') as SVGRectElement | null;
        if (rectEl) {
            const focusRingColor = state.isDarkTheme ? UI_COLORS.nodeFocusRingDark : UI_COLORS.nodeFocusRingLight;
            group.setAttribute('data-keyboard-focus', 'true');
            rectEl.setAttribute('stroke', focusRingColor);
            rectEl.setAttribute('stroke-width', '4');
            rectEl.setAttribute('filter', 'url(#glow)');
        }
        announceFocusedNode(node);
    });

    group.addEventListener('blur', () => {
        const rectEl = group.querySelector('.node-rect') as SVGRectElement | null;
        if (!rectEl) {
            return;
        }
        group.removeAttribute('data-keyboard-focus');
        if (state.selectedNodeId === node.id) {
            rectEl.setAttribute('stroke', UI_COLORS.white);
            rectEl.setAttribute('stroke-width', '3');
            rectEl.setAttribute('filter', 'url(#glow)');
            return;
        }
        rectEl.removeAttribute('stroke');
        rectEl.removeAttribute('stroke-width');
        rectEl.setAttribute('filter', 'url(#shadow)');
    });

    group.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        if ((node.type === 'cte' || node.type === 'subquery') && node.collapsible) {
            if (!node.expanded) {
                if (!cloudViewStates.has(node.id)) {
                    cloudViewStates.set(node.id, {
                        scale: 1,
                        offsetX: 0,
                        offsetY: 0,
                        isDragging: false,
                        dragStartX: 0,
                        dragStartY: 0,
                    });
                }
                node.expanded = true;
                onContainerExpandRequested(node);
            }
        } else {
            onZoomPulseRequested(node);
        }
        svg?.focus();
    });

    group.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showContextMenu(node, event as MouseEvent);
        svg?.focus();
    });

    if ((node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0) {
        addCollapseButtonFeature(node, group, onToggleNodeCollapse);
    }

    parent.appendChild(group);
}
