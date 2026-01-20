// Lineage View - Visual lineage graph with search and interactive exploration

import { LineagePath, LineageGraph, LineageNode } from '../lineage/types';
import { FlowResult, FlowAnalyzer } from '../lineage/flowAnalyzer';
import { LineageViewOptions } from './types';
import { LineageGraphRenderer, RenderableGraph, GraphNode } from './lineageGraphRenderer';

/**
 * Recent selection for history tracking
 */
interface RecentSelection {
    nodeId: string;
    name: string;
    type: string;
    timestamp: number;
}

/**
 * Generates HTML for lineage visualization
 */
export class LineageView {
    private recentSelections: RecentSelection[] = [];
    private maxRecentItems = 5;

    /**
     * Generate the main lineage view with search interface and graph container
     * This is the new default view that replaces the overview
     */
    generateLineageSearchView(
        graph: LineageGraph,
        options: {
            selectedNodeId?: string;
            recentSelections?: RecentSelection[];
            fileFilter?: string[];
        } = {}
    ): string {
        const { selectedNodeId, recentSelections = [], fileFilter = [] } = options;

        // Get all searchable nodes
        const renderer = new LineageGraphRenderer(graph);
        const searchableNodes = renderer.getSearchableNodes();
        const filePaths = renderer.getFilePaths();

        // Stats
        const stats = this.collectStats(graph);

        if (searchableNodes.length === 0) {
            return this.generateEmptyState();
        }

        let html = `
            <div class="lineage-visual-container">
                <!-- Search Panel -->
                <div class="lineage-search-panel">
                    <div class="search-header">
                        <h3>Explore Data Lineage</h3>
                        <p class="search-hint">Search for a table or view to visualize its data flow</p>
                    </div>

                    <div class="search-form">
                        <div class="search-input-wrapper">
                            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                            </svg>
                            <input type="text"
                                   id="lineage-search-input"
                                   class="lineage-search-input"
                                   placeholder="Search tables, views, CTEs..."
                                   autocomplete="off"
                                   value="">
                            <button class="search-clear-btn" id="lineage-search-clear" style="display: none;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 6L6 18M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                        <div class="search-results" id="lineage-search-results" style="display: none;"></div>
                    </div>

                    <!-- Quick Filters -->
                    <div class="quick-filters">
                        <span class="filter-label">Quick filter:</span>
                        <button class="filter-chip active" data-filter="all">All</button>
                        <button class="filter-chip" data-filter="table">Tables</button>
                        <button class="filter-chip" data-filter="view">Views</button>
                        <button class="filter-chip" data-filter="cte">CTEs</button>
                    </div>

                    <!-- File Filter -->
                    <div class="file-filter-section">
                        <label class="filter-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            Filter by file:
                        </label>
                        <select id="lineage-file-filter" class="file-filter-select" multiple>
                            ${filePaths.map(fp => `
                                <option value="${this.escapeHtml(fp)}" ${fileFilter.includes(fp) ? 'selected' : ''}>
                                    ${this.escapeHtml(fp.split('/').pop() || fp)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <!-- Recent Selections / Quick Access -->
                ${recentSelections.length > 0 ? `
                <div class="recent-selections">
                    <h4>Recent</h4>
                    <div class="recent-list">
                        ${recentSelections.slice(0, this.maxRecentItems).map(item => `
                            <button class="recent-item"
                                    data-action="select-node"
                                    data-node-id="${this.escapeHtml(item.nodeId)}"
                                    data-node-name="${this.escapeHtml(item.name)}">
                                <span class="recent-icon">${this.getNodeIcon(item.type)}</span>
                                <span class="recent-name">${this.escapeHtml(item.name)}</span>
                                <span class="recent-type">${item.type}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Popular Tables Section (tables with most connections) -->
                <div class="popular-tables">
                    <h4>Most Connected</h4>
                    <div class="popular-list">
                        ${this.generatePopularNodes(graph, 6)}
                    </div>
                </div>

                <!-- Stats Summary -->
                <div class="lineage-stats-summary">
                    <div class="stat-chip">
                        <span class="stat-icon">📊</span>
                        <span class="stat-count">${stats.tables}</span>
                        <span class="stat-label">Tables</span>
                    </div>
                    <div class="stat-chip">
                        <span class="stat-icon">👁️</span>
                        <span class="stat-count">${stats.views}</span>
                        <span class="stat-label">Views</span>
                    </div>
                    <div class="stat-chip">
                        <span class="stat-icon">🔄</span>
                        <span class="stat-count">${stats.ctes}</span>
                        <span class="stat-label">CTEs</span>
                    </div>
                    <div class="stat-chip">
                        <span class="stat-icon">🔗</span>
                        <span class="stat-count">${stats.relationships}</span>
                        <span class="stat-label">Relationships</span>
                    </div>
                </div>

                <!-- Hidden data for JS -->
                <script type="application/json" id="lineage-searchable-nodes">
                    ${JSON.stringify(searchableNodes)}
                </script>
            </div>
        `;

        return html;
    }

    /**
     * Generate the graph view for a selected node
     */
    generateLineageGraphView(
        graph: LineageGraph,
        centerNodeId: string,
        options: {
            depth?: number;
            direction?: 'both' | 'upstream' | 'downstream';
            expandedNodes?: Set<string>;
            fileFilter?: string[];
            focusedNodeId?: string;
        } = {}
    ): string {
        const {
            depth = 5,
            direction = 'both',
            expandedNodes = new Set(),
            fileFilter = [],
            focusedNodeId
        } = options;

        const renderer = new LineageGraphRenderer(graph);
        const renderableGraph = renderer.buildGraph({
            centerNodeId,
            depth,
            direction,
            fileFilter: fileFilter.length > 0 ? fileFilter : undefined,
            expandedNodes,
            includeExternal: true
        });

        // Get center node name for display
        const centerNode = graph.nodes.get(centerNodeId);
        const centerName = centerNode?.name || centerNodeId;

        // Check for empty results based on direction
        if (renderableGraph.nodes.length === 0 ||
            (renderableGraph.nodes.length === 1 && renderableGraph.nodes[0].id === centerNodeId)) {
            return this.generateNoRelationshipsView(centerName, direction, centerNodeId, centerNode?.type || 'table');
        }

        // Generate SVG
        const svg = renderer.generateSVG(renderableGraph, { focusedNodeId });

        return `
            <div class="lineage-graph-view">
                <!-- Graph Header with controls -->
                <div class="graph-header">
                    <div class="graph-title">
                        <span class="graph-icon">${this.getNodeIcon(centerNode?.type || 'table')}</span>
                        <h3>${this.escapeHtml(centerName)}</h3>
                        <span class="node-type-badge">${centerNode?.type || 'table'}</span>
                    </div>
                    <div class="graph-stats">
                        <span class="stat upstream" title="Upstream tables">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M12 19V5M5 12l7-7 7 7"/>
                            </svg>
                            ${renderableGraph.stats.upstreamCount} upstream
                        </span>
                        <span class="stat downstream" title="Downstream tables">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M12 5v14M5 12l7 7 7-7"/>
                            </svg>
                            ${renderableGraph.stats.downstreamCount} downstream
                        </span>
                    </div>
                </div>

                <!-- Direction Toggle -->
                <div class="direction-controls">
                    <button class="direction-btn ${direction === 'upstream' ? 'active' : ''}"
                            data-direction="upstream"
                            data-node-id="${this.escapeHtml(centerNodeId)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M12 19V5M5 12l7-7 7 7"/>
                        </svg>
                        Upstream Only
                    </button>
                    <button class="direction-btn ${direction === 'both' ? 'active' : ''}"
                            data-direction="both"
                            data-node-id="${this.escapeHtml(centerNodeId)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M7 17l5 5 5-5M7 7l5-5 5 5"/>
                        </svg>
                        Both
                    </button>
                    <button class="direction-btn ${direction === 'downstream' ? 'active' : ''}"
                            data-direction="downstream"
                            data-node-id="${this.escapeHtml(centerNodeId)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M12 5v14M5 12l7 7 7-7"/>
                        </svg>
                        Downstream Only
                    </button>
                </div>

                <!-- Graph Container with SVG -->
                <div class="lineage-graph-container" id="lineage-graph-container">
                    ${svg}
                </div>

                <!-- Zoom Controls -->
                <div class="lineage-zoom-controls">
                    <button class="zoom-btn" id="lineage-zoom-out" title="Zoom out">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                    </button>
                    <span class="zoom-level" id="lineage-zoom-level">100%</span>
                    <button class="zoom-btn" id="lineage-zoom-in" title="Zoom in">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                    </button>
                    <div class="zoom-divider"></div>
                    <button class="zoom-btn" id="lineage-zoom-fit" title="Fit to screen">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                        </svg>
                    </button>
                    <button class="zoom-btn" id="lineage-zoom-reset" title="Reset view">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                        </svg>
                    </button>
                </div>

                <!-- Node Tooltip -->
                <div class="lineage-tooltip" id="lineage-tooltip" style="display: none;">
                    <div class="tooltip-header">
                        <span class="tooltip-icon"></span>
                        <span class="tooltip-name"></span>
                    </div>
                    <div class="tooltip-divider"></div>
                    <div class="tooltip-content">
                        <div class="tooltip-row"><span class="label">Type:</span><span class="value type-value"></span></div>
                        <div class="tooltip-row"><span class="label">File:</span><span class="value file-value"></span></div>
                        <div class="tooltip-row"><span class="label">Line:</span><span class="value line-value"></span></div>
                        <div class="tooltip-row"><span class="label">Columns:</span><span class="value columns-value"></span></div>
                        <div class="tooltip-row"><span class="label">Upstream:</span><span class="value upstream-value"></span></div>
                        <div class="tooltip-row"><span class="label">Downstream:</span><span class="value downstream-value"></span></div>
                    </div>
                    <div class="tooltip-divider"></div>
                    <div class="tooltip-hint">Click to focus \u00B7 Double-click to open file</div>
                </div>

                <!-- Context Menu -->
                <div class="lineage-context-menu" id="lineage-context-menu" style="display: none;">
                    <div class="context-item" data-action="open-file">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        Open file
                    </div>
                    <div class="context-item" data-action="focus-upstream">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M12 19V5M5 12l7-7 7 7"/>
                        </svg>
                        Show upstream only
                    </div>
                    <div class="context-item" data-action="focus-downstream">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M12 5v14M5 12l7 7 7-7"/>
                        </svg>
                        Show downstream only
                    </div>
                    <div class="context-divider"></div>
                    <div class="context-item" data-action="expand-columns">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <path d="M3 9h18M9 3v18"/>
                        </svg>
                        Expand columns
                    </div>
                    <div class="context-item" data-action="copy-name">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy table name
                    </div>
                </div>

                <!-- Hidden data for JS -->
                <script type="application/json" id="lineage-graph-data">
                    ${JSON.stringify({
                        centerNodeId,
                        direction,
                        depth,
                        nodeCount: renderableGraph.nodes.length,
                        edgeCount: renderableGraph.edges.length,
                        width: renderableGraph.width,
                        height: renderableGraph.height
                    })}
                </script>
            </div>
        `;
    }

    /**
     * Generate popular/most connected nodes
     */
    private generatePopularNodes(graph: LineageGraph, limit: number): string {
        const flowAnalyzer = new FlowAnalyzer(graph);
        const nodeConnections: { node: LineageNode; upstreamCount: number; downstreamCount: number; total: number }[] = [];

        graph.nodes.forEach((node) => {
            if (node.type === 'table' || node.type === 'view' || node.type === 'cte') {
                const upstream = flowAnalyzer.getUpstream(node.id, { maxDepth: 10, excludeExternal: true });
                const downstream = flowAnalyzer.getDownstream(node.id, { maxDepth: 10, excludeExternal: true });
                const upstreamCount = upstream.nodes.length;
                const downstreamCount = downstream.nodes.length;
                const total = upstreamCount + downstreamCount;
                if (total > 0) {
                    nodeConnections.push({ node, upstreamCount, downstreamCount, total });
                }
            }
        });

        // Sort by total connections descending
        nodeConnections.sort((a, b) => b.total - a.total);

        if (nodeConnections.length === 0) {
            return '<p class="no-popular">No connected tables found</p>';
        }

        return nodeConnections.slice(0, limit).map(({ node, upstreamCount, downstreamCount }) => `
            <button class="popular-item"
                    data-action="select-node"
                    data-node-id="${this.escapeHtml(node.id)}"
                    data-node-name="${this.escapeHtml(node.name)}"
                    data-node-type="${node.type}">
                <span class="popular-icon">${this.getNodeIcon(node.type)}</span>
                <span class="popular-name">${this.escapeHtml(node.name)}</span>
                <span class="popular-type-badge">${node.type}</span>
                <span class="popular-connections" title="${upstreamCount} upstream, ${downstreamCount} downstream">
                    <span class="conn-up">\u2191${upstreamCount}</span>
                    <span class="conn-down">\u2193${downstreamCount}</span>
                </span>
            </button>
        `).join('');
    }

    /**
     * Generate empty state when no lineage data exists
     */
    private generateEmptyState(): string {
        return `
            <div class="lineage-empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
                    <path d="M3 12h4l3 9 4-18 3 9h4"/>
                </svg>
                <h3>No Lineage Data</h3>
                <p>No lineage data found in workspace.</p>
                <p class="hint">Open SQL files to analyze data dependencies and build the lineage graph.</p>
            </div>
        `;
    }

    /**
     * Generate view when a table has no relationships
     */
    private generateNoRelationshipsView(
        nodeName: string,
        direction: 'both' | 'upstream' | 'downstream' = 'both',
        nodeId?: string,
        nodeType: string = 'table'
    ): string {
        let message: string;
        let hint: string;
        let showDirectionButtons = false;

        if (direction === 'upstream') {
            message = `No upstream dependencies found for <strong>${this.escapeHtml(nodeName)}</strong>.`;
            hint = 'This appears to be a source table with no incoming data flows.';
            showDirectionButtons = true;
        } else if (direction === 'downstream') {
            message = `No downstream consumers found for <strong>${this.escapeHtml(nodeName)}</strong>.`;
            hint = 'No other tables or views reference this table.';
            showDirectionButtons = true;
        } else {
            message = `<strong>${this.escapeHtml(nodeName)}</strong> has no upstream or downstream relationships.`;
            hint = 'It may be an isolated table or its relationships haven\'t been detected yet.';
        }

        return `
            <div class="lineage-no-relations">
                <div class="single-node">
                    <span class="node-icon">${this.getNodeIcon(nodeType)}</span>
                    <span class="node-name">${this.escapeHtml(nodeName)}</span>
                    <span class="node-type-badge">${nodeType}</span>
                </div>
                <p class="no-relations-msg">${message}</p>
                <p class="hint">${hint}</p>
                ${showDirectionButtons && nodeId ? `
                <div class="direction-suggestion">
                    <p>Try viewing:</p>
                    <div class="suggestion-buttons">
                        ${direction !== 'both' ? `
                        <button class="direction-btn" data-direction="both" data-node-id="${this.escapeHtml(nodeId)}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M7 17l5 5 5-5M7 7l5-5 5 5"/>
                            </svg>
                            Both Directions
                        </button>
                        ` : ''}
                        ${direction !== 'downstream' ? `
                        <button class="direction-btn" data-direction="downstream" data-node-id="${this.escapeHtml(nodeId)}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M12 5v14M5 12l7 7 7-7"/>
                            </svg>
                            Downstream Only
                        </button>
                        ` : ''}
                        ${direction !== 'upstream' ? `
                        <button class="direction-btn" data-direction="upstream" data-node-id="${this.escapeHtml(nodeId)}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M12 19V5M5 12l7-7 7 7"/>
                            </svg>
                            Upstream Only
                        </button>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Collect statistics from graph
     */
    private collectStats(graph: LineageGraph): { tables: number; views: number; ctes: number; external: number; relationships: number } {
        const stats = {
            tables: 0,
            views: 0,
            ctes: 0,
            external: 0,
            relationships: graph.edges.length
        };

        graph.nodes.forEach((node) => {
            if (node.type === 'table') stats.tables++;
            else if (node.type === 'view') stats.views++;
            else if (node.type === 'cte') stats.ctes++;
            else if (node.type === 'external') stats.external++;
        });

        return stats;
    }

    // ==================== Legacy Methods (kept for backward compatibility) ====================

    /**
     * Generate an overview of all lineage relationships in the workspace
     * @deprecated Use generateLineageSearchView instead
     */
    generateLineageOverview(graph: LineageGraph): string {
        // Delegate to new search view for better UX
        return this.generateLineageSearchView(graph);
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
                html += `<div class="path-arrow">\u2192</div>`;
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
                    <h3>\u2B06\uFE0F Upstream (Sources)</h3>
            `;

            for (const path of columnLineage.upstream) {
                html += this.generateLineageView(path, { showColumns: false, showTransformations: true, highlightPath: [], direction: 'horizontal' });
            }

            html += `</div>`;
        }

        if (columnLineage.downstream.length > 0) {
            html += `
                <div class="lineage-section">
                    <h3>\u2B07\uFE0F Downstream (Consumers)</h3>
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
            'table': '\uD83D\uDCCA',   // 📊
            'view': '\uD83D\uDC41\uFE0F',    // 👁️
            'column': '\uD83D\uDCDD',  // 📝
            'cte': '\uD83D\uDD04',     // 🔄
            'external': '\uD83C\uDF10' // 🌐
        };

        return icons[type] || '\uD83D\uDCE6'; // 📦
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
