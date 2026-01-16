// Graph Types - Types for graph visualization and filtering

import { ColumnInfo } from '../extraction/types';

/**
 * Node in the visualization graph
 */
export interface GraphNode {
    id: string;
    type: 'file' | 'table' | 'view' | 'column' | 'external' | 'cte';
    label: string;
    sublabel?: string;

    // Position (set by layout engine)
    x: number;
    y: number;
    width: number;
    height: number;

    // Data
    filePath?: string;
    lineNumber?: number;
    columns?: ColumnInfo[];
    metadata: Record<string, any>;

    // Visual state
    highlighted?: boolean;
    dimmed?: boolean;
    expanded?: boolean;        // For expandable nodes (show columns)
}

/**
 * Edge in the visualization graph
 */
export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    type: 'dependency' | 'lineage' | 'column';
    label?: string;
    metadata: Record<string, any>;
}

/**
 * Graph visualization options
 */
export interface GraphOptions {
    mode: 'file' | 'table' | 'lineage' | 'column';
    direction: 'TB' | 'LR';    // Top-bottom or Left-right
    showColumns: boolean;
    showExternal: boolean;
    maxDepth: number;
    focusNode?: string;        // Center on this node
}

/**
 * Complete graph structure
 */
export interface Graph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    options: GraphOptions;
}

/**
 * Layout algorithm types
 */
export type LayoutType = 'hierarchical' | 'force-directed' | 'radial' | 'auto';

/**
 * Search options for graph filtering
 */
export interface SearchOptions {
    query: string;
    caseSensitive?: boolean;
    useRegex?: boolean;
    searchInLabels?: boolean;
    searchInMetadata?: boolean;
}

/**
 * Filter options
 */
export interface FilterOptions {
    nodeTypes?: GraphNode['type'][];
    edgeTypes?: GraphEdge['type'][];
    minDepth?: number;
    maxDepth?: number;
    excludeExternal?: boolean;
}
