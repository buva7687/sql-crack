import type { LineageGraph } from '../lineage';

function editDistance(a: string, b: string): number {
    const la = a.length;
    const lb = b.length;
    if (la === 0) { return lb; }
    if (lb === 0) { return la; }

    const dp: number[] = Array.from({ length: lb + 1 }, (_, i) => i);
    for (let i = 1; i <= la; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= lb; j++) {
            const tmp = dp[j];
            dp[j] = a[i - 1] === b[j - 1]
                ? prev
                : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = tmp;
        }
    }

    return dp[lb];
}

export function findSimilarTableNames(
    graph: LineageGraph,
    query: string,
    limit = 3
): string[] {
    const queryLower = query.toLowerCase();
    const candidates: Array<{ name: string; distance: number }> = [];

    for (const [, node] of graph.nodes) {
        if (node.type === 'column') {
            continue;
        }

        const nameLower = node.name.toLowerCase();
        if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
            candidates.push({ name: node.name, distance: 0 });
            continue;
        }

        const dist = editDistance(queryLower, nameLower);
        if (dist <= Math.max(3, Math.ceil(queryLower.length * 0.4))) {
            candidates.push({ name: node.name, distance: dist });
        }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.slice(0, limit).map(candidate => candidate.name);
}

export function resolveLineageNodeId(
    lineageGraph: LineageGraph,
    graphNodeId: string,
    nodeLabel: string,
    nodeType: string
): string | null {
    if (lineageGraph.nodes.has(graphNodeId)) {
        return graphNodeId;
    }

    const nameLower = nodeLabel.toLowerCase();
    const candidateId = `${nodeType}:${nameLower}`;
    if (lineageGraph.nodes.has(candidateId)) {
        return candidateId;
    }

    const typeAlternatives = nodeType === 'view'
        ? ['view', 'table']
        : nodeType === 'table'
            ? ['table', 'view']
            : nodeType === 'external'
                ? ['external', 'table', 'view']
                : [nodeType];
    for (const type of typeAlternatives) {
        const altId = `${type}:${nameLower}`;
        if (lineageGraph.nodes.has(altId)) {
            return altId;
        }
    }

    const normalizedLabel = nameLower
        .replace(/^["'`]+/, '')
        .replace(/["'`]+$/, '');
    for (const [id, node] of lineageGraph.nodes) {
        if (node.type === 'column') {
            continue;
        }

        const nodeNameLower = node.name.toLowerCase();
        const nodeTerminal = nodeNameLower.split('.').pop() || nodeNameLower;
        if (
            nodeNameLower === nameLower ||
            nodeNameLower === normalizedLabel ||
            nodeTerminal === nameLower ||
            nodeTerminal === normalizedLabel ||
            nodeNameLower.endsWith('.' + normalizedLabel)
        ) {
            return id;
        }
    }

    return null;
}

export function resolveRequestedLineageNodeId(
    lineageGraph: LineageGraph,
    requestedNodeId: string,
    nodeLabel?: string,
    nodeType?: string
): string {
    if (lineageGraph.nodes.has(requestedNodeId)) {
        return requestedNodeId;
    }

    const label = nodeLabel?.trim() || '';
    const type = nodeType?.trim() || '';
    if (label && type) {
        const resolved = resolveLineageNodeId(lineageGraph, requestedNodeId, label, type);
        if (resolved) {
            return resolved;
        }
    }

    return requestedNodeId;
}
