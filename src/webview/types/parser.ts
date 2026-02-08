// Parser result and statistics type definitions

import { FlowNode, FlowEdge } from './nodes';
import { ColumnLineage, ColumnFlow } from './lineage';

export type SqlDialect = 'MySQL' | 'PostgreSQL' | 'TransactSQL' | 'MariaDB' | 'SQLite' | 'Snowflake' | 'BigQuery' | 'Hive' | 'Redshift' | 'Athena' | 'Trino';

export type ComplexityLevel = 'Simple' | 'Moderate' | 'Complex' | 'Very Complex';

export type HintType = 'warning' | 'info' | 'error';

export type HintCategory = 'performance' | 'quality' | 'best-practice' | 'complexity';

export type HintSeverity = 'low' | 'medium' | 'high';

export type FunctionCategory = 'scalar' | 'aggregate' | 'window' | 'tvf' | 'unknown';

export interface FunctionUsage {
    name: string;
    category: FunctionCategory;
    count?: number;
}

export interface ComplexityBreakdown {
    joins: number;
    subqueries: number;
    ctes: number;
    aggregations: number;
    windowFunctions: number;
}

export interface QueryStats {
    tables: number;
    joins: number;
    subqueries: number;
    ctes: number;
    aggregations: number;
    windowFunctions: number;
    unions: number;
    conditions: number;
    complexity: ComplexityLevel;
    complexityScore: number;
    // Enhanced metrics
    maxCteDepth?: number;
    maxFanOut?: number;
    criticalPathLength?: number;
    complexityBreakdown?: ComplexityBreakdown;
    // Performance metrics
    performanceScore?: number;
    performanceIssues?: number;
    // Function usage
    functionsUsed?: FunctionUsage[];
}

export interface OptimizationHint {
    type: HintType;
    message: string;
    suggestion?: string;
    category?: HintCategory;
    nodeId?: string;
    severity?: HintSeverity;
}

export interface QueryLineRange {
    startLine: number;
    endLine: number;
}

export interface ParseResult {
    nodes: FlowNode[];
    edges: FlowEdge[];
    stats: QueryStats;
    hints: OptimizationHint[];
    sql: string;
    columnLineage: ColumnLineage[];
    columnFlows?: ColumnFlow[];
    tableUsage: Map<string, number>;
    error?: string;
    partial?: boolean; // True when using regex fallback parser
}

export interface ParseError {
    queryIndex: number;
    line?: number;
    column?: number;
    message: string;
    sql: string;  // The specific statement that failed (truncated)
}

export interface BatchParseResult {
    queries: ParseResult[];
    totalStats: QueryStats;
    queryLineRanges?: QueryLineRange[];
    validationError?: ValidationError;
    // Enhanced error tracking for partial results
    parseErrors?: ParseError[];
    successCount?: number;
    errorCount?: number;
}

export interface ValidationError {
    type: 'size_limit' | 'query_count_limit' | 'timeout';
    message: string;
    details: {
        actual: number;
        limit: number;
        unit: string;
    };
}

export interface ValidationLimits {
    maxSqlSizeBytes: number;
    maxQueryCount: number;
}
