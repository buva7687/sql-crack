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
