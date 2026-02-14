import { getReferenceTypeColor, getWorkspaceNodeColor } from '../../shared';
import { WorkspaceDependencyGraph, WorkspaceNode } from '../types';

export function buildWorkspaceGraphJsonExportData(
    graph: WorkspaceDependencyGraph,
    version: string
): Record<string, unknown> {
    return {
        version,
        exportedAt: new Date().toISOString(),
        graph: {
            nodes: graph.nodes.map(node => ({
                id: node.id,
                label: node.label,
                type: node.type,
                filePath: node.filePath,
                definitionCount: node.definitionCount,
                referenceCount: node.referenceCount,
            })),
            edges: graph.edges.map(edge => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                referenceType: edge.referenceType,
                count: edge.count,
                tables: edge.tables,
            })),
        },
        statistics: {
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            fileNodes: graph.nodes.filter(n => n.type === 'file').length,
            tableNodes: graph.nodes.filter(n => n.type === 'table').length,
            externalNodes: graph.nodes.filter(n => n.type === 'external').length,
        },
    };
}

export function buildWorkspaceGraphDot(graph: WorkspaceDependencyGraph, isDarkTheme: boolean): string {
    let dot = 'digraph WorkspaceDependencies {\n';
    dot += '    // Graph settings\n';
    dot += '    rankdir=TB;\n';
    dot += '    node [shape=box, style="rounded,filled", fontname="Arial"];\n';
    dot += '    edge [fontname="Arial", fontsize=10];\n\n';

    dot += '    // Nodes\n';
    for (const node of graph.nodes) {
        const color = getWorkspaceNodeColor(node.type, isDarkTheme);
        const label = node.label.replace(/"/g, '\\"');
        dot += `    "${node.id}" [label="${label}", fillcolor="${color}", fontcolor="white"];\n`;
    }

    dot += '\n    // Edges\n';
    for (const edge of graph.edges) {
        const color = getReferenceTypeColor(edge.referenceType, isDarkTheme);
        const label = edge.referenceType || '';
        dot += `    "${edge.source}" -> "${edge.target}" [color="${color}", label="${label}"];\n`;
    }

    dot += '}\n';
    return dot;
}

export function buildWorkspaceGraphSvg(
    graph: WorkspaceDependencyGraph,
    isDarkTheme: boolean,
    escapeHtml: (value: string) => string
): string {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of graph.nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
    }

    const width = Math.max(1200, maxX + 150);
    const height = Math.max(800, maxY + 150);

    const nodeMap = new Map<string, WorkspaceNode>();
    for (const node of graph.nodes) {
        nodeMap.set(node.id, node);
    }

    const edgesHtml = graph.edges.map(edge => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) {
            return '';
        }

        const x1 = source.x + source.width / 2;
        const y1 = source.y + source.height;
        const x2 = target.x + target.width / 2;
        const y2 = target.y;
        const path = `M ${x1} ${y1} C ${x1} ${y1 + 50}, ${x2} ${y2 - 50}, ${x2} ${y2}`;
        const color = getReferenceTypeColor(edge.referenceType, isDarkTheme);

        return `    <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`;
    }).join('\n');

    const nodesHtml = graph.nodes.map(node => {
        const color = getWorkspaceNodeColor(node.type, isDarkTheme);
        return `    <g transform="translate(${node.x}, ${node.y})">
        <rect width="${node.width}" height="${node.height}" rx="8" fill="${color}"/>
        <text x="${node.width / 2}" y="${node.height / 2}" text-anchor="middle" fill="white" font-size="12" font-weight="600">${escapeHtml(node.label)}</text>
    </g>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
${edgesHtml}
${nodesHtml}
</svg>`;
}
