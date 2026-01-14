// Query stats panel

import { state, statsPanel, currentStats, currentTableUsage } from '../state';
import { escapeHtml } from '../utils';

export function updateStatsPanel(): void {
    if (!statsPanel || !currentStats) { return; }

    const isDark = state.isDarkTheme;
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const textColorMuted = isDark ? '#94a3b8' : '#64748b';
    const textColorDim = isDark ? '#64748b' : '#94a3b8';
    const tableTextColor = isDark ? '#cbd5e1' : '#334155';
    const borderColor = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    const complexityColors: Record<string, string> = {
        'Simple': '#22c55e',
        'Moderate': '#eab308',
        'Complex': '#f97316',
        'Very Complex': '#ef4444'
    };

    // Build table list HTML
    let tableListHtml = '';
    if (currentTableUsage && currentTableUsage.size > 0) {
        const sortedTables = Array.from(currentTableUsage.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by usage count descending
            .slice(0, 8); // Show top 8 tables

        tableListHtml = `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
                <div style="font-size: 10px; color: ${textColorMuted}; margin-bottom: 6px; font-weight: 600;">Tables Used:</div>
                <div style="display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto;">
                    ${sortedTables.map(([tableName, count]) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
                            <span style="color: ${tableTextColor}; font-family: monospace;">${escapeHtml(tableName)}</span>
                            <span style="
                                background: ${count > 1 ? 'rgba(245, 158, 11, 0.2)' : (isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)')};
                                color: ${count > 1 ? '#f59e0b' : textColorMuted};
                                padding: 2px 6px;
                                border-radius: 4px;
                                font-weight: 600;
                                min-width: 20px;
                                text-align: center;
                            ">${count}</span>
                        </div>
                    `).join('')}
                    ${currentTableUsage.size > 8 ? `
                        <div style="font-size: 9px; color: ${textColorDim}; font-style: italic;">
                            +${currentTableUsage.size - 8} more
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    statsPanel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-weight: 600; color: ${textColor};">Query Stats</span>
            <span style="
                background: ${complexityColors[currentStats.complexity]};
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
            ">${currentStats.complexity}</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
            <div style="text-align: center;">
                <div style="color: ${textColor}; font-weight: 600;">${currentStats.tables}</div>
                <div style="font-size: 10px; color: ${textColorMuted};">Tables</div>
            </div>
            <div style="text-align: center;">
                <div style="color: ${textColor}; font-weight: 600;">${currentStats.joins}</div>
                <div style="font-size: 10px; color: ${textColorMuted};">Joins</div>
            </div>
            <div style="text-align: center;">
                <div style="color: ${textColor}; font-weight: 600;">${currentStats.conditions}</div>
                <div style="font-size: 10px; color: ${textColorMuted};">Filters</div>
            </div>
            <div style="text-align: center;">
                <div style="color: ${textColor}; font-weight: 600;">${currentStats.complexityScore}</div>
                <div style="font-size: 10px; color: ${textColorMuted};">Score</div>
            </div>
        </div>
        ${currentStats.ctes > 0 || currentStats.subqueries > 0 || currentStats.windowFunctions > 0 ? `
            <div style="display: flex; gap: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor}; color: ${textColorMuted};">
                ${currentStats.ctes > 0 ? `<span>CTEs: ${currentStats.ctes}</span>` : ''}
                ${currentStats.subqueries > 0 ? `<span>Subqueries: ${currentStats.subqueries}</span>` : ''}
                ${currentStats.windowFunctions > 0 ? `<span>Window: ${currentStats.windowFunctions}</span>` : ''}
            </div>
        ` : ''}
        ${(currentStats.performanceScore !== undefined || currentStats.performanceIssues !== undefined) ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid ${borderColor};">
                <div style="font-size: 10px; color: ${textColorMuted}; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Performance</div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                    ${currentStats.performanceScore !== undefined ? `
                        <div style="text-align: center; background: ${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.5)'}; padding: 6px; border-radius: 4px;">
                            <div style="color: ${currentStats.performanceScore >= 80 ? '#22c55e' : currentStats.performanceScore >= 60 ? '#eab308' : '#ef4444'}; font-weight: 600; font-size: 14px;">${currentStats.performanceScore}</div>
                            <div style="font-size: 9px; color: ${textColorMuted}; margin-top: 2px;">Score</div>
                        </div>
                    ` : ''}
                    ${currentStats.performanceIssues !== undefined ? `
                        <div style="text-align: center; background: ${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.5)'}; padding: 6px; border-radius: 4px;">
                            <div style="color: ${textColor}; font-weight: 600; font-size: 14px;">${currentStats.performanceIssues}</div>
                            <div style="font-size: 9px; color: ${textColorMuted}; margin-top: 2px;">Issues</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        ` : ''}
        ${(currentStats.maxCteDepth !== undefined || currentStats.maxFanOut !== undefined || currentStats.criticalPathLength !== undefined || currentStats.complexityBreakdown) ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid ${borderColor};">
                <div style="font-size: 10px; color: ${textColorMuted}; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Complexity Insights</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px;">
                    ${currentStats.maxCteDepth !== undefined ? `
                        <div style="text-align: center; background: ${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.5)'}; padding: 6px; border-radius: 4px;">
                            <div style="color: ${textColor}; font-weight: 600; font-size: 14px;">${currentStats.maxCteDepth}</div>
                            <div style="font-size: 9px; color: ${textColorMuted}; margin-top: 2px;">CTE Depth</div>
                        </div>
                    ` : ''}
                    ${currentStats.maxFanOut !== undefined ? `
                        <div style="text-align: center; background: ${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.5)'}; padding: 6px; border-radius: 4px;">
                            <div style="color: ${textColor}; font-weight: 600; font-size: 14px;">${currentStats.maxFanOut}</div>
                            <div style="font-size: 9px; color: ${textColorMuted}; margin-top: 2px;">Max Fan-Out</div>
                        </div>
                    ` : ''}
                    ${currentStats.criticalPathLength !== undefined ? `
                        <div style="text-align: center; background: ${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.5)'}; padding: 6px; border-radius: 4px;">
                            <div style="color: ${textColor}; font-weight: 600; font-size: 14px;">${currentStats.criticalPathLength}</div>
                            <div style="font-size: 9px; color: ${textColorMuted}; margin-top: 2px;">Path Length</div>
                        </div>
                    ` : ''}
                </div>
                ${currentStats.complexityBreakdown ? `
                    <div style="background: ${isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.5)'}; padding: 8px; border-radius: 4px;">
                        <div style="font-size: 9px; color: ${textColorMuted}; margin-bottom: 6px; font-weight: 600;">Complexity Breakdown:</div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            ${currentStats.complexityBreakdown.joins > 0 ? `
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
                                    <span style="color: ${textColorMuted};">Joins</span>
                                    <span style="color: ${textColor}; font-weight: 600;">${currentStats.complexityBreakdown.joins}</span>
                                </div>
                            ` : ''}
                            ${currentStats.complexityBreakdown.subqueries > 0 ? `
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
                                    <span style="color: ${textColorMuted};">Subqueries</span>
                                    <span style="color: ${textColor}; font-weight: 600;">${currentStats.complexityBreakdown.subqueries}</span>
                                </div>
                            ` : ''}
                            ${currentStats.complexityBreakdown.ctes > 0 ? `
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
                                    <span style="color: ${textColorMuted};">CTEs</span>
                                    <span style="color: ${textColor}; font-weight: 600;">${currentStats.complexityBreakdown.ctes}</span>
                                </div>
                            ` : ''}
                            ${currentStats.complexityBreakdown.aggregations > 0 ? `
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
                                    <span style="color: ${textColorMuted};">Aggregations</span>
                                    <span style="color: ${textColor}; font-weight: 600;">${currentStats.complexityBreakdown.aggregations}</span>
                                </div>
                            ` : ''}
                            ${currentStats.complexityBreakdown.windowFunctions > 0 ? `
                                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
                                    <span style="color: ${textColorMuted};">Window Functions</span>
                                    <span style="color: ${textColor}; font-weight: 600;">${currentStats.complexityBreakdown.windowFunctions}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        ` : ''}
        ${tableListHtml}
    `;
}
