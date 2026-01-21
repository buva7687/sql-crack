// Impact View - Display impact analysis reports

import { ImpactReport, ImpactItem } from '../lineage/impactAnalyzer';
import { LineageGraph, LineageNode } from '../lineage/types';

/**
 * Generates HTML for impact analysis reports
 */
export class ImpactView {
    /**
     * Generate impact analysis form interface
     */
    generateImpactForm(graph: LineageGraph | null): string {
        // Collect all tables/views for dropdown
        const tables: LineageNode[] = [];
        let tableCount = 0;
        let viewCount = 0;
        if (graph) {
            graph.nodes.forEach((node) => {
                if (node.type === 'table' || node.type === 'view') {
                    tables.push(node);
                    if (node.type === 'table') tableCount++;
                    else viewCount++;
                }
            });
        }
        tables.sort((a, b) => a.name.localeCompare(b.name));

        return `
            <div class="view-container">
                <!-- View Header -->
                <div class="view-header">
                    <div class="view-header-icon">🎯</div>
                    <div class="view-header-content">
                        <h3 class="view-title">Impact Analysis</h3>
                        <p class="view-subtitle">Analyze the impact of changes to tables or views in your workspace</p>
                    </div>
                </div>

                <!-- Stats -->
                <div class="view-stats">
                    <div class="view-stat-badge">
                        <span class="view-stat-value">${tables.length}</span>
                        <span class="view-stat-label">Total</span>
                    </div>
                    <div class="view-stat-badge">
                        <span class="view-stat-value">${tableCount}</span>
                        <span class="view-stat-label">Tables</span>
                    </div>
                    <div class="view-stat-badge">
                        <span class="view-stat-value">${viewCount}</span>
                        <span class="view-stat-label">Views</span>
                    </div>
                </div>

                <!-- Form -->
                <div class="view-content">
                    <div class="view-form-card">
                        <div class="view-form-fields">
                            <div class="view-form-field">
                                <label for="impact-table-select">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
                                    </svg>
                                    Table/View
                                </label>
                                <select id="impact-table-select" class="form-select">
                                    <option value="">-- Select a table or view --</option>
                                    ${tables.map(table => `
                                        <option value="${this.escapeHtml(table.id)}" data-name="${this.escapeHtml(table.name)}" data-type="${table.type}">
                                            ${this.escapeHtml(table.name)} (${table.type})
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="view-form-field">
                                <label>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                                    </svg>
                                    Change Type
                                </label>
                                <div class="change-type-buttons">
                                    <button class="change-type-btn active" data-value="modify" type="button">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                        <span>Modify</span>
                                    </button>
                                    <button class="change-type-btn" data-value="delete" type="button">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                        </svg>
                                        <span>Delete</span>
                                    </button>
                                    <button class="change-type-btn" data-value="rename" type="button">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                                        </svg>
                                        <span>Rename</span>
                                    </button>
                                    <button class="change-type-btn" data-value="addColumn" type="button">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                        </svg>
                                        <span>Add Column</span>
                                    </button>
                                </div>
                            </div>
                            <div class="view-form-actions">
                                <button id="impact-analyze-btn" class="btn-primary" disabled>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                                    </svg>
                                    <span>Analyze Impact</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div id="impact-results" class="impact-results" style="display: none;"></div>
                </div>
            </div>
        `;
    }

    /**
     * Generate empty state for impact tab
     */
    generateEmptyState(): string {
        return `
            <div class="impact-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4l3 3"/>
                </svg>
                <h3>Impact Analysis</h3>
                <p>Select a table or view above and choose a change type to analyze the impact of modifications.</p>
                <p class="hint">This will show you which tables, views, and files would be affected by your changes.</p>
            </div>
        `;
    }

    /**
     * Generate impact analysis report HTML
     */
    generateImpactReport(report: ImpactReport): string {
        let html = `
            <div class="impact-report">
                <div class="report-header">
                    <h2>Impact Analysis Report</h2>
                    ${this.generateSeverityBadge(report.severity)}
                </div>

                <div class="report-target">
                    <h3>Target</h3>
                    <p><strong>${report.changeType.toUpperCase()}:</strong>
                    ${report.target.type} "${this.escapeHtml(report.target.name)}"</p>
                </div>

                ${this.generateSummary(report.summary)}

                ${report.directImpacts.length > 0 ? this.generateImpactList('Direct Impacts', report.directImpacts) : ''}

                ${report.transitiveImpacts.length > 0 ? this.generateImpactList('Transitive Impacts', report.transitiveImpacts) : ''}

                ${report.suggestions.length > 0 ? this.generateSuggestions(report.suggestions) : ''}

                ${this.generateExportOptions()}
            </div>
        `;

        return html;
    }

    /**
     * Generate severity indicator badge
     */
    generateSeverityBadge(severity: string): string {
        const colors: Record<string, string> = {
            'critical': '#dc2626',
            'high': '#f59e0b',
            'medium': '#10b981',
            'low': '#6b7280'
        };

        const icons: Record<string, string> = {
            'critical': '🔴',
            'high': '🟠',
            'medium': '🟡',
            'low': '🟢'
        };

        const color = colors[severity] || colors.low;
        const icon = icons[severity] || '';

        return `
            <div class="severity-badge" style="background-color: ${color}">
                ${icon} ${severity.toUpperCase()} IMPACT
            </div>
        `;
    }

    /**
     * Generate summary section
     */
    private generateSummary(summary: ImpactReport['summary']): string {
        return `
            <div class="impact-summary">
                <h3>Summary</h3>
                <div class="summary-stats">
                    <div class="stat-item">
                        <span class="stat-value">${summary.totalAffected}</span>
                        <span class="stat-label">Total Affected</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${summary.tablesAffected}</span>
                        <span class="stat-label">Tables</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${summary.viewsAffected}</span>
                        <span class="stat-label">Views</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${summary.filesAffected}</span>
                        <span class="stat-label">Files</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Generate affected items list
     */
    private generateImpactList(title: string, items: ImpactItem[]): string {
        let html = `
            <div class="impact-list">
                <h3>${title} (${items.length})</h3>
                <div class="items-grid">
        `;

        for (const item of items) {
            html += `
                <div class="impact-item severity-${item.severity}">
                    <div class="item-header">
                        <span class="item-type">${item.node.type}</span>
                        <span class="item-severity">${item.severity}</span>
                    </div>
                    <div class="item-name">${this.escapeHtml(item.node.name)}</div>
                    <div class="item-reason">${this.escapeHtml(item.reason)}</div>
                    <div class="item-location">
                        <span>📄 ${this.escapeHtml(item.filePath)}</span>
                        ${item.lineNumber > 0 ? `<span>Line ${item.lineNumber}</span>` : ''}
                    </div>
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Generate export options
     */
    private generateExportOptions(): string {
        return `
            <div class="export-options">
                <h3>Export Report</h3>
                <div class="export-buttons">
                    <button onclick="exportImpactReport('markdown')">📝 Markdown</button>
                    <button onclick="exportImpactReport('json')">📋 JSON</button>
                </div>
            </div>
        `;
    }

    /**
     * Generate suggestions
     */
    private generateSuggestions(suggestions: string[]): string {
        let html = `
            <div class="suggestions">
                <h3>💡 Suggestions</h3>
                <ul>
        `;

        for (const suggestion of suggestions) {
            html += `<li>${this.escapeHtml(suggestion)}</li>`;
        }

        html += `
                </ul>
            </div>
        `;

        return html;
    }

    /**
     * Escape HTML entities
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
