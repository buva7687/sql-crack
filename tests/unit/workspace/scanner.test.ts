/**
 * WorkspaceScanner Unit Tests
 *
 * MOCK TESTING PRIMER (for backend devs):
 * =======================================
 *
 * In backend testing, you often mock databases, HTTP clients, etc.
 * Frontend/extension testing is similar - we mock the VS Code APIs.
 *
 * KEY CONCEPTS:
 * 1. jest.fn() - Creates a spy function that tracks calls
 * 2. mockResolvedValue() - Sets what an async mock returns
 * 3. mockImplementation() - Custom logic for what mock does
 * 4. beforeEach() - Reset mocks before each test for isolation
 *
 * THE MOCK FLOW:
 * scanner.ts: import * as vscode from 'vscode'
 *                          ↓
 * Jest intercepts and loads: tests/__mocks__/vscode.ts
 *                          ↓
 * Your test controls what vscode APIs return
 */

import * as vscode from 'vscode';
import { WorkspaceScanner } from '../../../src/workspace/scanner';
import {
    __setMockConfig,
    __resetMockConfig
} from '../../__mocks__/vscode';

// Tell Jest to use our mock (auto-detected from __mocks__ folder)
jest.mock('vscode');

describe('WorkspaceScanner', () => {
    let scanner: WorkspaceScanner;

    beforeEach(() => {
        // IMPORTANT: Reset all mocks before each test
        // This ensures test isolation - one test can't affect another
        jest.clearAllMocks();
        __resetMockConfig();

        // Create fresh scanner instance
        scanner = new WorkspaceScanner('MySQL');
    });

    // =========================================================================
    // Basic Tests - Scanner Initialization
    // =========================================================================

    describe('initialization', () => {
        it('should create scanner with default dialect', () => {
            const defaultScanner = new WorkspaceScanner();
            expect(defaultScanner.getDialect()).toBe('MySQL');
        });

        it('should create scanner with specified dialect', () => {
            const pgScanner = new WorkspaceScanner('PostgreSQL');
            expect(pgScanner.getDialect()).toBe('PostgreSQL');
        });

        it('should allow changing dialect', () => {
            scanner.setDialect('PostgreSQL');
            expect(scanner.getDialect()).toBe('PostgreSQL');
        });
    });

    // =========================================================================
    // findSqlFiles Tests - File Discovery
    // =========================================================================

    describe('findSqlFiles', () => {
        it('should find SQL files in workspace', async () => {
            // SETUP: Tell the mock what to return
            // This is like mocking a database query result in backend tests
            const mockFiles = [
                vscode.Uri.file('/workspace/queries/select.sql'),
                vscode.Uri.file('/workspace/migrations/001_create_users.sql'),
                vscode.Uri.file('/workspace/views/user_summary.sql')
            ];

            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);

            // ACT: Call the method under test
            const files = await scanner.findSqlFiles();

            // ASSERT: Verify results
            expect(files).toHaveLength(3);
            expect(files[0].fsPath).toBe('/workspace/queries/select.sql');

            // VERIFY: Check that findFiles was called with correct pattern
            expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
                '**/*.sql',
                '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**}'
            );
        });

        it('should return empty array when no SQL files exist', async () => {
            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

            const files = await scanner.findSqlFiles();

            expect(files).toHaveLength(0);
        });

        it('should include additional file extensions from config', async () => {
            // SETUP: Configure additional extensions via mock
            __setMockConfig('sqlCrack', {
                additionalFileExtensions: ['hql', 'bteq']
            });

            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

            // ACT
            await scanner.findSqlFiles();

            // ASSERT: Pattern should include all extensions
            expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
                '**/*.{sql,hql,bteq}',
                expect.any(String)
            );
        });

        it('should normalize extensions (remove dots, lowercase)', async () => {
            __setMockConfig('sqlCrack', {
                additionalFileExtensions: ['.HQL', 'BTEQ', '.pls']
            });

            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

            await scanner.findSqlFiles();

            // Extensions should be normalized: .HQL -> hql, BTEQ -> bteq
            expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
                '**/*.{sql,hql,bteq,pls}',
                expect.any(String)
            );
        });
    });

    // =========================================================================
    // getFileCount Tests
    // =========================================================================

    describe('getFileCount', () => {
        it('should return count of SQL files', async () => {
            const mockFiles = [
                vscode.Uri.file('/a.sql'),
                vscode.Uri.file('/b.sql'),
                vscode.Uri.file('/c.sql')
            ];
            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);

            const count = await scanner.getFileCount();

            expect(count).toBe(3);
        });

        it('should return 0 for empty workspace', async () => {
            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

            const count = await scanner.getFileCount();

            expect(count).toBe(0);
        });
    });

    // =========================================================================
    // analyzeFile Tests - Single File Analysis
    // =========================================================================

    describe('analyzeFile', () => {
        const testUri = vscode.Uri.file('/workspace/test.sql');

        it('should analyze a simple SQL file', async () => {
            // SETUP: Mock file stat (metadata)
            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                ctime: Date.now(),
                mtime: 1704067200000, // Fixed timestamp for testing
                size: 500
            });

            // SETUP: Mock file content
            // mockImplementation lets us return different values based on input
            (vscode.workspace.openTextDocument as jest.Mock).mockImplementation((uri: vscode.Uri) => {
                return Promise.resolve({
                    getText: () => `
                        CREATE TABLE users (
                            id INT PRIMARY KEY,
                            name VARCHAR(100)
                        );

                        SELECT * FROM users WHERE id = 1;
                    `,
                    uri: uri,
                    fileName: uri.fsPath
                });
            });

            // ACT
            const result = await scanner.analyzeFile(testUri);

            // ASSERT
            expect(result.filePath).toBe('/workspace/test.sql');
            expect(result.fileName).toBe('test.sql');
            expect(result.lastModified).toBe(1704067200000);
            expect(result.contentHash).toBeTruthy(); // SHA-256 hash generated
            expect(result.parseError).toBeUndefined();

            // Should find CREATE TABLE definition
            expect(result.definitions.length).toBeGreaterThan(0);
            const tableDef = result.definitions.find(d => d.name.toLowerCase() === 'users');
            expect(tableDef).toBeDefined();
            expect(tableDef?.type).toBe('table');

            // Should find SELECT reference
            expect(result.references.length).toBeGreaterThan(0);
        });

        it('should handle file too large', async () => {
            // SETUP: File larger than default 10MB limit
            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                ctime: Date.now(),
                mtime: Date.now(),
                size: 15 * 1024 * 1024 // 15MB
            });

            // ACT
            const result = await scanner.analyzeFile(testUri);

            // ASSERT: Should return error, not throw
            expect(result.parseError).toContain('File too large');
            expect(result.definitions).toHaveLength(0);
            expect(result.references).toHaveLength(0);
        });

        it('should handle file read errors gracefully', async () => {
            // SETUP: Simulate file read error
            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                mtime: Date.now(),
                size: 100
            });

            (vscode.workspace.openTextDocument as jest.Mock).mockRejectedValue(
                new Error('Permission denied')
            );

            // ACT
            const result = await scanner.analyzeFile(testUri);

            // ASSERT: Should capture error gracefully
            expect(result.parseError).toBe('Permission denied');
            expect(result.definitions).toHaveLength(0);
        });

        it('should generate consistent content hash', async () => {
            const sqlContent = 'SELECT * FROM users;';

            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                mtime: Date.now(),
                size: sqlContent.length
            });

            (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
                getText: () => sqlContent,
                uri: testUri
            });

            // Analyze same content twice
            const result1 = await scanner.analyzeFile(testUri);
            const result2 = await scanner.analyzeFile(testUri);

            // Hash should be identical for same content
            expect(result1.contentHash).toBe(result2.contentHash);
            expect(result1.contentHash).toHaveLength(64); // SHA-256 hex = 64 chars
        });
    });

    // =========================================================================
    // analyzeWorkspace Tests - Full Workspace Scan
    // =========================================================================

    describe('analyzeWorkspace', () => {
        it('should analyze all SQL files in workspace', async () => {
            // SETUP: Multiple files
            const mockFiles = [
                vscode.Uri.file('/workspace/tables.sql'),
                vscode.Uri.file('/workspace/queries.sql')
            ];
            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);

            // Mock file stats
            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                mtime: Date.now(),
                size: 100
            });

            // Mock file contents
            const fileContents: Record<string, string> = {
                '/workspace/tables.sql': 'CREATE TABLE orders (id INT);',
                '/workspace/queries.sql': 'SELECT * FROM orders;'
            };

            (vscode.workspace.openTextDocument as jest.Mock).mockImplementation((uri: vscode.Uri) => {
                return Promise.resolve({
                    getText: () => fileContents[uri.fsPath] || '',
                    uri
                });
            });

            // ACT
            const results = await scanner.analyzeWorkspace();

            // ASSERT
            expect(results).toHaveLength(2);
            expect(results.map(r => r.fileName)).toEqual(['tables.sql', 'queries.sql']);
        });

        it('should call progress callback during scan', async () => {
            const mockFiles = [
                vscode.Uri.file('/workspace/a.sql'),
                vscode.Uri.file('/workspace/b.sql'),
                vscode.Uri.file('/workspace/c.sql')
            ];
            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);
            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                mtime: Date.now(),
                size: 10
            });
            (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
                getText: () => '-- empty',
                uri: mockFiles[0]
            });

            // SETUP: Track progress calls
            const progressCalls: Array<{ current: number; total: number; fileName: string }> = [];
            const progressCallback = (current: number, total: number, fileName: string) => {
                progressCalls.push({ current, total, fileName });
            };

            // ACT
            await scanner.analyzeWorkspace(progressCallback);

            // ASSERT
            expect(progressCalls).toHaveLength(3);
            expect(progressCalls[0]).toEqual({ current: 1, total: 3, fileName: 'a.sql' });
            expect(progressCalls[1]).toEqual({ current: 2, total: 3, fileName: 'b.sql' });
            expect(progressCalls[2]).toEqual({ current: 3, total: 3, fileName: 'c.sql' });
        });

        it('should respect cancellation token', async () => {
            // SETUP: 5 files but cancel after 2
            const mockFiles = [
                vscode.Uri.file('/workspace/1.sql'),
                vscode.Uri.file('/workspace/2.sql'),
                vscode.Uri.file('/workspace/3.sql'),
                vscode.Uri.file('/workspace/4.sql'),
                vscode.Uri.file('/workspace/5.sql')
            ];
            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);
            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                mtime: Date.now(),
                size: 10
            });
            (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
                getText: () => 'SELECT 1;',
                uri: mockFiles[0]
            });

            // SETUP: Cancellation token that cancels after 2 files
            let processedCount = 0;
            const cancellationToken = {
                get isCancellationRequested() {
                    return processedCount >= 2;
                }
            };

            const progressCallback = () => {
                processedCount++;
            };

            // ACT
            const results = await scanner.analyzeWorkspace(progressCallback, cancellationToken);

            // ASSERT: Should stop after 2 files
            expect(results).toHaveLength(2);
        });

        it('should handle empty workspace', async () => {
            (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);

            const results = await scanner.analyzeWorkspace();

            expect(results).toHaveLength(0);
        });
    });

    // =========================================================================
    // Edge Cases
    // =========================================================================

    describe('edge cases', () => {
        it('should handle SQL with syntax errors', async () => {
            const testUri = vscode.Uri.file('/workspace/broken.sql');

            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                mtime: Date.now(),
                size: 100
            });

            (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
                getText: () => 'SELEKT * FORM users WHER id = ;', // Intentional errors
                uri: testUri
            });

            // Should not throw - returns result with possible parse issues
            const result = await scanner.analyzeFile(testUri);

            expect(result.filePath).toBe('/workspace/broken.sql');
            // Parser may or may not set parseError depending on implementation
        });

        it('should handle empty SQL files', async () => {
            const testUri = vscode.Uri.file('/workspace/empty.sql');

            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                mtime: Date.now(),
                size: 0
            });

            (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
                getText: () => '',
                uri: testUri
            });

            const result = await scanner.analyzeFile(testUri);

            expect(result.definitions).toHaveLength(0);
            expect(result.references).toHaveLength(0);
        });

        it('should handle SQL with only comments', async () => {
            const testUri = vscode.Uri.file('/workspace/comments.sql');

            (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({
                type: 1,
                mtime: Date.now(),
                size: 50
            });

            (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
                getText: () => '-- This is a comment\n/* Block comment */',
                uri: testUri
            });

            const result = await scanner.analyzeFile(testUri);

            expect(result.definitions).toHaveLength(0);
            expect(result.references).toHaveLength(0);
        });
    });
});
