import type { FlowNode } from '../types';

export interface ShowTooltipOptions {
    badgeFunctionNameColor: string;
    currentSql: string;
    escapeHtml: (value: string) => string;
    extractSqlSnippet: (sql: string, startLine?: number, endLine?: number) => { snippet: string; lineLabel: string; truncated: boolean } | null;
    getNodeColor: (nodeType: FlowNode['type']) => string;
    getNodeVisualIcon: (node: FlowNode) => string;
    getWarningColor: (severity: string) => string;
    getWarningIcon: (warningType: string) => string;
    isDarkTheme: boolean;
    monoFontStack: string;
    node: FlowNode;
    pinIcon: string;
    tooltipElement: HTMLDivElement | null;
    updateTooltipPosition: (event: MouseEvent) => void;
}

export function showTooltip(options: ShowTooltipOptions, event: MouseEvent): void {
    const {
        badgeFunctionNameColor,
        currentSql,
        escapeHtml,
        extractSqlSnippet,
        getNodeColor,
        getNodeVisualIcon,
        getWarningColor,
        getWarningIcon,
        isDarkTheme,
        monoFontStack,
        node,
        pinIcon,
        tooltipElement,
        updateTooltipPosition,
    } = options;

    if (!tooltipElement) {
        return;
    }

    let content = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="
                background: ${getNodeColor(node.type)};
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
                color: white;
            ">${getNodeVisualIcon(node)} ${node.type.toUpperCase()}</span>
        </div>
        <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${escapeHtml(node.label)}</div>
    `;

    if (node.description) {
        content += `<div style="color: ${isDarkTheme ? '#94a3b8' : '#64748b'}; font-size: 11px; margin-bottom: 4px;">${escapeHtml(node.description)}</div>`;
    }

    if (currentSql) {
        const sqlSnippet = extractSqlSnippet(currentSql, node.startLine, node.endLine);
        if (sqlSnippet) {
            content += `
                <div style="
                    margin-top: 8px;
                    padding: 8px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(148, 163, 184, 0.2);
                    border-radius: 4px;
                    font-family: ${monoFontStack};
                    font-size: 10px;
                    color: #f8fafc;
                    line-height: 1.4;
                    white-space: pre-wrap;
                    word-break: break-all;
                    max-width: 300px;
                ">${escapeHtml(sqlSnippet.snippet)}</div>
            `;

            content += `<div style="font-size: 9px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 4px;">
                <span style="display: inline-flex; width: 10px; height: 10px; vertical-align: text-bottom;">${pinIcon}</span>
                ${sqlSnippet.lineLabel}
            </div>`;

            if (sqlSnippet.truncated) {
                content += `<div style="font-size: 9px; color: ${isDarkTheme ? '#93c5fd' : '#1d4ed8'}; margin-top: 4px;">
                    Press S for full SQL
                </div>`;
            }
        }
    }

    if (node.type === 'join' && node.details && node.details.length > 0) {
        content += `<div style="font-size: 10px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 6px; font-family: ${monoFontStack};">
            <strong style="color: ${isDarkTheme ? '#cbd5e1' : '#475569'};">Condition:</strong> ${escapeHtml(node.details[0])}
        </div>`;
    }

    if (node.type === 'filter' && node.details && node.details.length > 0) {
        content += `<div style="font-size: 10px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 6px; font-family: ${monoFontStack};">
            <strong style="color: ${isDarkTheme ? '#cbd5e1' : '#475569'};">Condition:</strong> ${escapeHtml(node.details[0])}
        </div>`;
    }

    if (node.type === 'aggregate' && node.aggregateDetails) {
        content += `<div style="font-size: 10px; margin-top: 6px; color: ${isDarkTheme ? '#fbbf24' : '#f59e0b'};">
            ${node.aggregateDetails.functions.length} aggregate function(s)
        </div>`;
        if (node.aggregateDetails.groupBy && node.aggregateDetails.groupBy.length > 0) {
            content += `<div style="font-size: 10px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 2px;">
                Group by: ${escapeHtml(node.aggregateDetails.groupBy.join(', '))}
            </div>`;
        }
    }

    if (node.type === 'window' && node.windowDetails) {
        content += `<div style="font-size: 10px; margin-top: 6px;">
            <span style="color: ${badgeFunctionNameColor};">${node.windowDetails.functions.length} window function(s)</span>
        </div>`;
        node.windowDetails.functions.forEach((fn, idx) => {
            if (idx < 3) {
                content += `<div style="font-size: 9px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 2px;">
                    ${escapeHtml(fn.name)}${fn.partitionBy ? ` (PARTITION BY ${escapeHtml(fn.partitionBy.join(', '))})` : ''}
                </div>`;
            }
        });
    }

    if (node.type === 'select' && node.columns && node.columns.length > 0) {
        content += `<div style="font-size: 10px; margin-top: 6px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'};">
            <strong style="color: ${isDarkTheme ? '#cbd5e1' : '#475569'};">Columns:</strong> ${node.columns.length}
        </div>`;
    }

    if (node.children && node.children.length > 0) {
        content += `<div style="font-size: 10px; margin-top: 6px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'};">
            Contains ${node.children.length} operation(s)
        </div>`;
    }

    if (node.warnings && node.warnings.length > 0) {
        content += '<div style="margin-top: 8px; padding: 8px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px;">';
        node.warnings.forEach((warning, idx) => {
            if (idx < 3) {
                const iconStr = getWarningIcon(warning.type);
                const colorStr = getWarningColor(warning.severity);
                content += `<div style="font-size: 10px; color: ${colorStr}; margin-top: ${idx > 0 ? '4px' : '0'};">
                    ${iconStr} <strong>${warning.severity.toUpperCase()}:</strong> ${escapeHtml(warning.message)}
                </div>`;
            }
        });
        if (node.warnings.length > 3) {
            content += `<div style="font-size: 9px; color: ${isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 4px;">
                +${node.warnings.length - 3} more warning(s)
            </div>`;
        }
        content += '</div>';
    }

    content += `<div style="font-size: 9px; color: ${isDarkTheme ? '#475569' : '#94a3b8'}; margin-top: 8px; border-top: 1px solid ${isDarkTheme ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)'}; padding-top: 6px;">
        Click to select • Double-click to zoom • Right-click for actions
    </div>`;

    tooltipElement.innerHTML = content;
    tooltipElement.style.opacity = '1';
    updateTooltipPosition(event);
}

export function updateTooltipPosition(tooltipElement: HTMLDivElement | null, event: MouseEvent): void {
    if (!tooltipElement) {
        return;
    }

    const padding = 12;
    const tooltipRect = tooltipElement.getBoundingClientRect();

    let left = event.clientX + padding;
    let top = event.clientY + padding;

    if (left + tooltipRect.width > window.innerWidth - padding) {
        left = event.clientX - tooltipRect.width - padding;
    }
    if (top + tooltipRect.height > window.innerHeight - padding) {
        top = event.clientY - tooltipRect.height - padding;
    }

    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
}

export function hideTooltip(tooltipElement: HTMLDivElement | null): void {
    if (tooltipElement) {
        tooltipElement.style.opacity = '0';
    }
}
