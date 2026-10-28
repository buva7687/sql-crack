import type { FlowEdge, FlowNode } from '../../types';

/** Upstream scope of a SELECT, excluding unrelated set-operation branches. */
export function getSelectSourceScope(selectId: string, nodes: Map<string, FlowNode>, incoming: Map<string, string[]>): Map<string, FlowNode> {
    const scope = new Map<string, FlowNode>();
    const pending = [selectId];
    while (pending.length) {
        const id = pending.pop()!;
        const node = nodes.get(id);
        if (!node || scope.has(id)) { continue; }
        scope.set(id, node);
        pending.push(...(incoming.get(id) || []));
    }
    return scope;
}

export function getIncomingEdgeMap(edges: FlowEdge[], includeExpressionSubqueries = true): Map<string, string[]> {
    const incoming = new Map<string, string[]>();
    for (const edge of edges) {
        if (!includeExpressionSubqueries && edge.clauseType === 'subquery_flow') { continue; }
        const sources = incoming.get(edge.target) || [];
        sources.push(edge.source);
        incoming.set(edge.target, sources);
    }
    return incoming;
}
