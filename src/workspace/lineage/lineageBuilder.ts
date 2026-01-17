// Lineage Builder - Build lineage graph from workspace index

import {
    WorkspaceIndex,
    SchemaDefinition,
    FileAnalysis,
    TableReference
} from '../types';
import { ColumnInfo } from '../extraction/types';
import {
    LineageNode,
    LineageEdge,
    LineageGraph,
    LineagePath
} from './types';

/**
 * Builds lineage graph from workspace index
 */
export class LineageBuilder implements LineageGraph {
    nodes: Map<string, LineageNode> = new Map();
    edges: LineageEdge[] = [];
    private options: { includeExternal: boolean; includeColumns: boolean };

    constructor(options = { includeExternal: true, includeColumns: true }) {
        this.options = options;
    }

    /**
     * Build lineage graph from workspace index
     */
    buildFromIndex(index: WorkspaceIndex): LineageGraph {
        this.nodes.clear();
        this.edges = [];

        // Add all table/view definitions as nodes
        for (const def of index.definitionMap.values()) {
            this.addDefinitionNode(def);
        }

        // Add column nodes if enabled
        if (this.options.includeColumns) {
            for (const def of index.definitionMap.values()) {
                this.addColumnNodes(def.name, def.columns);
            }
        }

        // Create edges from file references
        for (const [filePath, analysis] of index.files) {
            this.addFileEdges(filePath, analysis);
        }

        return this;
    }

    /**
     * Add table/view definition as node
     */
    addDefinitionNode(def: SchemaDefinition): LineageNode {
        const nodeId = this.getTableNodeId(def.type, def.name);
        const schemaPrefix = def.schema ? `${def.schema}.` : '';

        const node: LineageNode = {
            id: nodeId,
            type: def.type,
            name: def.name,
            filePath: def.filePath,
            lineNumber: def.lineNumber,
            metadata: {
                schema: def.schema,
                fullName: `${schemaPrefix}${def.name}`,
                columnCount: def.columns.length
            }
        };

        this.nodes.set(nodeId, node);
        return node;
    }

    /**
     * Add column nodes for a table
     */
    addColumnNodes(tableName: string, columns: ColumnInfo[]): void {
        const tableNode = this.nodes.get(this.getTableNodeId('table', tableName));
        if (!tableNode) return;

        for (const column of columns) {
            const columnId = this.getColumnNodeId(tableName, column.name);
            const columnNode: LineageNode = {
                id: columnId,
                type: 'column',
                name: column.name,
                parentId: tableNode.id,
                metadata: {
                    dataType: column.dataType,
                    nullable: column.nullable,
                    isPrimaryKey: column.primaryKey
                },
                columnInfo: column
            };

            this.nodes.set(columnId, columnNode);

            // Add edge from table to column
            this.edges.push({
                id: `${tableNode.id}->${columnId}`,
                sourceId: tableNode.id,
                targetId: columnId,
                type: 'direct',
                metadata: { relationship: 'contains' }
            });
        }
    }

    /**
     * Create edges from query analysis (file references)
     *
     * Data flow logic:
     * - INSERT/UPDATE/DELETE targets are OUTPUTs (data flows INTO them)
     * - SELECT/JOIN tables are INPUTs (data flows FROM them)
     * - CREATE TABLE/VIEW definitions are OUTPUTs if the file has input references
     *
     * For each file, we create edges: INPUT tables → OUTPUT tables
     */
    private addFileEdges(filePath: string, analysis: FileAnalysis): void {
        // Separate references into inputs (sources) and outputs (targets)
        const inputTables: Set<string> = new Set();
        const outputTables: Set<string> = new Set();

        for (const ref of analysis.references) {
            const tableName = ref.tableName.toLowerCase();

            // SELECT and JOIN references are data sources (inputs)
            if (ref.referenceType === 'select' || ref.referenceType === 'join' || ref.referenceType === 'subquery') {
                inputTables.add(tableName);
            }

            // INSERT, UPDATE, DELETE targets are data destinations (outputs)
            if (ref.referenceType === 'insert' || ref.referenceType === 'update' || ref.referenceType === 'delete') {
                outputTables.add(tableName);
            }
        }

        // Also treat definitions in this file as potential outputs
        // (e.g., CREATE TABLE AS SELECT, CREATE VIEW AS SELECT)
        for (const def of analysis.definitions) {
            const tableName = def.name.toLowerCase();
            // If there are input tables, this definition is likely created from them
            if (inputTables.size > 0) {
                outputTables.add(tableName);
            }
        }

        // Remove self-references: a table can't be both input and output in the same flow
        // (unless it's a recursive CTE, which we handle separately)
        for (const outputTable of outputTables) {
            inputTables.delete(outputTable);
        }

        // Create edges: each input flows into each output
        for (const sourceTableName of inputTables) {
            const sourceNodeId = this.getTableNodeId('table', sourceTableName);
            let sourceNode = this.nodes.get(sourceNodeId);

            // Create external source node if needed
            if (!sourceNode && this.options.includeExternal) {
                sourceNode = this.addExternalNode(sourceTableName);
            }

            if (!sourceNode) continue;

            for (const targetTableName of outputTables) {
                const targetNodeId = this.getTableNodeId('table', targetTableName);
                let targetNode = this.nodes.get(targetNodeId);

                // Create external target node if needed
                if (!targetNode && this.options.includeExternal) {
                    targetNode = this.addExternalNode(targetTableName);
                }

                if (!targetNode) continue;

                // Don't create self-referential edges
                if (sourceNodeId === targetNodeId) continue;

                // Create edge from source to target
                const edgeId = `${sourceNodeId}->${targetNodeId}`;
                const existingEdge = this.edges.find(e => e.id === edgeId);

                if (!existingEdge) {
                    this.edges.push({
                        id: edgeId,
                        sourceId: sourceNodeId,
                        targetId: targetNodeId,
                        type: 'direct',
                        metadata: {
                            filePath,
                            inputCount: inputTables.size,
                            outputCount: outputTables.size
                        }
                    });
                }
            }
        }
    }

    /**
     * Map reference type to edge type
     */
    private mapReferenceTypeToEdgeType(refType: string): LineageEdge['type'] {
        const typeMap: Record<string, LineageEdge['type']> = {
            'select': 'direct',
            'join': 'join',
            'insert': 'direct',
            'update': 'direct',
            'delete': 'direct',
            'subquery': 'direct',
            'cte': 'direct'
        };

        return typeMap[refType] || 'direct';
    }

    /**
     * Resolve external references (tables not defined in workspace)
     */
    addExternalNode(tableName: string): LineageNode {
        const nodeId = this.getTableNodeId('external', tableName);

        const node: LineageNode = {
            id: nodeId,
            type: 'external',
            name: tableName,
            metadata: {
                isExternal: true
            }
        };

        this.nodes.set(nodeId, node);
        return node;
    }

    /**
     * Get all nodes upstream of a target (data sources)
     */
    getUpstream(nodeId: string, depth: number = -1): LineageNode[] {
        const visited = new Set<string>();
        const result: LineageNode[] = [];

        const traverse = (currentId: string, currentDepth: number) => {
            if (depth !== -1 && currentDepth >= depth) return;
            if (visited.has(currentId)) return;

            visited.add(currentId);

            // Find all edges pointing to current node (incoming edges)
            const incomingEdges = this.edges.filter(e => e.targetId === currentId);

            for (const edge of incomingEdges) {
                const sourceNode = this.nodes.get(edge.sourceId);
                if (sourceNode && !visited.has(sourceNode.id)) {
                    result.push(sourceNode);
                    traverse(sourceNode.id, currentDepth + 1);
                }
            }
        };

        traverse(nodeId, 0);
        return result;
    }

    /**
     * Get all nodes downstream of a source (data consumers)
     */
    getDownstream(nodeId: string, depth: number = -1): LineageNode[] {
        const visited = new Set<string>();
        const result: LineageNode[] = [];

        const traverse = (currentId: string, currentDepth: number) => {
            if (depth !== -1 && currentDepth >= depth) return;
            if (visited.has(currentId)) return;

            visited.add(currentId);

            // Find all edges from current node (outgoing edges)
            const outgoingEdges = this.edges.filter(e => e.sourceId === currentId);

            for (const edge of outgoingEdges) {
                const targetNode = this.nodes.get(edge.targetId);
                if (targetNode && !visited.has(targetNode.id)) {
                    result.push(targetNode);
                    traverse(targetNode.id, currentDepth + 1);
                }
            }
        };

        traverse(nodeId, 0);
        return result;
    }

    /**
     * Get column lineage path
     */
    getColumnLineage(tableId: string, columnName: string): LineagePath[] {
        const columnId = this.getColumnNodeId(tableId, columnName);
        const columnNode = this.nodes.get(columnId);

        if (!columnNode) return [];

        // Get upstream lineage
        const upstreamNodes = this.getUpstream(columnId, -1);
        const upstreamEdges = this.edges.filter(e =>
            upstreamNodes.some(n => n.id === e.targetId) || e.targetId === columnId
        );

        // Get downstream lineage
        const downstreamNodes = this.getDownstream(columnId, -1);
        const downstreamEdges = this.edges.filter(e =>
            downstreamNodes.some(n => n.id === e.sourceId) || e.sourceId === columnId
        );

        return [
            {
                nodes: [columnNode, ...upstreamNodes],
                edges: upstreamEdges,
                depth: upstreamNodes.length
            },
            {
                nodes: [columnNode, ...downstreamNodes],
                edges: downstreamEdges,
                depth: downstreamNodes.length
            }
        ];
    }

    /**
     * Generate unique table node ID
     */
    private getTableNodeId(type: string, name: string): string {
        return `${type}:${name.toLowerCase()}`;
    }

    /**
     * Generate unique column node ID
     */
    private getColumnNodeId(tableName: string, columnName: string): string {
        return `column:${tableName.toLowerCase()}.${columnName.toLowerCase()}`;
    }
}
