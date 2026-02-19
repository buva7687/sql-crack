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
import type { WorkspaceWebviewMessage, WorkspaceHostMessage } from '../../shared/messages';

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

    // Callbacks
    renderCurrentView: () => void;
    getWebviewHtml: (graph: WorkspaceDependencyGraph, searchFilter: SearchFilter) => string;
    getThemeCss: (isDark: boolean) => string;
    buildIndexWithProgress: () => Promise<void>;
    rebuildAndRenderGraph: () => Promise<void>;
    buildLineageGraph: () => Promise<void>;
    handleExport: (format: string) => Promise<void>;
    savePngToFile: (base64Data: string, suggestedFilename: string) => Promise<void>;
}

/**
 * Message handler class for workspace panel webview messages
 */
/**
 * Simple edit distance (Levenshtein) between two strings.
 * Used for fuzzy table name suggestions when a lookup fails.
 */
function editDistance(a: string, b: string): number {
    const la = a.length, lb = b.length;
    if (la === 0) { return lb; }
    if (lb === 0) { return la; }
    const dp: number[] = Array.from({ length: lb + 1 }, (_, i) => i);
    for (let i = 1; i <= la; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= lb; j++) {
            const tmp = dp[j];
            dp[j] = a[i - 1] === b[j - 1]
                ? prev
                : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = tmp;
        }
    }
    return dp[lb];
}

/**
 * Find table names similar to `query` from the lineage graph.
 * Returns up to `limit` suggestions sorted by edit distance.
 */
export function findSimilarTableNames(
    graph: LineageGraph,
    query: string,
    limit = 3
): string[] {
    const queryLower = query.toLowerCase();
    const candidates: Array<{ name: string; distance: number }> = [];

    for (const [, node] of graph.nodes) {
        if (node.type === 'column') { continue; }
        const nameLower = node.name.toLowerCase();
        // Substring match — always include
        if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
            candidates.push({ name: node.name, distance: 0 });
            continue;
        }
        const dist = editDistance(queryLower, nameLower);
        // Only suggest if within ~40% of the query length
        if (dist <= Math.max(3, Math.ceil(queryLower.length * 0.4))) {
            candidates.push({ name: node.name, distance: dist });
        }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.slice(0, limit).map(c => c.name);
}

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

    constructor(context: MessageHandlerContext) {
        this._context = context;
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
        this._context.panel.webview.postMessage(msg);
    }

    public async handleMessage(message: WorkspaceWebviewMessage): Promise<void> {
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

                case 'visualizeFile':
                    await this.handleVisualizeFile(message.filePath);
                    break;

                // ========== Lineage Commands ==========
                case 'switchToLineageView':
                    await this.handleSwitchToLineageView();
                    break;

                case 'switchToImpactView':
                    await this.handleSwitchToImpactView();
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
                        message.changeType
                    );
                    break;

                case 'exploreTable':
                    await this.handleExploreTable(message.tableName, message.nodeId);
                    break;

                case 'getColumnLineage':
                    {
                        const tableName = this.resolveColumnLineageTableName(message.tableName, message.tableId);
                        if (tableName && message.columnName) {
                            await this.handleGetColumnLineage(tableName, message.columnName);
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
                        message.filePath
                    );
                    break;

                case 'getDownstream':
                    await this.handleGetDownstream(
                        message.nodeId,
                        this.resolveRequestedDepth(message.depth),
                        message.nodeType,
                        message.filePath
                    );
                    break;

                // ========== Visual Lineage Graph Commands ==========
                case 'searchLineageTables':
                    await this.handleSearchLineageTables(message.query, message.typeFilter);
                    break;

                case 'getLineageGraph':
                    await this.handleGetLineageGraph(
                        message.nodeId,
                        this.resolveRequestedDepth(message.depth),
                        message.direction || 'both',
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
                    this.handleCollapseNodeColumns(message.nodeId);
                    break;

                case 'setLineageLegendVisibility':
                    this._context.setLineageLegendVisible(message.visible);
                    break;

                case 'selectColumn':
                    await this.handleSelectColumn(message.tableId, message.columnName);
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

    private async handleRefresh(): Promise<void> {
        await this._context.buildIndexWithProgress();
        await this._context.rebuildAndRenderGraph();
    }

    /**
     * Handle graph mode switch (Files/Tables/Hybrid).
     * Validates mode and rebuilds graph with new mode.
     * Ensures view stays on Graph tab (not Lineage/Tables/Impact).
     */
    private async handleSwitchGraphMode(mode: string): Promise<void> {
        const valid: GraphMode[] = ['files', 'tables', 'hybrid'];
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
            this._context.panel.webview.html = this._context.getWebviewHtml(graph, filter);
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
            this._context.panel.webview.html = this._context.getWebviewHtml(graph, clearFilter);
        }
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

    private async handleSwitchToLineageView(): Promise<void> {
        this._context.setCurrentView('lineage');
        await this._context.buildLineageGraph();

        const lineageGraph = this._context.getLineageGraph();
        const graph = lineageGraph || createEmptyLineageGraph();
        const html = this._context.getLineageView().generateLineageSearchView(graph);

        this.postMessage({
            command: 'lineageOverviewResult',
            data: { html }
        });
    }

    private async handleSwitchToImpactView(): Promise<void> {
        this._context.setCurrentView('impact');
        await this._context.buildLineageGraph();

        const lineageGraph = this._context.getLineageGraph();
        if (lineageGraph) {
            const html = this._context.getImpactView().generateImpactForm(lineageGraph);
            this.postMessage({
                command: 'impactFormResult',
                data: { html }
            });
        } else {
            const html = this._context.getImpactView().generateImpactForm(null);
            this.postMessage({
                command: 'impactFormResult',
                data: { html }
            });
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
        type: 'table' | 'column',
        name: string,
        tableName?: string,
        changeType: 'modify' | 'rename' | 'drop' | 'addColumn' = 'modify'
    ): Promise<void> {
        const trimmedName = name?.trim() || '';
        if (!trimmedName) {
            this.postMessage({
                command: 'impactResult',
                data: { error: 'Impact target name is required.' }
            });
            return;
        }

        if (type === 'column' && (!tableName || tableName.trim().length === 0)) {
            this.postMessage({
                command: 'impactResult',
                data: { error: 'Table name is required for column impact analysis.' }
            });
            return;
        }

        await this._context.buildLineageGraph();
        const impactAnalyzer = this._context.getImpactAnalyzer();

        if (!impactAnalyzer) {return;}

        let report: ImpactReport;
        if (type === 'table') {
            report = impactAnalyzer.analyzeTableChange(trimmedName, changeType);
        } else {
            report = impactAnalyzer.analyzeColumnChange(tableName!.trim(), trimmedName, changeType);
        }

        this._context.setCurrentImpactReport(report);

        // Send result to webview
        this.postMessage({
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
                html: this._context.getImpactView().generateImpactReport(report)
            }
        });
    }

    private async handleExploreTable(tableName: string, providedNodeId?: string): Promise<void> {
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
            this.postMessage({
                command: 'tableDetailResult',
                data: { error: errorMsg }
            });
            return;
        }

        this._context.setSelectedLineageNode(node);

        const html = this._context.getTableExplorer().generateTableView({
            table: node,
            graph: lineageGraph
        });

        this.postMessage({
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
        });
    }

    private async handleGetColumnLineage(tableName: string, columnName: string): Promise<void> {
        await this._context.buildLineageGraph();
        const columnLineageTracker = this._context.getColumnLineageTracker();
        const lineageGraph = this._context.getLineageGraph();

        if (!columnLineageTracker || !lineageGraph) {return;}

        const lineage = columnLineageTracker.getFullColumnLineage(
            lineageGraph,
            tableName,
            columnName
        );

        const html = this._context.getLineageView().generateColumnLineageView(lineage);

        this.postMessage({
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
        filePath?: string
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
            this.postMessage({
                command: 'upstreamResult',
                data: { nodeId: nodeId || filePath, nodes: [], depth: 0 }
            });
            return;
        }

        // Aggregate results from all nodes
        const allNodes = new Map<string, { id: string; name: string; type: string; filePath?: string }>();
        let maxDepth = 0;

        for (const nid of nodeIds) {
            const result = flowAnalyzer.getUpstream(nid, { maxDepth: depth, excludeExternal: true });
            for (const n of result.nodes) {
                if (!allNodes.has(n.id)) {
                    allNodes.set(n.id, { id: n.id, name: n.name, type: n.type, filePath: n.filePath });
                }
            }
            maxDepth = Math.max(maxDepth, result.depth);
        }

        this.postMessage({
            command: 'upstreamResult',
            data: {
                nodeId: nodeId || filePath,
                nodes: Array.from(allNodes.values()),
                depth: maxDepth
            }
        });
    }

    private async handleGetDownstream(
        nodeId: string | undefined,
        depth: number = -1,
        nodeType?: string,
        filePath?: string
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
            this.postMessage({
                command: 'downstreamResult',
                data: { nodeId: nodeId || filePath, nodes: [], depth: 0 }
            });
            return;
        }

        // Aggregate results from all nodes
        const allNodes = new Map<string, { id: string; name: string; type: string; filePath?: string }>();
        let maxDepth = 0;

        for (const nid of nodeIds) {
            const result = flowAnalyzer.getDownstream(nid, { maxDepth: depth, excludeExternal: true });
            for (const n of result.nodes) {
                if (!allNodes.has(n.id)) {
                    allNodes.set(n.id, { id: n.id, name: n.name, type: n.type, filePath: n.filePath });
                }
            }
            maxDepth = Math.max(maxDepth, result.depth);
        }

        this.postMessage({
            command: 'downstreamResult',
            data: {
                nodeId: nodeId || filePath,
                nodes: Array.from(allNodes.values()),
                depth: maxDepth
            }
        });
    }

    // ========== Visual Lineage Graph Commands ==========

    private async handleSearchLineageTables(query: string, typeFilter?: string): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();

        if (!lineageGraph) {
            this.postMessage({
                command: 'lineageSearchResults',
                data: { results: [] }
            });
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

        this.postMessage({
            command: 'lineageSearchResults',
            data: { results: results.slice(0, 15) }
        });
    }

    private async handleGetLineageGraph(
        nodeId: string,
        depth: number,
        direction: 'both' | 'upstream' | 'downstream',
        expandedNodes?: string[]
    ): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();

        if (!lineageGraph) {
            this.postMessage({
                command: 'lineageGraphResult',
                data: { error: 'No lineage graph available. Open SQL files in your workspace and click Refresh to build the dependency index.' }
            });
            return;
        }

        // Generate HTML using the lineage view
        const html = this._context.getLineageView().generateLineageGraphView(
            lineageGraph,
            nodeId,
            {
                depth,
                direction,
                expandedNodes: new Set(expandedNodes || [])
            }
        );

        this.postMessage({
            command: 'lineageGraphResult',
            data: { html, nodeId, direction, expandedNodes: expandedNodes || [] }
        });
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

    private async handleSelectColumn(tableId: string, columnName: string): Promise<void> {
        await this._context.buildLineageGraph();
        const lineageGraph = this._context.getLineageGraph();
        const columnLineageTracker = this._context.getColumnLineageTracker();

        if (!lineageGraph || !columnLineageTracker) {
            return;
        }

        const selectedTable = lineageGraph.nodes.get(tableId);
        if (!selectedTable) {
            this.postMessage({
                command: 'columnLineageResult',
                data: {
                    tableId,
                    columnName,
                    upstream: [],
                    downstream: [],
                    warning: 'This table is not available in the lineage index yet. Refresh and retry column tracing.'
                }
            });
            return;
        }

        const lineage = columnLineageTracker.getFullColumnLineage(
            lineageGraph,
            tableId,
            columnName
        );

        // Send result back to webview
        this.postMessage({
            command: 'columnLineageResult',
            data: {
                tableId,
                columnName,
                upstream: lineage.upstream,
                downstream: lineage.downstream
            }
        });
    }

    private async handleClearColumnSelection(): Promise<void> {
        this.postMessage({
            command: 'columnSelectionCleared'
        });
    }

    /**
     * Resolve a workspace graph node ID (e.g. "table_5") to a lineage graph node ID (e.g. "table:daily_sales").
     * Falls back to matching by type:label_lowercase and then by name substring.
     */
    private resolveLineageNodeId(
        lineageGraph: LineageGraph,
        graphNodeId: string,
        nodeLabel: string,
        nodeType: string
    ): string | null {
        // Direct match (unlikely since graph IDs differ from lineage IDs)
        if (lineageGraph.nodes.has(graphNodeId)) {
            return graphNodeId;
        }

        // Try type:label_lowercase (the lineage graph ID format)
        const nameLower = nodeLabel.toLowerCase();
        const candidateId = `${nodeType}:${nameLower}`;
        if (lineageGraph.nodes.has(candidateId)) {
            return candidateId;
        }

        // Try common type alternatives
        const typeAlternatives = nodeType === 'view' ? ['view', 'table'] : nodeType === 'table' ? ['table', 'view'] : [nodeType];
        for (const t of typeAlternatives) {
            const altId = `${t}:${nameLower}`;
            if (lineageGraph.nodes.has(altId)) {
                return altId;
            }
        }

        // Fallback: scan all nodes for matching name
        for (const [id, node] of lineageGraph.nodes) {
            if (node.type === 'column') { continue; }
            if (node.name.toLowerCase() === nameLower) {
                return id;
            }
        }

        return null;
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

        const resolvedId = this.resolveLineageNodeId(lineageGraph, nodeId, nodeLabel, nodeType);
        if (!resolvedId) {
            vscode.window.showErrorMessage(`Node "${nodeLabel}" not found in lineage graph. Try refreshing the workspace index.`);
            return;
        }

        const node = lineageGraph.nodes.get(resolvedId)!;

        const upstream = flowAnalyzer.getUpstream(resolvedId, { maxDepth: -1, excludeExternal: false });
        const downstream = flowAnalyzer.getDownstream(resolvedId, { maxDepth: -1, excludeExternal: false });

        const safeLabel = nodeLabel
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            || 'node';

        const payload = {
            exportedAt: new Date().toISOString(),
            node: { id: nodeId, name: nodeLabel, type: nodeType, filePath: node.filePath },
            upstream: upstream.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, filePath: n.filePath })),
            downstream: downstream.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, filePath: n.filePath })),
            summary: {
                upstreamCount: upstream.nodes.length,
                downstreamCount: downstream.nodes.length,
                upstreamDepth: upstream.depth,
                downstreamDepth: downstream.depth
            }
        };

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`lineage-${safeLabel}.json`),
            filters: { 'JSON': ['json'] }
        });

        if (!uri) { return; }

        await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(payload, null, 2)));
        vscode.window.showInformationMessage(`Exported lineage for "${nodeLabel}" to ${uri.fsPath}`);
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
