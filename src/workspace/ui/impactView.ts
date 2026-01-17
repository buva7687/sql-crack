// Impact View - Display impact analysis reports

import { ImpactReport, ImpactItem } from '../lineage/impactAnalyzer';

/**
 * Generates HTML for impact analysis reports
 */
export class ImpactView {
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
