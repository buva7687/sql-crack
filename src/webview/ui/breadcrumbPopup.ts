import type { FlowNode, ViewState } from '../types';
import { UI_COLORS } from '../constants';

export interface BreadcrumbFeatureOptions {
    breadcrumbPanel: HTMLDivElement | null;
    state: ViewState;
    currentNodes: FlowNode[];
    onSelectNode: (nodeId: string | null, options?: { skipNavigation?: boolean }) => void;
    onZoomToNode: (node: FlowNode) => void;
    onPulseNode: (nodeId: string) => void;
    onResetView: () => void;
}

export function updateBreadcrumbFeature(nodeId: string | null, options: BreadcrumbFeatureOptions): void {
    const { breadcrumbPanel, state, currentNodes } = options;
    if (!breadcrumbPanel) {
        return;
    }
    if (state.showColumnFlows) {
        breadcrumbPanel.style.display = 'none';
        return;
    }

    if (!nodeId) {
        breadcrumbPanel.style.display = 'none';
        state.breadcrumbPath = [];
        return;
    }

    const node = currentNodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
        breadcrumbPanel.style.display = 'none';
        return;
    }

    if (node.type !== 'cte' && node.type !== 'subquery' && !node.parentId && !node.depth) {
        breadcrumbPanel.style.display = 'none';
        state.breadcrumbPath = [];
        return;
    }

    const path: FlowNode[] = [];
    let current: FlowNode | undefined = node;
    while (current) {
        path.unshift(current);
        if (!current.parentId) {
            break;
        }
        current = currentNodes.find((candidate) => candidate.id === current!.parentId);
    }

    if (path.length > 0 && path[0].type === 'cte') {
        path.unshift({
            id: 'main-query',
            label: 'Main Query',
            type: 'select',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            depth: 0,
        });
    }

    state.breadcrumbPath = path;
    renderBreadcrumbFeature(options);
}

export function renderBreadcrumbFeature(options: BreadcrumbFeatureOptions): void {
    const { breadcrumbPanel, state, onSelectNode, onZoomToNode, onPulseNode, onResetView } = options;
    if (!breadcrumbPanel || state.breadcrumbPath.length === 0) {
        if (breadcrumbPanel) {
            breadcrumbPanel.style.display = 'none';
        }
        return;
    }

    breadcrumbPanel.innerHTML = '';
    breadcrumbPanel.style.display = 'flex';
    breadcrumbPanel.style.alignItems = 'center';
    breadcrumbPanel.style.gap = '8px';
    breadcrumbPanel.style.background = state.isDarkTheme ? UI_COLORS.backgroundPanel : UI_COLORS.backgroundPanelLight;
    breadcrumbPanel.style.borderColor = state.isDarkTheme ? UI_COLORS.border : 'rgba(0, 0, 0, 0.1)';
    breadcrumbPanel.style.color = state.isDarkTheme ? UI_COLORS.textSubtle : '#475569';

    const crumbText = state.isDarkTheme ? '#f1f5f9' : '#0f172a';
    const crumbMuted = state.isDarkTheme ? '#94a3b8' : '#475569';
    const crumbHover = state.isDarkTheme ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.08)';
    const separatorColor = state.isDarkTheme ? '#64748b' : '#94a3b8';

    state.breadcrumbPath.forEach((node, index) => {
        const item = document.createElement('span');
        item.style.cssText = `
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.2s;
            font-weight: ${index === state.breadcrumbPath.length - 1 ? '600' : '400'};
            color: ${index === state.breadcrumbPath.length - 1 ? crumbText : crumbMuted};
        `;
        item.textContent = node.label;

        item.addEventListener('mouseenter', () => {
            item.style.background = crumbHover;
        });

        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });

        if (node.id !== 'main-query') {
            item.addEventListener('click', () => {
                onSelectNode(node.id, { skipNavigation: true });
                onZoomToNode(node);
                onPulseNode(node.id);
            });
        } else {
            item.addEventListener('click', () => {
                onSelectNode(null);
                onResetView();
            });
        }

        breadcrumbPanel.appendChild(item);

        if (index < state.breadcrumbPath.length - 1) {
            const separator = document.createElement('span');
            separator.style.color = separatorColor;
            separator.style.fontSize = '10px';
            separator.textContent = '›';
            breadcrumbPanel.appendChild(separator);
        }
    });
}
