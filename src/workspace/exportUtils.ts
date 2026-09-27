import { WorkspaceDependencyGraph } from './types';
import { WorkspaceExportContext, buildWorkspaceExportCommentBlock } from './exportMetadata';

export interface WorkspaceExportOption {
    format: 'clipboard-png' | 'png' | 'svg' | 'mermaid' | 'copy-mermaid' | 'json' | 'dot';
    label: string;
    group: 'common' | 'advanced';
}

export const WORKSPACE_EXPORT_OPTIONS: WorkspaceExportOption[] = [
    { format: 'clipboard-png', label: 'Copy to clipboard (PNG)', group: 'common' },
    { format: 'png', label: 'Save as PNG', group: 'common' },
    { format: 'svg', label: 'SVG', group: 'advanced' },
    { format: 'mermaid', label: 'Mermaid', group: 'advanced' },
    { format: 'copy-mermaid', label: 'Copy Mermaid to clipboard', group: 'advanced' },
    { format: 'json', label: 'JSON (graph data)', group: 'advanced' },
    { format: 'dot', label: 'DOT (Graphviz)', group: 'advanced' },
];

function escapeWorkspaceMermaidLabel(label: string): string {
    return (label ?? '')
        .replace(/\\/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/`/g, '#96;')
        .replace(/"/g, '#34;')
        .replace(/\[/g, '#91;')
        .replace(/\]/g, '#93;')
        .replace(/\(/g, '#40;')
        .replace(/\)/g, '#41;')
        .replace(/\{/g, '#123;')
        .replace(/\}/g, '#125;')
        .replace(/</g, '#60;')
        .replace(/>/g, '#62;');
}

export function generateWorkspaceMermaid(
    graph: WorkspaceDependencyGraph,
    direction: 'TD' | 'BT',
    context?: WorkspaceExportContext
): string {
    let mermaid = '```mermaid\n';
    if (context) {
        mermaid += `${buildWorkspaceExportCommentBlock(context, '%%')}\n`;
    }
    mermaid += `graph ${direction}\n`;

    for (const node of graph.nodes) {
        const label = escapeWorkspaceMermaidLabel(node.label);
        const shape = node.type === 'external' ? '((' : '[';
        const endShape = node.type === 'external' ? '))' : ']';
        mermaid += `    ${node.id}${shape}"${label}"${endShape}\n`;
    }

    for (const edge of graph.edges) {
        mermaid += `    ${edge.source} --> ${edge.target}\n`;
    }

    mermaid += '```';
    return mermaid;
}
