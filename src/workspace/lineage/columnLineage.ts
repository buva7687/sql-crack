// Column Lineage Tracker - Trace column-to-column data flow

import { LineageGraph, LineageNode, LineagePath } from './types';
import { ColumnReference } from '../extraction/types';

/**
 * Tracks column-level lineage through the graph
 */
export class ColumnLineageTracker {
    constructor(private graph: LineageGraph) {}

    /**
     * Trace a column back to its source(s)
     */
    traceColumnUpstream(
        graph: LineageGraph,
        tableId: string,
        columnName: string
    ): LineagePath[] {
        const paths: LineagePath[] = [];

        // Find the column node
        const columnId = this.getColumnNodeId(tableId, columnName);
        const columnNode = graph.nodes.get(columnId);

        if (!columnNode) {
            // If column node doesn't exist, try table-level lineage
            return this.traceTableUpstream(tableId);
        }

        // Get all upstream nodes
        const upstreamNodes = graph.getUpstream(columnId, -1);

        // Group by source table
        const byTable = new Map<string, LineageNode[]>();
        for (const node of upstreamNodes) {
            if (node.type === 'column' || node.type === 'table') {
                const tableName = this.getTableNameFromNodeId(node.id);
                if (!byTable.has(tableName)) {
                    byTable.set(tableName, []);
                }
                byTable.get(tableName)!.push(node);
            }
        }

        // Create paths for each source table
        for (const [tableName, nodes] of byTable) {
            const edges = graph.edges.filter(e =>
                nodes.some(n => n.id === e.targetId) || e.targetId === columnId
            );

            paths.push({
                nodes: [columnNode, ...nodes],
                edges,
                depth: nodes.length
            });
        }

        return paths;
    }

    /**
     * Trace where a column is used downstream
     */
    traceColumnDownstream(
        graph: LineageGraph,
        tableId: string,
        columnName: string
    ): LineagePath[] {
        const paths: LineagePath[] = [];

        // Find the column node
        const columnId = this.getColumnNodeId(tableId, columnName);
        const columnNode = graph.nodes.get(columnId);

        if (!columnNode) {
            // If column node doesn't exist, try table-level lineage
            return this.traceTableDownstream(tableId);
        }

        // Get all downstream nodes
        const downstreamNodes = graph.getDownstream(columnId, -1);

        // Group by target table
        const byTable = new Map<string, LineageNode[]>();
        for (const node of downstreamNodes) {
            if (node.type === 'column' || node.type === 'table' || node.type === 'view') {
                const tableName = this.getTableNameFromNodeId(node.id);
                if (!byTable.has(tableName)) {
                    byTable.set(tableName, []);
                }
                byTable.get(tableName)!.push(node);
            }
        }

        // Create paths for each target table
        for (const [tableName, nodes] of byTable) {
            const edges = graph.edges.filter(e =>
                nodes.some(n => n.id === e.sourceId) || e.sourceId === columnId
            );

            paths.push({
                nodes: [columnNode, ...nodes],
                edges,
                depth: nodes.length
            });
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
     * Trace table-level upstream (fallback for missing column nodes)
     */
    private traceTableUpstream(tableId: string): LineagePath[] {
        const tableNode = this.graph.nodes.get(tableId);
        if (!tableNode) return [];

        const upstreamNodes = this.graph.getUpstream(tableId, -1);
        const edges = this.graph.edges.filter(e =>
            upstreamNodes.some(n => n.id === e.targetId)
        );

        return [{
            nodes: [tableNode, ...upstreamNodes],
            edges,
            depth: upstreamNodes.length
        }];
    }

    /**
     * Trace table-level downstream (fallback for missing column nodes)
     */
    private traceTableDownstream(tableId: string): LineagePath[] {
        const tableNode = this.graph.nodes.get(tableId);
        if (!tableNode) return [];

        const downstreamNodes = this.graph.getDownstream(tableId, -1);
        const edges = this.graph.edges.filter(e =>
            downstreamNodes.some(n => n.id === e.sourceId)
        );

        return [{
            nodes: [tableNode, ...downstreamNodes],
            edges,
            depth: downstreamNodes.length
        }];
    }

    /**
     * Generate column node ID
     */
    private getColumnNodeId(tableName: string, columnName: string): string {
        return `column:${tableName.toLowerCase()}.${columnName.toLowerCase()}`;
    }

    /**
     * Extract table name from node ID
     */
    private getTableNameFromNodeId(nodeId: string): string {
        const parts = nodeId.split(':');
        if (parts.length >= 2) {
            const typeAndName = parts[1];
            const dotIndex = typeAndName.indexOf('.');
            if (dotIndex !== -1) {
                return typeAndName.substring(0, dotIndex);
            }
            return typeAndName;
        }
        return nodeId;
    }
}
