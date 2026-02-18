import * as vscode from 'vscode';
import {
    exportWorkspaceJsonFile,
    exportWorkspaceMermaidFile,
    exportWorkspaceSvgFile,
    exportWorkspaceDotFile,
    copyWorkspaceMermaid
} from '../../../../src/workspace/panel/graphExportActions';
import { WorkspaceDependencyGraph } from '../../../../src/workspace/types';

function createGraph(overrides: Partial<WorkspaceDependencyGraph> = {}): WorkspaceDependencyGraph {
    return {
        nodes: [{
            id: 'file:/repo/orders.sql',
            type: 'file',
            label: 'orders.sql',
            filePath: '/repo/orders.sql',
            x: 10,
            y: 20,
            width: 200,
            height: 80,
        }],
        edges: [],
        stats: {
            totalFiles: 1,
            totalTables: 1,
            totalViews: 0,
            totalReferences: 0,
            orphanedDefinitions: [],
            missingDefinitions: [],
            circularDependencies: [],
        },
        ...overrides,
    };
}

describe('workspace graph export actions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.window as any).showSaveDialog = jest.fn().mockResolvedValue(vscode.Uri.file('/tmp/workspace-export.out'));
        (vscode as any).env = {
            clipboard: {
                writeText: jest.fn().mockResolvedValue(undefined),
            },
        };
    });

    it('blocks exports when graph has no nodes and shows a warning', async () => {
        const emptyGraph = createGraph({ nodes: [] });

        await exportWorkspaceMermaidFile(emptyGraph);
        await exportWorkspaceSvgFile(emptyGraph, true, (value) => value);
        await exportWorkspaceJsonFile(emptyGraph, '0.3.8');
        await exportWorkspaceDotFile(emptyGraph, true);
        await copyWorkspaceMermaid(emptyGraph);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'No graph data available to export. Refresh the workspace index and try again.'
        );
        expect((vscode.window as any).showSaveDialog).not.toHaveBeenCalled();
        expect((vscode as any).env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('exports when graph contains nodes', async () => {
        const graph = createGraph();

        await exportWorkspaceJsonFile(graph, '0.3.8');

        expect((vscode.window as any).showSaveDialog).toHaveBeenCalled();
        expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });
});
