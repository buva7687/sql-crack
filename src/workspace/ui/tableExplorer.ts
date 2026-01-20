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
                <div class="table-list-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
                    </svg>
                    <h3>No Tables Found</h3>
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
                downstreamCount: downstream.nodes.length,
                totalConnections: upstream.nodes.length + downstream.nodes.length
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
            <div class="table-list-view">
                <div class="table-list-header">
                    <div class="header-top">
                        <div>
                            <h3>Table Explorer</h3>
                            <p class="header-subtitle">Browse and explore all tables, views, and CTEs in your workspace</p>
                        </div>
                    </div>
                    <div class="header-info">
                        <div class="info-card">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                            </svg>
                            <div>
                                <strong>What is this?</strong>
                                <p>This shows all database objects (tables, views, CTEs) found in your SQL files. Click any item to see its columns, data sources, and where it's used.</p>
                            </div>
                        </div>
                        <div class="info-card">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                            </svg>
                            <div>
                                <strong>Connection indicators:</strong>
                                <p>
                                    <span class="legend-item"><span class="legend-dot high"></span> High connections (10+)</span>
                                    <span class="legend-item"><span class="legend-dot medium"></span> Medium (3-9)</span>
                                    <span class="legend-item"><span class="legend-dot low"></span> Low (1-2)</span>
                                </p>
                            </div>
                        </div>
                    </div>
                    <div class="header-stats">
                        <div class="stat-badge">
                            <span class="stat-value">${tables.length}</span>
                            <span class="stat-label">Total Objects</span>
                        </div>
                        <div class="stat-badge">
                            <span class="stat-value">${typeCounts.table}</span>
                            <span class="stat-label">Tables</span>
                        </div>
                        <div class="stat-badge">
                            <span class="stat-value">${typeCounts.view}</span>
                            <span class="stat-label">Views</span>
                        </div>
                        <div class="stat-badge">
                            <span class="stat-value">${typeCounts.cte}</span>
                            <span class="stat-label">CTEs</span>
                        </div>
                    </div>
                </div>
                
                <!-- Search and Filter Controls -->
                <div class="table-list-controls">
                    <div class="controls-header">
                        <h4>Search & Filter</h4>
                        <p class="controls-hint">Find specific tables or filter by type. Use <kbd>/</kbd> to focus search, <kbd>Esc</kbd> to clear.</p>
                    </div>
                    <div class="search-box-table">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                        </svg>
                        <input type="text" id="table-search-input" class="search-input-table" placeholder="Search by table name... (Press / to focus)" autocomplete="off">
                        <button class="search-clear-table" id="table-search-clear" style="display: none;" title="Clear search">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="filter-controls">
                        <div class="filter-group">
                            <label for="table-type-filter" class="filter-label">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 3h18v18H3zM3 9h18M9 3v18"/>
                                </svg>
                                Filter by Type
                            </label>
                            <select id="table-type-filter" class="filter-select">
                                <option value="all">All Types (${typeCounts.all})</option>
                                <option value="table">📊 Tables Only (${typeCounts.table})</option>
                                <option value="view">👁️ Views Only (${typeCounts.view})</option>
                                <option value="cte">🔄 CTEs Only (${typeCounts.cte})</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label for="table-sort" class="filter-label">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18M7 12h14M11 18h10"/>
                                </svg>
                                Sort By
                            </label>
                            <select id="table-sort" class="filter-select">
                                <option value="connected">Most Connected (default)</option>
                                <option value="name-asc">Name (A-Z)</option>
                                <option value="name-desc">Name (Z-A)</option>
                                <option value="type">Type</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="table-list-results-info" id="table-list-results-info" style="display: none;">
                    <span id="table-results-count">Showing 0 of 0 tables</span>
                </div>

                <div class="table-list-grid" id="table-list-grid">
        `;

        // Sort by total connections (most connected first) - default
        tablesWithCounts.sort((a, b) => {
            const totalA = a.upstreamCount + a.downstreamCount;
            const totalB = b.upstreamCount + b.downstreamCount;
            if (totalB !== totalA) return totalB - totalA;
            return a.table.name.localeCompare(b.table.name);
        });

        for (const { table, upstreamCount, downstreamCount, totalConnections } of tablesWithCounts) {
            const typeIcon = this.getTypeIcon(table.type);
            const fileName = table.filePath ? table.filePath.split('/').pop() || '' : '';
            const hasConnections = totalConnections > 0;

            // Determine connection strength for visual indicator
            const connectionStrength = totalConnections === 0 ? 'none' : 
                                     totalConnections < 3 ? 'low' : 
                                     totalConnections < 10 ? 'medium' : 'high';

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
                        ${hasConnections ? `<div class="connection-indicator connection-${connectionStrength}" title="Connection strength: ${connectionStrength}"></div>` : ''}
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
                            </div>` : '<span class="no-connections-badge" title="This table has no connections to other tables">No connections</span>'}
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
                <div id="table-list-empty-filter" class="table-list-empty-filter" style="display: none;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <h3>No tables found</h3>
                    <p id="empty-filter-message">No tables match your search criteria</p>
                    <p class="hint">Try a different search term or adjust filters</p>
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
            html += this.generateFlowPanel('upstream', upstream, table.id, graph);
        }

        // Add downstream panel - get all nodes including external in single call
        const downstream = flowAnalyzer.getDownstream(table.id, { maxDepth: 10, excludeExternal: false });

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
        const icon = direction === 'upstream' ? '⬆️' : '⬇️';

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
        const internalNodes: Array<{ node: LineageNode; edges: any[] }> = [];
        const externalMap = new Map<string, any[]>(); // name -> edges
        const seenIds = new Set<string>();

        for (const node of flow.nodes) {
            if (seenIds.has(node.id)) continue;
            seenIds.add(node.id);

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
            if (a.node.type !== b.node.type) return a.node.type.localeCompare(b.node.type);
            return a.node.name.localeCompare(b.node.name);
        });

        const internalCount = internalNodes.length;
        const externalCount = externalMap.size;
        const totalCount = internalCount + externalCount;

        let html = `
            <div class="flow-panel flow-${direction}">
                <h3>${icon} ${title} (${totalCount})</h3>
        `;

        // Show internal tables/views first
        if (internalNodes.length > 0) {
            html += `
                <div class="flow-section">
                    <div class="flow-section-header">
                        <div class="flow-section-title">
                            <span>📊 Defined in Workspace (${internalCount})</span>
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
                const filePathDisplay = filePathList.length > 0 ? filePathList[0].split('/').pop() || '' : '';
                const filePathTooltip = filePathList.length > 1 
                    ? `Used in: ${filePathList.map(f => f.split('/').pop()).join(', ')}`
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
                            <span>🌐 Referenced but Not Defined in Workspace (${externalMap.size})</span>
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
                const filePathDisplay = filePathList.length > 0 ? filePathList[0].split('/').pop() || '' : '';
                const filePathTooltip = filePathList.length > 1 
                    ? `Referenced in: ${filePathList.map(f => f.split('/').pop()).join(', ')}`
                    : filePathList.length === 1 
                        ? `Referenced in: ${filePathList[0]}`
                        : 'Referenced in your SQL queries';
                
                html += `
                    <div class="flow-item flow-item-external" title="${this.escapeHtml(filePathTooltip)}">
                        <span class="flow-node-icon">🌐</span>
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
