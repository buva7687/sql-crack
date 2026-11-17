jest.mock('../../../src/workspace/analysisClient', () => require('../../__mocks__/workspaceAnalysisClient'));

import * as vscode from 'vscode';
import { IndexManager } from '../../../src/workspace/indexManager';
import { WorkspaceAnalysisClient, WorkspaceAnalysisError } from '../../../src/workspace/analysisClient';
import {
    createMockExtensionContext, __resetStorage, __resetMockConfig, __setMockConfig,
    __getFileSystemWatcher, __resetFileSystemWatcherMock, Uri,
} from '../../__mocks__/vscode';

const alpha = Uri.file('/audit-old/alpha.sql');
const beta = Uri.file('/audit-new/beta.sql');
const hql = Uri.file('/audit-old/model.hql');

describe('workspace host index audit regressions', () => {
    const managers: IndexManager[] = [];
    let files: Map<string, Uint8Array>;
    let enumerated: Uri[];

    const createManager = () => {
        const manager = new IndexManager(createMockExtensionContext() as unknown as vscode.ExtensionContext, 'PostgreSQL');
        managers.push(manager);
        return manager;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        __resetStorage();
        __resetMockConfig();
        __resetFileSystemWatcherMock();
        files = new Map([
            [alpha.fsPath, Buffer.from('CREATE TABLE alpha (id int)')],
            [beta.fsPath, Buffer.from('CREATE TABLE beta (id int)')],
            [hql.fsPath, Buffer.from('CREATE TABLE model (id int)')],
        ]);
        enumerated = [alpha];
        (vscode.workspace.findFiles as jest.Mock).mockImplementation(async () => enumerated);
        (vscode.workspace.fs.stat as jest.Mock).mockImplementation(async (uri: Uri) => ({
            type: 1, size: files.get(uri.fsPath)!.length, mtime: 1, ctime: 1,
        }));
        (vscode.workspace.fs.readFile as jest.Mock).mockImplementation(async (uri: Uri) => files.get(uri.fsPath)!);
    });

    afterEach(() => {
        managers.splice(0).forEach(manager => manager.dispose());
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    it('rebuilds when the enumerated file set changes but its count stays the same', async () => {
        await createManager().initialize();
        enumerated = [beta];
        const reopened = createManager();

        await expect(reopened.initialize()).resolves.toMatchObject({ cacheState: 'stale', fileCount: 1 });
        expect([...reopened.getIndex()!.files.keys()]).toEqual([beta.fsPath]);
    });

    it('replaces a timeout when identical contents parse successfully on retry', async () => {
        jest.spyOn(WorkspaceAnalysisClient.prototype, 'analyze')
            .mockRejectedValueOnce(new WorkspaceAnalysisError('Analysis timed out'));
        const manager = createManager();
        await manager.initialize();
        const before = manager.getIndex()!.files.get(alpha.fsPath)!;
        expect(before.parseError).toBe('Analysis timed out');

        await manager.updateFile(alpha as unknown as vscode.Uri);

        const after = manager.getIndex()!.files.get(alpha.fsPath)!;
        expect(after.contentHash).toBe(before.contentHash);
        expect(after.parseError).toBeUndefined();
        expect(after.definitions.map(definition => definition.name)).toEqual(['alpha']);
    });

    it('discards queued changes for extensions removed before the debounce fires', async () => {
        jest.useFakeTimers();
        __setMockConfig('sqlCrack', { additionalFileExtensions: ['hql'] });
        enumerated = [alpha, hql];
        const manager = createManager();
        await manager.initialize();
        __getFileSystemWatcher()!.__triggerChange(hql);
        __setMockConfig('sqlCrack', { additionalFileExtensions: [] });
        enumerated = [alpha];
        const configChanged = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0];
        configChanged({ affectsConfiguration: (key: string) => key === 'sqlCrack.additionalFileExtensions' });
        await manager.buildIndex();
        __getFileSystemWatcher()!.__triggerChange(alpha);
        await jest.advanceTimersByTimeAsync(1000);

        expect([...manager.getIndex()!.files.keys()]).toEqual([alpha.fsPath]);
    });

    it('rejects an oversized cached file before reading its bytes', async () => {
        await createManager().initialize();
        files.set(alpha.fsPath, Buffer.alloc(11 * 1024 * 1024, ' '));
        const readFile = vscode.workspace.fs.readFile as jest.Mock;
        readFile.mockClear();
        const reopened = createManager();

        await expect(reopened.initialize()).resolves.toMatchObject({ cacheState: 'stale' });
        expect(reopened.getIndex()!.files.get(alpha.fsPath)?.skippedReason).toBe('tooLarge');
        expect(readFile).not.toHaveBeenCalled();
    });
});
