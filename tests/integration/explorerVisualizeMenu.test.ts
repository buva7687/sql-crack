/**
 * The Explorer "Visualize SQL Query" item must follow the clicked file, not the
 * active editor, and the command must not visualize a non-SQL file it is
 * handed through that menu.
 */

jest.mock('vscode');
jest.mock('../../src/diagnosticsClient', () => ({
    DiagnosticsClient: jest.fn().mockImplementation(() => ({
        analyze: jest.fn(), cancel: jest.fn(), cancelAll: jest.fn(), dispose: jest.fn(),
    })),
}));
jest.mock('../../src/visualizationPanel', () => ({
    VisualizationPanel: {
        setContext: jest.fn(),
        setActiveEditorActivity: jest.fn(),
        currentPanel: null,
        sourceDocumentUri: null,
        getPinnedTabs: jest.fn().mockReturnValue([]),
        createOrShow: jest.fn(),
    },
}));
jest.mock('../../src/workspace', () => ({
    WorkspacePanel: { createOrShow: jest.fn().mockResolvedValue(undefined), currentPanel: null },
}));
jest.mock('../../src/logger', () => ({
    logger: { initialize: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), show: jest.fn() },
}));

import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { join } from 'path';
import { activate, deactivate, getExplorerMenuExtensions } from '../../src/extension';
import { VisualizationPanel } from '../../src/visualizationPanel';

describe('Explorer visualize menu', () => {
    const mockVscode = require('vscode');
    let context: vscode.ExtensionContext;

    const visualizeHandler = (): ((uri?: vscode.Uri) => Promise<void>) => {
        const call = (vscode.commands.registerCommand as jest.Mock).mock.calls
            .find((entry: unknown[]) => entry[0] === 'sql-crack.visualize');
        return call[1];
    };

    const openAs = (fileName: string, languageId: string, text = 'SELECT id FROM customers') => {
        (vscode.workspace.openTextDocument as jest.Mock).mockImplementationOnce((uri: vscode.Uri) => Promise.resolve({
            getText: () => text, uri, fileName, languageId, version: 1, isClosed: false,
        }));
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockVscode.__resetMockConfig();
        mockVscode.__setMockConfig('sqlCrack', { additionalFileExtensions: ['hql', 'sql.j2'] });
        context = mockVscode.createMockExtensionContext();
        activate(context);
    });

    afterEach(() => deactivate());

    it('matches the clicked file extension in the manifest rather than an active-editor flag', () => {
        const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
        const entry = pkg.contributes.menus['explorer/context']
            .find((item: { command: string }) => item.command === 'sql-crack.visualize');
        expect(entry.when).toBe('resourceExtname == .sql || resourceExtname == .SQL || resourceExtname in sqlCrack.additionalExtensions');
        expect(entry.when).not.toContain('sqlCrack.isAdditionalSqlFile');
    });

    it('publishes the configured extensions, in both cases, for the Explorer menu', () => {
        const call = (vscode.commands.executeCommand as jest.Mock).mock.calls
            .find((entry: unknown[]) => entry[0] === 'setContext' && entry[1] === 'sqlCrack.additionalExtensions');
        expect(call?.[2]).toEqual(expect.arrayContaining(['.hql', '.HQL', '.j2', '.J2']));
        expect(getExplorerMenuExtensions(['.ddl', '.sql.j2'])).toEqual(['.ddl', '.DDL', '.j2', '.J2']);
    });

    it('visualizes a configured extension clicked in the Explorer', async () => {
        openAs('/repo/report.HQL', 'plaintext');
        await visualizeHandler()(vscode.Uri.file('/repo/report.HQL'));
        expect(VisualizationPanel.createOrShow).toHaveBeenCalledTimes(1);
    });

    it('refuses a file that only shares the last part of a compound extension', async () => {
        openAs('/repo/page.html.j2', 'jinja');
        await visualizeHandler()(vscode.Uri.file('/repo/page.html.j2'));
        expect(VisualizationPanel.createOrShow).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('page.html.j2 is not a SQL file'));
    });

    it('still visualizes the full compound extension', async () => {
        openAs('/repo/model.sql.j2', 'jinja-sql');
        await visualizeHandler()(vscode.Uri.file('/repo/model.sql.j2'));
        expect(VisualizationPanel.createOrShow).toHaveBeenCalledTimes(1);
    });
});
