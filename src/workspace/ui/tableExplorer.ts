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

        let html = `
            <div class="table-list-view">
                <div class="table-list-header">
                    <h3>Workspace Tables (${tables.length})</h3>
                    <p class="hint">Click a table to explore its structure and dependencies</p>
                </div>
                <div class="table-list-grid">
        `;

        for (const table of tables) {
            const typeIcon = this.getTypeIcon(table.type);
            const fileName = table.filePath ? table.filePath.split('/').pop() || '' : '';

            html += `
                <div class="table-list-item" data-action="explore-table" data-node-id="${this.escapeHtml(table.id)}" data-table="${this.escapeHtml(table.name)}">
                    <div class="table-list-icon">${typeIcon}</div>
                    <div class="table-list-info">
                        <span class="table-list-name">${this.escapeHtml(table.name)}</span>
                        <span class="table-list-meta">
                            <span class="table-list-type">${table.type}</span>
                            ${fileName ? `<span class="table-list-file">${this.escapeHtml(fileName)}</span>` : ''}
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

        // Add upstream panel
        const flowAnalyzer = new FlowAnalyzer(graph);
        const upstream = flowAnalyzer.getUpstream(table.id, { maxDepth: 2 });

        if (upstream.nodes.length > 0) {
            html += this.generateFlowPanel('upstream', upstream);
        }

        // Add downstream panel
        const downstream = flowAnalyzer.getDownstream(table.id, { maxDepth: 2 });

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
     * Generate upstream/downstream panels
     */
    generateFlowPanels(table: LineageNode, flowAnalyzer: FlowAnalyzer): string {
        let html = '<div class="flow-panels">';

        const upstream = flowAnalyzer.getUpstream(table.id, { maxDepth: 2 });
        if (upstream.nodes.length > 0) {
            html += this.generateFlowPanel('upstream', upstream);
        }

        const downstream = flowAnalyzer.getDownstream(table.id, { maxDepth: 2 });
        if (downstream.nodes.length > 0) {
            html += this.generateFlowPanel('downstream', downstream);
        }

        html += '</div>';
        return html;
    }

    /**
     * Generate a single flow panel
     */
    private generateFlowPanel(direction: 'upstream' | 'downstream', flow: any): string {
        const title = direction === 'upstream' ? 'Data Sources' : 'Data Consumers';
        const icon = direction === 'upstream' ? '⬆️' : '⬇️';

        let html = `
            <div class="flow-panel flow-${direction}">
                <h3>${icon} ${title} (${flow.nodes.length})</h3>
                <div class="flow-list">
        `;

        for (const node of flow.nodes) {
            html += `
                <div class="flow-item">
                    <span class="flow-node-type">${node.type}</span>
                    <span class="flow-node-name">${this.escapeHtml(node.name)}</span>
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
