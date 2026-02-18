/**
 * IndexManager Unit Tests
 *
 * IndexManager is more complex than WorkspaceScanner because it:
 * 1. Maintains an in-memory index of all SQL definitions/references
 * 2. Persists the index to VSCode workspace state (like a local database)
 * 3. Watches files for changes and updates incrementally
 * 4. Provides query methods for finding definitions/references
 *
 * TESTING STRATEGY:
 * -----------------
 * We mock both vscode APIs AND the WorkspaceScanner (which IndexManager uses).
 * This lets us control exactly what "files" exist and what they "contain".
 */

import * as vscode from 'vscode';
import { IndexManager } from '../../../src/workspace/indexManager';
import { WorkspaceScanner } from '../../../src/workspace/scanner';
import { FileAnalysis, SchemaDefinition, TableReference } from '../../../src/workspace/types';
import {
    createMockExtensionContext,
    __resetStorage,
    __getWorkspaceState,
    __setMockConfig,
    __resetMockConfig,
    __getFileSystemWatcher,
    ExtensionContext
} from '../../__mocks__/vscode';

jest.mock('vscode');

// Mock WorkspaceScanner so we control what "files" are found
jest.mock('../../../src/workspace/scanner');

describe('IndexManager', () => {
    let indexManager: IndexManager;
    let mockContext: ExtensionContext;
    let mockScanner: jest.Mocked<WorkspaceScanner>;

    // Helper: Create a mock file analysis
    const createMockAnalysis = (
        filePath: string,
        definitions: Partial<SchemaDefinition>[] = [],
        references: Partial<TableReference>[] = []
    ): FileAnalysis => ({
        filePath,
        fileName: filePath.split('/').pop() || '',
        lastModified: Date.now(),
        contentHash: `hash-${filePath}`,
        definitions: definitions.map(d => ({
            name: d.name || 'unknown',
            type: d.type || 'table',
            filePath: d.filePath || filePath,
            lineNumber: d.lineNumber || 1,
            schema: d.schema,
            columns: d.columns || []
        })) as SchemaDefinition[],
        references: references.map(r => ({
            tableName: r.tableName || 'unknown',
            filePath: r.filePath || filePath,
            lineNumber: r.lineNumber || 1,
            referenceType: r.referenceType || 'select',
            schema: r.schema
        })) as TableReference[]
    });

    beforeEach(() => {
        jest.clearAllMocks();
        __resetStorage();
        __resetMockConfig();

        // Create fresh mock context (simulates extension activation)
        mockContext = createMockExtensionContext();

        // Setup scanner mock
        mockScanner = {
            getFileCount: jest.fn().mockResolvedValue(0),
            analyzeWorkspace: jest.fn().mockResolvedValue([]),
            analyzeFile: jest.fn().mockResolvedValue(createMockAnalysis('/test.sql')),
            setDialect: jest.fn(),
            getDialect: jest.fn().mockReturnValue('MySQL'),
            findSqlFiles: jest.fn().mockResolvedValue([])
        } as unknown as jest.Mocked<WorkspaceScanner>;

        // Make WorkspaceScanner constructor return our mock
        (WorkspaceScanner as jest.MockedClass<typeof WorkspaceScanner>)
            .mockImplementation(() => mockScanner);

        // Create IndexManager instance
        indexManager = new IndexManager(mockContext as vscode.ExtensionContext, 'MySQL');
    });

    afterEach(() => {
        indexManager.dispose();
    });

    // =========================================================================
    // Initialization Tests
    // =========================================================================

    describe('initialization', () => {
        it('should create index manager with default dialect', () => {
            const manager = new IndexManager(mockContext as vscode.ExtensionContext);
            expect(WorkspaceScanner).toHaveBeenCalledWith('MySQL', undefined, undefined);
            manager.dispose();
        });

        it('should create index manager with specified dialect', () => {
            const manager = new IndexManager(mockContext as vscode.ExtensionContext, 'PostgreSQL');
            expect(WorkspaceScanner).toHaveBeenCalledWith('PostgreSQL', undefined, undefined);
            manager.dispose();
        });

        it('should auto-index small workspaces', async () => {
            // Small workspace: 10 files (under default threshold of 50)
            mockScanner.getFileCount.mockResolvedValue(10);
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/file1.sql', [{ name: 'users' }])
            ]);

            const result = await indexManager.initialize();

            expect(result.autoIndexed).toBe(true);
            expect(result.fileCount).toBe(10);
            expect(mockScanner.analyzeWorkspace).toHaveBeenCalled();
        });

        it('should NOT auto-index large workspaces', async () => {
            // Large workspace: 100 files (over threshold)
            mockScanner.getFileCount.mockResolvedValue(100);

            const result = await indexManager.initialize();

            expect(result.autoIndexed).toBe(false);
            expect(result.fileCount).toBe(100);
            expect(mockScanner.analyzeWorkspace).not.toHaveBeenCalled();
        });

        it('should NOT auto-index empty workspaces', async () => {
            mockScanner.getFileCount.mockResolvedValue(0);

            const result = await indexManager.initialize();

            expect(result.autoIndexed).toBe(false);
            expect(result.fileCount).toBe(0);
        });

        it('should respect custom auto-index threshold', async () => {
            mockScanner.getFileCount.mockResolvedValue(30);
            mockScanner.analyzeWorkspace.mockResolvedValue([]);

            // Threshold of 20 means 30 files should NOT auto-index
            const result = await indexManager.initialize(20);

            expect(result.autoIndexed).toBe(false);
        });

        it('should setup file watcher on initialize', async () => {
            mockScanner.getFileCount.mockResolvedValue(5);
            mockScanner.analyzeWorkspace.mockResolvedValue([]);

            await indexManager.initialize();

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/*.sql');
        });
    });

    // =========================================================================
    // Index Building Tests
    // =========================================================================

    describe('buildIndex', () => {
        it('should build index from workspace analysis', async () => {
            const analyses = [
                createMockAnalysis('/tables.sql', [
                    { name: 'users', type: 'table' },
                    { name: 'orders', type: 'table' }
                ]),
                createMockAnalysis('/queries.sql', [], [
                    { tableName: 'users', referenceType: 'select' },
                    { tableName: 'orders', referenceType: 'select' }
                ])
            ];
            mockScanner.analyzeWorkspace.mockResolvedValue(analyses);

            const index = await indexManager.buildIndex();

            expect(index.fileCount).toBe(2);
            expect(index.definitionMap.size).toBe(2);
            expect(index.referenceMap.size).toBe(2);
        });

        it('should call progress callback during build', async () => {
            mockScanner.analyzeWorkspace.mockImplementation(async (progressCb) => {
                // Simulate scanner calling progress
                if (progressCb) {
                    progressCb(1, 3, 'file1.sql');
                    progressCb(2, 3, 'file2.sql');
                    progressCb(3, 3, 'file3.sql');
                }
                return [];
            });

            const progressCalls: Array<{ current: number; total: number; fileName: string }> = [];
            await indexManager.buildIndex((current, total, fileName) => {
                progressCalls.push({ current, total, fileName });
            });

            expect(progressCalls).toHaveLength(3);
        });

        it('should support cancellation during build', async () => {
            const token = { isCancellationRequested: false };

            mockScanner.analyzeWorkspace.mockImplementation(async (_progress, cancellation) => {
                // Simulate checking cancellation
                expect(cancellation).toBe(token);
                return [];
            });

            await indexManager.buildIndex(undefined, token);

            expect(mockScanner.analyzeWorkspace).toHaveBeenCalledWith(
                undefined,
                token
            );
        });

        it('should persist index after building', async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/test.sql', [{ name: 'users' }])
            ]);

            await indexManager.buildIndex();

            // Check that workspace state was updated
            const savedState = __getWorkspaceState();
            expect(savedState['sqlWorkspaceIndex']).toBeDefined();
        });

        it('should notify listeners after building', async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([]);

            const callback = jest.fn();
            indexManager.setOnIndexUpdated(callback);

            await indexManager.buildIndex();

            expect(callback).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // Index Query Tests
    // =========================================================================

    describe('getIndex / hasIndex', () => {
        it('should return null before building', () => {
            expect(indexManager.getIndex()).toBeNull();
            expect(indexManager.hasIndex()).toBe(false);
        });

        it('should return index after building', async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/test.sql', [{ name: 'users' }])
            ]);

            await indexManager.buildIndex();

            expect(indexManager.getIndex()).not.toBeNull();
            expect(indexManager.hasIndex()).toBe(true);
        });

        it('should return false for empty index', async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([]);

            await indexManager.buildIndex();

            // Index exists but has no files
            expect(indexManager.hasIndex()).toBe(false);
        });
    });

    // =========================================================================
    // Find Definition Tests
    // =========================================================================

    describe('findDefinition', () => {
        beforeEach(async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/schema.sql', [
                    { name: 'users', type: 'table', schema: 'public' },
                    { name: 'orders', type: 'table' },
                    { name: 'user_view', type: 'view' }
                ])
            ]);
            await indexManager.buildIndex();
        });

        it('should find definition by name', () => {
            const def = indexManager.findDefinition('orders');

            expect(def).toBeDefined();
            expect(def?.name).toBe('orders');
            expect(def?.type).toBe('table');
        });

        it('should find definition by qualified name', () => {
            const def = indexManager.findDefinition('users', 'public');

            expect(def).toBeDefined();
            expect(def?.name).toBe('users');
            expect(def?.schema).toBe('public');
        });

        it('should return undefined for non-existent table', () => {
            const def = indexManager.findDefinition('nonexistent');

            expect(def).toBeUndefined();
        });

        it('should be case-insensitive', () => {
            const def = indexManager.findDefinition('ORDERS');

            expect(def).toBeDefined();
            expect(def?.name).toBe('orders');
        });

        it('should return undefined when no index exists', () => {
            const emptyManager = new IndexManager(mockContext as vscode.ExtensionContext);
            const def = emptyManager.findDefinition('users');

            expect(def).toBeUndefined();
            emptyManager.dispose();
        });
    });

    // =========================================================================
    // Find References Tests
    // =========================================================================

    describe('findReferences', () => {
        beforeEach(async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/queries.sql', [], [
                    { tableName: 'users', referenceType: 'select', lineNumber: 10 },
                    { tableName: 'users', referenceType: 'join', lineNumber: 15 },
                    { tableName: 'orders', referenceType: 'select', lineNumber: 20 }
                ]),
                createMockAnalysis('/reports.sql', [], [
                    { tableName: 'users', referenceType: 'select', lineNumber: 5 }
                ])
            ]);
            await indexManager.buildIndex();
        });

        it('should find all references to a table', () => {
            const refs = indexManager.findReferences('users');

            expect(refs).toHaveLength(3);
            expect(refs.every(r => r.tableName === 'users')).toBe(true);
        });

        it('should return empty array for unreferenced table', () => {
            const refs = indexManager.findReferences('nonexistent');

            expect(refs).toHaveLength(0);
        });

        it('should be case-insensitive', () => {
            const refs = indexManager.findReferences('USERS');

            expect(refs).toHaveLength(3);
        });

        it('should return empty array when no index exists', () => {
            const emptyManager = new IndexManager(mockContext as vscode.ExtensionContext);
            const refs = emptyManager.findReferences('users');

            expect(refs).toHaveLength(0);
            emptyManager.dispose();
        });
    });

    // =========================================================================
    // External References Tests
    // =========================================================================

    describe('getExternalReferences', () => {
        beforeEach(async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/file.sql',
                    [{ name: 'local_table' }],  // Definition
                    [
                        { tableName: 'local_table' },   // Internal ref
                        { tableName: 'external_table' } // External ref
                    ]
                )
            ]);
            await indexManager.buildIndex();
        });

        it('should return only external references', () => {
            const refs = indexManager.getExternalReferences('/file.sql');

            expect(refs).toHaveLength(1);
            expect(refs[0].tableName).toBe('external_table');
        });

        it('should return empty for non-existent file', () => {
            const refs = indexManager.getExternalReferences('/nonexistent.sql');

            expect(refs).toHaveLength(0);
        });
    });

    // =========================================================================
    // Dependent Files Tests
    // =========================================================================

    describe('getDependentFiles', () => {
        beforeEach(async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/file1.sql', [], [{ tableName: 'users' }]),
                createMockAnalysis('/file2.sql', [], [{ tableName: 'users' }]),
                createMockAnalysis('/file3.sql', [], [{ tableName: 'orders' }])
            ]);
            await indexManager.buildIndex();
        });

        it('should return files that reference a table', () => {
            const files = indexManager.getDependentFiles('users');

            expect(files).toHaveLength(2);
            expect(files).toContain('/file1.sql');
            expect(files).toContain('/file2.sql');
        });

        it('should return empty for unreferenced table', () => {
            const files = indexManager.getDependentFiles('nonexistent');

            expect(files).toHaveLength(0);
        });
    });

    // =========================================================================
    // Table List Tests
    // =========================================================================

    describe('getDefinedTables / getReferencedTables', () => {
        beforeEach(async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/schema.sql', [
                    { name: 'users' },
                    { name: 'orders' }
                ]),
                createMockAnalysis('/queries.sql', [], [
                    { tableName: 'users' },
                    { tableName: 'external_api' }
                ])
            ]);
            await indexManager.buildIndex();
        });

        it('should return all defined table names', () => {
            const tables = indexManager.getDefinedTables();

            expect(tables).toHaveLength(2);
            expect(tables).toContain('users');
            expect(tables).toContain('orders');
        });

        it('should return all referenced table names', () => {
            const tables = indexManager.getReferencedTables();

            expect(tables).toHaveLength(2);
            expect(tables).toContain('users');
            expect(tables).toContain('external_api');
        });
    });

    // =========================================================================
    // Missing/Orphaned Definitions Tests
    // =========================================================================

    describe('getMissingDefinitions / getOrphanedDefinitions', () => {
        beforeEach(async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/schema.sql', [
                    { name: 'users' },
                    { name: 'orphaned_table' }  // Never referenced
                ]),
                createMockAnalysis('/queries.sql', [], [
                    { tableName: 'users' },
                    { tableName: 'missing_table' }  // Never defined
                ])
            ]);
            await indexManager.buildIndex();
        });

        it('should return tables that are referenced but not defined', () => {
            const missing = indexManager.getMissingDefinitions();

            expect(missing).toContain('missing_table');
            expect(missing).not.toContain('users');
        });

        it('should return tables that are defined but never referenced', () => {
            const orphaned = indexManager.getOrphanedDefinitions();

            expect(orphaned).toContain('orphaned_table');
            expect(orphaned).not.toContain('users');
        });
    });

    // =========================================================================
    // File Update Tests
    // =========================================================================

    describe('updateFile', () => {
        it('should build index if none exists', async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([]);

            await indexManager.updateFile(vscode.Uri.file('/test.sql'));

            expect(mockScanner.analyzeWorkspace).toHaveBeenCalled();
        });

        it('should update existing file in index', async () => {
            // Initial build
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/test.sql', [{ name: 'old_table' }])
            ]);
            await indexManager.buildIndex();

            // Update with new content (different hash triggers update)
            const newAnalysis = createMockAnalysis('/test.sql', [{ name: 'new_table' }]);
            newAnalysis.contentHash = 'different-hash'; // Must be different to trigger update
            mockScanner.analyzeFile.mockResolvedValue(newAnalysis);

            await indexManager.updateFile(vscode.Uri.file('/test.sql'));

            // Should have new definition
            expect(indexManager.findDefinition('new_table')).toBeDefined();
            // Old definition should be gone
            expect(indexManager.findDefinition('old_table')).toBeUndefined();
        });

        it('should skip update if content hash unchanged', async () => {
            const analysis = createMockAnalysis('/test.sql', [{ name: 'users' }]);

            mockScanner.analyzeWorkspace.mockResolvedValue([analysis]);
            await indexManager.buildIndex();

            // Same hash = no change
            mockScanner.analyzeFile.mockResolvedValue(analysis);

            const callback = jest.fn();
            indexManager.setOnIndexUpdated(callback);
            callback.mockClear(); // Clear call from buildIndex

            await indexManager.updateFile(vscode.Uri.file('/test.sql'));

            // Callback should NOT be called since nothing changed
            expect(callback).not.toHaveBeenCalled();
        });

        it('should notify listeners on update', async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/test.sql', [], [], )
            ]);
            await indexManager.buildIndex();

            // Change content hash to trigger update
            mockScanner.analyzeFile.mockResolvedValue({
                ...createMockAnalysis('/test.sql'),
                contentHash: 'new-hash'
            });

            const callback = jest.fn();
            indexManager.setOnIndexUpdated(callback);

            await indexManager.updateFile(vscode.Uri.file('/test.sql'));

            expect(callback).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // File Remove Tests
    // =========================================================================

    describe('removeFile', () => {
        beforeEach(async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/keep.sql', [{ name: 'keep_table' }]),
                createMockAnalysis('/remove.sql', [{ name: 'remove_table' }])
            ]);
            await indexManager.buildIndex();
        });

        it('should remove file from index', async () => {
            await indexManager.removeFile(vscode.Uri.file('/remove.sql'));

            expect(indexManager.findDefinition('remove_table')).toBeUndefined();
            expect(indexManager.findDefinition('keep_table')).toBeDefined();
        });

        it('should update file count', async () => {
            await indexManager.removeFile(vscode.Uri.file('/remove.sql'));

            expect(indexManager.getIndex()?.fileCount).toBe(1);
        });

        it('should notify listeners on remove', async () => {
            const callback = jest.fn();
            indexManager.setOnIndexUpdated(callback);

            await indexManager.removeFile(vscode.Uri.file('/remove.sql'));

            expect(callback).toHaveBeenCalled();
        });

        it('should handle removing non-existent file', async () => {
            // Should not throw
            await indexManager.removeFile(vscode.Uri.file('/nonexistent.sql'));

            // Index unchanged
            expect(indexManager.getIndex()?.fileCount).toBe(2);
        });

        it('should do nothing if no index exists', async () => {
            const emptyManager = new IndexManager(mockContext as vscode.ExtensionContext);

            // Should not throw
            await emptyManager.removeFile(vscode.Uri.file('/test.sql'));

            emptyManager.dispose();
        });
    });

    // =========================================================================
    // Cache Tests
    // =========================================================================

    describe('caching', () => {
        it('should load cached index on initialize', async () => {
            // Pre-populate cache
            const cachedIndex = {
                version: 4, // Must match INDEX_VERSION
                lastUpdated: Date.now(),
                fileCount: 1,
                filesArray: [['/cached.sql', createMockAnalysis('/cached.sql', [{ name: 'cached_table' }])]],
                fileHashesArray: [['/cached.sql', 'hash-123']],
                definitionArray: [['cached_table', [{ name: 'cached_table', type: 'table', filePath: '/cached.sql', lineNumber: 1, columns: [] }]]],
                referenceArray: []
            };

            // Manually set workspace state (simulating previous session)
            await mockContext.workspaceState.update('sqlWorkspaceIndex', cachedIndex);

            // Large workspace = no auto-index, should use cache
            mockScanner.getFileCount.mockResolvedValue(100);

            await indexManager.initialize();

            // Should have loaded from cache
            expect(indexManager.findDefinition('cached_table')).toBeDefined();
            expect(mockScanner.analyzeWorkspace).not.toHaveBeenCalled();
        });

        it('should ignore cache with wrong version', async () => {
            const oldCache = {
                version: 1, // Old version
                lastUpdated: Date.now(),
                fileCount: 1,
                filesArray: [],
                fileHashesArray: [],
                definitionArray: [],
                referenceArray: []
            };

            await mockContext.workspaceState.update('sqlWorkspaceIndex', oldCache);
            mockScanner.getFileCount.mockResolvedValue(5);
            mockScanner.analyzeWorkspace.mockResolvedValue([]);

            await indexManager.initialize();

            // Should rebuild, not use old cache
            expect(mockScanner.analyzeWorkspace).toHaveBeenCalled();
        });

        it('should ignore expired cache', async () => {
            const expiredCache = {
                version: 4,
                lastUpdated: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago (default TTL is 24h)
                fileCount: 1,
                filesArray: [],
                fileHashesArray: [],
                definitionArray: [],
                referenceArray: []
            };

            await mockContext.workspaceState.update('sqlWorkspaceIndex', expiredCache);
            mockScanner.getFileCount.mockResolvedValue(5);
            mockScanner.analyzeWorkspace.mockResolvedValue([]);

            await indexManager.initialize();

            expect(mockScanner.analyzeWorkspace).toHaveBeenCalled();
        });

        it('should respect clearCacheOnStartup setting', async () => {
            __setMockConfig('sqlCrack.advanced', {
                clearCacheOnStartup: true
            });

            const cache = {
                version: 4,
                lastUpdated: Date.now(),
                fileCount: 1,
                filesArray: [],
                fileHashesArray: [],
                definitionArray: [],
                referenceArray: []
            };

            await mockContext.workspaceState.update('sqlWorkspaceIndex', cache);
            mockScanner.getFileCount.mockResolvedValue(5);
            mockScanner.analyzeWorkspace.mockResolvedValue([]);

            await indexManager.initialize();

            expect(mockScanner.analyzeWorkspace).toHaveBeenCalled();
        });

        it('should disable caching when TTL is 0', async () => {
            __setMockConfig('sqlCrack.advanced', {
                cacheTTLHours: 0
            });

            const cache = {
                version: 4,
                lastUpdated: Date.now(),
                fileCount: 1,
                filesArray: [],
                fileHashesArray: [],
                definitionArray: [],
                referenceArray: []
            };

            await mockContext.workspaceState.update('sqlWorkspaceIndex', cache);
            mockScanner.getFileCount.mockResolvedValue(5);
            mockScanner.analyzeWorkspace.mockResolvedValue([]);

            await indexManager.initialize();

            expect(mockScanner.analyzeWorkspace).toHaveBeenCalled();
        });

        it('should clear cache manually', async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/test.sql', [{ name: 'users' }])
            ]);
            await indexManager.buildIndex();

            expect(indexManager.hasIndex()).toBe(true);

            await indexManager.clearCache();

            expect(indexManager.getIndex()).toBeNull();
            expect(__getWorkspaceState()['sqlWorkspaceIndex']).toBeUndefined();
        });
    });

    // =========================================================================
    // File Watcher Tests
    // =========================================================================

    describe('file watcher', () => {
        beforeEach(async () => {
            mockScanner.getFileCount.mockResolvedValue(5);
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/test.sql', [{ name: 'users' }])
            ]);
            await indexManager.initialize();
        });

        it('should trigger update on file change', async () => {
            const watcher = __getFileSystemWatcher();
            expect(watcher).not.toBeNull();

            mockScanner.analyzeFile.mockResolvedValue({
                ...createMockAnalysis('/test.sql', [{ name: 'updated_users' }]),
                contentHash: 'new-hash'
            });

            // Simulate file change
            watcher?.__triggerChange(vscode.Uri.file('/test.sql'));

            // Wait for debounce (1 second in implementation)
            await new Promise(resolve => setTimeout(resolve, 1100));

            expect(mockScanner.analyzeFile).toHaveBeenCalled();
        });

        it('should trigger update on file create', async () => {
            const watcher = __getFileSystemWatcher();

            mockScanner.analyzeFile.mockResolvedValue(
                createMockAnalysis('/new.sql', [{ name: 'new_table' }])
            );

            watcher?.__triggerCreate(vscode.Uri.file('/new.sql'));

            await new Promise(resolve => setTimeout(resolve, 1100));

            expect(mockScanner.analyzeFile).toHaveBeenCalled();
        });

        it('should remove file on delete', async () => {
            const watcher = __getFileSystemWatcher();

            // Add another file first
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/test.sql', [{ name: 'users' }]),
                createMockAnalysis('/delete.sql', [{ name: 'delete_table' }])
            ]);
            await indexManager.buildIndex();

            expect(indexManager.findDefinition('delete_table')).toBeDefined();

            // Simulate file deletion
            watcher?.__triggerDelete(vscode.Uri.file('/delete.sql'));

            // Delete is not debounced
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(indexManager.findDefinition('delete_table')).toBeUndefined();
        });

        it('should ignore updates from excluded directories', async () => {
            const watcher = __getFileSystemWatcher();

            watcher?.__triggerChange(vscode.Uri.file('/workspace/node_modules/ignored.sql'));
            watcher?.__triggerCreate(vscode.Uri.file('/workspace/dist/generated.sql'));

            await new Promise(resolve => setTimeout(resolve, 1100));

            expect(mockScanner.analyzeFile).not.toHaveBeenCalled();
        });

        it('should ignore deletes from excluded directories', async () => {
            const watcher = __getFileSystemWatcher();
            const removeSpy = jest.spyOn(indexManager, 'removeFile');

            watcher?.__triggerDelete(vscode.Uri.file('/workspace/.git/ignored.sql'));
            watcher?.__triggerDelete(vscode.Uri.file('/workspace/build/output.sql'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(removeSpy).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // Dialect Tests
    // =========================================================================

    describe('setDialect', () => {
        it('should no-op when dialect is unchanged', async () => {
            const buildSpy = jest.spyOn(indexManager, 'buildIndex');

            indexManager.setDialect('MySQL');
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockScanner.setDialect).not.toHaveBeenCalled();
            expect(buildSpy).not.toHaveBeenCalled();
        });

        it('should update scanner dialect', () => {
            indexManager.setDialect('PostgreSQL');

            expect(mockScanner.setDialect).toHaveBeenCalledWith('PostgreSQL');
        });

        it('should clear and rebuild index when dialect changes', async () => {
            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/users.sql', [{ name: 'users' }]),
            ]);
            await indexManager.buildIndex();
            expect(indexManager.findDefinition('users')).toBeDefined();

            mockScanner.analyzeWorkspace.mockResolvedValue([
                createMockAnalysis('/orders.sql', [{ name: 'orders' }]),
            ]);

            const clearSpy = jest.spyOn(indexManager, 'clearCache');
            const buildSpy = jest.spyOn(indexManager, 'buildIndex');

            indexManager.setDialect('PostgreSQL');
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(mockScanner.setDialect).toHaveBeenCalledWith('PostgreSQL');
            expect(clearSpy).toHaveBeenCalled();
            expect(buildSpy).toHaveBeenCalled();
            expect(indexManager.findDefinition('users')).toBeUndefined();
            expect(indexManager.findDefinition('orders')).toBeDefined();
        });
    });

    // =========================================================================
    // Dispose Tests
    // =========================================================================

    describe('dispose', () => {
        it('should dispose file watcher', async () => {
            mockScanner.getFileCount.mockResolvedValue(5);
            mockScanner.analyzeWorkspace.mockResolvedValue([]);
            await indexManager.initialize();

            const watcher = __getFileSystemWatcher();

            indexManager.dispose();

            expect(watcher?.dispose).toHaveBeenCalled();
        });

        it('should handle dispose without initialization', () => {
            // Should not throw
            indexManager.dispose();
        });
    });
});
