/**
 * Regressions for the 2026-11-10 deep dive (docs/audits/deep-dive-2026-11-10.md).
 */
import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { join } from 'path';
import { VisualizationPanel } from '../../src/visualizationPanel';
import { parseSqlBatch } from '../../src/webview/sqlParser';
import type { SqlDialect } from '../../src/webview/types';

const read = (relativePath: string): string => readFileSync(join(__dirname, '../../', relativePath), 'utf8');

describe('H4: pinned panel line navigation', () => {
    it('adds the pinned statement offset when jumping to a source line', async () => {
        const previousEditor = vscode.window.activeTextEditor;
        const previousSelection = (vscode as any).Selection;
        const previousRevealType = (vscode as any).TextEditorRevealType;
        const editor = { selection: undefined as unknown, revealRange: jest.fn() };
        (vscode.window as any).activeTextEditor = editor;
        (vscode as any).Selection = class {
            constructor(public anchor: vscode.Position, public active: vscode.Position) {}
        };
        (vscode as any).TextEditorRevealType = { InCenter: 1 };
        try {
            await (VisualizationPanel.prototype as any)._goToLine.call({
                _currentOptions: { lineOffset: 3 },
                _sourceDocumentUri: undefined,
            }, 2);
            // Line 2 of a statement that starts on file line 4 is file line 5 (zero-based 4).
            expect((editor.selection as any).active.line).toBe(4);
        } finally {
            (vscode.window as any).activeTextEditor = previousEditor;
            (vscode as any).Selection = previousSelection;
            (vscode as any).TextEditorRevealType = previousRevealType;
        }
    });

    it('a statement parsed alone plus its start-line offset matches its lines in the file', () => {
        const sql = [
            '-- header',
            'SELECT 1 AS one;',
            '',
            'SELECT o.id,',
            '       c.name',
            'FROM orders o',
            'JOIN customers c ON c.id = o.customer_id',
            'WHERE o.total > 10;',
        ].join('\n');
        const batch = parseSqlBatch(sql, 'MySQL' as SqlDialect);
        expect(batch.queries).toHaveLength(2);
        const inFile = batch.queries[1];
        const offset = (batch.queryLineRanges?.[1]?.startLine ?? 1) - 1;
        expect(offset).toBeGreaterThan(0);

        const alone = parseSqlBatch(inFile.sql, 'MySQL' as SqlDialect).queries[0];
        const linesOf = (nodes: typeof inFile.nodes, add: number) => nodes
            .filter(node => typeof node.startLine === 'number')
            .map(node => `${node.type}:${node.label}:${(node.startLine as number) + add}`)
            .sort();
        expect(linesOf(alone.nodes, offset)).toEqual(linesOf(inFile.nodes, 0));
        expect(linesOf(alone.nodes, offset).length).toBeGreaterThan(0);
    });

    it('sends the statement offset with the pin request and stores it with the pin', () => {
        const indexSource = read('src/webview/index.ts');
        expect(indexSource).toContain('lineOffset = statementStartLine(currentQueryIndex);');
        const panelSource = read('src/visualizationPanel.ts');
        expect(panelSource).toContain('lineOffset: normalizeLineOffset(message.lineOffset) + getSourceLineOffset(this._currentOptions)');
        expect(panelSource).toContain('lineOffset: normalizeLineOffset(pin.lineOffset)');
    });
});

describe('H5/H9: pinned snapshot storage', () => {
    const withPins = (pins: unknown[], run: (update: jest.Mock) => void): void => {
        const previousContext = (VisualizationPanel as any)._context;
        const update = jest.fn();
        (VisualizationPanel as any)._context = { workspaceState: { get: jest.fn(() => pins), update } };
        try { run(update); } finally { (VisualizationPanel as any)._context = previousContext; }
    };
    const pin = (id: string, sql = 'SELECT 1') => ({ id, name: id, sql, dialect: 'MySQL', timestamp: 1000 });

    it('refuses a new pin past the count limit', () => {
        withPins(Array.from({ length: 50 }, (_, index) => pin(`pin-${index}`)), () => {
            expect((VisualizationPanel as any).canStorePinnedTab(pin('pin-new'))).toBe(false);
        });
        withPins([pin('pin-0')], () => {
            expect((VisualizationPanel as any).canStorePinnedTab(pin('pin-new'))).toBe(true);
        });
    });

    it('refuses a new pin past the size limit', () => {
        withPins([pin('pin-0')], () => {
            expect((VisualizationPanel as any).canStorePinnedTab(pin('pin-big', 'x'.repeat(5 * 1024 * 1024)))).toBe(false);
        });
    });

    it('does not rewrite a stored pin when it is reopened', () => {
        const panelSource = read('src/visualizationPanel.ts');
        expect(panelSource).toContain('const newPin: PinnedVisualization | undefined = existingPin ? undefined : {');
        expect(panelSource).toMatch(/if \(newPin\) \{\s+VisualizationPanel\.savePinnedTab\(newPin\);/);
    });
});

describe('H7/H8: settings and diagnostics scope', () => {
    const extensionSource = read('src/extension.ts');

    it('clamps autoRefreshDelay to its declared range', () => {
        expect(extensionSource).toContain("normalizeAdvancedLimit(config.get<number>('autoRefreshDelay', 500), 500, 100, 5000)");
    });

    it('clamps cacheTTLHours to its declared range', () => {
        const indexManagerSource = read('src/workspace/indexManager.ts');
        expect(indexManagerSource).not.toContain("= config.get<number>('cacheTTLHours', DEFAULT_CACHE_TTL_HOURS);");
    });

    it('limits Problems diagnostics to file and untitled documents', () => {
        expect(extensionSource).toContain("new Set(['file', 'untitled'])");
        expect(extensionSource).toContain('!DIAGNOSTIC_DOCUMENT_SCHEMES.has(document.uri.scheme)');
    });
});

describe('H1: parser worker script loading', () => {
    it('lets the webview fetch its own worker script', () => {
        expect(read('src/visualizationPanel.ts')).toContain('connect-src ${webview.cspSource};');
    });
});
