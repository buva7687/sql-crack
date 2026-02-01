// Column Lineage Tracker - Trace column-to-column data flow

import { LineageGraph, LineagePath, ColumnLineageEdge } from './types';

/**
 * Column lineage path with column-specific information
 */
export interface ColumnLineagePath {
    sourceTableId: string;
    sourceTableName: string;
    sourceColumnName: string;
    targetTableId: string;
    targetTableName: string;
    targetColumnName: string;
    transformationType: ColumnLineageEdge['transformationType'];
    expression?: string;
    filePath: string;
    lineNumber: number;
}

/**
 * Full column lineage result
 */
export interface ColumnLineageResult {
    upstream: ColumnLineagePath[];
    downstream: ColumnLineagePath[];
}

/**
 * Tracks column-level lineage through the graph
 */
export class ColumnLineageTracker {
    constructor(private graph: LineageGraph) {}

    /**
     * Trace a column back to its source(s)
     * Uses columnEdges to find upstream column dependencies
     */
    traceColumnUpstream(
        graph: LineageGraph,
        tableId: string,
        columnName: string
    ): LineagePath[] {
        const paths: LineagePath[] = [];
        const columnNameLower = columnName.toLowerCase();

        // Find all column edges where this column is the target
        const upstreamEdges = (graph.columnEdges || []).filter(edge => {
            const targetMatches = edge.targetTableId === tableId ||
                                  edge.targetTableId.endsWith(`:${this.getTableName(tableId)}`);
            const columnMatches = edge.targetColumnName.toLowerCase() === columnNameLower;
            return targetMatches && columnMatches;
        });

        if (upstreamEdges.length === 0) {
            // Fall back to table-level lineage
            return this.traceTableUpstream(graph, tableId);
        }

        // Group upstream edges by source table
        const bySourceTable = new Map<string, ColumnLineageEdge[]>();
        for (const edge of upstreamEdges) {
            const sourceTable = edge.sourceTableId;
            if (!bySourceTable.has(sourceTable)) {
                bySourceTable.set(sourceTable, []);
            }
            bySourceTable.get(sourceTable)!.push(edge);
        }

        // Create paths for each source table
        for (const [sourceTableId, edges] of bySourceTable) {
            const sourceNode = graph.nodes.get(sourceTableId);
            const targetNode = graph.nodes.get(tableId);

            if (sourceNode) {
                paths.push({
                    nodes: [sourceNode, ...(targetNode ? [targetNode] : [])],
                    edges: edges.map(e => ({
                        id: e.id,
                        sourceId: e.sourceTableId,
                        targetId: e.targetTableId,
                        type: this.mapTransformToEdgeType(e.transformationType),
                        transformation: e.expression,
                        metadata: {
                            sourceColumn: e.sourceColumnName,
                            targetColumn: e.targetColumnName,
                            ...e.metadata
                        }
                    })),
                    depth: 1
                });
            }
        }

        return paths;
    }

    /**
     * Trace where a column is used downstream
     * Uses columnEdges to find downstream column consumers
     */
    traceColumnDownstream(
        graph: LineageGraph,
        tableId: string,
        columnName: string
    ): LineagePath[] {
        const paths: LineagePath[] = [];
        const columnNameLower = columnName.toLowerCase();

        // Find all column edges where this column is the source
        const downstreamEdges = (graph.columnEdges || []).filter(edge => {
            const sourceMatches = edge.sourceTableId === tableId ||
                                  edge.sourceTableId.endsWith(`:${this.getTableName(tableId)}`);
            const columnMatches = edge.sourceColumnName.toLowerCase() === columnNameLower;
            return sourceMatches && columnMatches;
        });

        if (downstreamEdges.length === 0) {
            // Fall back to table-level lineage
            return this.traceTableDownstream(graph, tableId);
        }

        // Group downstream edges by target table
        const byTargetTable = new Map<string, ColumnLineageEdge[]>();
        for (const edge of downstreamEdges) {
            const targetTable = edge.targetTableId;
            if (!byTargetTable.has(targetTable)) {
                byTargetTable.set(targetTable, []);
            }
            byTargetTable.get(targetTable)!.push(edge);
        }

        // Create paths for each target table
        for (const [targetTableId, edges] of byTargetTable) {
            const sourceNode = graph.nodes.get(tableId);
            const targetNode = graph.nodes.get(targetTableId);

            if (targetNode) {
                paths.push({
                    nodes: [...(sourceNode ? [sourceNode] : []), targetNode],
                    edges: edges.map(e => ({
                        id: e.id,
                        sourceId: e.sourceTableId,
                        targetId: e.targetTableId,
                        type: this.mapTransformToEdgeType(e.transformationType),
                        transformation: e.expression,
                        metadata: {
                            sourceColumn: e.sourceColumnName,
                            targetColumn: e.targetColumnName,
                            ...e.metadata
                        }
                    })),
                    depth: 1
                });
            }
        }

        return paths;
    }

    /**
     * Get full column lineage (upstream + downstream)
     */
    getFullColumnLineage(
        graph: LineageGraph,
        tableId: string,
        columnName: string
    ): {
        upstream: LineagePath[];
        downstream: LineagePath[];
    } {
        return {
            upstream: this.traceColumnUpstream(graph, tableId, columnName),
            downstream: this.traceColumnDownstream(graph, tableId, columnName)
        };
    }

    /**
     * Get detailed column lineage paths
     */
    getColumnLineagePaths(
        graph: LineageGraph,
        tableId: string,
        columnName: string
    ): ColumnLineageResult {
        const columnNameLower = columnName.toLowerCase();
        const tableName = this.getTableName(tableId);

        // Find upstream column paths
        const upstreamEdges = (graph.columnEdges || []).filter(edge => {
            const targetMatches = edge.targetTableId === tableId ||
                                  edge.targetTableId.endsWith(`:${tableName}`);
            const columnMatches = edge.targetColumnName.toLowerCase() === columnNameLower;
            return targetMatches && columnMatches;
        });

        // Find downstream column paths
        const downstreamEdges = (graph.columnEdges || []).filter(edge => {
            const sourceMatches = edge.sourceTableId === tableId ||
                                  edge.sourceTableId.endsWith(`:${tableName}`);
            const columnMatches = edge.sourceColumnName.toLowerCase() === columnNameLower;
            return sourceMatches && columnMatches;
        });

        return {
            upstream: upstreamEdges.map(edge => ({
                sourceTableId: edge.sourceTableId,
                sourceTableName: this.getTableName(edge.sourceTableId),
                sourceColumnName: edge.sourceColumnName,
                targetTableId: edge.targetTableId,
                targetTableName: this.getTableName(edge.targetTableId),
                targetColumnName: edge.targetColumnName,
                transformationType: edge.transformationType,
                expression: edge.expression,
                filePath: edge.filePath,
                lineNumber: edge.lineNumber
            })),
            downstream: downstreamEdges.map(edge => ({
                sourceTableId: edge.sourceTableId,
                sourceTableName: this.getTableName(edge.sourceTableId),
                sourceColumnName: edge.sourceColumnName,
                targetTableId: edge.targetTableId,
                targetTableName: this.getTableName(edge.targetTableId),
                targetColumnName: edge.targetColumnName,
                transformationType: edge.transformationType,
                expression: edge.expression,
                filePath: edge.filePath,
                lineNumber: edge.lineNumber
            }))
        };
    }

    /**
     * Trace table-level upstream (fallback for missing column edges)
     */
    private traceTableUpstream(graph: LineageGraph, tableId: string): LineagePath[] {
        const tableNode = graph.nodes.get(tableId);
        if (!tableNode) {return [];}

        const upstreamNodes = graph.getUpstream(tableId, -1);
        const edges = graph.edges.filter(e =>
            upstreamNodes.some(n => n.id === e.targetId) || e.targetId === tableId
        );

        if (upstreamNodes.length === 0) {return [];}

        return [{
            nodes: [tableNode, ...upstreamNodes],
            edges,
            depth: upstreamNodes.length
        }];
    }

    /**
     * Trace table-level downstream (fallback for missing column edges)
     */
    private traceTableDownstream(graph: LineageGraph, tableId: string): LineagePath[] {
        const tableNode = graph.nodes.get(tableId);
        if (!tableNode) {return [];}

        const downstreamNodes = graph.getDownstream(tableId, -1);
        const edges = graph.edges.filter(e =>
            downstreamNodes.some(n => n.id === e.sourceId) || e.sourceId === tableId
        );

        if (downstreamNodes.length === 0) {return [];}

        return [{
            nodes: [tableNode, ...downstreamNodes],
            edges,
            depth: downstreamNodes.length
        }];
    }

    /**
     * Extract table name from node ID
     * Handles formats like "table:customers" or "view:my_view"
     */
    private getTableName(nodeId: string): string {
        const colonIndex = nodeId.indexOf(':');
        if (colonIndex !== -1) {
            return nodeId.substring(colonIndex + 1);
        }
        return nodeId;
    }

    /**
     * Map column transformation type to edge type
     */
    private mapTransformToEdgeType(transformType: ColumnLineageEdge['transformationType']): 'direct' | 'transform' | 'aggregate' | 'filter' | 'join' {
        switch (transformType) {
            case 'direct':
            case 'rename':
                return 'direct';
            case 'aggregate':
                return 'aggregate';
            case 'join':
                return 'join';
            case 'filter':
                return 'filter';
            default:
                return 'transform';
        }
    }
}
