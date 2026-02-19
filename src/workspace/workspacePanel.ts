// Workspace Panel - VS Code webview panel for workspace dependency visualization

import * as vscode from 'vscode';
import * as path from 'path';
import { IndexManager } from './indexManager';
import { buildDependencyGraph } from './dependencyGraph';
import {
    WorkspaceDependencyGraph,
    GraphMode,
    SearchFilter,
    SqlDialect,
} from './types';
import { logger } from '../logger';

// Lineage modules
import { LineageBuilder } from './lineage/lineageBuilder';
import { LineageGraph, LineageNode } from './lineage/types';
import { FlowAnalyzer, FlowResult } from './lineage/flowAnalyzer';
import { ImpactAnalyzer, ImpactReport } from './lineage/impactAnalyzer';
import { ColumnLineageTracker } from './lineage/columnLineage';

// UI modules
import { TableExplorer } from './ui/tableExplorer';
import { LineageView } from './ui/lineageView';
import { ImpactView } from './ui/impactView';
import { ViewMode } from './ui/types';
import { getWebviewStyles, getIssuesStyles, getStateStyles } from './ui/sharedStyles';
import { getWebviewScript, getIssuesScript, WebviewScriptParams } from './ui/clientScripts';

// Handler modules
import { MessageHandler, MessageHandlerContext } from './handlers';
import {
    resolveAutoIndexThresholdFromConfig,
    resolveDefaultLineageDepthFromConfig,
    resolveWorkspaceThemeFromSettings,
} from './panel/settings';
import {
    formatDurationText,
    escapeHtmlText,
    escapeForInlineScriptValue,
    generateNonce,
} from './panel/text';
import {
    buildImpactReportExportData as buildImpactReportExportPayload,
    generateImpactReportMarkdown as renderImpactReportMarkdown,
} from './panel/impactExport';
import {
    createLoadingHtml,
    createManualIndexHtml,
    createEmptyWorkspaceHtml,
    createErrorHtml as createErrorStateHtml,
} from './panel/statePages';
import { renderWorkspaceGraphSvg } from './panel/graphSvg';
import {
    createGraphAreaHtml,
    createGraphBodyHtml,
    createStatsPanelHtml,
} from './panel/graphTemplates';
import { createIssuesPageHtml } from './panel/issuesPage';
import {
    copyWorkspaceMermaid,
    exportWorkspaceDotFile,
    exportWorkspaceJsonFile,
    exportWorkspaceMermaidFile,
    exportWorkspaceSvgFile,
    saveWorkspacePng,
} from './panel/graphExportActions';
import { buildDetailedWorkspaceStats, buildIndexStatus } from './panel/workspaceStats';

// Shared theme
import type { WorkspaceWebviewMessage, WorkspaceHostMessage } from '../shared/messages';

const VALID_GRAPH_MODES: GraphMode[] = ['files', 'tables', 'hybrid'];
const LINEAGE_LEGEND_VISIBILITY_STATE_KEY = 'sqlCrack.workspace.lineageLegendVisible';

/**
 * Get graph mode from VS Code settings with validation.
 * Falls back to 'tables' if setting is invalid or missing.
 */
function getGraphModeFromConfig(): GraphMode {
    const raw = vscode.workspace.getConfiguration('sqlCrack').get<string>('workspaceGraphDefaultMode', 'tables');
    return VALID_GRAPH_MODES.includes(raw as GraphMode) ? (raw as GraphMode) : 'tables';
}

/**
 * Manages the workspace dependency visualization webview panel
 */
export class WorkspacePanel {
    public static currentPanel: WorkspacePanel | undefined;
    public static readonly viewType = 'sqlCrackWorkspace';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _extensionContext: vscode.ExtensionContext;
    private readonly _extensionVersion: string;
    private readonly _scopeUri: vscode.Uri | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _indexManager: IndexManager;
    private _currentGraph: WorkspaceDependencyGraph | null = null;
    private _currentView: ViewMode | 'graph' | 'issues' = 'graph';
    /** Current graph mode (files/tables/hybrid) - persists across refresh, initialized from settings */
    private _currentGraphMode: GraphMode = 'tables';
    private _currentSearchFilter: SearchFilter = {
        query: '',
        nodeTypes: undefined,
        useRegex: false,
        caseSensitive: false
    };
    private _showHelp: boolean = false;
    /** Guard: true while rebuildAndRenderGraph() is running */
    private _isRebuilding: boolean = false;

    // Lineage state
    private _lineageGraph: LineageGraph | null = null;
    private _lineageBuilder: LineageBuilder | null = null;
    private _flowAnalyzer: FlowAnalyzer | null = null;
    private _impactAnalyzer: ImpactAnalyzer | null = null;
    private _columnLineageTracker: ColumnLineageTracker | null = null;
    private _lineageBuildPromise: Promise<void> | null = null;
    private _lineageBuildVersion = 0;
    private _selectedLineageNode: LineageNode | null = null;
    private _currentImpactReport: ImpactReport | null = null;
    private _currentFlowResult: FlowResult | null = null;
    private _lineageLegendVisible: boolean = true;

    // UI generators
    private _tableExplorer: TableExplorer = new TableExplorer();
    private _lineageView: LineageView = new LineageView();
    private _impactView: ImpactView = new ImpactView();

    // Message handler
    private _messageHandler: MessageHandler | null = null;

    // Theme state
    private _isDarkTheme: boolean = true;
    private _isHighContrast: boolean = false;

    private _postMessage(msg: WorkspaceHostMessage): void {
        this._panel.webview.postMessage(msg);
    }

    /**
     * Create or show the workspace panel
     */
    public static async createOrShow(
        extensionUri: vscode.Uri,
        context: vscode.ExtensionContext,
        dialect: SqlDialect = 'MySQL',
        scopeUri?: vscode.Uri
    ): Promise<void> {
        const column = vscode.ViewColumn.Beside;

        // If panel exists and scope changed, dispose and recreate
        if (WorkspacePanel.currentPanel) {
            const currentScope = WorkspacePanel.currentPanel._scopeUri?.fsPath;
            const newScope = scopeUri?.fsPath;
            if (currentScope !== newScope) {
                // Different scope — dispose old panel and create new one
                WorkspacePanel.currentPanel.dispose();
            } else {
                WorkspacePanel.currentPanel._panel.reveal(column);
                return;
            }
        }

        const folderName = scopeUri ? path.basename(scopeUri.fsPath) : undefined;
        const title = folderName
            ? `SQL Dependencies: ${folderName}`
            : 'SQL Workspace Dependencies';

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            WorkspacePanel.viewType,
            title,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist')
                ]
            }
        );

        WorkspacePanel.currentPanel = new WorkspacePanel(panel, extensionUri, context, dialect, scopeUri);
        await WorkspacePanel.currentPanel.initialize();
    }

    /**
     * Private constructor
     */
    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        context: vscode.ExtensionContext,
        dialect: SqlDialect,
        scopeUri?: vscode.Uri
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._extensionContext = context;
        this._extensionVersion = WorkspacePanel.resolveExtensionVersion();
        this._scopeUri = scopeUri;
        this._indexManager = new IndexManager(context, dialect, scopeUri);

        // Detect theme from settings or VS Code theme
        this._isDarkTheme = this.getThemeFromSettings();
        this._tableExplorer.setTraversalDepth(resolveDefaultLineageDepthFromConfig());
        const savedLineageLegendVisibility = context.workspaceState.get<boolean>(LINEAGE_LEGEND_VISIBILITY_STATE_KEY);
        if (typeof savedLineageLegendVisibility === 'boolean') {
            this._lineageLegendVisible = savedLineageLegendVisibility;
        }

        // Handle panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Initialize message handler
        this.initializeMessageHandler();

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            async (message: WorkspaceWebviewMessage) => {
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

        // Listen for VS Code theme changes — hot-swap CSS to avoid flicker
        vscode.window.onDidChangeActiveColorTheme(
            () => {
                this._isDarkTheme = this.getThemeFromSettings();
                const css = getWebviewStyles(this._isDarkTheme, this._isHighContrast);
                this._postMessage({ command: 'themeChanged', css, isDark: this._isDarkTheme });
            },
            null,
            this._disposables
        );

        // Listen for configuration changes (theme preference)
        vscode.workspace.onDidChangeConfiguration(
            (e) => {
                if (e.affectsConfiguration('sqlCrack.advanced.defaultTheme')) {
                    this._isDarkTheme = this.getThemeFromSettings();
                    const css = getWebviewStyles(this._isDarkTheme, this._isHighContrast);
                    this._postMessage({ command: 'themeChanged', css, isDark: this._isDarkTheme });
                }
                if (e.affectsConfiguration('sqlCrack.workspaceLineageDepth')) {
                    const lineageDepth = resolveDefaultLineageDepthFromConfig();
                    this._tableExplorer.setTraversalDepth(lineageDepth);
                    this._postMessage({
                        command: 'workspaceLineageDepthUpdated',
                        depth: lineageDepth
                    });
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Resolve extension version for export metadata.
     */
    private static resolveExtensionVersion(): string {
        const extension = vscode.extensions?.getExtension('buvan.sql-crack');
        const manifestVersion = (extension?.packageJSON as { version?: string } | undefined)?.version;
        if (manifestVersion && manifestVersion.trim().length > 0) {
            return manifestVersion;
        }

        const envVersion = process.env.npm_package_version;
        if (envVersion && envVersion.trim().length > 0) {
            return envVersion;
        }

        return '1.0';
    }

    /**
     * Initialize the panel
     */
    private async initialize(): Promise<void> {
        // Show loading state
        this._panel.webview.html = createLoadingHtml({
            isDarkTheme: this._isDarkTheme,
            nonce: generateNonce(),
        });

        // Initialize index manager
        const autoIndexThreshold = resolveAutoIndexThresholdFromConfig();
        const { autoIndexed, fileCount } = await this._indexManager.initialize(autoIndexThreshold);

        if (fileCount === 0) {
            this._panel.webview.html = createEmptyWorkspaceHtml({
                isDarkTheme: this._isDarkTheme,
                nonce: generateNonce(),
            });
            return;
        }

        if (!autoIndexed && fileCount >= autoIndexThreshold) {
            // Large workspace - ask user to confirm indexing
            const result = await vscode.window.showInformationMessage(
                `Found ${fileCount} SQL files in workspace. Index them now?`,
                'Index Now',
                'Cancel'
            );

            if (result === 'Index Now') {
                await this.buildIndexWithProgress();
            } else {
                this._panel.webview.html = createManualIndexHtml({
                    fileCount,
                    isDarkTheme: this._isDarkTheme,
                    nonce: generateNonce(),
                });
                return;
            }
        }

        // Initialize graph mode from settings
        this._currentGraphMode = getGraphModeFromConfig();
        // Build and render graph
        await this.rebuildAndRenderGraph();
    }

    /**
     * Build index with progress indicator
     * Supports cancellation for large workspaces
     */
    private async buildIndexWithProgress(): Promise<void> {
        let wasCancelled = false;

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Indexing SQL Workspace',
                cancellable: true
            },
            async (progress, token) => {
                // Create cancellation token wrapper
                const cancellationToken = {
                    get isCancellationRequested() {
                        return token.isCancellationRequested;
                    }
                };

                token.onCancellationRequested(() => {
                    wasCancelled = true;
                });

                const startTime = Date.now();
                let lastFile = '';
                logger.debug('[Workspace] Starting index build...');

                await this._indexManager.buildIndex((current, total, fileName) => {
                    lastFile = fileName;

                    // Calculate time estimate
                    const elapsed = Date.now() - startTime;
                    const avgTimePerFile = elapsed / current;
                    const remaining = avgTimePerFile * (total - current);
                    const remainingStr = formatDurationText(remaining);

                    progress.report({
                        message: `${current}/${total}: ${fileName} (~${remainingStr} remaining)`,
                        increment: (1 / total) * 100
                    });
                }, cancellationToken);

                const duration = Date.now() - startTime;
                logger.debug(`[Workspace] Index build completed in ${formatDurationText(duration)} (${this._indexManager.getIndex()?.fileCount ?? 0} files)`);
            }
        );

        if (wasCancelled) {
            logger.info('[Workspace] Index build was cancelled by user');
            vscode.window.showWarningMessage('Workspace indexing was cancelled. Partial results may be available.');
        }
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
            getCurrentGraphMode: () => this._currentGraphMode,
            setCurrentGraphMode: (mode) => { this._currentGraphMode = mode; },
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
            getLineageLegendVisible: () => this._lineageLegendVisible,
            setLineageLegendVisible: (visible) => {
                this._lineageLegendVisible = visible;
                void this._extensionContext.workspaceState.update(LINEAGE_LEGEND_VISIBILITY_STATE_KEY, visible);
            },

            // UI generators
            getTableExplorer: () => this._tableExplorer,
            getLineageView: () => this._lineageView,
            getImpactView: () => this._impactView,
            getDefaultLineageDepth: () => resolveDefaultLineageDepthFromConfig(),

            // Theme state
            getIsDarkTheme: () => this._isDarkTheme,
            setIsDarkTheme: (dark) => { this._isDarkTheme = dark; },

            // Rebuild state
            getIsRebuilding: () => this._isRebuilding,

            // Callbacks
            renderCurrentView: () => this.renderCurrentView(),
            getWebviewHtml: (graph, filter) => this.getWebviewHtml(graph, filter),
            getThemeCss: (isDark) => getWebviewStyles(isDark, this._isHighContrast),
            buildIndexWithProgress: () => this.buildIndexWithProgress(),
            rebuildAndRenderGraph: () => this.rebuildAndRenderGraph(),
            buildLineageGraph: () => this.buildLineageGraph(),
            handleExport: (format) => this.handleExport(format),
            savePngToFile: (base64Data, suggestedFilename) => this.savePngToFile(base64Data, suggestedFilename),
        };

        this._messageHandler = new MessageHandler(context);
    }

    /**
     * Rebuild and render the dependency graph
     */
    private async rebuildAndRenderGraph(): Promise<void> {
        const index = this._indexManager.getIndex();
        if (!index) {
            this._panel.webview.html = this.getErrorHtml(
                'No workspace index available.',
                'SQL files need to be scanned before the dependency graph can be built. Click "Refresh" or open SQL files in your workspace to start indexing.'
            );
            return;
        }

        this._isRebuilding = true;
        try {
            // Clear cached lineage graph so it rebuilds with new data
            this.invalidateLineageState();

            this._currentGraph = buildDependencyGraph(index, this._currentGraphMode);
            this.renderCurrentView();
        } finally {
            this._isRebuilding = false;
        }
    }

    private invalidateLineageState(): void {
        this._lineageBuildVersion += 1;
        this._lineageGraph = null;
        this._lineageBuilder = null;
        this._flowAnalyzer = null;
        this._impactAnalyzer = null;
        this._columnLineageTracker = null;
    }

    /**
     * Render the current view (graph or issues)
     */
    private renderCurrentView(): void {
        if (!this._currentGraph) {
            this._panel.webview.html = this.getErrorHtml(
                'No graph data available.',
                'The dependency graph could not be built from the current index. Try refreshing or check that your workspace contains SQL files.'
            );
            return;
        }

        if (this._currentView === 'issues') {
            this._panel.webview.html = this.getIssuesHtml();
        } else {
            this._panel.webview.html = this.getWebviewHtml(this._currentGraph, this._currentSearchFilter);
        }
    }

    // ========== Lineage Methods ==========

    /**
     * Build lineage graph from workspace index
     */
    private async buildLineageGraph(): Promise<void> {
        if (this._lineageGraph) {return;} // Already built

        while (!this._lineageGraph) {
            const index = this._indexManager.getIndex();
            if (!index) {
                return;
            }

            if (this._lineageBuildPromise) {
                const inFlight = this._lineageBuildPromise;
                await inFlight;
                if (this._lineageBuildPromise === inFlight) {
                    this._lineageBuildPromise = null;
                }
                if (this._lineageGraph || !this._indexManager.getIndex()) {
                    return;
                }
                continue;
            }

            const buildVersion = this._lineageBuildVersion;
            const buildPromise = Promise.resolve().then(() => {
                if (this._lineageGraph) {return;}

                const currentIndex = this._indexManager.getIndex();
                if (!currentIndex) {return;}

                const builder = new LineageBuilder({ includeExternal: true, includeColumns: true });
                const graph = builder.buildFromIndex(currentIndex);

                // If graph state was invalidated while building, discard stale results.
                if (buildVersion !== this._lineageBuildVersion) {
                    return;
                }

                this._lineageBuilder = builder;
                this._lineageGraph = graph;
                this._flowAnalyzer = new FlowAnalyzer(graph);
                this._impactAnalyzer = new ImpactAnalyzer(graph, this._flowAnalyzer);
                this._columnLineageTracker = new ColumnLineageTracker(graph);
            });

            this._lineageBuildPromise = buildPromise;
            try {
                await buildPromise;
            } finally {
                if (this._lineageBuildPromise === buildPromise) {
                    this._lineageBuildPromise = null;
                }
            }

            if (this._lineageGraph) {
                return;
            }
            if (buildVersion === this._lineageBuildVersion) {
                return;
            }
        }
    }

    /**
     * Get webview HTML with graph data and search functionality
     * Simplified to use extracted modules for styles and scripts
     */
    private getWebviewHtml(graph: WorkspaceDependencyGraph, searchFilter: SearchFilter = { query: '', nodeTypes: undefined, useRegex: false, caseSensitive: false }): string {
        const nonce = generateNonce();
        const totalIssues = graph.stats.orphanedDefinitions.length + graph.stats.missingDefinitions.length + graph.stats.parseErrors;

        // Generate graph data JSON for client script
        const graphData = escapeForInlineScriptValue({
            nodes: graph.nodes.map(node => {
                const columnSet = new Set<string>();
                if (node.definitions) {
                    for (const def of node.definitions) {
                        if (!def || !Array.isArray(def.columns)) {
                            continue;
                        }
                        for (const col of def.columns) {
                            const name = typeof col?.name === 'string' ? col.name : '';
                            if (name) {
                                columnSet.add(name);
                            }
                        }
                    }
                }
                return {
                    id: node.id,
                    label: node.label,
                    type: node.type,
                    filePath: node.filePath,
                    columns: Array.from(columnSet)
                };
            })
        });

        // Get styles and scripts from extracted modules
        const styles = getWebviewStyles(this._isDarkTheme, this._isHighContrast);
        const scriptParams: WebviewScriptParams = {
            nonce,
            graphData,
            searchFilterQuery: searchFilter.query || '',
            initialView: this._currentView === 'issues' ? 'graph' : this._currentView,
            currentGraphMode: this._currentGraphMode,
            lineageDefaultDepth: resolveDefaultLineageDepthFromConfig(),
            lineageLegendVisible: this._lineageLegendVisible
        };
        const script = getWebviewScript(scriptParams);

        // Generate HTML body content
        const bodyContent = createGraphBodyHtml({
            graph,
            searchFilter,
            totalIssues,
            script,
            currentGraphMode: this._currentGraphMode,
            isDarkTheme: this._isDarkTheme,
            indexStatus: buildIndexStatus(this._indexManager.getIndex()),
            statsHtml: createStatsPanelHtml({
                escapeHtml: escapeHtmlText,
            }),
            graphHtml: createGraphAreaHtml({
                graph,
                searchFilter,
                renderGraph: (currentGraph) => this.renderGraph(currentGraph),
            }),
            escapeHtml: escapeHtmlText,
        });

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
     * Render the graph SVG with improved edge styling.
     * Note: Bounds calculation is kept for export functionality, but the main SVG
     * doesn't use viewBox - it uses manual transforms for zoom/pan (see renderGraph method).
     */
    private renderGraph(graph: WorkspaceDependencyGraph): string {
        return renderWorkspaceGraphSvg({
            graph,
            isDarkTheme: this._isDarkTheme,
            escapeHtml: escapeHtmlText,
        });
    }

    /**
     * Handle export functionality
     */
    private async handleExport(format: string): Promise<void> {
        if (format === 'impact-markdown') {
            await this.exportImpactReport('markdown');
            return;
        }

        if (format === 'impact-json') {
            await this.exportImpactReport('json');
            return;
        }

        if (this._isRebuilding) {
            vscode.window.showWarningMessage('Graph is being rebuilt. Please try exporting again in a moment.');
            return;
        }
        if (!this._currentGraph) {
            vscode.window.showErrorMessage('No graph data to export');
            return;
        }

        if (format === 'clipboard-png') {
            this._postMessage({ command: 'exportPngClipboard' });
        } else if (format === 'png') {
            // Request PNG export from webview
            // The webview will convert SVG to PNG via canvas and send back the data
            this._postMessage({ command: 'exportPng' });
        } else if (format === 'mermaid') {
            await this.exportAsMermaid();
        } else if (format === 'copy-mermaid') {
            await this.copyMermaidToClipboard();
        } else if (format === 'svg') {
            await this.exportAsSvg();
        } else if (format === 'json') {
            await this.exportAsJson();
        } else if (format === 'dot') {
            await this.exportAsDot();
        }
    }

    /**
     * Export the latest impact report in Markdown or JSON format.
     */
    private async exportImpactReport(format: 'markdown' | 'json'): Promise<void> {
        if (!this._currentImpactReport) {
            vscode.window.showErrorMessage('No impact report available. Run an impact analysis first.');
            return;
        }

        const report = this._currentImpactReport;
        const safeTarget = report.target.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            || 'impact';
        const extension = format === 'markdown' ? 'md' : 'json';
        const defaultFilename = `impact-report-${safeTarget}.${extension}`;

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultFilename),
            filters: format === 'markdown'
                ? { 'Markdown': ['md'] }
                : { 'JSON': ['json'] }
        });

        if (!uri) {
            return;
        }

        const payload = buildImpactReportExportPayload(report, this._extensionVersion);
        const content = format === 'markdown'
            ? renderImpactReportMarkdown(payload)
            : JSON.stringify(payload, null, 2);

        await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
        vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
    }

    /**
     * Export graph as Mermaid diagram
     */
    private async exportAsMermaid(): Promise<void> {
        if (!this._currentGraph) {return;}
        await exportWorkspaceMermaidFile(this._currentGraph);
    }

    private async copyMermaidToClipboard(): Promise<void> {
        if (!this._currentGraph) { return; }
        await copyWorkspaceMermaid(this._currentGraph);
    }

    /**
     * Export graph as SVG
     */
    private async exportAsSvg(): Promise<void> {
        if (!this._currentGraph) {return;}
        await exportWorkspaceSvgFile(
            this._currentGraph,
            this._isDarkTheme,
            escapeHtmlText
        );
    }

    /**
     * Export graph as JSON
     * Useful for data interchange, CI/CD pipelines, and external tools
     */
    private async exportAsJson(): Promise<void> {
        if (!this._currentGraph) { return; }
        await exportWorkspaceJsonFile(this._currentGraph, this._extensionVersion);
    }

    /**
     * Export graph as DOT (Graphviz) format
     * Useful for external visualization tools and large graph analysis
     */
    private async exportAsDot(): Promise<void> {
        if (!this._currentGraph) { return; }
        await exportWorkspaceDotFile(this._currentGraph, this._isDarkTheme);
    }

    /**
     * Save PNG data to file
     * Receives base64-encoded PNG data from webview and saves to user-selected location
     */
    private async savePngToFile(base64Data: string, suggestedFilename: string): Promise<void> {
        await saveWorkspacePng(base64Data, suggestedFilename);
    }

    /**
     * Get Issues panel HTML
     * Uses extracted styles and scripts for consistency
     */
    private getIssuesHtml(): string {
        const nonce = generateNonce();
        const detailedStats = this._currentGraph
            ? buildDetailedWorkspaceStats(this._currentGraph, this._indexManager.getIndex())
            : null;
        const totalIssues = (detailedStats?.orphanedDetails.length || 0) + (detailedStats?.missingDetails.length || 0) + (detailedStats?.parseErrorDetails.length || 0);
        const styles = getIssuesStyles(this._isDarkTheme, this._isHighContrast);
        const script = getIssuesScript(nonce);
        return createIssuesPageHtml({
            nonce,
            detailedStats,
            totalIssues,
            styles,
            script,
            escapeHtml: escapeHtmlText,
        });
    }

    /**
     * Get error HTML
     */
    private getErrorHtml(message: string, detail?: string): string {
        const indexStatus = buildIndexStatus(this._indexManager.getIndex());
        const statusLine = indexStatus.level === 'missing'
            ? 'Index: not yet built'
            : indexStatus.title;
        return createErrorStateHtml({
            message,
            detail,
            statusLine,
            isDarkTheme: this._isDarkTheme,
            nonce: generateNonce(),
        });
    }

    /**
     * Get theme preference from settings or VS Code theme
     */
    private getThemeFromSettings(): boolean {
        const themeSettings = resolveWorkspaceThemeFromSettings();
        this._isHighContrast = themeSettings.isHighContrast;
        return themeSettings.isDarkTheme;
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
