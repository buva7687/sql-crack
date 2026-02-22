import * as vscode from 'vscode';
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
    beforeEach(() => {
        jest.clearAllMocks();
    });

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

    it('resolves workspace graph node ids to lineage ids for getLineageGraph when node metadata is provided', async () => {
        const lineageGraph = {
            nodes: new Map([
                ['table:customer_summary_2024', { id: 'table:customer_summary_2024', type: 'table', name: 'customer_summary_2024', metadata: {} }],
            ]),
            edges: [],
            columnEdges: [],
            getUpstream: jest.fn(),
            getDownstream: jest.fn(),
            getColumnLineage: jest.fn(),
        };
        const { context, lineageView, postMessage } = createContext({
            getLineageGraph: jest.fn(() => lineageGraph),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'getLineageGraph',
            nodeId: 'table_0',
            nodeLabel: 'customer_summary_2024',
            nodeType: 'table',
            depth: 5,
            direction: 'both',
        } as any);

        expect(lineageView.generateLineageGraphView).toHaveBeenCalledWith(
            lineageGraph,
            'table:customer_summary_2024',
            expect.objectContaining({ depth: 5, direction: 'both' })
        );
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'lineageGraphResult',
            data: expect.objectContaining({
                nodeId: 'table:customer_summary_2024',
            }),
        }));
    });

    it('resolves external workspace ids using unqualified labels against qualified lineage node names', async () => {
        const lineageGraph = {
            nodes: new Map([
                ['external:raw.carriers', { id: 'external:raw.carriers', type: 'external', name: 'raw.carriers', metadata: {} }],
            ]),
            edges: [],
            columnEdges: [],
            getUpstream: jest.fn(),
            getDownstream: jest.fn(),
            getColumnLineage: jest.fn(),
        };
        const { context, lineageView, postMessage } = createContext({
            getLineageGraph: jest.fn(() => lineageGraph),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'getLineageGraph',
            nodeId: 'external_90',
            nodeLabel: 'carriers',
            nodeType: 'external',
            depth: 5,
            direction: 'both',
        } as any);

        expect(lineageView.generateLineageGraphView).toHaveBeenCalledWith(
            lineageGraph,
            'external:raw.carriers',
            expect.objectContaining({ depth: 5, direction: 'both' })
        );
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'lineageGraphResult',
            data: expect.objectContaining({
                nodeId: 'external:raw.carriers',
            }),
        }));
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

    it('excludes external nodes when requesting lineage traversal', async () => {
        const flowAnalyzer = {
            getUpstream: jest.fn(() => ({ nodes: [], edges: [], paths: [], depth: 0 })),
            getDownstream: jest.fn(() => ({ nodes: [], edges: [], paths: [], depth: 0 })),
        };
        const { context } = createContext({
            getFlowAnalyzer: jest.fn(() => flowAnalyzer),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'getLineage',
            nodeId: 'table:orders',
            direction: 'both',
            depth: 4,
        });

        expect(flowAnalyzer.getUpstream).toHaveBeenCalledWith('table:orders', { maxDepth: 4, excludeExternal: true });
        expect(flowAnalyzer.getDownstream).toHaveBeenCalledWith('table:orders', { maxDepth: 4, excludeExternal: true });
    });

    it('sends a warning when selecting a column for a table missing from lineage index', async () => {
        const columnLineageTracker = {
            getFullColumnLineage: jest.fn(() => ({ upstream: [], downstream: [] })),
        };
        const { context, postMessage } = createContext({
            getColumnLineageTracker: jest.fn(() => columnLineageTracker),
            getLineageGraph: jest.fn(() => ({
                nodes: new Map([
                    ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', metadata: {} }],
                ]),
                edges: [],
                columnEdges: [],
                getUpstream: jest.fn(),
                getDownstream: jest.fn(),
                getColumnLineage: jest.fn(),
            })),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'selectColumn',
            tableId: 'table:missing_orders',
            columnName: 'customer_id',
        });

        expect(columnLineageTracker.getFullColumnLineage).not.toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'columnLineageResult',
            data: expect.objectContaining({
                tableId: 'table:missing_orders',
                columnName: 'customer_id',
                warning: expect.stringContaining('not available in the lineage index yet'),
            }),
        }));
    });

    it('filters external nodes out of lineage table search results', async () => {
        const { context, postMessage } = createContext({
            getLineageGraph: jest.fn(() => ({
                nodes: new Map([
                    ['table:customers', { id: 'table:customers', type: 'table', name: 'customers', metadata: {} }],
                    ['external:customers_raw', { id: 'external:customers_raw', type: 'external', name: 'customers_raw', metadata: {} }],
                    ['column:customers.id', { id: 'column:customers.id', type: 'column', name: 'id', metadata: {} }],
                ]),
                edges: [],
                columnEdges: [],
                getUpstream: jest.fn(),
                getDownstream: jest.fn(),
                getColumnLineage: jest.fn(),
            })),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'searchLineageTables',
            query: 'customer',
            typeFilter: 'all',
        });

        expect(postMessage).toHaveBeenCalledWith({
            command: 'lineageSearchResults',
            data: {
                results: [{
                    id: 'table:customers',
                    name: 'customers',
                    type: 'table',
                    filePath: undefined,
                }]
            }
        });
    });

    it('routes lineage legend visibility changes to panel state setter', async () => {
        const { context } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'setLineageLegendVisibility',
            visible: false,
        });

        expect(context.setLineageLegendVisible).toHaveBeenCalledWith(false);
    });

    it('treats view impact requests as table-like analysis (not column analysis)', async () => {
        const report = {
            changeType: 'modify',
            target: { type: 'view', name: 'customer_view' },
            severity: 'low',
            summary: { totalAffected: 0, tablesAffected: 0, viewsAffected: 0, queriesAffected: 0, filesAffected: 0 },
            directImpacts: [],
            transitiveImpacts: [],
            suggestions: [],
        };
        const impactAnalyzer = {
            analyzeTableChange: jest.fn(() => report),
            analyzeColumnChange: jest.fn(),
        };
        const { context, postMessage } = createContext({
            getImpactAnalyzer: jest.fn(() => impactAnalyzer),
            buildLineageGraph: jest.fn().mockResolvedValue(undefined),
            getImpactView: jest.fn(() => ({
                generateImpactReport: jest.fn(() => '<div>impact</div>'),
            })),
        });
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'analyzeImpact',
            type: 'view',
            name: 'customer_view',
            changeType: 'modify',
        } as any);

        expect(impactAnalyzer.analyzeTableChange).toHaveBeenCalledWith('customer_view', 'modify');
        expect(impactAnalyzer.analyzeColumnChange).not.toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            command: 'impactResult',
            data: expect.objectContaining({
                report: expect.objectContaining({
                    target: expect.objectContaining({ type: 'view', name: 'customer_view' }),
                }),
            }),
        }));
    });

    it('exports empty lineage payload when workspace node is missing from lineage graph', async () => {
        const flowAnalyzer = {
            getUpstream: jest.fn(() => ({ nodes: [], edges: [], paths: [], depth: 0 })),
            getDownstream: jest.fn(() => ({ nodes: [], edges: [], paths: [], depth: 0 })),
        };
        const { context } = createContext({
            getFlowAnalyzer: jest.fn(() => flowAnalyzer),
            getLineageGraph: jest.fn(() => ({
                nodes: new Map([
                    ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', metadata: {} }],
                ]),
                edges: [],
                columnEdges: [],
                getUpstream: jest.fn(),
                getDownstream: jest.fn(),
                getColumnLineage: jest.fn(),
            })),
        });

        (vscode.window as any).showSaveDialog = jest.fn().mockResolvedValue(vscode.Uri.file('/tmp/lineage-so-order-date.json'));
        const writeFileSpy = vscode.workspace.fs.writeFile as jest.Mock;

        const handler = new MessageHandler(context);
        await handler.handleMessage({
            command: 'exportNodeLineage',
            nodeId: 'external_42',
            nodeLabel: 'so.order_date',
            nodeType: 'external',
        } as any);

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalledWith(
            expect.stringContaining('not found in lineage graph')
        );
        expect((vscode.window as any).showSaveDialog).toHaveBeenCalled();
        expect(writeFileSpy).toHaveBeenCalled();
        expect(flowAnalyzer.getUpstream).not.toHaveBeenCalled();
        expect(flowAnalyzer.getDownstream).not.toHaveBeenCalled();

        const savedPayload = JSON.parse(Buffer.from(writeFileSpy.mock.calls[0][1]).toString('utf8'));
        expect(savedPayload.node.name).toBe('so.order_date');
        expect(savedPayload.node.lineageNodeId).toBeNull();
        expect(savedPayload.summary.upstreamCount).toBe(0);
        expect(savedPayload.summary.downstreamCount).toBe(0);
        expect(savedPayload.summary.lineageNodeResolved).toBe(false);
    });
});
