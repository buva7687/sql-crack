/**
 * Data Flow Analysis
 * Tracks column lineage and data transformations through SQL queries
 */

import { Node as FlowNode, Edge } from 'reactflow';

export interface DataFlowAnalysis {
    columnLineage: ColumnLineage[];
    transformationPoints: TransformationPoint[];
    dataVolumeEstimates: DataVolumeEstimate[];
    flowSummary: string;
}

export interface ColumnLineage {
    outputColumn: string;
    sourceColumns: SourceColumn[];
    transformationType: 'direct' | 'aggregation' | 'calculation' | 'constant';
    expression?: string;
}

export interface SourceColumn {
    table: string;
    column: string;
}

export interface TransformationPoint {
    id: string;
    type: 'join' | 'filter' | 'aggregate' | 'sort' | 'limit';
    description: string;
    estimatedImpact: 'high' | 'medium' | 'low';
}

export interface DataVolumeEstimate {
    nodeId: string;
    stage: string;
    estimatedRows: 'many' | 'reduced' | 'few' | 'single';
    reasoning: string;
}

/**
 * Analyze data flow through the query
 */
export function analyzeDataFlow(ast: any, nodes: FlowNode[], edges: Edge[]): DataFlowAnalysis {
    const analysis: DataFlowAnalysis = {
        columnLineage: [],
        transformationPoints: [],
        dataVolumeEstimates: [],
        flowSummary: ''
    };

    try {
        if (ast.type === 'select') {
            analyzeSelectFlow(ast, nodes, edges, analysis);
        } else if (ast.type === 'insert') {
            analyzeInsertFlow(ast, analysis);
        } else if (ast.type === 'update') {
            analyzeUpdateFlow(ast, analysis);
        } else if (ast.type === 'delete') {
            analyzeDeleteFlow(ast, analysis);
        }

        analysis.flowSummary = generateFlowSummary(analysis);
    } catch (error) {
        console.error('Error analyzing data flow:', error);
        analysis.flowSummary = 'Unable to analyze data flow';
    }

    return analysis;
}

function analyzeSelectFlow(ast: any, nodes: FlowNode[], edges: Edge[], analysis: DataFlowAnalysis): void {
    // Analyze column lineage
    if (ast.columns && Array.isArray(ast.columns)) {
        ast.columns.forEach((col: any) => {
            const lineage = extractColumnLineage(col, ast);
            if (lineage) {
                analysis.columnLineage.push(lineage);
            }
        });
    }

    // Identify transformation points

    // 1. FROM clause - initial data source
    if (ast.from && ast.from.length > 0) {
        ast.from.forEach((from: any, idx: number) => {
            analysis.dataVolumeEstimates.push({
                nodeId: `from_${idx}`,
                stage: `Source: ${from.table}`,
                estimatedRows: 'many',
                reasoning: 'Initial table scan'
            });
        });
    }

    // 2. JOINs - data combination
    const joinCount = countJoins(ast);
    if (joinCount > 0) {
        analysis.transformationPoints.push({
            id: 'joins',
            type: 'join',
            description: `${joinCount} JOIN operation${joinCount > 1 ? 's' : ''} combining data from multiple tables`,
            estimatedImpact: joinCount > 2 ? 'high' : 'medium'
        });

        analysis.dataVolumeEstimates.push({
            nodeId: 'after_joins',
            stage: 'After JOINs',
            estimatedRows: 'many',
            reasoning: `Data combined from ${joinCount + 1} tables`
        });
    }

    // 3. WHERE clause - filtering
    if (ast.where) {
        analysis.transformationPoints.push({
            id: 'filter',
            type: 'filter',
            description: 'WHERE clause filters rows based on conditions',
            estimatedImpact: 'high'
        });

        analysis.dataVolumeEstimates.push({
            nodeId: 'after_where',
            stage: 'After WHERE',
            estimatedRows: 'reduced',
            reasoning: 'Filtering reduces row count significantly'
        });
    }

    // 4. GROUP BY - aggregation
    if (ast.groupby) {
        analysis.transformationPoints.push({
            id: 'aggregate',
            type: 'aggregate',
            description: 'GROUP BY aggregates rows into groups',
            estimatedImpact: 'high'
        });

        analysis.dataVolumeEstimates.push({
            nodeId: 'after_groupby',
            stage: 'After GROUP BY',
            estimatedRows: 'few',
            reasoning: 'Aggregation condenses rows into groups'
        });
    }

    // 5. HAVING - post-aggregation filtering
    if (ast.having) {
        analysis.transformationPoints.push({
            id: 'having',
            type: 'filter',
            description: 'HAVING clause filters aggregated results',
            estimatedImpact: 'medium'
        });
    }

    // 6. ORDER BY - sorting
    if (ast.orderby) {
        analysis.transformationPoints.push({
            id: 'sort',
            type: 'sort',
            description: `ORDER BY sorts results by ${ast.orderby.length} column${ast.orderby.length > 1 ? 's' : ''}`,
            estimatedImpact: 'low'
        });
    }

    // 7. LIMIT - row limiting
    if (ast.limit) {
        analysis.transformationPoints.push({
            id: 'limit',
            type: 'limit',
            description: `LIMIT restricts output to ${ast.limit.value?.[0]?.value || 'N'} rows`,
            estimatedImpact: 'medium'
        });

        analysis.dataVolumeEstimates.push({
            nodeId: 'final',
            stage: 'Final Output',
            estimatedRows: 'few',
            reasoning: 'LIMIT explicitly restricts row count'
        });
    } else if (!analysis.dataVolumeEstimates.find(e => e.nodeId === 'final')) {
        // No LIMIT
        const lastEstimate = analysis.dataVolumeEstimates[analysis.dataVolumeEstimates.length - 1];
        analysis.dataVolumeEstimates.push({
            nodeId: 'final',
            stage: 'Final Output',
            estimatedRows: lastEstimate?.estimatedRows || 'many',
            reasoning: 'No LIMIT clause - full result set returned'
        });
    }

    // 8. CTEs - intermediate transformations
    if (ast.with && ast.with.length > 0) {
        ast.with.forEach((cte: any, idx: number) => {
            analysis.transformationPoints.push({
                id: `cte_${idx}`,
                type: 'aggregate',
                description: `CTE "${cte.name}" creates intermediate result set`,
                estimatedImpact: 'medium'
            });
        });
    }
}

function analyzeInsertFlow(ast: any, analysis: DataFlowAnalysis): void {
    analysis.transformationPoints.push({
        id: 'insert',
        type: 'aggregate',
        description: 'INSERT adds new rows to target table',
        estimatedImpact: 'high'
    });

    analysis.flowSummary = 'Data flows from source values/subquery into target table';
}

function analyzeUpdateFlow(ast: any, analysis: DataFlowAnalysis): void {
    analysis.transformationPoints.push({
        id: 'update',
        type: 'aggregate',
        description: 'UPDATE modifies existing rows',
        estimatedImpact: 'high'
    });

    if (ast.where) {
        analysis.dataVolumeEstimates.push({
            nodeId: 'update_target',
            stage: 'Rows Updated',
            estimatedRows: 'reduced',
            reasoning: 'WHERE clause limits affected rows'
        });
    } else {
        analysis.dataVolumeEstimates.push({
            nodeId: 'update_target',
            stage: 'Rows Updated',
            estimatedRows: 'many',
            reasoning: 'No WHERE clause - ALL rows updated'
        });
    }
}

function analyzeDeleteFlow(ast: any, analysis: DataFlowAnalysis): void {
    analysis.transformationPoints.push({
        id: 'delete',
        type: 'filter',
        description: 'DELETE removes rows from table',
        estimatedImpact: 'high'
    });

    if (ast.where) {
        analysis.dataVolumeEstimates.push({
            nodeId: 'delete_target',
            stage: 'Rows Deleted',
            estimatedRows: 'reduced',
            reasoning: 'WHERE clause limits affected rows'
        });
    } else {
        analysis.dataVolumeEstimates.push({
            nodeId: 'delete_target',
            stage: 'Rows Deleted',
            estimatedRows: 'many',
            reasoning: 'No WHERE clause - ALL rows deleted'
        });
    }
}

function extractColumnLineage(column: any, ast: any): ColumnLineage | null {
    try {
        const outputColumn = column.as || column.expr?.column || 'unknown';

        // Direct column reference
        if (column.expr?.type === 'column_ref') {
            return {
                outputColumn,
                sourceColumns: [{
                    table: column.expr.table || 'unknown',
                    column: column.expr.column
                }],
                transformationType: 'direct'
            };
        }

        // Aggregation
        if (column.expr?.type === 'aggr_func') {
            const func = column.expr.name?.toUpperCase() || 'UNKNOWN';
            const srcCol = column.expr.args?.expr?.column || '*';
            const srcTable = column.expr.args?.expr?.table || 'unknown';

            return {
                outputColumn,
                sourceColumns: [{
                    table: srcTable,
                    column: srcCol
                }],
                transformationType: 'aggregation',
                expression: `${func}(${srcCol})`
            };
        }

        // Binary expression (calculation)
        if (column.expr?.type === 'binary_expr') {
            return {
                outputColumn,
                sourceColumns: extractBinaryExprColumns(column.expr),
                transformationType: 'calculation',
                expression: stringifyExpression(column.expr)
            };
        }

        // Constant value
        if (column.expr?.type === 'number' || column.expr?.type === 'string') {
            return {
                outputColumn,
                sourceColumns: [],
                transformationType: 'constant',
                expression: String(column.expr.value)
            };
        }

        return null;
    } catch (error) {
        return null;
    }
}

function extractBinaryExprColumns(expr: any): SourceColumn[] {
    const columns: SourceColumn[] = [];

    if (expr.left?.type === 'column_ref') {
        columns.push({
            table: expr.left.table || 'unknown',
            column: expr.left.column
        });
    } else if (expr.left?.type === 'binary_expr') {
        columns.push(...extractBinaryExprColumns(expr.left));
    }

    if (expr.right?.type === 'column_ref') {
        columns.push({
            table: expr.right.table || 'unknown',
            column: expr.right.column
        });
    } else if (expr.right?.type === 'binary_expr') {
        columns.push(...extractBinaryExprColumns(expr.right));
    }

    return columns;
}

function stringifyExpression(expr: any): string {
    if (expr.type === 'column_ref') {
        return expr.column;
    }
    if (expr.type === 'number' || expr.type === 'string') {
        return String(expr.value);
    }
    if (expr.type === 'binary_expr') {
        const left = stringifyExpression(expr.left);
        const right = stringifyExpression(expr.right);
        return `${left} ${expr.operator} ${right}`;
    }
    return 'expression';
}

function countJoins(ast: any): number {
    if (!ast.from) return 0;
    return ast.from.filter((f: any) => f.join).length;
}

function generateFlowSummary(analysis: DataFlowAnalysis): string {
    if (analysis.transformationPoints.length === 0) {
        return 'Simple data flow with no major transformations';
    }

    const parts: string[] = [];

    const hasJoins = analysis.transformationPoints.some(t => t.type === 'join');
    const hasFilters = analysis.transformationPoints.some(t => t.type === 'filter');
    const hasAggregations = analysis.transformationPoints.some(t => t.type === 'aggregate');
    const hasSorting = analysis.transformationPoints.some(t => t.type === 'sort');

    if (hasJoins) parts.push('combines data from multiple sources');
    if (hasFilters) parts.push('filters rows');
    if (hasAggregations) parts.push('aggregates results');
    if (hasSorting) parts.push('sorts output');

    if (parts.length === 0) {
        return 'Data flows through query with minimal transformation';
    }

    return `Data ${parts.join(', ')} before final output`;
}

/**
 * Get color for transformation impact
 */
export function getImpactColor(impact: string): string {
    switch (impact) {
        case 'high':
            return '#f56565';
        case 'medium':
            return '#ed8936';
        case 'low':
            return '#48bb78';
        default:
            return '#888';
    }
}

/**
 * Get icon for transformation type
 */
export function getTransformationIcon(type: string): string {
    switch (type) {
        case 'join':
            return '🔗';
        case 'filter':
            return '🔍';
        case 'aggregate':
            return '📊';
        case 'sort':
            return '⬆️';
        case 'limit':
            return '✂️';
        default:
            return '⚙️';
    }
}
