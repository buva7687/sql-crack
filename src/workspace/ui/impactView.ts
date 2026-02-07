// Impact View - Display impact analysis reports

import { ImpactReport, ImpactItem } from '../lineage/impactAnalyzer';
import { LineageGraph, LineageNode } from '../lineage/types';
import { ICONS } from '../../shared';

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
                    if (node.type === 'table') {tableCount++;}
                    else {viewCount++;}
                }
            });
        }
        tables.sort((a, b) => a.name.localeCompare(b.name));

        return `
            <div class="view-container view-impact">
                <div class="view-compact-header">
                    <span class="view-icon">${ICONS.warning}</span>
                    <h3>Impact</h3>
                    <span class="view-inline-stats">${tableCount} tables, ${viewCount} views</span>
                </div>
                <div class="view-search-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input type="text"
                           id="impact-search-input"
                           class="view-search-input"
                           placeholder="Search tables, views..."
                           autocomplete="off"
                           value="">
                    <button class="view-search-clear" id="impact-search-clear">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="view-filters">
                    <div class="view-quick-filters">
                        <span class="view-filter-label">Filter:</span>
                        <button class="view-filter-chip active" data-filter="all">All</button>
                        <button class="view-filter-chip" data-filter="table">Tables</button>
                        <button class="view-filter-chip" data-filter="view">Views</button>
                    </div>
                    <div class="view-results-info" id="impact-results-info" style="display: none;">
                        <span id="impact-results-count">0</span> results
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
                                    <span class="field-hint">(${tableCount} tables, ${viewCount} views)</span>
                                </label>
                                <select id="impact-table-select" class="form-select">
                                    <option value="">-- Select a table or view (${tableCount} tables, ${viewCount} views) --</option>
                                    ${tables.map(table => `
                                        <option value="${this.escapeHtml(table.id)}" data-name="${this.escapeHtml(table.name)}" data-type="${table.type}">
                                            ${this.escapeHtml(table.name)} (${table.type})
                                        </option>
                                    `).join('')}
                                </select>
                                <div class="field-subtext">Available: ${tableCount} tables • ${viewCount} views</div>
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

                ${this.generateSummary(report)}

                ${report.directImpacts.length > 0 ? this.generateImpactList('Direct Impacts', report.directImpacts) : ''}

                ${report.transitiveImpacts.length > 0 ? this.generateGroupedTransitiveImpacts(report.transitiveImpacts, report.target.name) : ''}

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
        const normalizedSeverity = ['critical', 'high', 'medium', 'low'].includes(severity)
            ? severity
            : 'low';

        return `
            <div class="severity-badge severity-${normalizedSeverity}">
                ${normalizedSeverity.toUpperCase()} IMPACT
            </div>
        `;
    }

    /**
     * Generate summary section
     */
    private generateSummary(report: ImpactReport): string {
        const impacts = [...report.directImpacts, ...report.transitiveImpacts];
        const unique = (values: string[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
        const totalLabel = impacts.length > 0 && impacts.every(i => i.node.type === 'column')
            ? 'Columns Affected'
            : 'Total Affected';

        const totalItems = unique(impacts.map(item => `${item.node.name} (${item.node.type})`)).map(item => ({
            label: item,
            title: 'Affected item'
        }));
        const tables = unique(impacts.filter(i => i.node.type === 'table').map(i => i.node.name)).map(name => ({
            label: name,
            title: 'Table'
        }));
        const views = unique(impacts.filter(i => i.node.type === 'view').map(i => i.node.name)).map(name => ({
            label: name,
            title: 'View'
        }));
        const files = unique(impacts.map(i => i.filePath).filter(Boolean) as string[]).map(filePath => {
            const fileName = filePath.split('/').pop() || filePath;
            return {
                label: fileName,
                title: filePath
            };
        });

        const encodeList = (items: Array<{ label: string; title: string }>) =>
            encodeURIComponent(JSON.stringify(items));

        return `
            <div class="impact-summary">
                <h3>Summary</h3>
                <div class="summary-stats summary-stats-compact">
                    <button class="stat-item impact-summary-trigger" data-title="${totalLabel}" data-list="${encodeList(totalItems)}" type="button">
                        <span class="stat-value">${report.summary.totalAffected}</span>
                        <span class="stat-label">${totalLabel}</span>
                    </button>
                    <button class="stat-item impact-summary-trigger" data-title="Tables" data-list="${encodeList(tables)}" type="button">
                        <span class="stat-value">${report.summary.tablesAffected}</span>
                        <span class="stat-label">Tables</span>
                    </button>
                    <button class="stat-item impact-summary-trigger" data-title="Views" data-list="${encodeList(views)}" type="button">
                        <span class="stat-value">${report.summary.viewsAffected}</span>
                        <span class="stat-label">Views</span>
                    </button>
                    <button class="stat-item impact-summary-trigger" data-title="Files" data-list="${encodeList(files)}" type="button">
                        <span class="stat-value">${report.summary.filesAffected}</span>
                        <span class="stat-label">Files</span>
                    </button>
                </div>
                <div class="summary-details" id="impact-summary-details" style="display: none;">
                    <div class="summary-details-header">
                        <span id="impact-summary-title">Details</span>
                        <button class="summary-details-close" id="impact-summary-close" type="button">Close</button>
                    </div>
                    <div class="summary-details-list" id="impact-summary-list"></div>
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
                <div class="impact-list-header">
                    <h3>${title}</h3>
                    <span class="impact-count">${items.length} affected</span>
                </div>
                <div class="items-grid">
        `;

        for (const item of items) {
            const definitionFiles = Array.isArray(item.node.metadata?.definitionFiles)
                ? item.node.metadata.definitionFiles as string[]
                : [];
            const filePath = item.filePath && item.filePath !== 'Unknown' ? item.filePath : '';
            const fileName = filePath ? filePath.split('/').pop() || filePath : '';
            const location = item.lineNumber > 0 ? `${fileName} • Line ${item.lineNumber}` : fileName;
            const typeLabel = item.node.type === 'view' ? 'view'
                : item.node.type === 'table' ? 'table'
                    : item.node.type;
            const hasMultipleDefinitions = !filePath && definitionFiles.length > 1;
            const displayFile = hasMultipleDefinitions
                ? `${definitionFiles.length} definition files`
                : (location || (definitionFiles[0]?.split('/').pop() || 'Unknown file'));
            const tooltip = hasMultipleDefinitions
                ? definitionFiles.join('\n')
                : (filePath || definitionFiles[0] || 'File location not available');

            const severityIcon = item.severity === 'high'
                ? `<span class="severity-icon">${ICONS.warning}</span>`
                : `<span class="severity-icon">${item.severity === 'medium' ? '●' : '○'}</span>`;
            html += `
                <div class="impact-item severity-${item.severity}">
                    <div class="item-header">
                        <span class="item-type">${typeLabel}</span>
                        <span class="item-severity">${severityIcon} ${item.severity}</span>
                    </div>
                    <div class="item-name">${this.escapeHtml(item.node.name)}</div>
                    <div class="item-reason">${this.escapeHtml(item.reason)}</div>
                    <div class="item-location" title="${this.escapeHtml(tooltip)}">
                        <span class="file-icon">${ICONS.document}</span>
                        <span>${this.escapeHtml(displayFile)}</span>
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
     * Generate grouped transitive impacts (columns grouped by parent table)
     */
    private generateGroupedTransitiveImpacts(items: ImpactItem[], targetName: string): string {
        // Group items by parent table
        const groups = new Map<string, { tableName: string; items: ImpactItem[]; maxSeverity: string }>();

        for (const item of items) {
            // Extract parent table from column ID (format: column:{tableKey}.{columnName})
            let parentTable = 'Other';
            if (item.node.type === 'column' && item.node.id.startsWith('column:')) {
                const withoutPrefix = item.node.id.substring(7); // Remove 'column:'
                const dotIndex = withoutPrefix.lastIndexOf('.');
                if (dotIndex > 0) {
                    parentTable = withoutPrefix.substring(0, dotIndex);
                }
            } else if (item.node.type === 'table' || item.node.type === 'view') {
                parentTable = item.node.name;
            }

            if (!groups.has(parentTable)) {
                groups.set(parentTable, { tableName: parentTable, items: [], maxSeverity: 'low' });
            }
            const group = groups.get(parentTable)!;
            group.items.push(item);

            // Track highest severity in group
            const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
            if (severityOrder[item.severity as keyof typeof severityOrder] > severityOrder[group.maxSeverity as keyof typeof severityOrder]) {
                group.maxSeverity = item.severity;
            }
        }

        // Sort groups by item count (largest first)
        const sortedGroups = Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length);

        let html = `
            <div class="impact-list transitive-grouped">
                <div class="impact-list-header">
                    <h3>Transitive Impacts</h3>
                    <span class="impact-count">${items.length} affected across ${groups.size} tables</span>
                </div>
                <div class="transitive-groups">
        `;

        for (const group of sortedGroups) {
            const severityIcon = group.maxSeverity === 'high' || group.maxSeverity === 'critical'
                ? `<span class="severity-icon">${ICONS.warning}</span>`
                : `<span class="severity-icon">${group.maxSeverity === 'medium' ? '●' : '○'}</span>`;
            const columnNames = group.items.map(i => i.node.name).join(', ');
            const truncatedNames = columnNames.length > 60 ? columnNames.substring(0, 60) + '...' : columnNames;

            html += `
                <div class="transitive-group severity-${group.maxSeverity}">
                    <button class="transitive-group-header" type="button" aria-expanded="false">
                        <span class="group-expand-icon">▶</span>
                        <span class="group-table-name">${this.escapeHtml(group.tableName)}</span>
                        <span class="group-path">${this.escapeHtml(targetName)} → ${this.escapeHtml(group.tableName)}</span>
                        <span class="group-count">${group.items.length} column${group.items.length !== 1 ? 's' : ''}</span>
                        <span class="group-severity">${severityIcon} ${group.maxSeverity}</span>
                    </button>
                    <div class="transitive-group-preview">${this.escapeHtml(truncatedNames)}</div>
                    <div class="transitive-group-content" style="display: none;">
                        <div class="column-list">
            `;

            for (const item of group.items) {
                const fileName = item.filePath && item.filePath !== 'Unknown'
                    ? item.filePath.split('/').pop() || item.filePath
                    : '';
                const location = item.lineNumber > 0 ? `${fileName} • Line ${item.lineNumber}` : fileName;

                // Show the data flow path if available (e.g., "departments.id → department_id")
                const hasFlowPath = item.reason && item.reason.includes('→');
                const displayName = hasFlowPath ? item.reason : item.node.name;

                html += `
                            <div class="column-item">
                                <span class="column-name">${this.escapeHtml(displayName)}</span>
                                ${location ? `<span class="column-location"><span class="file-icon">${ICONS.document}</span>${this.escapeHtml(location)}</span>` : ''}
                            </div>
                `;
            }

            html += `
                        </div>
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
                    <button onclick="exportImpactReport('markdown')">Markdown</button>
                    <button onclick="exportImpactReport('json')">JSON</button>
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
                <h3>Suggestions</h3>
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
