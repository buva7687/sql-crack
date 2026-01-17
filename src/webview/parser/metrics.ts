// Complexity calculation and metrics

import { FlowNode, FlowEdge } from '../types';
import { getStats, setStats } from './state';

export function calculateComplexity(): void {
    const stats = getStats();
    const score =
        stats.tables * 1 +
        stats.joins * 3 +
        stats.subqueries * 5 +
        stats.ctes * 4 +
        stats.aggregations * 2 +
        stats.windowFunctions * 4 +
        stats.unions * 3 +
        stats.conditions * 0.5;

    const complexityScore = Math.round(score);

    let complexity: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex';
    if (score < 5) {
        complexity = 'Simple';
    } else if (score < 15) {
        complexity = 'Moderate';
    } else if (score < 30) {
        complexity = 'Complex';
    } else {
        complexity = 'Very Complex';
    }

    setStats({ complexityScore, complexity });
}

export function calculateEnhancedMetrics(nodes: FlowNode[], edges: FlowEdge[]): void {
    const stats = getStats();

    // Calculate max CTE depth
    let maxDepth = 0;
    nodes.forEach(node => {
        if (node.type === 'cte' && node.depth !== undefined) {
            maxDepth = Math.max(maxDepth, node.depth);
        }
    });

    // Calculate max fan-out (number of outgoing edges per node)
    const fanOutMap = new Map<string, number>();
    edges.forEach(edge => {
        const count = fanOutMap.get(edge.source) || 0;
        fanOutMap.set(edge.source, count + 1);
    });
    const maxFanOut = Math.max(0, ...Array.from(fanOutMap.values()));

    // Calculate critical path length (longest path from source to result)
    const calculatePathLength = (nodeId: string, visited: Set<string>): number => {
        if (visited.has(nodeId)) return 0;
        visited.add(nodeId);

        const outgoing = edges.filter(e => e.source === nodeId);
        if (outgoing.length === 0) return 1;

        const maxChildPath = Math.max(
            ...outgoing.map(edge => calculatePathLength(edge.target, new Set(visited)))
        );
        return 1 + maxChildPath;
    };

    // Find root nodes (nodes with no incoming edges)
    const nodesWithIncoming = new Set(edges.map(e => e.target));
    const rootNodes = nodes.filter(n => !nodesWithIncoming.has(n.id));

    const criticalPathLength = Math.max(
        0,
        ...rootNodes.map(node => calculatePathLength(node.id, new Set()))
    );

    // Complexity breakdown
    const complexityBreakdown = {
        joins: stats.joins * 3,
        subqueries: stats.subqueries * 2,
        ctes: stats.ctes * 2,
        aggregations: stats.aggregations * 1,
        windowFunctions: stats.windowFunctions * 2
    };

    setStats({
        maxCteDepth: maxDepth,
        maxFanOut,
        criticalPathLength,
        complexityBreakdown
    });

    // Identify bottlenecks (nodes with high fan-out or in critical path)
    nodes.forEach(node => {
        const fanOut = fanOutMap.get(node.id) || 0;
        if (fanOut >= 3) {
            if (!node.warnings) node.warnings = [];
            node.warnings.push({
                type: 'fan-out',
                severity: fanOut >= 5 ? 'high' : 'medium',
                message: `High fan-out: ${fanOut} outgoing connections`
            });
        }

        // Mark nodes with high complexity
        if ((node.type === 'join' && stats.joins > 3) ||
            (node.type === 'aggregate' && node.aggregateDetails && node.aggregateDetails.functions.length > 3)) {
            if (!node.warnings) node.warnings = [];
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
            node.complexityLevel = stats.joins > 5 ? 'high' : stats.joins > 2 ? 'medium' : 'low';
        } else if (node.type === 'aggregate') {
            const funcCount = node.aggregateDetails?.functions.length || 0;
            node.complexityLevel = funcCount > 4 ? 'high' : funcCount > 2 ? 'medium' : 'low';
        } else if (node.type === 'subquery') {
            node.complexityLevel = stats.subqueries > 2 ? 'high' : 'low';
        }
    });
}
