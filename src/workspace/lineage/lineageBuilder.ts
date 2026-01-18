// Lineage Builder - Build lineage graph from workspace index

import * as fs from 'fs';
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

        // Add CTEs by extracting them from file references
        // CTEs are referenced in queries but we need to find their definitions
        // We'll use the ReferenceExtractor to parse files and extract CTE definitions
        const cteNames = new Map<string, { name: string; filePath: string; lineNumber: number }>();
        
        // Extract CTEs from query analysis (if available)
        for (const [filePath, analysis] of index.files) {
            if (analysis.queries) {
                for (const query of analysis.queries) {
                    if (query.ctes) {
                        for (const cte of query.ctes) {
                            const cteKey = cte.name.toLowerCase();
                            if (!cteNames.has(cteKey)) {
                                cteNames.set(cteKey, {
                                    name: cte.name,
                                    filePath: filePath,
                                    lineNumber: cte.lineNumber
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // Also extract CTEs by parsing SQL files
        // This is a fallback when queries array is not populated
        for (const [filePath, analysis] of index.files) {
            // Only process if we don't have queries array (which would have CTEs)
            if (!analysis.queries || analysis.queries.length === 0) {
                try {
                    // filePath should be a file system path
                    if (fs.existsSync(filePath)) {
                        const sql = fs.readFileSync(filePath, 'utf8');
                        this.extractCTEsFromSQL(sql, filePath, cteNames);
                    }
                } catch (error) {
                    // File read error - skip this file
                    // This is expected if file was deleted or path is invalid
                }
            }
        }
        
        // Create CTE nodes
        for (const [cteKey, cteInfo] of cteNames) {
            const nodeId = this.getTableNodeId('cte', cteKey);
            if (seenNodes.has(nodeId)) continue;
            seenNodes.add(nodeId);
            
            // Create CTE node
            const cteNode: LineageNode = {
                id: nodeId,
                type: 'cte',
                name: cteInfo.name,
                filePath: cteInfo.filePath,
                lineNumber: cteInfo.lineNumber,
                metadata: {
                    isCTE: true
                }
            };
            
            this.nodes.set(nodeId, cteNode);
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
     * IMPORTANT: Edges are created per-statement, not per-file
     * This prevents false relationships between unrelated queries in the same file
     */
    private addFileEdges(filePath: string, analysis: FileAnalysis): void {
        // Collect CTE names from this file to filter them out
        const fileCteNames = new Set<string>();
        if (analysis.queries) {
            for (const query of analysis.queries) {
                if (query.ctes) {
                    for (const cte of query.ctes) {
                        fileCteNames.add(cte.name.toLowerCase());
                    }
                }
            }
        }

        // ALWAYS extract CTE names and subquery aliases directly from SQL file as a fallback/verification
        try {
            if (fs.existsSync(filePath)) {
                const sql = fs.readFileSync(filePath, 'utf8');
                this.extractCTEAndAliasNames(sql, fileCteNames);
            }
        } catch (error) {
            // File read error - skip
        }

        // Group references by statement index for per-statement lineage
        const statementRefs = new Map<number, { inputs: Set<string>; outputs: Set<string> }>();

        for (const ref of analysis.references) {
            const tableKey = getQualifiedKey(ref.tableName, ref.schema);
            const tableNameLower = ref.tableName.toLowerCase();

            // Skip CTE references - they are not real table references
            if (ref.referenceType === 'cte') {
                continue;
            }

            // Skip if the table name matches a known CTE or subquery alias
            if (fileCteNames.has(tableNameLower)) {
                continue;
            }

            // Get or create statement bucket (default to 0 for backward compatibility)
            const stmtIndex = ref.statementIndex ?? 0;
            if (!statementRefs.has(stmtIndex)) {
                statementRefs.set(stmtIndex, { inputs: new Set(), outputs: new Set() });
            }
            const stmtBucket = statementRefs.get(stmtIndex)!;

            // SELECT and JOIN references are data sources (inputs)
            if (ref.referenceType === 'select' || ref.referenceType === 'join' || ref.referenceType === 'subquery') {
                stmtBucket.inputs.add(tableKey);
            }

            // INSERT, UPDATE, DELETE targets are data destinations (outputs)
            if (ref.referenceType === 'insert' || ref.referenceType === 'update' || ref.referenceType === 'delete') {
                stmtBucket.outputs.add(tableKey);
            }
        }

        // Handle definitions (views, CTAS) - associate with statement 0 or their own bucket
        for (const def of analysis.definitions) {
            const tableKey = getQualifiedKey(def.name, def.schema);

            // Find a statement bucket that has inputs (for views/CTAS)
            // Views and CTAS derive from SELECT queries, so we need to find which statement they belong to
            for (const [stmtIndex, stmtBucket] of statementRefs) {
                // Views always derive from a SELECT query
                if (def.type === 'view' && stmtBucket.inputs.size > 0) {
                    stmtBucket.outputs.add(tableKey);
                    break; // Only add to one statement
                }
                // For tables, only treat as output if it's a CTAS
                else if (def.type === 'table' && def.sql && stmtBucket.inputs.size > 0) {
                    const ctasPattern = /\bAS\s+(?:SELECT|\()/i;
                    if (ctasPattern.test(def.sql)) {
                        stmtBucket.outputs.add(tableKey);
                        break;
                    }
                }
            }
        }

        // Create edges per statement: each input flows into each output within the same statement
        for (const [stmtIndex, stmtBucket] of statementRefs) {
            const { inputs, outputs } = stmtBucket;

            // Remove self-references within this statement
            for (const outputTable of outputs) {
                inputs.delete(outputTable);
            }

            // Skip if no outputs in this statement
            if (outputs.size === 0) continue;

            for (const sourceTableKey of inputs) {
                const sourceNodeId = this.resolveTableNodeId(sourceTableKey);
                let sourceNode = sourceNodeId ? this.nodes.get(sourceNodeId) : undefined;

                // Create external source node if needed
                if (!sourceNode && this.options.includeExternal) {
                    sourceNode = this.addExternalNode(sourceTableKey);
                }

                if (!sourceNode) continue;

                for (const targetTableKey of outputs) {
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
                                statementIndex: stmtIndex,
                                inputCount: inputs.size,
                                outputCount: outputs.size
                            }
                        });
                    }
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

    /**
     * Extract CTEs from SQL using parser and regex fallback
     */
    private extractCTEsFromSQL(
        sql: string,
        filePath: string,
        cteNames: Map<string, { name: string; filePath: string; lineNumber: number }>
    ): void {
        try {
            const { Parser } = require('node-sql-parser');
            const parser = new Parser();
            
            // Try different dialects
            const dialects = ['postgresql', 'mysql', 'transactsql', 'snowflake', 'bigquery'];
            
            for (const dialect of dialects) {
                try {
                    const ast = parser.astify(sql, { database: dialect });
                    const statements = Array.isArray(ast) ? ast : [ast];
                    
                    for (const stmt of statements) {
                        if (stmt && stmt.type) {
                            const stmtType = stmt.type.toLowerCase();
                            
                            // Check for WITH clause in SELECT statements
                            if (stmtType === 'select' && stmt.with) {
                                const withClause = Array.isArray(stmt.with) ? stmt.with : [stmt.with];
                                for (const cte of withClause) {
                                    const cteName = cte.name?.value || cte.name;
                                    if (cteName && typeof cteName === 'string') {
                                        const cteKey = cteName.toLowerCase();
                                        if (!cteNames.has(cteKey)) {
                                            const lineNumber = this.getLineNumberFromSQL(sql, cteName);
                                            cteNames.set(cteKey, {
                                                name: cteName,
                                                filePath: filePath,
                                                lineNumber: lineNumber
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // If we successfully parsed, break
                    break;
                } catch (parseError) {
                    // Try next dialect
                    continue;
                }
            }
        } catch (error) {
            // Parser not available or failed
        }
        
        // Fallback to regex extraction
        this.extractCTEsWithRegex(sql, filePath, cteNames);
    }

    /**
     * Extract CTEs using regex as fallback when parsing fails
     */
    private extractCTEsWithRegex(
        sql: string,
        filePath: string,
        cteNames: Map<string, { name: string; filePath: string; lineNumber: number }>
    ): void {
        // Match WITH ... AS patterns (handles both WITH name AS and WITH RECURSIVE name AS)
        const withPattern = /WITH\s+(?:RECURSIVE\s+)?(\w+)\s+AS\s*\(/gi;
        let match;
        
        while ((match = withPattern.exec(sql)) !== null) {
            const cteName = match[1];
            if (cteName && !this.isReservedWord(cteName)) {
                // Find line number
                const beforeMatch = sql.substring(0, match.index);
                const lineNumber = beforeMatch.split('\n').length;
                
                const cteKey = cteName.toLowerCase();
                if (!cteNames.has(cteKey)) {
                    cteNames.set(cteKey, {
                        name: cteName,
                        filePath: filePath,
                        lineNumber: lineNumber
                    });
                }
            }
        }
    }

    /**
     * Check if a word is a SQL reserved word (to filter out false positives)
     */
    private isReservedWord(word: string): boolean {
        const reserved = ['select', 'from', 'where', 'join', 'inner', 'left', 'right', 'outer', 'on', 'as', 'with', 'recursive'];
        return reserved.includes(word.toLowerCase());
    }

    /**
     * Get line number from SQL for a given identifier
     */
    private getLineNumberFromSQL(sql: string, identifier: string): number {
        // Find the first occurrence of the identifier that's part of a WITH clause
        const withPattern = new RegExp(`WITH\\s+(?:RECURSIVE\\s+)?${identifier}\\s+AS`, 'i');
        const match = withPattern.exec(sql);
        if (match) {
            const beforeMatch = sql.substring(0, match.index);
            return beforeMatch.split('\n').length;
        }
        return 1;
    }

    /**
     * Strip SQL comments from a string to simplify pattern matching
     * Handles both single-line (--) and multi-line comments
     */
    private stripSqlComments(sql: string): string {
        // Remove multi-line comments first (/* ... */)
        let result = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
        // Remove single-line comments (-- ... until end of line)
        result = result.replace(/--[^\n]*/g, ' ');
        return result;
    }

    /**
     * Extract CTE names and subquery aliases from SQL content
     * Consolidates all CTE/alias extraction patterns in one place
     */
    private extractCTEAndAliasNames(sql: string, cteNames: Set<string>): void {
        const reservedWords = new Set(['select', 'from', 'where', 'join', 'inner', 'left', 'right', 'outer', 'on', 'as', 'with', 'recursive']);
        let match;

        // Strip comments for cleaner pattern matching on CTE detection
        const sqlNoComments = this.stripSqlComments(sql);

        // Use regex to find CTE names: WITH name AS or WITH RECURSIVE name AS
        // Also handle multi-CTE: WITH name1 AS (...), name2 AS (...)
        const ctePattern = /WITH\s+(?:RECURSIVE\s+)?(\w+)\s+AS\s*\(/gi;
        while ((match = ctePattern.exec(sqlNoComments)) !== null) {
            const cteName = match[1];
            if (cteName && !reservedWords.has(cteName.toLowerCase())) {
                cteNames.add(cteName.toLowerCase());
            }
        }

        // Also check for comma-separated CTEs: WITH name1 AS (...), name2 AS (...)
        const multiCtePattern = /,\s*(\w+)\s+AS\s*\(/gi;
        while ((match = multiCtePattern.exec(sqlNoComments)) !== null) {
            const cteName = match[1];
            if (cteName && !reservedWords.has(cteName.toLowerCase())) {
                cteNames.add(cteName.toLowerCase());
            }
        }

        // Extract subquery aliases: ) AS alias_name
        // This catches subqueries in FROM clauses like: FROM (SELECT ...) AS customer_totals
        // Use original SQL for context checking but stripped SQL for pattern matching
        const subqueryAliasPattern = /\)\s+AS\s+(\w+)(?=\s|$|,|WHERE|JOIN|ON)/gi;
        while ((match = subqueryAliasPattern.exec(sqlNoComments)) !== null) {
            const aliasName = match[1];
            if (aliasName && !reservedWords.has(aliasName.toLowerCase())) {
                // Check if this alias appears in a FROM clause context (not a column alias)
                const beforeMatch = sqlNoComments.substring(Math.max(0, match.index - 300), match.index);
                const fromBefore = /\bFROM\s+\(/i.test(beforeMatch) || /\bUPDATE\s+\w+\s+FROM\s+\(/i.test(beforeMatch);
                if (fromBefore) {
                    cteNames.add(aliasName.toLowerCase());
                }
            }
        }

        // Extract subquery aliases from UPDATE...FROM patterns
        // Pattern: UPDATE table FROM (SELECT ...) AS alias
        const updateFromPattern = /UPDATE\s+\w+\s+FROM\s+\([^)]+\)\s+AS\s+(\w+)/gi;
        while ((match = updateFromPattern.exec(sqlNoComments)) !== null) {
            const aliasName = match[1];
            if (aliasName && !reservedWords.has(aliasName.toLowerCase())) {
                cteNames.add(aliasName.toLowerCase());
            }
        }

        // Extract subquery aliases using balanced parenthesis matching for complex subqueries
        // This handles multi-line and nested subqueries in UPDATE...FROM patterns
        this.extractSubqueryAliasesWithParenMatching(sqlNoComments, cteNames, reservedWords);
    }

    /**
     * Extract subquery aliases using balanced parenthesis matching
     * Handles complex nested subqueries that regex patterns may miss
     */
    private extractSubqueryAliasesWithParenMatching(sql: string, cteNames: Set<string>, reservedWords: Set<string>): void {
        let updateIndex = 0;
        while ((updateIndex = sql.indexOf('UPDATE', updateIndex)) !== -1) {
            const fromIndex = sql.indexOf('FROM', updateIndex);
            if (fromIndex === -1 || fromIndex > updateIndex + 500) {
                updateIndex += 6;
                continue;
            }

            // Find the opening paren after FROM
            const openParenIndex = sql.indexOf('(', fromIndex);
            if (openParenIndex === -1) {
                updateIndex += 6;
                continue;
            }

            // Find the matching closing paren using balanced counting
            let parenCount = 0;
            let closeParenIndex = -1;
            const maxSearchLength = Math.min(sql.length, openParenIndex + 2000);
            for (let i = openParenIndex; i < maxSearchLength; i++) {
                if (sql[i] === '(') parenCount++;
                else if (sql[i] === ')') {
                    parenCount--;
                    if (parenCount === 0) {
                        closeParenIndex = i;
                        break;
                    }
                }
            }

            if (closeParenIndex !== -1) {
                // Check for AS alias after the closing paren
                const afterParen = sql.substring(closeParenIndex + 1, closeParenIndex + 50).trim();
                const asMatch = afterParen.match(/^AS\s+(\w+)/i);
                if (asMatch) {
                    const aliasName = asMatch[1].toLowerCase();
                    if (!reservedWords.has(aliasName)) {
                        cteNames.add(aliasName);
                    }
                }
            }

            updateIndex = fromIndex + 1;
        }
    }
}
