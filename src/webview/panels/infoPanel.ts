import type {
    ColumnFlow,
    FlowNode,
    OptimizationHint,
    QueryStats,
} from '../types';
import {
    BADGE_COLORS,
    COMPLEXITY_COLORS,
    HINT_COLORS,
    STATUS_COLORS,
    UI_COLORS,
    getNodeColor,
} from '../constants';
import { MONO_FONT_STACK } from '../../shared/themeTokens';
import { ICONS } from '../../shared';
import { getHintBadgeState, getTopHints, sortHintsByImpact } from '../hintsHierarchy';
import { updateHintsSummaryBadge } from '../ui';
import { shouldShowTraceColumnsAction } from '../columnLineageUx';

export interface DetailsPanelOptions {
    detailsPanel: HTMLDivElement | null;
    nodeId: string | null;
    currentNodes: FlowNode[];
    currentColumnFlows: ColumnFlow[];
    isDarkTheme: boolean;
    escapeHtml: (text: string) => string;
    getNodeVisualIcon: (node: FlowNode) => string;
    ensureDetailsPanelExpanded: () => void;
    onSelectNode: (nodeId: string | null) => void;
    onToggleColumnFlows: (show?: boolean) => void;
}

export interface StatsPanelOptions {
    statsPanel: HTMLDivElement | null;
    currentStats: QueryStats | null;
    currentTableUsage: Map<string, number>;
    isDarkTheme: boolean;
    statsMinimized: boolean;
    setStatsMinimized: (value: boolean) => void;
    escapeHtml: (text: string) => string;
    onNavigateToTable: (tableName: string) => void;
    onRequestRerender: () => void;
}

export interface HintsPanelOptions {
    hintsPanel: HTMLDivElement | null;
    currentHints: OptimizationHint[];
    currentNodes: FlowNode[];
    isDarkTheme: boolean;
    panelBottom: number;
    hintsMinimized: boolean;
    setHintsMinimized: (value: boolean) => void;
    hintsShowAll: boolean;
    setHintsShowAll: (value: boolean) => void;
    escapeHtml: (text: string) => string;
    onSelectNode: (nodeId: string) => void;
    onRequestRerender: () => void;
    onSyncViewportBounds: (bottomPx: number) => void;
}

export function updateDetailsPanelContent(options: DetailsPanelOptions): void {
    const {
        detailsPanel,
        nodeId,
        currentNodes,
        currentColumnFlows,
        isDarkTheme,
        escapeHtml,
        getNodeVisualIcon,
        ensureDetailsPanelExpanded,
        onSelectNode,
        onToggleColumnFlows,
    } = options;

    if (!detailsPanel) {
        return;
    }

    if (!nodeId) {
        detailsPanel.style.transform = 'translate(calc(100% + 16px), -50%)';
        return;
    }

    const node = currentNodes.find((n) => n.id === nodeId);
    if (!node) {
        return;
    }

    ensureDetailsPanelExpanded();

    const sectionLabelColor = isDarkTheme ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const detailTextColor = isDarkTheme ? UI_COLORS.textSubtle : UI_COLORS.textLightSubtle;
    const detailCardBg = isDarkTheme ? UI_COLORS.backgroundSubtle : 'rgba(15, 23, 42, 0.04)';
    const detailDividerColor = isDarkTheme ? UI_COLORS.borderLight : 'rgba(15, 23, 42, 0.08)';
    const sectionBorderColor = isDarkTheme ? UI_COLORS.border : 'rgba(15, 23, 42, 0.12)';
    const headingColor = isDarkTheme ? UI_COLORS.text : UI_COLORS.textLight;
    const closeButtonColor = isDarkTheme ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const footerColor = isDarkTheme ? UI_COLORS.textDim : UI_COLORS.textLightDim;
    const badgeTextColor = isDarkTheme ? '#ffffff' : UI_COLORS.textLight;
    const nodeBadgeTitleColor = isDarkTheme ? '#ffffff' : UI_COLORS.textLight;
    const nodeBadgeSubtitleColor = isDarkTheme ? UI_COLORS.whiteMuted : UI_COLORS.textLightMuted;

    detailsPanel.style.transform = 'translate(0, -50%)';

    let detailsSection = '';

    if (node.windowDetails && node.windowDetails.functions.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Window Functions</div>
                ${node.windowDetails.functions.map((func) => `
                    <div style="background: ${detailCardBg}; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                        <div style="color: ${BADGE_COLORS.functionName}; font-weight: 600; font-size: 11px; font-family: ${MONO_FONT_STACK}; margin-bottom: 4px;">
                            ${escapeHtml(func.name)}()
                        </div>
                        ${func.partitionBy && func.partitionBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                <span style="background: ${BADGE_COLORS.partitionBy}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">PARTITION BY</span>
                                <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(func.partitionBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.orderBy && func.orderBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                <span style="background: ${BADGE_COLORS.orderBy}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">ORDER BY</span>
                                <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(func.orderBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.frame ? `
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="background: ${BADGE_COLORS.frame}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">FRAME</span>
                                <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(func.frame)}</span>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (node.aggregateDetails && node.aggregateDetails.functions.length > 0) {
        detailsSection += `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Aggregate Functions</div>
                ${node.aggregateDetails.functions.map((func) => `
                    <div style="background: ${detailCardBg}; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                        <div style="color: ${BADGE_COLORS.frame}; font-weight: 600; font-size: 11px; font-family: ${MONO_FONT_STACK}; margin-bottom: 2px;">
                            ${escapeHtml(func.expression)}
                        </div>
                        ${func.alias ? `
                            <div style="color: ${sectionLabelColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">
                                Alias: ${escapeHtml(func.alias)}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
                ${node.aggregateDetails.groupBy && node.aggregateDetails.groupBy.length > 0 ? `
                    <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid ${sectionBorderColor};">
                        <div style="color: ${sectionLabelColor}; font-size: 10px; margin-bottom: 2px;">GROUP BY:</div>
                        <div style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(node.aggregateDetails.groupBy.join(', '))}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    if (node.caseDetails && node.caseDetails.cases.length > 0) {
        detailsSection += `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">CASE Statements</div>
                ${node.caseDetails.cases.map((caseStmt) => `
                    <div style="background: ${detailCardBg}; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                        ${caseStmt.alias ? `
                            <div style="color: ${COMPLEXITY_COLORS.Moderate}; font-weight: 600; font-size: 11px; margin-bottom: 4px;">
                                ${escapeHtml(caseStmt.alias)}
                            </div>
                        ` : ''}
                        ${caseStmt.conditions.map((cond) => `
                            <div style="margin-bottom: 4px;">
                                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 1px;">
                                    <span style="background: ${BADGE_COLORS.partitionBy}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">WHEN</span>
                                    <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(cond.when)}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 4px; margin-left: 28px;">
                                    <span style="background: ${BADGE_COLORS.orderBy}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">THEN</span>
                                    <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(cond.then)}</span>
                                </div>
                            </div>
                        `).join('')}
                        ${caseStmt.elseValue ? `
                            <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                                <span style="background: ${BADGE_COLORS.frame}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">ELSE</span>
                                <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(caseStmt.elseValue)}</span>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    } else if (node.children && node.children.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Internal Structure</div>
                <div style="background: ${detailCardBg}; border-radius: 4px; padding: 6px 8px;">
                    ${node.children.map((child) => `
                        <div style="display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid ${detailDividerColor};">
                            <span style="background: ${getNodeColor(child.type)}; padding: 2px 6px; border-radius: 3px; color: ${badgeTextColor}; font-size: 9px; font-weight: 500;">
                                ${getNodeVisualIcon(child)} ${escapeHtml(child.label)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } else if (node.details && node.details.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Details</div>
                <div style="background: ${detailCardBg}; border-radius: 4px; padding: 8px;">
                    ${node.details.map((d) => `
                        <div style="color: ${detailTextColor}; font-size: 11px; padding: 2px 0; font-family: ${MONO_FONT_STACK};">
                            ${escapeHtml(d)}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const traceColumnsAction = shouldShowTraceColumnsAction(currentColumnFlows?.length || 0) ? `
        <button id="trace-columns-btn" style="
            width: 100%;
            margin-bottom: 10px;
            background: ${isDarkTheme ? 'rgba(129, 140, 248, 0.22)' : 'rgba(99, 102, 241, 0.12)'};
            color: ${isDarkTheme ? '#c7d2fe' : '#4338ca'};
            border: 1px solid ${isDarkTheme ? 'rgba(129, 140, 248, 0.35)' : 'rgba(99, 102, 241, 0.35)'};
            border-radius: 6px;
            padding: 7px 10px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        "><span style="display: inline-flex; width: 12px; height: 12px;">${ICONS.search}</span><span>Trace Column Lineage</span></button>
    ` : '';

    detailsPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0; color: ${headingColor}; font-size: 12px;">Node Details</h3>
            <button id="close-details" style="background: none; border: none; color: ${closeButtonColor}; cursor: pointer; font-size: 18px; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="background: ${getNodeColor(node.type)}; padding: 8px 10px; border-radius: 6px; margin-bottom: 10px;">
            <div style="color: ${nodeBadgeTitleColor}; font-weight: 600; font-size: 12px; margin-bottom: 2px;">
                ${getNodeVisualIcon(node)} ${escapeHtml(node.label)}
            </div>
            <div style="color: ${nodeBadgeSubtitleColor}; font-size: 11px;">
                ${escapeHtml(node.description || '')}
            </div>
        </div>
        ${detailsSection}
        ${traceColumnsAction}
        <div style="color: ${footerColor}; font-size: 10px; margin-top: 12px;">
            Type: ${node.type}<br>
            ID: ${escapeHtml(node.id)}
        </div>
    `;

    detailsPanel.querySelector('#close-details')?.addEventListener('click', () => {
        onSelectNode(null);
    });

    detailsPanel.querySelector('#trace-columns-btn')?.addEventListener('click', () => {
        onToggleColumnFlows(true);
    });
}

export function updateStatsPanelContent(options: StatsPanelOptions): void {
    const {
        statsPanel,
        currentStats,
        currentTableUsage,
        isDarkTheme,
        statsMinimized,
        setStatsMinimized,
        escapeHtml,
        onNavigateToTable,
        onRequestRerender,
    } = options;

    if (!statsPanel || !currentStats) {
        return;
    }

    const textColor = isDarkTheme ? UI_COLORS.text : UI_COLORS.textLight;
    const textColorMuted = isDarkTheme ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const textColorDim = isDarkTheme ? UI_COLORS.textDim : UI_COLORS.textLightDim;
    const tableTextColor = isDarkTheme ? UI_COLORS.textSubtle : UI_COLORS.textLightSubtle;
    const borderColor = isDarkTheme ? UI_COLORS.border : UI_COLORS.borderMedium;

    let tableListHtml = '';
    if (currentTableUsage && currentTableUsage.size > 0) {
        const sortedTables = Array.from(currentTableUsage.entries()).sort((a, b) => b[1] - a[1]);
        const allTableNames = sortedTables.map(([name]) => name).join(', ');
        const displayTables = sortedTables.slice(0, 10);

        tableListHtml = `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-size: 10px; color: ${textColorMuted}; font-weight: 600;">Tables Used (${currentTableUsage.size}):</div>
                    <button id="copy-tables-btn" 
                            style="
                                background: ${isDarkTheme ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'};
                                border: 1px solid ${isDarkTheme ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.3)'};
                                color: ${isDarkTheme ? '#a5b4fc' : '#6366f1'};
                                padding: 2px 8px;
                                border-radius: 4px;
                                font-size: 9px;
                                font-weight: 600;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                gap: 4px;
                                transition: all 0.2s;
                            "
                            title="Copy all table names to clipboard"
                            data-tables="${escapeHtml(allTableNames)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy
                    </button>
                </div>
                <div id="table-list" role="listbox" aria-label="Tables used in query" style="display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto;">
                    ${displayTables.map(([tableName, count], index) => `
                        <div class="table-list-item"
                             role="option"
                             tabindex="${index === 0 ? '0' : '-1'}"
                             data-table="${escapeHtml(tableName)}"
                             style="
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                font-size: 10px;
                                padding: 4px 6px;
                                border-radius: 4px;
                                cursor: pointer;
                                transition: background 0.15s;
                             "
                             title="Click to find ${escapeHtml(tableName)} in graph">
                            <span style="color: ${tableTextColor}; font-family: ${MONO_FONT_STACK};">${escapeHtml(tableName)}</span>
                            <span style="
                                background: ${count > 1 ? 'rgba(245, 158, 11, 0.2)' : (isDarkTheme ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)')};
                                color: ${count > 1 ? '#f59e0b' : textColorMuted};
                                padding: 2px 6px;
                                border-radius: 4px;
                                font-weight: 600;
                                min-width: 20px;
                                text-align: center;
                            ">${count}</span>
                        </div>
                    `).join('')}
                    ${currentTableUsage.size > 10 ? `
                        <div style="font-size: 9px; color: ${textColorDim}; font-style: italic; text-align: center; padding: 4px;">
                            +${currentTableUsage.size - 10} more (use Copy button for all)
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    const summaryMetrics: Array<{ value: number; label: string }> = [
        { value: currentStats.tables, label: currentStats.tables === 1 ? 'Table' : 'Tables' },
        { value: currentStats.joins, label: currentStats.joins === 1 ? 'Join' : 'Joins' },
        { value: currentStats.conditions, label: currentStats.conditions === 1 ? 'Filter' : 'Filters' },
        { value: currentStats.ctes, label: currentStats.ctes === 1 ? 'CTE' : 'CTEs' },
    ];

    if (currentStats.subqueries > 0) {
        summaryMetrics.push({
            value: currentStats.subqueries,
            label: currentStats.subqueries === 1 ? 'Subquery' : 'Subqueries',
        });
    }

    const summaryRowHtml = summaryMetrics
        .map((metric, index) => `
            <span style="display: inline-flex; align-items: baseline; gap: 4px;">
                <span style="color: ${textColor}; font-weight: 700; font-size: 12px;">${metric.value}</span>
                <span style="color: ${textColorMuted}; font-size: 10px; font-weight: 500;">${metric.label}</span>
            </span>
            ${index < summaryMetrics.length - 1 ? `<span aria-hidden="true" style="color: ${textColorDim}; font-size: 11px;">&middot;</span>` : ''}
        `)
        .join('');

    statsPanel.innerHTML = `
        <div id="stats-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;${statsMinimized ? '' : ' margin-bottom: 8px;'} cursor: pointer; user-select: none;" title="${statsMinimized ? 'Expand' : 'Minimize'}">
            <span style="display: inline-flex; align-items: center; gap: 8px;">
                <span style="font-weight: 600; color: ${textColor};">Query Stats</span>
                <span style="
                    background: ${COMPLEXITY_COLORS[currentStats.complexity]};
                    color: white;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                ">${currentStats.complexity}</span>
            </span>
            <span style="display: inline-flex; width: 14px; height: 14px; color: ${textColorMuted}; transform: rotate(${statsMinimized ? '-90deg' : '0deg'}); transition: transform 0.2s ease;">${ICONS.chevronDown}</span>
        </div>
        <div id="stats-body" style="display: ${statsMinimized ? 'none' : 'block'};">
            <div id="query-stats-summary-row" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 8px;">
                ${summaryRowHtml}
            </div>
            ${currentStats.functionsUsed && currentStats.functionsUsed.length > 0 ? (() => {
                const funcs = currentStats.functionsUsed!;
                const categoryOrder = ['aggregate', 'window', 'tvf', 'scalar', 'unknown'] as const;
                const categoryLabels: Record<string, string> = { aggregate: 'Aggregate', window: 'Window', tvf: 'Table-Valued', scalar: 'Scalar', unknown: 'Other' };
                const categoryColors: Record<string, string> = {
                    aggregate: isDarkTheme ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                    window: isDarkTheme ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)',
                    tvf: isDarkTheme ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                    scalar: isDarkTheme ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                    unknown: isDarkTheme ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                };
                const categoryTextColors: Record<string, string> = {
                    aggregate: '#f59e0b',
                    window: isDarkTheme ? '#a78bfa' : '#7c3aed',
                    tvf: isDarkTheme ? '#34d399' : '#059669',
                    scalar: textColorMuted,
                    unknown: textColorMuted,
                };

                const grouped = new Map<string, string[]>();
                for (const func of funcs) {
                    const category = func.category || 'unknown';
                    if (!grouped.has(category)) {
                        grouped.set(category, []);
                    }
                    grouped.get(category)!.push(func.name);
                }

                return `
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
                        <div style="font-size: 10px; color: ${textColorMuted}; font-weight: 600; margin-bottom: 6px;">Functions Used (${funcs.length}):</div>
                        ${categoryOrder.filter((category) => grouped.has(category)).map((category) => `
                            <div style="margin-bottom: 4px;">
                                <div style="font-size: 9px; color: ${textColorDim}; margin-bottom: 2px;">${categoryLabels[category]}</div>
                                <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                                    ${grouped.get(category)!.map((name) => `
                                        <span style="
                                            background: ${categoryColors[category]};
                                            color: ${categoryTextColors[category]};
                                            padding: 1px 6px;
                                            border-radius: 3px;
                                            font-size: 9px;
                                            font-family: ${MONO_FONT_STACK};
                                            font-weight: 500;
                                        ">${escapeHtml(name)}</span>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            })() : ''}
            ${tableListHtml}
        </div>
    `;

    const statsHeader = statsPanel.querySelector('#stats-header') as HTMLElement | null;
    statsHeader?.addEventListener('click', () => {
        setStatsMinimized(!statsMinimized);
        onRequestRerender();
    });

    const copyBtn = statsPanel.querySelector('#copy-tables-btn') as HTMLButtonElement | null;
    if (copyBtn) {
        const baseBg = isDarkTheme ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)';
        const hoverBg = isDarkTheme ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.15)';

        copyBtn.addEventListener('mouseenter', () => {
            copyBtn.style.background = hoverBg;
        });
        copyBtn.addEventListener('mouseleave', () => {
            copyBtn.style.background = baseBg;
        });

        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const tables = copyBtn.getAttribute('data-tables');
            if (!tables) {
                return;
            }

            try {
                await navigator.clipboard.writeText(tables);
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
                copyBtn.style.color = isDarkTheme ? '#34d399' : '#10b981';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.color = isDarkTheme ? '#a5b4fc' : '#6366f1';
                }, 2000);
            } catch {
                const textarea = document.createElement('textarea');
                textarea.value = tables;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    const originalText = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
                    copyBtn.style.color = isDarkTheme ? '#34d399' : '#10b981';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalText;
                        copyBtn.style.color = isDarkTheme ? '#a5b4fc' : '#6366f1';
                    }, 2000);
                } finally {
                    document.body.removeChild(textarea);
                }
            }
        });
    }

    const tableItems = statsPanel.querySelectorAll('.table-list-item');
    if (tableItems.length > 0) {
        const hoverBg = isDarkTheme ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)';
        const focusBg = isDarkTheme ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)';

        tableItems.forEach((item, index) => {
            const itemEl = item as HTMLElement;

            itemEl.addEventListener('mouseenter', () => {
                if (document.activeElement !== itemEl) {
                    itemEl.style.background = hoverBg;
                }
            });
            itemEl.addEventListener('mouseleave', () => {
                if (document.activeElement !== itemEl) {
                    itemEl.style.background = '';
                }
            });
            itemEl.addEventListener('focus', () => {
                itemEl.style.background = focusBg;
                itemEl.style.outline = 'none';
            });
            itemEl.addEventListener('blur', () => {
                itemEl.style.background = '';
            });

            itemEl.addEventListener('click', () => {
                onNavigateToTable(itemEl.getAttribute('data-table') || '');
            });

            itemEl.addEventListener('keydown', (e) => {
                const key = e.key;
                let nextIndex = index;

                if (key === 'ArrowDown' || key === 'ArrowRight') {
                    e.preventDefault();
                    nextIndex = Math.min(index + 1, tableItems.length - 1);
                } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
                    e.preventDefault();
                    nextIndex = Math.max(index - 1, 0);
                } else if (key === 'Home') {
                    e.preventDefault();
                    nextIndex = 0;
                } else if (key === 'End') {
                    e.preventDefault();
                    nextIndex = tableItems.length - 1;
                } else if (key === 'Enter' || key === ' ') {
                    e.preventDefault();
                    onNavigateToTable(itemEl.getAttribute('data-table') || '');
                    return;
                }

                if (nextIndex !== index) {
                    itemEl.setAttribute('tabindex', '-1');
                    const nextItem = tableItems[nextIndex] as HTMLElement;
                    nextItem.setAttribute('tabindex', '0');
                    nextItem.focus();
                }
            });
        });
    }
}

export function updateHintsPanelContent(options: HintsPanelOptions): void {
    const {
        hintsPanel,
        currentHints,
        currentNodes,
        isDarkTheme,
        panelBottom,
        hintsMinimized,
        setHintsMinimized,
        hintsShowAll,
        setHintsShowAll,
        escapeHtml,
        onSelectNode,
        onRequestRerender,
        onSyncViewportBounds,
    } = options;

    if (!hintsPanel) {
        return;
    }

    const badgeState = getHintBadgeState(currentHints || []);
    updateHintsSummaryBadge(badgeState);

    if (!currentHints || currentHints.length === 0) {
        hintsPanel.style.opacity = '0';
        hintsPanel.style.visibility = 'hidden';
        hintsPanel.style.transform = 'translateY(8px)';
        setHintsShowAll(false);
        onSyncViewportBounds(panelBottom);
        return;
    }

    hintsPanel.style.opacity = '1';
    hintsPanel.style.visibility = 'visible';
    hintsPanel.style.transform = 'translateY(0)';

    const textColor = isDarkTheme ? UI_COLORS.text : UI_COLORS.textLight;
    const textColorMuted = isDarkTheme ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const sortedHints = sortHintsByImpact(currentHints);
    const visibleHints = hintsShowAll ? sortedHints : getTopHints(sortedHints, 3);
    const remainingCount = Math.max(0, sortedHints.length - visibleHints.length);

    hintsPanel.innerHTML = `
        <div id="hints-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;${hintsMinimized ? '' : ' margin-bottom: 10px;'} cursor: pointer; user-select: none;" title="${hintsMinimized ? 'Expand' : 'Minimize'}">
            <span style="font-weight: 600; color: ${textColor}; display: inline-flex; align-items: center; gap: 6px;">
                <span style="display: inline-flex; width: 14px; height: 14px;">${ICONS.bolt}</span>
                <span>Performance Hints</span>
            </span>
            <span style="display: inline-flex; align-items: center; gap: 6px;">
                <span style="font-size: 10px; color: ${textColorMuted};">${currentHints.length} total</span>
                <span style="display: inline-flex; width: 14px; height: 14px; color: ${textColorMuted}; transform: rotate(${hintsMinimized ? '-90deg' : '0deg'}); transition: transform 0.2s ease;">${ICONS.chevronDown}</span>
            </span>
        </div>
        <div class="hints-list" style="display: ${hintsMinimized ? 'none' : 'flex'}; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto;">
            ${visibleHints.map((hint) => {
                const style = HINT_COLORS[hint.type] || HINT_COLORS.info;
                const severity = hint.severity || 'low';
                const severityColor = severity === 'high' ? STATUS_COLORS.errorDark : severity === 'medium' ? STATUS_COLORS.warningDark : UI_COLORS.textDim;
                return `
                    <div role="button" tabindex="0" class="hint-item" data-node-id="${hint.nodeId || ''}" style="
                        text-align: left;
                        border: 1px solid ${style.border};
                        border-left-width: 3px;
                        background: ${style.bg};
                        border-radius: 6px;
                        padding: 8px 10px;
                        cursor: ${hint.nodeId ? 'pointer' : 'default'};
                        user-select: text;
                    ">
                        <div style="font-size: 12px; color: ${textColor}; display: flex; align-items: center; gap: 6px;">
                            <span style="display: inline-flex; width: 12px; height: 12px;">${style.icon}</span>
                            <span>${escapeHtml(hint.message)}</span>
                            <span style="margin-left: auto; color: ${severityColor}; font-size: 9px; text-transform: uppercase;">${severity}</span>
                        </div>
                        ${hint.suggestion ? `<div style="font-size: 11px; color: ${textColorMuted}; margin-top: 4px;">${escapeHtml(hint.suggestion)}</div>` : ''}
                    </div>
                `;
            }).join('')}
            ${!hintsShowAll && remainingCount > 0 ? `
                <button id="show-all-hints" style="
                    border: 1px dashed ${isDarkTheme ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)'};
                    background: transparent;
                    color: ${isDarkTheme ? '#a5b4fc' : '#6366f1'};
                    border-radius: 6px;
                    padding: 6px 10px;
                    font-size: 11px;
                    cursor: pointer;
                ">Show all ${sortedHints.length} hints...</button>
            ` : ''}
            ${hintsShowAll && sortedHints.length > 3 ? `
                <button id="show-top-hints" style="
                    border: 1px dashed ${isDarkTheme ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)'};
                    background: transparent;
                    color: ${isDarkTheme ? '#a5b4fc' : '#6366f1'};
                    border-radius: 6px;
                    padding: 6px 10px;
                    font-size: 11px;
                    cursor: pointer;
                ">Show top 3 only</button>
            ` : ''}
        </div>
    `;

    hintsPanel.querySelectorAll('.hint-item').forEach((item) => {
        const el = item as HTMLElement;
        const nodeId = el.getAttribute('data-node-id');
        if (!nodeId) {
            el.style.cursor = 'default';
            return;
        }
        el.addEventListener('click', () => {
            const node = currentNodes.find((n) => n.id === nodeId);
            if (!node) {
                return;
            }
            onSelectNode(node.id);
        });
    });

    const showAllBtn = hintsPanel.querySelector('#show-all-hints') as HTMLButtonElement | null;
    showAllBtn?.addEventListener('click', () => {
        setHintsShowAll(true);
        onRequestRerender();
    });

    const showTopBtn = hintsPanel.querySelector('#show-top-hints') as HTMLButtonElement | null;
    showTopBtn?.addEventListener('click', () => {
        setHintsShowAll(false);
        onRequestRerender();
    });

    const hintsHeader = hintsPanel.querySelector('#hints-header') as HTMLElement | null;
    hintsHeader?.addEventListener('click', () => {
        setHintsMinimized(!hintsMinimized);
        onRequestRerender();
    });

    onSyncViewportBounds(panelBottom);
}
