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
        const upstreamEdges = this.getMatchingColumnEdges(graph, tableId, columnName, 'target');

        if (upstreamEdges.length === 0) {
            // Fall back to table-level lineage
            if (graph.columnEdges?.some(edge => edge.targetTableId === tableId)) {return [];}
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
                            sourceColumn: graph.nodes.get(e.sourceColumnId || '')?.name || e.sourceColumnName,
                            targetColumn: graph.nodes.get(e.targetColumnId || '')?.name || e.targetColumnName,
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
        const downstreamEdges = this.getMatchingColumnEdges(graph, tableId, columnName, 'source');

        if (downstreamEdges.length === 0) {
            // Fall back to table-level lineage
            if (graph.columnEdges?.some(edge => edge.sourceTableId === tableId)) {return [];}
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
                            sourceColumn: graph.nodes.get(e.sourceColumnId || '')?.name || e.sourceColumnName,
                            targetColumn: graph.nodes.get(e.targetColumnId || '')?.name || e.targetColumnName,
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
        const upstreamEdges = this.getMatchingColumnEdges(graph, tableId, columnName, 'target');
        const downstreamEdges = this.getMatchingColumnEdges(graph, tableId, columnName, 'source');

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
        const node = this.graph.nodes.get(nodeId);
        if (node) {return node.name;}
        const prefixed = /^(table|view|cte|external):(.+)$/.exec(nodeId);
        if (prefixed && prefixed[2]) {
            return prefixed[2];
        }
        if (/^[A-Za-z0-9_.]+$/.test(nodeId)) {
            return nodeId;
        }
        return 'unknown_table';
    }

    private getTableMatchKey(nodeIdOrName: string): string | null {
        const value = (nodeIdOrName || '').trim();
        if (!value) {
            return null;
        }

        const prefixed = /^(table|view|cte|external):(.+)$/.exec(value);
        const tableName = prefixed ? prefixed[2] : value;
        if (!tableName || !/^[A-Za-z0-9_.]+$/.test(tableName)) {
            return null;
        }

        return tableName;
    }

    private getMatchingColumnEdges(
        graph: LineageGraph,
        tableId: string,
        columnName: string,
        direction: 'source' | 'target'
    ): ColumnLineageEdge[] {
        const requestedKey = this.getTableMatchKey(tableId);
        const matchesTable = (candidateId: string): boolean => candidateId === tableId || (
            !graph.nodes.has(tableId) && requestedKey !== null
            && this.getTableMatchKey(candidateId) === requestedKey
        );
        const edges = (graph.columnEdges || []).filter(edge => matchesTable(
            direction === 'source' ? edge.sourceTableId : edge.targetTableId
        ));
        const edgeName = (edge: ColumnLineageEdge): string => direction === 'source'
            ? edge.sourceColumnName : edge.targetColumnName;
        const edgeColumnId = (edge: ColumnLineageEdge): string | undefined => direction === 'source'
            ? edge.sourceColumnId : edge.targetColumnId;
        const columns = [...graph.nodes.values()].filter(node =>
            node.type === 'column' && node.parentId && matchesTable(node.parentId)
        );
        const exact = columns.find(node => node.name === columnName);
        if (exact) {
            return edges.filter(edge => edgeColumnId(edge)
                ? edgeColumnId(edge) === exact.id : edgeName(edge) === exact.name);
        }
        if (columns.length > 0) {return [];}
        // Legacy graphs may lack column IDs. Keep their case-insensitive lookup
        // only when it cannot merge distinct quoted columns.
        const foldedName = columnName.toLowerCase();
        if (edges.some(edge => edgeName(edge) === columnName)) {
            return edges.filter(edge => edgeName(edge) === columnName);
        }
        const foldedNames = new Set(edges.map(edgeName).filter(name => name.toLowerCase() === foldedName));
        return foldedNames.size === 1 ? edges.filter(edge => edgeName(edge).toLowerCase() === foldedName) : [];
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
