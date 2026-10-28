import { MessageHandler } from '../../../../src/workspace/handlers/messageHandler';

function createContext(overrides: Record<string, unknown> = {}) {
    const postMessage = jest.fn();
    const lineageView = {
        generateLineageSearchView: jest.fn(() => '<div>lineage-empty</div>'),
    };
    const impactView = {
        generateImpactForm: jest.fn(() => '<div>impact-form</div>'),
    };

    const base = {
        panel: { webview: { postMessage } },
        getCurrentGraph: jest.fn(() => null),
        setCurrentGraph: jest.fn(),
        getCurrentView: jest.fn(() => 'graph'),
        setCurrentView: jest.fn(),
        getCurrentSearchFilter: jest.fn(() => ({ query: '', useRegex: false, caseSensitive: false })),
        setCurrentSearchFilter: jest.fn(),
        getCurrentGraphMode: jest.fn(() => 'tables'),
        setCurrentGraphMode: jest.fn(),
        getShowHelp: jest.fn(() => false),
        setShowHelp: jest.fn(),
        getLineageGraph: jest.fn(() => null),
        setLineageGraph: jest.fn(),
        getLineageBuilder: jest.fn(() => null),
        setLineageBuilder: jest.fn(),
        getFlowAnalyzer: jest.fn(() => null),
        setFlowAnalyzer: jest.fn(),
        getImpactAnalyzer: jest.fn(() => null),
        setImpactAnalyzer: jest.fn(),
        getColumnLineageTracker: jest.fn(() => null),
        setColumnLineageTracker: jest.fn(),
        getSelectedLineageNode: jest.fn(() => null),
        setSelectedLineageNode: jest.fn(),
        getCurrentImpactReport: jest.fn(() => null),
        setCurrentImpactReport: jest.fn(),
        getCurrentFlowResult: jest.fn(() => null),
        setCurrentFlowResult: jest.fn(),
        getLineageLegendVisible: jest.fn(() => true),
        setLineageLegendVisible: jest.fn(),
        getLineageDetailNodeId: jest.fn(() => null),
        setLineageDetailNodeId: jest.fn(),
        getLineageDetailDirection: jest.fn(() => 'both'),
        setLineageDetailDirection: jest.fn(),
        getLineageDetailExpandedNodes: jest.fn(() => []),
        setLineageDetailExpandedNodes: jest.fn(),
        getTableExplorer: jest.fn(),
        getLineageView: jest.fn(() => lineageView),
        getImpactView: jest.fn(() => impactView),
        getDefaultLineageDepth: jest.fn(() => 7),
        getIsDarkTheme: jest.fn(() => true),
        setIsDarkTheme: jest.fn(),
        getIsRebuilding: jest.fn(() => false),
        getHasPendingIndexChanges: jest.fn(() => false),
        renderCurrentView: jest.fn(),
        getWebviewHtml: jest.fn(),
        getThemeCss: jest.fn(),
        buildIndexWithProgress: jest.fn(),
        rebuildAndRenderGraph: jest.fn().mockResolvedValue(undefined),
        buildLineageGraph: jest.fn().mockResolvedValue(undefined),
        handleExport: jest.fn().mockResolvedValue(undefined),
        savePngToFile: jest.fn().mockResolvedValue(undefined),
    };

    return {
        context: { ...base, ...overrides } as any,
        postMessage,
        lineageView,
        impactView,
    };
}

describe('MessageHandler lineage null-state rendering', () => {
    it('renders an empty lineage search view when lineage graph is unavailable', async () => {
        const { context, postMessage, lineageView } = createContext({
            getLineageGraph: jest.fn(() => null),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({ command: 'switchToLineageView' } as any);

        expect(context.setCurrentView).toHaveBeenCalledWith('lineage');
        expect(context.setLineageDetailNodeId).toHaveBeenCalledWith(null);
        expect(context.buildLineageGraph).toHaveBeenCalled();
        expect(lineageView.generateLineageSearchView).toHaveBeenCalledWith(
            expect.objectContaining({
                nodes: expect.any(Map),
                edges: [],
            }),
            { depth: 7 }
        );
        expect(postMessage).toHaveBeenCalledWith({
            command: 'lineageOverviewResult',
            data: { html: '<div>lineage-empty</div>' },
        });
    });

    it('clears persisted lineage detail state when switching to impact overview', async () => {
        const { context, postMessage, impactView } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({ command: 'switchToImpactView' } as any);

        expect(context.setCurrentView).toHaveBeenCalledWith('impact');
        expect(context.setLineageDetailNodeId).toHaveBeenCalledWith(null);
        expect(impactView.generateImpactForm).toHaveBeenCalledWith(null);
        expect(postMessage).toHaveBeenCalledWith({
            command: 'impactFormResult',
            data: { html: '<div>impact-form</div>' },
        });
    });

    it('replays a cached impact report on impact view switch and preserves the request id', async () => {
        const report = {
            changeType: 'modify',
            target: { type: 'table', name: 'orders' },
            severity: 'medium',
            summary: { totalAffected: 1, tablesAffected: 1, viewsAffected: 0, queriesAffected: 0, filesAffected: 1 },
            directImpacts: [{
                node: { name: 'orders', type: 'table' },
                reason: 'Direct dependency',
                severity: 'medium',
                filePath: '/tmp/orders.sql',
                lineNumber: 12,
            }],
            transitiveImpacts: [],
            suggestions: ['Review downstream consumers'],
        };
        const { context, postMessage, impactView } = createContext({
            getCurrentImpactReport: jest.fn(() => report),
            getImpactView: jest.fn(() => ({
                ...impactView,
                generateImpactReport: jest.fn(() => '<div>impact-report</div>'),
            })),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({ command: 'switchToImpactView', requestId: 42 } as any);

        expect(postMessage).toHaveBeenCalledWith({
            command: 'impactResult',
            data: expect.objectContaining({
                html: '<div>impact-report</div>',
                requestId: 42,
                report: expect.objectContaining({
                    changeType: 'modify',
                    severity: 'medium',
                    directImpacts: [
                        expect.objectContaining({
                            name: 'orders',
                            reason: 'Direct dependency',
                        }),
                    ],
                }),
            }),
        });
    });
});

function deferredBuild() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
}

function pendingDetailContext() {
    const build = deferredBuild();
    let detail: string | null = null;
    const graph = { nodes: new Map([
        ['table:orders', { id: 'table:orders', name: 'orders', type: 'table', metadata: {} }],
        ['table:users', { id: 'table:users', name: 'users', type: 'table', metadata: {} }],
    ]), edges: [], columnEdges: [] };
    const result = createContext({
        buildLineageGraph: jest.fn(() => build.promise),
        getLineageGraph: jest.fn(() => graph),
        setLineageDetailNodeId: jest.fn(value => { detail = value; }),
        getLineageView: jest.fn(() => ({ generateLineageGraphView: jest.fn(() => '<detail>'), generateLineageSearchView: jest.fn(() => '<overview>') })),
    });
    return { ...result, build, detail: () => detail };
}

describe('host navigation ordering', () => {
    it('does not restore old detail state after returning to the overview during a shared build', async () => {
        const h = pendingDetailContext();
        const handler = new MessageHandler(h.context);
        const old = handler.handleMessage({ command: 'getLineageGraph', nodeId: 'table:orders', requestId: 1 });
        const overview = handler.handleMessage({ command: 'switchToLineageView', requestId: 2 });
        h.build.resolve(); await Promise.all([old, overview]);
        expect(h.detail()).toBeNull();
        expect(h.postMessage.mock.calls.map(call => call[0].command)).toEqual(['lineageOverviewResult']);
        expect(h.context.setLineageDetailDirection).not.toHaveBeenCalled();
        expect(h.context.setLineageDetailExpandedNodes).not.toHaveBeenCalled();
    });
    it('lets a newer detail win over an older pending overview', async () => {
        const h = pendingDetailContext(); const handler = new MessageHandler(h.context);
        const root = handler.handleMessage({ command: 'switchToLineageView', requestId: 1 });
        const detail = handler.handleMessage({ command: 'getLineageGraph', nodeId: 'table:users', requestId: 2 });
        h.build.resolve(); await Promise.all([root, detail]);
        expect(h.detail()).toBe('table:users');
        expect(h.postMessage.mock.calls.map(call => call[0].command)).toEqual(['lineageGraphResult']);
    });

    it('rejects an older detail that finishes after a newer detail on another build', async () => {
        const h = pendingDetailContext(), newer = deferredBuild();
        h.context.buildLineageGraph.mockImplementationOnce(() => h.build.promise).mockImplementationOnce(() => newer.promise);
        const handler = new MessageHandler(h.context);
        const old = handler.handleMessage({ command: 'getLineageGraph', nodeId: 'table:orders', requestId: 1 });
        const current = handler.handleMessage({ command: 'getLineageGraph', nodeId: 'table:users', requestId: 2 });
        newer.resolve(); await current; h.build.resolve(); await old;
        expect(h.detail()).toBe('table:users');
        expect(h.postMessage).toHaveBeenCalledTimes(1);
        expect(h.postMessage.mock.calls[0][0].data.requestId).toBe(2);
    });

    it('invalidates pending detail when returning to Graph', async () => {
        const h = pendingDetailContext(); const handler = new MessageHandler(h.context);
        const old = handler.handleMessage({ command: 'getLineageGraph', nodeId: 'table:orders', requestId: 1 });
        await handler.handleMessage({ command: 'switchView', view: 'graph' });
        h.build.resolve(); await old;
        expect(h.detail()).toBeNull();
        expect(h.postMessage).not.toHaveBeenCalled();
    });

    it('does not mutate persisted detail after disposal while a build is pending', async () => {
        const h = pendingDetailContext(); const handler = new MessageHandler(h.context);
        const old = handler.handleMessage({ command: 'getLineageGraph', nodeId: 'table:orders', requestId: 1 });
        handler.markDisposed(); h.build.resolve(); await old;
        expect(h.context.setLineageDetailNodeId).not.toHaveBeenCalled();
        expect(h.context.setLineageDetailDirection).not.toHaveBeenCalled();
        expect(h.context.setLineageDetailExpandedNodes).not.toHaveBeenCalled();
    });

    it('does not let an older table-details request change selection after root navigation', async () => {
        const h = pendingDetailContext(); const handler = new MessageHandler(h.context);
        const old = handler.handleMessage({ command: 'exploreTable', tableName: 'orders', nodeId: 'table:orders', requestId: 1 });
        const root = handler.handleMessage({ command: 'switchToLineageView', requestId: 2 });
        h.build.resolve(); await Promise.all([old, root]);
        expect(h.context.setSelectedLineageNode).not.toHaveBeenCalled();
        expect(h.postMessage.mock.calls.map(call => call[0].command)).toEqual(['lineageOverviewResult']);
    });

    it('preserves the Impact form and report while rejecting older Lineage detail', async () => {
        const h = pendingDetailContext();
        const report = { changeType: 'modify', target: { type: 'table', name: 'orders' }, severity: 'low', summary: {}, directImpacts: [], transitiveImpacts: [], suggestions: [] };
        h.context.getImpactAnalyzer.mockReturnValue({ analyzeTableChange: jest.fn(() => report) });
        h.context.getImpactView.mockReturnValue({ generateImpactForm: jest.fn(() => '<form>'), generateImpactReport: jest.fn(() => '<report>') });
        const handler = new MessageHandler(h.context);
        const old = handler.handleMessage({ command: 'getLineageGraph', nodeId: 'table:orders', requestId: 1 });
        const form = handler.handleMessage({ command: 'switchToImpactView', requestId: 2 });
        const analysis = handler.handleMessage({ command: 'analyzeImpact', type: 'table', name: 'orders', requestId: 3 });
        h.build.resolve(); await Promise.all([old, form, analysis]);
        expect(h.detail()).toBeNull();
        expect(h.postMessage.mock.calls.map(call => call[0].command)).toEqual(['impactFormResult', 'impactResult']);
        expect(h.context.setCurrentImpactReport).toHaveBeenCalledWith(report);
    });

    it('does not persist an obsolete Impact report when analyses finish out of order', async () => {
        const h = pendingDetailContext(), newer = deferredBuild();
        h.context.buildLineageGraph.mockImplementationOnce(() => h.build.promise).mockImplementationOnce(() => newer.promise);
        h.context.getImpactAnalyzer.mockReturnValue({ analyzeTableChange: jest.fn((name: string) => ({ changeType: 'modify', target: { type: 'table', name }, severity: 'low', summary: {}, directImpacts: [], transitiveImpacts: [], suggestions: [] })) });
        h.context.getImpactView.mockReturnValue({ generateImpactReport: jest.fn(() => '<report>') });
        const handler = new MessageHandler(h.context);
        const old = handler.handleMessage({ command: 'analyzeImpact', type: 'table', name: 'orders', requestId: 1 });
        const current = handler.handleMessage({ command: 'analyzeImpact', type: 'table', name: 'users', requestId: 2 });
        newer.resolve(); await current; h.build.resolve(); await old;
        expect(h.context.setCurrentImpactReport).toHaveBeenCalledTimes(1);
        expect(h.context.setCurrentImpactReport).toHaveBeenCalledWith(expect.objectContaining({ target: { type: 'table', name: 'users' } }));
        expect(h.postMessage).toHaveBeenCalledTimes(1);
    });

});
