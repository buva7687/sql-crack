import * as vscode from 'vscode';
import { VisualizationPanel } from '../../src/visualizationPanel';

describe('VisualizationPanel behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode as any).__resetMockConfig?.();
    });

    it('reads and normalizes the live default dialect for runtime updates', () => {
        (vscode as any).__setMockConfig?.('sqlCrack', {
            defaultDialect: 'SQL Server',
            autoDetectDialect: false,
            gridStyle: 'dots',
        });

        const config = (VisualizationPanel.prototype as any)._readRuntimeConfig.call(
            {},
            { dialect: 'PostgreSQL', fileName: 'query.sql' }
        );

        expect(config.defaultDialect).toBe('TransactSQL');
        expect(config.autoDetectDialect).toBe(false);
        expect(config.gridStyle).toBe('dots');
    });

    it('keeps a pinned panel on its saved dialect during runtime updates', () => {
        (vscode as any).__setMockConfig?.('sqlCrack', { defaultDialect: 'MySQL' });
        const config = (VisualizationPanel.prototype as any)._readRuntimeConfig.call(
            { _isPinned: true },
            { dialect: 'PostgreSQL', fileName: 'pinned.sql' }
        );
        expect(config.defaultDialect).toBe('PostgreSQL');
    });

    it('maps cursor lines into a visualized selection and ignores lines outside it', () => {
        const previous = VisualizationPanel.currentPanel;
        const postMessage = jest.fn();
        VisualizationPanel.currentPanel = {
            _currentOptions: {
                sourceRange: new vscode.Range(new vscode.Position(10, 4), new vscode.Position(14, 0)),
            },
            _postMessage: postMessage,
        } as any;
        try {
            VisualizationPanel.sendCursorPosition(12);
            VisualizationPanel.sendCursorPosition(15);
            expect(postMessage).toHaveBeenCalledTimes(1);
            expect(postMessage).toHaveBeenCalledWith({ command: 'cursorPosition', line: 2 });
        } finally {
            VisualizationPanel.currentPanel = previous;
        }
    });

    it('maps a node line in a visualized selection back to the source document', async () => {
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
                _currentOptions: {
                    sourceRange: new vscode.Range(new vscode.Position(10, 4), new vscode.Position(14, 0)),
                },
                _sourceDocumentUri: undefined,
            }, 2);
            expect((editor.selection as any).active.line).toBe(11);
        } finally {
            (vscode.window as any).activeTextEditor = previousEditor;
            (vscode as any).Selection = previousSelection;
            (vscode as any).TextEditorRevealType = previousRevealType;
        }
    });

    it('sends the current pin list to the main panel and every pinned panel (S9)', () => {
        const previousCurrent = VisualizationPanel.currentPanel;
        const previousContext = (VisualizationPanel as any)._context;
        const pins = [
            { id: 'pin-1', name: 'Q1', sql: 'SELECT 1', dialect: 'MySQL', timestamp: 1 },
            { id: 'pin-2', name: 'Q2', sql: 'SELECT 2', dialect: 'MySQL', timestamp: 2 },
        ];
        (VisualizationPanel as any)._context = { workspaceState: { get: jest.fn(() => pins), update: jest.fn() } };
        const main = { _postMessage: jest.fn() };
        const pinnedOne = { _postMessage: jest.fn() };
        VisualizationPanel.currentPanel = main as any;
        VisualizationPanel.pinnedPanels.set('pin-1', pinnedOne as any);
        try {
            VisualizationPanel.broadcastPinnedTabs();
            for (const panel of [main, pinnedOne]) {
                expect(panel._postMessage).toHaveBeenCalledTimes(1);
                expect(panel._postMessage).toHaveBeenCalledWith(expect.objectContaining({
                    command: 'viewLocationOptions',
                    pinnedTabs: pins,
                }));
            }
        } finally {
            VisualizationPanel.currentPanel = previousCurrent;
            VisualizationPanel.pinnedPanels.delete('pin-1');
            (VisualizationPanel as any)._context = previousContext;
        }
    });

    it('broadcasts the pin list after pinning and unpinning (S9)', () => {
        const source = require('fs').readFileSync(require('path').join(__dirname, '../../src/visualizationPanel.ts'), 'utf8');
        const pinCase = source.slice(source.indexOf("case 'pinVisualization':"), source.indexOf("case 'persistUiState':"));
        const unpinCase = source.slice(source.indexOf("case 'unpinTab':"), source.indexOf("case 'savePng':"));
        expect(pinCase).toContain('VisualizationPanel.broadcastPinnedTabs();');
        expect(unpinCase).toContain('VisualizationPanel.broadcastPinnedTabs();');
    });

    it('files each UI-state save under the document it belongs to', () => {
        const proto = VisualizationPanel.prototype as any;
        const panel: any = { _isPinned: false, _pinId: undefined, _uiStateKeysByDocument: new Map() };
        const show = (path: string) => {
            panel._currentOptions = { documentUri: vscode.Uri.file(path), fileName: path.split('/').pop(), dialect: 'MySQL' };
            panel._sourceDocumentUri = panel._currentOptions.documentUri;
            proto._rememberUiStateKey.call(panel);
        };

        show('/w/a.sql');
        show('/w/b.sql');
        const a = vscode.Uri.file('/w/a.sql').toString();
        const b = vscode.Uri.file('/w/b.sql').toString();

        // The page for a.sql can still save after the panel switched to b.sql.
        expect(proto._resolveUiStateKey.call(panel, a)).toBe(`doc:${a}`);
        expect(proto._resolveUiStateKey.call(panel, b)).toBe(`doc:${b}`);
        // A document the panel no longer tracks is dropped, not filed under b.sql.
        expect(proto._resolveUiStateKey.call(panel, 'file:///w/evicted.sql')).toBeNull();
        // Saves without a document key keep the previous behaviour.
        expect(proto._resolveUiStateKey.call(panel, undefined)).toBe(`doc:${b}`);

        for (let index = 0; index < 10; index++) {
            show(`/w/q${index}.sql`);
        }
        expect(panel._uiStateKeysByDocument.size).toBe(8);
        expect(proto._resolveUiStateKey.call(panel, a)).toBeNull();
    });

    it('keys pinned panel saves by pin id', () => {
        const proto = VisualizationPanel.prototype as any;
        const panel: any = {
            _isPinned: true,
            _pinId: 'pin-7',
            _uiStateKeysByDocument: new Map(),
            _currentOptions: { documentUri: vscode.Uri.file('/w/a.sql'), fileName: 'a.sql', dialect: 'MySQL' },
        };
        proto._rememberUiStateKey.call(panel);
        expect(proto._resolveUiStateKey.call(panel, vscode.Uri.file('/w/a.sql').toString())).toBe('pin:pin-7');
    });

    it('falls back to the opened dialect and clamps advanced runtime limits', () => {
        (vscode as any).__setMockConfig?.('sqlCrack', {
            'advanced.maxFileSizeKB': 2,
            'advanced.maxStatements': 999,
            'advanced.deferredQueryThreshold': 12.6,
            'advanced.parseTimeoutSeconds': Number.NaN,
            colorblindMode: 'unsupported-mode',
        });

        const config = (VisualizationPanel.prototype as any)._readRuntimeConfig.call(
            {},
            { dialect: 'PL/SQL', fileName: 'query.sql' }
        );

        expect(config.defaultDialect).toBe('Oracle');
        expect(config.maxFileSizeKB).toBe(10);
        expect(config.maxStatements).toBe(500);
        expect(config.deferredQueryThreshold).toBe(13);
        expect(config.parseTimeoutSeconds).toBe(5);
        expect(config.colorblindMode).toBe('off');
    });

    it('escapes script termination and parser-sensitive HTML sequences', () => {
        const escaped = (VisualizationPanel.prototype as any)._escapeForInlineScript.call(
            {},
            '</script><!-- -->]]>'
        );

        expect(escaped).toContain('\\u003c/script\\u003e');
        expect(escaped).toContain('\\u003c!--');
        expect(escaped).toContain('--\\u003e');
        expect(escaped).toContain(']]\\u003e');
        expect(escaped).not.toContain('</script>');
    });

    it('refreshes a pinned snapshot in the panel that requested it', () => {
        const postMessage = jest.fn();
        const panel = {
            _isPinned: true,
            _currentSql: 'SELECT * FROM pinned_snapshot',
            _currentOptions: { dialect: 'PostgreSQL', fileName: 'snapshot.sql' },
            _isStale: true,
            _postMessage: postMessage,
        };

        (VisualizationPanel.prototype as any)._handleRefreshRequest.call(panel);

        expect(postMessage).toHaveBeenCalledWith({
            command: 'refresh',
            sql: 'SELECT * FROM pinned_snapshot',
            options: { dialect: 'PostgreSQL', fileName: 'snapshot.sql' },
        });
        expect(panel._isStale).toBe(false);
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('sql-crack.refresh');
    });

    it('routes mutable main-panel refresh through the source-aware command', () => {
        const panel = {
            _isPinned: false,
            _currentSql: 'SELECT 1',
            _currentOptions: { dialect: 'MySQL', fileName: 'query.sql' },
            _postMessage: jest.fn(),
        };

        (VisualizationPanel.prototype as any)._handleRefreshRequest.call(panel);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('sql-crack.refresh');
        expect(panel._postMessage).not.toHaveBeenCalled();
    });
});

describe('release persistence and panel reuse', () => {
    it('prunes old document UI state while retaining recently written state', () => {
        const panel = VisualizationPanel as any;
        const previous = panel._context;
        let stored: Record<string, unknown> = {};
        panel._context = {workspaceState: {get: () => stored, update: (_key: string, value: Record<string, unknown>) => {stored = value; return Promise.resolve();}}};
        try {
            for (let index = 0; index < 101; index++) {panel._persistUiState(`document-${index}`, {index});}
            expect(Object.keys(stored)).toHaveLength(100);
            expect(stored['document-0']).toBeUndefined();
            expect(stored['document-100']).toEqual({index: 100});
            panel._persistUiState('document-1', {index: 1});
            panel._persistUiState('document-101', {index: 101});
            expect(stored['document-1']).toEqual({index: 1});
            expect(stored['document-2']).toBeUndefined();
            panel._persistUiState('oversized', {text: 'x'.repeat(4 * 1024 * 1024)});
            expect(Buffer.byteLength(JSON.stringify(stored))).toBeLessThanOrEqual(4 * 1024 * 1024);
            expect(stored['document-101']).toEqual({index: 101});
        } finally {panel._context = previous;}
    });
    it('refreshes the existing webview when visualizing the same document again', () => {
        const previous = VisualizationPanel.currentPanel;
        const panel = { _panel: {reveal: jest.fn()}, _update: jest.fn(), _postMessage: jest.fn(),
            _rememberUiStateKey: jest.fn(), _currentOptions: {fileName: 'q.sql'} };
        VisualizationPanel.currentPanel = panel as any;
        try {
            VisualizationPanel.createOrShow(vscode.Uri.file('/extension'), 'SELECT 2', {fileName: 'q.sql', dialect: 'MySQL'});
            expect(panel._update).not.toHaveBeenCalled();
            expect(panel._postMessage).toHaveBeenCalledWith(expect.objectContaining({command: 'refresh', sql: 'SELECT 2'}));
        } finally {VisualizationPanel.currentPanel = previous;}
    });
});
