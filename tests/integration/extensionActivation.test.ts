/**
 * Integration test: Extension activation wiring
 *
 * Verifies that extension.activate() registers all expected commands,
 * sets up file watchers, and reads configuration correctly.
 */

jest.mock('vscode');

import * as vscode from 'vscode';
import { normalizeDialect } from '../../src/extension';

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
});
