// LineageGraphRenderer - Renders interactive lineage graph using dagre layout

import * as dagre from 'dagre';
import { LineageGraph, LineageNode } from '../lineage/types';
import { FlowAnalyzer } from '../lineage/flowAnalyzer';
import { getWorkspaceNodeIcon } from '../../shared';

/**
 * Graph node for rendering
 */
export interface GraphNode {
    id: string;
    name: string;
    type: 'table' | 'view' | 'cte' | 'external' | 'column';
    x: number;
    y: number;
    width: number;
    height: number;
    columns?: ColumnData[];
    expanded: boolean;
    filePath?: string;
    lineNumber?: number;
    upstreamCount: number;
    downstreamCount: number;
    depth: number; // Distance from center node
    metadata: Record<string, any>;
}

/**
 * Column data for expanded nodes
 */
export interface ColumnData {
    name: string;
    dataType?: string;
    isPrimaryKey?: boolean;
    isNullable?: boolean;
    // Lineage tracking
    sourceColumns?: string[];  // Source table.column names
    transformationType?: 'direct' | 'rename' | 'aggregate' | 'expression' | 'case' | 'cast' | 'coalesce' | 'join' | 'filter' | 'unknown';
    expression?: string;
    isComputed?: boolean;
    // Interaction state
    isSelected?: boolean;      // User clicked this column
    isInPath?: boolean;        // Part of current lineage trace
}

/**
 * Graph edge for rendering
 */
export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    type: 'direct' | 'transform' | 'aggregate' | 'filter' | 'join';
    points: { x: number; y: number }[];
    label?: string;
    filePath?: string;
}

/**
 * Complete graph data for rendering
 */
export interface RenderableGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    centerNodeId: string;
    width: number;
    height: number;
    stats: {
        upstreamCount: number;
        downstreamCount: number;
        totalNodes: number;
    };
}

/**
 * Options for graph rendering
 */
export interface GraphRenderOptions {
    centerNodeId: string;
    depth: number;
    direction: 'both' | 'upstream' | 'downstream';
    expandedNodes?: Set<string>;
    includeExternal?: boolean;
}

/**
 * Renders lineage graph using dagre for layout
 */
export class LineageGraphRenderer {
    private lineageGraph: LineageGraph;
    private flowAnalyzer: FlowAnalyzer;

    // Layout configuration
    private readonly NODE_WIDTH = 200;
    private readonly NODE_HEIGHT_COLLAPSED = 60;
    private readonly NODE_HEIGHT_PER_COLUMN = 24;
    private readonly NODE_SEP = 60;
    private readonly RANK_SEP = 120;
    private readonly EDGE_SEP = 20;

    constructor(lineageGraph: LineageGraph) {
        this.lineageGraph = lineageGraph;
        this.flowAnalyzer = new FlowAnalyzer(lineageGraph);
    }

    /**
     * Build a renderable graph centered on a specific node
     */
    buildGraph(options: GraphRenderOptions): RenderableGraph {
        const {
            centerNodeId,
            depth,
            direction,
            expandedNodes = new Set(),
            includeExternal = true
        } = options;

        // Collect nodes based on direction
        const nodeMap = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];

        // Get center node
        const centerNode = this.lineageGraph.nodes.get(centerNodeId);
        if (!centerNode) {
            return this.createEmptyGraph(centerNodeId);
        }

        // Add center node
        this.addNodeToMap(nodeMap, centerNode, 0, expandedNodes, includeExternal);

        // Get upstream nodes
        if (direction === 'both' || direction === 'upstream') {
            const upstream = this.flowAnalyzer.getUpstream(centerNodeId, {
                maxDepth: depth,
                excludeExternal: !includeExternal
            });
            this.addFlowNodesToMap(nodeMap, upstream.nodes, -1, expandedNodes, includeExternal);
        }

        // Get downstream nodes
        if (direction === 'both' || direction === 'downstream') {
            const downstream = this.flowAnalyzer.getDownstream(centerNodeId, {
                maxDepth: depth,
                excludeExternal: !includeExternal
            });
            this.addFlowNodesToMap(nodeMap, downstream.nodes, 1, expandedNodes, includeExternal);
        }

        // Build edges between visible nodes
        for (const edge of this.lineageGraph.edges) {
            // Skip column edges (table -> column)
            if (edge.metadata?.relationship === 'contains') {continue;}

            if (nodeMap.has(edge.sourceId) && nodeMap.has(edge.targetId)) {
                edges.push({
                    id: edge.id,
                    source: edge.sourceId,
                    target: edge.targetId,
                    type: edge.type,
                    points: [],
                    label: edge.transformation,
                    filePath: edge.metadata?.filePath
                });
            }
        }

        // Calculate upstream/downstream counts for each node
        for (const [nodeId, graphNode] of nodeMap) {
            const upstream = this.flowAnalyzer.getUpstream(nodeId, { maxDepth: depth, excludeExternal: true });
            const downstream = this.flowAnalyzer.getDownstream(nodeId, { maxDepth: depth, excludeExternal: true });
            graphNode.upstreamCount = upstream.nodes.length;
            graphNode.downstreamCount = downstream.nodes.length;
        }

        // Apply dagre layout
        const layout = this.applyDagreLayout(nodeMap, edges, expandedNodes);

        return {
            nodes: Array.from(nodeMap.values()),
            edges,
            centerNodeId,
            width: layout.width,
            height: layout.height,
            stats: {
                upstreamCount: direction === 'downstream' ? 0 :
                    Array.from(nodeMap.values()).filter(n => n.depth < 0).length,
                downstreamCount: direction === 'upstream' ? 0 :
                    Array.from(nodeMap.values()).filter(n => n.depth > 0).length,
                totalNodes: nodeMap.size
            }
        };
    }

    /**
     * Add a lineage node to the graph node map
     */
    private addNodeToMap(
        nodeMap: Map<string, GraphNode>,
        node: LineageNode,
        depth: number,
        expandedNodes: Set<string>,
        includeExternal: boolean
    ): void {
        if (!includeExternal && node.type === 'external') {return;}
        if (node.type === 'column') {return;} // Skip column nodes

        const isExpanded = expandedNodes.has(node.id);
        const columns = this.getNodeColumns(node);

        nodeMap.set(node.id, {
            id: node.id,
            name: node.name,
            type: node.type as GraphNode['type'],
            x: 0,
            y: 0,
            width: this.NODE_WIDTH,
            height: isExpanded && columns.length > 0
                ? this.NODE_HEIGHT_COLLAPSED + columns.length * this.NODE_HEIGHT_PER_COLUMN
                : this.NODE_HEIGHT_COLLAPSED,
            columns: isExpanded ? columns : undefined,
            expanded: isExpanded,
            filePath: node.filePath,
            lineNumber: node.lineNumber,
            upstreamCount: 0,
            downstreamCount: 0,
            depth,
            metadata: node.metadata || {}
        });
    }

    /**
     * Add flow result nodes to the map
     */
    private addFlowNodesToMap(
        nodeMap: Map<string, GraphNode>,
        nodes: LineageNode[],
        depthSign: number,
        expandedNodes: Set<string>,
        includeExternal: boolean
    ): void {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!nodeMap.has(node.id)) {
                // Calculate depth based on position in BFS order (simplified)
                const depth = depthSign * (i + 1);
                this.addNodeToMap(nodeMap, node, depth, expandedNodes, includeExternal);
            }
        }
    }

    /**
     * Get columns for a node
     */
    private getNodeColumns(node: LineageNode): ColumnData[] {
        const columns: ColumnData[] = [];

        // Find column nodes that belong to this table
        for (const [id, potentialColumn] of this.lineageGraph.nodes) {
            if (potentialColumn.type === 'column') {
                if (potentialColumn.parentId === node.id) {
                    columns.push({
                        name: potentialColumn.name,
                        dataType: potentialColumn.columnInfo?.dataType,
                        isPrimaryKey: potentialColumn.metadata?.isPrimaryKey,
                        isNullable: potentialColumn.metadata?.nullable
                    });
                }
            }
        }

        return columns;
    }

    /**
     * Apply dagre layout to the graph
     */
    private applyDagreLayout(
        nodeMap: Map<string, GraphNode>,
        edges: GraphEdge[],
        expandedNodes: Set<string>
    ): { width: number; height: number } {
        const g = new dagre.graphlib.Graph();

        g.setGraph({
            rankdir: 'LR', // Left to Right
            nodesep: this.NODE_SEP,
            ranksep: this.RANK_SEP,
            marginx: 50,
            marginy: 50
        });

        g.setDefaultEdgeLabel(() => ({}));

        // Add nodes to dagre graph
        for (const [id, node] of nodeMap) {
            g.setNode(id, {
                width: node.width,
                height: node.height
            });
        }

        // Add edges to dagre graph
        for (const edge of edges) {
            if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
                g.setEdge(edge.source, edge.target);
            }
        }

        // Run layout
        dagre.layout(g);

        // Apply positions to nodes
        for (const [id, node] of nodeMap) {
            const dagreNode = g.node(id) as { x?: number; y?: number; width?: number; height?: number } | undefined;
            if (dagreNode && dagreNode.x !== undefined && dagreNode.y !== undefined) {
                node.x = dagreNode.x - node.width / 2;
                node.y = dagreNode.y - node.height / 2;
            }
        }

        // Apply edge points - use type assertion since dagre's types are incomplete
        for (const edge of edges) {
            const dagreEdge = (g as any).edge(edge.source, edge.target) as { points?: { x: number; y: number }[] } | undefined;
            if (dagreEdge && dagreEdge.points) {
                edge.points = dagreEdge.points;
            }
        }

        // Calculate graph dimensions - use type assertion since dagre's types are incomplete
        const graphInfo = (g as any).graph() as { width?: number; height?: number } | undefined;
        return {
            width: graphInfo?.width || 800,
            height: graphInfo?.height || 600
        };
    }

    /**
     * Create an empty graph response
     */
    private createEmptyGraph(centerNodeId: string): RenderableGraph {
        return {
            nodes: [],
            edges: [],
            centerNodeId,
            width: 400,
            height: 300,
            stats: {
                upstreamCount: 0,
                downstreamCount: 0,
                totalNodes: 0
            }
        };
    }

    /**
     * Generate SVG markup for the graph
     */
    generateSVG(graph: RenderableGraph, options: {
        focusedNodeId?: string;
        highlightPath?: string[];
    } = {}): string {
        const { focusedNodeId, highlightPath = [] } = options;
        const highlightSet = new Set(highlightPath);

        // Don't use viewBox - let the container handle sizing and we'll manage transforms manually
        let svg = `<svg class="lineage-graph-svg"
                        style="width: 100%; height: 100%; overflow: visible;"
                        xmlns="http://www.w3.org/2000/svg">`;

        // Add definitions for markers and gradients
        svg += `
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="var(--text-dim)" />
                </marker>
                <marker id="arrowhead-highlighted" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)" />
                </marker>
                <!-- Column lineage arrowheads -->
                <marker id="column-arrowhead-upstream" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#22c55e" />
                </marker>
                <marker id="column-arrowhead-downstream" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
                </marker>
            </defs>
        `;

        // Add zoom/pan container
        svg += `<g class="lineage-graph-container">`;

        // Render edges first (behind nodes)
        for (const edge of graph.edges) {
            const isHighlighted = highlightSet.has(edge.source) && highlightSet.has(edge.target);
            svg += this.renderEdge(edge, isHighlighted);
        }

        // Render nodes
        for (const node of graph.nodes) {
            const isFocused = node.id === focusedNodeId;
            const isCenter = node.id === graph.centerNodeId;
            const isHighlighted = highlightSet.has(node.id);
            const isDimmed = highlightPath.length > 0 && !isHighlighted && !isFocused;

            svg += this.renderNode(node, { isFocused, isCenter, isHighlighted, isDimmed });
        }

        svg += `</g></svg>`;

        return svg;
    }

    /**
     * Render a single node as SVG
     */
    private renderNode(node: GraphNode, options: {
        isFocused: boolean;
        isCenter: boolean;
        isHighlighted: boolean;
        isDimmed: boolean;
    }): string {
        const { isFocused, isCenter, isHighlighted, isDimmed } = options;

        const classes = [
            'lineage-node',
            `lineage-node-${node.type}`,
            node.expanded ? 'expanded' : '',
            isFocused ? 'focused' : '',
            isCenter ? 'center' : '',
            isHighlighted ? 'highlighted' : '',
            isDimmed ? 'dimmed' : ''
        ].filter(Boolean).join(' ');

        const icon = this.getNodeIcon(node.type);
        const typeLabel = node.type === 'cte' ? 'CTE' : node.type;

        let svg = `
            <g class="${classes}"
               data-node-id="${this.escapeHtml(node.id)}"
               data-node-name="${this.escapeHtml(node.name)}"
               data-node-type="${node.type}"
               data-expanded="${node.expanded ? 'true' : 'false'}"
               data-column-count="${node.metadata.columnCount || node.columns?.length || 0}"
               data-upstream-count="${node.upstreamCount}"
               data-downstream-count="${node.downstreamCount}"
               data-file-path="${this.escapeHtml(node.filePath || '')}"
               data-line-number="${node.lineNumber || 0}"
               transform="translate(${node.x}, ${node.y})">
        `;

        // Node background
        if (node.type === 'external') {
            svg += `<rect class="node-bg" width="${node.width}" height="${node.height}"
                         rx="8" ry="8"/>`;
        } else {
            svg += `<rect class="node-bg" width="${node.width}" height="${node.height}" rx="8" ry="8"/>`;
        }

        // Left accent strip (4px wide)
        svg += `<rect class="node-accent" x="0" y="0" width="4" height="${node.height}" rx="4" ry="4" clip-path="inset(0 0 0 0 round 8px 0 0 8px)"/>`;

        // Node header
        svg += `
            <g class="node-icon-svg" transform="translate(10, 12)">${icon}</g>
            <text class="node-name" x="38" y="22">${this.escapeHtml(this.truncateName(node.name, 18))}</text>
            <text class="node-type" x="38" y="40">${typeLabel}${node.metadata.columnCount ? ` \u00B7 ${node.metadata.columnCount} columns` : ''}</text>
        `;

        // Expand/collapse button
        if (node.columns && node.columns.length > 0 || node.metadata.columnCount) {
            const buttonY = node.height - 20;
            svg += `
                <g class="expand-btn" data-action="${node.expanded ? 'collapse' : 'expand'}">
                    <rect x="10" y="${buttonY - 6}" width="${node.width - 20}" height="18" rx="4" fill="var(--bg-tertiary)"/>
                    <text x="${node.width / 2}" y="${buttonY + 6}" text-anchor="middle" class="expand-text">
                        ${node.expanded ? '[\u2212] Collapse' : '[+] Expand columns'}
                    </text>
                </g>
            `;
        }

        // Render columns if expanded
        if (node.expanded && node.columns) {
            svg += `<line x1="0" y1="50" x2="${node.width}" y2="50" class="node-divider"/>`;
            let columnY = 68;
            let columnIndex = 0;
            for (const column of node.columns) {
                // Note: dimmed class is applied dynamically via JS when a column is selected
                // Don't apply dimmed by default - only selected and in-path states come from server
                const columnClasses = [
                    'column-row',
                    column.isSelected ? 'selected' : '',
                    column.isInPath ? 'in-path' : ''
                ].filter(Boolean).join(' ');

                const dotChar = column.isSelected ? '\u25C9' :  // ◉ Selected
                               column.isInPath ? '\u25CF' :    // ● In path
                               column.isPrimaryKey ? '\u25CF' : '\u25CB';  // ○ Default

                // Determine column type category for color coding
                const typeCategory = this.getColumnTypeCategory(column.dataType || '');
                const dotClass = column.isPrimaryKey ? 'primary' : typeCategory;

                svg += `
                    <g class="${columnClasses}" data-column-name="${this.escapeHtml(column.name)}" data-action="selectColumn" tabindex="0" role="button" focusable="true" aria-label="${this.escapeHtml(node.name + '.' + column.name)}">
                        <rect x="8" y="${columnY - 16}" width="${node.width - 16}" height="20" rx="4" class="column-row-bg ${columnIndex % 2 === 0 ? 'even' : 'odd'}"/>
                        <circle cx="20" cy="${columnY - 4}" r="4" class="column-dot ${dotClass}"/>
                        <text x="20" y="${columnY}" text-anchor="middle" class="column-state">${dotChar}</text>
                        <text x="32" y="${columnY}" class="column-name">${this.escapeHtml(column.name)}</text>
                        ${column.dataType ? `<text x="${node.width - 10}" y="${columnY}" text-anchor="end" class="column-type">${column.dataType}</text>` : ''}
                    </g>
                `;
                columnY += this.NODE_HEIGHT_PER_COLUMN;
                columnIndex++;
            }

            // Close button for expanded nodes (top-right corner)
            svg += `
                <g class="column-close-btn" data-action="collapse">
                    <circle cx="${node.width - 16}" cy="16" r="10" fill="rgba(239,68,68,0.6)"/>
                    <path d="M ${node.width - 21} 11 L ${node.width - 11} 21 M ${node.width - 11} 11 L ${node.width - 21} 21"
                          stroke="white" stroke-width="2" stroke-linecap="round"/>
                </g>
            `;
        }

        svg += `</g>`;
        return svg;
    }

    /**
     * Render an edge as SVG path
     */
    private renderEdge(edge: GraphEdge, isHighlighted: boolean): string {
        if (edge.points.length < 2) {return '';}

        const classes = [
            'lineage-edge',
            `lineage-edge-${edge.type}`,
            isHighlighted ? 'highlighted' : ''
        ].filter(Boolean).join(' ');

        // Build bezier curve path
        const points = edge.points;
        let pathD = `M ${points[0].x} ${points[0].y}`;

        if (points.length === 2) {
            // Simple line
            pathD += ` L ${points[1].x} ${points[1].y}`;
        } else {
            // Smooth curve through points
            for (let i = 1; i < points.length - 1; i++) {
                const curr = points[i];
                const next = points[i + 1];
                const midX = (curr.x + next.x) / 2;
                const midY = (curr.y + next.y) / 2;
                pathD += ` Q ${curr.x} ${curr.y} ${midX} ${midY}`;
            }
            const last = points[points.length - 1];
            pathD += ` L ${last.x} ${last.y}`;
        }

        return `
            <path class="${classes}"
                  d="${pathD}"
                  data-edge-id="${this.escapeHtml(edge.id)}"
                  data-source="${this.escapeHtml(edge.source)}"
                  data-target="${this.escapeHtml(edge.target)}"
                  marker-end="url(#${isHighlighted ? 'arrowhead-highlighted' : 'arrowhead'})"/>
        `;
    }

    /**
     * Get icon for node type
     */
    private getNodeIcon(type: string): string {
        return getWorkspaceNodeIcon(type);
    }

    /**
     * Get column type category for color coding
     * Categories: numeric, text, datetime, boolean, binary, json, other
     */
    private getColumnTypeCategory(dataType: string): string {
        const type = dataType.toUpperCase();

        // Numeric types
        if (/INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|NUMBER|MONEY|SERIAL|BIGINT|SMALLINT|TINYINT/.test(type)) {
            return 'type-numeric';
        }

        // Text types
        if (/CHAR|TEXT|STRING|CLOB|VARCHAR|NCHAR|NVARCHAR/.test(type)) {
            return 'type-text';
        }

        // Date/Time types
        if (/DATE|TIME|TIMESTAMP|DATETIME|YEAR|INTERVAL/.test(type)) {
            return 'type-datetime';
        }

        // Boolean
        if (/BOOL|BOOLEAN|BIT/.test(type)) {
            return 'type-boolean';
        }

        // Binary/Blob
        if (/BLOB|BINARY|BYTEA|VARBINARY|IMAGE/.test(type)) {
            return 'type-binary';
        }

        // JSON/Array/Object
        if (/JSON|JSONB|ARRAY|OBJECT|MAP|STRUCT/.test(type)) {
            return 'type-json';
        }

        return 'type-other';
    }

    /**
     * Truncate name to fit in node
     */
    private truncateName(name: string, maxLength: number): string {
        if (name.length <= maxLength) {return name;}
        return name.substring(0, maxLength - 3) + '...';
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

    /**
     * Get all table/view names for search autocomplete
     */
    getSearchableNodes(): Array<{ id: string; name: string; type: string; filePath?: string }> {
        const nodes: Array<{ id: string; name: string; type: string; filePath?: string }> = [];

        for (const [id, node] of this.lineageGraph.nodes) {
            if (node.type === 'table' || node.type === 'view' || node.type === 'cte') {
                nodes.push({
                    id,
                    name: node.name,
                    type: node.type,
                    filePath: node.filePath
                });
            }
        }

        return nodes.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Search nodes by name (for autocomplete)
     */
    searchNodes(query: string, limit: number = 10): Array<{ id: string; name: string; type: string; filePath?: string }> {
        const queryLower = query.toLowerCase();
        const nodes = this.getSearchableNodes();

        return nodes
            .filter(n => n.name.toLowerCase().includes(queryLower))
            .slice(0, limit);
    }
}
