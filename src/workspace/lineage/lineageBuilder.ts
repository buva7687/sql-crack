// Lineage Builder - Build lineage graph from workspace index

import {
    WorkspaceIndex,
    SchemaDefinition,
    FileAnalysis,
    TableReference
} from '../types';
import { ColumnInfo } from '../extraction/types';
import { getDisplayName, getQualifiedKey, parseQualifiedKey } from '../identifiers';
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
        const seenNodes = new Set<string>();
        for (const defs of index.definitionMap.values()) {
            for (const def of defs) {
                const tableKey = getQualifiedKey(def.name, def.schema);
                const nodeId = this.getTableNodeId(def.type, tableKey);
                if (seenNodes.has(nodeId)) continue;
                seenNodes.add(nodeId);
                this.addDefinitionNode(def);
            }
        }

        // Add column nodes if enabled
        if (this.options.includeColumns) {
            for (const defs of index.definitionMap.values()) {
                for (const def of defs) {
                    const tableKey = getQualifiedKey(def.name, def.schema);
                    const nodeId = this.getTableNodeId(def.type, tableKey);
                    if (!this.nodes.has(nodeId)) continue;
                    this.addColumnNodes(tableKey, def.columns, def.type);
                }
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
        const tableKey = getQualifiedKey(def.name, def.schema);
        const nodeId = this.getTableNodeId(def.type, tableKey);
        const schemaPrefix = def.schema ? `${def.schema}.` : '';

        const node: LineageNode = {
            id: nodeId,
            type: def.type,
            name: getDisplayName(def.name, def.schema),
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
    addColumnNodes(tableKey: string, columns: ColumnInfo[], nodeType: 'table' | 'view'): void {
        const tableNode = this.nodes.get(this.getTableNodeId(nodeType, tableKey));
        if (!tableNode) return;

        for (const column of columns) {
            const columnId = this.getColumnNodeId(tableKey, column.name);
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
            const tableKey = getQualifiedKey(ref.tableName, ref.schema);

            // SELECT and JOIN references are data sources (inputs)
            if (ref.referenceType === 'select' || ref.referenceType === 'join' || ref.referenceType === 'subquery') {
                inputTables.add(tableKey);
            }

            // INSERT, UPDATE, DELETE targets are data destinations (outputs)
            if (ref.referenceType === 'insert' || ref.referenceType === 'update' || ref.referenceType === 'delete') {
                outputTables.add(tableKey);
            }
        }

        // Also treat definitions in this file as potential outputs
        // Only for views (always have SELECT) or CTAS (CREATE TABLE ... AS SELECT)
        for (const def of analysis.definitions) {
            const tableKey = getQualifiedKey(def.name, def.schema);

            // Views always derive from a SELECT query
            if (def.type === 'view' && inputTables.size > 0) {
                outputTables.add(tableKey);
            }
            // For tables, only treat as output if it's a CTAS (has AS SELECT in SQL)
            else if (def.type === 'table' && def.sql && inputTables.size > 0) {
                // Check for CTAS pattern: CREATE TABLE ... AS SELECT or AS (SELECT
                const ctasPattern = /\bAS\s+(?:SELECT|\()/i;
                if (ctasPattern.test(def.sql)) {
                    outputTables.add(tableKey);
                }
            }
        }

        // Remove self-references: a table can't be both input and output in the same flow
        // (unless it's a recursive CTE, which we handle separately)
        for (const outputTable of outputTables) {
            inputTables.delete(outputTable);
        }

        // Create edges: each input flows into each output
        for (const sourceTableKey of inputTables) {
            const sourceNodeId = this.resolveTableNodeId(sourceTableKey);
            let sourceNode = sourceNodeId ? this.nodes.get(sourceNodeId) : undefined;

            // Create external source node if needed
            if (!sourceNode && this.options.includeExternal) {
                sourceNode = this.addExternalNode(sourceTableKey);
            }

            if (!sourceNode) continue;

            for (const targetTableKey of outputTables) {
                const targetNodeId = this.resolveTableNodeId(targetTableKey);
                let targetNode = targetNodeId ? this.nodes.get(targetNodeId) : undefined;

                // Create external target node if needed
                if (!targetNode && this.options.includeExternal) {
                    targetNode = this.addExternalNode(targetTableKey);
                }

                if (!targetNode) continue;

                // Don't create self-referential edges
                if (sourceNode.id === targetNode.id) continue;

                // Create edge from source to target
                const edgeId = `${sourceNode.id}->${targetNode.id}`;
                const existingEdge = this.edges.find(e => e.id === edgeId);

                if (!existingEdge) {
                    this.edges.push({
                        id: edgeId,
                        sourceId: sourceNode.id,
                        targetId: targetNode.id,
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
    addExternalNode(tableKey: string): LineageNode {
        const normalizedKey = getQualifiedKey(tableKey);
        const parsed = parseQualifiedKey(normalizedKey);
        const nodeId = this.getTableNodeId('external', normalizedKey);

        const node: LineageNode = {
            id: nodeId,
            type: 'external',
            name: getDisplayName(parsed.name, parsed.schema),
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
    private getTableNodeId(type: string, tableKey: string): string {
        return `${type}:${tableKey}`;
    }

    /**
     * Generate unique column node ID
     */
    private getColumnNodeId(tableKey: string, columnName: string): string {
        return `column:${tableKey}.${columnName.toLowerCase()}`;
    }

    private resolveTableNodeId(tableKey: string): string | null {
        const directId = this.getTableNodeId('table', tableKey);
        if (this.nodes.has(directId)) {
            return directId;
        }

        const parsed = parseQualifiedKey(tableKey);
        if (parsed.schema) {
            const fallbackKey = getQualifiedKey(parsed.name);
            const fallbackId = this.getTableNodeId('table', fallbackKey);
            if (this.nodes.has(fallbackId)) {
                return fallbackId;
            }
        }

        return null;
    }
}
