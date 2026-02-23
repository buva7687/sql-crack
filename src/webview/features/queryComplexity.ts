import { FlowEdge, FlowNode } from '../types';

export function calculateQueryDepthFeature(nodes: FlowNode[], edges: FlowEdge[]): number {
    const resultNode = nodes.find(node => node.type === 'result');
    if (!resultNode) {
        return 0;
    }

    const visited = new Set<string>();
    let maxDepth = 0;

    const dfs = (nodeId: string, depth: number): void => {
        if (visited.has(nodeId)) {
            return;
        }
        visited.add(nodeId);
        maxDepth = Math.max(maxDepth, depth);

        for (const edge of edges) {
            if (edge.target === nodeId) {
                dfs(edge.source, depth + 1);
            }
        }
    };

    dfs(resultNode.id, 0);
    return maxDepth;
}

export function getQueryComplexityInfoFeature(nodes: FlowNode[], edges: FlowEdge[]): {
    nodeCount: number;
    tableCount: number;
    depth: number;
    isComplex: boolean;
} {
    const tableCount = nodes.filter(node => node.type === 'table').length;
    const depth = calculateQueryDepthFeature(nodes, edges);

    return {
        nodeCount: nodes.length,
        tableCount,
        depth,
        isComplex: nodes.length >= 8 || tableCount >= 5 || depth >= 3,
    };
}
