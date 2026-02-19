// Lineage View - Visual lineage graph with search and interactive exploration

import { LineagePath, LineageGraph, LineageNode } from '../lineage/types';
import { FlowResult, FlowAnalyzer } from '../lineage/flowAnalyzer';
import { LineageViewOptions } from './types';
import { LineageGraphRenderer } from './lineageGraphRenderer';
import { ICONS, getWorkspaceNodeIcon } from '../../shared';

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
            depth?: number;
        } = {}
    ): string {
        const { selectedNodeId, recentSelections = [], depth = 5 } = options;

        // Get all searchable nodes
        const renderer = new LineageGraphRenderer(graph);
        const searchableNodes = renderer.getSearchableNodes();

        // Stats
        const stats = this.collectStats(graph);
        const totalNodeCount = searchableNodes.length;

        if (searchableNodes.length === 0) {
            return this.generateEmptyState();
        }

        let html = `
            <div class="view-container view-lineage">
                <div class="view-compact-header">
                    <span class="view-icon">${ICONS.columns}</span>
                    <h3>Lineage</h3>
                    <span class="view-inline-stats">${stats.tables} tables, ${stats.views} views</span>
                </div>
                <div class="view-search-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input type="text"
                           id="lineage-search-input"
                           class="view-search-input"
                           placeholder="Search tables and views..."
                           autocomplete="off"
                           value="">
                    <button class="view-search-clear" id="lineage-search-clear">
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
                    <div class="view-sort-group">
                        <label class="view-filter-label" for="lineage-sort">Sort:</label>
                        <select id="lineage-sort" class="view-filter-select">
                            <option value="connected">Most Connected</option>
                            <option value="name-asc">Name (A-Z)</option>
                            <option value="name-desc">Name (Z-A)</option>
                            <option value="type">Type</option>
                        </select>
                    </div>
                    <div class="view-results-info" id="lineage-results-info" style="display: none;">
                        <span id="lineage-results-count">0</span> results
                    </div>
                </div>

                <!-- Content -->
                <div class="view-content">
                    <div class="lineage-tables-section">
                        <div class="lineage-popular-section" id="lineage-popular-section">
                            <div class="lineage-popular-header">
                                <h4>Most Connected</h4>
                                <button class="lineage-show-all-btn" id="lineage-show-all-btn" type="button">
                                    Show all ${totalNodeCount} tables
                                </button>
                            </div>
                            <div class="lineage-popular-grid" id="lineage-popular-grid">
                                ${this.generatePopularNodes(graph, 6, depth)}
                            </div>
                        </div>
                        <div class="lineage-tables-grid" id="lineage-tables-grid" style="display: none;">
                            ${this.generateAllNodes(graph, depth)}
                        </div>
                        <div class="lineage-empty-filter" id="lineage-empty-filter" style="display: none;">
                            <p>No matching tables found</p>
                        </div>
                    </div>
                </div>
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
            focusedNodeId?: string;
        } = {}
    ): string {
        const {
            depth = 5,
            direction = 'both',
            expandedNodes = new Set(),
            focusedNodeId
        } = options;

        const renderer = new LineageGraphRenderer(graph);
        const renderableGraph = renderer.buildGraph({
            centerNodeId,
            depth,
            direction,
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
        if (renderableGraph.edges.length === 0) {
            return this.generateNoRelationshipsView(centerName, direction, centerNodeId, centerNode?.type || 'table');
        }

        const minimapWidth = Math.min(Math.max(renderableGraph.width, 1), 20000);
        const minimapHeight = Math.min(Math.max(renderableGraph.height, 1), 20000);

        // Generate SVG
        const svg = renderer.generateSVG(renderableGraph, { focusedNodeId });

        // Build external count parentheticals
        const { upstreamCount, downstreamCount, externalUpstreamCount, externalDownstreamCount } = renderableGraph.stats;
        const upstreamLabel = externalUpstreamCount > 0
            ? `${upstreamCount} upstream (${externalUpstreamCount} external)`
            : `${upstreamCount} upstream`;
        const downstreamLabel = externalDownstreamCount > 0
            ? `${downstreamCount} downstream (${externalDownstreamCount} external)`
            : `${downstreamCount} downstream`;

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
                        <span class="stat upstream" title="Upstream dependencies">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M12 19V5M5 12l7-7 7 7"/>
                            </svg>
                            ${upstreamLabel}
                        </span>
                        <span class="stat-divider">|</span>
                        <span class="stat downstream" title="Downstream consumers">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M12 5v14M5 12l7 7 7-7"/>
                            </svg>
                            ${downstreamLabel}
                        </span>
                    </div>
                    <div class="direction-controls">
                        <button class="direction-btn ${direction === 'upstream' ? 'active' : ''}"
                                data-direction="upstream"
                                data-node-id="${this.escapeHtml(centerNodeId)}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M12 19V5M5 12l7-7 7 7"/>
                            </svg>
                            Upstream
                        </button>
                        <button class="direction-btn ${direction === 'both' ? 'active' : ''}"
                                data-direction="both"
                                data-node-id="${this.escapeHtml(centerNodeId)}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M7 17l5 5 5-5M7 7l5-5 5 5"/>
                            </svg>
                            Both
                        </button>
                        <button class="direction-btn ${direction === 'downstream' ? 'active' : ''}"
                                data-direction="downstream"
                                data-node-id="${this.escapeHtml(centerNodeId)}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M12 5v14M5 12l7 7 7-7"/>
                            </svg>
                            Downstream
                        </button>
                    </div>
                    <div class="cross-link-actions">
                        <button type="button"
                                class="cross-link-btn icon-only"
                                title="View Details"
                                data-action="cross-view-detail"
                                data-table="${this.escapeHtml(centerName)}"
                                data-node-id="${this.escapeHtml(centerNodeId)}"
                                data-node-type="${centerNode?.type || 'table'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
                            </svg>
                            <span>View Details</span>
                        </button>
                        <button type="button"
                                class="cross-link-btn icon-only"
                                title="Analyze Impact"
                                data-action="cross-view-impact"
                                data-table="${this.escapeHtml(centerName)}"
                                data-node-id="${this.escapeHtml(centerNodeId)}"
                                data-node-type="${centerNode?.type || 'table'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                            </svg>
                            <span>Analyze Impact</span>
                        </button>
                    </div>
                </div>

                <!-- Graph Container with SVG and overlays -->
                <div class="lineage-graph-container" id="lineage-graph-container">
                    ${svg}

                    <!-- Zoom Controls -->
                    <div class="lineage-zoom-controls" role="toolbar" aria-label="Lineage graph zoom controls">
                        <button class="zoom-btn" id="lineage-zoom-out" title="Zoom out" aria-label="Zoom out">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                        </button>
                        <span class="zoom-level" id="lineage-zoom-level" aria-live="polite">100%</span>
                        <button class="zoom-btn" id="lineage-zoom-in" title="Zoom in" aria-label="Zoom in">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                        </button>
                        <div class="zoom-divider"></div>
                        <button class="zoom-btn" id="lineage-zoom-fit" title="Fit to screen" aria-label="Fit graph to screen">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Bottom Legend Bar -->
                    <div class="lineage-legend" id="lineage-legend" role="complementary" aria-label="Lineage legend" aria-hidden="false">
                        <div class="legend-strip" id="lineage-legend-content">
                            <div class="legend-inline-group">
                                <span class="legend-section-title">Nodes</span>
                                <span class="legend-item"><span class="legend-color legend-table"></span><span class="legend-label">Table</span></span>
                                <span class="legend-item"><span class="legend-color legend-view"></span><span class="legend-label">View</span></span>
                                <span class="legend-item"><span class="legend-color legend-external"></span><span class="legend-label">External</span></span>
                            </div>
                            <div class="legend-divider"></div>
                            <div class="legend-inline-group">
                                <span class="legend-section-title">Columns</span>
                                <span class="legend-item"><span class="legend-dot legend-primary"></span><span class="legend-label">Primary Key</span></span>
                                <span class="legend-item"><span class="legend-dot legend-numeric"></span><span class="legend-label">Numeric</span></span>
                                <span class="legend-item"><span class="legend-dot legend-text"></span><span class="legend-label">Text</span></span>
                                <span class="legend-item"><span class="legend-dot legend-datetime"></span><span class="legend-label">Date/Time</span></span>
                                <span class="legend-item"><span class="legend-dot legend-json"></span><span class="legend-label">JSON</span></span>
                            </div>
                            <div class="legend-divider"></div>
                            <div class="legend-inline-group legend-keyboard-hints" id="lineage-keyboard-hints">
                                <span class="hint-item"><kbd>C</kbd><span>Columns</span></span>
                                <span class="hint-divider"></span>
                                <span class="hint-item"><kbd>L</kbd><span>Legend</span></span>
                                <span class="hint-divider"></span>
                                <span class="hint-item"><kbd>↑↓</kbd><span>Columns</span></span>
                                <span class="hint-divider"></span>
                                <span class="hint-item"><kbd>↵</kbd><span>Trace</span></span>
                                <span class="hint-divider"></span>
                                <span class="hint-item"><kbd>Scroll</kbd><span>Zoom</span></span>
                            </div>
                        </div>
                        <button class="legend-dismiss" id="legend-dismiss" title="Dismiss legend (L)" aria-label="Dismiss legend strip">×</button>
                    </div>

                    <!-- Mini-map -->
                    <div class="lineage-minimap" id="lineage-minimap">
                        <div class="minimap-header">
                            <span>Overview</span>
                        </div>
                        <div class="minimap-content" id="minimap-content">
                            <svg class="minimap-svg" id="minimap-svg" viewBox="0 0 ${minimapWidth} ${minimapHeight}">
                                <g class="minimap-nodes">
                                    ${renderableGraph.nodes.map(node => `
                                        <rect class="minimap-node minimap-node-${node.type}"
                                              x="${node.x}" y="${node.y}"
                                              width="${node.width}" height="${node.height}"
                                              rx="4"/>
                                    `).join('')}
                                </g>
                                <rect class="minimap-viewport" id="minimap-viewport"
                                      x="0" y="0" width="100" height="100"
                                      fill="rgba(99, 102, 241, 0.2)" stroke="var(--accent)" stroke-width="2"/>
                            </svg>
                        </div>
                    </div>
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
                        width: minimapWidth,
                        height: minimapHeight
                    })}
                </script>
            </div>
        `;
    }

    /**
     * Generate all nodes as filterable grid items
     */
    private generateAllNodes(graph: LineageGraph, depth: number = 5): string {
        const flowAnalyzer = new FlowAnalyzer(graph);
        const nodeConnections: { node: LineageNode; upstreamCount: number; downstreamCount: number; total: number }[] = [];

        graph.nodes.forEach((node) => {
            if (node.type === 'table' || node.type === 'view') {
                const upstream = flowAnalyzer.getUpstream(node.id, { maxDepth: depth, excludeExternal: true });
                const downstream = flowAnalyzer.getDownstream(node.id, { maxDepth: depth, excludeExternal: true });
                // Count only tables and views (exclude external, CTE, and column nodes)
                const isDisplayableNode = (n: LineageNode) => n.type === 'table' || n.type === 'view';
                const upstreamCount = upstream.nodes.filter(isDisplayableNode).length;
                const downstreamCount = downstream.nodes.filter(isDisplayableNode).length;
                const total = upstreamCount + downstreamCount;
                nodeConnections.push({ node, upstreamCount, downstreamCount, total });
            }
        });

        // Sort by total connections descending (most connected first)
        nodeConnections.sort((a, b) => b.total - a.total);

        if (nodeConnections.length === 0) {
            return '<p class="no-tables">No tables or views found</p>';
        }

        return nodeConnections.map(({ node, upstreamCount, downstreamCount, total }) => `
            <button class="lineage-table-item connection-${this.getConnectionStrength(total)}"
                    data-action="select-node"
                    data-node-id="${this.escapeHtml(node.id)}"
                    data-name="${this.escapeHtml(node.name.toLowerCase())}"
                    data-type="${node.type}"
                    data-total="${total}">
                <span class="table-item-icon">${this.getNodeIcon(node.type)}</span>
                <span class="table-item-name">${this.escapeHtml(node.name)}</span>
                <span class="table-item-type">${node.type}</span>
                <span class="table-item-connections" title="${upstreamCount} upstream, ${downstreamCount} downstream">
                    <span class="conn-badge">↑${upstreamCount}</span>
                    <span class="conn-badge">↓${downstreamCount}</span>
                </span>
            </button>
        `).join('');
    }

    /**
     * Generate popular/most connected nodes
     */
    private generatePopularNodes(graph: LineageGraph, limit: number, depth: number = 5): string {
        const flowAnalyzer = new FlowAnalyzer(graph);
        const nodeConnections: { node: LineageNode; upstreamCount: number; downstreamCount: number; total: number }[] = [];

        graph.nodes.forEach((node) => {
            if (node.type === 'table' || node.type === 'view') {
                // Curated "Most Connected" should prioritize internal lineage density.
                // External endpoints are still visible in full-node exploration views.
                const upstream = flowAnalyzer.getUpstream(node.id, { maxDepth: depth, excludeExternal: true });
                const downstream = flowAnalyzer.getDownstream(node.id, { maxDepth: depth, excludeExternal: true });
                // Count only tables and views (exclude column nodes to match graph display)
                const isDisplayableNode = (n: LineageNode) => n.type === 'table' || n.type === 'view';
                const upstreamCount = upstream.nodes.filter(isDisplayableNode).length;
                const downstreamCount = downstream.nodes.filter(isDisplayableNode).length;
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

        return nodeConnections.slice(0, limit).map(({ node, upstreamCount, downstreamCount, total }) => `
            <button class="popular-item connection-${this.getConnectionStrength(total)}"
                    data-action="select-node"
                    data-node-id="${this.escapeHtml(node.id)}"
                    data-node-name="${this.escapeHtml(node.name)}"
                    data-node-type="${node.type}"
                    data-total="${total}">
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
                <div class="empty-illustration">
                    <svg viewBox="0 0 120 100" fill="none" width="120" height="100">
                        <!-- Node 1 -->
                        <rect x="10" y="35" width="30" height="20" rx="4" fill="var(--node-table)" opacity="0.8"/>
                        <text x="25" y="48" text-anchor="middle" fill="white" font-size="8">\uD83D\uDCCA</text>
                        <!-- Node 2 -->
                        <rect x="50" y="15" width="30" height="20" rx="4" fill="var(--node-view)" opacity="0.8"/>
                        <text x="65" y="28" text-anchor="middle" fill="white" font-size="8">\uD83D\uDC41\uFE0F</text>
                        <!-- Node 3 -->
                        <rect x="50" y="55" width="30" height="20" rx="4" fill="var(--accent)" opacity="0.8"/>
                        <text x="65" y="68" text-anchor="middle" fill="white" font-size="8">\uD83D\uDD04</text>
                        <!-- Node 4 -->
                        <rect x="90" y="35" width="30" height="20" rx="4" fill="var(--node-external)" opacity="0.6" stroke-dasharray="3,2" stroke="var(--text-dim)"/>
                        <text x="105" y="48" text-anchor="middle" fill="white" font-size="8">\uD83C\uDF10</text>
                        <!-- Connecting lines -->
                        <path d="M40 45 Q45 45 50 30" stroke="var(--text-dim)" stroke-width="1.5" fill="none" stroke-dasharray="4,2" opacity="0.5"/>
                        <path d="M40 45 Q45 45 50 65" stroke="var(--text-dim)" stroke-width="1.5" fill="none" stroke-dasharray="4,2" opacity="0.5"/>
                        <path d="M80 25 Q85 35 90 45" stroke="var(--text-dim)" stroke-width="1.5" fill="none" stroke-dasharray="4,2" opacity="0.5"/>
                        <path d="M80 65 Q85 55 90 45" stroke="var(--text-dim)" stroke-width="1.5" fill="none" stroke-dasharray="4,2" opacity="0.5"/>
                    </svg>
                </div>
                <h3>Start Exploring Data Lineage</h3>
                <p>Discover how your data flows between tables and views.</p>
                <div class="empty-steps">
                    <div class="step">
                        <span class="step-number">1</span>
                        <span class="step-text">Open SQL files in your workspace</span>
                    </div>
                    <div class="step">
                        <span class="step-number">2</span>
                        <span class="step-text">Tables and relationships are detected automatically</span>
                    </div>
                    <div class="step">
                        <span class="step-number">3</span>
                        <span class="step-text">Search for a table to visualize its lineage</span>
                    </div>
                </div>
                <p class="hint">\uD83D\uDCA1 Tip: The more SQL files you have open, the richer your lineage graph becomes!</p>
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
    private collectStats(graph: LineageGraph): { tables: number; views: number } {
        const stats = {
            tables: 0,
            views: 0
        };

        graph.nodes.forEach((node) => {
            if (node.type === 'table') {stats.tables++;}
            else if (node.type === 'view') {stats.views++;}
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
        return getWorkspaceNodeIcon(type);
    }

    private getConnectionStrength(total: number): 'none' | 'low' | 'medium' | 'high' {
        if (total <= 0) {
            return 'none';
        }
        if (total < 3) {
            return 'low';
        }
        if (total < 10) {
            return 'medium';
        }
        return 'high';
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
