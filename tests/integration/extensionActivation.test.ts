/**
 * Integration test: Extension activation wiring
 *
 * Verifies that extension.activate() registers all expected commands,
 * sets up file watchers, and reads configuration correctly.
 *
 * Two tiers:
 *   1. Source-reading guards (existing) — catch gross deletions
 *   2. Runtime activation tests — call real activate() with mock context
 */

jest.mock('vscode');
jest.mock('../../src/visualizationPanel', () => ({
    VisualizationPanel: {
        setContext: jest.fn(),
        setActiveEditorActivity: jest.fn(),
        currentPanel: null,
        sourceDocumentUri: null,
        getPinnedTabs: jest.fn().mockReturnValue([]),
        createOrShow: jest.fn(),
        refresh: jest.fn(),
        markAsStale: jest.fn(),
        sendCursorPosition: jest.fn(),
        sendQueryIndex: jest.fn(),
        openPinnedTab: jest.fn(),
    },
}));
jest.mock('../../src/workspace', () => ({
    WorkspacePanel: {
        createOrShow: jest.fn().mockResolvedValue(undefined),
        currentPanel: null,
    },
}));
jest.mock('../../src/logger', () => ({
    logger: {
        initialize: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        show: jest.fn(),
    },
}));

import * as vscode from 'vscode';
import { normalizeDialect, activate } from '../../src/extension';
import { VisualizationPanel } from '../../src/visualizationPanel';
import { logger } from '../../src/logger';
import { isAggregateFunction } from '../../src/dialects/functionRegistry';

// ============================================================
// Tests
// ============================================================

describe('Extension Activation Wiring', () => {
    describe('normalizeDialect', () => {
        it('maps "SQL Server" to "TransactSQL"', () => {
            expect(normalizeDialect('SQL Server')).toBe('TransactSQL');
        });

        it('maps "PL/SQL" to "Oracle"', () => {
            expect(normalizeDialect('PL/SQL')).toBe('Oracle');
        });

        it('passes through standard dialect names unchanged', () => {
            expect(normalizeDialect('PostgreSQL')).toBe('PostgreSQL');
            expect(normalizeDialect('MySQL')).toBe('MySQL');
            expect(normalizeDialect('Snowflake')).toBe('Snowflake');
            expect(normalizeDialect('BigQuery')).toBe('BigQuery');
            expect(normalizeDialect('Hive')).toBe('Hive');
            expect(normalizeDialect('Redshift')).toBe('Redshift');
            expect(normalizeDialect('SQLite')).toBe('SQLite');
            expect(normalizeDialect('TransactSQL')).toBe('TransactSQL');
            expect(normalizeDialect('Oracle')).toBe('Oracle');
            expect(normalizeDialect('Teradata')).toBe('Teradata');
        });
    });

    describe('Command registration', () => {
        it('package.json declares all expected commands', () => {
            // Read package.json to verify command declarations
            const pkg = require('../../package.json');
            const commandIds = pkg.contributes.commands.map((c: { command: string }) => c.command);

            expect(commandIds).toContain('sql-crack.visualize');
            expect(commandIds).toContain('sql-crack.analyzeWorkspace');
            expect(commandIds).toContain('sql-crack.restorePinnedTabs');
            expect(commandIds).toContain('sql-crack.showWorkspaceUxMetrics');
        });

        it('package.json declares keybinding for visualize', () => {
            const pkg = require('../../package.json');
            const bindings = pkg.contributes.keybindings || [];
            const vizBinding = bindings.find((b: { command: string }) => b.command === 'sql-crack.visualize');
            expect(vizBinding).toBeDefined();
        });
    });

    describe('Configuration schema', () => {
        it('declares defaultDialect with all supported dialects', () => {
            const pkg = require('../../package.json');
            const props = pkg.contributes.configuration.properties;
            const dialectProp = props['sqlCrack.defaultDialect'];

            expect(dialectProp).toBeDefined();
            expect(dialectProp.enum).toContain('MySQL');
            expect(dialectProp.enum).toContain('PostgreSQL');
            expect(dialectProp.enum).toContain('Snowflake');
            expect(dialectProp.enum).toContain('BigQuery');
            expect(dialectProp.enum).toContain('SQL Server'); // user-friendly alias
        });

        it('declares autoDetectDialect as boolean', () => {
            const pkg = require('../../package.json');
            const props = pkg.contributes.configuration.properties;
            expect(props['sqlCrack.autoDetectDialect'].type).toBe('boolean');
        });

        it('declares gridStyle with dots/lines/none', () => {
            const pkg = require('../../package.json');
            const props = pkg.contributes.configuration.properties;
            const gridProp = props['sqlCrack.gridStyle'];
            expect(gridProp.enum).toEqual(expect.arrayContaining(['dots', 'lines', 'none']));
        });

        it('declares colorblindMode with all supported modes', () => {
            const pkg = require('../../package.json');
            const props = pkg.contributes.configuration.properties;
            const cbProp = props['sqlCrack.colorblindMode'];
            expect(cbProp.enum).toEqual(expect.arrayContaining(['off', 'deuteranopia', 'protanopia', 'tritanopia']));
        });
    });

    describe('Activation events', () => {
        it('activates on SQL language', () => {
            const pkg = require('../../package.json');
            expect(pkg.activationEvents).toContain('onLanguage:sql');
        });

        it('activates on visualize command', () => {
            const pkg = require('../../package.json');
            expect(pkg.activationEvents).toContain('onCommand:sql-crack.visualize');
        });

        it('activates on workspace analysis command', () => {
            const pkg = require('../../package.json');
            expect(pkg.activationEvents).toContain('onCommand:sql-crack.analyzeWorkspace');
        });
    });

    describe('Message protocol type safety', () => {
        it('SqlFlowWebviewMessage covers all expected webview→host commands', () => {
            // Source-reading check — verify the type union covers key commands
            const fs = require('fs');
            const source = fs.readFileSync(
                require('path').join(__dirname, '../../src/shared/messages/sqlFlowMessages.ts'),
                'utf8'
            );

            expect(source).toContain("command: 'requestRefresh'");
            expect(source).toContain("command: 'goToLine'");
            expect(source).toContain("command: 'traceInWorkspaceLineage'");
            expect(source).toContain("command: 'pinVisualization'");
            expect(source).toContain("command: 'savePng'");
            expect(source).toContain("command: 'saveSvg'");
            expect(source).toContain("command: 'savePdf'");
        });

        it('SqlFlowHostMessage covers all expected host→webview commands', () => {
            const fs = require('fs');
            const source = fs.readFileSync(
                require('path').join(__dirname, '../../src/shared/messages/sqlFlowMessages.ts'),
                'utf8'
            );

            expect(source).toContain("command: 'refresh'");
            expect(source).toContain("command: 'cursorPosition'");
            expect(source).toContain("command: 'runtimeConfig'");
            expect(source).toContain("command: 'markStale'");
            expect(source).toContain("command: 'switchToQuery'");
        });

        it('WorkspaceWebviewMessage covers key workspace commands', () => {
            const fs = require('fs');
            const source = fs.readFileSync(
                require('path').join(__dirname, '../../src/shared/messages/workspaceMessages.ts'),
                'utf8'
            );

            expect(source).toContain("command: 'switchView'");
            expect(source).toContain("command: 'refresh'");
            expect(source).toContain("command: 'getLineage'");
            expect(source).toContain("command: 'analyzeImpact'");
            expect(source).toContain("command: 'export'");
            expect(source).toContain("command: 'openFile'");
            expect(source).toContain("command: 'exploreTable'");
        });
    });

    // ============================================================
    // Runtime activation tests — call real activate() with mock context
    // ============================================================

    describe('Runtime activation', () => {
        let context: vscode.ExtensionContext;

        beforeEach(() => {
            jest.clearAllMocks();
            // Use the mock helper from the vscode mock
            const mockVscode = require('vscode');
            context = mockVscode.createMockExtensionContext();
        });

        it('activate() runs without throwing', () => {
            expect(() => activate(context)).not.toThrow();
        });

        it('pushes subscriptions for all commands and listeners', () => {
            activate(context);
            // 5 commands + diagnosticCollection + diagnosticCodeActionProvider wrapper
            // + activeEditorListener + cursorChangeListener
            // + documentOpen/Save/Close/Change listeners + configChangeListener
            // = at least 13 subscriptions
            expect(context.subscriptions.length).toBeGreaterThanOrEqual(13);
        });

        it('registers all expected commands via vscode.commands.registerCommand', () => {
            activate(context);
            const registerCalls = (vscode.commands.registerCommand as jest.Mock).mock.calls;
            const registeredIds = registerCalls.map((call: unknown[]) => call[0]);

            expect(registeredIds).toContain('sql-crack.visualize');
            expect(registeredIds).toContain('sql-crack.refresh');
            expect(registeredIds).toContain('sql-crack.restorePinnedTabs');
            expect(registeredIds).toContain('sql-crack.analyzeWorkspace');
            expect(registeredIds).toContain('sql-crack.showWorkspaceUxMetrics');
        });

        it('creates a diagnostic collection', () => {
            activate(context);
            expect(vscode.languages.createDiagnosticCollection).toHaveBeenCalledWith('sql-crack');
        });

        it('registers a code action provider', () => {
            activate(context);
            expect(vscode.languages.registerCodeActionsProvider).toHaveBeenCalled();
        });

        it('initializes the logger', () => {
            activate(context);
            expect(logger.initialize).toHaveBeenCalledWith(context);
        });

        it('sets VisualizationPanel context', () => {
            activate(context);
            expect(VisualizationPanel.setContext).toHaveBeenCalledWith(context);
        });

        it('registers activeTextEditor change listener', () => {
            activate(context);
            expect((vscode.window as any).onDidChangeActiveTextEditor).toHaveBeenCalled();
        });

        it('registers text editor selection change listener', () => {
            activate(context);
            expect((vscode.window as any).onDidChangeTextEditorSelection).toHaveBeenCalled();
        });

        it('registers document change listener', () => {
            activate(context);
            expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
        });

        it('registers configuration change listener', () => {
            activate(context);
            expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
        });

        it('registers document open/save/close listeners', () => {
            activate(context);
            expect(vscode.workspace.onDidOpenTextDocument).toHaveBeenCalled();
            expect(vscode.workspace.onDidSaveTextDocument).toHaveBeenCalled();
            expect(vscode.workspace.onDidCloseTextDocument).toHaveBeenCalled();
        });

        it('reads configuration during activation (loads custom functions)', () => {
            activate(context);
            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('sqlCrack');
        });
    });
});
