/**
 * MessageHandler Graph Mode Switch Tests
 *
 * Verifies that switching graph modes (Files/Tables/Hybrid) properly
 * clears the search filter to avoid stale/empty results.
 */

import { MessageHandler } from '../../../../src/workspace/handlers/messageHandler';

function createContext(overrides: Record<string, unknown> = {}) {
    const postMessage = jest.fn();

    const base = {
        panel: { webview: { postMessage } },
        getCurrentGraph: jest.fn(() => null),
        setCurrentGraph: jest.fn(),
        getCurrentView: jest.fn(() => 'graph'),
        setCurrentView: jest.fn(),
        getCurrentSearchFilter: jest.fn(() => ({
            query: 'users_table',
            useRegex: false,
            caseSensitive: false,
            nodeTypes: undefined
        })),
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
    };

    return { context: { ...base, ...overrides } as any, postMessage };
}

describe('MessageHandler - graph mode switching', () => {
    it('should clear search filter when switching graph modes', async () => {
        const { context } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'switchGraphMode',
            mode: 'files',
        } as any);

        // Search filter should be cleared
        expect(context.setCurrentSearchFilter).toHaveBeenCalledWith({
            query: '',
            nodeTypes: undefined,
            useRegex: false,
            caseSensitive: false
        });
    });

    it('should set graph mode and rebuild graph', async () => {
        const { context } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'switchGraphMode',
            mode: 'hybrid',
        } as any);

        expect(context.setCurrentGraphMode).toHaveBeenCalledWith('hybrid');
        expect(context.setCurrentView).toHaveBeenCalledWith('graph');
        expect(context.rebuildAndRenderGraph).toHaveBeenCalled();
    });

    it('should clear search before rebuilding graph', async () => {
        const { context } = createContext();
        const handler = new MessageHandler(context);

        const callOrder: string[] = [];
        context.setCurrentSearchFilter.mockImplementation(() => callOrder.push('clearSearch'));
        context.rebuildAndRenderGraph.mockImplementation(() => {
            callOrder.push('rebuild');
            return Promise.resolve();
        });

        await handler.handleMessage({
            command: 'switchGraphMode',
            mode: 'files',
        } as any);

        // Search must be cleared BEFORE rebuild to avoid stale filter
        expect(callOrder).toEqual(['clearSearch', 'rebuild']);
    });

    it('should default to tables mode for invalid mode value', async () => {
        const { context } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'switchGraphMode',
            mode: 'invalid_mode',
        } as any);

        expect(context.setCurrentGraphMode).toHaveBeenCalledWith('tables');
    });
});
