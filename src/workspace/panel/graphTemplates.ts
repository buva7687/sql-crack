import { ICONS } from '../../shared';
import {
    GraphMode,
    SearchFilter,
    WorkspaceDependencyGraph,
} from '../types';
import { WORKSPACE_EXPORT_OPTIONS } from '../exportUtils';
import { IndexStatus } from './types';

export interface GraphBodyHtmlOptions {
    graph: WorkspaceDependencyGraph;
    searchFilter: SearchFilter;
    totalIssues: number;
    script: string;
    currentGraphMode: GraphMode;
    isDarkTheme: boolean;
    indexStatus: IndexStatus;
    statsHtml: string;
    graphHtml: string;
    escapeHtml: (value: string) => string;
}

export interface StatsPanelHtmlOptions {
    escapeHtml: (value: string) => string;
}

export interface GraphAreaHtmlOptions {
    graph: WorkspaceDependencyGraph;
    searchFilter: SearchFilter;
    currentGraphMode: GraphMode;
    renderGraph: (graph: WorkspaceDependencyGraph) => string;
}

export function createGraphBodyHtml(options: GraphBodyHtmlOptions): string {
    const {
        graph,
        searchFilter,
        totalIssues,
        script,
        currentGraphMode,
        isDarkTheme,
        indexStatus,
        statsHtml,
        graphHtml,
        escapeHtml,
    } = options;

    const filesActive = currentGraphMode === 'files';
    const tablesActive = currentGraphMode === 'tables';
    const graphModeLabel = filesActive ? 'files' : 'tables';
    const graphModeContextTitle = filesActive
        ? 'Files Mode: Which SQL files depend on each other'
        : 'Tables Mode: Which tables and views feed into which';

    return `<body>
    <div id="app">
        <!-- Header -->
        <header class="header">
            <div class="header-left">
                <span class="header-icon header-icon-svg">${ICONS.table}</span>
                <h1 class="header-title">Workspace Dependencies</h1>
            </div>

            <!-- Header Center: View tabs (always in same position) and graph mode switcher (below when Graph active) -->
            <div class="header-center">
                <!-- View Mode Tabs -->
                <div class="view-tabs">
                    <button class="view-tab active" data-view="graph" 
                        title="Dependency Graph: Visual overview of workspace dependencies. Switch between Files and Tables modes to change what nodes represent."
                        aria-label="Dependency Graph: Visual overview of workspace dependencies. Switch between Files and Tables modes to change what nodes represent.">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/>
                            <path d="M14.5 9.5L17 7M9.5 14.5L7 17"/>
                        </svg>
                        Graph
                    </button>
                    <button class="view-tab" data-view="lineage" 
                        title="Data Lineage: Search for any table or view to trace its data flow. See upstream sources (where data comes from) and downstream consumers (where it's used)."
                        aria-label="Data Lineage: Search for any table or view to trace its data flow. See upstream sources (where data comes from) and downstream consumers (where it's used).">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 12h4l3 9 4-18 3 9h4"/>
                        </svg>
                        Lineage
                    </button>
                    <button class="view-tab" data-view="impact" 
                        title="Impact Analysis: Select a table/view and change type (MODIFY/RENAME/DROP/ADD COLUMN) to see all affected queries and dependencies. Plan safe schema changes."
                        aria-label="Impact Analysis: Select a table/view and change type (MODIFY/RENAME/DROP/ADD COLUMN) to see all affected queries and dependencies. Plan safe schema changes.">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        Impact
                    </button>
                </div>

                <!-- Graph mode switcher (visible only when Graph tab is active, appears below view tabs) -->
                <div id="graph-mode-switcher" class="graph-mode-switcher" 
                    title="Switch graph display mode: Files shows file-to-file dependencies, Tables shows table/view relationships."
                    aria-label="Graph mode switcher: Switch between Files and Tables display modes">
                    <button class="graph-mode-btn ${filesActive ? 'active' : ''}" data-mode="files" 
                        title="Files Mode: SQL files as nodes showing file-to-file dependencies. Best for understanding project structure and which files depend on tables from other files."
                        aria-label="Files Mode: SQL files as nodes showing file-to-file dependencies. Best for understanding project structure and which files depend on tables from other files.">Files</button>
                    <button class="graph-mode-btn ${tablesActive ? 'active' : ''}" data-mode="tables" 
                        title="Tables Mode: Tables and views as nodes showing table-to-table relationships. Best for understanding data model and how tables connect across your workspace."
                        aria-label="Tables Mode: Tables and views as nodes showing table-to-table relationships. Best for understanding data model and how tables connect across your workspace.">Tables</button>
                </div>
            </div>

            <div class="header-right">
                <div class="search-box">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input type="text" class="search-input" id="search-input" placeholder="${filesActive ? 'Search file names...' : 'Search table/view names...'}" value="${escapeHtml(searchFilter.query)}">
                    <button class="search-clear ${searchFilter.query ? 'visible' : ''}" id="btn-clear-search" title="Clear search">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                    <button class="search-nav-btn btn-disabled" id="btn-search-prev" title="Previous result (Shift+Enter)" aria-label="Previous search result" type="button">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                    </button>
                    <button class="search-nav-btn btn-disabled" id="btn-search-next" title="Next result (Enter)" aria-label="Next search result" type="button">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </button>
                    <span class="search-count" id="graph-search-count" aria-live="polite"></span>
                </div>
                <button class="icon-btn" id="btn-sidebar" title="Toggle panel" aria-label="Toggle sidebar panel">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M15 3v18"/>
                    </svg>
                </button>
                <button class="icon-btn" id="btn-theme" title="Toggle theme (${isDarkTheme ? 'Light' : 'Dark'})" aria-label="Toggle theme to ${isDarkTheme ? 'light' : 'dark'} mode">
                    ${isDarkTheme ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="5"/>
                        <line x1="12" y1="1" x2="12" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="23"/>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                        <line x1="1" y1="12" x2="3" y2="12"/>
                        <line x1="21" y1="12" x2="23" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>` : `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>`}
                </button>
                <button class="icon-btn" id="btn-refresh" title="Refresh" aria-label="Refresh workspace data">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                </button>
            </div>
        </header>

        <div class="graph-context-strip" id="graph-context-strip">
            <div class="graph-context-copy">
                <div class="graph-context-title" id="graph-context-title">${escapeHtml(graphModeContextTitle)}</div>
            </div>
            <div class="graph-context-state">
                <div class="graph-state-chips" id="graph-state-chips">
                    <span class="graph-state-chip graph-state-chip-fixed">Mode: ${graphModeLabel}</span>
                </div>
                <div class="graph-state-reason" id="graph-state-reason">Showing full graph for current mode.</div>
            </div>
        </div>
        <div class="graph-explain-panel is-hidden" id="graph-explain-panel" aria-hidden="true">
            <div class="graph-explain-title">Why am I seeing this graph?</div>
            <div class="graph-explain-body">
                <div>Graph is a navigation surface: map dependencies here, then use Lineage/Impact for deeper analysis.</div>
                <div>Files mode: which SQL files depend on each other.</div>
                <div>Tables mode: which tables/views feed into which.</div>
                <div>If graph looks reduced, check state chips for active search/focus/trace filters.</div>
            </div>
            <div class="graph-explain-actions">
                <button class="action-chip action-chip-small" data-graph-action="focus-search">Try search</button>
                <button class="action-chip action-chip-small" data-graph-action="dismiss-why">Got it</button>
            </div>
        </div>

        <!-- Stats Bar -->
        <div class="stats-bar">
            <span class="stat"><span class="stat-value">${graph.stats.totalFiles}</span> files</span>
            <span class="separator">•</span>
            <span class="stat"><span class="stat-value">${graph.stats.totalTables}</span> tables</span>
            <span class="separator">•</span>
            <span class="stat"><span class="stat-value">${graph.stats.totalViews}</span> views</span>
            <span class="separator">•</span>
            <span class="stat"><span class="stat-value">${graph.stats.totalReferences}</span> references</span>
            <span class="stats-spacer"></span>
            <button class="index-status index-status-${indexStatus.level}" data-graph-action="refresh" title="${escapeHtml(indexStatus.title)}">
                <span class="status-dot"></span>
                <span class="status-text">${escapeHtml(indexStatus.text)}</span>
            </button>
        </div>
        <!-- Issue Banner -->
        ${totalIssues > 0 ? `
        <div class="issue-banner warning">
            <svg class="issue-banner-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span class="issue-banner-text">
                <strong>Graph may be partial (${totalIssues} issue${totalIssues !== 1 ? 's' : ''}):</strong>
                ${[
                    graph.stats.orphanedDefinitions.length > 0 ? `${graph.stats.orphanedDefinitions.length} orphaned` : '',
                    graph.stats.missingDefinitions.length > 0 ? `${graph.stats.missingDefinitions.length} missing` : '',
                    graph.stats.parseErrors > 0 ? `${graph.stats.parseErrors} unparseable` : ''
                ].filter(Boolean).join(', ')}
            </span>
            <button class="issue-banner-btn" id="btn-view-issues">View Details →</button>
        </div>
        ` : ''}

        <!-- Main Layout -->
        <div class="main-layout">
            <!-- Graph Area -->
            <div class="graph-area-container">
                <div class="graph-area" id="graph-area">
                    ${graphHtml}
                </div>
            </div>

            <!-- Sidebar -->
            <aside class="sidebar" id="sidebar">
                ${statsHtml}
            </aside>

            <!-- Lineage Panel (overlays graph) -->
            <div id="lineage-panel" class="lineage-panel">
                <div class="lineage-header">
                    <button class="lineage-back-btn" id="lineage-back-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back to Graph
                    </button>
                    <h2 id="lineage-title">Data Lineage</h2>
                </div>
                <div id="workspace-breadcrumb" class="workspace-breadcrumb" style="display: none;"></div>
                <div class="lineage-content" id="lineage-content">
                    <!-- Dynamic lineage content will be inserted here -->
                </div>
            </div>
        </div>

        <div id="tooltip" class="tooltip" style="display: none;"></div>

        <!-- Context Menu -->
        <div id="context-menu" class="context-menu">
            <div class="context-menu-item" data-action="showUpstream">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
                Show Upstream
            </div>
            <div class="context-menu-item" data-action="showDownstream">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>
                Show Downstream
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" data-action="copyName">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy Name
            </div>
            <div class="context-menu-item" data-action="copyFilePath">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                Copy File Path
            </div>
            <div class="context-menu-item" data-action="copyConnections">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                </svg>
                Copy Connections
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" data-action="openFile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                Open File
            </div>
            <div class="context-menu-item" data-action="visualize">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/>
                    <path d="M14.5 9.5L17 7M9.5 14.5L7 17"/>
                </svg>
                Visualize Dependencies
            </div>
            <div class="context-menu-item" data-action="exportLineage">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export Node's Lineage
            </div>
        </div>
    </div>

    ${script}
</body>`;
}

export function createStatsPanelHtml(options: StatsPanelHtmlOptions): string {
    const { escapeHtml } = options;
    const exportOptionsHtml = WORKSPACE_EXPORT_OPTIONS.map((option) => `
            <button class="export-option ${option.group === 'advanced' ? 'export-option-advanced' : ''}" data-format="${option.format}">
                ${escapeHtml(option.label)}
            </button>
        `).join('');

    return `
        <div class="sidebar-header">
            <span class="sidebar-title">Panel</span>
            <button class="sidebar-close" id="btn-sidebar-close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>
        <div class="sidebar-content">
            <!-- Selection Section (Graph tab only) -->
            <div class="sidebar-section" data-sidebar-section="selection" id="selection-section">
                <div class="section-header expanded" data-section="selection">
                    <span class="section-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
                        </svg>
                        Selection
                    </span>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div id="selection-empty" class="selection-empty">Click a node or edge to see details and paths.</div>
                    <div id="selection-details" class="selection-details" style="display: none;">
                        <div class="selection-title" id="selection-title">—</div>
                        <div class="selection-meta" id="selection-meta">—</div>
                        <div class="selection-file" id="selection-file" style="display: none;"></div>
                        <div class="selection-path">
                            <div class="selection-path-row">
                                <span class="path-label">Upstream</span>
                                <span class="path-value" id="selection-upstream">—</span>
                            </div>
                            <div class="selection-path-row">
                                <span class="path-label">Downstream</span>
                                <span class="path-value" id="selection-downstream">—</span>
                            </div>
                        </div>
                        <div class="selection-actions">
                            <button class="action-chip action-chip-small btn-disabled" id="graph-context-focus" data-graph-action="focus-selection" aria-disabled="true">Focus neighbors</button>
                            <button class="action-chip action-chip-small btn-disabled" id="graph-context-trace-up" data-graph-action="trace-upstream" aria-disabled="true">Trace upstream</button>
                            <button class="action-chip action-chip-small btn-disabled" id="graph-context-trace-down" data-graph-action="trace-downstream" aria-disabled="true">Trace downstream</button>
                            <button class="action-chip action-chip-small" id="graph-context-clear-state" data-graph-action="clear-graph-state">Clear graph state</button>
                        </div>
                        <div class="selection-divider"></div>
                        <div class="selection-actions-label">Path finder</div>
                        <div class="selection-path-summary" id="selection-path-summary">Set a start and end node, then show the shortest path.</div>
                        <div class="selection-path-targets">
                            <div class="selection-path-target" id="selection-path-start-label">Start: —</div>
                            <div class="selection-path-target" id="selection-path-end-label">End: —</div>
                        </div>
                        <div class="selection-actions">
                            <button class="action-chip action-chip-small btn-disabled" id="graph-path-set-start" data-graph-action="path-set-start" aria-disabled="true">Set as start</button>
                            <button class="action-chip action-chip-small btn-disabled" id="graph-path-set-end" data-graph-action="path-set-end" aria-disabled="true">Set as end</button>
                            <button class="action-chip action-chip-small btn-disabled" id="graph-path-show" data-graph-action="path-show" aria-disabled="true">Show path</button>
                            <button class="action-chip action-chip-small btn-disabled" id="graph-path-clear" data-graph-action="path-clear" aria-disabled="true">Clear path</button>
                        </div>
                        <div class="selection-cross-links" id="selection-cross-links" style="display: none;">
                            <div class="selection-divider"></div>
                            <div class="selection-actions-label">Actions</div>
                            <div class="selection-actions">
                                <button class="action-chip action-chip-small" data-graph-action="view-lineage">Trace in Lineage</button>
                                <button class="action-chip action-chip-small" data-graph-action="analyze-impact">Analyze in Impact</button>
                                <button class="action-chip action-chip-small" data-graph-action="show-file-tables" style="display: none;">Show tables in file</button>
                                <button class="action-chip action-chip-small" data-graph-action="open-file">Open file</button>
                            </div>
                        </div>
                    </div>
                    <div id="selection-edge-details" class="selection-details" style="display: none;">
                        <div class="selection-title" id="selection-edge-title">—</div>
                        <div class="selection-meta" id="selection-edge-meta">—</div>
                        <div class="selection-file" id="selection-edge-why">—</div>
                        <div class="selection-path" id="selection-edge-refs"></div>
                        <div class="selection-actions">
                            <button class="action-chip action-chip-small btn-disabled" id="selection-edge-open-ref" data-graph-action="open-edge-reference" aria-disabled="true">Open first reference</button>
                            <button class="action-chip action-chip-small" data-graph-action="clear-selection">Clear selection</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Export Section (Graph tab only) -->
            <div class="sidebar-section" data-sidebar-section="export">
                <div class="section-header" data-section="export">
                    <span class="section-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Export
                    </span>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content">
                    <div class="export-dropdown">
                        <button class="export-trigger" id="workspace-export-trigger" aria-expanded="false">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Export as...
                        </button>
                        <div class="export-menu" id="workspace-export-menu" style="display: none;">
                            ${exportOptionsHtml}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
}

export function createGraphAreaHtml(options: GraphAreaHtmlOptions): string {
    const { graph, searchFilter, currentGraphMode, renderGraph } = options;
    const filesActive = currentGraphMode === 'files';

    return `
        <div id="graph-container" style="width: 100%; height: 100%; position: relative;">
            ${graph.nodes.length > 0 ? `
                ${renderGraph(graph)}
                <div class="graph-empty-overlay is-hidden" id="graph-empty-overlay" aria-hidden="true">
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                        </svg>
                        <div class="empty-state-title" id="graph-empty-title">Workspace dependencies at a glance</div>
                        <div class="empty-state-desc" id="graph-empty-desc">This graph shows how your SQL files, tables, and views connect across the workspace.</div>
                        <div class="empty-state-actions" id="graph-empty-actions">
                            <button class="action-chip" data-graph-action="focus-search">Search for a table</button>
                            <button class="action-chip" data-graph-action="switch-graph-mode" data-mode="tables">Show tables</button>
                            <button class="action-chip" data-graph-action="switch-graph-mode" data-mode="files">Show files</button>
                            <button class="action-chip" data-graph-action="why-this-graph">Why am I seeing this?</button>
                            <button class="action-chip" data-graph-action="view-issues">View issues</button>
                            <button class="action-chip" data-graph-action="refresh">Refresh index</button>
                            <button class="action-chip" data-graph-action="dismiss-welcome">Dismiss</button>
                        </div>
                    </div>
                </div>
            ` : `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                </svg>
                <div class="empty-state-title">${searchFilter.query || (searchFilter.nodeTypes && searchFilter.nodeTypes.length > 0) ? (filesActive ? 'No files match this search' : 'No tables/views match this search') : 'Workspace dependencies at a glance'}</div>
                <div class="empty-state-desc">
                    ${searchFilter.query || (searchFilter.nodeTypes && searchFilter.nodeTypes.length > 0)
                        ? 'Try clearing filters or changing your search terms.'
                        : 'This graph shows how your SQL files, tables, and views connect across the workspace.'}
                </div>
                <div class="empty-state-actions">
                    ${searchFilter.query || (searchFilter.nodeTypes && searchFilter.nodeTypes.length > 0) ? `
                        <button class="action-chip" data-graph-action="clear-search">Clear search</button>
                        <button class="action-chip" data-graph-action="focus-search">Search again</button>
                    ` : `
                        <button class="action-chip" data-graph-action="focus-search">Search for a table</button>
                        <button class="action-chip" data-graph-action="switch-graph-mode" data-mode="tables">Show tables</button>
                        <button class="action-chip" data-graph-action="switch-graph-mode" data-mode="files">Show files</button>
                        <button class="action-chip" data-graph-action="why-this-graph">Why am I seeing this?</button>
                        <button class="action-chip" data-graph-action="view-issues">View issues</button>
                        <button class="action-chip" data-graph-action="refresh">Refresh index</button>
                    `}
                </div>
            </div>
            `}
        </div>

        <!-- Zoom Toolbar -->
        <div class="zoom-toolbar" role="toolbar" aria-label="Graph zoom controls">
            <button class="zoom-btn" id="btn-zoom-out" title="Zoom out" aria-label="Zoom out">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="zoom-btn" id="btn-zoom-in" title="Zoom in" aria-label="Zoom in">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <div class="zoom-divider"></div>
            <span class="zoom-level" id="zoom-level" aria-live="polite">100%</span>
            <div class="zoom-divider"></div>
            <button class="zoom-btn" id="btn-zoom-reset" title="Reset view" aria-label="Reset zoom to default">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
            </button>
            <button class="zoom-btn" id="btn-zoom-fit" title="Fit to screen" aria-label="Fit graph to screen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            </button>
        </div>

        <!-- Bottom Legend Bar (includes keyboard shortcuts) -->
        <div class="workspace-legend-bar" id="workspace-legend-bar" role="complementary" aria-label="Workspace graph legend" aria-hidden="false">
            <div class="legend-scroll">
                <div class="legend-inline-group">
                    <span class="legend-inline-item" data-node-kind="file"><span class="legend-inline-node file"></span><span>SQL Files</span></span>
                    <span class="legend-inline-item" data-node-kind="table"><span class="legend-inline-node table"></span><span>Tables</span></span>
                    <span class="legend-inline-item" data-node-kind="view"><span class="legend-inline-node view"></span><span>Views</span></span>
                    <span class="legend-inline-item" data-node-kind="external"><span class="legend-inline-node external"></span><span>External</span></span>
                </div>
                <span class="legend-divider"></span>
                <div class="legend-inline-group">
                    <span class="legend-inline-item"><span class="legend-inline-edge select"></span><span>SELECT</span></span>
                    <span class="legend-inline-item"><span class="legend-inline-edge join"></span><span>JOIN</span></span>
                    <span class="legend-inline-item"><span class="legend-inline-edge insert"></span><span>INSERT</span></span>
                    <span class="legend-inline-item"><span class="legend-inline-edge update"></span><span>UPDATE</span></span>
                    <span class="legend-inline-item"><span class="legend-inline-edge delete"></span><span>DELETE</span></span>
                </div>
                <span class="legend-divider"></span>
                <div class="legend-inline-group legend-shortcuts-group">
                    <button class="legend-shortcuts-toggle" id="legend-shortcuts-toggle" type="button" aria-expanded="false" title="Show keyboard shortcuts">Shortcuts ▸</button>
                    <div class="legend-shortcuts-panel" id="legend-shortcuts-panel" style="display: none;">
                        <span class="hint-item"><kbd>Scroll</kbd><span>Zoom</span></span>
                        <span class="hint-item"><kbd>Drag</kbd><span>Pan</span></span>
                        <span class="hint-item"><kbd>Click</kbd><span>Node/Edge</span></span>
                        <span class="hint-item"><kbd>Right-click</kbd><span>Menu</span></span>
                        <span class="hint-item"><kbd>F</kbd><span>Focus</span></span>
                        <span class="hint-item"><kbd>U</kbd><span>Upstream</span></span>
                        <span class="hint-item"><kbd>D</kbd><span>Downstream</span></span>
                        <span class="hint-item"><kbd>R</kbd><span>Reset view</span></span>
                        <span class="hint-item"><kbd>L</kbd><span>Legend</span></span>
                        <span class="hint-item"><kbd>?</kbd><span>Shortcuts</span></span>
                        <span class="hint-item"><kbd>Tab</kbd><span>Cycle</span></span>
                        <span class="hint-item"><kbd>↑↓←→</kbd><span>Navigate</span></span>
                        <span class="hint-item"><kbd>Ctrl+F</kbd><span>Search</span></span>
                        <span class="hint-item"><kbd>Esc</kbd><span>Clear</span></span>
                        <span class="hint-item"><kbd>Enter</kbd><span>Open file</span></span>
                    </div>
                </div>
            </div>
            <button class="legend-dismiss" id="workspace-legend-dismiss" title="Dismiss legend (L)" aria-label="Dismiss workspace legend">×</button>
        </div>`;
}
