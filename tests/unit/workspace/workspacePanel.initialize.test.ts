import * as vscode from 'vscode';
import { WorkspacePanel } from '../../../src/workspace/workspacePanel';
import { WorkspaceCacheState } from '../../../src/workspace/types';

describe('WorkspacePanel initialization', () => {
    const createContext = (initializeResult: {
        autoIndexed: boolean;
        fileCount: number;
        cacheState: WorkspaceCacheState;
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
        WorkspacePanel.currentPanel = undefined;
        (vscode as any).__resetMockConfig?.();
        (vscode as any).__setMockConfig?.('sqlCrack', {
            workspaceAutoIndexThreshold: 50,
            workspaceGraphDefaultMode: 'tables',
        });
    });

    afterEach(() => {
        WorkspacePanel.currentPanel = undefined;
    });

    it('updates the index dialect when revealing an existing panel for the same scope', async () => {
        (vscode as any).ViewColumn = { Beside: 2 };
        const setDialect = jest.fn();
        const reveal = jest.fn();
        WorkspacePanel.currentPanel = {
            _scopeUri: undefined,
            _dialect: 'MySQL',
            _indexManager: { setDialect },
            _panel: { reveal },
        } as unknown as WorkspacePanel;

        await WorkspacePanel.createOrShow(
            vscode.Uri.file('/extension'),
            {} as vscode.ExtensionContext,
            'PostgreSQL'
        );

        expect(setDialect).toHaveBeenCalledWith('PostgreSQL');
        expect(reveal).toHaveBeenCalled();
    });

    it('renders immediately for a large workspace with a valid cached index', async () => {
        const context = createContext({
            autoIndexed: false,
            fileCount: 100,
            cacheState: 'valid',
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
            cacheState: 'missing',
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

    it('shows the manual analysis page without re-prompting for an oversized cache marker', async () => {
        const context = createContext({
            autoIndexed: false,
            fileCount: 100,
            cacheState: 'oversized',
            hasValidIndex: false,
        });

        await (WorkspacePanel.prototype as any).initialize.call(context);

        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(context.setWebviewHtml).toHaveBeenLastCalledWith(
            expect.stringContaining('Start Analysis')
        );
        expect(context.buildIndexWithProgress).not.toHaveBeenCalled();
        expect(context.rebuildAndRenderGraph).not.toHaveBeenCalled();
    });
});
