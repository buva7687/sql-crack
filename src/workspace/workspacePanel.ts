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
import { getDisplayName } from './identifiers';

// Lineage modules
import { LineageBuilder } from './lineage/lineageBuilder';
import { LineageGraph, LineageNode, LineagePath } from './lineage/types';
import { FlowAnalyzer, FlowResult } from './lineage/flowAnalyzer';
import { ImpactAnalyzer, ImpactReport } from './lineage/impactAnalyzer';
import { ColumnLineageTracker } from './lineage/columnLineage';

// UI modules
import { TableExplorer } from './ui/tableExplorer';
import { LineageView } from './ui/lineageView';
import { ImpactView } from './ui/impactView';
import { ViewMode } from './ui/types';

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
    private _currentView: ViewMode | 'graph' | 'issues' = 'graph';
    private _currentSearchFilter: SearchFilter = {
        query: '',
        nodeTypes: undefined,
        useRegex: false,
        caseSensitive: false
    };
    private _detailedStats: DetailedWorkspaceStats | null = null;
    private _showHelp: boolean = false;

    // Lineage state
    private _lineageGraph: LineageGraph | null = null;
    private _lineageBuilder: LineageBuilder | null = null;
    private _flowAnalyzer: FlowAnalyzer | null = null;
    private _impactAnalyzer: ImpactAnalyzer | null = null;
    private _columnLineageTracker: ColumnLineageTracker | null = null;
    private _selectedLineageNode: LineageNode | null = null;
    private _currentImpactReport: ImpactReport | null = null;
    private _currentFlowResult: FlowResult | null = null;

    // UI generators
    private _tableExplorer: TableExplorer = new TableExplorer();
    private _lineageView: LineageView = new LineageView();
    private _impactView: ImpactView = new ImpactView();

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

        // Clear cached lineage graph so it rebuilds with new data
        this._lineageGraph = null;
        this._lineageBuilder = null;
        this._flowAnalyzer = null;
        this._impactAnalyzer = null;
        this._columnLineageTracker = null;

        this._currentGraph = buildDependencyGraph(index, 'tables'); // Table-first graph by default
        this.renderCurrentView();
    }

    /**
     * Render the current view (graph or issues)
     */
    private renderCurrentView(): void {
        if (!this._currentGraph) {
            this._panel.webview.html = this.getErrorHtml('No graph data available.');
            return;
        }

        if (this._currentView === 'issues') {
            this._panel.webview.html = this.getIssuesHtml();
        } else {
            this._panel.webview.html = this.getWebviewHtml(this._currentGraph, this._currentSearchFilter);
        }
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'switchView':
                this._currentView = message.view;
                this.renderCurrentView();
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

            case 'toggleHelp':
                this._showHelp = !this._showHelp;
                this.renderCurrentView();
                break;

            case 'export':
                await this.handleExport(message.format);
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

            // ========== Lineage Commands ==========
            // Note: View switching is handled in webview JS - don't re-render the entire page
            case 'switchToLineageView':
                this._currentView = 'lineage';
                await this.buildLineageGraph();
                // Send lineage overview data to webview
                if (this._lineageGraph) {
                    const html = this._lineageView.generateLineageOverview(this._lineageGraph);
                    this._panel.webview.postMessage({
                        command: 'lineageOverviewResult',
                        data: { html }
                    });
                }
                break;

            case 'switchToTableExplorer':
                this._currentView = 'tableExplorer';
                await this.buildLineageGraph();
                // Send table list to webview
                if (this._lineageGraph) {
                    const html = this._tableExplorer.generateTableList(this._lineageGraph);
                    this._panel.webview.postMessage({
                        command: 'tableListResult',
                        data: { html }
                    });
                }
                break;

            case 'switchToImpactView':
                this._currentView = 'impact';
                await this.buildLineageGraph();
                // Send impact form to webview
                if (this._lineageGraph) {
                    const html = this._impactView.generateImpactForm(this._lineageGraph);
                    this._panel.webview.postMessage({
                        command: 'impactFormResult',
                        data: { html }
                    });
                } else {
                    const html = this._impactView.generateImpactForm(null);
                    this._panel.webview.postMessage({
                        command: 'impactFormResult',
                        data: { html }
                    });
                }
                break;

            case 'getLineage':
                await this.handleGetLineage(message.nodeId, message.direction, message.depth);
                break;

            case 'analyzeImpact':
                await this.handleAnalyzeImpact(
                    message.type,
                    message.name,
                    message.tableName,
                    message.changeType
                );
                break;

            case 'exploreTable':
                await this.handleExploreTable(message.tableName);
                break;

            case 'getColumnLineage':
                await this.handleGetColumnLineage(message.tableName, message.columnName);
                break;

            case 'selectLineageNode':
                this.handleSelectLineageNode(message.nodeId);
                break;

            case 'getUpstream':
                await this.handleGetUpstream(message.nodeId, message.depth, message.nodeType, message.filePath);
                break;

            case 'getDownstream':
                await this.handleGetDownstream(message.nodeId, message.depth, message.nodeType, message.filePath);
                break;

            // ========== Visual Lineage Graph Commands ==========
            case 'searchLineageTables':
                await this.handleSearchLineageTables(message.query, message.typeFilter);
                break;

            case 'getLineageGraph':
                await this.handleGetLineageGraph(
                    message.nodeId,
                    message.depth || 5,
                    message.direction || 'both',
                    message.fileFilter,
                    message.expandedNodes
                );
                break;

            case 'expandNodeColumns':
                await this.handleExpandNodeColumns(message.nodeId);
                break;

            case 'setLineageDirection':
                await this.handleSetLineageDirection(message.nodeId, message.direction);
                break;
            case 'collapseNodeColumns':
                // Collapse node - send confirmation to webview
                this._panel.webview.postMessage({
                    command: 'nodeCollapsedResult',
                    data: { nodeId: message.nodeId }
                });
                break;
            case 'selectColumn':
                await this.handleSelectColumn(message.tableId, message.columnName);
                break;
            case 'clearColumnSelection':
                await this.handleClearColumnSelection();
                break;
            case 'getColumnLineage':
                await this.handleGetColumnLineage(message.tableId, message.columnName);
                break;
        }
    }

    // ========== Lineage Methods ==========

    /**
     * Build lineage graph from workspace index
     */
    private async buildLineageGraph(): Promise<void> {
        if (this._lineageGraph) return; // Already built

        const index = this._indexManager.getIndex();
        if (!index) return;

        this._lineageBuilder = new LineageBuilder({ includeExternal: true, includeColumns: true });
        this._lineageGraph = this._lineageBuilder.buildFromIndex(index);
        this._flowAnalyzer = new FlowAnalyzer(this._lineageGraph);
        this._impactAnalyzer = new ImpactAnalyzer(this._lineageGraph, this._flowAnalyzer);
        this._columnLineageTracker = new ColumnLineageTracker(this._lineageGraph);
    }

    /**
     * Handle get lineage request
     */
    private async handleGetLineage(
        nodeId: string,
        direction: 'upstream' | 'downstream' | 'both',
        depth: number
    ): Promise<void> {
        await this.buildLineageGraph();
        if (!this._flowAnalyzer || !this._lineageGraph) return;

        let result: FlowResult | null = null;

        if (direction === 'upstream' || direction === 'both') {
            result = this._flowAnalyzer.getUpstream(nodeId, { maxDepth: depth });
        }
        if (direction === 'downstream' || direction === 'both') {
            const downstream = this._flowAnalyzer.getDownstream(nodeId, { maxDepth: depth });
            if (result) {
                result.nodes = [...result.nodes, ...downstream.nodes];
                result.edges = [...result.edges, ...downstream.edges];
            } else {
                result = downstream;
            }
        }

        this._currentFlowResult = result;

        // Send result to webview
        this._panel.webview.postMessage({
            command: 'lineageResult',
            data: {
                nodeId,
                direction,
                result: result ? {
                    nodes: result.nodes.map(n => ({
                        id: n.id,
                        name: n.name,
                        type: n.type,
                        filePath: n.filePath,
                        lineNumber: n.lineNumber
                    })),
                    depth: result.depth,
                    pathCount: result.paths.length
                } : null
            }
        });
    }

    /**
     * Handle impact analysis request
     */
    private async handleAnalyzeImpact(
        type: 'table' | 'column',
        name: string,
        tableName?: string,
        changeType: 'modify' | 'rename' | 'drop' = 'modify'
    ): Promise<void> {
        await this.buildLineageGraph();
        if (!this._impactAnalyzer) return;

        let report: ImpactReport;
        if (type === 'table') {
            report = this._impactAnalyzer.analyzeTableChange(name, changeType);
        } else {
            report = this._impactAnalyzer.analyzeColumnChange(tableName!, name, changeType);
        }

        this._currentImpactReport = report;

        // Send result to webview
        this._panel.webview.postMessage({
            command: 'impactResult',
            data: {
                report: {
                    changeType: report.changeType,
                    target: report.target,
                    severity: report.severity,
                    summary: report.summary,
                    directImpacts: report.directImpacts.map(i => ({
                        name: i.node.name,
                        type: i.node.type,
                        reason: i.reason,
                        severity: i.severity,
                        filePath: i.filePath,
                        lineNumber: i.lineNumber
                    })),
                    transitiveImpacts: report.transitiveImpacts.map(i => ({
                        name: i.node.name,
                        type: i.node.type,
                        reason: i.reason,
                        severity: i.severity,
                        filePath: i.filePath,
                        lineNumber: i.lineNumber
                    })),
                    suggestions: report.suggestions
                },
                html: this._impactView.generateImpactReport(report)
            }
        });
    }

    /**
     * Handle explore table request
     */
    private async handleExploreTable(tableName: string): Promise<void> {
        await this.buildLineageGraph();
        if (!this._lineageGraph) return;

        const nodeId = `table:${tableName.toLowerCase()}`;
        const node = this._lineageGraph.nodes.get(nodeId);

        if (!node) {
            this._panel.webview.postMessage({
                command: 'tableExplorerResult',
                data: { error: `Table "${tableName}" not found in lineage graph` }
            });
            return;
        }

        this._selectedLineageNode = node;

        const html = this._tableExplorer.generateTableView({
            table: node,
            graph: this._lineageGraph
        });

        this._panel.webview.postMessage({
            command: 'tableExplorerResult',
            data: {
                table: {
                    id: node.id,
                    name: node.name,
                    type: node.type,
                    filePath: node.filePath,
                    lineNumber: node.lineNumber
                },
                html
            }
        });
    }

    /**
     * Handle column lineage request
     */
    private async handleGetColumnLineage(tableName: string, columnName: string): Promise<void> {
        await this.buildLineageGraph();
        if (!this._columnLineageTracker || !this._lineageGraph) return;

        const lineage = this._columnLineageTracker.getFullColumnLineage(
            this._lineageGraph,
            tableName,
            columnName
        );

        const html = this._lineageView.generateColumnLineageView(lineage);

        this._panel.webview.postMessage({
            command: 'columnLineageResult',
            data: {
                tableName,
                columnName,
                upstream: lineage.upstream.map(p => ({
                    depth: p.depth,
                    nodeCount: p.nodes.length
                })),
                downstream: lineage.downstream.map(p => ({
                    depth: p.depth,
                    nodeCount: p.nodes.length
                })),
                html
            }
        });
    }

    /**
     * Handle node selection in lineage view
     */
    private handleSelectLineageNode(nodeId: string): void {
        if (!this._lineageGraph) return;

        const node = this._lineageGraph.nodes.get(nodeId);
        if (node) {
            this._selectedLineageNode = node;
        }
    }

    /**
     * Handle get upstream request
     */
    private async handleGetUpstream(nodeId: string | undefined, depth: number = -1, nodeType?: string, filePath?: string): Promise<void> {
        await this.buildLineageGraph();
        if (!this._flowAnalyzer) return;

        // For file nodes, get all tables defined in the file and aggregate their upstream
        let nodeIds: string[] = [];
        if (nodeType === 'file' && filePath) {
            const index = this._indexManager.getIndex();
            if (index) {
                const fileAnalysis = index.files.get(filePath);
                if (fileAnalysis) {
                    nodeIds = fileAnalysis.definitions.map(def => `${def.type}:${def.name.toLowerCase()}`);
                }
            }
        } else if (nodeId) {
            nodeIds = [nodeId];
        }

        if (nodeIds.length === 0) {
            this._panel.webview.postMessage({
                command: 'upstreamResult',
                data: { nodeId: nodeId || filePath, nodes: [], depth: 0 }
            });
            return;
        }

        // Aggregate results from all nodes
        const allNodes = new Map<string, { id: string; name: string; type: string; filePath?: string }>();
        let maxDepth = 0;

        for (const nid of nodeIds) {
            const result = this._flowAnalyzer.getUpstream(nid, { maxDepth: depth });
            for (const n of result.nodes) {
                if (!allNodes.has(n.id)) {
                    allNodes.set(n.id, { id: n.id, name: n.name, type: n.type, filePath: n.filePath });
                }
            }
            maxDepth = Math.max(maxDepth, result.depth);
        }

        this._panel.webview.postMessage({
            command: 'upstreamResult',
            data: {
                nodeId: nodeId || filePath,
                nodes: Array.from(allNodes.values()),
                depth: maxDepth
            }
        });
    }

    /**
     * Handle get downstream request
     */
    private async handleGetDownstream(nodeId: string | undefined, depth: number = -1, nodeType?: string, filePath?: string): Promise<void> {
        await this.buildLineageGraph();
        if (!this._flowAnalyzer) return;

        // For file nodes, get all tables defined in the file and aggregate their downstream
        let nodeIds: string[] = [];
        if (nodeType === 'file' && filePath) {
            const index = this._indexManager.getIndex();
            if (index) {
                const fileAnalysis = index.files.get(filePath);
                if (fileAnalysis) {
                    nodeIds = fileAnalysis.definitions.map(def => `${def.type}:${def.name.toLowerCase()}`);
                }
            }
        } else if (nodeId) {
            nodeIds = [nodeId];
        }

        if (nodeIds.length === 0) {
            this._panel.webview.postMessage({
                command: 'downstreamResult',
                data: { nodeId: nodeId || filePath, nodes: [], depth: 0 }
            });
            return;
        }

        // Aggregate results from all nodes
        const allNodes = new Map<string, { id: string; name: string; type: string; filePath?: string }>();
        let maxDepth = 0;

        for (const nid of nodeIds) {
            const result = this._flowAnalyzer.getDownstream(nid, { maxDepth: depth });
            for (const n of result.nodes) {
                if (!allNodes.has(n.id)) {
                    allNodes.set(n.id, { id: n.id, name: n.name, type: n.type, filePath: n.filePath });
                }
            }
            maxDepth = Math.max(maxDepth, result.depth);
        }

        this._panel.webview.postMessage({
            command: 'downstreamResult',
            data: {
                nodeId: nodeId || filePath,
                nodes: Array.from(allNodes.values()),
                depth: maxDepth
            }
        });
    }

    // ========== Visual Lineage Graph Methods ==========

    /**
     * Handle search for tables/views in lineage graph
     */
    private async handleSearchLineageTables(query: string, typeFilter?: string): Promise<void> {
        await this.buildLineageGraph();
        if (!this._lineageGraph) {
            this._panel.webview.postMessage({
                command: 'lineageSearchResults',
                data: { results: [] }
            });
            return;
        }

        const results: Array<{ id: string; name: string; type: string; filePath?: string }> = [];
        const queryLower = query.toLowerCase();

        for (const [id, node] of this._lineageGraph.nodes) {
            // Skip columns and external tables in search
            if (node.type === 'column') continue;

            // Apply type filter
            if (typeFilter && typeFilter !== 'all' && node.type !== typeFilter) continue;

            // Match by name
            if (node.name.toLowerCase().includes(queryLower)) {
                results.push({
                    id: node.id,
                    name: node.name,
                    type: node.type,
                    filePath: node.filePath
                });
            }
        }

        // Sort by relevance (exact matches first, then by name)
        results.sort((a, b) => {
            const aExact = a.name.toLowerCase() === queryLower;
            const bExact = b.name.toLowerCase() === queryLower;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            return a.name.localeCompare(b.name);
        });

        this._panel.webview.postMessage({
            command: 'lineageSearchResults',
            data: { results: results.slice(0, 15) }
        });
    }

    /**
     * Handle get lineage graph for a specific node
     */
    private async handleGetLineageGraph(
        nodeId: string,
        depth: number,
        direction: 'both' | 'upstream' | 'downstream',
        fileFilter?: string[],
        expandedNodes?: string[]
    ): Promise<void> {
        await this.buildLineageGraph();
        if (!this._lineageGraph) {
            this._panel.webview.postMessage({
                command: 'lineageGraphResult',
                data: { error: 'No lineage graph available' }
            });
            return;
        }

        // Generate HTML using the new visual graph view
        const html = this._lineageView.generateLineageGraphView(
            this._lineageGraph,
            nodeId,
            {
                depth,
                direction,
                expandedNodes: new Set(expandedNodes || []),
                fileFilter
            }
        );

        this._panel.webview.postMessage({
            command: 'lineageGraphResult',
            data: { html, nodeId, direction, expandedNodes: expandedNodes || [] }
        });
    }

    /**
     * Handle expand node columns request
     * Sends confirmation to webview, which will trigger a graph re-render with the node expanded.
     * Column data is fetched during the re-render, not here.
     */
    private async handleExpandNodeColumns(nodeId: string): Promise<void> {
        await this.buildLineageGraph();
        if (!this._lineageGraph) return;

        const node = this._lineageGraph.nodes.get(nodeId);
        if (!node) return;

        // Send confirmation - webview will request graph re-render with this node expanded
        this._panel.webview.postMessage({
            command: 'nodeColumnsResult',
            data: { nodeId }
        });
    }

    /**
     * Handle set lineage direction
     */
    private async handleSetLineageDirection(nodeId: string, direction: 'both' | 'upstream' | 'downstream'): Promise<void> {
        // Re-generate graph with new direction
        await this.handleGetLineageGraph(nodeId, 5, direction);
    }

    /**
     * Handle column selection - trace column lineage
     */
    private async handleSelectColumn(tableId: string, columnName: string): Promise<void> {
        console.log(`[Column Lineage] Selecting column: ${tableId}.${columnName}`);

        await this.buildLineageGraph();
        if (!this._lineageGraph || !this._columnLineageTracker) {
            console.log('[Column Lineage] Graph or tracker not available');
            return;
        }

        // Log column edge stats for debugging
        const columnEdgeCount = this._lineageGraph.columnEdges?.length || 0;
        console.log(`[Column Lineage] Graph has ${columnEdgeCount} column edges`);

        const lineage = this._columnLineageTracker.getFullColumnLineage(
            this._lineageGraph,
            tableId,
            columnName
        );

        console.log(`[Column Lineage] Found ${lineage.upstream.length} upstream paths, ${lineage.downstream.length} downstream paths`);

        // Send result back to webview
        this._panel.webview.postMessage({
            command: 'columnLineageResult',
            data: {
                tableId,
                columnName,
                upstream: lineage.upstream,
                downstream: lineage.downstream
            }
        });
    }

    /**
     * Clear column selection
     */
    private async handleClearColumnSelection(): Promise<void> {
        this._panel.webview.postMessage({
            command: 'columnSelectionCleared'
        });
    }

    /**
     * Get lineage stats for display
     */
    private getLineageStats(): { tables: number; views: number; columns: number; edges: number } | null {
        if (!this._lineageGraph) return null;

        let tables = 0, views = 0, columns = 0;
        for (const node of this._lineageGraph.nodes.values()) {
            if (node.type === 'table') tables++;
            else if (node.type === 'view') views++;
            else if (node.type === 'column') columns++;
        }

        return {
            tables,
            views,
            columns,
            edges: this._lineageGraph.edges.length
        };
    }

    /**
     * Get webview HTML with graph data and search functionality
     */
    private getWebviewHtml(graph: WorkspaceDependencyGraph, searchFilter: SearchFilter = { query: '', nodeTypes: undefined, useRegex: false, caseSensitive: false }): string {
        const nonce = getNonce();
        const detailedStats = this.generateDetailedStats(graph);
        const totalIssues = graph.stats.orphanedDefinitions.length + graph.stats.missingDefinitions.length;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Workspace Dependencies</title>
    <style>
        /* ========== CSS Variables ========== */
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-tertiary: #334155;
            --bg-hover: #475569;
            --border-color: #475569;
            --border-subtle: #334155;
            --text-primary: #f1f5f9;
            --text-secondary: #e2e8f0;
            --text-muted: #94a3b8;
            --text-dim: #64748b;
            --accent: #6366f1;
            --accent-hover: #818cf8;
            --success: #10b981;
            --success-light: #34d399;
            --warning: #f59e0b;
            --warning-light: #fbbf24;
            --error: #ef4444;
            --error-light: #f87171;
            --node-file: #3b82f6;
            --node-file-border: #60a5fa;
            --node-table: #10b981;
            --node-table-border: #34d399;
            --node-view: #8b5cf6;
            --node-view-border: #a78bfa;
            --node-external: #475569;
            --node-external-border: #64748b;
            --radius-sm: 4px;
            --radius-md: 6px;
            --radius-lg: 8px;
            --radius-xl: 12px;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
            --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
            --shadow-lg: 0 10px 40px rgba(0,0,0,0.4);
        }

        /* ========== Base Styles ========== */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html {
            width: 100%; height: 100vh; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary); color: var(--text-secondary);
            font-size: 13px;
        }
        #app { width: 100%; height: 100%; display: flex; flex-direction: column; }

        /* ========== Header ========== */
        .header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
        }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .header-icon { font-size: 18px; }
        .header-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
        .header-right { display: flex; align-items: center; gap: 8px; }

        /* ========== Icon Button ========== */
        .icon-btn {
            display: flex; align-items: center; justify-content: center;
            width: 32px; height: 32px; background: var(--bg-tertiary);
            border: none; border-radius: var(--radius-md); color: var(--text-secondary);
            cursor: pointer; transition: all 0.15s;
        }
        .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .icon-btn.active { background: var(--accent); color: white; }
        .icon-btn svg { width: 16px; height: 16px; }

        /* ========== Search Box ========== */
        .search-box {
            display: flex; align-items: center; gap: 8px;
            background: var(--bg-primary); padding: 6px 12px;
            border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);
            transition: all 0.2s;
        }
        .search-box:focus-within { border-color: var(--accent); }
        .search-box svg { flex-shrink: 0; }
        .search-input {
            background: transparent; border: none; color: var(--text-secondary);
            font-size: 13px; width: 160px; outline: none;
        }
        .search-input::placeholder { color: var(--text-dim); }
        .search-input:focus { width: 200px; }
        .search-select {
            background: var(--bg-secondary); border: 1px solid var(--border-subtle);
            color: var(--text-secondary); font-size: 12px; padding: 4px 8px;
            border-radius: var(--radius-sm); outline: none; cursor: pointer;
        }
        .search-select:hover { border-color: var(--border-color); }
        .search-clear {
            background: transparent; border: none; color: var(--text-dim);
            cursor: pointer; padding: 4px; display: none; border-radius: var(--radius-sm);
        }
        .search-clear:hover { color: var(--error-light); background: rgba(239, 68, 68, 0.1); }
        .search-clear.visible { display: flex; }

        /* ========== View Mode Tabs ========== */
        .view-tabs {
            display: flex; align-items: center; gap: 2px;
            background: var(--bg-primary); padding: 3px; border-radius: var(--radius-lg);
        }
        .view-tab {
            padding: 6px 12px; border: none; background: transparent;
            color: var(--text-muted); font-size: 12px; font-weight: 500;
            border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s;
            white-space: nowrap;
        }
        .view-tab:hover { color: var(--text-secondary); background: var(--bg-tertiary); }
        .view-tab.active {
            background: var(--accent); color: white;
        }
        .view-tab svg { width: 14px; height: 14px; margin-right: 4px; vertical-align: middle; }

        /* ========== Context Menu ========== */
        .context-menu {
            position: fixed; z-index: 1000;
            background: var(--bg-secondary); border: 1px solid var(--border-color);
            border-radius: var(--radius-md); padding: 4px 0;
            min-width: 180px; box-shadow: var(--shadow-lg);
            display: none;
        }
        .context-menu.visible { display: block; }
        .context-menu-item {
            display: flex; align-items: center; gap: 10px;
            padding: 8px 14px; cursor: pointer; font-size: 12px;
            color: var(--text-secondary); transition: all 0.1s;
        }
        .context-menu-item:hover {
            background: var(--accent); color: white;
        }
        .context-menu-item svg { width: 14px; height: 14px; flex-shrink: 0; }
        .context-menu-divider {
            height: 1px; background: var(--border-subtle); margin: 4px 0;
        }
        .context-menu-item.disabled {
            opacity: 0.5; pointer-events: none;
        }

        /* ========== Lineage Panel ========== */
        .lineage-panel {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--bg-primary);
            overflow: hidden;
            padding: 20px;
            padding-bottom: 0;
            display: none;
            z-index: 50;
            flex-direction: column;
        }
        .graph-area-container {
            position: relative;
            flex: 1;
            overflow: hidden;
        }
        .lineage-panel.visible { display: flex; }
        .lineage-panel h2 { color: var(--text-primary); margin-bottom: 16px; font-size: 18px; }
        .lineage-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-height: 0; /* Important for flex children to shrink */
        }
        /* Constrain width only for search/overview view, not graph view */
        .lineage-content > .lineage-visual-container { max-width: 1200px; margin: 0 auto; }
        .sidebar.collapsed ~ .lineage-panel { right: 0; }

        /* Lineage panel header with back button */
        .lineage-header {
            display: flex; align-items: center; gap: 16px; margin-bottom: 20px;
            padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle);
            flex-shrink: 0;
        }
        .lineage-back-btn {
            display: flex; align-items: center; gap: 6px; padding: 8px 12px;
            background: var(--bg-tertiary); border: none; border-radius: var(--radius-md);
            color: var(--text-secondary); cursor: pointer; font-size: 13px;
        }
        .lineage-back-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .lineage-back-btn svg { width: 16px; height: 16px; }

        /* Lineage node cards */
        .lineage-node-card {
            background: var(--bg-secondary); padding: 12px 16px; border-radius: var(--radius-md);
            margin-bottom: 8px; cursor: pointer; transition: all 0.15s;
            border: 1px solid var(--border-subtle);
        }
        .lineage-node-card:hover { background: var(--bg-tertiary); border-color: var(--accent); }
        .lineage-node-card .node-name { font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
        .lineage-node-card .node-meta { font-size: 11px; color: var(--text-muted); }

        /* Empty state */
        .lineage-empty {
            text-align: center; padding: 60px 20px; color: var(--text-muted);
        }
        .lineage-empty svg { width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5; }

        /* ========== Table List View ========== */
        .table-list-view { padding: 10px; }
        .table-list-header { 
            margin-bottom: 24px; 
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .header-top {
            margin-bottom: 16px;
        }
        .table-list-header h3 { 
            color: var(--text-primary); margin: 0 0 6px 0; 
            font-size: 22px; font-weight: 600; 
        }
        .header-subtitle {
            color: var(--text-muted); font-size: 14px; 
            margin: 0; line-height: 1.5;
        }
        .header-info {
            display: flex; flex-direction: column; gap: 12px;
            margin-bottom: 16px; padding: 16px;
            background: rgba(99, 102, 241, 0.05);
            border-radius: var(--radius-md);
            border: 1px solid rgba(99, 102, 241, 0.1);
        }
        .info-card {
            display: flex; gap: 12px; align-items: flex-start;
        }
        .info-card svg {
            flex-shrink: 0; margin-top: 2px;
            color: var(--accent);
        }
        .info-card strong {
            display: block; color: var(--text-primary);
            font-size: 13px; font-weight: 600; margin-bottom: 4px;
        }
        .info-card p {
            margin: 0; color: var(--text-muted);
            font-size: 12px; line-height: 1.5;
        }
        .legend-item {
            display: inline-flex; align-items: center; gap: 6px;
            margin-right: 12px; font-size: 12px;
        }
        .legend-dot {
            width: 10px; height: 10px; border-radius: 50%;
            display: inline-block;
        }
        .legend-dot.high {
            background: var(--accent);
        }
        .legend-dot.medium {
            background: rgba(99, 102, 241, 0.7);
        }
        .legend-dot.low {
            background: rgba(99, 102, 241, 0.4);
        }
        .header-stats {
            display: flex; gap: 12px; flex-wrap: wrap;
        }
        .stat-badge {
            display: flex; flex-direction: column; align-items: center;
            padding: 12px 16px; background: var(--bg-secondary);
            border-radius: var(--radius-md); border: 1px solid var(--border-subtle);
            min-width: 80px;
        }
        .stat-value {
            font-size: 20px; font-weight: 700; color: var(--accent);
            line-height: 1;
        }
        .stat-label {
            font-size: 11px; color: var(--text-muted);
            margin-top: 4px; text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .table-list-grid { display: flex; flex-direction: column; gap: 12px; }
        .table-list-item {
            display: flex; align-items: center; gap: 16px; padding: 16px 20px;
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle); cursor: pointer; 
            transition: all 0.2s; position: relative;
            box-shadow: var(--shadow-sm);
        }
        .table-list-item:hover { 
            background: var(--bg-tertiary); 
            border-color: var(--accent); 
            transform: translateY(-2px);
            box-shadow: var(--shadow-md);
        }
        .table-list-item.connection-high {
            border-left: 4px solid var(--accent);
        }
        .table-list-item.connection-medium {
            border-left: 4px solid rgba(99, 102, 241, 0.6);
        }
        .table-list-item.connection-low {
            border-left: 4px solid rgba(99, 102, 241, 0.3);
        }
        
        .table-list-icon-wrapper {
            position: relative; flex-shrink: 0;
            width: 48px; height: 48px;
            display: flex; align-items: center; justify-content: center;
            background: var(--bg-primary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
        }
        .table-list-icon { font-size: 24px; }
        .connection-indicator {
            position: absolute; top: -2px; right: -2px;
            width: 12px; height: 12px;
            border-radius: 50%; border: 2px solid var(--bg-secondary);
        }
        .connection-indicator.connection-high {
            background: var(--accent); box-shadow: 0 0 0 2px var(--accent);
        }
        .connection-indicator.connection-medium {
            background: rgba(99, 102, 241, 0.7);
        }
        .connection-indicator.connection-low {
            background: rgba(99, 102, 241, 0.4);
        }
        
        .table-list-info { flex: 1; min-width: 0; }
        .table-list-header-row {
            display: flex; align-items: center; justify-content: space-between;
            gap: 12px; margin-bottom: 8px;
        }
        .table-list-name { 
            font-weight: 600; color: var(--text-primary); 
            font-size: 15px; line-height: 1.4;
        }
        .table-list-connections {
            display: flex; align-items: center; gap: 8px;
            flex-shrink: 0;
        }
        .connection-badge {
            display: flex; align-items: center; gap: 4px;
            padding: 4px 8px; border-radius: var(--radius-sm);
            font-size: 11px; font-weight: 600;
            background: var(--bg-tertiary);
        }
        .connection-badge.upstream {
            color: var(--success-light);
        }
        .connection-badge.downstream {
            color: var(--accent);
        }
        .connection-badge svg {
            width: 12px; height: 12px;
        }
        .no-connections-badge {
            font-size: 11px; color: var(--text-dim);
            font-style: italic;
        }
        
        .table-list-meta { 
            display: flex; align-items: center; gap: 10px; 
            font-size: 12px; color: var(--text-muted); 
            flex-wrap: wrap;
        }
        .table-list-type-badge { 
            padding: 4px 10px; border-radius: var(--radius-sm);
            font-size: 11px; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .table-list-type-badge.type-table {
            background: rgba(16, 185, 129, 0.15); color: var(--success-light);
        }
        .table-list-type-badge.type-view {
            background: rgba(139, 92, 246, 0.15); color: #a78bfa;
        }
        .table-list-type-badge.type-cte {
            background: rgba(99, 102, 241, 0.15); color: var(--accent);
        }
        .table-list-file { 
            display: flex; align-items: center; gap: 4px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            max-width: 200px;
        }
        .table-list-file svg {
            width: 12px; height: 12px; flex-shrink: 0;
            opacity: 0.6;
        }
        .table-list-action {
            display: flex; align-items: center; justify-content: center;
            width: 32px; height: 32px;
            border-radius: var(--radius-sm);
            color: var(--text-dim);
            transition: all 0.2s;
            flex-shrink: 0;
        }
        .table-list-item:hover .table-list-action {
            color: var(--accent);
            background: rgba(99, 102, 241, 0.1);
        }
        .table-list-item.no-connections { 
            opacity: 0.7; 
        }
        .table-list-item.no-connections:hover { 
            opacity: 1; 
        }
        .table-list-empty { 
            text-align: center; padding: 60px 20px; color: var(--text-muted); 
        }
        .table-list-empty svg {
            width: 48px; height: 48px; margin: 0 auto 16px; opacity: 0.5;
        }
        .table-list-empty h3 {
            color: var(--text-primary); margin: 0 0 8px 0; font-size: 16px;
        }
        .table-list-empty .hint {
            color: var(--text-dim); font-size: 12px; margin-top: 8px;
        }
        
        /* Table List Controls */
        .table-list-controls {
            display: flex; flex-direction: column; gap: 16px;
            margin-bottom: 24px; padding: 20px;
            background: var(--bg-secondary); border-radius: var(--radius-xl);
            border: 1px solid var(--border-subtle);
            box-shadow: var(--shadow-sm);
        }
        .controls-header {
            margin-bottom: 4px;
        }
        .controls-header h4 {
            color: var(--text-primary); font-size: 14px; font-weight: 600;
            margin: 0 0 6px 0;
        }
        .controls-hint {
            color: var(--text-muted); font-size: 12px; margin: 0;
            line-height: 1.5;
        }
        .controls-hint kbd {
            background: var(--bg-tertiary); border: 1px solid var(--border-subtle);
            border-radius: 3px; padding: 2px 6px;
            font-family: monospace; font-size: 11px;
            color: var(--text-secondary);
        }
        .filter-group {
            display: flex; flex-direction: column; gap: 6px;
            flex: 1; min-width: 160px;
        }
        .filter-label {
            display: flex; align-items: center; gap: 6px;
            color: var(--text-secondary); font-size: 12px; font-weight: 500;
        }
        .filter-label svg {
            width: 14px; height: 14px; color: var(--text-muted);
        }
        .search-box-table {
            display: flex; align-items: center; gap: 10px;
            background: var(--bg-primary); padding: 12px 16px;
            border-radius: var(--radius-md); border: 2px solid var(--border-subtle);
            transition: all 0.2s;
        }
        .search-box-table:focus-within { 
            border-color: var(--accent); 
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .search-box-table svg { 
            flex-shrink: 0; color: var(--text-dim);
            width: 16px; height: 16px;
        }
        .search-input-table {
            flex: 1; background: transparent; border: none;
            color: var(--text-secondary); font-size: 14px; outline: none;
        }
        .search-input-table::placeholder { color: var(--text-dim); }
        .search-clear-table {
            background: transparent; border: none; color: var(--text-dim);
            cursor: pointer; padding: 6px; display: none;
            align-items: center; justify-content: center;
            border-radius: var(--radius-sm);
            transition: all 0.2s;
        }
        .search-clear-table:hover { 
            color: var(--error-light); 
            background: rgba(239, 68, 68, 0.1); 
        }
        .filter-controls {
            display: flex; gap: 12px; flex-wrap: wrap;
        }
        .filter-select {
            flex: 1; min-width: 160px;
            background: var(--bg-primary); border: 2px solid var(--border-subtle);
            color: var(--text-secondary); font-size: 13px; 
            padding: 10px 14px; border-radius: var(--radius-md); 
            outline: none; cursor: pointer; transition: all 0.2s;
        }
        .filter-select:hover { 
            border-color: var(--border-color); 
            background: var(--bg-tertiary);
        }
        .filter-select:focus { 
            border-color: var(--accent); 
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        
        /* Responsive layout for narrow panels */
        @media (max-width: 600px) {
            .filter-controls {
                flex-direction: column;
            }
            .filter-select {
                min-width: 100%; width: 100%;
            }
            .table-list-controls {
                padding: 12px;
            }
        }
        .table-list-results-info {
            padding: 12px 16px; margin-bottom: 12px;
            background: var(--bg-secondary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
            font-size: 12px; color: var(--text-muted);
        }
        .table-list-empty-filter {
            text-align: center; padding: 60px 20px; color: var(--text-muted);
        }
        .table-list-empty-filter svg {
            width: 48px; height: 48px; margin: 0 auto 16px; opacity: 0.5;
        }
        .table-list-empty-filter h3 {
            color: var(--text-primary); margin: 0 0 8px 0; font-size: 16px;
        }
        .table-list-empty-filter .hint {
            color: var(--text-dim); font-size: 12px; margin-top: 8px;
        }
        mark {
            background: rgba(99, 102, 241, 0.3); color: var(--text-primary);
            padding: 2px 4px; border-radius: 3px;
        }
        
        /* Impact Form Styles */
        .impact-form-container {
            max-width: 900px; margin: 0 auto;
        }
        .impact-form {
            background: var(--bg-secondary); border-radius: var(--radius-xl);
            border: 1px solid var(--border-subtle); padding: 32px;
            margin-bottom: 24px; box-shadow: var(--shadow-md);
        }
        .form-header {
            display: flex; align-items: flex-start; gap: 16px;
            margin-bottom: 28px; padding-bottom: 20px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .form-header-icon {
            font-size: 32px; line-height: 1;
        }
        .form-header h3 {
            color: var(--text-primary); font-size: 20px; font-weight: 600;
            margin: 0 0 6px 0;
        }
        .form-description {
            color: var(--text-muted); font-size: 14px; margin: 0;
            line-height: 1.5;
        }
        .form-fields {
            display: flex; flex-direction: column; gap: 24px;
        }
        .form-field {
            display: flex; flex-direction: column; gap: 10px;
        }
        .form-field label {
            display: flex; align-items: center; gap: 8px;
            color: var(--text-primary); font-size: 14px; font-weight: 500;
        }
        .form-field label svg {
            width: 16px; height: 16px; color: var(--text-muted);
        }
        .form-select {
            background: var(--bg-primary); border: 1px solid var(--border-subtle);
            color: var(--text-secondary); font-size: 14px; padding: 12px 16px;
            border-radius: var(--radius-md); outline: none; cursor: pointer;
            transition: all 0.2s; font-family: inherit;
        }
        .form-select:hover { 
            border-color: var(--border-color); 
            background: var(--bg-tertiary);
        }
        .form-select:focus { 
            border-color: var(--accent); 
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        
        /* Modern Button-Style Change Type Selector */
        .change-type-buttons {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
        }
        .change-type-btn {
            display: flex; flex-direction: column; align-items: center; gap: 8px;
            padding: 16px 12px; background: var(--bg-primary);
            border: 2px solid var(--border-subtle); border-radius: var(--radius-md);
            color: var(--text-secondary); font-size: 13px; font-weight: 500;
            cursor: pointer; transition: all 0.2s; position: relative;
            min-height: 90px;
        }
        .change-type-btn:hover {
            border-color: var(--accent); background: var(--bg-tertiary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-sm);
        }
        .change-type-btn.active {
            border-color: var(--accent); background: rgba(99, 102, 241, 0.1);
            color: var(--accent);
        }
        .change-type-btn.active::before {
            content: '';
            position: absolute; top: 8px; right: 8px;
            width: 8px; height: 8px;
            background: var(--accent); border-radius: 50%;
        }
        .change-type-btn svg {
            width: 24px; height: 24px; stroke-width: 2;
        }
        .change-type-btn span {
            font-size: 13px; font-weight: 500;
        }
        .change-type-btn.active svg {
            color: var(--accent);
        }
        
        .form-actions {
            margin-top: 8px; padding-top: 20px;
            border-top: 1px solid var(--border-subtle);
        }
        .btn-primary {
            display: flex; align-items: center; justify-content: center; gap: 10px;
            padding: 14px 28px; background: var(--accent); color: white;
            border: none; border-radius: var(--radius-md); font-size: 14px;
            font-weight: 600; cursor: pointer; transition: all 0.2s;
            width: 100%; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }
        .btn-primary:hover:not(:disabled) {
            background: var(--accent-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
        .btn-primary:active:not(:disabled) {
            transform: translateY(0);
        }
        .btn-primary:disabled {
            opacity: 0.5; cursor: not-allowed;
            transform: none; box-shadow: none;
        }
        .btn-primary svg {
            width: 18px; height: 18px;
        }
        .impact-results {
            margin-top: 24px;
        }
        .impact-empty {
            text-align: center; padding: 80px 20px; color: var(--text-muted);
        }
        .impact-empty svg {
            width: 64px; height: 64px; margin: 0 auto 24px; opacity: 0.5;
        }
        .impact-empty h3 {
            color: var(--text-primary); margin: 0 0 12px 0; font-size: 18px;
        }
        .impact-empty p {
            margin: 8px 0; font-size: 14px;
        }
        .impact-empty .hint {
            color: var(--text-dim); font-size: 12px; margin-top: 12px;
        }
        
        /* Skeleton Loader */
        .skeleton-loader {
            padding: 20px;
        }
        .skeleton-line {
            height: 16px; background: var(--bg-secondary);
            border-radius: var(--radius-sm); margin-bottom: 12px;
            animation: skeleton-pulse 1.5s ease-in-out infinite;
        }
        .skeleton-line:last-child {
            width: 60%; margin-bottom: 0;
        }
        @keyframes skeleton-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        /* Lineage Enhancements */
        .lineage-overview-empty {
            text-align: center; padding: 80px 20px; color: var(--text-muted);
        }
        .lineage-overview-empty svg {
            width: 64px; height: 64px; margin: 0 auto 24px; opacity: 0.5;
        }
        .lineage-overview-empty h3 {
            color: var(--text-primary); margin: 0 0 12px 0; font-size: 18px;
        }
        .lineage-overview-empty p {
            margin: 8px 0; font-size: 14px;
        }
        .lineage-overview-empty .hint {
            color: var(--text-dim); font-size: 12px; margin-top: 12px;
        }
        .section-header-with-action {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 16px; margin-bottom: 12px;
        }
        .view-all-btn {
            padding: 6px 12px; background: var(--bg-tertiary);
            border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
            color: var(--text-secondary); font-size: 12px; cursor: pointer;
            transition: all 0.2s; white-space: nowrap;
        }
        .view-all-btn:hover {
            background: var(--bg-hover); border-color: var(--accent);
            color: var(--text-primary);
        }

        /* ========== Table Explorer Detail View ========== */
        .table-explorer { padding: 16px; }
        .explorer-header {
            display: flex; align-items: center; gap: 12px;
            margin-bottom: 20px; padding-bottom: 12px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .explorer-header h2 {
            font-size: 20px; font-weight: 600; color: var(--text-primary); margin: 0;
        }
        .flow-panel {
            margin-top: 24px; padding: 16px;
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
        }
        .flow-panel h3 {
            font-size: 16px; font-weight: 600; color: var(--text-primary);
            margin: 0 0 12px 0;
        }
        .flow-section {
            margin-bottom: 16px;
        }
        .flow-section:last-child { margin-bottom: 0; }
        .flow-section-header {
            margin-bottom: 12px;
        }
        .flow-section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px; font-weight: 600; color: var(--text-muted);
            text-transform: uppercase; letter-spacing: 0.5px;
            margin-bottom: 6px; padding-bottom: 4px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .flow-section-title .info-icon {
            cursor: help;
            opacity: 0.6;
            transition: opacity 0.2s;
            flex-shrink: 0;
            stroke: var(--text-muted);
        }
        .flow-section-title .info-icon:hover {
            opacity: 1;
            stroke: var(--accent);
        }
        .flow-section-desc {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.5;
            margin-top: 4px;
            padding-left: 4px;
        }
        .flow-list {
            display: flex; flex-direction: column; gap: 6px;
        }
        .flow-item {
            display: flex; align-items: center; gap: 10px; padding: 8px 12px;
            background: var(--bg-tertiary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle); transition: all 0.15s;
        }
        .flow-item-internal {
            cursor: pointer;
        }
        .flow-item-internal:hover {
            background: var(--bg-hover); border-color: var(--accent);
        }
        .flow-item-external {
            opacity: 0.8;
        }
        .flow-node-icon { font-size: 16px; flex-shrink: 0; }
        .flow-node-name {
            flex: 1; font-weight: 500; color: var(--text-primary);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .flow-node-type {
            font-size: 11px; color: var(--text-muted);
            background: var(--bg-secondary); padding: 2px 6px;
            border-radius: var(--radius-sm); flex-shrink: 0;
        }
        .flow-node-type.external {
            background: rgba(71, 85, 105, 0.3); color: var(--text-dim);
        }
        .flow-node-file {
            font-size: 10px; color: var(--text-dim);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            max-width: 120px;
        }
        .column-list {
            margin-top: 20px; padding: 16px;
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
        }
        .column-list h3 {
            font-size: 16px; font-weight: 600; color: var(--text-primary);
            margin: 0 0 12px 0;
        }
        .columns-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 8px;
        }
        .column-item {
            display: flex; flex-direction: column; gap: 4px; padding: 8px 12px;
            background: var(--bg-tertiary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
        }
        .column-name {
            font-weight: 500; color: var(--text-primary); font-size: 13px;
        }
        .column-type {
            font-size: 11px; color: var(--text-muted); font-family: monospace;
        }
        .badge-primary, .badge-not-null {
            font-size: 9px; font-weight: 600; padding: 2px 4px;
            border-radius: var(--radius-sm); margin-top: 2px;
        }
        .badge-primary {
            background: var(--accent); color: white;
        }
        .badge-not-null {
            background: var(--warning); color: white;
        }

        /* ========== Lineage Overview ========== */
        .lineage-overview { padding: 10px; }
        .lineage-overview-empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
        .lineage-stats { margin-bottom: 24px; }
        .lineage-stats h3 { color: var(--text-primary); margin: 0 0 12px 0; font-size: 16px; }
        .stats-grid {
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
        }
        .stat-item {
            background: var(--bg-secondary); padding: 16px; border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle); text-align: center;
        }
        .stat-item .stat-value { display: block; font-size: 24px; font-weight: 700; color: var(--accent); }
        .stat-item .stat-label { display: block; font-size: 12px; color: var(--text-muted); margin-top: 4px; }
        .lineage-section { margin-bottom: 24px; }
        .lineage-section h3 { color: var(--text-primary); margin: 0 0 8px 0; font-size: 14px; }
        .section-hint { color: var(--text-muted); font-size: 12px; margin: 0 0 12px 0; }
        .node-list { display: flex; flex-direction: column; gap: 6px; }
        .node-item {
            display: flex; align-items: center; gap: 10px; padding: 10px 14px;
            background: var(--bg-secondary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle); cursor: pointer; transition: all 0.15s;
        }
        .node-item:hover { background: var(--bg-tertiary); border-color: var(--accent); }
        .node-icon { font-size: 16px; }
        .node-name { flex: 1; font-weight: 500; color: var(--text-primary); }
        .node-type { font-size: 11px; color: var(--text-muted); background: var(--bg-tertiary); padding: 2px 6px; border-radius: var(--radius-sm); }
        .connection-count {
            font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-sm);
            min-width: 28px; text-align: center;
        }
        .connection-count.has-connections { background: var(--accent); color: white; }
        .connection-count.no-connections { background: var(--bg-tertiary); color: var(--text-muted); }
        .node-item.no-connections { opacity: 0.6; }
        .node-item.no-connections:hover { opacity: 1; }
        .more-items { padding: 8px 14px; color: var(--text-muted); font-size: 12px; font-style: italic; }
        .lineage-tip {
            background: var(--bg-tertiary); padding: 12px 16px; border-radius: var(--radius-md);
            font-size: 12px; color: var(--text-muted);
        }
        .lineage-tip strong { color: var(--text-secondary); }

        /* ========== Visual Lineage Graph ========== */
        .lineage-visual-container {
            padding: 20px;
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            flex: 1;
            justify-content: center; /* Vertically center content */
            overflow-y: auto;
        }
        .lineage-search-panel {
            margin-bottom: 24px;
        }
        .search-header h3 {
            color: var(--text-primary);
            font-size: 18px;
            margin: 0 0 8px 0;
        }
        .search-hint {
            color: var(--text-muted);
            font-size: 13px;
            margin: 0 0 16px 0;
        }
        .search-form {
            position: relative;
            margin-bottom: 16px;
        }
        .search-input-wrapper {
            display: flex;
            align-items: center;
            gap: 10px;
            background: var(--bg-secondary);
            border: 2px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 12px 16px;
            transition: all 0.2s;
        }
        .search-input-wrapper:focus-within {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .search-input-wrapper .search-icon {
            width: 18px;
            height: 18px;
            color: var(--text-dim);
            flex-shrink: 0;
        }
        .lineage-search-input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--text-primary);
            font-size: 14px;
            outline: none;
        }
        .lineage-search-input::placeholder {
            color: var(--text-dim);
        }
        .search-clear-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            color: var(--text-dim);
            cursor: pointer;
            padding: 4px;
            border-radius: var(--radius-sm);
        }
        .search-clear-btn:hover {
            color: var(--error);
            background: rgba(239, 68, 68, 0.1);
        }
        .search-clear-btn svg {
            width: 16px;
            height: 16px;
        }
        .search-results {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            max-height: 300px;
            overflow-y: auto;
            z-index: 100;
            margin-top: 4px;
        }
        .search-result-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            cursor: pointer;
            border-bottom: 1px solid var(--border-subtle);
            transition: background 0.15s;
        }
        .search-result-item:last-child {
            border-bottom: none;
        }
        .search-result-item:hover {
            background: var(--bg-tertiary);
        }
        .search-result-item .result-icon {
            font-size: 16px;
        }
        .search-result-item .result-name {
            flex: 1;
            font-weight: 500;
            color: var(--text-primary);
        }
        .search-result-item .result-type {
            font-size: 11px;
            color: var(--text-muted);
            background: var(--bg-tertiary);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
        }
        .search-result-item .result-file {
            font-size: 11px;
            color: var(--text-dim);
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* Quick Filters */
        .quick-filters {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
        }
        .quick-filters .filter-label {
            font-size: 12px;
            color: var(--text-muted);
        }
        .filter-chip {
            padding: 6px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .filter-chip:hover {
            border-color: var(--accent);
            color: var(--text-primary);
        }
        .filter-chip.active {
            background: var(--accent);
            border-color: var(--accent);
            color: white;
        }

        /* File Filter */
        .file-filter-section {
            margin-bottom: 20px;
        }
        .file-filter-section .filter-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-muted);
            margin-bottom: 8px;
        }
        .file-filter-select {
            width: 100%;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 13px;
            padding: 8px 12px;
            min-height: 80px;
            outline: none;
        }
        .file-filter-select:focus {
            border-color: var(--accent);
        }

        /* Recent Selections */
        .recent-selections {
            margin-bottom: 20px;
        }
        .recent-selections h4 {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        .recent-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .recent-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.15s;
        }
        .recent-item:hover {
            border-color: var(--accent);
            background: var(--bg-tertiary);
        }
        .recent-icon { font-size: 14px; }
        .recent-name { font-size: 12px; color: var(--text-primary); }
        .recent-type { font-size: 10px; color: var(--text-dim); }

        /* Popular Tables */
        .popular-tables {
            margin-bottom: 24px;
        }
        .popular-tables h4 {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        .popular-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 8px;
        }
        .popular-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 14px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.2s;
        }
        .popular-item:hover {
            border-color: var(--accent);
            background: var(--bg-tertiary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-sm);
        }
        .popular-icon { font-size: 18px; }
        .popular-name { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        .popular-type-badge {
            font-size: 10px;
            color: var(--text-dim);
            background: var(--bg-tertiary);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
            text-transform: uppercase;
        }
        .popular-connections {
            display: flex;
            gap: 6px;
            font-size: 11px;
            font-weight: 500;
        }
        .popular-connections .conn-up {
            color: var(--success-light);
        }
        .popular-connections .conn-down {
            color: var(--accent);
        }
        .popular-item.filtered-out {
            display: none;
        }
        .no-popular {
            color: var(--text-dim);
            font-size: 12px;
            font-style: italic;
        }

        /* Stats Summary */
        .lineage-stats-summary {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            padding: 16px;
            background: var(--bg-secondary);
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
        }
        .stat-chip {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            background: var(--bg-tertiary);
            border-radius: var(--radius-md);
        }
        .stat-chip .stat-icon { font-size: 16px; }
        .stat-chip .stat-count { font-size: 16px; font-weight: 700; color: var(--accent); }
        .stat-chip .stat-label { font-size: 12px; color: var(--text-muted); }

        /* Graph View */
        .lineage-graph-view {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0; /* Critical for nested flex to work */
            overflow: hidden;
        }
        .graph-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
            flex-shrink: 0;
        }
        .graph-title {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .graph-title .graph-icon { font-size: 20px; }
        .graph-title h3 { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
        .node-type-badge {
            font-size: 11px;
            color: var(--text-muted);
            background: var(--bg-tertiary);
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            text-transform: uppercase;
        }
        .graph-stats {
            display: flex;
            gap: 16px;
        }
        .graph-stats .stat {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-muted);
        }
        .graph-stats .stat.upstream { color: var(--success-light); }
        .graph-stats .stat.downstream { color: var(--accent); }

        /* Direction Controls */
        .direction-controls {
            display: flex;
            gap: 4px;
            padding: 8px 16px;
            background: var(--bg-primary);
            border-bottom: 1px solid var(--border-subtle);
            flex-shrink: 0;
        }
        .direction-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .direction-btn:hover {
            border-color: var(--accent);
            background: var(--bg-tertiary);
        }
        .direction-btn.active {
            background: var(--accent);
            border-color: var(--accent);
            color: white;
        }
        .direction-btn svg { width: 16px; height: 16px; }

        /* Graph Container */
        .lineage-graph-container {
            flex: 1;
            min-height: 0;
            overflow: hidden;
            background: var(--bg-primary);
            position: relative;
        }
        .lineage-graph-svg {
            width: 100%;
            height: 100%;
            cursor: grab;
            user-select: none;
        }
        .lineage-graph-svg:active {
            cursor: grabbing;
        }

        /* Zoom Controls */
        .lineage-zoom-controls {
            position: absolute;
            bottom: 16px;
            left: 16px;
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 10px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-md);
            z-index: 10;
        }
        .lineage-zoom-controls .zoom-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            background: var(--bg-tertiary);
            border: none;
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.15s;
        }
        .lineage-zoom-controls .zoom-btn:hover {
            background: var(--bg-hover);
            color: var(--text-primary);
        }
        .lineage-zoom-controls .zoom-btn svg {
            width: 14px;
            height: 14px;
        }
        .lineage-zoom-controls .zoom-level {
            font-size: 11px;
            font-family: monospace;
            color: var(--text-muted);
            min-width: 40px;
            text-align: center;
        }
        .lineage-zoom-controls .zoom-divider {
            width: 1px;
            height: 20px;
            background: var(--border-subtle);
            margin: 0 4px;
        }

        /* Graph Node Styles */
        .lineage-node {
            cursor: pointer;
            transition: opacity 0.2s, filter 0.2s;
        }
        .lineage-node .node-bg {
            stroke-width: 2;
            transition: all 0.2s;
        }
        .lineage-node-table .node-bg {
            fill: var(--node-table);
            stroke: var(--node-table-border);
        }
        .lineage-node-view .node-bg {
            fill: var(--node-view);
            stroke: var(--node-view-border);
        }
        .lineage-node-cte .node-bg {
            fill: var(--accent);
            stroke: var(--accent-hover);
        }
        .lineage-node-external .node-bg {
            fill: var(--node-external);
            stroke: var(--node-external-border);
        }
        .lineage-node:hover .node-bg {
            filter: brightness(1.1);
        }
        .lineage-node.focused .node-bg {
            stroke-width: 3;
            filter: drop-shadow(0 0 8px var(--accent));
        }
        .lineage-node.center .node-bg {
            stroke-width: 3;
            stroke: var(--warning-light);
        }
        .lineage-node.dimmed {
            opacity: 0.3;
        }
        .lineage-node.highlighted .node-bg {
            stroke-width: 3;
            stroke: var(--accent);
        }
        .lineage-node .node-icon {
            font-size: 14px;
            fill: white;
        }
        .lineage-node .node-name {
            font-size: 12px;
            font-weight: 600;
            fill: white;
        }
        .lineage-node .node-type {
            font-size: 10px;
            fill: rgba(255, 255, 255, 0.75);
        }
        .lineage-node .node-divider {
            stroke: rgba(255, 255, 255, 0.2);
            stroke-width: 1;
        }
        .lineage-node .column-dot {
            fill: rgba(255, 255, 255, 0.5);
        }
        .lineage-node .column-dot.primary {
            fill: var(--warning-light);
        }
        .lineage-node .column-name {
            font-size: 11px;
            fill: rgba(255, 255, 255, 0.9);
        }
        .lineage-node .column-type {
            font-size: 10px;
            fill: rgba(255, 255, 255, 0.6);
            font-family: monospace;
        }
        .lineage-node .expand-btn rect {
            cursor: pointer;
        }
        .lineage-node .expand-text {
            font-size: 10px;
            fill: rgba(255, 255, 255, 0.7);
            cursor: pointer;
        }
        .lineage-node .count-badge {
            font-size: 10px;
            fill: var(--text-muted);
        }

        /* Column Row States */
        .lineage-node .column-row {
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .lineage-node .column-row:hover {
            opacity: 1;
        }
        .lineage-node .column-row:hover .column-name {
            fill: white;
        }
        .lineage-node .column-row.selected .column-name {
            fill: white;
            font-weight: 600;
        }
        .lineage-node .column-row.selected .column-state {
            fill: var(--accent);
        }
        .lineage-node .column-row.in-path .column-name {
            fill: rgba(255, 255, 255, 0.95);
        }
        .lineage-node .column-row.in-path .column-state {
            fill: #22c55e;  /* Green for upstream */
        }
        .lineage-node.downstream .column-row.in-path .column-state {
            fill: #3b82f6;  /* Blue for downstream */
        }
        .lineage-node .column-row.dimmed {
            opacity: 0.3;
        }
        .lineage-node .column-state {
            font-size: 10px;
            fill: rgba(255, 255, 255, 0.6);
        }

        /* Column Lineage Info Panel */
        .column-lineage-info {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 12px 16px;
            box-shadow: var(--shadow-lg);
            z-index: 100;
            min-width: 280px;
            display: none;
        }
        .column-lineage-info .info-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .column-lineage-info .info-icon { font-size: 14px; }
        .column-lineage-info .info-title {
            font-weight: 600;
            color: var(--text-primary);
            flex: 1;
            font-family: monospace;
            font-size: 13px;
        }
        .column-lineage-info .info-close {
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            padding: 0;
        }
        .column-lineage-info .info-close:hover {
            color: var(--text-primary);
        }
        .column-lineage-info .info-stats {
            display: flex;
            gap: 16px;
            margin-bottom: 8px;
        }
        .column-lineage-info .info-stats .stat {
            font-size: 12px;
            color: var(--text-secondary);
        }
        .column-lineage-info .info-stats .stat.upstream {
            color: #22c55e;
        }
        .column-lineage-info .info-stats .stat.downstream {
            color: #3b82f6;
        }
        .column-lineage-info .info-hint {
            font-size: 11px;
            color: var(--text-muted);
        }

        /* Graph Edge Styles */
        .lineage-edge {
            fill: none;
            stroke: var(--text-dim);
            stroke-width: 2;
            transition: stroke 0.2s, stroke-width 0.2s;
        }
        .lineage-edge-direct { stroke: #64748b; }
        .lineage-edge-join { stroke: #a78bfa; }
        .lineage-edge-transform { stroke: #f59e0b; }
        .lineage-edge.highlighted {
            stroke: var(--accent);
            stroke-width: 3;
        }

        /* Column Lineage Edge Styles */
        .column-lineage-edge {
            pointer-events: none;
            transition: stroke-opacity 0.2s;
        }
        .column-edge-upstream {
            stroke: #22c55e;
            stroke-dasharray: 4, 2;
        }
        .column-edge-downstream {
            stroke: #3b82f6;
            stroke-dasharray: 4, 2;
        }

        /* Tooltip */
        .lineage-tooltip {
            position: absolute;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 12px 16px;
            box-shadow: var(--shadow-lg);
            z-index: 1000;
            min-width: 220px;
            max-width: 300px;
            pointer-events: none;
        }
        .lineage-tooltip .tooltip-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .lineage-tooltip .tooltip-icon { font-size: 18px; }
        .lineage-tooltip .tooltip-name { font-weight: 600; color: var(--text-primary); }
        .lineage-tooltip .tooltip-divider {
            height: 1px;
            background: var(--border-subtle);
            margin: 8px 0;
        }
        .lineage-tooltip .tooltip-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin-bottom: 4px;
        }
        .lineage-tooltip .label { color: var(--text-muted); }
        .lineage-tooltip .value { color: var(--text-secondary); }
        .lineage-tooltip .tooltip-hint {
            font-size: 11px;
            color: var(--text-dim);
            text-align: center;
        }

        /* Context Menu */
        .lineage-context-menu {
            position: absolute;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            min-width: 180px;
            z-index: 1001;
            padding: 4px 0;
        }
        .lineage-context-menu .context-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 14px;
            font-size: 12px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.1s;
        }
        .lineage-context-menu .context-item:hover {
            background: var(--accent);
            color: white;
        }
        .lineage-context-menu .context-divider {
            height: 1px;
            background: var(--border-subtle);
            margin: 4px 0;
        }

        /* Empty States */
        .lineage-empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            text-align: center;
            color: var(--text-muted);
        }
        .lineage-empty-state svg {
            opacity: 0.5;
            margin-bottom: 20px;
        }
        .lineage-empty-state h3 {
            font-size: 18px;
            color: var(--text-primary);
            margin: 0 0 12px 0;
        }
        .lineage-empty-state p {
            margin: 4px 0;
            font-size: 14px;
        }
        .lineage-empty-state .hint {
            font-size: 12px;
            color: var(--text-dim);
            margin-top: 12px;
        }

        .lineage-no-relations {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            text-align: center;
        }
        .lineage-no-relations .single-node {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 16px 24px;
            background: var(--bg-secondary);
            border: 2px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            margin-bottom: 20px;
        }
        .lineage-no-relations .node-icon { font-size: 24px; }
        .lineage-no-relations .node-name { font-size: 16px; font-weight: 600; color: var(--text-primary); }
        .lineage-no-relations .no-relations-msg {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }
        .lineage-no-relations .hint {
            font-size: 12px;
            color: var(--text-dim);
        }
        .lineage-no-relations .direction-suggestion {
            margin-top: 24px;
            text-align: center;
        }
        .lineage-no-relations .direction-suggestion p {
            font-size: 12px;
            color: var(--text-muted);
            margin-bottom: 12px;
        }
        .lineage-no-relations .suggestion-buttons {
            display: flex;
            justify-content: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .lineage-no-relations .node-type-badge {
            font-size: 11px;
            color: var(--text-muted);
            background: var(--bg-tertiary);
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            text-transform: uppercase;
        }

        /* ========== Stats Bar ========== */
        .stats-bar {
            display: flex; align-items: center; gap: 6px; padding: 8px 16px;
            background: var(--bg-secondary); border-bottom: 1px solid var(--border-subtle);
            font-size: 12px; color: var(--text-muted);
        }
        .stats-bar .stat { display: flex; align-items: center; gap: 4px; }
        .stats-bar .stat-value { font-weight: 600; color: var(--text-primary); }
        .stats-bar .separator { color: var(--text-dim); }
        .legend-inline {
            display: flex; align-items: center; gap: 16px; padding: 6px 16px;
            background: var(--bg-secondary); border-bottom: 1px solid var(--border-subtle);
            font-size: 11px; color: var(--text-muted); flex-wrap: wrap;
        }
        .legend-inline-group { display: flex; align-items: center; gap: 8px; }
        .legend-inline-item { display: flex; align-items: center; gap: 6px; }
        .legend-inline-node {
            width: 12px; height: 12px; border-radius: 3px;
            border: 1px solid transparent; flex-shrink: 0;
        }
        .legend-inline-node.file { background: var(--node-file); border-color: var(--node-file-border); }
        .legend-inline-node.table { background: var(--node-table); border-color: var(--node-table-border); }
        .legend-inline-node.view { background: var(--node-view); border-color: var(--node-view-border); }
        .legend-inline-node.external { background: var(--node-external); border-color: var(--node-external-border); border-style: dashed; }
        .legend-inline-edge { width: 16px; height: 2px; border-radius: 2px; flex-shrink: 0; }
        .legend-inline-edge.select { background: #64748b; }
        .legend-inline-edge.join { background: #a78bfa; }
        .legend-inline-edge.insert { background: #10b981; }
        .legend-inline-edge.update { background: #fbbf24; }
        .legend-inline-edge.delete { background: #f87171; }

        /* ========== Issue Banner ========== */
        .issue-banner {
            display: flex; align-items: center; gap: 12px; padding: 10px 16px;
            border-bottom: 1px solid var(--border-subtle); font-size: 13px;
        }
        .issue-banner.warning { background: rgba(245, 158, 11, 0.1); }
        .issue-banner.success { background: rgba(16, 185, 129, 0.1); }
        .issue-banner-icon { flex-shrink: 0; }
        .issue-banner-text { flex: 1; }
        .issue-banner-text strong { color: var(--text-primary); }
        .issue-banner-btn {
            background: transparent; border: 1px solid var(--border-color);
            color: var(--text-secondary); padding: 5px 12px; border-radius: var(--radius-md);
            font-size: 12px; cursor: pointer; transition: all 0.15s;
        }
        .issue-banner-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }

        /* ========== Main Layout ========== */
        .main-layout { display: flex; flex: 1; overflow: hidden; }
        .graph-area { flex: 1; position: relative; overflow: hidden; }

        /* ========== Sidebar ========== */
        .sidebar {
            width: 280px; background: var(--bg-secondary); border-left: 1px solid var(--border-subtle);
            display: flex; flex-direction: column; overflow: hidden;
            transition: width 0.2s, opacity 0.2s;
        }
        .sidebar.collapsed { width: 0; opacity: 0; pointer-events: none; }
        .sidebar-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; border-bottom: 1px solid var(--border-subtle);
        }
        .sidebar-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .sidebar-close {
            background: transparent; border: none; color: var(--text-muted);
            cursor: pointer; padding: 4px; border-radius: var(--radius-sm);
        }
        .sidebar-close:hover { color: var(--text-primary); background: var(--bg-tertiary); }
        .sidebar-content { flex: 1; overflow-y: auto; padding: 8px 0; }

        /* ========== Sidebar Sections ========== */
        .sidebar-section { margin-bottom: 8px; }
        .section-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 16px; cursor: pointer; user-select: none;
        }
        .section-header:hover { background: var(--bg-tertiary); }
        .section-title {
            display: flex; align-items: center; gap: 8px;
            font-size: 12px; font-weight: 600; color: var(--text-muted);
            text-transform: uppercase; letter-spacing: 0.5px;
        }
        .section-badge {
            background: var(--error); color: white; padding: 2px 6px;
            border-radius: 10px; font-size: 10px; font-weight: 600;
        }
        .section-badge.warning { background: var(--warning); }
        .section-toggle {
            color: var(--text-dim); font-size: 10px; transition: transform 0.2s;
        }
        .section-header.expanded .section-toggle { transform: rotate(180deg); }
        .section-content {
            max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out;
        }
        .section-header.expanded + .section-content { max-height: 400px; overflow-y: auto; }

        /* ========== Legend Items ========== */
        .legend-grid { padding: 8px 16px; }
        .legend-group { margin-bottom: 12px; }
        .legend-group:last-child { margin-bottom: 0; }
        .legend-group-title {
            font-size: 10px; font-weight: 600; color: var(--text-dim);
            text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
        }
        .legend-item {
            display: flex; align-items: center; gap: 10px;
            padding: 4px 0; font-size: 12px; color: var(--text-secondary);
        }
        .legend-node {
            width: 14px; height: 14px; border-radius: 3px; border: 2px solid;
            flex-shrink: 0;
        }
        .legend-node.file { background: var(--node-file); border-color: var(--node-file-border); }
        .legend-node.table { background: var(--node-table); border-color: var(--node-table-border); }
        .legend-node.view { background: var(--node-view); border-color: var(--node-view-border); }
        .legend-node.external { background: var(--node-external); border-color: var(--node-external-border); border-style: dashed; }
        .legend-edge { width: 20px; height: 3px; border-radius: 2px; flex-shrink: 0; }
        .legend-edge.select { background: #64748b; }
        .legend-edge.join { background: #a78bfa; }
        .legend-edge.insert { background: #10b981; }
        .legend-edge.update { background: #fbbf24; }
        .legend-edge.delete { background: #f87171; }

        /* ========== Issue List ========== */
        .issue-list { padding: 0 12px 8px; }
        .issue-item {
            display: flex; align-items: center; gap: 10px; padding: 8px 10px;
            background: var(--bg-primary); border-radius: var(--radius-md);
            margin-bottom: 4px; cursor: pointer; transition: all 0.15s;
            border: 1px solid transparent;
        }
        .issue-item:hover { background: var(--bg-tertiary); border-color: var(--border-color); }
        .issue-item:last-child { margin-bottom: 0; }
        .issue-type {
            padding: 2px 6px; border-radius: 3px; font-size: 9px;
            font-weight: 700; text-transform: uppercase;
        }
        .issue-type.table { background: var(--node-table); color: white; }
        .issue-type.view { background: var(--node-view); color: white; }
        .issue-type.missing { background: var(--error); color: white; }
        .issue-info { flex: 1; min-width: 0; }
        .issue-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
        .issue-path { font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .issue-line { font-size: 10px; color: var(--text-dim); font-family: monospace; }
        .issue-more {
            text-align: center; padding: 8px; font-size: 11px; color: var(--text-dim);
        }

        /* ========== Export Buttons ========== */
        .export-grid { padding: 8px 16px; display: flex; flex-direction: column; gap: 6px; }
        .export-btn {
            display: flex; align-items: center; gap: 10px; padding: 10px 12px;
            background: var(--bg-primary); border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md); color: var(--text-secondary);
            font-size: 12px; cursor: pointer; transition: all 0.15s; width: 100%;
        }
        .export-btn:hover { background: var(--bg-tertiary); border-color: var(--border-color); }
        .export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .export-btn svg { width: 16px; height: 16px; flex-shrink: 0; }

        /* ========== Zoom Toolbar ========== */
        .zoom-toolbar {
            position: absolute; bottom: 16px; left: 16px;
            display: flex; align-items: center; gap: 4px;
            background: var(--bg-secondary); padding: 6px 8px;
            border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);
            box-shadow: var(--shadow-md); z-index: 10;
        }
        .zoom-btn {
            display: flex; align-items: center; justify-content: center;
            width: 28px; height: 28px; background: var(--bg-tertiary);
            border: none; border-radius: var(--radius-sm); color: var(--text-secondary);
            cursor: pointer; transition: all 0.15s; font-size: 14px;
        }
        .zoom-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .zoom-btn svg { width: 14px; height: 14px; }
        .zoom-divider { width: 1px; height: 20px; background: var(--border-subtle); margin: 0 4px; }
        .zoom-level {
            font-size: 11px; color: var(--text-muted); min-width: 40px;
            text-align: center; font-family: monospace;
        }

        /* ========== SVG Container ========== */
        #graph-svg { width: 100%; height: 100%; cursor: grab; }
        #graph-svg:active { cursor: grabbing; }

        /* ========== Node Styles ========== */
        .node { cursor: pointer; transition: opacity 0.2s; }
        .node:hover rect { filter: brightness(1.15); }
        .node.highlighted rect { filter: brightness(1.3); stroke: var(--warning-light); stroke-width: 3; }
        .node.dimmed { opacity: 0.25; }
        .node-file rect { fill: var(--node-file); stroke: var(--node-file-border); stroke-width: 2; }
        .node-table rect { fill: var(--node-table); stroke: var(--node-table-border); stroke-width: 2; }
        .node-view rect { fill: var(--node-view); stroke: var(--node-view-border); stroke-width: 2; }
        .node-external rect { fill: var(--node-external); stroke: var(--node-external-border); stroke-width: 2; stroke-dasharray: 5,3; }
        .node-label { fill: #fff; font-size: 12px; font-weight: 600; }
        .node-sublabel { fill: rgba(255,255,255,0.75); font-size: 10px; }

        /* ========== Edge Styles ========== */
        .edge { fill: none; stroke-width: 2; }
        .edge-select { stroke: #64748b; }
        .edge-join { stroke: #a78bfa; }
        .edge-insert { stroke: #10b981; }
        .edge-update { stroke: #fbbf24; }
        .edge-delete { stroke: #f87171; }
        .edge-label { fill: var(--text-muted); font-size: 10px; }

        /* ========== Tooltip ========== */
        .tooltip {
            position: absolute; padding: 10px 14px; background: var(--bg-secondary);
            border: 1px solid var(--border-color); border-radius: var(--radius-lg);
            font-size: 12px; pointer-events: none; z-index: 1000; max-width: 320px;
            box-shadow: var(--shadow-lg);
        }
        .tooltip-title { font-weight: 600; margin-bottom: 6px; color: var(--text-primary); }
        .tooltip-content { color: var(--text-muted); line-height: 1.4; }
        .tooltip-list { margin-top: 8px; padding-left: 14px; }
        .tooltip-list li { margin: 3px 0; }

        /* ========== Empty State ========== */
        .empty-state {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 100%; gap: 16px; color: var(--text-muted);
        }
        .empty-state svg { width: 64px; height: 64px; opacity: 0.4; }
        .empty-state-title { font-size: 18px; font-weight: 600; color: var(--text-secondary); }

        /* ========== Keyboard Hints ========== */
        .kbd {
            background: var(--bg-primary); border: 1px solid var(--border-subtle);
            border-radius: 3px; padding: 2px 6px; font-family: monospace;
            font-size: 10px; color: var(--text-muted);
        }
        .shortcuts { padding: 8px 16px; }
        .shortcut-item {
            display: flex; align-items: center; gap: 10px;
            padding: 4px 0; font-size: 12px; color: var(--text-secondary);
        }
    </style>
</head>
<body>
    <div id="app">
        <!-- Header -->
        <header class="header">
            <div class="header-left">
                <span class="header-icon">📊</span>
                <h1 class="header-title">Workspace Dependencies</h1>
            </div>

            <!-- View Mode Tabs -->
            <div class="view-tabs">
                <button class="view-tab active" data-view="graph" title="Dependency Graph">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/>
                        <path d="M14.5 9.5L17 7M9.5 14.5L7 17"/>
                    </svg>
                    Graph
                </button>
                <button class="view-tab" data-view="lineage" title="Data Lineage">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 12h4l3 9 4-18 3 9h4"/>
                    </svg>
                    Lineage
                </button>
                <button class="view-tab" data-view="tableExplorer" title="Table Explorer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
                    </svg>
                    Tables
                </button>
                <button class="view-tab" data-view="impact" title="Impact Analysis">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    Impact
                </button>
            </div>

            <div class="header-right">
                <div class="search-box">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input type="text" class="search-input" id="search-input" placeholder="Search nodes..." value="${this.escapeHtml(searchFilter.query)}">
                    <select class="search-select" id="filter-type">
                        <option value="all">All</option>
                        <option value="file" ${searchFilter.nodeTypes?.includes('file') ? 'selected' : ''}>Files</option>
                        <option value="table" ${searchFilter.nodeTypes?.includes('table') ? 'selected' : ''}>Tables</option>
                        <option value="view" ${searchFilter.nodeTypes?.includes('view') ? 'selected' : ''}>Views</option>
                        <option value="external" ${searchFilter.nodeTypes?.includes('external') ? 'selected' : ''}>External</option>
                    </select>
                    <button class="search-clear ${searchFilter.query ? 'visible' : ''}" id="btn-clear-search" title="Clear search">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <button class="icon-btn" id="btn-sidebar" title="Toggle panel">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M15 3v18"/>
                    </svg>
                </button>
                <button class="icon-btn" id="btn-refresh" title="Refresh">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                </button>
            </div>
        </header>

        <!-- Stats Bar -->
        <div class="stats-bar">
            <span class="stat"><span class="stat-value">${graph.stats.totalFiles}</span> files</span>
            <span class="separator">•</span>
            <span class="stat"><span class="stat-value">${graph.stats.totalTables}</span> tables</span>
            <span class="separator">•</span>
            <span class="stat"><span class="stat-value">${graph.stats.totalViews}</span> views</span>
            <span class="separator">•</span>
            <span class="stat"><span class="stat-value">${graph.stats.totalReferences}</span> references</span>
        </div>
        <div class="legend-inline">
            <div class="legend-inline-group">
                <span>Nodes:</span>
                <div class="legend-inline-item"><div class="legend-inline-node file"></div><span>Files</span></div>
                <div class="legend-inline-item"><div class="legend-inline-node table"></div><span>Tables</span></div>
                <div class="legend-inline-item"><div class="legend-inline-node view"></div><span>Views</span></div>
                <div class="legend-inline-item"><div class="legend-inline-node external"></div><span>External</span></div>
            </div>
            <div class="legend-inline-group">
                <span>Edges:</span>
                <div class="legend-inline-item"><div class="legend-inline-edge select"></div><span>SELECT</span></div>
                <div class="legend-inline-item"><div class="legend-inline-edge join"></div><span>JOIN</span></div>
                <div class="legend-inline-item"><div class="legend-inline-edge insert"></div><span>INSERT</span></div>
                <div class="legend-inline-item"><div class="legend-inline-edge update"></div><span>UPDATE</span></div>
                <div class="legend-inline-item"><div class="legend-inline-edge delete"></div><span>DELETE</span></div>
            </div>
        </div>

        <!-- Issue Banner -->
        ${totalIssues > 0 ? `
        <div class="issue-banner warning">
            <svg class="issue-banner-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span class="issue-banner-text">
                <strong>${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found:</strong>
                ${graph.stats.orphanedDefinitions.length > 0 ? `${graph.stats.orphanedDefinitions.length} orphaned` : ''}
                ${graph.stats.orphanedDefinitions.length > 0 && graph.stats.missingDefinitions.length > 0 ? ', ' : ''}
                ${graph.stats.missingDefinitions.length > 0 ? `${graph.stats.missingDefinitions.length} missing` : ''}
            </span>
            <button class="issue-banner-btn" id="btn-view-issues">View Details →</button>
        </div>
        ` : `
        <div class="issue-banner success">
            <svg class="issue-banner-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span class="issue-banner-text"><strong>All clear</strong> — no issues found</span>
        </div>
        `}

        <!-- Main Layout -->
        <div class="main-layout">
            <!-- Graph Area -->
            <div class="graph-area-container">
                <div class="graph-area">
                    <div id="graph-container" style="width: 100%; height: 100%;">
                        ${graph.nodes.length > 0 ? this.renderGraph(graph) : `
                        <div class="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                            </svg>
                            <div class="empty-state-title">No dependencies found</div>
                            <div>Try refreshing or check your SQL files</div>
                        </div>
                        `}
                    </div>

                <!-- Zoom Toolbar -->
                <div class="zoom-toolbar">
                    <button class="zoom-btn" id="btn-zoom-out" title="Zoom out">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <button class="zoom-btn" id="btn-zoom-in" title="Zoom in">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <div class="zoom-divider"></div>
                    <span class="zoom-level" id="zoom-level">100%</span>
                    <div class="zoom-divider"></div>
                    <button class="zoom-btn" id="btn-zoom-reset" title="Reset view">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    </button>
                    <button class="zoom-btn" id="btn-zoom-fit" title="Fit to screen">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                    </button>
                </div>
            </div>

            <!-- Sidebar -->
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-header">
                    <span class="sidebar-title">Panel</span>
                    <button class="sidebar-close" id="btn-sidebar-close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="sidebar-content">
                    <!-- Legend Section -->
                    <div class="sidebar-section">
                        <div class="section-header expanded" data-section="legend">
                            <span class="section-title">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                                </svg>
                                Legend
                            </span>
                            <span class="section-toggle">▼</span>
                        </div>
                        <div class="section-content">
                            <div class="legend-grid">
                                <div class="legend-group">
                                    <div class="legend-group-title">Nodes</div>
                                    <div class="legend-item"><div class="legend-node file"></div><span>SQL Files</span></div>
                                    <div class="legend-item"><div class="legend-node table"></div><span>Tables</span></div>
                                    <div class="legend-item"><div class="legend-node view"></div><span>Views</span></div>
                                    <div class="legend-item"><div class="legend-node external"></div><span>External (undefined)</span></div>
                                </div>
                                <div class="legend-group">
                                    <div class="legend-group-title">Edges</div>
                                    <div class="legend-item"><div class="legend-edge select"></div><span>SELECT</span></div>
                                    <div class="legend-item"><div class="legend-edge join"></div><span>JOIN</span></div>
                                    <div class="legend-item"><div class="legend-edge insert"></div><span>INSERT</span></div>
                                    <div class="legend-item"><div class="legend-edge update"></div><span>UPDATE</span></div>
                                    <div class="legend-item"><div class="legend-edge delete"></div><span>DELETE</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Issues Section -->
                    ${totalIssues > 0 ? `
                    <div class="sidebar-section">
                        <div class="section-header expanded" data-section="issues">
                            <span class="section-title">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                                Issues
                                <span class="section-badge">${totalIssues}</span>
                            </span>
                            <span class="section-toggle">▼</span>
                        </div>
                        <div class="section-content">
                            <div class="issue-list">
                                ${detailedStats.orphanedDetails.slice(0, 5).map(item => `
                                <div class="issue-item" data-filepath="${this.escapeHtml(item.filePath)}" data-line="${item.lineNumber}">
                                    <span class="issue-type ${item.type}">${item.type}</span>
                                    <div class="issue-info">
                                        <div class="issue-name">${this.escapeHtml(item.name)}</div>
                                        <div class="issue-path" title="${this.escapeHtml(item.filePath)}">${this.escapeHtml(item.filePath.split('/').pop() || item.filePath)}</div>
                                    </div>
                                    <span class="issue-line">:${item.lineNumber}</span>
                                </div>
                                `).join('')}
                                ${detailedStats.missingDetails.slice(0, 5).map(item => `
                                <div class="issue-item" data-missing="${this.escapeHtml(item.tableName)}">
                                    <span class="issue-type missing">missing</span>
                                    <div class="issue-info">
                                        <div class="issue-name">${this.escapeHtml(item.tableName)}</div>
                                        <div class="issue-path">${item.referenceCount} reference${item.referenceCount !== 1 ? 's' : ''}</div>
                                    </div>
                                </div>
                                `).join('')}
                                ${totalIssues > 10 ? `<div class="issue-more">+ ${totalIssues - 10} more issues</div>` : ''}
                                <button class="export-btn" id="btn-all-issues" style="margin-top: 8px;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                    View All Issues
                                </button>
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Export Section -->
                    <div class="sidebar-section">
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
                            <div class="export-grid">
                                <button class="export-btn" data-format="svg">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                                        <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                                    </svg>
                                    Export as SVG
                                </button>
                                <button class="export-btn" data-format="mermaid">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                    Export as Mermaid
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Shortcuts Section -->
                    <div class="sidebar-section">
                        <div class="section-header" data-section="shortcuts">
                            <span class="section-title">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                                    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h8M6 16h.01M10 16h.01M14 16h4"/>
                                </svg>
                                Shortcuts
                            </span>
                            <span class="section-toggle">▼</span>
                        </div>
                        <div class="section-content">
                            <div class="shortcuts">
                                <div class="shortcut-item"><span class="kbd">Ctrl+F</span><span>Search nodes</span></div>
                                <div class="shortcut-item"><span class="kbd">Drag</span><span>Pan the graph</span></div>
                                <div class="shortcut-item"><span class="kbd">Scroll</span><span>Zoom in/out</span></div>
                                <div class="shortcut-item"><span class="kbd">Click</span><span>Open file</span></div>
                                <div class="shortcut-item"><span class="kbd">Dbl-click</span><span>Visualize file</span></div>
                            </div>
                        </div>
                    </div>
                </div>
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
                <div class="lineage-content" id="lineage-content">
                    <!-- Dynamic lineage content will be inserted here -->
                </div>
            </div>
        </div>
        <!-- End graph-area-container -->

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
            <div class="context-menu-item" data-action="analyzeImpact">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                </svg>
                Analyze Impact
            </div>
            <div class="context-menu-item" data-action="exploreTable">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
                </svg>
                Explore Table
            </div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item" data-action="openFile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                Open File
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const graphData = ${JSON.stringify(graph)};

        // ========== Pan and Zoom State ==========
        let scale = 1;
        let offsetX = 50;
        let offsetY = 50;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        // ========== DOM Elements ==========
        const svg = document.getElementById('graph-svg');
        const mainGroup = document.getElementById('main-group');
        const searchInput = document.getElementById('search-input');
        const filterType = document.getElementById('filter-type');
        const btnClearSearch = document.getElementById('btn-clear-search');
        const sidebar = document.getElementById('sidebar');
        const zoomLevel = document.getElementById('zoom-level');
        const tooltip = document.getElementById('tooltip');

        // ========== Zoom Functions ==========
        function updateTransform() {
            if (mainGroup) {
                mainGroup.setAttribute('transform', 'translate(' + offsetX + ',' + offsetY + ') scale(' + scale + ')');
            }
            if (zoomLevel) {
                zoomLevel.textContent = Math.round(scale * 100) + '%';
            }
        }

        function zoomIn() {
            scale = Math.min(3, scale * 1.2);
            updateTransform();
        }

        function zoomOut() {
            scale = Math.max(0.2, scale / 1.2);
            updateTransform();
        }

        function resetView() {
            scale = 1;
            offsetX = 50;
            offsetY = 50;
            updateTransform();
        }

        function fitToScreen() {
            if (!svg || !mainGroup || graphData.nodes.length === 0) return;

            const container = svg.parentElement;
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const node of graphData.nodes) {
                minX = Math.min(minX, node.x);
                minY = Math.min(minY, node.y);
                maxX = Math.max(maxX, node.x + node.width);
                maxY = Math.max(maxY, node.y + node.height);
            }

            const graphWidth = maxX - minX + 100;
            const graphHeight = maxY - minY + 100;

            scale = Math.min(containerWidth / graphWidth, containerHeight / graphHeight, 1.5);
            scale = Math.max(0.2, Math.min(scale, 1.5));

            offsetX = (containerWidth - graphWidth * scale) / 2 - minX * scale + 50;
            offsetY = (containerHeight - graphHeight * scale) / 2 - minY * scale + 50;

            updateTransform();
        }

        // ========== Pan/Zoom Setup ==========
        if (svg && mainGroup) {
            updateTransform();

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

            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                scale = Math.max(0.2, Math.min(3, scale * delta));
                updateTransform();
            });
        }

        // ========== Zoom Toolbar Events ==========
        document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn);
        document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut);
        document.getElementById('btn-zoom-reset')?.addEventListener('click', resetView);
        document.getElementById('btn-zoom-fit')?.addEventListener('click', fitToScreen);

        // ========== Search Functions ==========
        function performSearch() {
            const query = searchInput.value.trim();
            const typeFilter = filterType.value;

            if (!query && typeFilter === 'all') {
                clearSearch();
                return;
            }

            let nodeTypes = undefined;
            if (typeFilter !== 'all') {
                nodeTypes = [typeFilter];
            }

            vscode.postMessage({
                command: 'search',
                filter: { query, nodeTypes, useRegex: false, caseSensitive: false }
            });

            btnClearSearch.classList.toggle('visible', query || typeFilter !== 'all');
        }

        function clearSearch() {
            searchInput.value = '';
            filterType.value = 'all';
            btnClearSearch.classList.remove('visible');
            vscode.postMessage({ command: 'clearSearch' });
        }

        let searchTimeout;
        function debouncedSearch() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 300);
        }

        searchInput?.addEventListener('input', debouncedSearch);
        filterType?.addEventListener('change', performSearch);
        btnClearSearch?.addEventListener('click', clearSearch);

        // ========== Keyboard Shortcuts ==========
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                searchInput?.focus();
                searchInput?.select();
            }
            if (e.key === 'Escape' && document.activeElement === searchInput) {
                searchInput.blur();
                clearSearch();
            }
        });

        // ========== Sidebar Toggle ==========
        document.getElementById('btn-sidebar')?.addEventListener('click', () => {
            sidebar?.classList.toggle('collapsed');
        });
        document.getElementById('btn-sidebar-close')?.addEventListener('click', () => {
            sidebar?.classList.add('collapsed');
        });

        // ========== Section Toggles ==========
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.classList.toggle('expanded');
            });
        });

        // ========== Commands ==========
        function refresh() { vscode.postMessage({ command: 'refresh' }); }
        function openFile(filePath) { vscode.postMessage({ command: 'openFile', filePath }); }
        function openFileAtLine(filePath, line) { vscode.postMessage({ command: 'openFileAtLine', filePath, line }); }
        function visualizeFile(filePath) { vscode.postMessage({ command: 'visualizeFile', filePath }); }

        document.getElementById('btn-refresh')?.addEventListener('click', refresh);
        document.getElementById('btn-view-issues')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'issues' });
        });
        document.getElementById('btn-all-issues')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'issues' });
        });

        // ========== Export Buttons ==========
        document.querySelectorAll('.export-btn[data-format]').forEach(btn => {
            btn.addEventListener('click', () => {
                const format = btn.getAttribute('data-format');
                if (format) vscode.postMessage({ command: 'export', format });
            });
        });

        // ========== View Mode Tabs ==========
        let currentViewMode = 'graph';
        let lineageDetailView = false;  // Track if we're in a detail view (upstream/downstream/table)
        const viewTabs = document.querySelectorAll('.view-tab');
        const lineagePanel = document.getElementById('lineage-panel');
        const lineageContent = document.getElementById('lineage-content');
        const lineageTitle = document.getElementById('lineage-title');
        const lineageBackBtn = document.getElementById('lineage-back-btn');
        const graphArea = document.querySelector('.graph-area');

        const viewTitles = {
            lineage: 'Data Lineage',
            tableExplorer: 'Table Explorer',
            impact: 'Impact Analysis'
        };

        const viewEmptyStates = {
            lineage: '<div class="skeleton-loader"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>',
            tableExplorer: '<div class="skeleton-loader"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>',
            impact: '<div class="skeleton-loader"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>'
        };

        function switchToView(view) {
            if (view === currentViewMode) return;

            // Update tab active state
            viewTabs.forEach(t => {
                if (t.getAttribute('data-view') === view) {
                    t.classList.add('active');
                } else {
                    t.classList.remove('active');
                }
            });
            currentViewMode = view;

            // Handle view switching
            if (view === 'graph') {
                lineagePanel?.classList.remove('visible');
                if (graphArea) graphArea.style.display = '';
            } else {
                // Show lineage panel with appropriate content
                if (graphArea) graphArea.style.display = 'none';
                lineagePanel?.classList.add('visible');

                // Set title
                if (lineageTitle) {
                    lineageTitle.textContent = viewTitles[view] || 'Data Lineage';
                }

                // Set empty state content
                if (lineageContent) {
                    lineageContent.innerHTML = viewEmptyStates[view] || '';
                }

                // Notify extension
                if (view === 'lineage') {
                    vscode.postMessage({ command: 'switchToLineageView' });
                } else if (view === 'tableExplorer') {
                    vscode.postMessage({ command: 'switchToTableExplorer' });
                } else if (view === 'impact') {
                    vscode.postMessage({ command: 'switchToImpactView' });
                }
            }
        }

        viewTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                const view = tab.getAttribute('data-view');
                switchToView(view);
            });
        });

        // Helper to update back button text
        function updateBackButtonText() {
            if (!lineageBackBtn) return;
            if (lineageDetailView && currentViewMode !== 'graph') {
                // In detail view - show "Back to [Tab Name]"
                const tabNames = { lineage: 'Lineage', tableExplorer: 'Tables', impact: 'Impact' };
                lineageBackBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back to ' + (tabNames[currentViewMode] || 'Overview');
            } else {
                // In overview - show "Back to Graph"
                lineageBackBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back to Graph';
            }
        }

        // Back button handler - returns to tab overview if in detail view, otherwise to graph
        lineageBackBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (lineageDetailView && currentViewMode !== 'graph') {
                // Return to the current tab's overview
                lineageDetailView = false;
                updateBackButtonText();
                if (currentViewMode === 'lineage') {
                    if (lineageTitle) lineageTitle.textContent = 'Data Lineage';
                    vscode.postMessage({ command: 'switchToLineageView' });
                } else if (currentViewMode === 'tableExplorer') {
                    if (lineageTitle) lineageTitle.textContent = 'Table Explorer';
                    vscode.postMessage({ command: 'switchToTableExplorer' });
                } else if (currentViewMode === 'impact') {
                    if (lineageTitle) lineageTitle.textContent = 'Impact Analysis';
                    vscode.postMessage({ command: 'switchToImpactView' });
                }
            } else {
                // Go back to graph view
                switchToView('graph');
            }
        });

        // ========== Context Menu ==========
        const contextMenu = document.getElementById('context-menu');
        let contextMenuTarget = null;

        function showContextMenu(e, nodeData) {
            e.preventDefault();
            contextMenuTarget = nodeData;

            contextMenu.style.left = e.clientX + 'px';
            contextMenu.style.top = e.clientY + 'px';
            contextMenu.classList.add('visible');

            // Enable/disable items based on node type
            const exploreItem = contextMenu.querySelector('[data-action="exploreTable"]');
            if (exploreItem) {
                if (nodeData.type === 'file') {
                    exploreItem.classList.add('disabled');
                } else {
                    exploreItem.classList.remove('disabled');
                }
            }
        }

        function hideContextMenu() {
            contextMenu?.classList.remove('visible');
            contextMenuTarget = null;
        }

        // Hide context menu on click, but not on context menu items or view tabs
        document.addEventListener('click', (e) => {
            // Don't hide if clicking inside context menu
            if (e.target.closest('.context-menu')) return;
            // Don't hide if clicking view tabs
            if (e.target.closest('.view-tabs')) return;
            hideContextMenu();
        });

        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.node')) {
                hideContextMenu();
            }
        });

        // Context menu item handlers
        contextMenu?.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the document click handler from firing
                if (!contextMenuTarget || item.classList.contains('disabled')) return;

                const action = item.getAttribute('data-action');
                const nodeName = contextMenuTarget.label || contextMenuTarget.id;

                switch (action) {
                    case 'showUpstream':
                        switchToView('lineage');
                        if (lineageTitle) lineageTitle.textContent = 'Upstream of ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="lineage-empty"><p>Loading upstream dependencies...</p></div>';
                        // For file nodes, pass filePath; for table/view nodes, construct proper nodeId
                        if (contextMenuTarget.type === 'file') {
                            vscode.postMessage({
                                command: 'getUpstream',
                                nodeType: 'file',
                                filePath: contextMenuTarget.filePath,
                                depth: 5
                            });
                        } else {
                            const nodeType = contextMenuTarget.type === 'external' ? 'external' : contextMenuTarget.type;
                            vscode.postMessage({
                                command: 'getUpstream',
                                nodeId: nodeType + ':' + nodeName.toLowerCase(),
                                depth: 5
                            });
                        }
                        break;
                    case 'showDownstream':
                        switchToView('lineage');
                        if (lineageTitle) lineageTitle.textContent = 'Downstream of ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="lineage-empty"><p>Loading downstream dependencies...</p></div>';
                        // For file nodes, pass filePath; for table/view nodes, construct proper nodeId
                        if (contextMenuTarget.type === 'file') {
                            vscode.postMessage({
                                command: 'getDownstream',
                                nodeType: 'file',
                                filePath: contextMenuTarget.filePath,
                                depth: 5
                            });
                        } else {
                            const nodeType = contextMenuTarget.type === 'external' ? 'external' : contextMenuTarget.type;
                            vscode.postMessage({
                                command: 'getDownstream',
                                nodeId: nodeType + ':' + nodeName.toLowerCase(),
                                depth: 5
                            });
                        }
                        break;
                    case 'analyzeImpact':
                        switchToView('impact');
                        if (lineageTitle) lineageTitle.textContent = 'Impact Analysis: ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="lineage-empty"><p>Analyzing impact...</p></div>';
                        vscode.postMessage({
                            command: 'analyzeImpact',
                            type: contextMenuTarget.type === 'file' ? 'table' : 'table',
                            name: nodeName,
                            changeType: 'modify'
                        });
                        break;
                    case 'exploreTable':
                        switchToView('tableExplorer');
                        if (lineageTitle) lineageTitle.textContent = 'Table: ' + nodeName;
                        if (lineageContent) lineageContent.innerHTML = '<div class="lineage-empty"><p>Loading table details...</p></div>';
                        vscode.postMessage({
                            command: 'exploreTable',
                            tableName: nodeName
                        });
                        break;
                    case 'openFile':
                        if (contextMenuTarget.filePath) {
                            openFile(contextMenuTarget.filePath);
                        }
                        break;
                }
                hideContextMenu();
            });
        });

        // ========== Message Handling from Extension ==========
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'lineageResult':
                case 'upstreamResult':
                case 'downstreamResult':
                    if (lineageContent && message.data) {
                        const nodes = message.data.nodes || message.data.result?.nodes || [];
                        let html = '<h2>' + (message.command === 'upstreamResult' ? 'Upstream' : message.command === 'downstreamResult' ? 'Downstream' : 'Lineage') + ' Analysis</h2>';
                        html += '<p style="color: var(--text-muted); margin-bottom: 16px;">Found ' + nodes.length + ' related nodes</p>';
                        html += '<div style="display: grid; gap: 8px;">';
                        nodes.forEach(n => {
                            html += '<div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; cursor: pointer;" onclick="vscode.postMessage({command:\\'openFileAtLine\\', filePath:\\'' + (n.filePath || '').replace(/'/g, "\\'") + '\\', line: ' + (n.lineNumber || 0) + '})">';
                            html += '<div style="font-weight: 600; color: var(--text-primary);">' + n.name + '</div>';
                            html += '<div style="font-size: 11px; color: var(--text-muted);">' + n.type + (n.filePath ? ' • ' + n.filePath.split('/').pop() : '') + '</div>';
                            html += '</div>';
                        });
                        html += '</div>';
                        lineageContent.innerHTML = html;
                    }
                    break;
                case 'impactResult':
                    if (lineageContent && message.data?.html) {
                        lineageContent.innerHTML = message.data.html;
                    }
                    break;
                case 'tableExplorerResult':
                    if (lineageContent) {
                        if (message.data?.error) {
                            lineageContent.innerHTML = '<div style="color: var(--error); padding: 20px;">' + message.data.error + '</div>';
                        } else if (message.data?.html) {
                            lineageContent.innerHTML = message.data.html;
                        }
                    }
                    break;
                case 'columnLineageResult':
                    // Highlight columns in the current graph based on lineage
                    handleColumnLineageResult(message.data);
                    break;
                case 'columnSelectionCleared':
                    // Clear column highlighting
                    clearColumnHighlighting();
                    break;
                case 'tableListResult':
                    if (lineageContent && message.data?.html) {
                        lineageContent.innerHTML = message.data.html;
                        // Setup table search and filter handlers
                        setupTableSearchAndFilter();
                    }
                    break;
                case 'impactFormResult':
                    if (lineageContent && message.data?.html) {
                        lineageContent.innerHTML = message.data.html;
                        // Setup impact form handlers
                        setupImpactForm();
                    }
                    break;
                case 'impactResult':
                    if (lineageContent && message.data?.html) {
                        const resultsDiv = document.getElementById('impact-results');
                        if (resultsDiv) {
                            resultsDiv.style.display = 'block';
                            resultsDiv.innerHTML = message.data.html;
                        } else {
                            lineageContent.innerHTML = message.data.html;
                        }
                    }
                    break;
                case 'lineageOverviewResult':
                    if (lineageContent && message.data?.html) {
                        lineageContent.innerHTML = message.data.html;
                        // Setup visual lineage search handlers
                        setupVisualLineageSearch();
                    }
                    break;
                case 'lineageSearchResults':
                    // Handle search results for lineage
                    if (message.data?.results) {
                        showLineageSearchResults(message.data.results);
                    }
                    break;
                case 'lineageGraphResult':
                    // Handle lineage graph render result
                    // Prevent re-entrant calls during setup
                    if (lineageSetupInProgress) {
                        console.log('[Lineage] Ignoring lineageGraphResult during setup');
                        break;
                    }
                    if (lineageContent && message.data?.html) {
                        lineageSetupInProgress = true;
                        lineageContent.innerHTML = message.data.html;
                        lineageDetailView = true;
                        // Track current graph state for expand/collapse
                        if (message.data.nodeId) {
                            lineageCurrentNodeId = message.data.nodeId;
                        }
                        if (message.data.direction) {
                            lineageCurrentDirection = message.data.direction;
                        }
                        // Track expanded nodes
                        if (message.data.expandedNodes) {
                            lineageExpandedNodes = new Set(message.data.expandedNodes);
                        }
                        updateBackButtonText();
                        // Setup graph interactions (works for both graph view and empty state)
                        setupLineageGraphInteractions();
                        // Also setup direction buttons in empty state
                        setupDirectionButtons();
                        // Release lock after setup completes
                        setTimeout(() => { lineageSetupInProgress = false; }, 200);
                    }
                    break;
                case 'nodeColumnsResult':
                    // Handle column expansion
                    if (message.data?.nodeId) {
                        expandNodeWithColumns(message.data.nodeId);
                    }
                    break;
                case 'nodeCollapsedResult':
                    // Handle column collapse
                    if (message.data?.nodeId) {
                        collapseNodeWithColumns(message.data.nodeId);
                    }
                    break;
            }
        });

        // ========== Event Delegation for Dynamic Lineage Content ==========
        if (lineageContent) {
            lineageContent.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action]');
                if (!target) return;

                const action = target.getAttribute('data-action');
                const tableName = target.getAttribute('data-table');
                const nodeId = target.getAttribute('data-node-id');

                if (!tableName) return;

                // Mark that we're entering a detail view
                lineageDetailView = true;
                updateBackButtonText();

                switch (action) {
                    case 'explore-table':
                        // Show loading state and request table details
                        if (lineageTitle) lineageTitle.textContent = 'Table: ' + tableName;
                        lineageContent.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';
                        vscode.postMessage({ command: 'exploreTable', tableName: tableName });
                        break;
                    case 'show-upstream':
                        // Show upstream dependencies - use nodeId if available, otherwise construct it
                        if (lineageTitle) lineageTitle.textContent = 'Upstream of ' + tableName;
                        lineageContent.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';
                        vscode.postMessage({ command: 'getUpstream', nodeId: nodeId || ('table:' + tableName.toLowerCase()), depth: 5 });
                        break;
                    case 'show-downstream':
                        // Show downstream dependencies - use nodeId if available, otherwise construct it
                        if (lineageTitle) lineageTitle.textContent = 'Downstream of ' + tableName;
                        lineageContent.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';
                        vscode.postMessage({ command: 'getDownstream', nodeId: nodeId || ('table:' + tableName.toLowerCase()), depth: 5 });
                        break;
                }
            });
        }

        // ========== Issue Item Clicks ==========
        document.querySelectorAll('.issue-item').forEach(item => {
            item.addEventListener('click', () => {
                const filePath = item.getAttribute('data-filepath');
                const line = item.getAttribute('data-line');
                if (filePath) {
                    openFileAtLine(filePath, parseInt(line) || 0);
                }
            });
        });

        // ========== Node Interactions ==========
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
                if (node) hideTooltip();
            });

            // Right-click context menu
            svg.addEventListener('contextmenu', (e) => {
                const node = e.target.closest('.node');
                if (node) {
                    const nodeId = node.getAttribute('data-id');
                    const nodeLabel = node.getAttribute('data-label') || nodeId;
                    const nodeType = node.getAttribute('data-type') || 'file';
                    const filePath = node.getAttribute('data-filepath');

                    showContextMenu(e, {
                        id: nodeId,
                        label: nodeLabel,
                        type: nodeType,
                        filePath: filePath
                    });
                }
            });
        }

        // ========== Tooltip Functions ==========
        function showTooltip(e, content) {
            tooltip.innerHTML = content;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY + 12) + 'px';
        }

        function hideTooltip() {
            tooltip.style.display = 'none';
        }

        // ========== Impact Form Setup ==========
        function setupImpactForm() {
            const tableSelect = document.getElementById('impact-table-select');
            const analyzeBtn = document.getElementById('impact-analyze-btn');
            const changeTypeButtons = document.querySelectorAll('.change-type-btn');

            // Handle change type button clicks
            changeTypeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Remove active class from all buttons
                    changeTypeButtons.forEach(b => b.classList.remove('active'));
                    // Add active class to clicked button
                    btn.classList.add('active');
                });
            });

            if (tableSelect && analyzeBtn) {
                // Enable/disable analyze button based on selection
                tableSelect.addEventListener('change', () => {
                    analyzeBtn.disabled = !tableSelect.value;
                });

                // Handle analyze button click
                analyzeBtn.addEventListener('click', () => {
                    const selectedOption = tableSelect.options[tableSelect.selectedIndex];
                    const tableName = selectedOption.getAttribute('data-name');
                    const tableType = selectedOption.getAttribute('data-type');
                    const activeButton = document.querySelector('.change-type-btn.active');
                    const changeType = activeButton?.getAttribute('data-value') || 'modify';

                    if (!tableName) return;

                    // Show loading state
                    const resultsDiv = document.getElementById('impact-results');
                    if (resultsDiv) {
                        resultsDiv.style.display = 'block';
                        resultsDiv.innerHTML = '<div class="skeleton-loader"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>';
                    }

                    vscode.postMessage({
                        command: 'analyzeImpact',
                        type: tableType === 'view' ? 'table' : 'table',
                        name: tableName,
                        changeType: changeType
                    });
                });
            }
        }

        // ========== Table Search and Filter Setup ==========
        function setupTableSearchAndFilter() {
            const searchInput = document.getElementById('table-search-input');
            const searchClear = document.getElementById('table-search-clear');
            const typeFilter = document.getElementById('table-type-filter');
            const sortSelect = document.getElementById('table-sort');
            const tableGrid = document.getElementById('table-list-grid');
            const emptyFilter = document.getElementById('table-list-empty-filter');
            const resultsInfo = document.getElementById('table-list-results-info');
            const resultsCount = document.getElementById('table-results-count');
            const emptyMessage = document.getElementById('empty-filter-message');
            
            let debounceTimeout;
            const totalItems = tableGrid ? tableGrid.querySelectorAll('.table-list-item').length : 0;

            function filterTables() {
                if (!tableGrid) return;

                const searchQuery = (searchInput?.value || '').toLowerCase().trim();
                const typeValue = typeFilter?.value || 'all';
                const sortValue = sortSelect?.value || 'connected';

                const items = Array.from(tableGrid.querySelectorAll('.table-list-item'));
                let visibleItems = [];

                // Filter
                items.forEach(item => {
                    const tableName = item.getAttribute('data-name') || '';
                    const tableType = item.getAttribute('data-type') || '';
                    const nameText = item.querySelector('.table-list-name')?.textContent?.toLowerCase() || '';

                    const matchesSearch = !searchQuery || tableName.includes(searchQuery) || nameText.includes(searchQuery);
                    const matchesType = typeValue === 'all' || tableType === typeValue;

                    if (matchesSearch && matchesType) {
                        item.style.display = '';
                        visibleItems.push(item);
                    } else {
                        item.style.display = 'none';
                    }
                });

                // Sort
                visibleItems.sort((a, b) => {
                    if (sortValue === 'name-asc') {
                        const nameA = a.querySelector('.table-list-name')?.textContent || '';
                        const nameB = b.querySelector('.table-list-name')?.textContent || '';
                        return nameA.localeCompare(nameB);
                    } else if (sortValue === 'name-desc') {
                        const nameA = a.querySelector('.table-list-name')?.textContent || '';
                        const nameB = b.querySelector('.table-list-name')?.textContent || '';
                        return nameB.localeCompare(nameA);
                    } else if (sortValue === 'type') {
                        const typeA = a.getAttribute('data-type') || '';
                        const typeB = b.getAttribute('data-type') || '';
                        if (typeA !== typeB) return typeA.localeCompare(typeB);
                        const nameA = a.querySelector('.table-list-name')?.textContent || '';
                        const nameB = b.querySelector('.table-list-name')?.textContent || '';
                        return nameA.localeCompare(nameB);
                    } else {
                        // Most connected (default) - items are already sorted by connection count
                        return 0;
                    }
                });

                // Reorder in DOM
                visibleItems.forEach(item => tableGrid.appendChild(item));

                // Highlight search terms
                if (searchQuery && visibleItems.length > 0) {
                    visibleItems.forEach(item => {
                        const nameEl = item.querySelector('.table-list-name');
                        if (nameEl) {
                            const text = nameEl.textContent || '';
                            let escapedQuery = '';
                            const specialChars = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\\\'];
                            for (let i = 0; i < searchQuery.length; i++) {
                                const char = searchQuery[i];
                                if (specialChars.indexOf(char) >= 0) {
                                    escapedQuery += '\\\\' + char;
                                } else {
                                    escapedQuery += char;
                                }
                            }
                            const regex = new RegExp('(' + escapedQuery + ')', 'gi');
                            nameEl.innerHTML = text.replace(regex, '<mark>$1</mark>');
                        }
                    });
                } else {
                    // Remove highlights
                    items.forEach(item => {
                        const nameEl = item.querySelector('.table-list-name');
                        if (nameEl) {
                            nameEl.innerHTML = nameEl.textContent || '';
                        }
                    });
                }

                // Update results count
                if (resultsInfo && resultsCount) {
                    if (visibleItems.length < totalItems || searchQuery || typeValue !== 'all') {
                        resultsInfo.style.display = 'block';
                        resultsCount.textContent = 'Showing ' + visibleItems.length + ' of ' + totalItems + ' tables';
                    } else {
                        resultsInfo.style.display = 'none';
                    }
                }

                // Show/hide empty state with improved message
                if (emptyFilter && emptyMessage) {
                    if (visibleItems.length === 0) {
                        emptyFilter.style.display = 'block';
                        let message = 'No tables match your search criteria';
                        if (searchQuery) {
                            message = 'No tables matching "' + searchQuery + '"';
                        } else if (typeValue !== 'all') {
                            message = 'No ' + typeValue + 's found';
                        }
                        emptyMessage.textContent = message;
                    } else {
                        emptyFilter.style.display = 'none';
                    }
                }

                // Show/hide clear button
                if (searchClear) {
                    searchClear.style.display = searchQuery || typeValue !== 'all' ? 'flex' : 'none';
                }
            }

            // Debounced filter function
            function debouncedFilter() {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(filterTables, 180);
            }

            // Event listeners
            searchInput?.addEventListener('input', debouncedFilter);
            searchClear?.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (typeFilter) typeFilter.value = 'all';
                filterTables();
                searchInput?.focus();
            });
            typeFilter?.addEventListener('change', filterTables);
            sortSelect?.addEventListener('change', filterTables);

            // Keyboard shortcuts
            searchInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (searchInput.value) {
                        searchInput.value = '';
                        filterTables();
                    } else {
                        searchInput.blur();
                    }
                    e.preventDefault();
                }
            });

            // Global keyboard shortcut: / to focus search
            document.addEventListener('keydown', (e) => {
                // Only if not typing in an input/textarea
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                // Check for / key (not Shift+/ which is ?)
                if (e.key === '/' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    searchInput?.focus();
                    searchInput?.select();
                }
            });

            // Initial filter to show results count if needed
            filterTables();
        }

        // ========== Visual Lineage Search Setup ==========
        let lineageSearchData = [];
        let lineageTypeFilter = 'all';
        let lineageSearchTimeout = null;

        function setupVisualLineageSearch() {
            const searchInput = document.getElementById('lineage-search-input');
            const searchClear = document.getElementById('lineage-search-clear');
            const searchResults = document.getElementById('lineage-search-results');
            const filterChips = document.querySelectorAll('.quick-filters .filter-chip');
            const popularItems = document.querySelectorAll('.popular-item[data-action="select-node"]');
            const recentItems = document.querySelectorAll('.recent-item[data-action="select-node"]');
            const dataScript = document.getElementById('lineage-searchable-nodes');
            const popularList = document.querySelector('.popular-list');

            // Load searchable nodes data
            if (dataScript) {
                try {
                    lineageSearchData = JSON.parse(dataScript.textContent || '[]');
                } catch (e) {
                    lineageSearchData = [];
                }
            }

            // Function to filter popular tables by type
            function filterPopularTables(typeFilter) {
                if (!popularList) return;
                const items = popularList.querySelectorAll('.popular-item');
                items.forEach(item => {
                    const nodeType = item.getAttribute('data-node-type');
                    if (typeFilter === 'all' || nodeType === typeFilter) {
                        item.classList.remove('filtered-out');
                    } else {
                        item.classList.add('filtered-out');
                    }
                });
            }

            // Search input handling
            searchInput?.addEventListener('input', () => {
                const query = searchInput.value.trim();
                if (searchClear) searchClear.style.display = query ? 'flex' : 'none';

                clearTimeout(lineageSearchTimeout);
                lineageSearchTimeout = setTimeout(() => {
                    if (query.length >= 1) {
                        // Local search for instant results
                        const results = searchLineageLocal(query);
                        showLineageSearchResults(results);
                        // Also send to backend for more comprehensive results
                        vscode.postMessage({ command: 'searchLineageTables', query, typeFilter: lineageTypeFilter });
                    } else {
                        hideLineageSearchResults();
                    }
                }, 150);
            });

            searchInput?.addEventListener('focus', () => {
                const query = searchInput.value.trim();
                if (query.length >= 1) {
                    const results = searchLineageLocal(query);
                    showLineageSearchResults(results);
                }
            });

            searchInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    hideLineageSearchResults();
                    searchInput.blur();
                } else if (e.key === 'Enter') {
                    const firstResult = searchResults?.querySelector('.search-result-item');
                    if (firstResult) {
                        firstResult.click();
                    }
                }
            });

            searchClear?.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (searchClear) searchClear.style.display = 'none';
                hideLineageSearchResults();
                searchInput?.focus();
            });

            // Filter chips handling - filter BOTH search results AND popular tables
            filterChips.forEach(chip => {
                chip.addEventListener('click', () => {
                    filterChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    lineageTypeFilter = chip.getAttribute('data-filter') || 'all';

                    // Filter popular tables
                    filterPopularTables(lineageTypeFilter);

                    // Re-search if there's a query
                    const query = searchInput?.value.trim();
                    if (query) {
                        const results = searchLineageLocal(query);
                        showLineageSearchResults(results);
                    }
                });
            });

            // Popular item clicks
            popularItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId) {
                        selectLineageNode(nodeId);
                    }
                });
            });

            // Recent item clicks
            recentItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId) {
                        selectLineageNode(nodeId);
                    }
                });
            });

            // Close search results when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-form')) {
                    hideLineageSearchResults();
                }
            });
        }

        function searchLineageLocal(query) {
            const queryLower = query.toLowerCase();
            return lineageSearchData
                .filter(node => {
                    const matchesQuery = node.name.toLowerCase().includes(queryLower);
                    const matchesType = lineageTypeFilter === 'all' || node.type === lineageTypeFilter;
                    return matchesQuery && matchesType;
                })
                .slice(0, 10);
        }

        function showLineageSearchResults(results) {
            const searchResults = document.getElementById('lineage-search-results');
            if (!searchResults) return;

            if (!results || results.length === 0) {
                searchResults.innerHTML = '<div class="search-result-item" style="justify-content: center; color: var(--text-dim);">No results found</div>';
                searchResults.style.display = 'block';
                return;
            }

            const icons = { table: '📊', view: '👁️', cte: '🔄', external: '🌐' };
            searchResults.innerHTML = results.map(node => {
                const fileName = node.filePath ? node.filePath.split('/').pop() : '';
                return '<div class="search-result-item" data-node-id="' + escapeHtmlAttr(node.id) + '">' +
                    '<span class="result-icon">' + (icons[node.type] || '📦') + '</span>' +
                    '<span class="result-name">' + escapeHtml(node.name) + '</span>' +
                    '<span class="result-type">' + node.type + '</span>' +
                    (fileName ? '<span class="result-file">' + escapeHtml(fileName) + '</span>' : '') +
                '</div>';
            }).join('');

            searchResults.style.display = 'block';

            // Add click handlers
            searchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const nodeId = item.getAttribute('data-node-id');
                    if (nodeId) {
                        selectLineageNode(nodeId);
                        hideLineageSearchResults();
                    }
                });
            });
        }

        function hideLineageSearchResults() {
            const searchResults = document.getElementById('lineage-search-results');
            if (searchResults) {
                searchResults.style.display = 'none';
            }
        }

        function selectLineageNode(nodeId) {
            // Show loading state
            if (lineageContent) {
                lineageContent.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 300px;"><div class="skeleton-loader" style="width: 200px;"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>';
            }
            // Request graph data
            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: nodeId,
                depth: 5,
                direction: 'both'
            });
        }

        // ========== Visual Lineage Graph Interactions ==========
        let lineageScale = 1;
        let lineageOffsetX = 50;
        let lineageOffsetY = 50;
        let lineageIsDragging = false;
        let lineageDragStartX = 0;
        let lineageDragStartY = 0;
        let lineageFocusedNode = null;
        let lineageExpandedNodes = new Set(); // Track expanded nodes
        let lineageCurrentNodeId = null; // Track current graph center node
        let lineageCurrentDirection = 'both'; // Track current direction
        let lineageAutoFitNodeId = null; // Track which graph was auto-fitted (prevent re-fit)
        let lineageSetupInProgress = false; // Prevent re-renders during setup

        function setupLineageGraphInteractions() {
            const container = document.getElementById('lineage-graph-container');
            const svg = container?.querySelector('.lineage-graph-svg');
            const graphContainer = svg?.querySelector('.lineage-graph-container');
            const tooltip = document.getElementById('lineage-tooltip');
            const contextMenu = document.getElementById('lineage-context-menu');
            const zoomInBtn = document.getElementById('lineage-zoom-in');
            const zoomOutBtn = document.getElementById('lineage-zoom-out');
            const zoomFitBtn = document.getElementById('lineage-zoom-fit');
            const zoomResetBtn = document.getElementById('lineage-zoom-reset');
            const zoomLevel = document.getElementById('lineage-zoom-level');
            const directionBtns = document.querySelectorAll('.direction-btn');

            // Reset zoom state
            lineageScale = 1;
            lineageOffsetX = 0;
            lineageOffsetY = 0;

            function updateLineageTransform() {
                // Re-query to get fresh references (in case DOM was updated)
                const currentGraphContainer = document.querySelector('#lineage-graph-container .lineage-graph-svg .lineage-graph-container');
                const currentZoomLevel = document.getElementById('lineage-zoom-level');
                if (!currentGraphContainer) return;
                currentGraphContainer.setAttribute('transform', 'translate(' + lineageOffsetX + ',' + lineageOffsetY + ') scale(' + lineageScale + ')');
                if (currentZoomLevel) {
                    currentZoomLevel.textContent = Math.round(lineageScale * 100) + '%';
                }
            }

            // Fit graph to container, using full available space and centering
            function fitToContainer(isAutoFit = false) {
                // For auto-fit, only run once per graph (check using external state)
                if (isAutoFit && lineageAutoFitNodeId === lineageCurrentNodeId && lineageCurrentNodeId !== null) {
                    return;
                }

                // Re-query to get fresh references (in case DOM was updated)
                const currentContainer = document.getElementById('lineage-graph-container');
                const currentGraphContainer = currentContainer?.querySelector('.lineage-graph-svg .lineage-graph-container');
                if (!currentContainer || !currentGraphContainer) {
                    return;
                }

                const containerRect = currentContainer.getBoundingClientRect();
                const bbox = currentGraphContainer.getBBox();

                if (bbox.width > 0 && bbox.height > 0 && containerRect.width > 0 && containerRect.height > 0) {
                    const padding = 80; // Padding around the graph
                    const availableWidth = containerRect.width - padding;
                    const availableHeight = containerRect.height - padding;
                    const scaleX = availableWidth / bbox.width;
                    const scaleY = availableHeight / bbox.height;

                    // Use the smaller scale to fit both dimensions (always fit, can be > or < 100%)
                    lineageScale = Math.min(scaleX, scaleY);
                    // Clamp between 20% and 150%
                    lineageScale = Math.max(0.2, Math.min(1.5, lineageScale));

                    // Center the graph in the container
                    // Move content so that bbox center aligns with container center
                    const bboxCenterX = bbox.x + bbox.width / 2;
                    const bboxCenterY = bbox.y + bbox.height / 2;
                    const containerCenterX = containerRect.width / 2;
                    const containerCenterY = containerRect.height / 2;

                    lineageOffsetX = containerCenterX - bboxCenterX * lineageScale;
                    lineageOffsetY = containerCenterY - bboxCenterY * lineageScale;

                    updateLineageTransform();

                    if (isAutoFit && lineageCurrentNodeId) {
                        lineageAutoFitNodeId = lineageCurrentNodeId;
                    }
                }
            }

            // Zoom controls - always set up even if graph isn't ready yet
            zoomInBtn?.addEventListener('click', () => {
                lineageScale = Math.min(3, lineageScale * 1.2);
                updateLineageTransform();
            });

            zoomOutBtn?.addEventListener('click', () => {
                lineageScale = Math.max(0.2, lineageScale / 1.2);
                updateLineageTransform();
            });

            zoomResetBtn?.addEventListener('click', () => {
                // Reset to auto-fit centered view
                fitToContainer();
                // Also clear any focused node
                if (svg) {
                    const nodes = svg.querySelectorAll('.lineage-node');
                    if (nodes) clearLineageFocus(nodes);
                }
            });

            zoomFitBtn?.addEventListener('click', fitToContainer);

            // Early return if no graph to interact with
            if (!svg || !graphContainer) return;

            // Auto-fit and center on initial load (delay to ensure container is rendered)
            // Pass true to mark as auto-fit (only runs once per graph)
            requestAnimationFrame(() => {
                setTimeout(() => fitToContainer(true), 100);
            });

            // Mouse wheel zoom
            svg.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                lineageScale = Math.max(0.2, Math.min(3, lineageScale * delta));
                updateLineageTransform();
            });

            // Pan handling
            svg.addEventListener('mousedown', (e) => {
                if (e.target === svg || e.target.closest('.lineage-edge')) {
                    lineageIsDragging = true;
                    lineageDragStartX = e.clientX - lineageOffsetX;
                    lineageDragStartY = e.clientY - lineageOffsetY;
                    svg.style.cursor = 'grabbing';
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (lineageIsDragging) {
                    lineageOffsetX = e.clientX - lineageDragStartX;
                    lineageOffsetY = e.clientY - lineageDragStartY;
                    updateLineageTransform();
                }
            });

            document.addEventListener('mouseup', () => {
                lineageIsDragging = false;
                if (svg) svg.style.cursor = 'grab';
            });

            // Node interactions
            const nodes = svg.querySelectorAll('.lineage-node');
            nodes.forEach(node => {
                // Hover - show tooltip
                node.addEventListener('mouseenter', (e) => {
                    showLineageTooltip(e, node);
                });

                node.addEventListener('mouseleave', () => {
                    hideLineageTooltip();
                });

                // Click - handle column selection, expand/collapse, or focus node
                node.addEventListener('click', (e) => {
                    e.stopPropagation();

                    // Check for specific data-action targets
                    const actionTarget = e.target.closest('[data-action]');
                    if (actionTarget) {
                        const action = actionTarget.getAttribute('data-action');
                        const nodeId = node.getAttribute('data-node-id');

                        if (action === 'selectColumn') {
                            // Column selection - trace column lineage
                            const columnName = actionTarget.getAttribute('data-column-name');
                            if (nodeId && columnName) {
                                vscode.postMessage({
                                    command: 'selectColumn',
                                    tableId: nodeId,
                                    columnName: columnName
                                });
                            }
                            return;
                        } else if (action === 'expand') {
                            // Expand node to show columns
                            if (nodeId) {
                                vscode.postMessage({
                                    command: 'expandNodeColumns',
                                    nodeId: nodeId
                                });
                            }
                            return;
                        } else if (action === 'collapse') {
                            // Collapse node to hide columns
                            if (nodeId) {
                                vscode.postMessage({
                                    command: 'collapseNodeColumns',
                                    nodeId: nodeId
                                });
                            }
                            return;
                        }
                    }

                    // Default: focus node
                    focusLineageNode(node, nodes);
                });

                // Double-click - open file
                node.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    const filePath = node.getAttribute('data-file-path');
                    const lineNumber = parseInt(node.getAttribute('data-line-number') || '0');
                    if (filePath) {
                        vscode.postMessage({ command: 'openFileAtLine', filePath, line: lineNumber });
                    }
                });

                // Right-click - context menu
                node.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showLineageContextMenu(e, node);
                });
            });

            // Click on SVG background to clear focus
            svg.addEventListener('click', (e) => {
                // Only if clicking directly on SVG or the container, not on nodes
                if (e.target === svg || e.target.classList.contains('lineage-graph-container') ||
                    e.target.closest('.lineage-edge')) {
                    clearLineageFocus(nodes);
                }
            });

            // Direction toggle buttons
            directionBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const direction = btn.getAttribute('data-direction');
                    const nodeId = btn.getAttribute('data-node-id');
                    if (direction && nodeId) {
                        vscode.postMessage({
                            command: 'getLineageGraph',
                            nodeId: nodeId,
                            direction: direction,
                            depth: 5
                        });
                    }
                });
            });

            // Close context menu on click outside
            document.addEventListener('click', () => {
                if (contextMenu) contextMenu.style.display = 'none';
            });

            // Fit to screen on initial load
            setTimeout(() => {
                if (zoomFitBtn) zoomFitBtn.click();
            }, 100);
        }

        function showLineageTooltip(e, node) {
            const tooltip = document.getElementById('lineage-tooltip');
            if (!tooltip) return;

            const name = node.getAttribute('data-node-name') || '';
            const type = node.getAttribute('data-node-type') || '';
            const filePath = node.getAttribute('data-file-path') || '';
            const lineNumber = node.getAttribute('data-line-number') || '';

            const icons = { table: '📊', view: '👁️', cte: '🔄', external: '🌐' };

            tooltip.querySelector('.tooltip-icon').textContent = icons[type] || '📦';
            tooltip.querySelector('.tooltip-name').textContent = name;
            tooltip.querySelector('.type-value').textContent = type;
            tooltip.querySelector('.file-value').textContent = filePath ? filePath.split('/').pop() : 'N/A';
            tooltip.querySelector('.line-value').textContent = lineNumber || 'N/A';
            tooltip.querySelector('.columns-value').textContent = '-';
            tooltip.querySelector('.upstream-value').textContent = '-';
            tooltip.querySelector('.downstream-value').textContent = '-';

            // Position tooltip
            const rect = node.getBoundingClientRect();
            tooltip.style.left = (rect.right + 10) + 'px';
            tooltip.style.top = rect.top + 'px';
            tooltip.style.display = 'block';
        }

        function hideLineageTooltip() {
            const tooltip = document.getElementById('lineage-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        }

        function focusLineageNode(node, allNodes) {
            const nodeId = node.getAttribute('data-node-id');

            // Toggle focus
            if (lineageFocusedNode === nodeId) {
                // Unfocus
                clearLineageFocus(allNodes);
            } else {
                // Focus on this node
                lineageFocusedNode = nodeId;
                allNodes.forEach(n => {
                    if (n.getAttribute('data-node-id') === nodeId) {
                        n.classList.add('focused');
                        n.classList.remove('highlighted', 'dimmed');
                    } else {
                        n.classList.remove('focused', 'highlighted');
                        n.classList.add('dimmed');
                    }
                });
            }
        }

        function clearLineageFocus(allNodes) {
            if (allNodes) {
                allNodes.forEach(n => n.classList.remove('focused', 'highlighted', 'dimmed'));
            }
            lineageFocusedNode = null;
        }

        function showLineageContextMenu(e, node) {
            const contextMenu = document.getElementById('lineage-context-menu');
            if (!contextMenu) return;

            const nodeId = node.getAttribute('data-node-id');
            const nodeName = node.getAttribute('data-node-name');
            const filePath = node.getAttribute('data-file-path');

            contextMenu.style.left = e.clientX + 'px';
            contextMenu.style.top = e.clientY + 'px';
            contextMenu.style.display = 'block';

            // Add handlers
            const handlers = {
                'open-file': () => {
                    if (filePath) {
                        vscode.postMessage({ command: 'openFile', filePath });
                    }
                },
                'focus-upstream': () => {
                    if (nodeId) {
                        vscode.postMessage({ command: 'getLineageGraph', nodeId, direction: 'upstream', depth: 5 });
                    }
                },
                'focus-downstream': () => {
                    if (nodeId) {
                        vscode.postMessage({ command: 'getLineageGraph', nodeId, direction: 'downstream', depth: 5 });
                    }
                },
                'expand-columns': () => {
                    if (nodeId) {
                        vscode.postMessage({ command: 'expandNodeColumns', nodeId });
                    }
                },
                'copy-name': () => {
                    if (nodeName) {
                        navigator.clipboard.writeText(nodeName);
                    }
                }
            };

            contextMenu.querySelectorAll('.context-item').forEach(item => {
                const action = item.getAttribute('data-action');
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (handlers[action]) handlers[action]();
                    contextMenu.style.display = 'none';
                };
            });
        }

        function expandNodeWithColumns(nodeId) {
            // Guard: need a current graph to expand nodes in
            if (!lineageCurrentNodeId) {
                console.warn('[Lineage] Cannot expand node: no graph loaded');
                return;
            }

            // Add node to expanded set and re-render graph
            if (!lineageExpandedNodes) {
                lineageExpandedNodes = new Set();
            }
            lineageExpandedNodes.add(nodeId);

            // Re-render graph with expanded node
            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: lineageCurrentNodeId,
                depth: 5,
                direction: lineageCurrentDirection,
                expandedNodes: Array.from(lineageExpandedNodes)
            });
        }

        function collapseNodeWithColumns(nodeId) {
            // Guard: need a current graph to collapse nodes in
            if (!lineageCurrentNodeId) {
                console.warn('[Lineage] Cannot collapse node: no graph loaded');
                return;
            }

            // Remove node from expanded set and re-render graph
            if (lineageExpandedNodes) {
                lineageExpandedNodes.delete(nodeId);
            }

            // Re-render graph with collapsed node
            vscode.postMessage({
                command: 'getLineageGraph',
                nodeId: lineageCurrentNodeId,
                depth: 5,
                direction: lineageCurrentDirection,
                expandedNodes: Array.from(lineageExpandedNodes || new Set())
            });
        }

        // ========== Column Lineage Highlighting ==========

        let selectedColumn = null; // Track currently selected column

        function handleColumnLineageResult(data) {
            if (!data) return;

            const { tableId, columnName, upstream, downstream } = data;

            // Store selected column
            selectedColumn = { tableId, columnName };

            // Clear previous highlighting
            clearColumnHighlighting();

            // Get all column rows in the graph
            const svg = document.querySelector('.lineage-graph-svg');
            if (!svg) return;

            // Extract all column references from lineage paths
            const upstreamColumns = new Set();
            const downstreamColumns = new Set();

            // Process upstream paths to get source column IDs
            if (upstream && Array.isArray(upstream)) {
                upstream.forEach(path => {
                    if (path.nodes) {
                        path.nodes.forEach(node => {
                            if (node.type === 'column') {
                                upstreamColumns.add(node.id);
                            } else if (node.id && node.name) {
                                // Add all columns of upstream tables
                                upstreamColumns.add(node.id);
                            }
                        });
                    }
                });
            }

            // Process downstream paths to get target column IDs
            if (downstream && Array.isArray(downstream)) {
                downstream.forEach(path => {
                    if (path.nodes) {
                        path.nodes.forEach(node => {
                            if (node.type === 'column') {
                                downstreamColumns.add(node.id);
                            } else if (node.id && node.name) {
                                // Add all columns of downstream tables
                                downstreamColumns.add(node.id);
                            }
                        });
                    }
                });
            }

            // Find and highlight the selected column
            const selectedNode = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(tableId) + '"]');
            if (selectedNode) {
                const columnRows = selectedNode.querySelectorAll('.column-row');
                columnRows.forEach(row => {
                    const colName = row.getAttribute('data-column-name');
                    if (colName === columnName) {
                        row.classList.add('selected');
                        // Update the state indicator
                        const stateText = row.querySelector('.column-state');
                        if (stateText) stateText.textContent = '◉';
                    } else {
                        row.classList.add('dimmed');
                    }
                });
            }

            // Highlight upstream columns (source) in green
            upstreamColumns.forEach(nodeId => {
                const node = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(nodeId) + '"]');
                if (node && node !== selectedNode) {
                    node.classList.add('in-path', 'upstream');
                    const columnRows = node.querySelectorAll('.column-row');
                    columnRows.forEach(row => {
                        row.classList.add('in-path');
                        const stateText = row.querySelector('.column-state');
                        if (stateText) stateText.textContent = '●';
                    });
                }
            });

            // Highlight downstream columns (target) in blue
            downstreamColumns.forEach(nodeId => {
                const node = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(nodeId) + '"]');
                if (node && node !== selectedNode) {
                    node.classList.add('in-path', 'downstream');
                    const columnRows = node.querySelectorAll('.column-row');
                    columnRows.forEach(row => {
                        row.classList.add('in-path');
                        const stateText = row.querySelector('.column-state');
                        if (stateText) stateText.textContent = '●';
                    });
                }
            });

            // Dim nodes not in the lineage path
            const allNodes = svg.querySelectorAll('.lineage-node');
            allNodes.forEach(node => {
                const nodeId = node.getAttribute('data-node-id');
                if (nodeId !== tableId && !upstreamColumns.has(nodeId) && !downstreamColumns.has(nodeId)) {
                    node.classList.add('dimmed');
                }
            });

            // Draw column-to-column edges
            drawColumnLineageEdges(tableId, columnName, upstream, downstream);

            // Show column lineage info panel (optional)
            showColumnLineageInfo(tableId, columnName, upstream, downstream);
        }

        function drawColumnLineageEdges(selectedTableId, selectedColumnName, upstream, downstream) {
            const svg = document.querySelector('.lineage-graph-svg');
            if (!svg) return;

            const graphContainer = svg.querySelector('.lineage-graph-container');
            if (!graphContainer) return;

            // Remove existing column edges
            svg.querySelectorAll('.column-lineage-edge').forEach(el => el.remove());

            // Get selected column position
            const selectedNode = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(selectedTableId) + '"]');
            if (!selectedNode) return;

            const selectedColumnRow = selectedNode.querySelector('.column-row[data-column-name="' + CSS.escape(selectedColumnName) + '"]');
            if (!selectedColumnRow) return;

            const selectedPos = getColumnPosition(selectedNode, selectedColumnRow);
            if (!selectedPos) return;

            // Create a group for column edges (insert before nodes so edges appear behind)
            const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            edgeGroup.setAttribute('class', 'column-lineage-edges');
            graphContainer.insertBefore(edgeGroup, graphContainer.firstChild);

            // Draw upstream edges (from source columns to selected column)
            if (upstream && Array.isArray(upstream)) {
                upstream.forEach(path => {
                    if (path.nodes) {
                        path.nodes.forEach(node => {
                            if (node.id && node.id !== selectedTableId) {
                                const sourceNode = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(node.id) + '"]');
                                if (sourceNode) {
                                    const sourceColumnRows = sourceNode.querySelectorAll('.column-row');
                                    sourceColumnRows.forEach(row => {
                                        const sourcePos = getColumnPosition(sourceNode, row);
                                        if (sourcePos) {
                                            drawColumnEdge(edgeGroup, sourcePos, selectedPos, 'upstream');
                                        }
                                    });
                                }
                            }
                        });
                    }
                });
            }

            // Draw downstream edges (from selected column to target columns)
            if (downstream && Array.isArray(downstream)) {
                downstream.forEach(path => {
                    if (path.nodes) {
                        path.nodes.forEach(node => {
                            if (node.id && node.id !== selectedTableId) {
                                const targetNode = svg.querySelector('.lineage-node[data-node-id="' + CSS.escape(node.id) + '"]');
                                if (targetNode) {
                                    const targetColumnRows = targetNode.querySelectorAll('.column-row');
                                    targetColumnRows.forEach(row => {
                                        const targetPos = getColumnPosition(targetNode, row);
                                        if (targetPos) {
                                            drawColumnEdge(edgeGroup, selectedPos, targetPos, 'downstream');
                                        }
                                    });
                                }
                            }
                        });
                    }
                });
            }
        }

        function getColumnPosition(nodeElement, columnRow) {
            // Get the node's transform to find its position
            const transform = nodeElement.getAttribute('transform');
            if (!transform) return null;

            const match = transform.match(/translate\\(([-\\d.]+),\\s*([-\\d.]+)\\)/);
            if (!match) return null;

            const nodeX = parseFloat(match[1]);
            const nodeY = parseFloat(match[2]);

            // Get node dimensions
            const nodeBg = nodeElement.querySelector('.node-bg');
            const nodeWidth = nodeBg ? parseFloat(nodeBg.getAttribute('width') || 200) : 200;

            // Find the column row's Y position within the node
            // Column rows start at Y=68 and each is 24px apart
            const allRows = nodeElement.querySelectorAll('.column-row');
            let rowIndex = 0;
            allRows.forEach((row, idx) => {
                if (row === columnRow) rowIndex = idx;
            });

            const columnY = 68 + (rowIndex * 24) - 4;  // -4 to center on the dot

            return {
                left: { x: nodeX, y: nodeY + columnY },
                right: { x: nodeX + nodeWidth, y: nodeY + columnY },
                center: { x: nodeX + nodeWidth / 2, y: nodeY + columnY }
            };
        }

        function drawColumnEdge(container, fromPos, toPos, type) {
            // Determine which side to connect from/to
            const startX = fromPos.right.x;
            const startY = fromPos.right.y;
            const endX = toPos.left.x;
            const endY = toPos.left.y;

            // Calculate control points for bezier curve
            const midX = (startX + endX) / 2;
            const pathD = 'M ' + startX + ' ' + startY +
                         ' C ' + midX + ' ' + startY + ', ' +
                               midX + ' ' + endY + ', ' +
                               endX + ' ' + endY;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'column-lineage-edge column-edge-' + type);
            path.setAttribute('d', pathD);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', type === 'upstream' ? '#22c55e' : '#3b82f6');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-opacity', '0.7');
            path.setAttribute('marker-end', 'url(#column-arrowhead-' + type + ')');

            container.appendChild(path);
        }

        function clearColumnHighlighting() {
            selectedColumn = null;

            const svg = document.querySelector('.lineage-graph-svg');
            if (!svg) return;

            // Remove column lineage edges
            svg.querySelectorAll('.column-lineage-edges').forEach(el => el.remove());

            // Remove all highlighting classes
            const allNodes = svg.querySelectorAll('.lineage-node');
            allNodes.forEach(node => {
                node.classList.remove('in-path', 'upstream', 'downstream', 'dimmed');
            });

            // Reset all column rows
            const columnRows = svg.querySelectorAll('.column-row');
            columnRows.forEach(row => {
                row.classList.remove('selected', 'in-path', 'dimmed');
                const stateText = row.querySelector('.column-state');
                if (stateText) {
                    // Reset to default indicator
                    const isPrimaryKey = row.querySelector('.column-dot.primary');
                    stateText.textContent = isPrimaryKey ? '●' : '○';
                }
            });

            // Hide info panel
            hideColumnLineageInfo();
        }

        function showColumnLineageInfo(tableId, columnName, upstream, downstream) {
            // Create or update info panel
            let infoPanel = document.getElementById('column-lineage-info');
            if (!infoPanel) {
                infoPanel = document.createElement('div');
                infoPanel.id = 'column-lineage-info';
                infoPanel.className = 'column-lineage-info';
                const container = document.getElementById('lineage-graph-container');
                if (container) container.appendChild(infoPanel);
            }

            const upstreamCount = upstream ? upstream.reduce((sum, p) => sum + (p.nodes?.length || 0), 0) : 0;
            const downstreamCount = downstream ? downstream.reduce((sum, p) => sum + (p.nodes?.length || 0), 0) : 0;

            // Parse table name from tableId (format: type:tablename)
            const tableName = tableId.includes(':') ? tableId.split(':')[1] : tableId;

            infoPanel.innerHTML = \`
                <div class="info-header">
                    <span class="info-icon">📝</span>
                    <span class="info-title">\${escapeHtml(tableName)}.\${escapeHtml(columnName)}</span>
                    <button class="info-close" onclick="clearColumnHighlighting()">×</button>
                </div>
                <div class="info-stats">
                    <span class="stat upstream" title="Upstream sources">⬆ \${upstreamCount} sources</span>
                    <span class="stat downstream" title="Downstream consumers">⬇ \${downstreamCount} consumers</span>
                </div>
                <div class="info-hint">Click another column to trace its lineage, or click background to clear.</div>
            \`;
            infoPanel.style.display = 'block';
        }

        function hideColumnLineageInfo() {
            const infoPanel = document.getElementById('column-lineage-info');
            if (infoPanel) {
                infoPanel.style.display = 'none';
            }
        }

        // Setup direction buttons (for both graph view and empty state)
        function setupDirectionButtons() {
            // Handle all direction buttons (in graph header or in empty state)
            const directionBtns = document.querySelectorAll('.direction-btn[data-direction][data-node-id]');
            directionBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const direction = btn.getAttribute('data-direction');
                    const nodeId = btn.getAttribute('data-node-id');
                    if (direction && nodeId) {
                        // Show loading state
                        if (lineageContent) {
                            lineageContent.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 300px;"><div class="skeleton-loader" style="width: 200px;"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>';
                        }
                        vscode.postMessage({
                            command: 'getLineageGraph',
                            nodeId: nodeId,
                            direction: direction,
                            depth: 5
                        });
                    }
                });
            });
        }

        function escapeHtml(text) {
            return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function escapeHtmlAttr(text) {
            return escapeHtml(text).replace(/"/g, '&quot;');
        }
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
        for (const tableKey of graph.stats.orphanedDefinitions) {
            const defs = index.definitionMap.get(tableKey);
            if (!defs) continue;
            for (const def of defs) {
                orphanedDetails.push({
                    name: getDisplayName(def.name, def.schema),
                    type: def.type,
                    filePath: def.filePath,
                    lineNumber: def.lineNumber
                });
            }
        }

        // Generate missing details
        const missingDetails: MissingDefinitionDetail[] = [];
        for (const tableKey of graph.stats.missingDefinitions) {
            const refs = index.referenceMap.get(tableKey) || [];
            const referencingFiles = [...new Set(refs.map(r => r.filePath))];
            const displayName = refs[0]
                ? getDisplayName(refs[0].tableName, refs[0].schema)
                : tableKey;

            missingDetails.push({
                tableName: displayName,
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
                   data-id="${this.escapeHtml(node.id)}"
                   data-label="${this.escapeHtml(node.label)}"
                   data-type="${node.type}"
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

        // NEW: Show column information for references
        if (node.references && node.references.length > 0) {
            content += '<div class="tooltip-content" style="margin-top:8px;">References:</div><ul class="tooltip-list">';

            for (const ref of node.references.slice(0, 5)) {
                content += `<li><strong>${this.escapeHtml(ref.tableName)}</strong> (${ref.referenceType})`;

                // Show columns if available
                if (ref.columns && ref.columns.length > 0) {
                    const columnList = ref.columns.slice(0, 8).map(c => c.columnName).join(', ');
                    const moreCount = ref.columns.length - 8;
                    content += `<br><span style="font-size:9px;color:#94a3b8;">Columns: ${this.escapeHtml(columnList)}${moreCount > 0 ? ` +${moreCount} more` : ''}</span>`;
                }

                content += '</li>';
            }

            if (node.references.length > 5) {
                content += `<li>...and ${node.references.length - 5} more tables</li>`;
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
     * Handle export functionality
     */
    private async handleExport(format: string): Promise<void> {
        if (!this._currentGraph) {
            vscode.window.showErrorMessage('No graph data to export');
            return;
        }

        if (format === 'png') {
            // For PNG export, we'd need to use a library like sharp or canvas
            // For now, show a message that this feature is coming soon
            vscode.window.showInformationMessage('PNG export coming soon! Try SVG or Mermaid instead.');
        } else if (format === 'mermaid') {
            await this.exportAsMermaid();
        } else if (format === 'svg') {
            await this.exportAsSvg();
        }
    }

    /**
     * Export graph as Mermaid diagram
     */
    private async exportAsMermaid(): Promise<void> {
        if (!this._currentGraph) return;

        let mermaid = '```mermaid\ngraph TD\n';

        // Add nodes
        for (const node of this._currentGraph.nodes) {
            const label = node.label.replace(/"/g, '\\"');
            const shape = node.type === 'file' ? '[' : node.type === 'external' ? '((' : '[]';
            const endShape = node.type === 'file' ? ']' : node.type === 'external' ? '))' : ']';
            mermaid += `    ${node.id}${shape}"${label}"${endShape}\n`;
        }

        // Add edges
        for (const edge of this._currentGraph.edges) {
            mermaid += `    ${edge.source} --> ${edge.target}\n`;
        }

        mermaid += '```';

        // Save to file
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('workspace-dependencies.md'),
            filters: {
                'Markdown': ['md']
            }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(mermaid));
            vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
        }
    }

    /**
     * Export graph as SVG
     */
    private async exportAsSvg(): Promise<void> {
        if (!this._currentGraph) return;

        const svg = this.generateSvgString(this._currentGraph);

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('workspace-dependencies.svg'),
            filters: {
                'SVG': ['svg']
            }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(svg));
            vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
        }
    }

    /**
     * Generate SVG string from graph
     */
    private generateSvgString(graph: WorkspaceDependencyGraph): string {
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

        // Generate SVG (similar to renderGraph method but without interactivity)
        const edgesHtml = graph.edges.map(edge => {
            const source = graph.nodes.find(n => n.id === edge.source);
            const target = graph.nodes.find(n => n.id === edge.target);
            if (!source || !target) return '';

            const x1 = source.x + source.width / 2;
            const y1 = source.y + source.height;
            const x2 = target.x + target.width / 2;
            const y2 = target.y;

            const path = `M ${x1} ${y1} C ${x1} ${y1 + 50}, ${x2} ${y2 - 50}, ${x2} ${y2}`;
            const color = edge.referenceType === 'select' ? '#64748b' :
                        edge.referenceType === 'join' ? '#a78bfa' :
                        edge.referenceType === 'insert' ? '#10b981' :
                        edge.referenceType === 'update' ? '#fbbf24' : '#f87171';

            return `    <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`;
        }).join('\n');

        const nodesHtml = graph.nodes.map(node => {
            const color = node.type === 'file' ? '#3b82f6' :
                        node.type === 'table' ? '#10b981' :
                        node.type === 'view' ? '#8b5cf6' : '#475569';

            return `    <g transform="translate(${node.x}, ${node.y})">
        <rect width="${node.width}" height="${node.height}" rx="8" fill="${color}"/>
        <text x="${node.width/2}" y="${node.height/2}" text-anchor="middle" fill="white" font-size="12" font-weight="600">${this.escapeHtml(node.label)}</text>
    </g>`;
        }).join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
${edgesHtml}
${nodesHtml}
</svg>`;
    }

    /**
     * Get Issues panel HTML
     */
    private getIssuesHtml(): string {
        const nonce = getNonce();
        const detailedStats = this._currentGraph ? this.generateDetailedStats(this._currentGraph) : null;
        const totalIssues = (detailedStats?.orphanedDetails.length || 0) + (detailedStats?.missingDetails.length || 0);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Workspace Issues</title>
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-tertiary: #334155;
            --bg-hover: #475569;
            --border-color: #475569;
            --border-subtle: #334155;
            --text-primary: #f1f5f9;
            --text-secondary: #e2e8f0;
            --text-muted: #94a3b8;
            --text-dim: #64748b;
            --accent: #6366f1;
            --success: #10b981;
            --warning: #f59e0b;
            --error: #ef4444;
            --radius-sm: 4px;
            --radius-md: 6px;
            --radius-lg: 8px;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html {
            width: 100%; height: 100vh; overflow: auto;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary); color: var(--text-secondary);
            font-size: 13px;
        }
        #app { width: 100%; min-height: 100%; display: flex; flex-direction: column; }

        /* Header */
        .header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 20px; background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
            position: sticky; top: 0; z-index: 100;
        }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .header-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
        .header-right { display: flex; align-items: center; gap: 12px; }

        .back-btn {
            display: flex; align-items: center; gap: 8px; padding: 8px 14px;
            background: var(--bg-tertiary); border: none; border-radius: var(--radius-md);
            color: var(--text-secondary); font-size: 13px; cursor: pointer;
            transition: all 0.15s;
        }
        .back-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .back-btn svg { width: 16px; height: 16px; }

        .issue-count {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
        }
        .issue-count.warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
        .issue-count.error { background: rgba(239, 68, 68, 0.15); color: var(--error); }
        .issue-count.success { background: rgba(16, 185, 129, 0.15); color: var(--success); }

        /* Summary Bar */
        .summary-bar {
            display: flex; gap: 16px; padding: 16px 20px;
            background: var(--bg-secondary); border-bottom: 1px solid var(--border-subtle);
        }
        .summary-card {
            flex: 1; padding: 16px 20px; background: var(--bg-primary);
            border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);
        }
        .summary-card-value { font-size: 28px; font-weight: 700; color: var(--text-primary); }
        .summary-card-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
        .summary-card.warning .summary-card-value { color: var(--warning); }
        .summary-card.error .summary-card-value { color: var(--error); }

        /* Content */
        .content { padding: 24px; max-width: 1000px; margin: 0 auto; width: 100%; }

        /* Section */
        .section { margin-bottom: 32px; }
        .section-header {
            display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
        }
        .section-icon {
            width: 36px; height: 36px; border-radius: var(--radius-md);
            display: flex; align-items: center; justify-content: center;
        }
        .section-icon.warning { background: rgba(245, 158, 11, 0.15); }
        .section-icon.error { background: rgba(239, 68, 68, 0.15); }
        .section-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
        .section-count {
            padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;
            background: var(--bg-tertiary); color: var(--text-muted);
        }
        .section-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

        /* List */
        .list { display: flex; flex-direction: column; gap: 8px; }
        .list-item {
            display: flex; align-items: center; gap: 14px; padding: 14px 18px;
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle); cursor: pointer;
            transition: all 0.15s;
        }
        .list-item:hover { background: var(--bg-tertiary); border-color: var(--border-color); transform: translateX(2px); }

        .item-type {
            padding: 4px 10px; border-radius: var(--radius-sm); font-size: 10px;
            font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .item-type.table { background: #10b981; color: #fff; }
        .item-type.view { background: #8b5cf6; color: #fff; }

        .item-info { flex: 1; min-width: 0; }
        .item-name { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 3px; }
        .item-path {
            font-size: 12px; color: var(--text-muted); font-family: monospace;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .item-line {
            padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px;
            font-family: monospace; background: var(--bg-primary); color: var(--text-dim);
        }

        /* Missing Item Card */
        .missing-card {
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle); margin-bottom: 12px;
            overflow: hidden;
        }
        .missing-card-header {
            display: flex; align-items: center; gap: 12px;
            padding: 14px 18px; background: var(--bg-primary);
            border-bottom: 1px solid var(--border-subtle);
        }
        .missing-card-icon {
            width: 32px; height: 32px; border-radius: var(--radius-sm);
            background: rgba(239, 68, 68, 0.15); display: flex;
            align-items: center; justify-content: center;
        }
        .missing-card-name { font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1; }
        .missing-card-count {
            padding: 4px 10px; border-radius: 10px; font-size: 11px;
            background: var(--bg-tertiary); color: var(--text-muted);
        }
        .missing-card-refs { padding: 8px; }
        .missing-ref-item {
            display: flex; align-items: center; gap: 12px; padding: 10px 14px;
            border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s;
        }
        .missing-ref-item:hover { background: var(--bg-tertiary); }
        .missing-ref-path { flex: 1; font-size: 12px; color: var(--text-muted); font-family: monospace; }
        .missing-ref-line { font-size: 11px; color: var(--text-dim); font-family: monospace; }
        .missing-more { text-align: center; padding: 10px; font-size: 12px; color: var(--text-dim); }

        /* Empty State */
        .empty-state {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; padding: 80px 20px; text-align: center;
        }
        .empty-state-icon {
            width: 80px; height: 80px; border-radius: 50%;
            background: rgba(16, 185, 129, 0.1); display: flex;
            align-items: center; justify-content: center; margin-bottom: 24px;
        }
        .empty-state-icon svg { width: 40px; height: 40px; color: var(--success); }
        .empty-state-title { font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
        .empty-state-desc { font-size: 14px; color: var(--text-muted); max-width: 400px; }

        .list-more { text-align: center; padding: 16px; font-size: 13px; color: var(--text-dim); }
    </style>
</head>
<body>
    <div id="app">
        <header class="header">
            <div class="header-left">
                <button class="back-btn" id="btn-back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back to Graph
                </button>
                <h1 class="header-title">Workspace Issues</h1>
            </div>
            <div class="header-right">
                ${totalIssues > 0
                    ? `<span class="issue-count ${totalIssues > 5 ? 'error' : 'warning'}">${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found</span>`
                    : `<span class="issue-count success">✓ All clear</span>`}
            </div>
        </header>

        ${totalIssues > 0 && detailedStats ? `
        <div class="summary-bar">
            <div class="summary-card warning">
                <div class="summary-card-value">${detailedStats.orphanedDetails.length}</div>
                <div class="summary-card-label">Orphaned Definitions</div>
            </div>
            <div class="summary-card error">
                <div class="summary-card-value">${detailedStats.missingDetails.length}</div>
                <div class="summary-card-label">Missing Definitions</div>
            </div>
        </div>
        ` : ''}

        <div class="content">
            ${!detailedStats || detailedStats.orphanedDetails.length === 0 ? '' : `
            <div class="section">
                <div class="section-header">
                    <div class="section-icon warning">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="section-title">Orphaned Definitions</span>
                            <span class="section-count">${detailedStats.orphanedDetails.length}</span>
                        </div>
                        <div class="section-desc">Tables and views defined but never referenced</div>
                    </div>
                </div>
                <div class="list">
                    ${detailedStats.orphanedDetails.slice(0, 50).map(item => `
                    <div class="list-item" data-filepath="${this.escapeHtml(item.filePath)}" data-line="${item.lineNumber}">
                        <span class="item-type ${item.type}">${item.type}</span>
                        <div class="item-info">
                            <div class="item-name">${this.escapeHtml(item.name)}</div>
                            <div class="item-path">${this.escapeHtml(item.filePath)}</div>
                        </div>
                        <span class="item-line">line ${item.lineNumber}</span>
                    </div>
                    `).join('')}
                    ${detailedStats.orphanedDetails.length > 50 ? `<div class="list-more">+ ${detailedStats.orphanedDetails.length - 50} more items</div>` : ''}
                </div>
            </div>
            `}

            ${!detailedStats || detailedStats.missingDetails.length === 0 ? '' : `
            <div class="section">
                <div class="section-header">
                    <div class="section-icon error">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="section-title">Missing Definitions</span>
                            <span class="section-count">${detailedStats.missingDetails.length}</span>
                        </div>
                        <div class="section-desc">Tables referenced but not defined in workspace</div>
                    </div>
                </div>
                <div class="list">
                    ${detailedStats.missingDetails.slice(0, 30).map(item => `
                    <div class="missing-card">
                        <div class="missing-card-header">
                            <div class="missing-card-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                                </svg>
                            </div>
                            <span class="missing-card-name">${this.escapeHtml(item.tableName)}</span>
                            <span class="missing-card-count">${item.referenceCount} ref${item.referenceCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="missing-card-refs">
                            ${item.references.slice(0, 4).map(ref => `
                            <div class="missing-ref-item" data-filepath="${this.escapeHtml(ref.filePath)}" data-line="${ref.lineNumber}">
                                <span class="missing-ref-path">${this.escapeHtml(ref.filePath)}</span>
                                <span class="missing-ref-line">:${ref.lineNumber}</span>
                            </div>
                            `).join('')}
                            ${item.references.length > 4 ? `<div class="missing-more">+ ${item.references.length - 4} more references</div>` : ''}
                        </div>
                    </div>
                    `).join('')}
                    ${detailedStats.missingDetails.length > 30 ? `<div class="list-more">+ ${detailedStats.missingDetails.length - 30} more missing tables</div>` : ''}
                </div>
            </div>
            `}

            ${(!detailedStats || (detailedStats.orphanedDetails.length === 0 && detailedStats.missingDetails.length === 0)) ? `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                </div>
                <div class="empty-state-title">No Issues Found</div>
                <div class="empty-state-desc">All tables and views are properly defined and referenced in your workspace.</div>
            </div>
            ` : ''}
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.getElementById('btn-back').addEventListener('click', () => {
            vscode.postMessage({ command: 'switchView', view: 'graph' });
        });

        document.querySelectorAll('.list-item, .missing-ref-item').forEach(item => {
            item.addEventListener('click', () => {
                const filePath = item.getAttribute('data-filepath');
                const line = item.getAttribute('data-line');
                if (filePath) {
                    vscode.postMessage({
                        command: 'openFileAtLine',
                        filePath: filePath,
                        line: parseInt(line) || 0
                    });
                }
            });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Get loading HTML
     */
    private getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            display: flex; justify-content: center; align-items: center;
            height: 100vh; background: #0f172a; color: #e2e8f0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .loader-container { text-align: center; }
        .loader {
            width: 48px; height: 48px; border: 3px solid #334155;
            border-top-color: #6366f1; border-radius: 50%;
            animation: spin 1s linear infinite; margin: 0 auto 24px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loader-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
        .loader-subtitle { color: #94a3b8; font-size: 14px; }
    </style>
</head>
<body>
    <div class="loader-container">
        <div class="loader"></div>
        <div class="loader-title">Analyzing Workspace</div>
        <div class="loader-subtitle">Scanning SQL files...</div>
    </div>
</body>
</html>`;
    }

    /**
     * Get manual index HTML
     */
    private getManualIndexHtml(fileCount: number): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            display: flex; justify-content: center; align-items: center;
            height: 100vh; background: #0f172a; color: #e2e8f0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .container { text-align: center; max-width: 400px; padding: 20px; }
        .icon {
            width: 64px; height: 64px; margin: 0 auto 24px;
            background: rgba(99, 102, 241, 0.1); border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
        }
        .icon svg { width: 32px; height: 32px; color: #6366f1; }
        .title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
        .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
        .file-count { font-size: 32px; font-weight: 700; color: #6366f1; margin-bottom: 8px; }
        .btn {
            padding: 12px 28px; background: #6366f1; border: none;
            border-radius: 8px; color: white; font-size: 14px; font-weight: 500;
            cursor: pointer; transition: all 0.15s;
        }
        .btn:hover { background: #818cf8; transform: translateY(-1px); }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
        </div>
        <div class="file-count">${fileCount}</div>
        <div class="title">SQL Files Found</div>
        <div class="subtitle">Large workspace detected. This may take a moment to analyze all dependencies.</div>
        <button class="btn" onclick="vscode.postMessage({command:'refresh'})">
            Start Analysis
        </button>
    </div>
    <script nonce="${nonce}">const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
    }

    /**
     * Get empty workspace HTML
     */
    private getEmptyWorkspaceHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            display: flex; justify-content: center; align-items: center;
            height: 100vh; background: #0f172a; color: #e2e8f0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .container { text-align: center; max-width: 400px; padding: 20px; }
        .icon {
            width: 80px; height: 80px; margin: 0 auto 24px;
            background: rgba(100, 116, 139, 0.1); border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
        }
        .icon svg { width: 40px; height: 40px; color: #64748b; }
        .title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
        .subtitle { color: #94a3b8; font-size: 14px; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
                <path d="M12 18v-6M9 15h6"/>
            </svg>
        </div>
        <div class="title">No SQL Files Found</div>
        <div class="subtitle">Add .sql files to your workspace to visualize dependencies.</div>
    </div>
</body>
</html>`;
    }

    /**
     * Get error HTML
     */
    private getErrorHtml(message: string): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            display: flex; justify-content: center; align-items: center;
            height: 100vh; background: #0f172a; color: #e2e8f0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .container { text-align: center; max-width: 400px; padding: 20px; }
        .icon {
            width: 64px; height: 64px; margin: 0 auto 24px;
            background: rgba(239, 68, 68, 0.1); border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
        }
        .icon svg { width: 32px; height: 32px; color: #ef4444; }
        .title { font-size: 18px; font-weight: 600; color: #f87171; margin-bottom: 8px; }
        .message { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
        .btn {
            padding: 10px 20px; background: #334155; border: none;
            border-radius: 6px; color: #e2e8f0; font-size: 13px;
            cursor: pointer; transition: all 0.15s;
        }
        .btn:hover { background: #475569; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
        </div>
        <div class="title">Something went wrong</div>
        <div class="message">${message}</div>
        <button class="btn" onclick="vscode.postMessage({command:'refresh'})">
            Try Again
        </button>
    </div>
    <script nonce="${nonce}">const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
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
