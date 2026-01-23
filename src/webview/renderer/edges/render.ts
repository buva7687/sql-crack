// Edge rendering utilities

import { FlowEdge } from '../../types';
import { state, mainGroup, currentNodes, containerElement } from '../state';
import { escapeHtml } from '../utils';

export function renderEdge(edge: FlowEdge, parent: SVGGElement): void {
    const sourceNode = currentNodes.find(n => n.id === edge.source);
    const targetNode = currentNodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) { return; }

    // Calculate connection points (center bottom to center top)
    const x1 = sourceNode.x + sourceNode.width / 2;
    const y1 = sourceNode.y + sourceNode.height;
    const x2 = targetNode.x + targetNode.width / 2;
    const y2 = targetNode.y;

    // Create curved path
    const midY = (y1 + y2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#64748b');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.setAttribute('class', 'edge');
    path.setAttribute('data-source', edge.source);
    path.setAttribute('data-target', edge.target);
    path.setAttribute('data-edge-id', edge.id);

    // Store SQL clause information if available
    if (edge.sqlClause) {
        path.setAttribute('data-sql-clause', edge.sqlClause);
    }
    if (edge.clauseType) {
        path.setAttribute('data-clause-type', edge.clauseType);
    }
    if (edge.startLine) {
        path.setAttribute('data-start-line', String(edge.startLine));
    }

    // Make edge clickable with visual feedback
    path.style.cursor = 'pointer';

    // Click handler to show SQL clause and highlight
    path.addEventListener('click', (e) => {
        e.stopPropagation();
        handleEdgeClick(edge);
    });

    // Hover effect for edges
    path.addEventListener('mouseenter', () => {
        if (!path.getAttribute('data-highlighted')) {
            path.setAttribute('stroke', '#94a3b8');
            path.setAttribute('stroke-width', '3');
        }
    });

    path.addEventListener('mouseleave', () => {
        if (!path.getAttribute('data-highlighted')) {
            path.setAttribute('stroke', '#64748b');
            path.setAttribute('stroke-width', '2');
        }
    });

    parent.appendChild(path);
}

export function handleEdgeClick(edge: FlowEdge): void {
    // Clear previous edge highlights
    const edges = mainGroup?.querySelectorAll('.edge');
    edges?.forEach(e => {
        e.removeAttribute('data-highlighted');
        const source = e.getAttribute('data-source');
        const target = e.getAttribute('data-target');
        const isConnected = state.selectedNodeId && (source === state.selectedNodeId || target === state.selectedNodeId);

        if (isConnected) {
            e.setAttribute('stroke', '#fbbf24');
            e.setAttribute('stroke-width', '3');
        } else {
            e.setAttribute('stroke', '#64748b');
            e.setAttribute('stroke-width', '2');
        }
    });

    // Highlight clicked edge
    const clickedEdge = mainGroup?.querySelector(`[data-edge-id="${edge.id}"]`);
    if (clickedEdge) {
        clickedEdge.setAttribute('data-highlighted', 'true');
        clickedEdge.setAttribute('stroke', '#10b981'); // Green for selected edge
        clickedEdge.setAttribute('stroke-width', '4');
        clickedEdge.setAttribute('marker-end', 'url(#arrowhead-highlight)');
    }

    // Show SQL clause information
    if (edge.sqlClause) {
        showSqlClausePanel(edge);
    }

    // Jump to line if available
    if (edge.startLine && typeof window !== 'undefined') {
        const vscodeApi = (window as any).vscodeApi;
        if (vscodeApi && vscodeApi.postMessage) {
            vscodeApi.postMessage({
                command: 'goToLine',
                line: edge.startLine
            });
        }
    }
}

export function showSqlClausePanel(edge: FlowEdge): void {
    // Reuse or create a panel for showing SQL clause details
    let clausePanel = document.getElementById('sql-clause-panel') as HTMLDivElement;

    if (!clausePanel) {
        clausePanel = document.createElement('div');
        clausePanel.id = 'sql-clause-panel';
        clausePanel.style.cssText = `
            position: fixed;
            bottom: 16px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.98);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 12px;
            padding: 16px 20px;
            max-width: 600px;
            z-index: 1000;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        `;

        containerElement?.appendChild(clausePanel);
    }

    // Build content
    const clauseType = edge.clauseType || 'flow';
    const clauseTypeLabel = clauseType.toUpperCase();
    const clauseColor = getClauseTypeColor(clauseType);

    clausePanel.innerHTML = `
        <button style="
            position: absolute;
            top: 8px;
            right: 8px;
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
        " onclick="this.parentElement.style.display='none'">✕</button>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="
                background: ${clauseColor};
                color: white;
                padding: 4px 12px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.5px;
            ">${clauseTypeLabel}</div>
            <div style="color: #cbd5e1; font-size: 13px; font-weight: 600;">
                ${edge.label || 'Data Flow'}
            </div>
        </div>
        <div style="
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px;
            padding: 12px;
            color: #e2e8f0;
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 200px;
            overflow-y: auto;
        ">${escapeHtml(edge.sqlClause || 'No SQL clause information available')}</div>
        ${edge.startLine ? `
            <div style="color: #94a3b8; font-size: 11px; margin-top: 8px;">
                📍 Line ${edge.startLine}${edge.endLine && edge.endLine !== edge.startLine ? `-${edge.endLine}` : ''}
            </div>
        ` : ''}
    `;

    clausePanel.style.display = 'block';
}

export function getClauseTypeColor(clauseType: string): string {
    switch (clauseType) {
        case 'join': return '#3b82f6'; // Blue
        case 'where': return '#8b5cf6'; // Purple
        case 'having': return '#ec4899'; // Pink
        case 'on': return '#06b6d4'; // Cyan
        case 'filter': return '#f59e0b'; // Amber
        default: return '#64748b'; // Gray
    }
}
