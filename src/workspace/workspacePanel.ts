// Workspace Panel - VS Code webview panel for workspace dependency visualization

import * as vscode from 'vscode';
import * as path from 'path';
import { IndexManager } from './indexManager';
import { buildDependencyGraph } from './dependencyGraph';
import { WorkspaceDependencyGraph, GraphMode, WorkspaceNode } from './types';
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
        this._panel.webview.html = this.getWebviewHtml(this._currentGraph);
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
     * Get webview HTML with graph data
     */
    private getWebviewHtml(graph: WorkspaceDependencyGraph): string {
        const nonce = getNonce();

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
            display: flex; align-items: center; gap: 12px; padding: 12px 16px;
            background: #1e293b; border-bottom: 1px solid #334155;
        }
        .toolbar-title { font-weight: 600; font-size: 14px; color: #f1f5f9; }
        .toolbar-separator { width: 1px; height: 24px; background: #475569; }
        .toolbar-btn {
            display: flex; align-items: center; gap: 6px; padding: 6px 12px;
            background: #334155; border: none; border-radius: 6px;
            color: #e2e8f0; font-size: 12px; cursor: pointer;
            transition: background 0.15s;
        }
        .toolbar-btn:hover { background: #475569; }
        .toolbar-btn.active { background: #6366f1; }
        .toolbar-btn svg { width: 14px; height: 14px; }

        /* Stats Panel */
        .stats-panel {
            display: flex; gap: 16px; padding: 8px 16px;
            background: #1e293b; border-bottom: 1px solid #334155;
            font-size: 12px;
        }
        .stat-item { display: flex; align-items: center; gap: 6px; }
        .stat-value { font-weight: 600; color: #f1f5f9; }
        .stat-label { color: #94a3b8; }
        .stat-warning { color: #fbbf24; }
        .stat-error { color: #f87171; }

        /* SVG Container */
        #graph-container { flex: 1; overflow: hidden; position: relative; }
        #graph-svg { width: 100%; height: 100%; cursor: grab; }
        #graph-svg:active { cursor: grabbing; }

        /* Node Styles */
        .node { cursor: pointer; }
        .node:hover rect { filter: brightness(1.1); }
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
        </div>

        <div class="stats-panel">
            <div class="stat-item"><span class="stat-value">${graph.stats.totalFiles}</span><span class="stat-label">files</span></div>
            <div class="stat-item"><span class="stat-value">${graph.stats.totalTables}</span><span class="stat-label">tables</span></div>
            <div class="stat-item"><span class="stat-value">${graph.stats.totalViews}</span><span class="stat-label">views</span></div>
            <div class="stat-item"><span class="stat-value">${graph.stats.totalReferences}</span><span class="stat-label">references</span></div>
            ${graph.stats.orphanedDefinitions.length > 0 ? `<div class="stat-item stat-warning"><span class="stat-value">${graph.stats.orphanedDefinitions.length}</span><span class="stat-label">orphaned</span></div>` : ''}
            ${graph.stats.missingDefinitions.length > 0 ? `<div class="stat-item stat-error"><span class="stat-value">${graph.stats.missingDefinitions.length}</span><span class="stat-label">missing</span></div>` : ''}
        </div>

        <div id="graph-container">
            ${graph.nodes.length > 0 ? this.renderGraph(graph) : '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><div class="empty-state-title">No dependencies found</div><div>Try switching view mode or refreshing</div></div>'}
        </div>

        <div id="tooltip" class="tooltip" style="display: none;"></div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const graphData = ${JSON.stringify(graph)};

        // Pan and zoom state
        let scale = 1;
        let offsetX = 50;
        let offsetY = 50;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

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

        // Add event listeners for toolbar buttons (CSP blocks inline onclick)
        document.getElementById('btn-files')?.addEventListener('click', () => changeMode('files'));
        document.getElementById('btn-tables')?.addEventListener('click', () => changeMode('tables'));
        document.getElementById('btn-hybrid')?.addEventListener('click', () => changeMode('hybrid'));
        document.getElementById('btn-refresh')?.addEventListener('click', () => refresh());

        // Event delegation for node interactions (CSP blocks inline handlers)
        if (svg) {
            // Click to open file
            svg.addEventListener('click', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const filePath = node.getAttribute('data-filepath');
                    if (filePath) openFile(filePath);
                }
            });

            // Double-click to visualize
            svg.addEventListener('dblclick', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const filePath = node.getAttribute('data-filepath');
                    if (filePath) visualizeFile(filePath);
                }
            });

            // Mouseover for tooltip
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

            // Mouseout to hide tooltip
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

        function showNodeTooltip(e, element) {
            const base64 = element.getAttribute('data-tooltip');
            if (base64) {
                const content = atob(base64);
                showTooltip(e, content);
            }
        }

        function hideTooltip() {
            tooltip.style.display = 'none';
        }
    </script>
</body>
</html>`;
    }

    /**
     * Render the graph SVG
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

        const width = Math.max(800, maxX + 100);
        const height = Math.max(600, maxY + 100);

        // Render edges
        const edgesHtml = graph.edges.map(edge => {
            const source = graph.nodes.find(n => n.id === edge.source);
            const target = graph.nodes.find(n => n.id === edge.target);
            if (!source || !target) return '';

            const x1 = source.x + source.width / 2;
            const y1 = source.y + source.height;
            const x2 = target.x + target.width / 2;
            const y2 = target.y;

            const midY = (y1 + y2) / 2;
            const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

            return `
                <g class="edge edge-${edge.referenceType}"
                   onmouseenter="showTooltip(event, '<div class=tooltip-title>${edge.count} reference${edge.count > 1 ? 's' : ''}</div><div class=tooltip-content>Tables: ${edge.tables.join(', ')}</div>')"
                   onmouseleave="hideTooltip()">
                    <path d="${path}" marker-end="url(#arrowhead)"/>
                    ${edge.count > 1 ? `<text x="${(x1+x2)/2}" y="${midY - 5}" class="edge-label" text-anchor="middle">${edge.count}</text>` : ''}
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
                    <rect width="${node.width}" height="${node.height}" filter="url(#shadow)"/>
                    <text x="${node.width/2}" y="24" class="node-label" text-anchor="middle">${this.escapeHtml(node.label)}</text>
                    ${sublabel ? `<text x="${node.width/2}" y="42" class="node-sublabel" text-anchor="middle">${sublabel}</text>` : ''}
                </g>
            `;
        }).join('');

        return `
            <svg id="graph-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#64748b"/>
                    </marker>
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
