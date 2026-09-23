/**
 * IndexManager lifecycle regressions from the 0.9.4 audit: watcher ignore
 * paths (M3), disposal during initialize (M9), and dialect changes without an
 * authorized index (M10).
 */

import * as vscode from 'vscode';
import { IndexManager } from '../../../src/workspace/indexManager';
import { WorkspaceScanner } from '../../../src/workspace/scanner';
import { createMockExtensionContext, __resetStorage } from '../../__mocks__/vscode';

jest.mock('vscode');
jest.mock('../../../src/workspace/scanner');

const flushPromises = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

describe('IndexManager lifecycle', () => {
    let mockScanner: jest.Mocked<WorkspaceScanner>;
    let managers: IndexManager[];
    const originalFolders = vscode.workspace.workspaceFolders;

    const createManager = (): IndexManager => {
        const manager = new IndexManager(createMockExtensionContext() as unknown as vscode.ExtensionContext, 'MySQL');
        managers.push(manager);
        return manager;
    };

    beforeEach(() => {
        __resetStorage();
        managers = [];
        mockScanner = {
            getFileCount: jest.fn().mockResolvedValue(0),
            analyzeWorkspace: jest.fn().mockResolvedValue([]),
            analyzeFile: jest.fn(),
            setDialect: jest.fn(),
            getDialect: jest.fn().mockReturnValue('MySQL'),
            findSqlFiles: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<WorkspaceScanner>;
        (WorkspaceScanner as jest.MockedClass<typeof WorkspaceScanner>).mockImplementation(() => mockScanner);
    });

    afterEach(() => {
        managers.forEach(manager => manager.dispose());
        (vscode.workspace as any).workspaceFolders = originalFolders;
    });

    describe('watcher ignore policy (M3)', () => {
        it('applies ignored folder names relative to the workspace folder', () => {
            (vscode.workspace as any).workspaceFolders = [
                { uri: vscode.Uri.file('/Users/me/build/analytics'), name: 'analytics', index: 0 },
            ];
            const shouldIndex = (fsPath: string) => (createManager() as any).shouldIndexFile(vscode.Uri.file(fsPath));

            expect(shouldIndex('/Users/me/build/analytics/queries/q.sql')).toBe(true);
            expect(shouldIndex('/Users/me/build/analytics/dist/q.sql')).toBe(false);
            expect(shouldIndex('/Users/me/build/analytics/node_modules/pkg/q.sql')).toBe(false);
            expect(shouldIndex('/Users/me/build/analytics/models/build/q.sql')).toBe(false);
        });
    });

    describe('disposal during initialize (M9)', () => {
        it('returns an idle result instead of throwing when disposed before auto-indexing', async () => {
            let resolveCount: (count: number) => void = () => undefined;
            mockScanner.getFileCount.mockReturnValue(new Promise<number>(resolve => { resolveCount = resolve; }));
            const manager = createManager();

            const pending = manager.initialize(50);
            manager.dispose();
            resolveCount(10);

            await expect(pending).resolves.toEqual(expect.objectContaining({
                autoIndexed: false,
                fileCount: 10,
                hasValidIndex: false,
            }));
            expect(mockScanner.analyzeWorkspace).not.toHaveBeenCalled();
        });
    });

    describe('dialect change without an authorized index (M10)', () => {
        it('records the dialect without starting a full scan', async () => {
            mockScanner.getFileCount.mockResolvedValue(500);
            const manager = createManager();

            const result = await manager.initialize(50);
            expect(result.hasValidIndex).toBe(false);

            manager.setDialect('PostgreSQL');
            await flushPromises();
            await flushPromises();

            expect(mockScanner.setDialect).toHaveBeenCalledWith('PostgreSQL');
            expect(mockScanner.analyzeWorkspace).not.toHaveBeenCalled();
        });

        it('still rebuilds an existing index for the new dialect', async () => {
            mockScanner.getFileCount.mockResolvedValue(3);
            const manager = createManager();
            await manager.initialize(50);
            expect(mockScanner.analyzeWorkspace).toHaveBeenCalledTimes(1);

            manager.setDialect('PostgreSQL');
            for (let i = 0; i < 5; i++) {
                await flushPromises();
            }

            expect(mockScanner.analyzeWorkspace).toHaveBeenCalledTimes(2);
        });
    });
});
