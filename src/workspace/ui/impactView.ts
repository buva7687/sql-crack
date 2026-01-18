// Impact View - Display impact analysis reports

import { ImpactReport, ImpactItem } from '../lineage/impactAnalyzer';
import { LineageGraph, LineageNode } from '../lineage/types';

/**
 * Generates HTML for impact analysis reports
 */
export class ImpactView {
    /**
     * Generate impact analysis form interface
     * 
     * Provides a form-based UI at the top of the Impact tab allowing users to:
     * 1. Select a table/view from dropdown (populated from workspace graph)
     * 2. Choose a change type (Modify, Delete, Rename, Add Column)
     * 3. Click "Analyze Impact" to run the analysis
     * 
     * @param graph - The lineage graph containing all tables/views in workspace
     * @returns HTML string for the form interface
     */
    generateImpactForm(graph: LineageGraph | null): string {
        // Collect all tables and views from the lineage graph
        const tables: LineageNode[] = [];
        if (graph) {
            graph.nodes.forEach((node) => {
                // Only include tables and views (exclude CTEs, external references)
                if (node.type === 'table' || node.type === 'view') {
                    tables.push(node);
                }
            });
        }
        // Sort alphabetically for easier navigation
        tables.sort((a, b) => a.name.localeCompare(b.name));

        return `
            <div class="impact-form-container">
                <div class="impact-form">
                    <div class="form-header">
                        <h3>🔍 Impact Analysis</h3>
                        <p class="form-description">Analyze the impact of changes to tables or views in your workspace</p>
                    </div>
                    <div class="form-fields">
                        <div class="form-field">
                            <label for="impact-table-select">Table/View</label>
                            <select id="impact-table-select" class="form-select">
                                <option value="">-- Select a table or view --</option>
                                ${tables.map(table => `
                                    <option value="${this.escapeHtml(table.id)}" data-name="${this.escapeHtml(table.name)}" data-type="${table.type}">
                                        ${this.escapeHtml(table.name)} (${table.type})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-field">
                            <label>Change Type</label>
                            <div class="radio-group">
                                <label class="radio-label">
                                    <input type="radio" name="change-type" value="modify" checked>
                                    <span>Modify</span>
                                </label>
                                <label class="radio-label">
                                    <input type="radio" name="change-type" value="delete">
                                    <span>Delete</span>
                                </label>
                                <label class="radio-label">
                                    <input type="radio" name="change-type" value="rename">
                                    <span>Rename</span>
                                </label>
                                <label class="radio-label">
                                    <input type="radio" name="change-type" value="addColumn">
                                    <span>Add Column</span>
                                </label>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button id="impact-analyze-btn" class="btn-primary" disabled>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                                </svg>
                                Analyze Impact
                            </button>
                        </div>
                    </div>
                </div>
                <div id="impact-results" class="impact-results" style="display: none;"></div>
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
