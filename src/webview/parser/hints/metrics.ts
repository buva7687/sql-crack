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
    edges.forEach(edge => {
        const count = fanOutMap.get(edge.source) || 0;
        fanOutMap.set(edge.source, count + 1);
    });
    context.stats.maxFanOut = Math.max(0, ...Array.from(fanOutMap.values()));

    // Calculate critical path length (longest path from source to result)
    const calculatePathLength = (nodeId: string, visited: Set<string>): number => {
        if (visited.has(nodeId)) {return 0;}
        visited.add(nodeId);

        const outgoing = edges.filter(e => e.source === nodeId);
        if (outgoing.length === 0) {return 1;}

        const maxChildPath = Math.max(
            ...outgoing.map(edge => calculatePathLength(edge.target, new Set(visited)))
        );
        return 1 + maxChildPath;
    };

    // Find root nodes (nodes with no incoming edges)
    const nodesWithIncoming = new Set(edges.map(e => e.target));
    const rootNodes = nodes.filter(n => !nodesWithIncoming.has(n.id));

    context.stats.criticalPathLength = Math.max(
        0,
        ...rootNodes.map(node => calculatePathLength(node.id, new Set()))
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
