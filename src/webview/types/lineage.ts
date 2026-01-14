// Column lineage and flow type definitions

export type TransformationType = 'passthrough' | 'renamed' | 'aggregated' | 'calculated';

export type LineageTransformation = 'source' | 'passthrough' | 'renamed' | 'aggregated' | 'calculated' | 'joined';

export interface ColumnInfo {
    name: string;
    expression: string;
    sourceTable?: string;
    sourceColumn?: string;
    isAggregate?: boolean;
    isWindowFunc?: boolean;
    transformationType?: TransformationType;
    sourceNodeId?: string;
}

export interface ColumnLineage {
    outputColumn: string;
    sources: Array<{
        table: string;
        column: string;
        nodeId: string;
    }>;
}

export interface LineagePathStep {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    columnName: string;
    transformation: LineageTransformation;
    expression?: string;
}

export interface ColumnFlow {
    id: string;
    outputColumn: string;
    outputNodeId: string;
    lineagePath: LineagePathStep[];
}
