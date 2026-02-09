import { WorkspaceDependencyGraph } from './types';

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

export function generateWorkspaceMermaid(
    graph: WorkspaceDependencyGraph,
    direction: 'TD' | 'BT'
): string {
    let mermaid = `\`\`\`mermaid\ngraph ${direction}\n`;

    for (const node of graph.nodes) {
        const label = node.label.replace(/"/g, '\\"');
        const shape = node.type === 'file' ? '[' : node.type === 'external' ? '((' : '[]';
        const endShape = node.type === 'file' ? ']' : node.type === 'external' ? '))' : ']';
        mermaid += `    ${node.id}${shape}"${label}"${endShape}\n`;
    }

    for (const edge of graph.edges) {
        mermaid += `    ${edge.source} --> ${edge.target}\n`;
    }

    mermaid += '```';
    return mermaid;
}
