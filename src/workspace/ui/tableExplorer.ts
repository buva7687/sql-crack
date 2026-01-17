// Table Explorer - Table-centric exploration view

import { LineageGraph, LineageNode } from '../lineage/types';
import { ColumnLineageTracker } from '../lineage/columnLineage';
import { FlowAnalyzer } from '../lineage/flowAnalyzer';
import { TableExplorerData } from './types';

/**
 * Generates HTML for table-centric exploration
 */
export class TableExplorer {
    /**
     * Generate a list of all tables in the workspace
     */
    generateTableList(graph: LineageGraph): string {
        // Collect all table/view nodes
        const tables: LineageNode[] = [];
        graph.nodes.forEach((node) => {
            if (node.type === 'table' || node.type === 'view' || node.type === 'cte') {
                tables.push(node);
            }
        });

        // Sort alphabetically
        tables.sort((a, b) => a.name.localeCompare(b.name));

        if (tables.length === 0) {
            return `
                <div class="table-list-empty">
                    <p>No tables found in workspace.</p>
                    <p>Open SQL files to populate the table list.</p>
                </div>
            `;
        }

        // Count connections for each table
        const flowAnalyzer = new FlowAnalyzer(graph);
        const tablesWithCounts = tables.map(table => {
            const upstream = flowAnalyzer.getUpstream(table.id, { maxDepth: 10, excludeExternal: true });
            const downstream = flowAnalyzer.getDownstream(table.id, { maxDepth: 10, excludeExternal: true });
            return {
                table,
                upstreamCount: upstream.nodes.length,
                downstreamCount: downstream.nodes.length
            };
        });

        // Sort by total connections (most connected first)
        tablesWithCounts.sort((a, b) => {
            const totalA = a.upstreamCount + a.downstreamCount;
            const totalB = b.upstreamCount + b.downstreamCount;
            if (totalB !== totalA) return totalB - totalA;
            return a.table.name.localeCompare(b.table.name);
        });

        let html = `
            <div class="table-list-view">
                <div class="table-list-header">
                    <h3>All Tables & Views (${tables.length})</h3>
                    <p class="hint">📋 Complete catalog of tables and views defined in your workspace</p>
                    <p class="hint" style="margin-top: 4px; font-size: 11px; color: var(--text-dim);">
                        Click any table to explore its columns, data sources (upstream), and consumers (downstream)
                    </p>
                </div>
                <div class="table-list-grid">
        `;

        for (const { table, upstreamCount, downstreamCount } of tablesWithCounts) {
            const typeIcon = this.getTypeIcon(table.type);
            const fileName = table.filePath ? table.filePath.split('/').pop() || '' : '';
            const totalConnections = upstreamCount + downstreamCount;
            const hasConnections = totalConnections > 0;

            html += `
                <div class="table-list-item ${!hasConnections ? 'no-connections' : ''}" data-action="explore-table" data-node-id="${this.escapeHtml(table.id)}" data-table="${this.escapeHtml(table.name)}">
                    <div class="table-list-icon">${typeIcon}</div>
                    <div class="table-list-info">
                        <span class="table-list-name">${this.escapeHtml(table.name)}</span>
                        <span class="table-list-meta">
                            <span class="table-list-type">${table.type}</span>
                            ${fileName ? `<span class="table-list-file">${this.escapeHtml(fileName)}</span>` : ''}
                            ${upstreamCount > 0 ? `<span class="table-list-count" title="${upstreamCount} data sources">↑${upstreamCount}</span>` : ''}
                            ${downstreamCount > 0 ? `<span class="table-list-count" title="${downstreamCount} data consumers">↓${downstreamCount}</span>` : ''}
                        </span>
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
     * Get icon for node type
     */
    private getTypeIcon(type: string): string {
        const icons: Record<string, string> = {
            'table': '📊',
            'view': '👁️',
            'cte': '🔄',
            'external': '🌐'
        };
        return icons[type] || '📦';
    }

    /**
     * Generate table view HTML
     */
    generateTableView(data: TableExplorerData): string {
        const { table, graph } = data;

        let html = `
            <div class="table-explorer">
                <div class="explorer-header">
                    <h2>${this.escapeHtml(table.name)}</h2>
                    <span class="node-type">${table.type}</span>
                </div>
        `;

        // Add column list
        if (table.columnInfo) {
            html += this.generateColumnList([table.columnInfo]);
        }

        // Add upstream panel - get all nodes including external in single call
        const flowAnalyzer = new FlowAnalyzer(graph);
        const upstream = flowAnalyzer.getUpstream(table.id, { maxDepth: 10, excludeExternal: false });

        if (upstream.nodes.length > 0) {
            html += this.generateFlowPanel('upstream', upstream);
        }

        // Add downstream panel - get all nodes including external in single call
        const downstream = flowAnalyzer.getDownstream(table.id, { maxDepth: 10, excludeExternal: false });

        if (downstream.nodes.length > 0) {
            html += this.generateFlowPanel('downstream', downstream);
        }

        html += `</div>`;
        return html;
    }

    /**
     * Generate column list with lineage indicators
     */
    generateColumnList(columns: any[], lineage?: ColumnLineageTracker): string {
        let html = `
            <div class="column-list">
                <h3>Columns (${columns.length})</h3>
                <div class="columns-grid">
        `;

        for (const column of columns) {
            html += `
                <div class="column-item">
                    <span class="column-name">${this.escapeHtml(column.name)}</span>
                    <span class="column-type">${this.escapeHtml(column.dataType)}</span>
                    ${column.primaryKey ? '<span class="badge-primary">PK</span>' : ''}
                    ${column.nullable === false ? '<span class="badge-not-null">NOT NULL</span>' : ''}
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
     * Generate a single flow panel with deduplicated and organized nodes
     */
    private generateFlowPanel(direction: 'upstream' | 'downstream', flow: any): string {
        const title = direction === 'upstream' ? 'Data Sources' : 'Data Consumers';
        const icon = direction === 'upstream' ? '⬆️' : '⬇️';

        // Deduplicate nodes by ID and separate internal vs external
        const internalNodes: LineageNode[] = [];
        const externalSet = new Set<string>();
        const seenIds = new Set<string>();

        for (const node of flow.nodes) {
            if (seenIds.has(node.id)) continue;
            seenIds.add(node.id);

            if (node.type === 'external') {
                externalSet.add(node.name.toLowerCase());
            } else {
                internalNodes.push(node);
            }
        }

        // Sort internal nodes by type then name
        internalNodes.sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            return a.name.localeCompare(b.name);
        });

        const internalCount = internalNodes.length;
        const externalCount = externalSet.size;
        const totalCount = internalCount + externalCount;

        let html = `
            <div class="flow-panel flow-${direction}">
                <h3>${icon} ${title} (${totalCount})</h3>
        `;

        // Show internal tables/views first
        if (internalNodes.length > 0) {
            html += `
                <div class="flow-section">
                    <div class="flow-section-title">📊 Defined in workspace (${internalCount})</div>
                    <div class="flow-list">
            `;
            for (const node of internalNodes) {
                const typeLabel = node.type === 'table' ? 'table' : node.type === 'view' ? 'view' : node.type;
                html += `
                    <div class="flow-item flow-item-internal" data-action="explore-table" data-node-id="${this.escapeHtml(node.id)}" data-table="${this.escapeHtml(node.name)}">
                        <span class="flow-node-icon">${this.getTypeIcon(node.type)}</span>
                        <span class="flow-node-name">${this.escapeHtml(node.name)}</span>
                        <span class="flow-node-type">${typeLabel}</span>
                        ${node.filePath ? `<span class="flow-node-file" title="${this.escapeHtml(node.filePath)}">${this.escapeHtml(node.filePath.split('/').pop() || '')}</span>` : ''}
                    </div>
                `;
            }
            html += `
                    </div>
                </div>
            `;
        }

        // Show external references if any
        if (externalSet.size > 0) {
            const externalList = Array.from(externalSet).sort();
            html += `
                <div class="flow-section">
                    <div class="flow-section-title">🌐 External (not defined in workspace) (${externalSet.size})</div>
                    <div class="flow-list">
            `;
            for (const name of externalList) {
                html += `
                    <div class="flow-item flow-item-external">
                        <span class="flow-node-icon">🌐</span>
                        <span class="flow-node-name">${this.escapeHtml(name)}</span>
                        <span class="flow-node-type external">external</span>
                    </div>
                `;
            }
            html += `
                    </div>
                </div>
            `;
        }

        html += `
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
