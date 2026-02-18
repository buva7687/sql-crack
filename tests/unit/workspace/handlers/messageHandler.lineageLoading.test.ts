import { MessageHandler } from '../../../../src/workspace/handlers/messageHandler';

function createContext(overrides: Record<string, unknown> = {}) {
    const postMessage = jest.fn();
    const lineageView = {
        generateLineageSearchView: jest.fn(() => '<div>lineage-empty</div>'),
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
        getTableExplorer: jest.fn(),
        getLineageView: jest.fn(() => lineageView),
        getImpactView: jest.fn(),
        getDefaultLineageDepth: jest.fn(() => 7),
        getIsDarkTheme: jest.fn(() => true),
        setIsDarkTheme: jest.fn(),
        getIsRebuilding: jest.fn(() => false),
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
        expect(context.buildLineageGraph).toHaveBeenCalled();
        expect(lineageView.generateLineageSearchView).toHaveBeenCalledWith(expect.objectContaining({
            nodes: expect.any(Map),
            edges: [],
        }));
        expect(postMessage).toHaveBeenCalledWith({
            command: 'lineageOverviewResult',
            data: { html: '<div>lineage-empty</div>' },
        });
    });
});
