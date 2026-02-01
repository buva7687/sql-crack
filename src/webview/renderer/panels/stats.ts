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
            .sort((a, b) => b[1] - a[1]); // Sort by usage count descending

        const displayTables = sortedTables.slice(0, 10); // Show top 10 tables

        tableListHtml = `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-size: 10px; color: ${textColorMuted}; font-weight: 600;">Tables Used (${currentTableUsage.size}):</div>
                    <button id="copy-tables-btn" 
                            style="
                                background: ${isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'};
                                border: 1px solid ${isDark ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.3)'};
                                color: ${isDark ? '#a5b4fc' : '#6366f1'};
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
                            onmouseover="this.style.background='${isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.15)'}'"
                            onmouseout="this.style.background='${isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'}'"
                            title="Copy all table names to clipboard">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy
                    </button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto;">
                    ${displayTables.map(([tableName, count]) => `
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
                    ${currentTableUsage.size > 10 ? `
                        <div style="font-size: 9px; color: ${textColorDim}; font-style: italic; text-align: center; padding: 4px;">
                            +${currentTableUsage.size - 10} more (use Copy button for all)
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
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px;">
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
        </div>
        ${(currentStats.ctes > 0 || currentStats.subqueries > 0) ? `
            <div style="display: flex; gap: 12px; margin-bottom: 8px; padding-top: 8px; border-top: 1px solid ${borderColor}; justify-content: center;">
                ${currentStats.ctes > 0 ? `
                    <div style="text-align: center;">
                        <div style="color: ${textColor}; font-weight: 600; font-size: 12px;">${currentStats.ctes}</div>
                        <div style="font-size: 9px; color: ${textColorMuted};">CTE${currentStats.ctes !== 1 ? 's' : ''}</div>
                    </div>
                ` : ''}
                ${currentStats.subqueries > 0 ? `
                    <div style="text-align: center;">
                        <div style="color: ${textColor}; font-weight: 600; font-size: 12px;">${currentStats.subqueries}</div>
                        <div style="font-size: 9px; color: ${textColorMuted};">Subquer${currentStats.subqueries !== 1 ? 'ies' : 'y'}</div>
                    </div>
                ` : ''}
            </div>
        ` : ''}
        ${tableListHtml}
    `;

    // Add event listener for copy button
    const copyBtn = statsPanel.querySelector('#copy-tables-btn') as HTMLButtonElement | null;
    if (copyBtn && currentTableUsage && currentTableUsage.size > 0) {
        const sortedTables = Array.from(currentTableUsage.entries())
            .sort((a, b) => b[1] - a[1]);
        const allTableNames = sortedTables.map(([name]) => name).join(', ');
        
        // Remove existing listener if any
        const newCopyBtn = copyBtn.cloneNode(true) as HTMLButtonElement;
        copyBtn.parentNode?.replaceChild(newCopyBtn, copyBtn);
        
        newCopyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await navigator.clipboard.writeText(allTableNames);
                const originalText = newCopyBtn.innerHTML;
                newCopyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
                newCopyBtn.style.color = isDark ? '#34d399' : '#10b981';
                setTimeout(() => {
                    newCopyBtn.innerHTML = originalText;
                    newCopyBtn.style.color = isDark ? '#a5b4fc' : '#6366f1';
                }, 2000);
            } catch (err) {
                // Fallback for browsers that don't support clipboard API
                const textarea = document.createElement('textarea');
                textarea.value = allTableNames;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                    const originalText = newCopyBtn.innerHTML;
                    newCopyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
                    newCopyBtn.style.color = isDark ? '#34d399' : '#10b981';
                    setTimeout(() => {
                        newCopyBtn.innerHTML = originalText;
                        newCopyBtn.style.color = isDark ? '#a5b4fc' : '#6366f1';
                    }, 2000);
                } catch {
                    // Fallback copy failed silently
                }
                document.body.removeChild(textarea);
            }
        });
    }
}
