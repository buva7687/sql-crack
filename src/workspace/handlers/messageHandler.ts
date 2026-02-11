// Message Handler - Handles all webview messages for workspace panel
// Extracted from workspacePanel.ts for modularity

import * as vscode from 'vscode';
import * as path from 'path';
import { SearchFilter, GraphMode } from '../types';
import {
    LineageGraph,
    LineageNode,
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
    getCurrentGraph: () => any | null;
    setCurrentGraph: (graph: any | null) => void;
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
    getLineageBuilder: () => any | null;
    setLineageBuilder: (builder: any | null) => void;
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
    getWebviewHtml: (graph: any, searchFilter: SearchFilter) => string;
    getThemeCss: (isDark: boolean) => string;
    buildIndexWithProgress: () => Promise<void>;
    rebuildAndRenderGraph: () => Promise<void>;
    buildLineageGraph: () => Promise<void>;
    handleExport: (format: string) => Promise<void>;
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

    private isFilePathAllowed(filePath: string): boolean {
        if (!filePath || filePath.trim().length === 0) {
            return false;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            // Workspace panel is only available with workspace folders,
            // but keep behavior safe if state is unexpectedly unavailable.
            return false;
        }

        const candidate = this.normalizePathForComparison(filePath);
        return workspaceFolders.some(folder => {
            const root = this.normalizePathForComparison(folder.uri.fsPath);
            return candidate === root || candidate.startsWith(root + path.sep);
        });
    }

    /**
     * Main message router - dispatches messages to appropriate handlers
     */
    private postMessage(msg: WorkspaceHostMessage): void {
        this._context.panel.webview.postMessage(msg);
    }

    public async handleMessage(message: WorkspaceWebviewMessage): Promise<void> {
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

            case 'selectColumn':
                await this.handleSelectColumn(message.tableId, message.columnName);
                break;

            case 'clearColumnSelection':
                await this.handleClearColumnSelection();
                break;

            default:
                logger.warn(`Unknown message command: ${(message as { command: string }).command}`);
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
        // Ensure we're on Graph view when switching modes (not Lineage/Tables/Impact)
        // This prevents the view from switching to the wrong tab after mode change
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
            if (!this.isFilePathAllowed(filePath)) {
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
            if (!this.isFilePathAllowed(filePath)) {
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
            if (!this.isFilePathAllowed(filePath)) {
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
        if (lineageGraph) {
            const html = this._context.getLineageView().generateLineageOverview(lineageGraph);
            this.postMessage({
                command: 'lineageOverviewResult',
                data: { html }
            });
        }
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

        if (direction === 'upstream' || direction === 'both') {
            result = flowAnalyzer.getUpstream(nodeId, { maxDepth: depth });
        }
        if (direction === 'downstream' || direction === 'both') {
            const downstream = flowAnalyzer.getDownstream(nodeId, { maxDepth: depth });
            if (result) {
                result.nodes = [...result.nodes, ...downstream.nodes];
                result.edges = [...result.edges, ...downstream.edges];
            } else {
                result = downstream;
            }
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
        await this._context.buildLineageGraph();
        const impactAnalyzer = this._context.getImpactAnalyzer();

        if (!impactAnalyzer) {return;}

        let report: ImpactReport;
        if (type === 'table') {
            report = impactAnalyzer.analyzeTableChange(name, changeType);
        } else {
            report = impactAnalyzer.analyzeColumnChange(tableName!, name, changeType);
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
            const normalizedPath = filePath.toLowerCase();
            for (const [id, node] of lineageGraph.nodes) {
                const isDisplayable = node.type === 'table' || node.type === 'view' || node.type === 'cte';
                if (isDisplayable && node.filePath && node.filePath.toLowerCase() === normalizedPath) {
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
            const result = flowAnalyzer.getUpstream(nid, { maxDepth: depth });
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
            const normalizedPath = filePath.toLowerCase();
            for (const [id, node] of lineageGraph.nodes) {
                const isDisplayable = node.type === 'table' || node.type === 'view' || node.type === 'cte';
                if (isDisplayable && node.filePath && node.filePath.toLowerCase() === normalizedPath) {
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
            const result = flowAnalyzer.getDownstream(nid, { maxDepth: depth });
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

        const columnEdgeCount = lineageGraph.columnEdges?.length || 0;

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
}
