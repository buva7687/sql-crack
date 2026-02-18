import * as vscode from 'vscode';
import { WorkspaceDependencyGraph } from '../types';
import { buildWorkspaceGraphDot, buildWorkspaceGraphJsonExportData, buildWorkspaceGraphSvg } from './graphExportBuilders';
import { generateWorkspaceMermaid } from '../exportUtils';

function hasExportableGraphData(graph: WorkspaceDependencyGraph): boolean {
    return Array.isArray(graph.nodes) && graph.nodes.length > 0 && Array.isArray(graph.edges);
}

function ensureGraphReadyForExport(graph: WorkspaceDependencyGraph): boolean {
    if (hasExportableGraphData(graph)) {
        return true;
    }

    vscode.window.showWarningMessage('No graph data available to export. Refresh the workspace index and try again.');
    return false;
}

function getFlowDirection(): 'TD' | 'BT' {
    const config = vscode.workspace.getConfiguration('sqlCrack');
    return config.get<string>('flowDirection') === 'bottom-up' ? 'BT' : 'TD';
}

async function saveTextContent(
    content: string,
    defaultFilename: string,
    filters: Record<string, string[]>
): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultFilename),
        filters,
    });

    if (!uri) {
        return;
    }

    await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
    vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
}

export async function exportWorkspaceMermaidFile(graph: WorkspaceDependencyGraph): Promise<void> {
    if (!ensureGraphReadyForExport(graph)) {
        return;
    }
    const mermaid = generateWorkspaceMermaid(graph, getFlowDirection());
    await saveTextContent(mermaid, 'workspace-dependencies.md', { Markdown: ['md'] });
}

export async function copyWorkspaceMermaid(graph: WorkspaceDependencyGraph): Promise<void> {
    if (!ensureGraphReadyForExport(graph)) {
        return;
    }
    const mermaid = generateWorkspaceMermaid(graph, getFlowDirection());
    await vscode.env.clipboard.writeText(mermaid);
    vscode.window.showInformationMessage('Mermaid copied to clipboard');
}

export async function exportWorkspaceSvgFile(
    graph: WorkspaceDependencyGraph,
    isDarkTheme: boolean,
    escapeHtml: (value: string) => string
): Promise<void> {
    if (!ensureGraphReadyForExport(graph)) {
        return;
    }
    const svg = buildWorkspaceGraphSvg(graph, isDarkTheme, escapeHtml);
    await saveTextContent(svg, 'workspace-dependencies.svg', { SVG: ['svg'] });
}

export async function exportWorkspaceJsonFile(
    graph: WorkspaceDependencyGraph,
    version: string
): Promise<void> {
    if (!ensureGraphReadyForExport(graph)) {
        return;
    }
    const exportData = buildWorkspaceGraphJsonExportData(graph, version);
    await saveTextContent(JSON.stringify(exportData, null, 2), 'workspace-dependencies.json', { JSON: ['json'] });
}

export async function exportWorkspaceDotFile(
    graph: WorkspaceDependencyGraph,
    isDarkTheme: boolean
): Promise<void> {
    if (!ensureGraphReadyForExport(graph)) {
        return;
    }
    const dot = buildWorkspaceGraphDot(graph, isDarkTheme);
    await saveTextContent(dot, 'workspace-dependencies.dot', { 'Graphviz DOT': ['dot', 'gv'] });
}

export async function saveWorkspacePng(base64Data: string, suggestedFilename: string): Promise<void> {
    if (!base64Data) {
        vscode.window.showErrorMessage('No PNG data to save');
        return;
    }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(suggestedFilename || 'workspace-dependencies.png'),
        filters: {
            'PNG Image': ['png'],
        },
    });

    if (!uri) {
        return;
    }

    try {
        const buffer = Buffer.from(base64Data, 'base64');
        await vscode.workspace.fs.writeFile(uri, buffer);
        vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to save PNG: ${error}`);
    }
}
