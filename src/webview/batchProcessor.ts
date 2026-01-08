import { Node as FlowNode, Edge } from 'reactflow';
import { parseSqlToGraph, SqlDialect } from './sqlParser';

export interface QueryBatch {
    id: string;
    sql: string;
    nodes: FlowNode[];
    edges: Edge[];
    ast?: any;
    error?: string;
}

export interface BatchResult {
    queries: QueryBatch[];
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
}

/**
 * Splits a batch of SQL queries into individual queries
 * Handles common delimiters and removes empty queries
 */
export function splitSqlQueries(sqlCode: string): string[] {
    // Split by semicolon
    const queries = sqlCode
        .split(';')
        .map(q => q.trim())
        .filter(q => q.length > 0);

    return queries;
}

/**
 * Process multiple SQL queries and return batch results
 */
export function processBatchQueries(sqlCode: string, dialect: SqlDialect): BatchResult {
    const sqlQueries = splitSqlQueries(sqlCode);
    const queries: QueryBatch[] = [];
    let successfulQueries = 0;
    let failedQueries = 0;

    sqlQueries.forEach((sql, index) => {
        try {
            const { nodes, edges, ast } = parseSqlToGraph(sql, dialect);
            queries.push({
                id: `query-${index + 1}`,
                sql,
                nodes,
                edges,
                ast
            });
            successfulQueries++;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            queries.push({
                id: `query-${index + 1}`,
                sql,
                nodes: [],
                edges: [],
                error: errorMessage
            });
            failedQueries++;
        }
    });

    return {
        queries,
        totalQueries: sqlQueries.length,
        successfulQueries,
        failedQueries
    };
}

/**
 * Check if SQL contains multiple queries
 */
export function hasMultipleQueries(sqlCode: string): boolean {
    const queries = splitSqlQueries(sqlCode);
    return queries.length > 1;
}

/**
 * Get a preview of the SQL query (first 50 characters)
 */
export function getQueryPreview(sql: string): string {
    const preview = sql.substring(0, 50).trim();
    return preview + (sql.length > 50 ? '...' : '');
}
