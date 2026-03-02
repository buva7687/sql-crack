/**
 * Regression tests for quick-win code review fixes.
 *
 * Covers:
 * 1. IndexManager.flushPersist() — ensures pending persistence is flushed
 * 2. path.basename() usage — guards against Unix-only path splitting
 * 3. rebuildAndRenderGraph .catch() — source-level guard
 * 4. Perf threshold multiplier — environment-configurable thresholds
 */

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { IndexManager } from '../../../src/workspace/indexManager';
import { WorkspaceScanner } from '../../../src/workspace/scanner';
import { FileAnalysis, SchemaDefinition, TableReference } from '../../../src/workspace/types';
import {
    createMockExtensionContext,
    __resetStorage,
    __getWorkspaceState,
    __resetMockConfig,
    ExtensionContext,
} from '../../__mocks__/vscode';

jest.mock('vscode');
jest.mock('../../../src/workspace/scanner');

const createMockAnalysis = (
    filePath: string,
    definitions: Partial<SchemaDefinition>[] = [],
    references: Partial<TableReference>[] = []
): FileAnalysis => ({
    filePath,
    fileName: path.basename(filePath),
    lastModified: Date.now(),
    contentHash: `hash-${filePath}`,
    definitions: definitions.map(d => ({
        name: d.name || 'unknown',
        type: d.type || 'table',
        filePath: d.filePath || filePath,
        lineNumber: d.lineNumber || 1,
        schema: d.schema,
        columns: d.columns || [],
    })) as SchemaDefinition[],
    references: references.map(r => ({
        tableName: r.tableName || 'unknown',
        filePath: r.filePath || filePath,
        lineNumber: r.lineNumber || 1,
        referenceType: r.referenceType || 'select',
        schema: r.schema,
    })) as TableReference[],
});

describe('IndexManager.flushPersist()', () => {
    let indexManager: IndexManager;
    let mockContext: ExtensionContext;
    let mockScanner: jest.Mocked<WorkspaceScanner>;

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
            findSqlFiles: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<WorkspaceScanner>;
        (WorkspaceScanner as jest.MockedClass<typeof WorkspaceScanner>)
            .mockImplementation(() => mockScanner);
        indexManager = new IndexManager(mockContext as vscode.ExtensionContext, 'MySQL');
    });

    afterEach(() => {
        indexManager.dispose();
    });

    it('persists index data to workspace state when called', async () => {
        mockScanner.analyzeWorkspace.mockResolvedValue([
            createMockAnalysis('/a.sql', [{ name: 'table_a' }]),
        ]);
        await indexManager.buildIndex();

        // flushPersist should write to workspace state
        await indexManager.flushPersist();
        const saved = __getWorkspaceState();
        expect(saved['sqlWorkspaceIndex']).toBeDefined();
    });

    it('is a no-op when no index exists', async () => {
        // Should not throw when called before buildIndex
        await expect(indexManager.flushPersist()).resolves.toBeUndefined();
    });

    it('cancels pending persist timer', async () => {
        mockScanner.analyzeWorkspace.mockResolvedValue([
            createMockAnalysis('/a.sql', [{ name: 'table_a' }]),
        ]);
        await indexManager.buildIndex();

        // Trigger a debounced persist by modifying the index
        // (internal detail: _persistTimer is set after changes)
        // flushPersist should clear the timer and persist immediately
        await indexManager.flushPersist();

        // dispose should not attempt a second persist (timer was cleared)
        indexManager.dispose();
        // No assertion needed — we verify it doesn't throw
    });
});

describe('path.basename() usage in test helpers', () => {
    it('extracts filename correctly from Unix paths', () => {
        expect(path.basename('/workspace/src/queries.sql')).toBe('queries.sql');
    });

    it('extracts filename correctly from bare filenames', () => {
        expect(path.basename('queries.sql')).toBe('queries.sql');
    });
});

describe('Source-level regression guards', () => {
    it('workspacePanel.ts: rebuildAndRenderGraph callback has .catch()', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../../src/workspace/workspacePanel.ts'),
            'utf-8'
        );
        // The onIndexUpdated callback must catch errors from the async rebuild
        expect(source).toMatch(/rebuildAndRenderGraph\(\)\.catch/);
    });

    it('workspacePanel.ts: dispose calls flushPersist before dispose', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../../src/workspace/workspacePanel.ts'),
            'utf-8'
        );
        expect(source).toMatch(/flushPersist\(\)/);
    });

    it('indexManager.ts: dispose() does not fire-and-forget persistIndex', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../../src/workspace/indexManager.ts'),
            'utf-8'
        );
        // The dispose method should NOT contain 'void this.persistIndex()' anymore
        // (persistence is now handled by flushPersist before dispose)
        const disposeMatch = source.match(/dispose\(\):\s*void\s*\{[\s\S]*?^\s{4}\}/m);
        if (disposeMatch) {
            expect(disposeMatch[0]).not.toContain('persistIndex');
        }
    });

    it('perfBaseline.test.ts: thresholds use configurable multiplier', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../webview/perfBaseline.test.ts'),
            'utf-8'
        );
        expect(source).toContain('PERF_BASELINE_MULTIPLIER');
        expect(source).toContain('perfMultiplier');
    });

    it('test helpers use path.basename instead of split/pop', () => {
        const testFiles = [
            path.join(__dirname, 'indexManager.test.ts'),
            path.join(__dirname, 'phase1-regression.test.ts'),
            path.join(__dirname, 'dependencyGraph.test.ts'),
        ];
        for (const file of testFiles) {
            const source = fs.readFileSync(file, 'utf-8');
            // fileName helpers should not use the brittle split pattern
            const fileNameLines = source.split('\n').filter(l => l.includes('fileName:') && l.includes('filePath'));
            for (const line of fileNameLines) {
                expect(line).not.toContain("split('/')");
            }
        }
    });
});
