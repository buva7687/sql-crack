import * as vscode from 'vscode';
import { WorkspacePanel } from '../../../src/workspace/workspacePanel';

describe('workspace panel export metadata version', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('uses extension version for impact report export payload', () => {
        const payload = (WorkspacePanel.prototype as any).buildImpactReportExportData.call(
            { _extensionVersion: '0.1.4' },
            {
                changeType: 'modify',
                target: { type: 'table', name: 'orders' },
                directImpacts: [],
                transitiveImpacts: [],
                summary: {
                    totalAffected: 0,
                    tablesAffected: 0,
                    viewsAffected: 0,
                    queriesAffected: 0,
                    filesAffected: 0,
                },
                severity: 'low',
                suggestions: [],
            }
        );

        expect(payload.version).toBe('0.1.4');
    });

    it('uses extension version for workspace graph JSON exports', async () => {
        (vscode.window as any).showSaveDialog = jest.fn().mockResolvedValue(vscode.Uri.file('/tmp/workspace-dependencies.json'));
        const writeFileSpy = vscode.workspace.fs.writeFile as jest.Mock;

        await (WorkspacePanel.prototype as any).exportAsJson.call({
            _extensionVersion: '0.1.4',
            _currentGraph: {
                nodes: [{ id: 'n1', label: 'orders', type: 'table', x: 0, y: 0, width: 100, height: 50 }],
                edges: [],
            },
        });

        const [, buffer] = writeFileSpy.mock.calls[0];
        const written = JSON.parse(Buffer.from(buffer).toString('utf8'));

        expect(written.version).toBe('0.1.4');
    });
});
