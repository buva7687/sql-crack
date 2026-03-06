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
