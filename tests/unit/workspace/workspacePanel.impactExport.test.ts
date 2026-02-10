import * as vscode from 'vscode';
import { WorkspacePanel } from '../../../src/workspace/workspacePanel';

describe('workspace panel impact export routing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('routes impact markdown/json exports to impact report exporter before graph checks', async () => {
        const context = {
            _isRebuilding: false,
            _currentGraph: null,
            exportImpactReport: jest.fn().mockResolvedValue(undefined),
        };

        await (WorkspacePanel.prototype as any).handleExport.call(context, 'impact-markdown');
        await (WorkspacePanel.prototype as any).handleExport.call(context, 'impact-json');

        expect(context.exportImpactReport).toHaveBeenNthCalledWith(1, 'markdown');
        expect(context.exportImpactReport).toHaveBeenNthCalledWith(2, 'json');
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalledWith('No graph data to export');
    });
});
