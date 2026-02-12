// Table Explorer - Table-centric exploration view

import * as path from 'path';
import { LineageGraph, LineageNode } from '../lineage/types';
import { ColumnLineageTracker } from '../lineage/columnLineage';
import { FlowAnalyzer } from '../lineage/flowAnalyzer';
import { TableExplorerData } from './types';
import { ICONS, getWorkspaceNodeIcon } from '../../shared';

/**
 * Generates HTML for table-centric exploration
 */
export class TableExplorer {
    private readonly connectionCountCache = new WeakMap<LineageGraph, Map<string, {
        upstreamCount: number;
        downstreamCount: number;
    }>>();
    private traversalDepth = 10;

    setTraversalDepth(depth: number): void {
        const numeric = Number(depth);
        if (!Number.isFinite(numeric)) {
            return;
        }
        const normalized = Math.floor(numeric);
        if (normalized < 1) {
            return;
        }
        this.traversalDepth = normalized;
    }

    /**
     * Generate a list of all tables in the workspace with search and filtering
     */
    generateTableList(graph: LineageGraph): string {
        // Collect all table/view nodes
        const tables: LineageNode[] = [];
        graph.nodes.forEach((node) => {
            if (node.type === 'table' || node.type === 'view' || node.type === 'cte') {
                tables.push(node);
            }
        });

        if (tables.length === 0) {
            return `
                <div class="view-container view-tables">
                    <div class="view-compact-header">
                        <span class="view-icon">${ICONS.table}</span>
                        <h3>Tables</h3>
                        <span class="view-inline-stats">0 tables, 0 views, 0 CTEs</span>
                    </div>
                    <div class="view-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
                        </svg>
                        <h3>No Tables Found</h3>
                        <p>No tables found in workspace.</p>
                        <p class="hint">Open SQL files to populate the table list.</p>
                    </div>
                </div>
            `;
        }

        // Count connections for each table
        const flowAnalyzer = new FlowAnalyzer(graph);
        let graphConnectionCache = this.connectionCountCache.get(graph);
        if (!graphConnectionCache) {
            graphConnectionCache = new Map();
            this.connectionCountCache.set(graph, graphConnectionCache);
        }
        const isDisplayableNode = (node: LineageNode) =>
            node.type === 'table' || node.type === 'view' || node.type === 'cte';

        const tablesWithCounts = tables.map(table => {
            const cached = graphConnectionCache!.get(table.id);
            if (cached) {
                return {
                    table,
                    ...cached,
                    totalConnections: cached.upstreamCount + cached.downstreamCount
                };
            }

            const upstream = flowAnalyzer.getUpstream(table.id, { maxDepth: this.traversalDepth, excludeExternal: true });
            const downstream = flowAnalyzer.getDownstream(table.id, { maxDepth: this.traversalDepth, excludeExternal: true });
            const upstreamCount = upstream.nodes.filter(isDisplayableNode).length;
            const downstreamCount = downstream.nodes.filter(isDisplayableNode).length;

            graphConnectionCache!.set(table.id, { upstreamCount, downstreamCount });
            return {
                table,
                upstreamCount,
                downstreamCount,
                totalConnections: upstreamCount + downstreamCount
            };
        });

        // Count by type
        const typeCounts = {
            all: tables.length,
            table: tables.filter(t => t.type === 'table').length,
            view: tables.filter(t => t.type === 'view').length,
            cte: tables.filter(t => t.type === 'cte').length
        };

        let html = `
            <div class="view-container view-tables">
                <div class="view-compact-header">
                    <span class="view-icon">${ICONS.table}</span>
                    <h3>Tables</h3>
                    <span class="view-inline-stats">${typeCounts.table} tables, ${typeCounts.view} views, ${typeCounts.cte} CTEs</span>
                </div>
                <div class="view-search-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input type="text" id="table-search-input" class="view-search-input" placeholder="Search by table name..." autocomplete="off">
                    <button class="view-search-clear" id="table-search-clear" title="Clear search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="view-filters">
                    <div class="view-filter-group">
                        <label class="view-filter-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 3h18v18H3zM3 9h18M9 3v18"/>
                            </svg>
                            Type
                        </label>
                        <select id="table-type-filter" class="view-filter-select">
                            <option value="all">All Types (${typeCounts.all})</option>
                            <option value="table">Tables (${typeCounts.table})</option>
                            <option value="view">Views (${typeCounts.view})</option>
                            <option value="cte">CTEs (${typeCounts.cte})</option>
                        </select>
                    </div>
                    <div class="view-filter-group">
                        <label class="view-filter-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M7 12h14M11 18h10"/>
                            </svg>
                            Sort
                        </label>
                        <select id="table-sort" class="view-filter-select">
                            <option value="connected">Most Connected (up + down)</option>
                            <option value="name-asc">Name (A-Z)</option>
                            <option value="name-desc">Name (Z-A)</option>
                            <option value="type">Type</option>
                        </select>
                    </div>
                    <button class="view-filter-clear" id="table-clear-filters" title="Clear search and filters" style="display: none;">Clear filters</button>
                </div>

                <!-- Content -->
                <div class="view-content">
                    <div class="table-list-results-info" id="table-list-results-info">
                        <span id="table-results-count">Showing ${tables.length} of ${tables.length} tables</span>
                    </div>
                    <div class="view-grid" id="table-list-grid">
        `;

        // Sort by total connections (most connected first) - default
        tablesWithCounts.sort((a, b) => {
            const totalA = a.upstreamCount + a.downstreamCount;
            const totalB = b.upstreamCount + b.downstreamCount;
            if (totalB !== totalA) {return totalB - totalA;}
            return a.table.name.localeCompare(b.table.name);
        });

        for (const { table, upstreamCount, downstreamCount, totalConnections } of tablesWithCounts) {
            const typeIcon = this.getTypeIcon(table.type);
            const fileName = table.filePath ? path.basename(table.filePath) : '';
            const hasConnections = totalConnections > 0;

            // Determine connection strength for visual indicator
            const connectionStrength = totalConnections === 0 ? 'none' :
                                     totalConnections < 3 ? 'low' :
                                     totalConnections < 10 ? 'medium' : 'high';
            const connectionStrengthHint = connectionStrength === 'low'
                ? 'Low connection strength (1-2 relationships)'
                : connectionStrength === 'medium'
                    ? 'Medium connection strength (3-9 relationships)'
                    : connectionStrength === 'high'
                        ? 'High connection strength (10+ relationships)'
                        : 'No relationships';

            html += `
                <div class="table-list-item ${!hasConnections ? 'no-connections' : ''} connection-${connectionStrength}" 
                     data-action="explore-table" 
                     data-node-id="${this.escapeHtml(table.id)}" 
                     data-table="${this.escapeHtml(table.name)}"
                     data-type="${table.type}"
                     data-name="${this.escapeHtml(table.name.toLowerCase())}"
                     title="Click to explore: columns, data sources (upstream), and consumers (downstream)">
                    <div class="table-list-icon-wrapper">
                        <div class="table-list-icon">${typeIcon}</div>
                        ${hasConnections ? `<div class="connection-indicator connection-${connectionStrength}" title="${connectionStrengthHint}"></div>` : ''}
                    </div>
                    <div class="table-list-info">
                        <div class="table-list-header-row">
                            <span class="table-list-name">${this.escapeHtml(table.name)}</span>
                            ${hasConnections ? `<div class="table-list-connections">
                                ${upstreamCount > 0 ? `<span class="connection-badge upstream" title="${upstreamCount} table${upstreamCount !== 1 ? 's' : ''} feed data into this (upstream sources)">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M12 19V5M5 12l7-7 7 7"/>
                                    </svg>
                                    ${upstreamCount}
                                </span>` : ''}
                                ${downstreamCount > 0 ? `<span class="connection-badge downstream" title="${downstreamCount} table${downstreamCount !== 1 ? 's' : ''} use data from this (downstream consumers)">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M12 5v14M5 12l7 7 7-7"/>
                                    </svg>
                                    ${downstreamCount}
                                </span>` : ''}
                            </div>` : '<span class="no-connections-badge" title="No upstream or downstream relationships">No relationships</span>'}
                        </div>
                        <div class="table-list-meta">
                            <span class="table-list-type-badge type-${table.type}" title="${table.type === 'table' ? 'Database table' : table.type === 'view' ? 'Database view (virtual table)' : 'Common Table Expression (CTE)'}">${table.type}</span>
                            ${fileName ? `<span class="table-list-file" title="Defined in: ${this.escapeHtml(table.filePath || '')}">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                </svg>
                                ${this.escapeHtml(fileName)}
                            </span>` : ''}
                        </div>
                    </div>
                    <div class="table-list-action" title="Click to explore details">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </div>
                </div>
            `;
        }

        html += `
                    </div>
                    <div id="table-list-empty-filter" class="view-empty" style="display: none;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                        </svg>
                        <h3>No tables found</h3>
                        <p id="empty-filter-message">No tables match your search criteria</p>
                        <p class="hint">Try a different search term or adjust filters</p>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Get icon for node type
     */
    private getTypeIcon(type: string): string {
        return getWorkspaceNodeIcon(type);
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
                    <div class="cross-link-actions">
                        <button type="button"
                                class="cross-link-btn"
                                data-action="cross-view-lineage"
                                data-table="${this.escapeHtml(table.name)}"
                                data-node-id="${this.escapeHtml(table.id)}"
                                data-node-type="${table.type}">
                            View Lineage
                        </button>
                        <button type="button"
                                class="cross-link-btn"
                                data-action="cross-view-impact"
                                data-table="${this.escapeHtml(table.name)}"
                                data-node-id="${this.escapeHtml(table.id)}"
                                data-node-type="${table.type}">
                            Analyze Impact
                        </button>
                    </div>
                </div>
        `;

        // Add column list
        if (table.columnInfo) {
            html += this.generateColumnList([table.columnInfo]);
        }

        // Add upstream panel - get all nodes including external in single call
        const flowAnalyzer = new FlowAnalyzer(graph);
        const upstream = flowAnalyzer.getUpstream(table.id, { maxDepth: this.traversalDepth, excludeExternal: false });

        if (upstream.nodes.length > 0) {
            html += this.generateFlowPanel('upstream', upstream, table.id, graph);
        }

        // Add downstream panel - get all nodes including external in single call
        const downstream = flowAnalyzer.getDownstream(table.id, { maxDepth: this.traversalDepth, excludeExternal: false });

        if (downstream.nodes.length > 0) {
            html += this.generateFlowPanel('downstream', downstream, table.id, graph);
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
    private generateFlowPanel(direction: 'upstream' | 'downstream', flow: any, targetNodeId: string, graph: LineageGraph): string {
        const title = direction === 'upstream' ? 'Data Sources' : 'Data Consumers';
        const icon = direction === 'upstream'
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';

        // Build a map of node ID to edges (to show which file creates the relationship)
        const nodeToEdges = new Map<string, any[]>();
        for (const edge of flow.edges) {
            const nodeId = direction === 'upstream' ? edge.sourceId : edge.targetId;
            if (!nodeToEdges.has(nodeId)) {
                nodeToEdges.set(nodeId, []);
            }
            nodeToEdges.get(nodeId)!.push(edge);
        }

        // Deduplicate nodes by ID and separate internal vs external
        // Only include tables, views, CTEs - skip column nodes
        const internalNodes: Array<{ node: LineageNode; edges: any[] }> = [];
        const externalMap = new Map<string, any[]>(); // name -> edges
        const seenIds = new Set<string>();

        for (const node of flow.nodes) {
            if (seenIds.has(node.id)) {continue;}
            seenIds.add(node.id);

            // Skip column nodes - only show tables, views, CTEs, external
            if (node.type === 'column') {continue;}

            const edges = nodeToEdges.get(node.id) || [];

            if (node.type === 'external') {
                const nameKey = node.name.toLowerCase();
                if (!externalMap.has(nameKey)) {
                    externalMap.set(nameKey, []);
                }
                externalMap.get(nameKey)!.push(...edges);
            } else {
                internalNodes.push({ node, edges });
            }
        }

        // Sort internal nodes by type then name
        internalNodes.sort((a, b) => {
            if (a.node.type !== b.node.type) {return a.node.type.localeCompare(b.node.type);}
            return a.node.name.localeCompare(b.node.name);
        });

        const internalCount = internalNodes.length;
        const externalCount = externalMap.size;
        const totalCount = internalCount + externalCount;

        let html = `
            <div class="flow-panel flow-${direction}">
                <h3><span class="flow-panel-icon">${icon}</span>${title} (${totalCount})</h3>
        `;

        // Show internal tables/views first
        if (internalNodes.length > 0) {
            html += `
                <div class="flow-section">
                    <div class="flow-section-header">
                        <div class="flow-section-title">
                            <span>${this.getTypeIcon('table')} Defined in Workspace (${internalCount})</span>
                        </div>
                        <div class="flow-section-desc">
                            These tables/views have CREATE TABLE or CREATE VIEW statements in your workspace SQL files.
                        </div>
                    </div>
                    <div class="flow-list">
            `;
            for (const { node, edges } of internalNodes) {
                const typeLabel = node.type === 'table' ? 'table' : node.type === 'view' ? 'view' : node.type;
                // Get file paths from edges (where the relationship is defined)
                const filePaths = new Set<string>();
                for (const edge of edges) {
                    if (edge.metadata?.filePath) {
                        filePaths.add(edge.metadata.filePath);
                    }
                }
                // Fallback to node's filePath if no edge metadata
                if (filePaths.size === 0 && node.filePath) {
                    filePaths.add(node.filePath);
                }
                const filePathList = Array.from(filePaths);
                const filePathDisplay = filePathList.length > 0 ? path.basename(filePathList[0]) : '';
                const filePathTooltip = filePathList.length > 1 
                    ? `Used in: ${filePathList.map(f => path.basename(f)).join(', ')}`
                    : filePathList.length === 1 
                        ? `Relationship defined in: ${filePathList[0]}`
                        : '';
                
                html += `
                    <div class="flow-item flow-item-internal" data-action="explore-table" data-node-id="${this.escapeHtml(node.id)}" data-table="${this.escapeHtml(node.name)}">
                        <span class="flow-node-icon">${this.getTypeIcon(node.type)}</span>
                        <span class="flow-node-name">${this.escapeHtml(node.name)}</span>
                        <span class="flow-node-type">${typeLabel}</span>
                        ${filePathDisplay ? `<span class="flow-node-file" title="${this.escapeHtml(filePathTooltip)}">${this.escapeHtml(filePathDisplay)}${filePathList.length > 1 ? ` +${filePathList.length - 1}` : ''}</span>` : ''}
                    </div>
                `;
            }
            html += `
                    </div>
                </div>
            `;
        }

        // Show external references if any
        if (externalMap.size > 0) {
            const externalList = Array.from(externalMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            html += `
                <div class="flow-section">
                    <div class="flow-section-header">
                        <div class="flow-section-title">
                            <span>${this.getTypeIcon('external')} Referenced but Not Defined in Workspace (${externalMap.size})</span>
                            <svg class="info-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="These tables are referenced in your SQL queries (SELECT, JOIN, etc.) but their CREATE TABLE statements are not found in any .sql file in your workspace. They may exist in other databases, schemas, or repositories.">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 16v-4M12 8h.01"/>
                            </svg>
                        </div>
                        <div class="flow-section-desc">
                            These tables are used in your SQL queries, but their table definitions (CREATE TABLE statements) are not in your workspace files. They may be from other databases, schemas, or projects.
                        </div>
                    </div>
                    <div class="flow-list">
            `;
            for (const [name, edges] of externalList) {
                // Get file paths from edges (where the relationship is defined)
                const filePaths = new Set<string>();
                for (const edge of edges) {
                    if (edge.metadata?.filePath) {
                        filePaths.add(edge.metadata.filePath);
                    }
                }
                const filePathList = Array.from(filePaths);
                const filePathDisplay = filePathList.length > 0 ? path.basename(filePathList[0]) : '';
                const filePathTooltip = filePathList.length > 1 
                    ? `Referenced in: ${filePathList.map(f => path.basename(f)).join(', ')}`
                    : filePathList.length === 1 
                        ? `Referenced in: ${filePathList[0]}`
                        : 'Referenced in your SQL queries';
                
                html += `
                    <div class="flow-item flow-item-external" title="${this.escapeHtml(filePathTooltip)}">
                        <span class="flow-node-icon">${this.getTypeIcon('external')}</span>
                        <span class="flow-node-name">${this.escapeHtml(name)}</span>
                        <span class="flow-node-type external">external</span>
                        ${filePathDisplay ? `<span class="flow-node-file" title="${this.escapeHtml(filePathTooltip)}">${this.escapeHtml(filePathDisplay)}${filePathList.length > 1 ? ` +${filePathList.length - 1}` : ''}</span>` : ''}
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
