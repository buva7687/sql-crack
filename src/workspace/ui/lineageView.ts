// Lineage View - Visualize data lineage

import { LineagePath, LineageGraph, LineageNode } from '../lineage/types';
import { FlowResult, FlowAnalyzer } from '../lineage/flowAnalyzer';
import { LineageViewOptions } from './types';

/**
 * Generates HTML for lineage visualization
 */
export class LineageView {
    /**
     * Generate an overview of all lineage relationships in the workspace
     */
    generateLineageOverview(graph: LineageGraph): string {
        // Collect statistics
        const stats = {
            tables: 0,
            views: 0,
            ctes: 0,
            external: 0,
            relationships: graph.edges.length
        };

        const nodes: LineageNode[] = [];
        graph.nodes.forEach((node) => {
            if (node.type === 'table') stats.tables++;
            else if (node.type === 'view') stats.views++;
            else if (node.type === 'cte') stats.ctes++;
            else if (node.type === 'external') stats.external++;

            if (node.type === 'table' || node.type === 'view' || node.type === 'cte') {
                nodes.push(node);
            }
        });

        if (nodes.length === 0) {
            return `
                <div class="lineage-overview-empty">
                    <p>No lineage data found in workspace.</p>
                    <p>Open SQL files to analyze data dependencies.</p>
                </div>
            `;
        }

        // Find root nodes (no upstream) and leaf nodes (no downstream)
        // Also store connection counts for display
        const flowAnalyzer = new FlowAnalyzer(graph);
        const rootNodes: { node: LineageNode; downstreamCount: number }[] = [];
        const leafNodes: { node: LineageNode; upstreamCount: number }[] = [];

        nodes.forEach(node => {
            const upstream = flowAnalyzer.getUpstream(node.id, { maxDepth: 10 });
            const downstream = flowAnalyzer.getDownstream(node.id, { maxDepth: 10 });

            if (upstream.nodes.length === 0) {
                rootNodes.push({ node, downstreamCount: downstream.nodes.length });
            }
            if (downstream.nodes.length === 0) {
                leafNodes.push({ node, upstreamCount: upstream.nodes.length });
            }
        });

        let html = `
            <div class="lineage-overview">
                <div class="lineage-stats">
                    <h3>Workspace Summary</h3>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-value">${stats.tables}</span>
                            <span class="stat-label">Tables</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${stats.views}</span>
                            <span class="stat-label">Views</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${stats.ctes}</span>
                            <span class="stat-label">CTEs</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${stats.relationships}</span>
                            <span class="stat-label">Relationships</span>
                        </div>
                    </div>
                </div>
        `;

        // Source tables (roots) - sorted by downstream count descending
        rootNodes.sort((a, b) => b.downstreamCount - a.downstreamCount);
        if (rootNodes.length > 0) {
            html += `
                <div class="lineage-section">
                    <h3>📥 Source Tables (${rootNodes.length})</h3>
                    <p class="section-hint">Data origins - click to see what tables use their data</p>
                    <div class="node-list">
            `;
            for (const { node, downstreamCount } of rootNodes.slice(0, 10)) {
                const countClass = downstreamCount > 0 ? 'has-connections' : 'no-connections';
                html += `
                    <div class="node-item ${countClass}" data-action="show-downstream" data-node-id="${this.escapeHtml(node.id)}" data-table="${this.escapeHtml(node.name)}">
                        <span class="node-icon">${this.getNodeIcon(node.type)}</span>
                        <span class="node-name">${this.escapeHtml(node.name)}</span>
                        <span class="node-type">${node.type}</span>
                        <span class="connection-count ${countClass}" title="${downstreamCount} downstream">↓${downstreamCount}</span>
                    </div>
                `;
            }
            if (rootNodes.length > 10) {
                html += `<div class="more-items">+${rootNodes.length - 10} more</div>`;
            }
            html += `
                    </div>
                </div>
            `;
        }

        // Output tables (leaves) - sorted by upstream count descending
        leafNodes.sort((a, b) => b.upstreamCount - a.upstreamCount);
        if (leafNodes.length > 0) {
            html += `
                <div class="lineage-section">
                    <h3>📤 Output Tables (${leafNodes.length})</h3>
                    <p class="section-hint">Data endpoints - click to see what tables feed into them</p>
                    <div class="node-list">
            `;
            for (const { node, upstreamCount } of leafNodes.slice(0, 10)) {
                const countClass = upstreamCount > 0 ? 'has-connections' : 'no-connections';
                html += `
                    <div class="node-item ${countClass}" data-action="show-upstream" data-node-id="${this.escapeHtml(node.id)}" data-table="${this.escapeHtml(node.name)}">
                        <span class="node-icon">${this.getNodeIcon(node.type)}</span>
                        <span class="node-name">${this.escapeHtml(node.name)}</span>
                        <span class="node-type">${node.type}</span>
                        <span class="connection-count ${countClass}" title="${upstreamCount} upstream">↑${upstreamCount}</span>
                    </div>
                `;
            }
            if (leafNodes.length > 10) {
                html += `<div class="more-items">+${leafNodes.length - 10} more</div>`;
            }
            html += `
                    </div>
                </div>
            `;
        }

        html += `
                <div class="lineage-tip">
                    <p><strong>Tip:</strong> Click a table above or right-click any node in the graph to explore its full lineage.</p>
                </div>
            </div>
        `;

        return html;
    }

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
