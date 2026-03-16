import { WorkspaceExportContext, buildWorkspaceExportMetadata } from '../exportMetadata';
import { FlowAnalyzer, FlowResult } from '../lineage/flowAnalyzer';
import { LineageNode } from '../lineage/types';

interface LineageMarkdownExportOptions {
    flowAnalyzer: FlowAnalyzer;
    node: LineageNode;
    direction: 'both' | 'upstream' | 'downstream';
    depth: number;
    scopeUri?: string;
    expandedNodeCount?: number;
}

export interface LineageMarkdownExportPayload {
    markdown: string;
    context: WorkspaceExportContext;
}

function dedupeNodes(nodes: LineageNode[]): LineageNode[] {
    const uniqueNodes = new Map<string, LineageNode>();
    for (const node of nodes) {
        if (!uniqueNodes.has(node.id)) {
            uniqueNodes.set(node.id, node);
        }
    }
    return Array.from(uniqueNodes.values());
}

function countUniqueEdges(results: FlowResult[]): number {
    const uniqueEdges = new Set<string>();
    for (const result of results) {
        for (const edge of result.edges) {
            const edgeId = typeof edge?.id === 'string'
                ? edge.id
                : `${String(edge?.sourceId ?? '')}->${String(edge?.targetId ?? '')}:${String(edge?.type ?? '')}`;
            uniqueEdges.add(edgeId);
        }
    }
    return uniqueEdges.size;
}

function describeNode(node: Pick<LineageNode, 'name' | 'type' | 'filePath' | 'lineNumber'>): string {
    const location = node.filePath
        ? (node.lineNumber && node.lineNumber > 0 ? ` — ${node.filePath}:${node.lineNumber}` : ` — ${node.filePath}`)
        : '';
    return `- \`${node.name}\` (${node.type})${location}`;
}

function appendNodeSection(lines: string[], title: string, nodes: LineageNode[]): void {
    lines.push(`## ${title}`);
    lines.push('');
    if (nodes.length === 0) {
        lines.push('- None');
        lines.push('');
        return;
    }

    for (const node of nodes) {
        lines.push(describeNode(node));
    }
    lines.push('');
}

export function buildLineageMarkdownExport(options: LineageMarkdownExportOptions): LineageMarkdownExportPayload {
    const { flowAnalyzer, node, direction, depth, scopeUri, expandedNodeCount = 0 } = options;

    const upstreamResult: FlowResult = direction === 'downstream'
        ? { nodes: [], edges: [], paths: [], depth: 0 }
        : flowAnalyzer.getUpstream(node.id, { maxDepth: depth, excludeExternal: false });
    const downstreamResult: FlowResult = direction === 'upstream'
        ? { nodes: [], edges: [], paths: [], depth: 0 }
        : flowAnalyzer.getDownstream(node.id, { maxDepth: depth, excludeExternal: false });

    const uniqueNodes = dedupeNodes([node, ...upstreamResult.nodes, ...downstreamResult.nodes]);
    const edgeCount = countUniqueEdges([upstreamResult, downstreamResult]);

    const context: WorkspaceExportContext = {
        exportedAt: new Date().toISOString(),
        view: 'lineage',
        nodeCount: uniqueNodes.length,
        edgeCount,
        scopeUri,
        lineage: {
            centerNodeId: node.id,
            centerNodeName: node.name,
            centerNodeType: node.type,
            direction,
            depth,
            expandedNodeCount,
            upstreamCount: upstreamResult.nodes.length,
            downstreamCount: downstreamResult.nodes.length,
        },
    };

    const metadata = buildWorkspaceExportMetadata(context);
    const scopeLabel = typeof metadata.scope === 'object' && metadata.scope && 'uri' in metadata.scope
        ? (metadata.scope as { uri?: string }).uri
        : undefined;

    const lines: string[] = [
        '# Lineage Graph',
        '',
        `- Exported: ${context.exportedAt}`,
        `- Node: ${node.type} \`${node.name}\``,
        `- Direction: ${direction}`,
        `- Depth: ${depth}`,
        `- Nodes: ${context.nodeCount}`,
        `- Edges: ${context.edgeCount}`,
    ];

    if (scopeLabel) {
        lines.push(`- Scope: ${scopeLabel}`);
    }
    lines.push(`- Expanded Nodes: ${expandedNodeCount}`);
    lines.push('');

    appendNodeSection(lines, 'Upstream', upstreamResult.nodes);
    appendNodeSection(lines, 'Downstream', downstreamResult.nodes);

    return {
        markdown: lines.join('\n'),
        context,
    };
}
