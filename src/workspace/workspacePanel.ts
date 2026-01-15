// Workspace Panel - VS Code webview panel for workspace dependency visualization

import * as vscode from 'vscode';
import * as path from 'path';
import { IndexManager } from './indexManager';
import { buildDependencyGraph } from './dependencyGraph';
import {
    WorkspaceDependencyGraph,
    GraphMode,
    WorkspaceNode,
    SearchFilter,
    SearchResult,
    DetailedWorkspaceStats,
    DefinitionDetail,
    MissingDefinitionDetail
} from './types';
import { SqlDialect } from '../webview/types/parser';

const AUTO_INDEX_THRESHOLD = 50;

/**
 * Manages the workspace dependency visualization webview panel
 */
export class WorkspacePanel {
    public static currentPanel: WorkspacePanel | undefined;
    public static readonly viewType = 'sqlCrackWorkspace';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _indexManager: IndexManager;
    private _currentGraph: WorkspaceDependencyGraph | null = null;
    private _currentMode: GraphMode = 'files';
    private _currentSearchFilter: SearchFilter = {
        query: '',
        nodeTypes: undefined,
        useRegex: false,
        caseSensitive: false
    };
    private _detailedStats: DetailedWorkspaceStats | null = null;

    /**
     * Create or show the workspace panel
     */
    public static async createOrShow(
        extensionUri: vscode.Uri,
        context: vscode.ExtensionContext,
        dialect: SqlDialect = 'MySQL'
    ): Promise<void> {
        const column = vscode.ViewColumn.Beside;

        // If panel exists, reveal it
        if (WorkspacePanel.currentPanel) {
            WorkspacePanel.currentPanel._panel.reveal(column);
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            WorkspacePanel.viewType,
            'SQL Workspace Dependencies',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist')
                ]
            }
        );

        WorkspacePanel.currentPanel = new WorkspacePanel(panel, extensionUri, context, dialect);
        await WorkspacePanel.currentPanel.initialize();
    }

    /**
     * Private constructor
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        context: vscode.ExtensionContext,
        dialect: SqlDialect
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._indexManager = new IndexManager(context, dialect);

        // Handle panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this._disposables
        );

        // Listen for index updates
        this._indexManager.setOnIndexUpdated(() => {
            this.rebuildAndRenderGraph();
        });
    }

    /**
     * Initialize the panel
     */
    private async initialize(): Promise<void> {
        // Show loading state
        this._panel.webview.html = this.getLoadingHtml();

        // Initialize index manager
        const { autoIndexed, fileCount } = await this._indexManager.initialize(AUTO_INDEX_THRESHOLD);

        if (fileCount === 0) {
            this._panel.webview.html = this.getEmptyWorkspaceHtml();
            return;
        }

        if (!autoIndexed && fileCount >= AUTO_INDEX_THRESHOLD) {
            // Large workspace - ask user to confirm indexing
            const result = await vscode.window.showInformationMessage(
                `Found ${fileCount} SQL files in workspace. Index them now?`,
                'Index Now',
                'Cancel'
            );

            if (result === 'Index Now') {
                await this.buildIndexWithProgress();
            } else {
                this._panel.webview.html = this.getManualIndexHtml(fileCount);
                return;
            }
        }

        // Build and render graph
        await this.rebuildAndRenderGraph();
    }

    /**
     * Build index with progress indicator
     */
    private async buildIndexWithProgress(): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Indexing SQL Workspace',
                cancellable: false
            },
            async (progress) => {
                await this._indexManager.buildIndex((current, total, fileName) => {
                    progress.report({
                        message: `${current}/${total}: ${fileName}`,
                        increment: (1 / total) * 100
                    });
                });
            }
        );
    }

    /**
     * Rebuild and render the dependency graph
     */
    private async rebuildAndRenderGraph(): Promise<void> {
        const index = this._indexManager.getIndex();
        if (!index) {
            this._panel.webview.html = this.getErrorHtml('No index available. Try refreshing.');
            return;
        }

        this._currentGraph = buildDependencyGraph(index, this._currentMode);
        this._panel.webview.html = this.getWebviewHtml(this._currentGraph, this._currentSearchFilter);
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'changeMode':
                this._currentMode = message.mode as GraphMode;
                await this.rebuildAndRenderGraph();
                break;

            case 'refresh':
                await this.buildIndexWithProgress();
                await this.rebuildAndRenderGraph();
                break;

            case 'search':
                this._currentSearchFilter = message.filter as SearchFilter;
                this._panel.webview.html = this.getWebviewHtml(this._currentGraph!, this._currentSearchFilter);
                break;

            case 'clearSearch':
                this._currentSearchFilter = {
                    query: '',
                    nodeTypes: undefined,
                    useRegex: false,
                    caseSensitive: false
                };
                this._panel.webview.html = this.getWebviewHtml(this._currentGraph!, this._currentSearchFilter);
                break;

            case 'openFile':
                try {
                    const uri = vscode.Uri.file(message.filePath);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                } catch (error) {
                    vscode.window.showErrorMessage(`Could not open file: ${message.filePath}`);
                }
                break;

            case 'openFileAtLine':
                try {
                    const fileUri = vscode.Uri.file(message.filePath);
                    const document = await vscode.workspace.openTextDocument(fileUri);
                    const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
                    const position = new vscode.Position(Math.max(0, message.line - 1), 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(
                        new vscode.Range(position, position),
                        vscode.TextEditorRevealType.InCenter
                    );
                } catch (error) {
                    vscode.window.showErrorMessage(`Could not open file: ${message.filePath}`);
                }
                break;

            case 'visualizeFile':
                try {
                    const uri = vscode.Uri.file(message.filePath);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                    await vscode.commands.executeCommand('sql-crack.visualize');
                } catch (error) {
                    vscode.window.showErrorMessage(`Could not visualize file: ${message.filePath}`);
                }
                break;
        }
    }

    /**
     * Get webview HTML with graph data and search functionality
     */
    private getWebviewHtml(graph: WorkspaceDependencyGraph, searchFilter: SearchFilter = { query: '', nodeTypes: undefined, useRegex: false, caseSensitive: false }): string {
        const nonce = getNonce();

        // Generate detailed stats data for expandable sections
        const detailedStats = this.generateDetailedStats(graph);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Workspace Dependencies</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html {
            width: 100%; height: 100vh; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f172a; color: #e2e8f0;
        }
        #app { width: 100%; height: 100%; display: flex; flex-direction: column; }

        /* Toolbar */
        .toolbar {
            display: flex; align-items: center; gap: 8px; padding: 8px 12px;
            background: #1e293b; border-bottom: 1px solid #334155;
            flex-wrap: wrap;
        }
        .toolbar-title { font-weight: 600; font-size: 13px; color: #f1f5f9; margin-right: 8px; }
        .toolbar-separator { width: 1px; height: 20px; background: #475569; margin: 0 4px; }
        .toolbar-btn {
            display: flex; align-items: center; gap: 4px; padding: 5px 10px;
            background: #334155; border: none; border-radius: 5px;
            color: #e2e8f0; font-size: 11px; cursor: pointer;
            transition: background 0.15s;
        }
        .toolbar-btn:hover { background: #475569; }
        .toolbar-btn.active { background: #6366f1; }
        .toolbar-btn svg { width: 12px; height: 12px; }

        /* Search Box */
        .search-container {
            display: flex; align-items: center; gap: 6px; margin-left: auto;
            background: #0f172a; padding: 4px 8px; border-radius: 6px; border: 1px solid #334155;
        }
        .search-input {
            background: transparent; border: none; color: #e2e8f0;
            font-size: 11px; width: 150px; outline: none;
        }
        .search-input::placeholder { color: #64748b; }
        .search-input:focus { width: 200px; }
        .search-filter-select {
            background: #1e293b; border: 1px solid #334155; color: #e2e8f0;
            font-size: 10px; padding: 3px 6px; border-radius: 4px; outline: none; cursor: pointer;
        }
        .search-filter-select:hover { border-color: #475569; }
        .search-options {
            display: flex; gap: 4px; align-items: center;
        }
        .search-option {
            background: transparent; border: 1px solid #334155; color: #94a3b8;
            font-size: 9px; padding: 2px 6px; border-radius: 3px; cursor: pointer;
        }
        .search-option.active { background: #6366f1; border-color: #6366f1; color: #fff; }
        .search-clear {
            background: transparent; border: none; color: #64748b;
            cursor: pointer; padding: 2px; display: none;
        }
        .search-clear:hover { color: #f87171; }
        .search-clear.visible { display: block; }

        /* Stats Panel */
        .stats-panel {
            display: flex; gap: 12px; padding: 6px 12px;
            background: #1e293b; border-bottom: 1px solid #334155;
            font-size: 11px; flex-wrap: wrap;
        }
        .stat-item {
            display: flex; align-items: center; gap: 4px; padding: 3px 8px;
            background: #0f172a; border-radius: 4px; border: 1px solid #334155;
            cursor: default;
        }
        .stat-item.clickable { cursor: pointer; }
        .stat-item.clickable:hover { border-color: #475569; }
        .stat-value { font-weight: 600; color: #f1f5f9; font-size: 12px; }
        .stat-label { color: #94a3b8; }
        .stat-warning { color: #fbbf24; }
        .stat-error { color: #f87171; }
        .stat-expand { margin-left: 2px; color: #64748b; font-size: 9px; transition: transform 0.2s; }
        .stat-item.expanded .stat-expand { transform: rotate(180deg); }

        /* Expandable Details Panel */
        .details-panel {
            max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out;
            background: #0f172a; border-bottom: 1px solid #334155;
        }
        .details-panel.expanded { max-height: 300px; overflow-y: auto; }
        .details-section { padding: 8px 12px; border-bottom: 1px solid #1e293b; }
        .details-section:last-child { border-bottom: none; }
        .details-title {
            font-size: 11px; font-weight: 600; color: #fbbf24; margin-bottom: 6px;
            display: flex; align-items: center; gap: 6px;
        }
        .details-title.error { color: #f87171; }
        .details-list { display: flex; flex-direction: column; gap: 2px; }
        .details-item {
            display: flex; align-items: center; gap: 8px; padding: 4px 6px;
            background: #1e293b; border-radius: 3px; font-size: 10px;
        }
        .details-item:hover { background: #334155; }
        .details-item-type {
            padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;
        }
        .details-item-type.table { background: #10b981; color: #fff; }
        .details-item-type.view { background: #8b5cf6; color: #fff; }
        .details-item-path { color: #94a3b8; flex: 1; }
        .details-item-line { color: #64748b; font-size: 9px; }

        /* Search Results */
        .search-results-info {
            padding: 4px 12px; background: #1e293b; border-bottom: 1px solid #334155;
            font-size: 10px; color: #94a3b8; display: none;
        }
        .search-results-info.visible { display: block; }

        /* SVG Container */
        #graph-container { flex: 1; overflow: hidden; position: relative; }
        #graph-svg { width: 100%; height: 100%; cursor: grab; }
        #graph-svg:active { cursor: grabbing; }

        /* Node Styles */
        .node { cursor: pointer; transition: opacity 0.2s; }
        .node:hover rect { filter: brightness(1.1); }
        .node.dimmed { opacity: 0.2; }
        .node-file rect { fill: #3b82f6; stroke: #60a5fa; stroke-width: 2; rx: 8; }
        .node-table rect { fill: #10b981; stroke: #34d399; stroke-width: 2; rx: 8; }
        .node-view rect { fill: #8b5cf6; stroke: #a78bfa; stroke-width: 2; rx: 8; }
        .node-external rect { fill: #475569; stroke: #64748b; stroke-width: 2; stroke-dasharray: 5,3; rx: 8; }
        .node-label { fill: #fff; font-size: 12px; font-weight: 600; }
        .node-sublabel { fill: rgba(255,255,255,0.7); font-size: 10px; }

        /* Edge Styles */
        .edge { fill: none; stroke-width: 2; }
        .edge-select { stroke: #64748b; }
        .edge-join { stroke: #a78bfa; }
        .edge-insert { stroke: #10b981; }
        .edge-update { stroke: #fbbf24; }
        .edge-delete { stroke: #f87171; }
        .edge-label { fill: #94a3b8; font-size: 10px; }

        /* Tooltip */
        .tooltip {
            position: absolute; padding: 8px 12px; background: #1e293b;
            border: 1px solid #475569; border-radius: 6px; font-size: 12px;
            pointer-events: none; z-index: 1000; max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .tooltip-title { font-weight: 600; margin-bottom: 4px; color: #f1f5f9; }
        .tooltip-content { color: #94a3b8; }
        .tooltip-list { margin-top: 6px; padding-left: 12px; }
        .tooltip-list li { margin: 2px 0; }

        /* Empty State */
        .empty-state {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 100%; gap: 16px; color: #94a3b8;
        }
        .empty-state svg { width: 64px; height: 64px; opacity: 0.5; }
        .empty-state-title { font-size: 18px; font-weight: 600; color: #e2e8f0; }

        /* Highlight */
        .highlight { fill: #fbbf24 !important; stroke: #fbbf24 !important; }

        /* Legend Popover */
        .legend-popover {
            position: absolute; top: 50px; right: 12px;
            background: #1e293b; border: 1px solid #475569; border-radius: 8px;
            padding: 12px 16px; min-width: 220px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            z-index: 100; display: none;
        }
        .legend-popover.visible { display: block; }
        .legend-title {
            font-size: 12px; font-weight: 600; color: #f1f5f9; margin-bottom: 10px;
            display: flex; align-items: center; gap: 6px;
        }
        .legend-section { margin-bottom: 12px; }
        .legend-section:last-child { margin-bottom: 0; }
        .legend-section-title {
            font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase;
            letter-spacing: 0.5px; margin-bottom: 6px;
        }
        .legend-item {
            display: flex; align-items: center; gap: 8px; padding: 4px 0;
            font-size: 11px; color: #e2e8f0;
        }
        .legend-color {
            width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0;
            border: 2px solid;
        }
        .legend-color.node-file { background: #3b82f6; border-color: #60a5fa; }
        .legend-color.node-table { background: #10b981; border-color: #34d399; }
        .legend-color.node-view { background: #8b5cf6; border-color: #a78bfa; }
        .legend-color.node-external { background: #475569; border-color: #64748b; }
        .legend-edge {
            width: 24px; height: 3px; border-radius: 2px; flex-shrink: 0;
        }
        .legend-edge.edge-select { background: #64748b; }
        .legend-edge.edge-join { background: #a78bfa; }
        .legend-edge.edge-insert { background: #10b981; }
        .legend-edge.edge-update { background: #fbbf24; }
        .legend-edge.edge-delete { background: #f87171; }
        .legend-hint {
            margin-top: 10px; padding-top: 10px; border-top: 1px solid #334155;
            font-size: 10px; color: #94a3b8; line-height: 1.4;
        }
        .legend-hint kbd {
            background: #0f172a; border: 1px solid #475569; border-radius: 3px;
            padding: 1px 4px; font-family: monospace; font-size: 9px;
        }
    </style>
</head>
<body>
    <div id="app">
        <div class="toolbar">
            <span class="toolbar-title">Workspace Dependencies</span>
            <div class="toolbar-separator"></div>
            <button class="toolbar-btn ${this._currentMode === 'files' ? 'active' : ''}" id="btn-files">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                Files
            </button>
            <button class="toolbar-btn ${this._currentMode === 'tables' ? 'active' : ''}" id="btn-tables">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                Tables
            </button>
            <button class="toolbar-btn ${this._currentMode === 'hybrid' ? 'active' : ''}" id="btn-hybrid">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                Hybrid
            </button>
            <div class="toolbar-separator"></div>
            <button class="toolbar-btn" id="btn-refresh">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                Refresh
            </button>

            <div class="toolbar-separator"></div>
            <button class="toolbar-btn" id="btn-legend" title="Show color legend">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                Legend
            </button>

            <div class="search-container">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input type="text" class="search-input" id="search-input" placeholder="Search nodes..." value="${this.escapeHtml(searchFilter.query)}">
                <select class="search-filter-select" id="filter-type">
                    <option value="all">All Types</option>
                    <option value="file" ${searchFilter.nodeTypes?.includes('file') ? 'selected' : ''}>Files</option>
                    <option value="table" ${searchFilter.nodeTypes?.includes('table') ? 'selected' : ''}>Tables</option>
                    <option value="view" ${searchFilter.nodeTypes?.includes('view') ? 'selected' : ''}>Views</option>
                    <option value="external" ${searchFilter.nodeTypes?.includes('external') ? 'selected' : ''}>External</option>
                </select>
                <div class="search-options">
                    <button class="search-option ${searchFilter.useRegex ? 'active' : ''}" id="btn-regex" title="Regex">.*</button>
                    <button class="search-option ${searchFilter.caseSensitive ? 'active' : ''}" id="btn-case" title="Case Sensitive">Aa</button>
                </div>
                <button class="search-clear ${searchFilter.query ? 'visible' : ''}" id="btn-clear-search" title="Clear">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
        </div>

        <!-- Legend Popover -->
        <div class="legend-popover" id="legend-popover">
            <div class="legend-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                </svg>
                Color Legend
            </div>
            <div class="legend-section">
                <div class="legend-section-title">Node Types</div>
                <div class="legend-item">
                    <div class="legend-color node-file"></div>
                    <span>Files (SQL documents)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color node-table"></div>
                    <span>Tables (CREATE TABLE)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color node-view"></div>
                    <span>Views (CREATE VIEW)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color node-external"></div>
                    <span>External (referenced but not defined)</span>
                </div>
            </div>
            <div class="legend-section">
                <div class="legend-section-title">Edge Types (References)</div>
                <div class="legend-item">
                    <div class="legend-edge edge-select"></div>
                    <span>SELECT (read from)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-edge edge-join"></div>
                    <span>JOIN (table join)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-edge edge-insert"></div>
                    <span>INSERT (write to)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-edge edge-update"></div>
                    <span>UPDATE (modify)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-edge edge-delete"></div>
                    <span>DELETE (remove)</span>
                </div>
            </div>
            <div class="legend-hint">
                <kbd>Click</kbd> node to open file • <kbd>Double-click</kbd> to visualize<br>
                <kbd>Ctrl+F</kbd> to search • <kbd>Drag</kbd> to pan • <kbd>Scroll</kbd> to zoom
            </div>
        </div>

        <div class="stats-panel">
            <div class="stat-item"><span class="stat-value">${graph.stats.totalFiles}</span><span class="stat-label">files</span></div>
            <div class="stat-item"><span class="stat-value">${graph.stats.totalTables}</span><span class="stat-label">tables</span></div>
            <div class="stat-item"><span class="stat-value">${graph.stats.totalViews}</span><span class="stat-label">views</span></div>
            <div class="stat-item"><span class="stat-value">${graph.stats.totalReferences}</span><span class="stat-label">references</span></div>
            ${graph.stats.orphanedDefinitions.length > 0 ? `<div class="stat-item clickable stat-warning" id="stat-orphaned"><span class="stat-value">${graph.stats.orphanedDefinitions.length}</span><span class="stat-label">orphaned</span><span class="stat-expand">▼</span></div>` : ''}
            ${graph.stats.missingDefinitions.length > 0 ? `<div class="stat-item clickable stat-error" id="stat-missing"><span class="stat-value">${graph.stats.missingDefinitions.length}</span><span class="stat-label">missing</span><span class="stat-expand">▼</span></div>` : ''}
        </div>

        <div class="details-panel" id="details-panel">
            ${graph.stats.orphanedDefinitions.length > 0 ? this.renderOrphanedDetails(detailedStats.orphanedDetails) : ''}
            ${graph.stats.missingDefinitions.length > 0 ? this.renderMissingDetails(detailedStats.missingDetails) : ''}
        </div>

        <div class="search-results-info" id="search-results"></div>

        <div id="graph-container">
            ${graph.nodes.length > 0 ? this.renderGraph(graph) : '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><div class="empty-state-title">No dependencies found</div><div>Try switching view mode or refreshing</div></div>'}
        </div>

        <div id="tooltip" class="tooltip" style="display: none;"></div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const graphData = ${JSON.stringify(graph)};
        const detailedStats = ${JSON.stringify(detailedStats)};
        const currentFilter = ${JSON.stringify(searchFilter)};

        // Pan and zoom state
        let scale = 1;
        let offsetX = 50;
        let offsetY = 50;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        // Search state
        const searchInput = document.getElementById('search-input');
        const filterType = document.getElementById('filter-type');
        const btnRegex = document.getElementById('btn-regex');
        const btnCase = document.getElementById('btn-case');
        const btnClearSearch = document.getElementById('btn-clear-search');
        const searchResults = document.getElementById('search-results');

        // Setup pan/zoom
        const container = document.getElementById('graph-container');
        const svg = document.getElementById('graph-svg');
        const mainGroup = document.getElementById('main-group');

        if (svg && mainGroup) {
            updateTransform();

            // Pan
            svg.addEventListener('mousedown', (e) => {
                if (e.target === svg || e.target.closest('.edge')) {
                    isDragging = true;
                    dragStartX = e.clientX - offsetX;
                    dragStartY = e.clientY - offsetY;
                    svg.style.cursor = 'grabbing';
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    offsetX = e.clientX - dragStartX;
                    offsetY = e.clientY - dragStartY;
                    updateTransform();
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                if (svg) svg.style.cursor = 'grab';
            });

            // Zoom
            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                scale = Math.max(0.2, Math.min(3, scale * delta));
                updateTransform();
            });
        }

        function updateTransform() {
            if (mainGroup) {
                mainGroup.setAttribute('transform', 'translate(' + offsetX + ',' + offsetY + ') scale(' + scale + ')');
            }
        }

        // Search functionality
        function performSearch() {
            const query = searchInput.value.trim();
            const typeFilter = filterType.value;
            const useRegex = btnRegex.classList.contains('active');
            const caseSensitive = btnCase.classList.contains('active');

            if (!query && typeFilter === 'all') {
                clearSearch();
                return;
            }

            // Build node types filter
            let nodeTypes = undefined;
            if (typeFilter !== 'all') {
                nodeTypes = [typeFilter];
            }

            // Send search command to extension
            vscode.postMessage({
                command: 'search',
                filter: {
                    query,
                    nodeTypes,
                    useRegex,
                    caseSensitive
                }
            });

            // Show/hide clear button
            if (query || typeFilter !== 'all') {
                btnClearSearch.classList.add('visible');
            } else {
                btnClearSearch.classList.remove('visible');
            }
        }

        function clearSearch() {
            searchInput.value = '';
            filterType.value = 'all';
            btnRegex.classList.remove('active');
            btnCase.classList.remove('active');
            btnClearSearch.classList.remove('visible');
            searchResults.classList.remove('visible');

            vscode.postMessage({ command: 'clearSearch' });
        }

        // Debounced search
        let searchTimeout;
        function debouncedSearch() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 300);
        }

        // Search event listeners
        searchInput.addEventListener('input', debouncedSearch);
        filterType.addEventListener('change', performSearch);
        btnRegex.addEventListener('click', () => {
            btnRegex.classList.toggle('active');
            performSearch();
        });
        btnCase.addEventListener('click', () => {
            btnCase.classList.toggle('active');
            performSearch();
        });
        btnClearSearch.addEventListener('click', clearSearch);

        // Keyboard shortcut for search (Ctrl/Cmd + F)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
            if (e.key === 'Escape') {
                if (document.activeElement === searchInput) {
                    searchInput.blur();
                    clearSearch();
                }
            }
        });

        // Expandable stats
        const statOrphaned = document.getElementById('stat-orphaned');
        const statMissing = document.getElementById('stat-missing');
        const detailsPanel = document.getElementById('details-panel');

        function toggleDetails(statItem, sectionId) {
            const isExpanded = statItem.classList.contains('expanded');
            statItem.classList.toggle('expanded');

            // Show/hide the relevant section
            const section = document.getElementById(sectionId);
            if (section) {
                if (isExpanded) {
                    section.style.display = 'none';
                    detailsPanel.classList.remove('expanded');
                } else {
                    section.style.display = 'block';
                    detailsPanel.classList.add('expanded');
                }
            }

            // Hide panel if no sections visible
            const visibleSections = detailsPanel.querySelectorAll('.details-section[style="display: block"]');
            if (visibleSections.length === 0) {
                detailsPanel.classList.remove('expanded');
            }
        }

        if (statOrphaned) {
            statOrphaned.addEventListener('click', () => toggleDetails(statOrphaned, 'details-orphaned'));
        }
        if (statMissing) {
            statMissing.addEventListener('click', () => toggleDetails(statMissing, 'details-missing'));
        }

        // Commands
        function changeMode(mode) {
            vscode.postMessage({ command: 'changeMode', mode: mode });
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function openFile(filePath) {
            vscode.postMessage({ command: 'openFile', filePath: filePath });
        }

        function openFileAtLine(filePath, line) {
            vscode.postMessage({ command: 'openFileAtLine', filePath: filePath, line: line });
        }

        function visualizeFile(filePath) {
            vscode.postMessage({ command: 'visualizeFile', filePath: filePath });
        }

        // Add event listeners for toolbar buttons
        document.getElementById('btn-files')?.addEventListener('click', () => changeMode('files'));
        document.getElementById('btn-tables')?.addEventListener('click', () => changeMode('tables'));
        document.getElementById('btn-hybrid')?.addEventListener('click', () => changeMode('hybrid'));
        document.getElementById('btn-refresh')?.addEventListener('click', () => refresh());

        // Legend button - toggle popover
        const btnLegend = document.getElementById('btn-legend');
        const legendPopover = document.getElementById('legend-popover');
        btnLegend?.addEventListener('click', (e) => {
            e.stopPropagation();
            legendPopover?.classList.toggle('visible');
        });

        // Close legend when clicking outside
        document.addEventListener('click', (e) => {
            if (legendPopover && !legendPopover.contains(e.target) && e.target !== btnLegend) {
                legendPopover.classList.remove('visible');
            }
        });

        // Event delegation for node interactions
        if (svg) {
            svg.addEventListener('click', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const filePath = node.getAttribute('data-filepath');
                    if (filePath) openFile(filePath);
                }
            });

            svg.addEventListener('dblclick', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const filePath = node.getAttribute('data-filepath');
                    if (filePath) visualizeFile(filePath);
                }
            });

            svg.addEventListener('mouseover', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const base64 = node.getAttribute('data-tooltip');
                    if (base64) {
                        const content = atob(base64);
                        showTooltip(e, content);
                    }
                }
            });

            svg.addEventListener('mouseout', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    hideTooltip();
                }
            });
        }

        // Tooltip
        const tooltip = document.getElementById('tooltip');

        function showTooltip(e, content) {
            tooltip.innerHTML = content;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 10) + 'px';
            tooltip.style.top = (e.clientY + 10) + 'px';
        }

        function hideTooltip() {
            tooltip.style.display = 'none';
        }

        // Handle details item clicks
        document.querySelectorAll('.details-item').forEach(item => {
            item.addEventListener('click', () => {
                const filePath = item.getAttribute('data-filepath');
                const line = item.getAttribute('data-line');
                if (filePath) {
                    if (line) {
                        openFileAtLine(filePath, parseInt(line));
                    } else {
                        openFile(filePath);
                    }
                }
            });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Generate detailed statistics for expandable sections
     */
    private generateDetailedStats(graph: WorkspaceDependencyGraph): DetailedWorkspaceStats {
        const index = this._indexManager.getIndex();
        if (!index) {
            return {
                ...graph.stats,
                orphanedDetails: [],
                missingDetails: []
            };
        }

        // Generate orphaned details
        const orphanedDetails: DefinitionDetail[] = [];
        for (const tableName of graph.stats.orphanedDefinitions) {
            const def = index.definitionMap.get(tableName.toLowerCase());
            if (def) {
                orphanedDetails.push({
                    name: def.name,
                    type: def.type,
                    filePath: def.filePath,
                    lineNumber: def.lineNumber
                });
            }
        }

        // Generate missing details
        const missingDetails: MissingDefinitionDetail[] = [];
        for (const tableName of graph.stats.missingDefinitions) {
            const refs = index.referenceMap.get(tableName.toLowerCase()) || [];
            const referencingFiles = [...new Set(refs.map(r => r.filePath))];

            missingDetails.push({
                tableName,
                references: refs,
                referenceCount: refs.length,
                referencingFiles
            });
        }

        return {
            ...graph.stats,
            orphanedDetails,
            missingDetails
        };
    }

    /**
     * Render orphaned definitions details section
     */
    private renderOrphanedDetails(details: DefinitionDetail[]): string {
        if (details.length === 0) return '';

        const items = details.slice(0, 50).map(d => `
            <div class="details-item" data-filepath="${this.escapeHtml(d.filePath)}" data-line="${d.lineNumber}">
                <span class="details-item-type ${d.type}">${d.type.toUpperCase()}</span>
                <span style="color: #e2e8f0; font-weight: 500;">${this.escapeHtml(d.name)}</span>
                <span class="details-item-path">${this.escapeHtml(d.filePath)}</span>
                <span class="details-item-line">:${d.lineNumber}</span>
            </div>
        `).join('');

        return `
            <div class="details-section" id="details-orphaned" style="display: none;">
                <div class="details-title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    Orphaned Definitions (defined but never referenced)
                </div>
                <div class="details-list">
                    ${items}
                    ${details.length > 50 ? `<div class="details-item" style="justify-content: center; color: #64748b;">... and ${details.length - 50} more</div>` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render missing definitions details section
     */
    private renderMissingDetails(details: MissingDefinitionDetail[]): string {
        if (details.length === 0) return '';

        const items = details.slice(0, 50).map(d => {
            // Show first few references
            const refSamples = d.references.slice(0, 3).map(r => ({
                file: r.filePath,
                line: r.lineNumber
            }));

            return `
                <div class="details-item" style="flex-direction: column; align-items: stretch;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span style="color: #e2e8f0; font-weight: 500;">${this.escapeHtml(d.tableName)}</span>
                        <span style="color: #64748b; font-size: 9px;">(${d.referenceCount} refs)</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px; margin-left: 18px;">
                        ${refSamples.map(r => `
                            <div class="details-item" data-filepath="${this.escapeHtml(r.file)}" data-line="${r.line}" style="padding: 2px 4px; font-size: 9px;">
                                <span class="details-item-path">${this.escapeHtml(r.file)}</span>
                                <span class="details-item-line">:${r.line}</span>
                            </div>
                        `).join('')}
                        ${d.references.length > 3 ? `<span style="color: #64748b; font-size: 8px; padding-left: 6px;">+ ${d.references.length - 3} more references</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="details-section" id="details-missing" style="display: none;">
                <div class="details-title error">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    Missing Definitions (referenced but not defined in workspace)
                </div>
                <div class="details-list">
                    ${items}
                    ${details.length > 50 ? `<div class="details-item" style="justify-content: center; color: #64748b;">... and ${details.length - 50} more</div>` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render the graph SVG with improved edge styling
     */
    private renderGraph(graph: WorkspaceDependencyGraph): string {
        // Calculate bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const node of graph.nodes) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + node.width);
            maxY = Math.max(maxY, node.y + node.height);
        }

        const width = Math.max(1200, maxX + 150);
        const height = Math.max(800, maxY + 150);

        // Render edges with improved curvature
        const edgesHtml = graph.edges.map(edge => {
            const source = graph.nodes.find(n => n.id === edge.source);
            const target = graph.nodes.find(n => n.id === edge.target);
            if (!source || !target) return '';

            // Calculate connection points
            const x1 = source.x + source.width / 2;
            const y1 = source.y + source.height;
            const x2 = target.x + target.width / 2;
            const y2 = target.y;

            // Calculate vertical distance for curvature control
            const verticalDistance = y2 - y1;
            const curveIntensity = Math.max(verticalDistance * 0.3, 50);

            // Create smooth bezier curve with better control points
            const path = `M ${x1} ${y1} C ${x1} ${y1 + curveIntensity}, ${x2} ${y2 - curveIntensity}, ${x2} ${y2}`;

            // Get edge color based on reference type
            const edgeColors: Record<string, string> = {
                'select': '#64748b',
                'join': '#a78bfa',
                'insert': '#10b981',
                'update': '#fbbf24',
                'delete': '#f87171',
                'subquery': '#8b5cf6'
            };
            const edgeColor = edgeColors[edge.referenceType] || '#64748b';

            return `
                <g class="edge edge-${edge.referenceType}"
                   onmouseenter="showTooltip(event, '<div class=tooltip-title>${edge.count} reference${edge.count > 1 ? 's' : ''}</div><div class=tooltip-content>Tables: ${edge.tables.map(t => this.escapeHtml(t)).join(', ')}</div>')"
                   onmouseleave="hideTooltip()">
                    <path d="${path}"
                          fill="none"
                          stroke="${edgeColor}"
                          stroke-width="2"
                          marker-end="url(#arrowhead-${edge.referenceType})"
                          opacity="0.7"/>
                    ${edge.count > 1 ? `<text x="${(x1+x2)/2}" y="${(y1+y2)/2}" class="edge-label" text-anchor="middle" fill="#94a3b8" font-size="10">${edge.count}</text>` : ''}
                </g>
            `;
        }).join('');

        // Render nodes
        const nodesHtml = graph.nodes.map(node => {
            const typeClass = `node-${node.type}`;
            const defInfo = node.definitions ? `${node.definitions.length} definition${node.definitions.length !== 1 ? 's' : ''}` : '';
            const refInfo = node.referenceCount ? `${node.referenceCount} reference${node.referenceCount !== 1 ? 's' : ''}` : '';
            const sublabel = [defInfo, refInfo].filter(Boolean).join(', ');

            const tooltipContent = this.getNodeTooltipContent(node);

            return `
                <g class="node ${typeClass}"
                   transform="translate(${node.x}, ${node.y})"
                   data-filepath="${node.filePath ? this.escapeHtml(node.filePath) : ''}"
                   data-tooltip="${Buffer.from(tooltipContent).toString('base64')}">
                    <rect width="${node.width}" height="${node.height}" rx="8" filter="url(#shadow)"/>
                    <text x="${node.width/2}" y="28" class="node-label" text-anchor="middle">${this.escapeHtml(node.label)}</text>
                    ${sublabel ? `<text x="${node.width/2}" y="46" class="node-sublabel" text-anchor="middle">${sublabel}</text>` : ''}
                </g>
            `;
        }).join('');

        // Generate arrow markers for each edge type
        const edgeTypes = ['select', 'join', 'insert', 'update', 'delete', 'subquery'];
        const arrowMarkers = edgeTypes.map(type => {
            const colors: Record<string, string> = {
                'select': '#64748b',
                'join': '#a78bfa',
                'insert': '#10b981',
                'update': '#fbbf24',
                'delete': '#f87171',
                'subquery': '#8b5cf6'
            };
            return `
                <marker id="arrowhead-${type}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="${colors[type] || '#64748b'}"/>
                </marker>
            `;
        }).join('');

        return `
            <svg id="graph-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
                <defs>
                    ${arrowMarkers}
                    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
                    </filter>
                </defs>
                <g id="main-group">
                    ${edgesHtml}
                    ${nodesHtml}
                </g>
            </svg>
        `;
    }

    /**
     * Get tooltip content for a node
     */
    private getNodeTooltipContent(node: WorkspaceNode): string {
        let content = `<div class="tooltip-title">${this.escapeHtml(node.label)}</div>`;

        if (node.type === 'file' && node.filePath) {
            content += `<div class="tooltip-content">${this.escapeHtml(node.filePath)}</div>`;
        }

        if (node.definitions && node.definitions.length > 0) {
            content += '<div class="tooltip-content">Defines:</div><ul class="tooltip-list">';
            for (const def of node.definitions.slice(0, 5)) {
                content += `<li>${def.type}: ${this.escapeHtml(def.name)}</li>`;
            }
            if (node.definitions.length > 5) {
                content += `<li>...and ${node.definitions.length - 5} more</li>`;
            }
            content += '</ul>';
        }

        if (node.type === 'external') {
            content += '<div class="tooltip-content" style="color:#fbbf24;">Not defined in workspace</div>';
        }

        content += '<div class="tooltip-content" style="margin-top:8px;font-size:10px;">Click to open, double-click to visualize</div>';

        return content;
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
     * Get loading HTML
     */
    private getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#0f172a;color:#e2e8f0;font-family:sans-serif;">
<div style="text-align:center;">
    <div style="margin-bottom:16px;font-size:24px;">Analyzing Workspace...</div>
    <div style="color:#94a3b8;">Scanning SQL files</div>
</div>
</body></html>`;
    }

    /**
     * Get manual index HTML
     */
    private getManualIndexHtml(fileCount: number): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html><body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background:#0f172a;color:#e2e8f0;font-family:sans-serif;gap:20px;">
<div style="font-size:24px;">Found ${fileCount} SQL Files</div>
<div style="color:#94a3b8;">Large workspace detected. Click below to start indexing.</div>
<button onclick="vscode.postMessage({command:'refresh'})"
        style="padding:12px 24px;background:#6366f1;border:none;border-radius:8px;color:white;font-size:14px;cursor:pointer;">
    Index Workspace
</button>
<script nonce="${nonce}">const vscode = acquireVsCodeApi();</script>
</body></html>`;
    }

    /**
     * Get empty workspace HTML
     */
    private getEmptyWorkspaceHtml(): string {
        return `<!DOCTYPE html>
<html><body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background:#0f172a;color:#e2e8f0;font-family:sans-serif;gap:16px;">
<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6"/>
    <path d="M12 18v-6M9 15h6"/>
</svg>
<div style="font-size:18px;font-weight:600;">No SQL Files Found</div>
<div style="color:#94a3b8;">Add .sql files to your workspace to see dependencies.</div>
</body></html>`;
    }

    /**
     * Get error HTML
     */
    private getErrorHtml(message: string): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html><body style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background:#0f172a;color:#f87171;font-family:sans-serif;gap:16px;">
<div style="font-size:18px;">Error</div>
<div>${message}</div>
<button onclick="vscode.postMessage({command:'refresh'})"
        style="padding:8px 16px;background:#334155;border:none;border-radius:6px;color:#e2e8f0;cursor:pointer;margin-top:8px;">
    Try Again
</button>
<script nonce="${nonce}">const vscode = acquireVsCodeApi();</script>
</body></html>`;
    }

    /**
     * Dispose the panel
     */
    public dispose(): void {
        WorkspacePanel.currentPanel = undefined;

        this._indexManager.dispose();
        this._panel.dispose();

        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }
}

/**
 * Generate a nonce for CSP
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
