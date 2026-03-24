import { FlowEdge, FlowNode } from '../types';
import { calculateQueryDepth, getQueryComplexityInfo } from '../rendering/computations';

export function calculateQueryDepthFeature(nodes: FlowNode[], edges: FlowEdge[]): number {
    return calculateQueryDepth(nodes, edges);
}

export function getQueryComplexityInfoFeature(nodes: FlowNode[], edges: FlowEdge[]): {
    nodeCount: number;
    tableCount: number;
    depth: number;
    isComplex: boolean;
} {
    return getQueryComplexityInfo(nodes, edges);
}
