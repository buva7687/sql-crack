import * as vscode from 'vscode';
import { MessageHandler } from '../../../../src/workspace/handlers/messageHandler';

function createContext() {
    const postMessage = jest.fn();
    return {
        context: {
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
        } as any,
        postMessage
    };
}

describe('MessageHandler file path safety', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace as any).workspaceFolders = [
            { uri: vscode.Uri.file('/repo'), name: 'repo', index: 0 }
        ];
    });

    afterEach(() => {
        (vscode.workspace as any).workspaceFolders = undefined;
    });

    it('blocks openFile for paths outside workspace', async () => {
        const { context } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'openFile',
            filePath: '/etc/passwd'
        } as any);

        expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Blocked opening file outside workspace.');
    });

    it('allows openFile for paths inside workspace', async () => {
        const { context } = createContext();
        const handler = new MessageHandler(context);

        await handler.handleMessage({
            command: 'openFile',
            filePath: '/repo/queries/orders.sql'
        } as any);

        expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(vscode.Uri.file('/repo/queries/orders.sql'));
    });
});
