// Lineage Module - Exports all lineage functionality

// Types
export type {
    LineageNode,
    LineageEdge,
    LineageGraph,
    LineagePath,
    LineageQuery,
    LineageNodeOptions
} from './types';

// Classes
export { LineageBuilder } from './lineageBuilder';
export { ColumnLineageTracker } from './columnLineage';
export { FlowAnalyzer } from './flowAnalyzer';
export type { FlowOptions, FlowResult } from './flowAnalyzer';
export { ImpactAnalyzer } from './impactAnalyzer';
export type { ChangeType, ImpactReport, ImpactItem } from './impactAnalyzer';
