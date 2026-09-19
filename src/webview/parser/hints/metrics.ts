import type { FlowEdge, FlowNode } from '../../types';
import type { ParserContext } from '../context';

export function calculateEnhancedMetrics(context: ParserContext, nodes: FlowNode[], edges: FlowEdge[]): void {
    // Calculate max CTE depth
    let maxDepth = 0;
    nodes.forEach(node => {
        if (node.type === 'cte' && node.depth !== undefined) {
            maxDepth = Math.max(maxDepth, node.depth);
        }
    });
    context.stats.maxCteDepth = maxDepth;

    // Calculate max fan-out (number of outgoing edges per node)
    const fanOutMap = new Map<string, number>();
    const outgoingByNode = new Map<string, string[]>();
    edges.forEach(edge => {
        const count = fanOutMap.get(edge.source) || 0;
        fanOutMap.set(edge.source, count + 1);
        const targets = outgoingByNode.get(edge.source) || [];
        targets.push(edge.target);
        outgoingByNode.set(edge.source, targets);
    });
    context.stats.maxFanOut = Math.max(0, ...Array.from(fanOutMap.values()));

    // Calculate critical path length (longest path from source to result)
    const pathLengthMemo = new Map<string, number>();
    const visiting = new Set<string>();
    const calculatePathLength = (nodeId: string): number => {
        const memoized = pathLengthMemo.get(nodeId);
        if (memoized !== undefined) {return memoized;}
        if (visiting.has(nodeId)) {return 0;}
        visiting.add(nodeId);

        const outgoing = outgoingByNode.get(nodeId) || [];
        const pathLength = outgoing.length === 0
            ? 1
            : 1 + Math.max(...outgoing.map(calculatePathLength));

        visiting.delete(nodeId);
        pathLengthMemo.set(nodeId, pathLength);
        return pathLength;
    };

    // Find root nodes (nodes with no incoming edges)
    const nodesWithIncoming = new Set(edges.map(e => e.target));
    const rootNodes = nodes.filter(n => !nodesWithIncoming.has(n.id));

    context.stats.criticalPathLength = Math.max(
        0,
        ...rootNodes.map(node => calculatePathLength(node.id))
    );

    // Complexity breakdown
    context.stats.complexityBreakdown = {
        joins: context.stats.joins * 3,           // Joins add significant complexity
        subqueries: context.stats.subqueries * 2,
        ctes: context.stats.ctes * 2,
        aggregations: context.stats.aggregations * 1,
        windowFunctions: context.stats.windowFunctions * 2
    };

    // Identify bottlenecks (nodes with high fan-out or in critical path)
    nodes.forEach(node => {
        const fanOut = fanOutMap.get(node.id) || 0;
        if (fanOut >= 3) {
            if (!node.warnings) {node.warnings = [];}
            node.warnings.push({
                type: 'fan-out',
                severity: fanOut >= 5 ? 'high' : 'medium',
                message: `High fan-out: ${fanOut} outgoing connections`
            });
        }

        // Mark nodes with high complexity
        if ((node.type === 'join' && context.stats.joins > 3) ||
            (node.type === 'aggregate' && node.aggregateDetails && node.aggregateDetails.functions.length > 3)) {
            if (!node.warnings) {node.warnings = [];}
            node.warnings.push({
                type: 'complex',
                severity: 'medium',
                message: 'Complex operation - may impact performance'
            });
        }
    });

    // Assign complexity levels to nodes
    nodes.forEach(node => {
        if (node.type === 'join') {
            node.complexityLevel = context.stats.joins > 5 ? 'high' : context.stats.joins > 2 ? 'medium' : 'low';
        } else if (node.type === 'aggregate') {
            const funcCount = node.aggregateDetails?.functions.length || 0;
            node.complexityLevel = funcCount > 4 ? 'high' : funcCount > 2 ? 'medium' : 'low';
        } else if (node.type === 'subquery') {
            node.complexityLevel = context.stats.subqueries > 2 ? 'high' : 'low';
        }
    });
}
