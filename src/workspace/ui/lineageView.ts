// Lineage View - Visualize data lineage

import { LineagePath } from '../lineage/types';
import { FlowResult } from '../lineage/flowAnalyzer';
import { LineageViewOptions } from './types';

/**
 * Generates HTML for lineage visualization
 */
export class LineageView {
    /**
     * Generate lineage view HTML
     */
    generateLineageView(
        path: LineagePath,
        options: Partial<LineageViewOptions> = {}
    ): string {
        const {
            showColumns = false,
            showTransformations = true,
            direction = 'horizontal'
        } = options;

        let html = `
            <div class="lineage-view lineage-${direction}">
                <div class="lineage-path">
                    <h3>Data Flow Path (${path.depth} levels)</h3>
                    <div class="path-nodes">
        `;

        for (let i = 0; i < path.nodes.length; i++) {
            const node = path.nodes[i];
            const isLast = i === path.nodes.length - 1;

            html += `
                <div class="path-node ${node.type}">
                    <div class="node-icon">${this.getNodeIcon(node.type)}</div>
                    <div class="node-info">
                        <strong>${this.escapeHtml(node.name)}</strong>
                        <span class="node-type">${node.type}</span>
                    </div>
                    ${showColumns && node.columnInfo ? this.generateColumnPreview([node.columnInfo]) : ''}
                </div>
            `;

            if (!isLast) {
                html += `<div class="path-arrow">→</div>`;
            }
        }

        html += `
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Generate column lineage visualization
     */
    generateColumnLineageView(
        columnLineage: { upstream: LineagePath[]; downstream: LineagePath[] }
    ): string {
        let html = `
            <div class="column-lineage">
        `;

        if (columnLineage.upstream.length > 0) {
            html += `
                <div class="lineage-section">
                    <h3>⬆️ Upstream (Sources)</h3>
            `;

            for (const path of columnLineage.upstream) {
                html += this.generateLineageView(path, { showColumns: false, showTransformations: true, highlightPath: [], direction: 'horizontal' });
            }

            html += `</div>`;
        }

        if (columnLineage.downstream.length > 0) {
            html += `
                <div class="lineage-section">
                    <h3>⬇️ Downstream (Consumers)</h3>
            `;

            for (const path of columnLineage.downstream) {
                html += this.generateLineageView(path, { showColumns: false, showTransformations: true, highlightPath: [], direction: 'horizontal' });
            }

            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }

    /**
     * Generate flow diagram HTML
     */
    generateFlowDiagram(flow: FlowResult): string {
        let html = `
            <div class="flow-diagram">
                <h3>Data Flow (${flow.nodes.length} nodes)</h3>
                <div class="flow-summary">
                    <span>Depth: ${flow.depth}</span>
                    <span>Paths: ${flow.paths.length}</span>
                </div>
                <div class="flow-nodes">
        `;

        for (const node of flow.nodes) {
            html += `
                <div class="flow-node ${node.type}">
                    ${this.getNodeIcon(node.type)}
                    <span>${this.escapeHtml(node.name)}</span>
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
     * Generate column preview
     */
    private generateColumnPreview(columns: any[]): string {
        const preview = columns.slice(0, 3).map(c => c.name).join(', ');
        const more = columns.length > 3 ? ` +${columns.length - 3}` : '';

        return `<div class="column-preview">${this.escapeHtml(preview)}${more}</div>`;
    }

    /**
     * Get icon for node type
     */
    private getNodeIcon(type: string): string {
        const icons: Record<string, string> = {
            'table': '📊',
            'view': '👁️',
            'column': '📝',
            'cte': '🔄',
            'external': '🌐'
        };

        return icons[type] || '📦';
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
