/**
 * Integration test: Message protocol contracts
 *
 * Validates that both webview panels' message types are consistent
 * and that the MessageHandler covers all expected commands.
 */

jest.mock('vscode');

import * as fs from 'fs';
import * as path from 'path';

const MESSAGES_DIR = path.join(__dirname, '../../src/shared/messages');
const HANDLER_PATH = path.join(__dirname, '../../src/workspace/handlers/messageHandler.ts');
const VIZ_PANEL_PATH = path.join(__dirname, '../../src/visualizationPanel.ts');

function readSource(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
}

describe('Message Protocol Contracts', () => {

    describe('SQL Flow message protocol', () => {
        const source = readSource(path.join(MESSAGES_DIR, 'sqlFlowMessages.ts'));

        it('WebviewMessage type covers all required commands', () => {
            const requiredCommands = [
                'error', 'info', 'requestRefresh', 'persistUiState',
                'goToLine', 'traceInWorkspaceLineage', 'requestFullscreen',
                'pinVisualization', 'changeViewLocation', 'getViewLocationOptions',
                'openPinnedTab', 'unpinTab', 'savePng', 'saveSvg', 'savePdf',
            ];
            for (const cmd of requiredCommands) {
                expect(source).toContain(`command: '${cmd}'`);
            }
        });

        it('HostMessage type covers all required commands', () => {
            const requiredCommands = [
                'refresh', 'cursorPosition', 'switchToQuery',
                'markStale', 'runtimeConfig', 'setEditorActivity',
                'viewLocationOptions', 'pinCreated',
            ];
            for (const cmd of requiredCommands) {
                expect(source).toContain(`command: '${cmd}'`);
            }
        });

        it('refresh message includes sql and options with dialect', () => {
            expect(source).toMatch(/command:\s*'refresh'.*sql:\s*string/s);
            expect(source).toMatch(/options:.*dialect:\s*string/s);
        });
    });

    describe('Workspace message protocol', () => {
        const source = readSource(path.join(MESSAGES_DIR, 'workspaceMessages.ts'));

        it('WebviewMessage covers view switching commands', () => {
            expect(source).toContain("command: 'switchView'");
            expect(source).toContain("command: 'switchToLineageView'");
            expect(source).toContain("command: 'switchToImpactView'");
        });

        it('WebviewMessage covers lineage analysis commands', () => {
            expect(source).toContain("command: 'getLineage'");
            expect(source).toContain("command: 'analyzeImpact'");
            expect(source).toContain("command: 'exploreTable'");
            expect(source).toContain("command: 'getColumnLineage'");
            expect(source).toContain("command: 'getUpstream'");
            expect(source).toContain("command: 'getDownstream'");
        });

        it('WebviewMessage covers file operation commands', () => {
            expect(source).toContain("command: 'openFile'");
            expect(source).toContain("command: 'openFileAtLine'");
            expect(source).toContain("command: 'visualizeFile'");
        });

        it('WebviewMessage covers graph interaction commands', () => {
            expect(source).toContain("command: 'refresh'");
            expect(source).toContain("command: 'switchGraphMode'");
            expect(source).toContain("command: 'search'");
            expect(source).toContain("command: 'export'");
        });
    });

    describe('Workspace MessageHandler coverage', () => {
        const handlerSource = readSource(HANDLER_PATH);

        it('handles all critical workspace webview commands', () => {
            // These commands must have case branches in the handler
            const criticalCommands = [
                'switchView', 'refresh', 'switchGraphMode',
                'search', 'clearSearch', 'export',
                'openFile', 'openFileAtLine',
                'getLineage', 'analyzeImpact', 'exploreTable',
                'getUpstream', 'getDownstream',
            ];
            for (const cmd of criticalCommands) {
                expect(handlerSource).toContain(`'${cmd}'`);
            }
        });

        it('MessageHandler class is exported', () => {
            expect(handlerSource).toMatch(/export\s+class\s+MessageHandler/);
        });

        it('MessageHandlerContext interface defines required state accessors', () => {
            const requiredAccessors = [
                'getCurrentGraph', 'setCurrentGraph',
                'getCurrentView', 'setCurrentView',
                'getCurrentGraphMode', 'setCurrentGraphMode',
            ];
            for (const accessor of requiredAccessors) {
                expect(handlerSource).toContain(accessor);
            }
        });
    });

    describe('VisualizationPanel message handling', () => {
        const panelSource = readSource(VIZ_PANEL_PATH);

        it('handles requestRefresh command from webview', () => {
            expect(panelSource).toContain("'requestRefresh'");
        });

        it('handles goToLine command from webview', () => {
            expect(panelSource).toContain("'goToLine'");
        });

        it('handles pinVisualization command', () => {
            expect(panelSource).toContain("'pinVisualization'");
        });

        it('handles savePng command', () => {
            expect(panelSource).toContain("'savePng'");
        });

        it('handles traceInWorkspaceLineage command', () => {
            expect(panelSource).toContain("'traceInWorkspaceLineage'");
        });

        it('sends refresh message with sql and options', () => {
            expect(panelSource).toContain("command: 'refresh'");
        });

        it('sends runtimeConfig message on theme change', () => {
            expect(panelSource).toContain("command: 'runtimeConfig'");
        });
    });

    describe('Cross-panel consistency', () => {
        it('traceInWorkspaceLineage command exists in both SQL Flow and workspace', () => {
            const sqlFlowSource = readSource(path.join(MESSAGES_DIR, 'sqlFlowMessages.ts'));
            const vizPanelSource = readSource(VIZ_PANEL_PATH);

            // SQL Flow webview sends it
            expect(sqlFlowSource).toContain("'traceInWorkspaceLineage'");
            // VisualizationPanel handles it
            expect(vizPanelSource).toContain("'traceInWorkspaceLineage'");
        });
    });
});
