// Node and Edge type definitions for SQL flow visualization

import { ColumnInfo } from './lineage';

export type NodeType = 'table' | 'filter' | 'join' | 'aggregate' | 'sort' | 'limit' | 'select' | 'result' | 'cte' | 'union' | 'subquery' | 'window' | 'case' | 'cluster';

export type WarningType = 'unused' | 'dead-column' | 'expensive' | 'fan-out' | 'repeated-scan' | 'complex' | 'filter-pushdown' | 'non-sargable' | 'join-order' | 'index-suggestion';

export type Severity = 'low' | 'medium' | 'high';

export interface NodeWarning {
    type: WarningType;
    severity: Severity;
    message: string;
}

export interface WindowFunctionDetail {
    name: string;
    partitionBy?: string[];
    orderBy?: string[];
    frame?: string;
}

export interface AggregateFunctionDetail {
    name: string;
    expression: string;
    alias?: string;
}

export interface CaseCondition {
    when: string;
    then: string;
}

export interface CaseDetail {
    conditions: CaseCondition[];
    elseValue?: string;
    alias?: string;
}

export interface FlowNode {
    id: string;
    type: NodeType;
    label: string;
    description?: string;
    details?: string[];
    x: number;
    y: number;
    width: number;
    height: number;
    // Line numbers in SQL for editor sync
    startLine?: number;
    endLine?: number;
    // Join type for differentiated styling
    joinType?: string;
    // Table category for visual distinction
    tableCategory?: 'physical' | 'derived' | 'cte_reference' | 'table_function';
    // Access mode for read/write differentiation
    accessMode?: 'read' | 'write' | 'derived';
    // Operation type for write operations
    operationType?: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE' | 'CREATE_TABLE_AS' | 'CREATE_VIEW' | 'CREATE_TABLE';
    // For nested visualizations (CTEs, subqueries)
    children?: FlowNode[];
    childEdges?: FlowEdge[];
    expanded?: boolean;
    collapsible?: boolean;
    parentId?: string;
    depth?: number;
    // For window functions - detailed breakdown
    windowDetails?: {
        functions: WindowFunctionDetail[];
    };
    // For aggregate nodes - function details
    aggregateDetails?: {
        functions: AggregateFunctionDetail[];
        groupBy?: string[];
        having?: string;
    };
    // For CASE nodes - case details
    caseDetails?: {
        cases: CaseDetail[];
    };
    // For SELECT nodes - column details with source tracking
    columns?: ColumnInfo[];
    // For visual column lineage
    visibleColumns?: string[];
    columnPositions?: Map<string, { x: number; y: number }>;
    // For warning indicators
    warnings?: NodeWarning[];
    complexityLevel?: Severity;
    isBottleneck?: boolean;
}

export interface FlowEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    sqlClause?: string;
    clauseType?: 'join' | 'where' | 'having' | 'on' | 'filter' | 'flow' | 'merge_source' | 'merge_target';
    startLine?: number;
    endLine?: number;
}
