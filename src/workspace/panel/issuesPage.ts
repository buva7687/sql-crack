import { ICONS } from '../../shared';
import { DetailedWorkspaceStats } from '../types';

export interface IssuesPageHtmlOptions {
    nonce: string;
    detailedStats: DetailedWorkspaceStats | null;
    totalIssues: number;
    styles: string;
    script: string;
    escapeHtml: (value: string) => string;
}

export function createIssuesPageHtml(options: IssuesPageHtmlOptions): string {
    const {
        nonce,
        detailedStats,
        totalIssues,
        styles,
        script,
        escapeHtml,
    } = options;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Workspace Issues</title>
    <style>
        ${styles}
    </style>
</head>
<body>
    <div id="app">
        <header class="header">
            <div class="header-left">
                <button class="back-btn" id="btn-back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back to Graph
                </button>
                <h1 class="header-title">Workspace Issues</h1>
            </div>
            <div class="header-right">
                ${totalIssues > 0
                    ? `<span class="issue-count ${totalIssues > 5 ? 'error' : 'warning'}">${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found</span>`
                    : `<span class="issue-count success"><span class="header-icon-svg">${ICONS.check}</span> All clear</span>`}
            </div>
        </header>

        ${totalIssues > 0 && detailedStats ? `
        <div class="summary-bar">
            <div class="summary-card warning">
                <div class="summary-card-value">${detailedStats.orphanedDetails.length}</div>
                <div class="summary-card-label">Orphaned Definitions</div>
            </div>
            <div class="summary-card error">
                <div class="summary-card-value">${detailedStats.missingDetails.length}</div>
                <div class="summary-card-label">Missing Definitions</div>
            </div>
        </div>
        ` : ''}

        <div class="content">
            ${!detailedStats || detailedStats.orphanedDetails.length === 0 ? '' : `
            <div class="section">
                <div class="section-header">
                    <div class="section-icon warning">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="section-title">Orphaned Definitions</span>
                            <span class="section-count">${detailedStats.orphanedDetails.length}</span>
                        </div>
                        <div class="section-desc">Tables and views defined but never referenced</div>
                    </div>
                </div>
                <div class="list">
                    ${detailedStats.orphanedDetails.slice(0, 50).map(item => `
                    <div class="list-item" data-filepath="${escapeHtml(item.filePath)}" data-line="${item.lineNumber}">
                        <span class="item-type ${item.type}">${item.type}</span>
                        <div class="item-info">
                            <div class="item-name">${escapeHtml(item.name)}</div>
                            <div class="item-path">${escapeHtml(item.filePath)}</div>
                        </div>
                        <span class="item-line">line ${item.lineNumber}</span>
                    </div>
                    `).join('')}
                    ${detailedStats.orphanedDetails.length > 50 ? `<div class="list-more">+ ${detailedStats.orphanedDetails.length - 50} more items</div>` : ''}
                </div>
            </div>
            `}

            ${!detailedStats || detailedStats.missingDetails.length === 0 ? '' : `
            <div class="section">
                <div class="section-header">
                    <div class="section-icon error">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="section-title">Missing Definitions</span>
                            <span class="section-count">${detailedStats.missingDetails.length}</span>
                        </div>
                        <div class="section-desc">Tables referenced but not defined in workspace</div>
                    </div>
                </div>
                <div class="list">
                    ${detailedStats.missingDetails.slice(0, 30).map(item => `
                    <div class="missing-card">
                        <div class="missing-card-header">
                            <div class="missing-card-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                                </svg>
                            </div>
                            <span class="missing-card-name">${escapeHtml(item.tableName)}</span>
                            <span class="missing-card-count">${item.referenceCount} ref${item.referenceCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="missing-card-refs">
                            ${item.references.slice(0, 4).map(ref => `
                            <div class="missing-ref-item" data-filepath="${escapeHtml(ref.filePath)}" data-line="${ref.lineNumber}">
                                <span class="missing-ref-path">${escapeHtml(ref.filePath)}</span>
                                <span class="missing-ref-line">:${ref.lineNumber}</span>
                            </div>
                            `).join('')}
                            ${item.references.length > 4 ? `<div class="missing-more">+ ${item.references.length - 4} more references</div>` : ''}
                        </div>
                    </div>
                    `).join('')}
                    ${detailedStats.missingDetails.length > 30 ? `<div class="list-more">+ ${detailedStats.missingDetails.length - 30} more missing tables</div>` : ''}
                </div>
            </div>
            `}

            ${(!detailedStats || (detailedStats.orphanedDetails.length === 0 && detailedStats.missingDetails.length === 0)) ? `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                </div>
                <div class="empty-state-title">No Issues Found</div>
                <div class="empty-state-desc">All tables and views are properly defined and referenced in your workspace.</div>
            </div>
            ` : ''}
        </div>
    </div>

    ${script}
</body>
</html>`;
}
