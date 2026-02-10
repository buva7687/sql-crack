/**
 * Phase 1 Regression Tests — Review Bugs & Security Fixes
 *
 * Tests for:
 * 1. Edge attribute consistency (graphView.ts must use data-source/data-target)
 * 2. HTML escaping in clientScripts.ts lineage rendering
 * 3. File watcher respecting custom extensions
 * 4. Concurrency guard on buildIndex()
 */

import * as vscode from 'vscode';
import { IndexManager } from '../../../src/workspace/indexManager';
import { WorkspaceScanner } from '../../../src/workspace/scanner';
import { FileAnalysis, SchemaDefinition, TableReference } from '../../../src/workspace/types';
import {
    createMockExtensionContext,
    __resetStorage,
    __setMockConfig,
    __resetMockConfig,
    __getFileSystemWatcher,
    ExtensionContext
} from '../../__mocks__/vscode';
import { generateGraphBody, GraphBodyParams } from '../../../src/workspace/ui/graphView';
import { getWebviewScript } from '../../../src/workspace/ui/clientScripts';

jest.mock('vscode');
jest.mock('../../../src/workspace/scanner');

// =========================================================================
// 1. Edge Attribute Consistency
// =========================================================================

describe('Edge attribute consistency (graphView.ts)', () => {
    it('should render edges with data-source and data-target (not data-source-id)', () => {
        const params: GraphBodyParams = {
            graph: {
                nodes: [
                    { id: 'node1', label: 'users', type: 'table', filePath: '/a.sql', x: 0, y: 0 },
                    { id: 'node2', label: 'orders', type: 'table', filePath: '/b.sql', x: 100, y: 100 }
                ],
                edges: [
                    { source: 'node1', target: 'node2' }
                ],
                stats: { orphanedDefinitions: [], missingDefinitions: [] }
            } as any,
            searchFilter: { query: '', useRegex: false, caseSensitive: false },
            detailedStats: { orphanedDefinitions: [], missingDefinitions: [] },
            totalIssues: 0
        };

        const html = generateGraphBody(params);

        // Should use data-source and data-target (matching clientScripts.ts reads)
        expect(html).toContain('data-source="node1"');
        expect(html).toContain('data-target="node2"');
        // Should NOT use data-source-id / data-target-id
        expect(html).not.toContain('data-source-id=');
        expect(html).not.toContain('data-target-id=');
    });

    it('should HTML-escape edge source and target IDs', () => {
        const params: GraphBodyParams = {
            graph: {
                nodes: [
                    { id: '<script>alert(1)</script>', label: 'evil', type: 'table', filePath: '/a.sql', x: 0, y: 0 },
                    { id: 'node2', label: 'safe', type: 'table', filePath: '/b.sql', x: 100, y: 100 }
                ],
                edges: [
                    { source: '<script>alert(1)</script>', target: 'node2' }
                ],
                stats: { orphanedDefinitions: [], missingDefinitions: [] }
            } as any,
            searchFilter: { query: '', useRegex: false, caseSensitive: false },
            detailedStats: { orphanedDefinitions: [], missingDefinitions: [] },
            totalIssues: 0
        };

        const html = generateGraphBody(params);

        expect(html).toContain('data-source="&lt;script&gt;alert(1)&lt;/script&gt;"');
        expect(html).not.toContain('data-source="<script>');
    });
});

// =========================================================================
// 2. HTML Escaping in Lineage Result Rendering
// =========================================================================

describe('HTML escaping in clientScripts.ts', () => {
    it('should include escapeHtmlSafe function in the generated script', () => {
        const script = getWebviewScript({
            nonce: 'test-nonce',
            graphData: '{"nodes":[]}',
            searchFilterQuery: ''
        });

        // The escapeHtmlSafe function should be defined in the script output
        expect(script).toContain('function escapeHtmlSafe(text)');
        expect(script).toContain('.replace(/&/g');
        expect(script).toContain('.replace(/</g');
        expect(script).toContain('.replace(/>/g');
    });

    it('should use escapeHtmlSafe for lineage result node names', () => {
        const script = getWebviewScript({
            nonce: 'test-nonce',
            graphData: '{"nodes":[]}',
            searchFilterQuery: ''
        });

        // The lineage result rendering should escape n.name, n.type, and n.filePath
        expect(script).toContain('escapeHtmlSafe(n.name)');
        expect(script).toContain('escapeHtmlSafe(n.type)');
        expect(script).toContain('escapeHtmlSafe(n.filePath');
    });

    it('should use escapeHtmlSafe for error messages', () => {
        const script = getWebviewScript({
            nonce: 'test-nonce',
            graphData: '{"nodes":[]}',
            searchFilterQuery: ''
        });

        // Error messages should be escaped
        expect(script).toContain('escapeHtmlSafe(message.data.error)');
    });

    it('should NOT have unescaped n.name or n.type in lineage result HTML', () => {
        const script = getWebviewScript({
            nonce: 'test-nonce',
            graphData: '{"nodes":[]}',
            searchFilterQuery: ''
        });

        // These raw patterns should not appear in the lineage rendering section
        // (The regex checks for the specific unescaped pattern in the HTML concat)
        const lineageSection = script.substring(
            script.indexOf("case 'lineageResult'"),
            script.indexOf("case 'impactResult'")
        );

        // Raw n.name/n.type in HTML concat should not exist
        expect(lineageSection).not.toMatch(/\+ n\.name \+ '</);
        expect(lineageSection).not.toMatch(/\+ n\.type \+ /);
    });
});

// =========================================================================
// 3. File Watcher Custom Extensions
// =========================================================================

describe('File watcher custom extensions', () => {
    let indexManager: IndexManager;
    let mockContext: ExtensionContext;
    let mockScanner: jest.Mocked<WorkspaceScanner>;

    const createMockAnalysis = (filePath: string, definitions: Partial<SchemaDefinition>[] = []): FileAnalysis => ({
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
        references: [] as TableReference[]
    });

    beforeEach(() => {
        jest.clearAllMocks();
        __resetStorage();
        __resetMockConfig();

        mockContext = createMockExtensionContext();
        mockScanner = {
            getFileCount: jest.fn().mockResolvedValue(0),
            analyzeWorkspace: jest.fn().mockResolvedValue([]),
            analyzeFile: jest.fn().mockResolvedValue(createMockAnalysis('/test.sql')),
            setDialect: jest.fn(),
            getDialect: jest.fn().mockReturnValue('MySQL'),
            findSqlFiles: jest.fn().mockResolvedValue([])
        } as unknown as jest.Mocked<WorkspaceScanner>;

        (WorkspaceScanner as jest.MockedClass<typeof WorkspaceScanner>)
            .mockImplementation(() => mockScanner);
    });

    afterEach(() => {
        indexManager?.dispose();
    });

    it('should use default **/*.sql glob when no additional extensions', async () => {
        indexManager = new IndexManager(mockContext as vscode.ExtensionContext);
        mockScanner.getFileCount.mockResolvedValue(5);
        mockScanner.analyzeWorkspace.mockResolvedValue([]);

        await indexManager.initialize();

        expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/*.sql');
    });

    it('should include additional extensions in watcher glob', async () => {
        __setMockConfig('sqlCrack', {
            additionalFileExtensions: ['.hql', 'bteq', '.tpt']
        });

        indexManager = new IndexManager(mockContext as vscode.ExtensionContext);
        mockScanner.getFileCount.mockResolvedValue(5);
        mockScanner.analyzeWorkspace.mockResolvedValue([]);

        await indexManager.initialize();

        expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
            '**/*.{sql,hql,bteq,tpt}'
        );
    });

    it('should register config change listener for extension updates', async () => {
        indexManager = new IndexManager(mockContext as vscode.ExtensionContext);
        mockScanner.getFileCount.mockResolvedValue(5);
        mockScanner.analyzeWorkspace.mockResolvedValue([]);

        await indexManager.initialize();

        expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
    });

    it('should dispose config listener on dispose', async () => {
        indexManager = new IndexManager(mockContext as vscode.ExtensionContext);
        mockScanner.getFileCount.mockResolvedValue(5);
        mockScanner.analyzeWorkspace.mockResolvedValue([]);

        await indexManager.initialize();

        // Dispose should not throw
        indexManager.dispose();
    });
});

// =========================================================================
// 4. Concurrency Guard on buildIndex()
// =========================================================================

describe('buildIndex concurrency guard', () => {
    let indexManager: IndexManager;
    let mockContext: ExtensionContext;
    let mockScanner: jest.Mocked<WorkspaceScanner>;
    let analyzeCallCount: number;

    const createMockAnalysis = (filePath: string): FileAnalysis => ({
        filePath,
        fileName: filePath.split('/').pop() || '',
        lastModified: Date.now(),
        contentHash: `hash-${filePath}`,
        definitions: [{ name: 'users', type: 'table' as const, filePath, lineNumber: 1, columns: [], sql: 'CREATE TABLE users' }] as SchemaDefinition[],
        references: [] as TableReference[]
    });

    beforeEach(() => {
        jest.clearAllMocks();
        __resetStorage();
        __resetMockConfig();
        analyzeCallCount = 0;

        mockContext = createMockExtensionContext();
        mockScanner = {
            getFileCount: jest.fn().mockResolvedValue(0),
            analyzeWorkspace: jest.fn().mockImplementation(async () => {
                analyzeCallCount++;
                // Simulate slow analysis
                await new Promise(resolve => setTimeout(resolve, 50));
                return [createMockAnalysis('/test.sql')];
            }),
            analyzeFile: jest.fn().mockResolvedValue(createMockAnalysis('/test.sql')),
            setDialect: jest.fn(),
            getDialect: jest.fn().mockReturnValue('MySQL'),
            findSqlFiles: jest.fn().mockResolvedValue([])
        } as unknown as jest.Mocked<WorkspaceScanner>;

        (WorkspaceScanner as jest.MockedClass<typeof WorkspaceScanner>)
            .mockImplementation(() => mockScanner);

        indexManager = new IndexManager(mockContext as vscode.ExtensionContext);
    });

    afterEach(() => {
        indexManager.dispose();
    });

    it('should return same promise for concurrent buildIndex calls', async () => {
        // Fire two builds concurrently
        const build1 = indexManager.buildIndex();
        const build2 = indexManager.buildIndex();

        const [result1, result2] = await Promise.all([build1, build2]);

        // Both should return the same index object
        expect(result1).toBe(result2);
        // Scanner should only be called once
        expect(analyzeCallCount).toBe(1);
    });

    it('should allow new build after previous completes', async () => {
        await indexManager.buildIndex();
        await indexManager.buildIndex();

        // Two separate builds should call scanner twice
        expect(analyzeCallCount).toBe(2);
    });

    it('should clear build promise even if build fails', async () => {
        mockScanner.analyzeWorkspace
            .mockRejectedValueOnce(new Error('scan failed'))
            .mockResolvedValueOnce([createMockAnalysis('/test.sql')]);

        // First build fails
        await expect(indexManager.buildIndex()).rejects.toThrow('scan failed');

        // Second build should work (promise cleared after failure)
        const result = await indexManager.buildIndex();
        expect(result).toBeDefined();
        expect(result.fileCount).toBe(1);
    });
});
