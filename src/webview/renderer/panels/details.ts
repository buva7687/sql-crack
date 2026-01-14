// Node details panel

import { state, detailsPanel, currentNodes } from '../state';
import { escapeHtml, getNodeIcon } from '../utils';
import { getNodeColor } from '../../constants';

// Callback for selection to avoid circular dependencies
let onSelectNode: ((nodeId: string | null) => void) | null = null;

export function setDetailsPanelCallbacks(
    selectNode: (nodeId: string | null) => void
): void {
    onSelectNode = selectNode;
}

export function updateDetailsPanel(nodeId: string | null): void {
    if (!detailsPanel) { return; }

    if (!nodeId) {
        detailsPanel.style.transform = 'translate(calc(100% + 16px), -50%)';
        return;
    }

    const node = currentNodes.find(n => n.id === nodeId);
    if (!node) { return; }

    detailsPanel.style.transform = 'translate(0, -50%)';

    // Build details section based on node type
    let detailsSection = '';

    // Window function details
    if (node.windowDetails && node.windowDetails.functions.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Window Functions</div>
                ${node.windowDetails.functions.map(func => `
                    <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                        <div style="color: #fbbf24; font-weight: 600; font-size: 13px; font-family: monospace; margin-bottom: 6px;">
                            ${escapeHtml(func.name)}()
                        </div>
                        ${func.partitionBy && func.partitionBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                <span style="background: #6366f1; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">PARTITION BY</span>
                                <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(func.partitionBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.orderBy && func.orderBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                <span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">ORDER BY</span>
                                <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(func.orderBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.frame ? `
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">FRAME</span>
                                <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(func.frame)}</span>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Aggregate function details
    if (node.aggregateDetails && node.aggregateDetails.functions.length > 0) {
        detailsSection += `
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Aggregate Functions</div>
                ${node.aggregateDetails.functions.map(func => `
                    <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                        <div style="color: #f59e0b; font-weight: 600; font-size: 13px; font-family: monospace; margin-bottom: 4px;">
                            ${escapeHtml(func.expression)}
                        </div>
                        ${func.alias ? `
                            <div style="color: #94a3b8; font-size: 11px; font-family: monospace;">
                                Alias: ${escapeHtml(func.alias)}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
                ${node.aggregateDetails.groupBy && node.aggregateDetails.groupBy.length > 0 ? `
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(148, 163, 184, 0.2);">
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;">GROUP BY:</div>
                        <div style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(node.aggregateDetails.groupBy.join(', '))}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // CASE statement details
    if (node.caseDetails && node.caseDetails.cases.length > 0) {
        detailsSection += `
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">CASE Statements</div>
                ${node.caseDetails.cases.map((caseStmt) => `
                    <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                        ${caseStmt.alias ? `
                            <div style="color: #eab308; font-weight: 600; font-size: 12px; margin-bottom: 8px;">
                                ${escapeHtml(caseStmt.alias)}
                            </div>
                        ` : ''}
                        ${caseStmt.conditions.map((cond) => `
                            <div style="margin-bottom: 6px;">
                                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                                    <span style="background: #6366f1; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">WHEN</span>
                                    <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(cond.when)}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; margin-left: 40px;">
                                    <span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">THEN</span>
                                    <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(cond.then)}</span>
                                </div>
                            </div>
                        `).join('')}
                        ${caseStmt.elseValue ? `
                            <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                <span style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">ELSE</span>
                                <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(caseStmt.elseValue)}</span>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
    // Children details for CTEs and subqueries
    else if (node.children && node.children.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Internal Structure</div>
                <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 10px;">
                    ${node.children.map(child => `
                        <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
                            <span style="background: ${getNodeColor(child.type)}; padding: 3px 8px; border-radius: 4px; color: white; font-size: 10px; font-weight: 500;">
                                ${getNodeIcon(child.type)} ${escapeHtml(child.label)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    // Standard details
    else if (node.details && node.details.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Details</div>
                <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 12px;">
                    ${node.details.map(d => `
                        <div style="color: #cbd5e1; font-size: 12px; padding: 4px 0; font-family: monospace;">
                            ${escapeHtml(d)}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    detailsPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin: 0; color: #f1f5f9; font-size: 14px;">Node Details</h3>
            <button id="close-details" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 20px; padding: 4px;">&times;</button>
        </div>
        <div style="background: ${getNodeColor(node.type)}; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div style="color: white; font-weight: 600; font-size: 14px; margin-bottom: 4px;">
                ${getNodeIcon(node.type)} ${node.label}
            </div>
            <div style="color: rgba(255,255,255,0.8); font-size: 12px;">
                ${node.description || ''}
            </div>
        </div>
        ${detailsSection}
        <div style="color: #64748b; font-size: 11px; margin-top: 20px;">
            Type: ${node.type}<br>
            ID: ${node.id}
        </div>
    `;

    // Close button handler
    detailsPanel.querySelector('#close-details')?.addEventListener('click', () => {
        if (onSelectNode) onSelectNode(null);
    });
}
