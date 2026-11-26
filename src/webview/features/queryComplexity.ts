import { FlowEdge, FlowNode } from '../types';
import { getQueryComplexityInfo } from '../rendering/computations';

export function getQueryComplexityInfoFeature(nodes: FlowNode[], edges: FlowEdge[]): {
    nodeCount: number;
    tableCount: number;
    depth: number;
    isComplex: boolean;
} {
    return getQueryComplexityInfo(nodes, edges);
}
