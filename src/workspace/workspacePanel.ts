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
import { getWebviewStyles, getIssuesStyles, getStateStyles } from './ui/sharedStyles';
import { getWebviewScript, getIssuesScript, getMinimalScript, WebviewScriptParams } from './ui/clientScripts';

// Handler modules
import { MessageHandler, MessageHandlerContext } from './handlers';

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

    // Message handler
    private _messageHandler: MessageHandler | null = null;

    // Theme state
    private _isDarkTheme: boolean = true;

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

        // Detect VS Code theme
        this._isDarkTheme = vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Light;

        // Handle panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Initialize message handler
        this.initializeMessageHandler();

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                if (this._messageHandler) {
                    await this._messageHandler.handleMessage(message);
                }
            },
            null,
            this._disposables
        );

        // Listen for index updates
        this._indexManager.setOnIndexUpdated(() => {
            this.rebuildAndRenderGraph();
        });

        // Listen for VS Code theme changes
        vscode.window.onDidChangeActiveColorTheme(
            (theme) => {
                this._isDarkTheme = theme.kind !== vscode.ColorThemeKind.Light;
                this.renderCurrentView();
            },
            null,
            this._disposables
        );
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
     * Initialize message handler with context
     */
    private initializeMessageHandler(): void {
        const context: MessageHandlerContext = {
            panel: this._panel,

            // State accessors
            getCurrentGraph: () => this._currentGraph,
            setCurrentGraph: (graph) => { this._currentGraph = graph; },
            getCurrentView: () => this._currentView,
            setCurrentView: (view) => { this._currentView = view; },
            getCurrentSearchFilter: () => this._currentSearchFilter,
            setCurrentSearchFilter: (filter) => { this._currentSearchFilter = filter; },
            getShowHelp: () => this._showHelp,
            setShowHelp: (show) => { this._showHelp = show; },

            // Lineage state accessors
            getLineageGraph: () => this._lineageGraph,
            setLineageGraph: (graph) => { this._lineageGraph = graph; },
            getLineageBuilder: () => this._lineageBuilder,
            setLineageBuilder: (builder) => { this._lineageBuilder = builder; },
            getFlowAnalyzer: () => this._flowAnalyzer,
            setFlowAnalyzer: (analyzer) => { this._flowAnalyzer = analyzer; },
            getImpactAnalyzer: () => this._impactAnalyzer,
            setImpactAnalyzer: (analyzer) => { this._impactAnalyzer = analyzer; },
            getColumnLineageTracker: () => this._columnLineageTracker,
            setColumnLineageTracker: (tracker) => { this._columnLineageTracker = tracker; },
            getSelectedLineageNode: () => this._selectedLineageNode,
            setSelectedLineageNode: (node) => { this._selectedLineageNode = node; },
            getCurrentImpactReport: () => this._currentImpactReport,
            setCurrentImpactReport: (report) => { this._currentImpactReport = report; },
            getCurrentFlowResult: () => this._currentFlowResult,
            setCurrentFlowResult: (result) => { this._currentFlowResult = result; },

            // UI generators
            getTableExplorer: () => this._tableExplorer,
            getLineageView: () => this._lineageView,
            getImpactView: () => this._impactView,

            // Theme state
            getIsDarkTheme: () => this._isDarkTheme,
            setIsDarkTheme: (dark) => { this._isDarkTheme = dark; },

            // Callbacks
            renderCurrentView: () => this.renderCurrentView(),
            getWebviewHtml: (graph, filter) => this.getWebviewHtml(graph, filter),
            buildIndexWithProgress: () => this.buildIndexWithProgress(),
            rebuildAndRenderGraph: () => this.rebuildAndRenderGraph(),
            buildLineageGraph: () => this.buildLineageGraph(),
            handleExport: (format) => this.handleExport(format)
        };

        this._messageHandler = new MessageHandler(context);
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

            case 'toggleTheme':
                this._isDarkTheme = !this._isDarkTheme;
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
        if (this._lineageGraph) {return;} // Already built

        const index = this._indexManager.getIndex();
        if (!index) {return;}

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
        if (!this._flowAnalyzer || !this._lineageGraph) {return;}

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
        if (!this._impactAnalyzer) {return;}

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
        if (!this._lineageGraph) {return;}

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
        if (!this._columnLineageTracker || !this._lineageGraph) {return;}

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
        if (!this._lineageGraph) {return;}

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
        if (!this._flowAnalyzer) {return;}

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
        if (!this._flowAnalyzer) {return;}

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
            if (node.type === 'column') {continue;}

            // Apply type filter
            if (typeFilter && typeFilter !== 'all' && node.type !== typeFilter) {continue;}

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
            if (aExact && !bExact) {return -1;}
            if (!aExact && bExact) {return 1;}
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
        if (!this._lineageGraph) {return;}

        const node = this._lineageGraph.nodes.get(nodeId);
        if (!node) {return;}

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
        if (!this._lineageGraph) {return null;}

        let tables = 0, views = 0, columns = 0;
        for (const node of this._lineageGraph.nodes.values()) {
            if (node.type === 'table') {tables++;}
            else if (node.type === 'view') {views++;}
            else if (node.type === 'column') {columns++;}
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
     * Simplified to use extracted modules for styles and scripts
     */
    private getWebviewHtml(graph: WorkspaceDependencyGraph, searchFilter: SearchFilter = { query: '', nodeTypes: undefined, useRegex: false, caseSensitive: false }): string {
        const nonce = getNonce();
        const detailedStats = this.generateDetailedStats(graph);
        const totalIssues = graph.stats.orphanedDefinitions.length + graph.stats.missingDefinitions.length;

        // Generate graph data JSON for client script
        const graphData = JSON.stringify({
            nodes: graph.nodes.map(node => ({
                id: node.id,
                label: node.label,
                type: node.type,
                filePath: node.filePath
            }))
        });

        // Get styles and scripts from extracted modules
        const styles = getWebviewStyles(this._isDarkTheme);
        const scriptParams: WebviewScriptParams = {
            nonce,
            graphData,
            searchFilterQuery: searchFilter.query || '',
            initialView: this._currentView === 'issues' ? 'graph' : this._currentView
        };
        const script = getWebviewScript(scriptParams);

        // Generate HTML body content
        const bodyContent = this.generateGraphBody(graph, searchFilter, detailedStats, totalIssues, script);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Workspace Dependencies</title>
    <style>
        ${styles}
    </style>
</head>
${bodyContent}
</html>`;
    }

    /**
     * Generate HTML body content for graph view
     */
    private generateGraphBody(
        graph: WorkspaceDependencyGraph,
        searchFilter: SearchFilter,
        detailedStats: DetailedWorkspaceStats,
        totalIssues: number,
        script: string
    ): string {
        const statsHtml = this.generateStatsHtml(graph, detailedStats, totalIssues);
        const graphHtml = this.generateGraphAreaHtml(graph, searchFilter);

        return `<body>
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
                <button class="icon-btn" id="btn-theme" title="Toggle theme (${this._isDarkTheme ? 'Light' : 'Dark'})">
                    ${this._isDarkTheme ? `
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
        </div>
    </div>

    ${script}
</body>`;
    }

    /**
     * Generate statistics HTML for sidebar
     */
    private generateStatsHtml(
        graph: WorkspaceDependencyGraph,
        detailedStats: DetailedWorkspaceStats,
        totalIssues: number
    ): string {
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
                        <button class="export-btn" id="btn-all-issues-sidebar" style="margin-top: 8px;">
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
        </div>`;
    }

    /**
     * Generate graph area HTML with toolbar and SVG
     */
    private generateGraphAreaHtml(graph: WorkspaceDependencyGraph, searchFilter: SearchFilter): string {
        return `
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
        </div>`;
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
            if (!defs) {continue;}
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
            if (!source || !target) {return '';}

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
        if (!this._currentGraph) {return;}

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
        if (!this._currentGraph) {return;}

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
            if (!source || !target) {return '';}

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
     * Uses extracted styles and scripts for consistency
     */
    private getIssuesHtml(): string {
        const nonce = getNonce();
        const detailedStats = this._currentGraph ? this.generateDetailedStats(this._currentGraph) : null;
        const totalIssues = (detailedStats?.orphanedDetails.length || 0) + (detailedStats?.missingDetails.length || 0);

        const styles = getIssuesStyles(this._isDarkTheme);
        const script = getIssuesScript(nonce);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Workspace Issues</title>
    <style>
        ${styles}
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

    ${script}
</body>
</html>`;
    }

    /**
     * Get loading HTML
     */
    private getLoadingHtml(): string {
        const styles = getStateStyles(this._isDarkTheme);
        return `<!DOCTYPE html>
<html>
<head>
    <style>${styles}</style>
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
        const styles = getStateStyles(this._isDarkTheme);
        return `<!DOCTYPE html>
<html>
<head>
    <style>${styles}</style>
</head>
<body>
    <div class="container">
        <div class="icon accent">
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
        const styles = getStateStyles(this._isDarkTheme);
        return `<!DOCTYPE html>
<html>
<head>
    <style>${styles}</style>
</head>
<body>
    <div class="container">
        <div class="icon muted">
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
        const styles = getStateStyles(this._isDarkTheme);
        return `<!DOCTYPE html>
<html>
<head>
    <style>${styles}</style>
</head>
<body>
    <div class="container">
        <div class="icon error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
        </div>
        <div class="title error">Something went wrong</div>
        <div class="message">${message}</div>
        <button class="btn secondary" onclick="vscode.postMessage({command:'refresh'})">
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
            if (d) {d.dispose();}
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
