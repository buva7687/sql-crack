import { MessageHandler } from '../../../../src/workspace/handlers/messageHandler';

function createContext(overrides: Record<string, unknown> = {}) {
    const postMessage = jest.fn();
    const setHtml = jest.fn();
    let currentHtml = '';
    const webview: { postMessage: jest.Mock; html?: string } = { postMessage };
    Object.defineProperty(webview, 'html', {
        configurable: true,
        get: () => currentHtml,
        set: (value: string) => {
            currentHtml = value;
            setHtml(value);
        },
    });

    const lineageView = {
        generateLineageSearchView: jest.fn(() => '<div>lineage</div>'),
    };

    const base = {
        panel: { webview },
        getCurrentGraph: jest.fn(() => ({ nodes: [], edges: [] })),
        setCurrentGraph: jest.fn(),
        getCurrentView: jest.fn(() => 'graph'),
        setCurrentView: jest.fn(),
        getCurrentSearchFilter: jest.fn(() => ({ query: '', useRegex: false, caseSensitive: false, nodeTypes: undefined })),
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
        getTableExplorer: jest.fn(),
        getLineageView: jest.fn(() => lineageView),
        getImpactView: jest.fn(),
        getDefaultLineageDepth: jest.fn(() => 7),
        getIsDarkTheme: jest.fn(() => true),
        setIsDarkTheme: jest.fn(),
        getIsRebuilding: jest.fn(() => false),
        renderCurrentView: jest.fn(),
        getWebviewHtml: jest.fn(() => '<div>graph</div>'),
        getThemeCss: jest.fn(() => ''),
        buildIndexWithProgress: jest.fn().mockResolvedValue(undefined),
        rebuildAndRenderGraph: jest.fn().mockResolvedValue(undefined),
        buildLineageGraph: jest.fn().mockResolvedValue(undefined),
        handleExport: jest.fn().mockResolvedValue(undefined),
        savePngToFile: jest.fn().mockResolvedValue(undefined),
        trackUxEvent: jest.fn(),
    };

    return {
        context: { ...base, ...overrides } as any,
        postMessage,
        setHtml,
        lineageView,
    };
}

describe('MessageHandler disposal guards', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('stops posting lineage responses after handler is marked disposed', async () => {
        const { context, postMessage } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({ command: 'switchToLineageView' } as any);
        expect(postMessage).toHaveBeenCalledTimes(1);

        handler.markDisposed();
        await handler.handleMessage({ command: 'switchToLineageView' } as any);

        expect(postMessage).toHaveBeenCalledTimes(1);
    });

    it('stops writing webview HTML after handler is marked disposed', async () => {
        const { context, setHtml } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({ command: 'showInGraph', query: 'orders' } as any);
        expect(setHtml).toHaveBeenCalledTimes(1);

        handler.markDisposed();
        await handler.handleMessage({ command: 'showInGraph', query: 'orders' } as any);

        expect(setHtml).toHaveBeenCalledTimes(1);
    });
});
