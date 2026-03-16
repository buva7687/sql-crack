import * as vscode from 'vscode';
import {
    exportWorkspaceJsonFile,
    exportWorkspaceMermaidFile,
    exportWorkspaceSvgFile,
    exportWorkspaceDotFile,
    copyWorkspaceMermaid
} from '../../../../src/workspace/panel/graphExportActions';
import { createWorkspaceExportContext } from '../../../../src/workspace/exportMetadata';
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
            parseErrors: 0,
        },
        ...overrides,
    };
}

describe('workspace graph export actions', () => {
    const exportContext = createWorkspaceExportContext({
        view: 'graph',
        graphMode: 'tables',
        scopeUri: '/repo/sql',
        searchFilter: { query: 'orders', nodeTypes: undefined, useRegex: false, caseSensitive: false },
        nodeCount: 1,
        edgeCount: 0,
        exportedAt: '2026-03-07T12:00:00.000Z',
    });

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

        await exportWorkspaceJsonFile(graph, '0.3.8', exportContext);

        expect((vscode.window as any).showSaveDialog).toHaveBeenCalled();
        expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('passes metadata-enriched mermaid content to file and clipboard exports', async () => {
        const graph = createGraph();

        await exportWorkspaceMermaidFile(graph, exportContext);
        await copyWorkspaceMermaid(graph, exportContext);

        const [, savedBuffer] = (vscode.workspace.fs.writeFile as jest.Mock).mock.calls[0];
        const savedText = Buffer.from(savedBuffer).toString('utf8');
        expect(savedText).toContain('%% SQL Crack Workspace Export');
        expect(savedText).toContain('%% Graph Mode: tables');
        expect((vscode as any).env.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('%% Scope: /repo/sql'));
    });
});
