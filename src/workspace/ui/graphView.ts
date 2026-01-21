// Graph View - HTML body generation for main dependency graph
// Extracted from workspacePanel.ts for modularity

import { WorkspaceDependencyGraph, WorkspaceNode, SearchFilter, DetailedWorkspaceStats } from '../types';
import { getDisplayName } from '../identifiers';
import { getWebviewStyles } from './sharedStyles';
import { getWebviewScript, WebviewScriptParams } from './clientScripts';

/**
 * Parameters for generating graph view body
 */
export interface GraphBodyParams {
    graph: WorkspaceDependencyGraph;
    searchFilter: SearchFilter;
    detailedStats: {
        orphanedDefinitions: any[];
        missingDefinitions: any[];
    };
    totalIssues: number;
}

/**
 * Generates the complete HTML body for the main graph view
 */
export function generateGraphBody(params: GraphBodyParams): string {
    const { graph, searchFilter, detailedStats, totalIssues } = params;
    
    // Generate graph data JSON for client script
    const graphData = JSON.stringify({
        nodes: Array.from(graph.nodes.values()).map(node => ({
            id: node.id,
            label: node.label,
            type: node.type,
            filePath: node.filePath,
            lineNumber: node.lineNumber
        }))
    });

    // Generate search filter query
    const searchFilterQuery = searchFilter.query || '';

    // Get styles and scripts
    const styles = getWebviewStyles();
    const scriptParams: WebviewScriptParams = {
        nonce: getNonce(),
        graphData,
        searchFilterQuery
    };
    const script = getWebviewScript(scriptParams);

    return `
<body>
    <div id="app">
        <!-- Header -->
        <div class="header">
            <div class="header-left">
                <span class="header-icon">📊</span>
                <span class="header-title">SQL Workspace Dependencies</span>
                <span class="header-counts">(${graph.nodes.size} objects, ${graph.edges.length} relationships)</span>
            </div>
            <div class="header-right">
                <button class="icon-btn" id="btn-sidebar" title="Toggle Sidebar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>
                        <line x1="9" y1="3" x2="9" y2="21"/>
                    </svg>
                </button>
                <button class="icon-btn" id="btn-refresh" title="Refresh">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M23 4v6h-6"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                </button>
                <button class="icon-btn" id="btn-view-issues" title="View Issues">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                </button>
                <button class="icon-btn" id="btn-all-issues" title="All Issues">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
                        <line x1="14" y1="2" x2="14" y2="22"/>
                        <line x1="2" y1="6" x2="22" y2="6"/>
                        <line x1="2" y1="10" x2="22" y2="10"/>
                        <line x1="2" y1="14" x2="22" y2="14"/>
                        <line x1="2" y1="18" x2="22" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>

        <!-- Main Content Area -->
        <div class="content-area">
            <!-- Sidebar -->
            <div id="sidebar" class="sidebar">
                ${generateSidebarContent(graph, detailedStats, totalIssues)}
            </div>

            <!-- Graph Area -->
            <div class="graph-area">
                ${generateGraphArea(graph, searchFilter)}
            </div>
        </div>
    </div>

    ${script}
</body>
`;
}

/**
 * Generate sidebar content
 */
function generateSidebarContent(graph: WorkspaceDependencyGraph, detailedStats: DetailedStats, totalIssues: number): string {
    return `
        <div class="sidebar-header">
            <h3>Statistics</h3>
        </div>
        <div class="sidebar-stats">
            <div class="stat-item">
                <span class="stat-label">Total Objects</span>
                <span class="stat-value">${graph.nodes.size}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Relationships</span>
                <span class="stat-value">${graph.edges.length}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Orphaned</span>
                <span class="stat-value ${graph.stats.orphanedDefinitions.length > 0 ? 'stat-error' : ''}">${graph.stats.orphanedDefinitions.length}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Missing</span>
                <span class="stat-value ${graph.stats.missingDefinitions.length > 0 ? 'stat-error' : ''}">${graph.stats.missingDefinitions.length}</span>
            </div>
        </div>
    `;
}

/**
 * Generate graph area with SVG and search
 */
function generateGraphArea(graph: WorkspaceDependencyGraph, searchFilter: SearchFilter): string {
    return `
        <div class="graph-toolbar">
            <div class="search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                </svg>
                <input type="text" id="search-input" class="search-input" placeholder="Search nodes..." value="${escapeHtml(searchFilter.query)}">
                <button class="icon-btn" id="btn-clear-search" style="display: ${searchFilter.query ? 'flex' : 'none'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <select id="filter-type" class="search-select">
                <option value="all" ${searchFilter.nodeTypes === undefined ? 'selected' : ''}>All Types</option>
                <option value="file" ${searchFilter.nodeTypes?.includes('file') ? 'selected' : ''}>Files Only</option>
                <option value="table" ${searchFilter.nodeTypes?.includes('table') ? 'selected' : ''}>Tables Only</option>
                <option value="view" ${searchFilter.nodeTypes?.includes('view') ? 'selected' : ''}>Views Only</option>
                <option value="external" ${searchFilter.nodeTypes?.includes('external') ? 'selected' : ''}>External Only</option>
            </select>
            ${searchFilter.useRegex ? '<span class="regex-badge">Regex</span>' : ''}
            ${searchFilter.caseSensitive ? '<span class="case-badge">Aa</span>' : ''}
        </div>

        <div class="graph-container">
            <svg id="graph-svg" class="graph-svg">
                <g id="main-group">
                    ${generateSVGContent(graph)}
                </g>
            </svg>
        </div>

        <div id="tooltip" class="tooltip" style="display: none;"></div>
        <div id="context-menu" class="context-menu" style="display: none;"></div>
    `;
}

/**
 * Generate SVG content with nodes and edges
 */
function generateSVGContent(graph: WorkspaceDependencyGraph): string {
    let svgContent = '';
    
    // Generate edges first (so they appear behind nodes)
    for (const edge of graph.edges) {
        const sourceNode = graph.nodes.get(edge.sourceId);
        const targetNode = graph.nodes.get(edge.targetId);
        if (!sourceNode || !targetNode) continue;
        
        svgContent += generateEdge(edge, sourceNode, targetNode);
    }
    
    // Generate nodes
    for (const node of graph.nodes.values()) {
        svgContent += generateNode(node);
    }
    
    return svgContent;
}

/**
 * Generate SVG edge element
 */
function generateEdge(edge: any, sourceNode: WorkspaceNode, targetNode: WorkspaceNode): string {
    // Simple line edge (could be enhanced with bezier curves)
    const sourceX = sourceNode.x || 0;
    const sourceY = sourceNode.y || 0;
    const targetX = targetNode.x || 0;
    const targetY = targetNode.y || 0;
    
    return `<line class="edge" data-source-id="${escapeHtml(edge.sourceId)}" data-target-id="${escapeHtml(edge.targetId)}" 
            x1="${sourceX}" y1="${sourceY}" x2="${targetX}" y2="${targetY}" stroke="var(--border-color)" stroke-width="1"/>`;
}

/**
 * Generate SVG node element
 */
function generateNode(node: WorkspaceNode): string {
    const x = node.x || 0;
    const y = node.y || 0;
    const width = 160;
    const height = 60;
    const icon = getNodeIcon(node.type);
    
    return `
        <g class="node ${node.type}" 
           data-id="${escapeHtml(node.id)}" 
           data-label="${escapeHtml(node.label)}" 
           data-type="${node.type}" 
           data-filepath="${escapeHtml(node.filePath || '')}"
           transform="translate(${x - width/2}, ${y - height/2})">
            <rect class="node-bg" width="${width}" height="${height}" rx="8"/>
            <text x="10" y="25" class="node-icon">${icon}</text>
            <text x="40" y="35" class="node-label">${escapeHtml(truncateLabel(node.label, 18))}</text>
        </g>
    `;
}

/**
 * Get icon for node type
 */
function getNodeIcon(type: string): string {
    const icons: Record<string, string> = {
        'file': '📄',
        'table': '📊',
        'view': '👁️',
        'external': '🌐'
    };
    return icons[type] || '📦';
}

/**
 * Truncate label to fit in node
 */
function truncateLabel(label: string, maxLength: number): string {
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 3) + '...';
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generate nonce for CSP
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Export the main graph view HTML generator
 */
export function getGraphViewHtml(
    graph: WorkspaceDependencyGraph,
    searchFilter: SearchFilter,
    detailedStats: {
        orphanedDefinitions: any[];
        missingDefinitions: any[];
    }
): string {
    const totalIssues = graph.stats.orphanedDefinitions.length + graph.stats.missingDefinitions.length;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    ${generateHeadContent()}
</head>
<body>
    ${generateGraphBody({ graph, searchFilter, detailedStats, totalIssues })}
</body>
</html>`;
}

/**
 * Generate HTML head content
 */
function generateHeadContent(): string {
    const nonce = getNonce();
    
    return `
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Workspace Dependencies</title>
    <style>
        ${getWebviewStyles()}
    </style>
`;
}
