// Message Handler - Handles all webview messages for workspace panel
// Extracted from workspacePanel.ts for modularity

import * as vscode from 'vscode';
import * as path from 'path';
import { realpath } from 'fs/promises';
import { SearchFilter, GraphMode, WorkspaceDependencyGraph } from '../types';
import { LineageBuilder } from '../lineage/lineageBuilder';
import {
    LineageGraph,
    LineageNode,
    LineagePath,
    FlowAnalyzer,
    FlowResult,
    ImpactAnalyzer,
    ImpactReport,
    ColumnLineageTracker
} from '../lineage';
import { TableExplorer } from '../ui/tableExplorer';
import { LineageView } from '../ui/lineageView';
import { ImpactView } from '../ui/impactView';
import { ViewMode } from '../ui/types';
import { logger } from '../../logger';
import type {
    WorkspaceWebviewMessage,
    WorkspaceHostMessage,
    WorkspaceUxMetricMetadata
} from '../../shared/messages';
import {
    attachWorkspaceRequestId,
    getWorkspaceRequestId,
    inferMissingDataReason,
} from './messageMetadata';
import { toImpactReportResult } from './impactPayload';
import {
    findSimilarTableNames,
    resolveLineageNodeId,
    resolveRequestedLineageNodeId,
} from './lineageNodeResolution';

/**
 * Context interface for message handler
 * Provides access to panel state and dependencies without direct coupling
 */
export interface MessageHandlerContext {
    // Webview panel
    panel: vscode.WebviewPanel;

    // State accessors
    getCurrentGraph: () => WorkspaceDependencyGraph | null;
    setCurrentGraph: (graph: WorkspaceDependencyGraph | null) => void;
    getCurrentView: () => ViewMode | 'graph' | 'issues';
    setCurrentView: (view: ViewMode | 'graph' | 'issues') => void;
    getCurrentSearchFilter: () => SearchFilter;
    setCurrentSearchFilter: (filter: SearchFilter) => void;
    getCurrentGraphMode: () => GraphMode;
    setCurrentGraphMode: (mode: GraphMode) => void;
    getShowHelp: () => boolean;
    setShowHelp: (show: boolean) => void;

    // Lineage state accessors
    getLineageGraph: () => LineageGraph | null;
    setLineageGraph: (graph: LineageGraph | null) => void;
    getLineageBuilder: () => LineageBuilder | null;
    setLineageBuilder: (builder: LineageBuilder | null) => void;
    getFlowAnalyzer: () => FlowAnalyzer | null;
    setFlowAnalyzer: (analyzer: FlowAnalyzer | null) => void;
    getImpactAnalyzer: () => ImpactAnalyzer | null;
    setImpactAnalyzer: (analyzer: ImpactAnalyzer | null) => void;
    getColumnLineageTracker: () => ColumnLineageTracker | null;
    setColumnLineageTracker: (tracker: ColumnLineageTracker | null) => void;
    getSelectedLineageNode: () => LineageNode | null;
    setSelectedLineageNode: (node: LineageNode | null) => void;
    getCurrentImpactReport: () => ImpactReport | null;
    setCurrentImpactReport: (report: ImpactReport | null) => void;
    getCurrentFlowResult: () => FlowResult | null;
    setCurrentFlowResult: (result: FlowResult | null) => void;
    getLineageLegendVisible: () => boolean;
    setLineageLegendVisible: (visible: boolean) => void;
    getLineageDetailNodeId: () => string | null;
    setLineageDetailNodeId: (nodeId: string | null) => void;
    getLineageDetailDirection: () => 'both' | 'upstream' | 'downstream';
    setLineageDetailDirection: (direction: 'both' | 'upstream' | 'downstream') => void;
    getLineageDetailExpandedNodes: () => string[];
    setLineageDetailExpandedNodes: (nodes: string[]) => void;

    // UI generators
    getTableExplorer: () => TableExplorer;
    getLineageView: () => LineageView;
    getImpactView: () => ImpactView;
    getDefaultLineageDepth: () => number;

    // Theme state
    getIsDarkTheme: () => boolean;
    setIsDarkTheme: (dark: boolean) => void;

    // Rebuild state
    getIsRebuilding: () => boolean;
    getHasPendingIndexChanges: () => boolean;

    // Callbacks
    renderCurrentView: () => void;
    getWebviewHtml: (graph: WorkspaceDependencyGraph, searchFilter: SearchFilter) => string;
    getThemeCss: (isDark: boolean) => string;
    buildIndexWithProgress: () => Promise<void>;
    rebuildAndRenderGraph: () => Promise<void>;
    buildLineageGraph: () => Promise<void>;
    handleExport: (format: string) => Promise<void>;
    savePngToFile: (base64Data: string, suggestedFilename: string) => Promise<void>;
    trackUxEvent: (event: string, metadata?: WorkspaceUxMetricMetadata) => void;
}

/**
 * Message handler class for workspace panel webview messages
 */
function createEmptyLineageGraph(): LineageGraph {
    return {
        nodes: new Map(),
        edges: [],
        columnEdges: [],
        getUpstream: () => [],
        getDownstream: () => [],
        getColumnLineage: () => []
    };
}

export class MessageHandler {
    private _context: MessageHandlerContext;
    private _disposed = false;

    constructor(context: MessageHandlerContext) {
        this._context = context;
    }

    public markDisposed(): void {
        this._disposed = true;
    }

    private resolveRequestedDepth(depth: unknown): number {
        const fallbackDepth = this._context.getDefaultLineageDepth();
        const numeric = Number(depth);
        if (!Number.isFinite(numeric)) {
            return fallbackDepth;
        }
        if (numeric === -1) {
            return -1;
        }
        const normalized = Math.floor(numeric);
        if (normalized < 1) {
            return fallbackDepth;
        }
        return Math.min(20, normalized);
    }

    private resolveColumnLineageTableName(tableName?: string, tableId?: string): string | undefined {
        if (tableName && tableName.trim().length > 0) {
            return tableName;
        }
        if (!tableId || tableId.trim().length === 0) {
            return undefined;
        }
        const separatorIndex = tableId.indexOf(':');
        if (separatorIndex >= 0 && separatorIndex < tableId.length - 1) {
            return tableId.slice(separatorIndex + 1);
        }
        return tableId;
    }

    private resolveColumnLineageTableId(lineageGraph: LineageGraph, tableNameOrId: string): string {
        if (lineageGraph.nodes.has(tableNameOrId)) {
            return tableNameOrId;
        }

        const normalizedTarget = tableNameOrId.trim().toLowerCase();
        for (const [nodeId, node] of lineageGraph.nodes) {
            if (node.type === 'column') {
                continue;
            }
            if (node.name.toLowerCase() === normalizedTarget) {
                return nodeId;
            }
        }

        return tableNameOrId;
    }

    private normalizePathForComparison(filePath: string): string {
        const normalized = path.resolve(filePath);
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }

    private async resolveCanonicalPath(filePath: string): Promise<string | null> {
        try {
            const resolvedPath = await realpath(filePath);
            return this.normalizePathForComparison(resolvedPath);
        } catch {
            return null;
        }
    }

    private async isFilePathAllowed(filePath: string): Promise<boolean> {
        if (!filePath || filePath.trim().length === 0) {
            return false;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            // Workspace panel is only available with workspace folders,
            // but keep behavior safe if state is unexpectedly unavailable.
            return false;
        }

        const candidate = await this.resolveCanonicalPath(filePath);
        if (!candidate) {
            return false;
        }

        const rootCandidates = await Promise.all(workspaceFolders.map(async (folder) => {
            const canonicalRoot = await this.resolveCanonicalPath(folder.uri.fsPath);
            return canonicalRoot || this.normalizePathForComparison(folder.uri.fsPath);
        }));

        return rootCandidates.some((root) => candidate === root || candidate.startsWith(root + path.sep));
    }

    /**
     * Main message router - dispatches messages to appropriate handlers
     */
    private postMessage(msg: WorkspaceHostMessage): void {
        if (this._disposed) {
            return;
        }
        this._context.panel.webview.postMessage(msg);
    }

    private postRequestMessage(msg: WorkspaceHostMessage, requestId?: number): void {
        this.postMessage(attachWorkspaceRequestId(msg, requestId));
    }

    private setPanelHtml(html: string): void {
        if (this._disposed) {
            return;
        }
        this._context.panel.webview.html = html;
    }

    public async handleMessage(message: WorkspaceWebviewMessage): Promise<void> {
        if (this._disposed) {
            return;
        }
        try {
            switch (message.command) {
                case 'switchView':
                    this.handleSwitchView(message.view);
                    break;

                case 'refresh':
                    await this.handleRefresh();
                    break;

                case 'switchGraphMode':
                    await this.handleSwitchGraphMode(message.mode);
                    break;

                case 'search':
                    this.handleSearch(message.filter);
                    break;

                case 'clearSearch':
                    this.handleClearSearch();
                    break;

                case 'trackUxEvent':
                    this.handleTrackUxEvent(message.event, message.metadata);
                    break;

                case 'toggleHelp':
                    this.handleToggleHelp();
                    break;

                case 'toggleTheme':
                    this.handleToggleTheme();
                    break;

                case 'export':
                    await this._context.handleExport(message.format);
                    break;

                case 'openFile':
                    await this.handleOpenFile(message.filePath);
                    break;

                case 'openFileAtLine':
                    await this.handleOpenFileAtLine(message.filePath, message.line);
                    break;

                case 'showInGraph':
                    this.handleShowInGraph(message.query, message.nodeType);
                    break;

                case 'visualizeFile':
                    await this.handleVisualizeFile(message.filePath);
                    break;

                // ========== Lineage Commands ==========
                case 'switchToLineageView':
                    await this.handleSwitchToLineageView(getWorkspaceRequestId(message));
                    break;

                case 'switchToImpactView':
                    await this.handleSwitchToImpactView(getWorkspaceRequestId(message));
                    break;

                case 'getLineage':
                    await this.handleGetLineage(
                        message.nodeId,
                        message.direction,
                        this.resolveRequestedDepth(message.depth)
                    );
                    break;

                case 'analyzeImpact':
                    await this.handleAnalyzeImpact(
                        message.type,
                        message.name,
                        message.tableName,
                        message.changeType,
                        getWorkspaceRequestId(message)
                    );
                    break;

                case 'exploreTable':
                    await this.handleExploreTable(message.tableName, message.nodeId, getWorkspaceRequestId(message));
                    break;

                case 'getColumnLineage':
                    {
                        const tableName = this.resolveColumnLineageTableName(message.tableName, message.tableId);
                        if (tableName && message.columnName) {
                            await this.handleGetColumnLineage(tableName, message.columnName, getWorkspaceRequestId(message));
                        }
                    }
                    break;

                case 'selectLineageNode':
                    this.handleSelectLineageNode(message.nodeId);
                    break;

                case 'getUpstream':
                    await this.handleGetUpstream(
                        message.nodeId,
                        this.resolveRequestedDepth(message.depth),
                        message.nodeType,
                        message.filePath,
                        getWorkspaceRequestId(message)
                    );
                    break;

                case 'getDownstream':
                    await this.handleGetDownstream(
                        message.nodeId,
                        this.resolveRequestedDepth(message.depth),
                        message.nodeType,
                        message.filePath,
                        getWorkspaceRequestId(message)
                    );
                    break;

                // ========== Visual Lineage Graph Commands ==========
                case 'searchLineageTables':
                    await this.handleSearchLineageTables(message.query, message.typeFilter, getWorkspaceRequestId(message));
                    break;

                case 'getLineageGraph':
                    await this.handleGetLineageGraph(
                        message.nodeId,
                        this.resolveRequestedDepth(message.depth),
                        message.direction || 'both',
                        message.expandedNodes,
                        message.nodeLabel,
                        message.nodeType,
                        getWorkspaceRequestId(message)
                    );
                    break;

                case 'expandNodeColumns':
                    await this.handleExpandNodeColumns(message.nodeId);
                    break;

                case 'setLineageDirection':
                    await this.handleSetLineageDirection(message.nodeId, message.direction);
                    break;

                case 'collapseNodeColumns':
                    this.handleCollapseNodeColumns(message.nodeId);
                    break;

                case 'setLineageLegendVisibility':
                    this._context.setLineageLegendVisible(message.visible);
                    break;

                case 'selectColumn':
                    await this.handleSelectColumn(message.tableId, message.columnName, getWorkspaceRequestId(message));
                    break;

                case 'clearColumnSelection':
                    await this.handleClearColumnSelection();
                    break;

                case 'savePng':
                    await this._context.savePngToFile(message.data, message.filename);
                    break;

                case 'exportPngError':
                    vscode.window.showErrorMessage(message.error || 'PNG export failed.');
                    break;

                case 'exportNodeLineage':
                    await this.handleExportNodeLineage(
                        message.nodeId,
                        message.nodeLabel,
                        message.nodeType
                    );
                    break;

                default:
                    logger.warn(`Unknown message command: ${(message as { command: string }).command}`);
            }
        } catch (error) {
            const command = (message as { command?: string })?.command || 'unknown';
            logger.error(`[Workspace] Failed to handle message command "${command}"`, error);
        }
    }

    // ========== Basic View Commands ==========

    private handleSwitchView(view: ViewMode | 'graph' | 'issues'): void {
        this._context.setCurrentView(view);
        this._context.renderCurrentView();
    }

    private handleShowInGraph(query: string, nodeType?: 'table' | 'view' | 'external' | 'file'): void {
        const trimmedQuery = (query || '').trim();
        const filter: SearchFilter = {
            query: trimmedQuery,
            nodeTypes: undefined,
            useRegex: false,
            caseSensitive: false
        };

        this._context.setCurrentSearchFilter(filter);
        this._context.setCurrentView('graph');
        this._context.trackUxEvent('workspace_show_in_graph', {
            queryLength: trimmedQuery.length,
            nodeType: nodeType || 'unknown'
        });

        const graph = this._context.getCurrentGraph();
        if (graph) {
            this.setPanelHtml(this._context.getWebviewHtml(graph, filter));
            return;
        }
        this._context.renderCurrentView();
    }

    private async handleRefresh(): Promise<void> {
        await this._context.buildIndexWithProgress();
        await this._context.rebuildAndRenderGraph();
    }

    /**
     * Handle graph mode switch (Files/Tables).
     * Validates mode and rebuilds graph with new mode.
     * Ensures view stays on Graph tab (not Lineage/Tables/Impact).
     */
    private async handleSwitchGraphMode(mode: string): Promise<void> {
        const valid: GraphMode[] = ['files', 'tables'];
        const m = valid.includes(mode as GraphMode) ? (mode as GraphMode) : 'tables';
        this._context.setCurrentGraphMode(m);
        // Clear search filter — previous search terms may not apply to the new mode
        this._context.setCurrentSearchFilter({
            query: '',
            nodeTypes: undefined,
            useRegex: false,
            caseSensitive: false
        });
        // Ensure we're on Graph view when switching modes (not Lineage/Tables/Impact)
        this._context.setCurrentView('graph');
        await this._context.rebuildAndRenderGraph();
    }

    private handleSearch(filter: SearchFilter): void {
        this._context.setCurrentSearchFilter(filter);
        const graph = this._context.getCurrentGraph();
        if (graph) {
            this.setPanelHtml(this._context.getWebviewHtml(graph, filter));
        }
    }

    private handleClearSearch(): void {
        const clearFilter: SearchFilter = {
            query: '',
            nodeTypes: undefined,
            useRegex: false,
            caseSensitive: false
        };
        this._context.setCurrentSearchFilter(clearFilter);
        const graph = this._context.getCurrentGraph();
        if (graph) {
            this.setPanelHtml(this._context.getWebviewHtml(graph, clearFilter));
        }
    }

    private handleTrackUxEvent(event: string, metadata?: WorkspaceUxMetricMetadata): void {
        if (typeof event !== 'string' || event.trim().length === 0) {
            return;
        }
        this._context.trackUxEvent(event, metadata);
    }

    private handleToggleHelp(): void {
        const currentHelp = this._context.getShowHelp();
        this._context.setShowHelp(!currentHelp);
        this._context.renderCurrentView();
    }

    private handleToggleTheme(): void {
        const currentTheme = this._context.getIsDarkTheme();
        const newDark = !currentTheme;
        this._context.setIsDarkTheme(newDark);
        // Send CSS swap to webview instead of full HTML rebuild to avoid flicker
        const css = this._context.getThemeCss(newDark);
        this.postMessage({ command: 'themeChanged', css, isDark: newDark });
    }

    // ========== File Operations ==========

    private async handleOpenFile(filePath: string): Promise<void> {
        try {
            if (!(await this.isFilePathAllowed(filePath))) {
                logger.warn(`Blocked openFile outside workspace: ${filePath}`);
                vscode.window.showWarningMessage('Blocked opening file outside workspace.');
                return;
            }
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }

    private async handleOpenFileAtLine(filePath: string, line: number): Promise<void> {
        try {
            if (!(await this.isFilePathAllowed(filePath))) {
                logger.warn(`Blocked openFileAtLine outside workspace: ${filePath}`);
                vscode.window.showWarningMessage('Blocked opening file outside workspace.');
                return;
            }
            const fileUri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
            const safeLine = Number.isFinite(line) ? Math.max(0, Math.floor(line) - 1) : 0;
            const position = new vscode.Position(safeLine, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }

    private async handleVisualizeFile(filePath: string): Promise<void> {
        try {
            if (!(await this.isFilePathAllowed(filePath))) {
                logger.warn(`Blocked visualizeFile outside workspace: ${filePath}`);
                vscode.window.showWarningMessage('Blocked opening file outside workspace.');
                return;
            }
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            await vscode.commands.executeCommand('sql-crack.visualize');
        } catch (error) {
            vscode.window.showErrorMessage(`Could not visualize file: ${filePath}`);
        }
    }

    // ========== Lineage View Switching ==========

    private async handleSwitchToLineageView(requestId?: number): Promise<void> {
        this._context.setCurrentView('lineage');
        // Switching to overview clears detail state
        this._context.setLineageDetailNodeId(null);
        await this._context.buildLineageGraph();

        const lineageGraph = this._context.getLineageGraph();
        const graph = lineageGraph || createEmptyLineageGraph();
        const html = this._context.getLineageView().generateLineageSearchView(graph, {
            depth: this._context.getDefaultLineageDepth()
        });

        this.postRequestMessage({
            command: 'lineageOverviewResult',
            data: { html }
        }, requestId);
    }

    private async handleSwitchToImpactView(requestId?: number): Promise<void> {
        this._context.setCurrentView('impact');
        this._context.setLineageDetailNodeId(null);
        await this._context.buildLineageGraph();

        const currentImpactReport = this._context.getCurrentImpactReport();
        if (currentImpactReport) {
            this.postRequestMessage({
                command: 'impactResult',
                data: {
                    report: toImpactReportResult(currentImpactReport),
                    html: this._context.getImpactView().generateImpactReport(currentImpactReport)
                }
            }, requestId);
            return;
        }

        const lineageGraph = this._context.getLineageGraph();
        if (lineageGraph) {
            const html = this._context.getImpactView().generateImpactForm(lineageGraph);
            this.postRequestMessage({
                command: 'impactFormResult',
                data: { html }
            }, requestId);
        } else {
            const html = this._context.getImpactView().generateImpactForm(null);
            this.postRequestMessage({
                command: 'impactFormResult',
                data: { html }
            }, requestId);
        }
    }

    // ========== Lineage Analysis ==========

    private async handleGetLineage(
        nodeId: string,
        direction: 'upstream' | 'downstream' | 'both',
        depth: number
    ): Promise<void> {
        await this._context.buildLineageGraph();
        const flowAnalyzer = this._context.getFlowAnalyzer();
        const lineageGraph = this._context.getLineageGraph();

        if (!flowAnalyzer || !lineageGraph) {return;}

        let result: FlowResult | null = null;

        if (direction === 'both') {
            const upstream = flowAnalyzer.getUpstream(nodeId, { maxDepth: depth, excludeExternal: true });
            const downstream = flowAnalyzer.getDownstream(nodeId, { maxDepth: depth, excludeExternal: true });
            result = {
                nodes: this.dedupeLineageNodes([...upstream.nodes, ...downstream.nodes]),
                edges: this.dedupeLineageEdges([...upstream.edges, ...downstream.edges]),
                paths: this.dedupeLineagePaths([...upstream.paths, ...downstream.paths]),
                depth: Math.max(upstream.depth, downstream.depth)
            };
        } else if (direction === 'upstream') {
            result = flowAnalyzer.getUpstream(nodeId, { maxDepth: depth, excludeExternal: true });
        } else {
            result = flowAnalyzer.getDownstream(nodeId, { maxDepth: depth, excludeExternal: true });
        }

        this._context.setCurrentFlowResult(result);

        // Send result to webview
        this.postMessage({
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

    private async handleAnalyzeImpact(
        type: 'table' | 'view' | 'column',
        name: string,
        tableName?: string,
        changeType: 'modify' | 'rename' | 'drop' | 'addColumn' = 'modify',
        requestId?: number
    ): Promise<void> {
        const trimmedName = name?.trim() || '';
        if (!trimmedName) {
            this.postRequestMessage({
                command: 'impactResult',
                data: { error: 'Impact target name is required.' }
            }, requestId);
            return;
        }

        if (type === 'column' && (!tableName || tableName.trim().length === 0)) {
            this.postRequestMessage({
                command: 'impactResult',
                data: { error: 'Table name is required for column impact analysis.' }
            }, requestId);
            return;
        }

        await this._context.buildLineageGraph();
        const impactAnalyzer = this._context.getImpactAnalyzer();

        if (!impactAnalyzer) {return;}

        let report: ImpactReport;
        if (type === 'column') {
            report = impactAnalyzer.analyzeColumnChange(tableName!.trim(), trimmedName, changeType);
        } else {
            report = impactAnalyzer.analyzeTableChange(trimmedName, changeType, type === 'view' ? 'view' : 'table');
        }

        this._context.setCurrentImpactReport(report);

        // Send result to webview
        this.postRequestMessage({
            command: 'impactResult',
            data: {
                report: toImpactReportResult(report),
                html: this._context.getImpactView().generateImpactReport(report)
            }
        }, requestId);
    }

    private async handleExploreTable(tableName: string, providedNodeId?: string, requestId?: number): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();

        if (!lineageGraph) {return;}

        // Use provided nodeId if available, otherwise try to find the node
        let node = providedNodeId ? lineageGraph.nodes.get(providedNodeId) : null;

        // Fallback: try different node types if not found
        if (!node) {
            const nameLower = tableName.toLowerCase();
            node = lineageGraph.nodes.get(`table:${nameLower}`) ||
                   lineageGraph.nodes.get(`view:${nameLower}`) ||
                   lineageGraph.nodes.get(`cte:${nameLower}`);
        }

        if (!node) {
            const suggestions = findSimilarTableNames(lineageGraph, tableName);
            let errorMsg = `Table "${tableName}" not found in the lineage graph.`;
            if (suggestions.length > 0) {
                errorMsg += ` Did you mean: ${suggestions.map(s => `"${s}"`).join(', ')}?`;
            } else {
                errorMsg += ' Make sure the table exists in your SQL files and the workspace index is up to date.';
            }
            this.postRequestMessage({
                command: 'tableDetailResult',
                data: {
                    error: errorMsg,
                    reason: inferMissingDataReason({
                        changesSinceIndex: this._context.getHasPendingIndexChanges() ? 1 : 0,
                        parseErrorCount: this._context.getCurrentGraph()?.stats.parseErrors || 0,
                        requestedNodeType: providedNodeId ? undefined : 'table'
                    })
                }
            }, requestId);
            return;
        }

        this._context.setSelectedLineageNode(node);

        const html = this._context.getTableExplorer().generateTableView({
            table: node,
            graph: lineageGraph
        });

        this.postRequestMessage({
            command: 'tableDetailResult',
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
        }, requestId);
    }

    private async handleGetColumnLineage(tableName: string, columnName: string, requestId?: number): Promise<void> {
        await this._context.buildLineageGraph();
        const columnLineageTracker = this._context.getColumnLineageTracker();
        const lineageGraph = this._context.getLineageGraph();

        if (!columnLineageTracker || !lineageGraph) {return;}

        const resolvedTableId = this.resolveColumnLineageTableId(lineageGraph, tableName);
        const resolvedTableNode = lineageGraph.nodes.get(resolvedTableId);

        const lineage = columnLineageTracker.getFullColumnLineage(
            lineageGraph,
            resolvedTableId,
            columnName
        );

        const html = this._context.getLineageView().generateColumnLineageView(lineage);

        this.postRequestMessage({
            command: 'columnLineageResult',
            data: this.buildColumnLineageResultPayload(
                resolvedTableId,
                resolvedTableNode?.name || tableName,
                columnName,
                lineage.upstream,
                lineage.downstream,
                html
            )
        }, requestId);
    }

    private handleSelectLineageNode(nodeId: string): void {
        const lineageGraph = this._context.getLineageGraph();
        if (!lineageGraph) {return;}

        const node = lineageGraph.nodes.get(nodeId);
        if (node) {
            this._context.setSelectedLineageNode(node);
        }
    }

    private async handleGetUpstream(
        nodeId: string | undefined,
        depth: number = -1,
        nodeType?: string,
        filePath?: string,
        requestId?: number
    ): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();
        const flowAnalyzer = this._context.getFlowAnalyzer();

        if (!flowAnalyzer || !lineageGraph) {return;}

        // For file nodes, aggregate upstream for all displayable nodes defined in the file.
        const nodeIds = new Set<string>();
        if (nodeType === 'file' && filePath) {
            const normalizedPath = this.normalizePathForComparison(filePath);
            for (const [id, node] of lineageGraph.nodes) {
                const isDisplayable = node.type === 'table' || node.type === 'view' || node.type === 'cte';
                if (isDisplayable && node.filePath && this.normalizePathForComparison(node.filePath) === normalizedPath) {
                    nodeIds.add(id);
                }
            }
        } else if (nodeId) {
            nodeIds.add(nodeId);
        }

        if (nodeIds.size === 0) {
            this.postRequestMessage({
                command: 'upstreamResult',
                data: { nodeId: nodeId || filePath, nodes: [], depth: 0 }
            }, requestId);
            return;
        }

        // Aggregate results from all nodes
        const allNodes = new Map<string, { id: string; name: string; type: string; filePath?: string; lineNumber?: number }>();
        let maxDepth = 0;

        for (const nid of nodeIds) {
            const result = flowAnalyzer.getUpstream(nid, { maxDepth: depth, excludeExternal: true });
            for (const n of result.nodes) {
                if (!allNodes.has(n.id)) {
                    allNodes.set(n.id, {
                        id: n.id,
                        name: n.name,
                        type: n.type,
                        filePath: n.filePath,
                        lineNumber: n.lineNumber
                    });
                }
            }
            maxDepth = Math.max(maxDepth, result.depth);
        }

        this.postRequestMessage({
            command: 'upstreamResult',
            data: {
                nodeId: nodeId || filePath,
                nodes: Array.from(allNodes.values()),
                depth: maxDepth
            }
        }, requestId);
    }

    private async handleGetDownstream(
        nodeId: string | undefined,
        depth: number = -1,
        nodeType?: string,
        filePath?: string,
        requestId?: number
    ): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();
        const flowAnalyzer = this._context.getFlowAnalyzer();

        if (!flowAnalyzer || !lineageGraph) {return;}

        // For file nodes, aggregate downstream for all displayable nodes defined in the file.
        const nodeIds = new Set<string>();
        if (nodeType === 'file' && filePath) {
            const normalizedPath = this.normalizePathForComparison(filePath);
            for (const [id, node] of lineageGraph.nodes) {
                const isDisplayable = node.type === 'table' || node.type === 'view' || node.type === 'cte';
                if (isDisplayable && node.filePath && this.normalizePathForComparison(node.filePath) === normalizedPath) {
                    nodeIds.add(id);
                }
            }
        } else if (nodeId) {
            nodeIds.add(nodeId);
        }

        if (nodeIds.size === 0) {
            this.postRequestMessage({
                command: 'downstreamResult',
                data: { nodeId: nodeId || filePath, nodes: [], depth: 0 }
            }, requestId);
            return;
        }

        // Aggregate results from all nodes
        const allNodes = new Map<string, { id: string; name: string; type: string; filePath?: string; lineNumber?: number }>();
        let maxDepth = 0;

        for (const nid of nodeIds) {
            const result = flowAnalyzer.getDownstream(nid, { maxDepth: depth, excludeExternal: true });
            for (const n of result.nodes) {
                if (!allNodes.has(n.id)) {
                    allNodes.set(n.id, {
                        id: n.id,
                        name: n.name,
                        type: n.type,
                        filePath: n.filePath,
                        lineNumber: n.lineNumber
                    });
                }
            }
            maxDepth = Math.max(maxDepth, result.depth);
        }

        this.postRequestMessage({
            command: 'downstreamResult',
            data: {
                nodeId: nodeId || filePath,
                nodes: Array.from(allNodes.values()),
                depth: maxDepth
            }
        }, requestId);
    }

    // ========== Visual Lineage Graph Commands ==========

    private async handleSearchLineageTables(query: string, typeFilter?: string, requestId?: number): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();

        if (!lineageGraph) {
            this.postRequestMessage({
                command: 'lineageSearchResults',
                data: { results: [] }
            }, requestId);
            return;
        }

        const results: Array<{ id: string; name: string; type: string; filePath?: string }> = [];
        const queryLower = query.toLowerCase();

        for (const [id, node] of lineageGraph.nodes) {
            // Skip columns and external tables in search
            if (node.type === 'column' || node.type === 'external') {continue;}

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

        this.postRequestMessage({
            command: 'lineageSearchResults',
            data: { results: results.slice(0, 15) }
        }, requestId);
    }

    private async handleGetLineageGraph(
        nodeId: string,
        depth: number,
        direction: 'both' | 'upstream' | 'downstream',
        expandedNodes?: string[],
        nodeLabel?: string,
        nodeType?: string,
        requestId?: number
    ): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();

        if (!lineageGraph) {
            this.postRequestMessage({
                command: 'lineageGraphResult',
                data: {
                    error: 'No lineage graph available. Open SQL files in your workspace and click Refresh to build the dependency index.',
                    reason: inferMissingDataReason({
                        changesSinceIndex: this._context.getHasPendingIndexChanges() ? 1 : 0,
                        parseErrorCount: this._context.getCurrentGraph()?.stats.parseErrors || 0
                    })
                }
            }, requestId);
            return;
        }

        const resolvedNodeId = resolveRequestedLineageNodeId(
            lineageGraph,
            nodeId,
            nodeLabel,
            nodeType
        );

        // Generate HTML using the lineage view
        const html = this._context.getLineageView().generateLineageGraphView(
            lineageGraph,
            resolvedNodeId,
            {
                depth,
                direction,
                expandedNodes: new Set(expandedNodes || []),
                displayLabel: nodeLabel
            }
        );

        // Persist detail state so it survives webview rebuilds (theme change, refresh)
        this._context.setLineageDetailNodeId(resolvedNodeId);
        this._context.setLineageDetailDirection(direction);
        this._context.setLineageDetailExpandedNodes(expandedNodes || []);

        this.postRequestMessage({
            command: 'lineageGraphResult',
            data: { html, nodeId: resolvedNodeId, direction, expandedNodes: expandedNodes || [] }
        }, requestId);
    }

    private async handleExpandNodeColumns(nodeId: string): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();

        if (!lineageGraph) {return;}

        const node = lineageGraph.nodes.get(nodeId);
        if (!node) {return;}

        // Send confirmation - webview will request graph re-render with this node expanded
        this.postMessage({
            command: 'nodeColumnsResult',
            data: { nodeId }
        });
    }

    private async handleSetLineageDirection(
        nodeId: string,
        direction: 'both' | 'upstream' | 'downstream'
    ): Promise<void> {
        // Re-generate graph with new direction
        await this.handleGetLineageGraph(nodeId, this._context.getDefaultLineageDepth(), direction);
    }

    private handleCollapseNodeColumns(nodeId: string): void {
        // Collapse node - send confirmation to webview
        this.postMessage({
            command: 'nodeCollapsedResult',
            data: { nodeId }
        });
    }

    private async handleSelectColumn(tableId: string, columnName: string, requestId?: number): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();
        const columnLineageTracker = this._context.getColumnLineageTracker();

        if (!lineageGraph || !columnLineageTracker) {
            return;
        }

        const selectedTable = lineageGraph.nodes.get(tableId);
        if (!selectedTable) {
            this.postRequestMessage({
                command: 'columnLineageResult',
                data: {
                    ...this.buildColumnLineageResultPayload(
                        tableId,
                        this.getColumnLineageTableLabel(tableId),
                        columnName,
                        [],
                        [],
                        ''
                    ),
                    warning: 'This table is not available in the lineage index yet. Refresh and retry column tracing.',
                    warningReason: inferMissingDataReason({
                        changesSinceIndex: this._context.getHasPendingIndexChanges() ? 1 : 0,
                        parseErrorCount: this._context.getCurrentGraph()?.stats.parseErrors || 0
                    })
                }
            }, requestId);
            return;
        }

        const lineage = columnLineageTracker.getFullColumnLineage(
            lineageGraph,
            tableId,
            columnName
        );

        const html = this._context.getLineageView().generateColumnLineageView(lineage);

        // Send result back to webview
        this.postRequestMessage({
            command: 'columnLineageResult',
            data: this.buildColumnLineageResultPayload(
                tableId,
                selectedTable.name,
                columnName,
                lineage.upstream,
                lineage.downstream,
                html
            )
        }, requestId);
    }

    private buildColumnLineageResultPayload(
        tableId: string,
        tableName: string,
        columnName: string,
        upstream: unknown[],
        downstream: unknown[],
        html: string
    ): {
        tableId: string;
        tableName: string;
        columnName: string;
        upstream: unknown[];
        downstream: unknown[];
        html: string;
    } {
        return {
            tableId,
            tableName,
            columnName,
            upstream,
            downstream,
            html
        };
    }

    private getColumnLineageTableLabel(tableId: string): string {
        const separatorIndex = tableId.indexOf(':');
        return separatorIndex >= 0 ? tableId.slice(separatorIndex + 1) : tableId;
    }

    private async handleClearColumnSelection(): Promise<void> {
        this.postMessage({
            command: 'columnSelectionCleared'
        });
    }

    private async handleExportNodeLineage(
        nodeId: string,
        nodeLabel: string,
        nodeType: string
    ): Promise<void> {
        await this._context.buildLineageGraph();
        const flowAnalyzer = this._context.getFlowAnalyzer();
        const lineageGraph = this._context.getLineageGraph();

        if (!flowAnalyzer || !lineageGraph) {
            vscode.window.showErrorMessage('No lineage data available. Refresh the index first.');
            return;
        }

        const resolvedId = resolveLineageNodeId(lineageGraph, nodeId, nodeLabel, nodeType);
        const node = resolvedId ? lineageGraph.nodes.get(resolvedId) : undefined;

        // Some workspace graph nodes (especially unresolved external refs) may not
        // exist in the lineage graph. Export should still succeed with an empty flow.
        const upstream = resolvedId
            ? flowAnalyzer.getUpstream(resolvedId, { maxDepth: -1, excludeExternal: false })
            : { nodes: [], edges: [], paths: [], depth: 0 };
        const downstream = resolvedId
            ? flowAnalyzer.getDownstream(resolvedId, { maxDepth: -1, excludeExternal: false })
            : { nodes: [], edges: [], paths: [], depth: 0 };

        const safeLabel = nodeLabel
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            || 'node';

        const payload = {
            exportedAt: new Date().toISOString(),
            node: {
                id: nodeId,
                lineageNodeId: resolvedId || null,
                name: nodeLabel,
                type: nodeType,
                filePath: node?.filePath
            },
            upstream: upstream.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, filePath: n.filePath })),
            downstream: downstream.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, filePath: n.filePath })),
            summary: {
                upstreamCount: upstream.nodes.length,
                downstreamCount: downstream.nodes.length,
                upstreamDepth: upstream.depth,
                downstreamDepth: downstream.depth,
                lineageNodeResolved: Boolean(resolvedId)
            }
        };

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`lineage-${safeLabel}.json`),
            filters: { 'JSON': ['json'] }
        });

        if (!uri) { return; }

        await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(payload, null, 2)));
        const resolutionNote = resolvedId ? '' : ' (exported without lineage links)';
        vscode.window.showInformationMessage(`Exported lineage for "${nodeLabel}" to ${uri.fsPath}${resolutionNote}`);
    }

    private dedupeLineageNodes(nodes: LineageNode[]): LineageNode[] {
        const uniqueNodes = new Map<string, LineageNode>();
        for (const node of nodes) {
            if (!uniqueNodes.has(node.id)) {
                uniqueNodes.set(node.id, node);
            }
        }
        return Array.from(uniqueNodes.values());
    }

    private dedupeLineageEdges(edges: FlowResult['edges']): FlowResult['edges'] {
        type EdgeLike = { id?: string; sourceId?: string; targetId?: string; type?: string };
        const uniqueEdges = new Map<string, FlowResult['edges'][number]>();
        for (const edge of edges) {
            const record = edge as unknown as EdgeLike;
            const edgeId = typeof record.id === 'string'
                ? `id:${record.id}`
                : `${String(record.sourceId ?? '')}->${String(record.targetId ?? '')}:${String(record.type ?? '')}`;
            if (!uniqueEdges.has(edgeId)) {
                uniqueEdges.set(edgeId, edge);
            }
        }
        return Array.from(uniqueEdges.values());
    }

    private dedupeLineagePaths(paths: LineagePath[]): LineagePath[] {
        type EdgeLike = { id?: string; sourceId?: string; targetId?: string; type?: string };
        const uniquePaths = new Map<string, LineagePath>();
        for (const path of paths) {
            const nodeSig = path.nodes.map(node => node.id).join('>');
            const edgeSig = path.edges.map((edge) => {
                const record = edge as unknown as EdgeLike;
                if (typeof record.id === 'string') {
                    return record.id;
                }
                return `${String(record.sourceId ?? '')}->${String(record.targetId ?? '')}:${String(record.type ?? '')}`;
            }).join('|');
            const signature = `${nodeSig}::${edgeSig}`;
            if (!uniquePaths.has(signature)) {
                uniquePaths.set(signature, path);
            }
        }
        return Array.from(uniquePaths.values());
    }
}
