// Breadcrumb navigation panel

import { FlowNode } from '../../types';
import { state, breadcrumbPanel, currentNodes } from '../state';

// Callbacks for navigation to avoid circular dependencies
let onSelectNode: ((nodeId: string | null) => void) | null = null;
let onZoomToNode: ((node: FlowNode) => void) | null = null;
let onResetView: (() => void) | null = null;

export function setBreadcrumbCallbacks(
    selectNode: (nodeId: string | null) => void,
    zoomToNode: (node: FlowNode) => void,
    resetView: () => void
): void {
    onSelectNode = selectNode;
    onZoomToNode = zoomToNode;
    onResetView = resetView;
}

export function updateBreadcrumb(nodeId: string | null): void {
    if (!breadcrumbPanel) { return; }

    if (!nodeId) {
        // Hide breadcrumb if no node selected
        breadcrumbPanel.style.display = 'none';
        state.breadcrumbPath = [];
        return;
    }

    const node = currentNodes.find(n => n.id === nodeId);
    if (!node) {
        breadcrumbPanel.style.display = 'none';
        return;
    }

    // Only show breadcrumb for CTEs, subqueries, or nested structures
    if (node.type !== 'cte' && node.type !== 'subquery' && !node.parentId && !node.depth) {
        breadcrumbPanel.style.display = 'none';
        state.breadcrumbPath = [];
        return;
    }

    // Build breadcrumb path from root to current node
    const path: FlowNode[] = [];
    let current: FlowNode | undefined = node;

    while (current) {
        path.unshift(current);
        if (current.parentId) {
            current = currentNodes.find(n => n.id === current!.parentId);
        } else {
            break;
        }
    }

    // Always include "Main Query" at the beginning if we have CTEs
    if (path.length > 0 && path[0].type === 'cte') {
        path.unshift({
            id: 'main-query',
            label: 'Main Query',
            type: 'select',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            depth: 0
        });
    }

    state.breadcrumbPath = path;
    renderBreadcrumb();
}

function renderBreadcrumb(): void {
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

    state.breadcrumbPath.forEach((node, index) => {
        // Create breadcrumb item
        const item = document.createElement('span');
        item.style.cssText = `
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.2s;
            font-weight: ${index === state.breadcrumbPath.length - 1 ? '600' : '400'};
            color: ${index === state.breadcrumbPath.length - 1 ? '#f1f5f9' : '#94a3b8'};
        `;
        item.textContent = node.label;

        // Add hover effect
        item.addEventListener('mouseenter', () => {
            item.style.background = 'rgba(148, 163, 184, 0.2)';
        });

        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });

        // Click to focus on this node
        if (node.id !== 'main-query') {
            item.addEventListener('click', () => {
                if (onSelectNode) onSelectNode(node.id);
                if (onZoomToNode) onZoomToNode(node);
            });
        } else {
            // For main query, reset to full view
            item.addEventListener('click', () => {
                if (onSelectNode) onSelectNode(null);
                if (onResetView) onResetView();
            });
        }

        breadcrumbPanel!.appendChild(item);

        // Add separator
        if (index < state.breadcrumbPath.length - 1) {
            const separator = document.createElement('span');
            separator.style.color = '#64748b';
            separator.style.fontSize = '10px';
            separator.textContent = '›';
            breadcrumbPanel!.appendChild(separator);
        }
    });
}
