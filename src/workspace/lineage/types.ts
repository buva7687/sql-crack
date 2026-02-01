// Lineage Types - Core interfaces for data lineage tracking

import { ColumnInfo } from '../extraction/types';

/**
 * Node in the lineage graph
 */
export interface LineageNode {
    id: string;
    type: 'table' | 'view' | 'column' | 'cte' | 'external';
    name: string;
    parentId?: string;         // For columns, points to table node
    filePath?: string;
    lineNumber?: number;
    metadata: Record<string, any>;

    // Optional column-specific data
    columnInfo?: ColumnInfo;
}

/**
 * Edge in the lineage graph representing data flow
 */
export interface LineageEdge {
    id: string;
    sourceId: string;          // Source node (upstream)
    targetId: string;          // Target node (downstream)
    type: 'direct' | 'transform' | 'aggregate' | 'filter' | 'join';
    transformation?: string;   // Expression if transformed
    metadata: Record<string, any>;
}

/**
 * Column-to-column lineage edge
 * Tracks how specific columns flow through transformations
 */
export interface ColumnLineageEdge {
    id: string;
    sourceTableId: string;
    sourceColumnName: string;
    targetTableId: string;
    targetColumnName: string;
    transformationType: 'direct' | 'rename' | 'aggregate' | 'expression' | 'case' | 'cast' | 'coalesce' | 'join' | 'filter' | 'unknown';
    expression?: string;
    filePath: string;
    lineNumber: number;
    metadata?: Record<string, any>;
}

/**
 * Complete lineage graph with query methods
 */
export interface LineageGraph {
    nodes: Map<string, LineageNode>;
    edges: LineageEdge[];
    columnEdges: ColumnLineageEdge[];  // Column-level lineage edges

    // Query methods
    getUpstream(nodeId: string, depth?: number): LineageNode[];
    getDownstream(nodeId: string, depth?: number): LineageNode[];
    getColumnLineage(tableId: string, columnName: string): LineagePath[];
}

/**
 * A path through the lineage graph
 */
export interface LineagePath {
    nodes: LineageNode[];
    edges: LineageEdge[];
    depth: number;
}

/**
 * Query options for lineage traversal
 */
export interface LineageQuery {
    nodeId: string;
    direction: 'upstream' | 'downstream' | 'both';
    depth: number;             // -1 for unlimited
    includeColumns: boolean;
    filterTypes?: LineageNode['type'][];
}

/**
 * Lineage node creation options
 */
export interface LineageNodeOptions {
    includeExternal: boolean;
    includeColumns: boolean;
    resolveCTEs: boolean;
}
