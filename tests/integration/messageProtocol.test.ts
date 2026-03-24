/**
 * Integration test: Message protocol contracts
 *
 * Part 1 — Source-reading guards: validate type definitions and handler switch coverage.
 * Part 2 — Runtime handler tests: call MessageHandler.handleMessage() directly
 *           with a mock context and verify state mutations + dispatch.
 */

jest.mock('vscode');

import * as fs from 'fs';
import * as path from 'path';
import { MessageHandler, type MessageHandlerContext } from '../../src/workspace/handlers/messageHandler';
import {
    getWorkspaceRequestId,
    attachWorkspaceRequestId,
    inferMissingDataReason,
} from '../../src/workspace/handlers/messageMetadata';

const MESSAGES_DIR = path.join(__dirname, '../../src/shared/messages');
const HANDLER_PATH = path.join(__dirname, '../../src/workspace/handlers/messageHandler.ts');
const VIZ_PANEL_PATH = path.join(__dirname, '../../src/visualizationPanel.ts');

function readSource(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
}

describe('Message Protocol Contracts', () => {

    describe('SQL Flow message protocol', () => {
        const source = readSource(path.join(MESSAGES_DIR, 'sqlFlowMessages.ts'));

        it('WebviewMessage type covers all required commands', () => {
            const requiredCommands = [
                'error', 'info', 'requestRefresh', 'persistUiState',
                'goToLine', 'traceInWorkspaceLineage', 'requestFullscreen',
                'pinVisualization', 'changeViewLocation', 'getViewLocationOptions',
                'openPinnedTab', 'unpinTab', 'savePng', 'saveSvg', 'savePdf',
            ];
            for (const cmd of requiredCommands) {
                expect(source).toContain(`command: '${cmd}'`);
            }
        });

        it('HostMessage type covers all required commands', () => {
            const requiredCommands = [
                'refresh', 'cursorPosition', 'switchToQuery',
                'markStale', 'runtimeConfig', 'setEditorActivity',
                'viewLocationOptions', 'pinCreated',
            ];
            for (const cmd of requiredCommands) {
                expect(source).toContain(`command: '${cmd}'`);
            }
        });

        it('refresh message includes sql and options with dialect', () => {
            expect(source).toMatch(/command:\s*'refresh'.*sql:\s*string/s);
            expect(source).toMatch(/options:.*dialect:\s*string/s);
        });
    });

    describe('Workspace message protocol', () => {
        const source = readSource(path.join(MESSAGES_DIR, 'workspaceMessages.ts'));

        it('WebviewMessage covers view switching commands', () => {
            expect(source).toContain("command: 'switchView'");
            expect(source).toContain("command: 'switchToLineageView'");
            expect(source).toContain("command: 'switchToImpactView'");
        });

        it('WebviewMessage covers lineage analysis commands', () => {
            expect(source).toContain("command: 'getLineage'");
            expect(source).toContain("command: 'analyzeImpact'");
            expect(source).toContain("command: 'exploreTable'");
            expect(source).toContain("command: 'getColumnLineage'");
            expect(source).toContain("command: 'getUpstream'");
            expect(source).toContain("command: 'getDownstream'");
        });

        it('WebviewMessage covers file operation commands', () => {
            expect(source).toContain("command: 'openFile'");
            expect(source).toContain("command: 'openFileAtLine'");
            expect(source).toContain("command: 'visualizeFile'");
        });

        it('WebviewMessage covers graph interaction commands', () => {
            expect(source).toContain("command: 'refresh'");
            expect(source).toContain("command: 'switchGraphMode'");
            expect(source).toContain("command: 'search'");
            expect(source).toContain("command: 'export'");
        });

        it('HostMessage covers in-webview graph navigation updates', () => {
            expect(source).toContain("command: 'showInGraphResult'");
        });
    });

    describe('Workspace MessageHandler coverage', () => {
        const handlerSource = readSource(HANDLER_PATH);

        it('handles all critical workspace webview commands', () => {
            // These commands must have case branches in the handler
            const criticalCommands = [
                'switchView', 'refresh', 'switchGraphMode',
                'search', 'clearSearch', 'export',
                'openFile', 'openFileAtLine',
                'getLineage', 'analyzeImpact', 'exploreTable',
                'getUpstream', 'getDownstream',
            ];
            for (const cmd of criticalCommands) {
                expect(handlerSource).toContain(`'${cmd}'`);
            }
        });

        it('MessageHandler class is exported', () => {
            expect(handlerSource).toMatch(/export\s+class\s+MessageHandler/);
        });

        it('MessageHandlerContext interface defines required state accessors', () => {
            const requiredAccessors = [
                'getCurrentGraph', 'setCurrentGraph',
                'getCurrentView', 'setCurrentView',
                'getCurrentGraphMode', 'setCurrentGraphMode',
            ];
            for (const accessor of requiredAccessors) {
                expect(handlerSource).toContain(accessor);
            }
        });
    });

    describe('VisualizationPanel message handling', () => {
        const panelSource = readSource(VIZ_PANEL_PATH);

        it('handles requestRefresh command from webview', () => {
            expect(panelSource).toContain("'requestRefresh'");
        });

        it('handles goToLine command from webview', () => {
            expect(panelSource).toContain("'goToLine'");
        });

        it('handles pinVisualization command', () => {
            expect(panelSource).toContain("'pinVisualization'");
        });

        it('handles savePng command', () => {
            expect(panelSource).toContain("'savePng'");
        });

        it('handles traceInWorkspaceLineage command', () => {
            expect(panelSource).toContain("'traceInWorkspaceLineage'");
        });

        it('sends refresh message with sql and options', () => {
            expect(panelSource).toContain("command: 'refresh'");
        });

        it('sends runtimeConfig message on theme change', () => {
            expect(panelSource).toContain("command: 'runtimeConfig'");
        });
    });

    describe('Cross-panel consistency', () => {
        it('traceInWorkspaceLineage command exists in both SQL Flow and workspace', () => {
            const sqlFlowSource = readSource(path.join(MESSAGES_DIR, 'sqlFlowMessages.ts'));
            const vizPanelSource = readSource(VIZ_PANEL_PATH);

            // SQL Flow webview sends it
            expect(sqlFlowSource).toContain("'traceInWorkspaceLineage'");
            // VisualizationPanel handles it
            expect(vizPanelSource).toContain("'traceInWorkspaceLineage'");
        });
    });
});

// ============================================================
// Part 2 — Runtime handler tests
// ============================================================

function createMockContext(overrides: Partial<MessageHandlerContext> = {}): MessageHandlerContext {
    const state = {
        currentView: 'graph' as 'graph' | 'lineage' | 'impact' | 'issues',
        currentGraphMode: 'tables' as 'files' | 'tables',
        searchFilter: { query: '', nodeTypes: undefined as undefined, useRegex: false, caseSensitive: false },
        showHelp: false,
        isDarkTheme: true,
        lineageLegendVisible: true,
        lineageDetailNodeId: null as string | null,
        lineageDetailDirection: 'both' as 'both' | 'upstream' | 'downstream',
        lineageDetailExpandedNodes: [] as string[],
    };

    return {
        panel: {
            webview: {
                postMessage: jest.fn().mockResolvedValue(true),
                html: '',
            },
        } as any,

        getCurrentGraph: jest.fn().mockReturnValue(null),
        setCurrentGraph: jest.fn(),
        getCurrentView: jest.fn(() => state.currentView),
        setCurrentView: jest.fn((v: any) => { state.currentView = v; }),
        getCurrentSearchFilter: jest.fn(() => state.searchFilter),
        setCurrentSearchFilter: jest.fn((f: any) => { state.searchFilter = f; }),
        getCurrentGraphMode: jest.fn(() => state.currentGraphMode),
        setCurrentGraphMode: jest.fn((m: any) => { state.currentGraphMode = m; }),
        getShowHelp: jest.fn(() => state.showHelp),
        setShowHelp: jest.fn((v: boolean) => { state.showHelp = v; }),

        getLineageGraph: jest.fn().mockReturnValue(null),
        setLineageGraph: jest.fn(),
        getLineageBuilder: jest.fn().mockReturnValue(null),
        setLineageBuilder: jest.fn(),
        getFlowAnalyzer: jest.fn().mockReturnValue(null),
        setFlowAnalyzer: jest.fn(),
        getImpactAnalyzer: jest.fn().mockReturnValue(null),
        setImpactAnalyzer: jest.fn(),
        getColumnLineageTracker: jest.fn().mockReturnValue(null),
        setColumnLineageTracker: jest.fn(),
        getSelectedLineageNode: jest.fn().mockReturnValue(null),
        setSelectedLineageNode: jest.fn(),
        getCurrentImpactReport: jest.fn().mockReturnValue(null),
        setCurrentImpactReport: jest.fn(),
        getCurrentFlowResult: jest.fn().mockReturnValue(null),
        setCurrentFlowResult: jest.fn(),
        getLineageLegendVisible: jest.fn(() => state.lineageLegendVisible),
        setLineageLegendVisible: jest.fn((v: boolean) => { state.lineageLegendVisible = v; }),
        getLineageDetailNodeId: jest.fn(() => state.lineageDetailNodeId),
        setLineageDetailNodeId: jest.fn((v: string | null) => { state.lineageDetailNodeId = v; }),
        getLineageDetailDirection: jest.fn(() => state.lineageDetailDirection),
        setLineageDetailDirection: jest.fn((v: any) => { state.lineageDetailDirection = v; }),
        getLineageDetailExpandedNodes: jest.fn(() => state.lineageDetailExpandedNodes),
        setLineageDetailExpandedNodes: jest.fn((v: string[]) => { state.lineageDetailExpandedNodes = v; }),

        getTableExplorer: jest.fn().mockReturnValue({}),
        getLineageView: jest.fn().mockReturnValue({}),
        getImpactView: jest.fn().mockReturnValue({}),
        getDefaultLineageDepth: jest.fn().mockReturnValue(3),

        getIsDarkTheme: jest.fn(() => state.isDarkTheme),
        setIsDarkTheme: jest.fn((v: boolean) => { state.isDarkTheme = v; }),

        getIsRebuilding: jest.fn().mockReturnValue(false),
        getHasPendingIndexChanges: jest.fn().mockReturnValue(false),

        renderCurrentView: jest.fn(),
        getWebviewHtml: jest.fn().mockReturnValue('<html></html>'),
        getThemeCss: jest.fn().mockReturnValue('body { color: #fff; }'),
        buildIndexWithProgress: jest.fn().mockResolvedValue(undefined),
        rebuildAndRenderGraph: jest.fn().mockResolvedValue(undefined),
        buildLineageGraph: jest.fn().mockResolvedValue(undefined),
        handleExport: jest.fn().mockResolvedValue(undefined),
        savePngToFile: jest.fn().mockResolvedValue(undefined),
        trackUxEvent: jest.fn(),

        ...overrides,
    };
}

describe('MessageHandler runtime dispatch', () => {
    let handler: MessageHandler;
    let ctx: MessageHandlerContext;

    beforeEach(() => {
        ctx = createMockContext();
        handler = new MessageHandler(ctx);
    });

    it('switchView sets view and triggers render', async () => {
        await handler.handleMessage({ command: 'switchView', view: 'lineage' } as any);
        expect(ctx.setCurrentView).toHaveBeenCalledWith('lineage');
        expect(ctx.renderCurrentView).toHaveBeenCalled();
    });

    it('refresh triggers index build and graph rebuild', async () => {
        await handler.handleMessage({ command: 'refresh' } as any);
        expect(ctx.buildIndexWithProgress).toHaveBeenCalled();
        expect(ctx.rebuildAndRenderGraph).toHaveBeenCalled();
    });

    it('switchGraphMode validates mode and clears search', async () => {
        await handler.handleMessage({ command: 'switchGraphMode', mode: 'files' } as any);
        expect(ctx.setCurrentGraphMode).toHaveBeenCalledWith('files');
        expect(ctx.setCurrentSearchFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: '' })
        );
        expect(ctx.setCurrentView).toHaveBeenCalledWith('graph');
        expect(ctx.rebuildAndRenderGraph).toHaveBeenCalled();
    });

    it('switchGraphMode normalizes invalid mode to tables', async () => {
        await handler.handleMessage({ command: 'switchGraphMode', mode: 'bogus' } as any);
        expect(ctx.setCurrentGraphMode).toHaveBeenCalledWith('tables');
    });

    it('search updates filter without re-rendering the workspace webview', async () => {
        const graph = { nodes: [], edges: [], stats: {} } as any;
        (ctx.getCurrentGraph as jest.Mock).mockReturnValue(graph);
        const filter = { query: 'users', nodeTypes: undefined, useRegex: false, caseSensitive: false };
        await handler.handleMessage({ command: 'search', filter } as any);
        expect(ctx.setCurrentSearchFilter).toHaveBeenCalledWith(filter);
        expect(ctx.getWebviewHtml).not.toHaveBeenCalled();
    });

    it('clearSearch resets filter without re-rendering the workspace webview', async () => {
        const graph = { nodes: [], edges: [], stats: {} } as any;
        (ctx.getCurrentGraph as jest.Mock).mockReturnValue(graph);
        await handler.handleMessage({ command: 'clearSearch' } as any);
        expect(ctx.setCurrentSearchFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: '' })
        );
        expect(ctx.getWebviewHtml).not.toHaveBeenCalled();
    });

    it('toggleHelp flips help state and re-renders', async () => {
        await handler.handleMessage({ command: 'toggleHelp' } as any);
        expect(ctx.setShowHelp).toHaveBeenCalledWith(true); // was false
        expect(ctx.renderCurrentView).toHaveBeenCalled();
    });

    it('toggleTheme flips theme and sends themeChanged message', async () => {
        await handler.handleMessage({ command: 'toggleTheme' } as any);
        expect(ctx.setIsDarkTheme).toHaveBeenCalledWith(false); // was true
        expect(ctx.panel.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ command: 'themeChanged', isDark: false })
        );
    });

    it('export delegates to handleExport with format', async () => {
        await handler.handleMessage({ command: 'export', format: 'png' } as any);
        expect(ctx.handleExport).toHaveBeenCalledWith('png');
    });

    it('trackUxEvent forwards event to context', async () => {
        await handler.handleMessage({ command: 'trackUxEvent', event: 'click_node', metadata: { x: 1 } } as any);
        expect(ctx.trackUxEvent).toHaveBeenCalledWith('click_node', { x: 1 });
    });

    it('trackUxEvent ignores empty event string', async () => {
        await handler.handleMessage({ command: 'trackUxEvent', event: '' } as any);
        expect(ctx.trackUxEvent).not.toHaveBeenCalled();
    });

    it('setLineageLegendVisibility sets state directly', async () => {
        await handler.handleMessage({ command: 'setLineageLegendVisibility', visible: false } as any);
        expect(ctx.setLineageLegendVisible).toHaveBeenCalledWith(false);
    });

    it('savePng delegates to savePngToFile', async () => {
        await handler.handleMessage({ command: 'savePng', data: 'base64data', filename: 'graph.png' } as any);
        expect(ctx.savePngToFile).toHaveBeenCalledWith('base64data', 'graph.png');
    });

    it('switchToLineageView sets view to lineage and clears detail', async () => {
        await handler.handleMessage({ command: 'switchToLineageView' } as any);
        expect(ctx.setCurrentView).toHaveBeenCalledWith('lineage');
        expect(ctx.setLineageDetailNodeId).toHaveBeenCalledWith(null);
        expect(ctx.buildLineageGraph).toHaveBeenCalled();
    });

    it('disposed handler silently ignores messages', async () => {
        handler.markDisposed();
        await handler.handleMessage({ command: 'refresh' } as any);
        expect(ctx.buildIndexWithProgress).not.toHaveBeenCalled();
    });

    it('handler catches errors without throwing', async () => {
        (ctx.buildIndexWithProgress as jest.Mock).mockRejectedValue(new Error('boom'));
        // Should not throw
        await handler.handleMessage({ command: 'refresh' } as any);
    });

    it('showInGraph sets search filter, switches to graph view, and posts an in-webview update when already on the main workspace UI', async () => {
        const graph = { nodes: [], edges: [], stats: {} } as any;
        (ctx.getCurrentGraph as jest.Mock).mockReturnValue(graph);
        (ctx.getCurrentView as jest.Mock).mockReturnValue('lineage');
        await handler.handleMessage({ command: 'showInGraph', query: 'orders', nodeType: 'table' } as any);
        expect(ctx.setCurrentSearchFilter).toHaveBeenCalledWith(
            expect.objectContaining({ query: 'orders' })
        );
        expect(ctx.setCurrentView).toHaveBeenCalledWith('graph');
        expect(ctx.panel.webview.postMessage).toHaveBeenCalledWith({
            command: 'showInGraphResult',
            data: { query: 'orders' }
        });
        expect(ctx.getWebviewHtml).not.toHaveBeenCalled();
    });

    it('showInGraph re-renders when invoked from the issues page', async () => {
        const graph = { nodes: [], edges: [], stats: {} } as any;
        (ctx.getCurrentGraph as jest.Mock).mockReturnValue(graph);
        (ctx.getCurrentView as jest.Mock).mockReturnValue('issues');

        await handler.handleMessage({ command: 'showInGraph', query: 'orders', nodeType: 'table' } as any);

        expect(ctx.renderCurrentView).toHaveBeenCalled();
    });

    it('getLineage attaches the originating request id to lineageResult', async () => {
        const flowResult = {
            nodes: [{ id: 'table:orders', name: 'orders', type: 'table', filePath: '/repo/orders.sql', lineNumber: 4 }],
            edges: [],
            paths: [],
            depth: 2,
        };
        (ctx.getFlowAnalyzer as jest.Mock).mockReturnValue({
            getUpstream: jest.fn(() => flowResult),
            getDownstream: jest.fn(() => flowResult),
        });
        (ctx.getLineageGraph as jest.Mock).mockReturnValue({
            nodes: new Map(),
            edges: [],
            columnEdges: [],
            getUpstream: jest.fn(),
            getDownstream: jest.fn(),
            getColumnLineage: jest.fn(),
        });

        await handler.handleMessage({
            command: 'getLineage',
            nodeId: 'table:orders',
            direction: 'upstream',
            requestId: 17,
        } as any);

        expect(ctx.panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'lineageResult',
            data: expect.objectContaining({
                requestId: 17,
                nodeId: 'table:orders',
                direction: 'upstream',
            }),
        }));
    });
});

describe('Message metadata utilities', () => {
    it('getWorkspaceRequestId extracts valid numeric requestId', () => {
        expect(getWorkspaceRequestId({ command: 'refresh', requestId: 42 } as any)).toBe(42);
    });

    it('getWorkspaceRequestId returns undefined for missing requestId', () => {
        expect(getWorkspaceRequestId({ command: 'refresh' } as any)).toBeUndefined();
    });

    it('getWorkspaceRequestId rejects negative and non-finite values', () => {
        expect(getWorkspaceRequestId({ command: 'refresh', requestId: -1 } as any)).toBeUndefined();
        expect(getWorkspaceRequestId({ command: 'refresh', requestId: NaN } as any)).toBeUndefined();
        expect(getWorkspaceRequestId({ command: 'refresh', requestId: Infinity } as any)).toBeUndefined();
    });

    it('getWorkspaceRequestId floors fractional values', () => {
        expect(getWorkspaceRequestId({ command: 'refresh', requestId: 7.9 } as any)).toBe(7);
    });

    it('attachWorkspaceRequestId adds requestId to message data', () => {
        const msg = { command: 'lineageResult' as const, data: { nodes: [] } };
        const result = attachWorkspaceRequestId(msg as any, 99);
        expect(result.data.requestId).toBe(99);
    });

    it('attachWorkspaceRequestId returns original message when requestId is undefined', () => {
        const msg = { command: 'lineageResult' as const, data: {} };
        const result = attachWorkspaceRequestId(msg as any, undefined);
        expect(result).toBe(msg);
    });

    it('inferMissingDataReason returns correct reasons', () => {
        expect(inferMissingDataReason({ changesSinceIndex: 5, parseErrorCount: 0 })).toBe('stale_index');
        expect(inferMissingDataReason({ changesSinceIndex: 0, parseErrorCount: 0, knownMissingDueToScope: true })).toBe('excluded_file');
        expect(inferMissingDataReason({ changesSinceIndex: 0, parseErrorCount: 0, requestedNodeType: 'external' })).toBe('external_unresolved');
        expect(inferMissingDataReason({ changesSinceIndex: 0, parseErrorCount: 3 })).toBe('parse_error');
        expect(inferMissingDataReason({ changesSinceIndex: 0, parseErrorCount: 0 })).toBe('not_found');
    });
});
