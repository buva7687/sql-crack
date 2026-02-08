import { MessageHandler } from '../../../../src/workspace/handlers/messageHandler';

function createLineageGraph() {
    return {
        nodes: new Map(),
        edges: [],
        columnEdges: [],
        getUpstream: jest.fn(),
        getDownstream: jest.fn(),
        getColumnLineage: jest.fn(),
    } as any;
}

function createContext(overrides: Record<string, unknown> = {}) {
    const postMessage = jest.fn();
    const lineageView = {
        generateLineageGraphView: jest.fn(() => '<div>lineage</div>'),
        generateColumnLineageView: jest.fn(() => '<div>column-lineage</div>'),
    };
    const columnLineageTracker = {
        getFullColumnLineage: jest.fn(() => ({ upstream: [], downstream: [] })),
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
        getLineageGraph: jest.fn(() => createLineageGraph()),
        setLineageGraph: jest.fn(),
        getLineageBuilder: jest.fn(() => null),
        setLineageBuilder: jest.fn(),
        getFlowAnalyzer: jest.fn(() => null),
        setFlowAnalyzer: jest.fn(),
        getImpactAnalyzer: jest.fn(() => null),
        setImpactAnalyzer: jest.fn(),
        getColumnLineageTracker: jest.fn(() => columnLineageTracker),
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
        rebuildAndRenderGraph: jest.fn(),
        buildLineageGraph: jest.fn().mockResolvedValue(undefined),
        handleExport: jest.fn().mockResolvedValue(undefined),
    };

    return {
        context: { ...base, ...overrides } as any,
        postMessage,
        lineageView,
        columnLineageTracker,
    };
}

describe('MessageHandler depth and column lineage routing', () => {
    it('uses tableId fallback when getColumnLineage is invoked without tableName', async () => {
        const { context, columnLineageTracker, postMessage } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'getColumnLineage',
            tableId: 'table:orders',
            columnName: 'customer_id',
        });

        expect(columnLineageTracker.getFullColumnLineage).toHaveBeenCalledWith(
            expect.any(Object),
            'orders',
            'customer_id'
        );
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'columnLineageResult',
            data: expect.objectContaining({
                tableName: 'orders',
                columnName: 'customer_id',
            }),
        }));
    });

    it('falls back to configured default depth when getLineageGraph depth is invalid', async () => {
        const { context, lineageView } = createContext({
            getDefaultLineageDepth: jest.fn(() => 9),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'getLineageGraph',
            nodeId: 'table:orders',
            depth: 0,
            direction: 'both',
        });

        expect(lineageView.generateLineageGraphView).toHaveBeenCalledWith(
            expect.any(Object),
            'table:orders',
            expect.objectContaining({ depth: 9, direction: 'both' })
        );
    });

    it('uses configured default depth for setLineageDirection rerenders', async () => {
        const { context, lineageView } = createContext({
            getDefaultLineageDepth: jest.fn(() => 11),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'setLineageDirection',
            nodeId: 'table:orders',
            direction: 'upstream',
        });

        expect(lineageView.generateLineageGraphView).toHaveBeenCalledWith(
            expect.any(Object),
            'table:orders',
            expect.objectContaining({ depth: 11, direction: 'upstream' })
        );
    });
});
