import * as vscode from 'vscode';
import { WorkspacePanel } from '../../../src/workspace/workspacePanel';

describe('WorkspacePanel initialization', () => {
    const createContext = (initializeResult: {
        autoIndexed: boolean;
        fileCount: number;
        hasValidIndex: boolean;
    }) => ({
        _isDisposed: false,
        _isDarkTheme: true,
        _currentGraphMode: 'tables',
        _indexManager: {
            initialize: jest.fn().mockResolvedValue(initializeResult),
        },
        setWebviewHtml: jest.fn(),
        buildIndexWithProgress: jest.fn().mockResolvedValue(undefined),
        rebuildAndRenderGraph: jest.fn().mockResolvedValue(undefined),
    });

    beforeEach(() => {
        jest.clearAllMocks();
        (vscode as any).__resetMockConfig?.();
        (vscode as any).__setMockConfig?.('sqlCrack', {
            workspaceAutoIndexThreshold: 50,
            workspaceGraphDefaultMode: 'tables',
        });
    });

    it('renders immediately for a large workspace with a valid cached index', async () => {
        const context = createContext({
            autoIndexed: false,
            fileCount: 100,
            hasValidIndex: true,
        });

        await (WorkspacePanel.prototype as any).initialize.call(context);

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(context.buildIndexWithProgress).not.toHaveBeenCalled();
        expect(context.rebuildAndRenderGraph).toHaveBeenCalledTimes(1);
    });

    it('prompts for a large workspace when no valid index is available', async () => {
        const context = createContext({
            autoIndexed: false,
            fileCount: 100,
            hasValidIndex: false,
        });

        await (WorkspacePanel.prototype as any).initialize.call(context);

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Found 100 SQL files in workspace. Index them now?',
            'Index Now',
            'Cancel'
        );
        expect(context.buildIndexWithProgress).not.toHaveBeenCalled();
        expect(context.rebuildAndRenderGraph).not.toHaveBeenCalled();
    });
});
