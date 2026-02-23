import { MessageHandler } from '../../../../src/workspace/handlers/messageHandler';

function createFlowResult(nodes: any[], depth: number) {
    return {
        nodes,
        edges: [],
        paths: [],
        depth,
    };
}

function createContext(overrides: Record<string, unknown> = {}) {
    const postMessage = jest.fn();
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
        getLineageView: jest.fn(),
        getImpactView: jest.fn(),
        getDefaultLineageDepth: jest.fn(() => 5),
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

    return { context: { ...base, ...overrides } as any, postMessage };
}

describe('MessageHandler file-node upstream/downstream aggregation', () => {
    it('aggregates upstream for all table/view/cte nodes defined in a selected file', async () => {
        const flowAnalyzer = {
            getUpstream: jest.fn((nodeId: string) => {
                if (nodeId === 'table:orders') {
                    return createFlowResult([
                        { id: 'table:customers', name: 'customers', type: 'table', filePath: '/repo/customers.sql' },
                    ], 1);
                }
                return createFlowResult([
                    { id: 'table:customers', name: 'customers', type: 'table', filePath: '/repo/customers.sql' },
                    { id: 'view:regions', name: 'regions', type: 'view', filePath: '/repo/regions.sql' },
                ], 2);
            }),
            getDownstream: jest.fn(),
        };

        const lineageGraph = {
            nodes: new Map([
                ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', filePath: '/repo/core.sql', metadata: {} }],
                ['view:daily_orders', { id: 'view:daily_orders', type: 'view', name: 'daily_orders', filePath: '/repo/core.sql', metadata: {} }],
                ['column:orders.id', { id: 'column:orders.id', type: 'column', name: 'id', parentId: 'table:orders', filePath: '/repo/core.sql', metadata: {} }],
            ]),
            edges: [],
            columnEdges: [],
            getUpstream: jest.fn(),
            getDownstream: jest.fn(),
            getColumnLineage: jest.fn(),
        };

        const { context, postMessage } = createContext({
            getFlowAnalyzer: jest.fn(() => flowAnalyzer),
            getLineageGraph: jest.fn(() => lineageGraph),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'getUpstream',
            nodeType: 'file',
            filePath: '/repo/core.sql',
            depth: 4,
        });

        expect(flowAnalyzer.getUpstream).toHaveBeenCalledTimes(2);
        expect(flowAnalyzer.getUpstream).toHaveBeenCalledWith('table:orders', { maxDepth: 4, excludeExternal: true });
        expect(flowAnalyzer.getUpstream).toHaveBeenCalledWith('view:daily_orders', { maxDepth: 4, excludeExternal: true });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'upstreamResult',
            data: expect.objectContaining({
                nodeId: '/repo/core.sql',
                depth: 2,
            }),
        }));
        const sentNodes = postMessage.mock.calls[0][0].data.nodes;
        expect(sentNodes).toHaveLength(2);
    });

    it('aggregates downstream for all table/view/cte nodes defined in a selected file', async () => {
        const flowAnalyzer = {
            getUpstream: jest.fn(),
            getDownstream: jest.fn((nodeId: string) => {
                if (nodeId === 'table:orders') {
                    return createFlowResult([
                        { id: 'table:payments', name: 'payments', type: 'table', filePath: '/repo/payments.sql' },
                    ], 1);
                }
                return createFlowResult([
                    { id: 'table:payments', name: 'payments', type: 'table', filePath: '/repo/payments.sql' },
                    { id: 'cte:ledger', name: 'ledger', type: 'cte', filePath: '/repo/ledger.sql' },
                ], 3);
            }),
        };

        const lineageGraph = {
            nodes: new Map([
                ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', filePath: '/repo/core.sql', metadata: {} }],
                ['cte:daily_orders', { id: 'cte:daily_orders', type: 'cte', name: 'daily_orders', filePath: '/repo/core.sql', metadata: {} }],
            ]),
            edges: [],
            columnEdges: [],
            getUpstream: jest.fn(),
            getDownstream: jest.fn(),
            getColumnLineage: jest.fn(),
        };

        const { context, postMessage } = createContext({
            getFlowAnalyzer: jest.fn(() => flowAnalyzer),
            getLineageGraph: jest.fn(() => lineageGraph),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'getDownstream',
            nodeType: 'file',
            filePath: '/repo/core.sql',
            depth: 6,
        });

        expect(flowAnalyzer.getDownstream).toHaveBeenCalledTimes(2);
        expect(flowAnalyzer.getDownstream).toHaveBeenCalledWith('table:orders', { maxDepth: 6, excludeExternal: true });
        expect(flowAnalyzer.getDownstream).toHaveBeenCalledWith('cte:daily_orders', { maxDepth: 6, excludeExternal: true });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'downstreamResult',
            data: expect.objectContaining({
                nodeId: '/repo/core.sql',
                depth: 3,
            }),
        }));
        const sentNodes = postMessage.mock.calls[0][0].data.nodes;
        expect(sentNodes).toHaveLength(2);
    });
});
