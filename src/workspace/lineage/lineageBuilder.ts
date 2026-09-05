// Lineage Builder - Build lineage graph from workspace index

import * as fs from 'fs';
import { logger } from '../../logger';
import {
    WorkspaceIndex,
    SchemaDefinition,
    FileAnalysis,
    TableReference
} from '../types';
import { ColumnInfo, QueryAnalysis } from '../extraction/types';
import { getColumnKey, getDisplayName, getQualifiedKey, parseQualifiedKey } from '../identifiers';
import { getDollarQuotedTokenEnd } from '../../shared/stringUtils';
import {
    LineageNode,
    LineageEdge,
    LineageGraph,
    LineagePath,
    ColumnLineageEdge
} from './types';

type NodeSqlParserInstance = {
    astify: (sql: string, options?: { database?: string }) => any;
};
type NodeSqlParserCtor = new () => NodeSqlParserInstance;

let cachedSqlParserCtor: NodeSqlParserCtor | null | undefined;
const MAX_PRELOAD_CONCURRENCY = 20;

function getDefinitionKey(definition: SchemaDefinition): string {
    return getQualifiedKey(definition.name, definition.schema, definition);
}

function getReferenceKey(reference: TableReference): string {
    return getQualifiedKey(reference.tableName, reference.schema, reference);
}

function skipQuotedSqlToken(sql: string, startIndex: number): number {
    const quote = sql[startIndex];
    const closingQuote = quote === '[' ? ']' : quote;
    let index = startIndex + 1;

    while (index < sql.length) {
        if (sql[index] === '\\' && quote !== '[' && index + 1 < sql.length) {
            index += 2;
            continue;
        }
        if (sql[index] === closingQuote) {
            // SQL identifiers and strings escape their closing delimiter by doubling it.
            if (index + 1 < sql.length && sql[index + 1] === closingQuote) {
                index += 2;
                continue;
            }
            return index + 1;
        }
        index++;
    }

    return sql.length;
}

function skipDollarQuotedSqlToken(sql: string, startIndex: number): number | null {
    // Shared helper so identifier-embedded dollars and MySQL DELIMITER
    // directives are rejected here exactly as they are everywhere else.
    return getDollarQuotedTokenEnd(sql, startIndex);
}

/**
 * Replace comment contents with spaces while retaining every newline and string
 * index. Regex consumers can then safely map matches back to the original SQL.
 */
function maskSqlCommentsPreservingPositions(sql: string): string {
    const masked = sql.split('');
    let index = 0;

    const maskRange = (start: number, end: number): void => {
        for (let position = start; position < end; position++) {
            if (masked[position] !== '\n' && masked[position] !== '\r') {
                masked[position] = ' ';
            }
        }
    };

    while (index < sql.length) {
        const char = sql[index];

        const dollarQuotedEnd = skipDollarQuotedSqlToken(sql, index);
        if (dollarQuotedEnd !== null) {
            const tokenStart = index;
            index = dollarQuotedEnd;
            maskRange(tokenStart, index);
            continue;
        }

        if (char === "'" || char === '"' || char === '`' || char === '[') {
            const tokenStart = index;
            index = skipQuotedSqlToken(sql, index);
            maskRange(tokenStart, index);
            continue;
        }

        if (char === '-' && sql[index + 1] === '-') {
            const commentStart = index;
            while (index < sql.length && sql[index] !== '\n' && sql[index] !== '\r') {
                index++;
            }
            maskRange(commentStart, index);
            continue;
        }

        if (char === '/' && sql[index + 1] === '*') {
            const commentStart = index;
            let depth = 1;
            index += 2;

            while (index < sql.length && depth > 0) {
                if (sql[index] === '/' && sql[index + 1] === '*') {
                    depth++;
                    index += 2;
                } else if (sql[index] === '*' && sql[index + 1] === '/') {
                    depth--;
                    index += 2;
                } else {
                    index++;
                }
            }

            maskRange(commentStart, index);
            continue;
        }

        // Preserve SQL Server temp-table identifiers such as #staging and ##global_staging.
        const isTempTableIdentifier = char === '#' && (
            /[a-zA-Z0-9_]/.test(sql[index + 1] || '') ||
            (sql[index + 1] === '#' && /[a-zA-Z0-9_]/.test(sql[index + 2] || ''))
        );
        if (char === '#' && !isTempTableIdentifier) {
            const commentStart = index;
            while (index < sql.length && sql[index] !== '\n' && sql[index] !== '\r') {
                index++;
            }
            maskRange(commentStart, index);
            continue;
        }

        index++;
    }

    return masked.join('');
}

function findMatchingSqlParenthesis(sql: string, openingIndex: number): number {
    let depth = 0;

    for (let index = openingIndex; index < sql.length; index++) {
        const char = sql[index];
        const dollarQuotedEnd = skipDollarQuotedSqlToken(sql, index);
        if (dollarQuotedEnd !== null) {
            index = dollarQuotedEnd - 1;
            continue;
        }
        if (char === "'" || char === '"' || char === '`' || char === '[') {
            index = skipQuotedSqlToken(sql, index) - 1;
            continue;
        }
        if (char === '(') {
            depth++;
        } else if (char === ')') {
            depth--;
            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
}

function findCteDeclarations(sql: string): Array<{ name: string; index: number }> {
    const maskedSql = maskSqlCommentsPreservingPositions(sql);
    const declarations: Array<{ name: string; index: number }> = [];
    const withPattern = /\b(WITH\s+(?:RECURSIVE\s+)?)(\w+)\s+AS\s*\(/gi;
    let match: RegExpExecArray | null;

    while ((match = withPattern.exec(maskedSql)) !== null) {
        let cteName = match[2];
        let nameIndex = match.index + match[1].length;
        let openingIndex = match.index + match[0].lastIndexOf('(');

        while (cteName) {
            declarations.push({ name: cteName, index: nameIndex });

            const closingIndex = findMatchingSqlParenthesis(maskedSql, openingIndex);
            if (closingIndex < 0) {
                break;
            }

            let nextIndex = closingIndex + 1;
            while (nextIndex < maskedSql.length && /\s/.test(maskedSql[nextIndex])) {
                nextIndex++;
            }
            if (maskedSql[nextIndex] !== ',') {
                break;
            }

            nextIndex++;
            while (nextIndex < maskedSql.length && /\s/.test(maskedSql[nextIndex])) {
                nextIndex++;
            }

            const nextCteMatch = /^(\w+)\s+AS\s*\(/i.exec(maskedSql.slice(nextIndex));
            if (!nextCteMatch) {
                break;
            }

            cteName = nextCteMatch[1];
            nameIndex = nextIndex;
            openingIndex = nextIndex + nextCteMatch[0].lastIndexOf('(');
        }
    }

    return declarations;
}

function getNodeSqlParserCtor(): NodeSqlParserCtor | null {
    if (cachedSqlParserCtor !== undefined) {
        return cachedSqlParserCtor;
    }
    try {
        const moduleRef = require('node-sql-parser') as Record<string, unknown>;
        const parserCtor = moduleRef?.['Parser'];
        cachedSqlParserCtor = typeof parserCtor === 'function' ? (parserCtor as NodeSqlParserCtor) : null;
    } catch (error) {
        cachedSqlParserCtor = null;
        logger.debug('[LineageBuilder] node-sql-parser unavailable; CTE extraction will use regex fallback.');
    }
    return cachedSqlParserCtor;
}

/**
 * Builds lineage graph from workspace index
 */
export class LineageBuilder implements LineageGraph {
    nodes: Map<string, LineageNode> = new Map();
    edges: LineageEdge[] = [];
    columnEdges: import('./types').ColumnLineageEdge[] = [];
    private edgeIds = new Set<string>();
    private columnEdgeIds = new Set<string>();
    private incomingEdgesByNodeId: Map<string, LineageEdge[]> = new Map();
    private outgoingEdgesByNodeId: Map<string, LineageEdge[]> = new Map();
    private columnNodesByParentId: Map<string, LineageNode[]> = new Map();
    private options: { includeExternal: boolean; includeColumns: boolean };

    constructor(options = { includeExternal: true, includeColumns: true }) {
        this.options = options;
    }

    async buildFromIndexAsync(index: WorkspaceIndex): Promise<LineageGraph> {
        const fileSqlByPath = await this.preloadFileSql(index.files);
        return this.buildFromIndexCore(index, fileSqlByPath);
    }

    /**
     * Build lineage graph from workspace index
     */
    buildFromIndex(index: WorkspaceIndex): LineageGraph {
        return this.buildFromIndexCore(index);
    }

    private buildFromIndexCore(index: WorkspaceIndex, fileSqlByPath?: Map<string, string>): LineageGraph {
        this.nodes.clear();
        this.edges = [];
        this.columnEdges = [];
        this.edgeIds.clear();
        this.columnEdgeIds.clear();
        this.incomingEdgesByNodeId.clear();
        this.outgoingEdgesByNodeId.clear();
        this.columnNodesByParentId.clear();

        // Add all table/view definitions as nodes
        const seenNodes = new Set<string>();
        for (const defs of index.definitionMap.values()) {
            for (const def of defs) {
                const tableKey = getDefinitionKey(def);
                const nodeId = this.getTableNodeId(def.type, tableKey);
                if (seenNodes.has(nodeId)) {continue;}
                seenNodes.add(nodeId);
                this.addDefinitionNode(def);
            }
        }

        // Add CTEs by extracting them from file references
        // CTEs are referenced in queries but we need to find their definitions
        // We'll use the ReferenceExtractor to parse files and extract CTE definitions
        const cteNames = new Map<string, { name: string; filePath: string; lineNumber: number }>();
        const collectQueryCtes = (query: QueryAnalysis, filePath: string): void => {
            for (const cte of query.ctes || []) {
                const cteKey = cte.name.toLowerCase();
                if (!cteNames.has(cteKey)) {
                    cteNames.set(cteKey, {
                        name: cte.name,
                        filePath,
                        lineNumber: cte.lineNumber,
                    });
                }
                if (cte.query) {
                    collectQueryCtes(cte.query, filePath);
                }
            }
        };
        
        // Extract CTEs from query analysis (if available)
        for (const [filePath, analysis] of index.files) {
            if (analysis.queries) {
                for (const query of analysis.queries) {
                    collectQueryCtes(query, filePath);
                }
            }
        }
        
        // Also extract CTEs by parsing SQL files
        // This is a fallback when queries array is not populated
        for (const [filePath, analysis] of index.files) {
            // Only process if we don't have queries array (which would have CTEs)
            if (!analysis.queries || analysis.queries.length === 0) {
                const sql = this.resolveFileSql(filePath, analysis, fileSqlByPath, 'debug', 'CTE extraction');
                if (!sql) {continue;}

                this.extractCTEsFromSQL(sql, filePath, cteNames);
            }
        }
        
        // Create CTE nodes
        for (const [cteKey, cteInfo] of cteNames) {
            const nodeId = this.getTableNodeId('cte', cteKey);
            if (seenNodes.has(nodeId)) {continue;}
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
            for (const [key, defs] of index.definitionMap.entries()) {
                for (const def of defs) {
                    const tableKey = getDefinitionKey(def);
                    const nodeId = this.getTableNodeId(def.type, tableKey);
                    if (!this.nodes.has(nodeId)) {continue;}
                    this.addColumnNodes(tableKey, def.columns, def.type);
                }
            }
        }

        // Create edges from file references
        for (const [filePath, analysis] of index.files) {
            this.addFileEdges(filePath, analysis);
            this.addColumnEdgesFromTransformations(filePath, analysis);
        }

        return this;
    }

    private async preloadFileSql(files: Map<string, FileAnalysis>): Promise<Map<string, string>> {
        const fileSqlByPath = new Map<string, string>();
        const filePaths = Array.from(files.keys());
        let nextIndex = 0;

        const workerCount = Math.min(MAX_PRELOAD_CONCURRENCY, filePaths.length);
        const workers = Array.from({ length: workerCount }, async () => {
            while (nextIndex < filePaths.length) {
                const filePath = filePaths[nextIndex];
                nextIndex += 1;

                try {
                    const sql = await fs.promises.readFile(filePath, 'utf8');
                    fileSqlByPath.set(filePath, sql);
                } catch {
                    continue;
                }
            }
        });

        await Promise.all(workers);
        return fileSqlByPath;
    }

    private resolveFileSql(
        filePath: string,
        analysis: FileAnalysis,
        fileSqlByPath: Map<string, string> | undefined,
        errorLevel: 'debug' | 'warn',
        purpose: string
    ): string | null {
        if (fileSqlByPath) {
            const preloadedSql = fileSqlByPath.get(filePath);
            if (preloadedSql !== undefined) {
                return preloadedSql;
            }
        }

        const indexedSql = this.getSqlFromAnalysis(analysis);
        if (indexedSql) {
            return indexedSql;
        }

        if (fileSqlByPath) {
            const message = `[LineageBuilder] SQL content unavailable for ${purpose} (${filePath}); async preload did not return content.`;
            if (errorLevel === 'warn') {
                logger.warn(message);
            } else {
                logger.debug(message);
            }
        }

        return null;
    }

    private getSqlFromAnalysis(analysis: FileAnalysis): string | null {
        const querySql = (analysis.queries || [])
            .map(query => typeof query.sql === 'string' ? query.sql.trim() : '')
            .filter(sql => sql.length > 0);

        if (querySql.length > 0) {
            return querySql.join('\n;\n');
        }

        const definitionSql = analysis.definitions
            .map(def => typeof def.sql === 'string' ? def.sql.trim() : '')
            .filter(sql => sql.length > 0);

        if (definitionSql.length > 0) {
            return definitionSql.join('\n;\n');
        }

        return null;
    }

    /**
     * Add table/view definition as node
     */
    addDefinitionNode(def: SchemaDefinition): LineageNode {
        const tableKey = getDefinitionKey(def);
        const nodeId = this.getTableNodeId(def.type, tableKey);
        const fullName = getDisplayName(def.name, def.schema, def.catalog);
        const existing = this.nodes.get(nodeId);
        if (existing) {
            const existingFiles = new Set<string>(existing.metadata.definitionFiles || []);
            existingFiles.add(def.filePath);
            existing.metadata.definitionFiles = Array.from(existingFiles);
            const locations = existing.metadata.definitionLocations || [];
            locations.push({ filePath: def.filePath, lineNumber: def.lineNumber });
            existing.metadata.definitionLocations = locations;
            return existing;
        }

        const node: LineageNode = {
            id: nodeId,
            type: def.type,
            name: fullName,
            filePath: def.filePath,
            lineNumber: def.lineNumber,
            metadata: {
                schema: def.schema,
                catalog: def.catalog,
                fullName,
                columnCount: def.columns.length,
                definitionFiles: [def.filePath],
                definitionLocations: [{ filePath: def.filePath, lineNumber: def.lineNumber }]
            }
        };

        this.nodes.set(nodeId, node);
        return node;
    }

    /**
     * Add column nodes for a table
     */
    addColumnNodes(tableKey: string, columns: ColumnInfo[], nodeType: 'table' | 'view'): void {
        const tableNodeId = this.getTableNodeId(nodeType, tableKey);
        const tableNode = this.nodes.get(tableNodeId);
        if (!tableNode) {
            return;
        }

        for (const column of columns) {
            const columnId = this.getColumnNodeId(tableKey, column.name, column);
            const existingColumn = this.nodes.get(columnId);
            if (existingColumn) {
                const existingFiles = new Set<string>(existingColumn.metadata.definitionFiles || []);
                const tableFiles = tableNode.metadata.definitionFiles || [];
                tableFiles.forEach((filePath: string) => existingFiles.add(filePath));
                existingColumn.metadata.definitionFiles = Array.from(existingFiles);
                if (existingColumn.columnInfo && column.foreignKey && !existingColumn.columnInfo.foreignKey) {
                    existingColumn.columnInfo = {
                        ...existingColumn.columnInfo,
                        foreignKey: column.foreignKey
                    };
                }
                continue;
            }

            const columnNode: LineageNode = {
                id: columnId,
                type: 'column',
                name: column.name,
                parentId: tableNode.id,
                metadata: {
                    dataType: column.dataType,
                    nullable: column.nullable,
                    isPrimaryKey: column.primaryKey,
                    definitionFiles: tableNode.metadata.definitionFiles || []
                },
                columnInfo: column
            };

            this.nodes.set(columnId, columnNode);
            const siblingColumns = this.columnNodesByParentId.get(tableNode.id) || [];
            siblingColumns.push(columnNode);
            this.columnNodesByParentId.set(tableNode.id, siblingColumns);

            // Add edge from table to column
            this.addEdge({
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
        // Group references by statement index for per-statement lineage
        const statementRefs = new Map<number, { inputs: Set<string>; outputs: Set<string> }>();

        for (const ref of analysis.references) {
            const tableKey = getReferenceKey(ref);

            // Skip CTE references - they are not real table references
            if (ref.referenceType === 'cte') {
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

            // Data-modification targets are destinations (outputs).
            if (ref.referenceType === 'insert' || ref.referenceType === 'update' || ref.referenceType === 'delete' || ref.referenceType === 'merge') {
                stmtBucket.outputs.add(tableKey);
            }
        }

        // Handle definitions (views, CTAS) - match to correct statement bucket by line proximity
        // Build a map of statementIndex → {min, max} line numbers from references
        const stmtLineRanges = new Map<number, { min: number; max: number }>();
        for (const ref of analysis.references) {
            const stmtIndex = ref.statementIndex ?? 0;
            const existing = stmtLineRanges.get(stmtIndex);
            if (existing) {
                existing.min = Math.min(existing.min, ref.lineNumber);
                existing.max = Math.max(existing.max, ref.lineNumber);
            } else {
                stmtLineRanges.set(stmtIndex, { min: ref.lineNumber, max: ref.lineNumber });
            }
        }

        for (const def of analysis.definitions) {
            const tableKey = getDefinitionKey(def);
            const isView = def.type === 'view';
            const isCtas = def.type === 'table'
                && def.sql
                && (/\bAS\s+(?:SELECT|\()/i.test(def.sql) || /^\s*(?:WITH[\s\S]+?)?SELECT[\s\S]+?\bINTO\b/i.test(def.sql));

            if (!isView && !isCtas) {continue;}

            // Find the statement bucket whose reference line numbers are closest to
            // (and at or after) the definition's lineNumber
            let bestStmtIndex: number | null = null;
            let bestDistance = Infinity;

            for (const [stmtIndex, stmtBucket] of statementRefs) {
                if (stmtBucket.inputs.size === 0) {continue;}
                const lineRange = stmtLineRanges.get(stmtIndex);
                if (!lineRange) {continue;}

                // The definition's CREATE line should precede or be near the SELECT references
                // Pick the bucket whose min reference line is closest to (and >= ) the def line
                const distance = lineRange.min - def.lineNumber;
                if (distance >= 0 && distance < bestDistance) {
                    bestDistance = distance;
                    bestStmtIndex = stmtIndex;
                }
            }

            // Fallback: if no bucket has references after the definition, pick the closest one before
            if (bestStmtIndex === null) {
                for (const [stmtIndex, stmtBucket] of statementRefs) {
                    if (stmtBucket.inputs.size === 0) {continue;}
                    const lineRange = stmtLineRanges.get(stmtIndex);
                    if (!lineRange) {continue;}

                    const distance = def.lineNumber - lineRange.max;
                    if (distance >= 0 && distance < bestDistance) {
                        bestDistance = distance;
                        bestStmtIndex = stmtIndex;
                    }
                }
            }

            if (bestStmtIndex !== null) {
                statementRefs.get(bestStmtIndex)!.outputs.add(tableKey);
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
            if (outputs.size === 0) {continue;}

            for (const sourceTableKey of inputs) {
                const sourceNodeId = this.resolveTableNodeId(sourceTableKey);
                let sourceNode = sourceNodeId ? this.nodes.get(sourceNodeId) : undefined;

                // Create external source node if needed
                if (!sourceNode && this.options.includeExternal) {
                    sourceNode = this.addExternalNode(sourceTableKey);
                }

                if (!sourceNode) {continue;}

                for (const targetTableKey of outputs) {
                    const targetNodeId = this.resolveTableNodeId(targetTableKey);
                    let targetNode = targetNodeId ? this.nodes.get(targetNodeId) : undefined;

                    // Create external target node if needed
                    if (!targetNode && this.options.includeExternal) {
                        targetNode = this.addExternalNode(targetTableKey);
                    }

                    if (!targetNode) {continue;}

                    // Don't create self-referential edges
                    if (sourceNode.id === targetNode.id) {continue;}

                    // Create edge from source to target
                    this.addEdge({
                        id: `${sourceNode.id}->${targetNode.id}`,
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

    /**
     * Create column-to-column lineage edges from transformations
     * This implements Phase 2 of the column-level lineage plan
     */
    private addColumnEdgesFromTransformations(
        filePath: string,
        analysis: FileAnalysis
    ): void {
        if (!analysis.queries) {
            return;
        }

        for (let queryIndex = 0; queryIndex < analysis.queries.length; queryIndex++) {
            const query = analysis.queries[queryIndex];
            this.addCteColumnEdges(filePath, query);
            if (!query.transformations || query.transformations.length === 0) {continue;}

            // Resolve target table for this query
            const targetTableId = this.resolveTargetTableId(query, queryIndex, analysis, filePath);
            if (!targetTableId) {continue;}

            this.addQueryColumnEdges(filePath, query, targetTableId);
        }
    }

    private addCteColumnEdges(filePath: string, query: QueryAnalysis): void {
        for (const cte of query.ctes || []) {
            const targetTableId = this.resolveTableId(cte.name, filePath);
            if (targetTableId && cte.query) {
                this.addQueryColumnEdges(filePath, cte.query, targetTableId);
            }
            if (cte.query) {
                this.addCteColumnEdges(filePath, cte.query);
            }
        }
    }

    private addQueryColumnEdges(
        filePath: string,
        query: QueryAnalysis,
        targetTableId: string
    ): void {
        for (const transform of query.transformations || []) {
            // Skip if no input columns (literal values)
            if (!transform.inputColumns || transform.inputColumns.length === 0) {continue;}

            // For each input column, create a column edge
            for (const inputCol of transform.inputColumns) {
                // Resolve source table
                const sourceTableId = this.resolveTableId(
                    inputCol.tableName || inputCol.tableAlias,
                    filePath
                );

                if (!sourceTableId) {continue;} // Skip if source table not found

                // Create column edge
                const columnEdge: ColumnLineageEdge = {
                    id: `${sourceTableId}.${inputCol.columnName}->${targetTableId}.${transform.outputColumn}`,
                    sourceTableId,
                    sourceColumnName: inputCol.columnName,
                    targetTableId,
                    targetColumnName: transform.outputColumn,
                    sourceColumnId: this.resolveColumnNodeId(sourceTableId, inputCol.columnName),
                    targetColumnId: this.resolveColumnNodeId(targetTableId, transform.outputColumn),
                    transformationType: this.mapTransformationType(transform.operation),
                    expression: transform.expression,
                    filePath,
                    lineNumber: transform.lineNumber || 0,
                    metadata: {
                        outputAlias: transform.outputAlias
                    }
                };

                if (!this.columnEdgeIds.has(columnEdge.id)) {
                    this.columnEdgeIds.add(columnEdge.id);
                    this.columnEdges.push(columnEdge);
                }
            }
        }
    }

    /**
     * Resolve table ID from table name or alias
     */
    private resolveTableId(tableName: string | undefined, filePath: string): string | null {
        if (!tableName) {return null;}

        const exactName = tableName.trim();
        const normalizedName = exactName.toLowerCase();

        for (const type of ['table', 'view', 'cte', 'external']) {
            const exactId = `${type}:${exactName}`;
            if (this.nodes.has(exactId)) {
                return exactId;
            }
        }

        // Mixed-case canonical keys represent delimited identifiers. If their
        // exact node is absent, folding them would attach lineage to a different
        // physical relation (for example PostgreSQL users vs "Users").
        if (exactName !== normalizedName) {
            return null;
        }

        // Try with table: prefix (most common)
        const tableId = `table:${normalizedName}`;
        if (this.nodes.has(tableId)) {
            return tableId;
        }

        // Try with view: prefix
        const viewId = `view:${normalizedName}`;
        if (this.nodes.has(viewId)) {
            return viewId;
        }

        // Try with cte: prefix
        const cteId = `cte:${normalizedName}`;
        if (this.nodes.has(cteId)) {
            return cteId;
        }

        // Try with external: prefix
        const externalId = `external:${normalizedName}`;
        if (this.nodes.has(externalId)) {
            return externalId;
        }

        return null;
    }

    /**
     * Resolve target table ID from query
     * Determines where the query's output columns flow to
     */
    private resolveTargetTableId(
        query: any,
        queryIndex: number,
        analysis: FileAnalysis,
        filePath: string
    ): string | null {
        // 1. Check statement type from QueryAnalysis
        const statementType = query.statementType;
        const statementIndex = typeof query.statementIndex === 'number'
            ? query.statementIndex
            : queryIndex;

        // 2. For data-modification statements, find the target from references.
        if (statementType === 'insert' || statementType === 'update' || statementType === 'delete' || statementType === 'merge') {
            for (const ref of analysis.references) {
                if (ref.referenceType === statementType &&
                    (ref.statementIndex === statementIndex || ref.statementIndex === undefined)) {
                    const tableKey = getReferenceKey(ref);
                    return this.resolveTableId(tableKey, filePath);
                }
            }
        }

        // 3. For CREATE VIEW, find the view from definitions
        if (statementType === 'create_view') {
            return this.resolveDefinitionTargetId(query, queryIndex, analysis, filePath, 'view');
        }

        // 4. For CREATE TABLE (potentially CTAS), find the table from definitions
        if (statementType === 'create_table') {
            return this.resolveDefinitionTargetId(query, queryIndex, analysis, filePath, 'table');
        }

        // 5. Try to find target from statement-level references
        for (const ref of analysis.references) {
            if ((ref.referenceType === 'insert' ||
                 ref.referenceType === 'update' ||
                 ref.referenceType === 'merge') &&
                (ref.statementIndex === statementIndex || ref.statementIndex === undefined)) {
                const tableKey = getReferenceKey(ref);
                const resolved = this.resolveTableId(tableKey, filePath);
                if (resolved) {return resolved;}
            }
        }

        // 6. A materializing SELECT (for example SELECT INTO) can have a
        // definition even though its query type is SELECT. Match by statement
        // identity so an unrelated definition elsewhere in the file cannot
        // become the target of an ordinary SELECT.
        const statementDefinitions = analysis.definitions.filter(definition =>
            definition.statementIndex === statementIndex
        );
        if (statementDefinitions.length === 1) {
            const def = statementDefinitions[0];
            const tableKey = getDefinitionKey(def);
            const resolved = this.resolveTableId(tableKey, filePath);
            if (resolved) {return resolved;}
        }

        // 7. Fallback: Check for SELECT INTO or INSERT patterns in SQL
        if (query.sql) {
            const sql = maskSqlCommentsPreservingPositions(query.sql);
            const identitySource = analysis.definitions.find(def => def.identifierCaseFolding)
                || analysis.references.find(ref => ref.identifierCaseFolding);
            const identifierSemantics = {
                identifierCaseFolding: identitySource?.identifierCaseFolding,
                quotedIdentifiersCaseSensitive: identitySource?.quotedIdentifiersCaseSensitive,
            };

            // SELECT INTO pattern
            const intoMatch = sql.match(/INTO\s+(?:TEMP(?:ORARY)?(?:\s+TABLE)?\s+)?(?:(\w+)\.)?([A-Z_][A-Z0-9_$#]*)/i);
            if (intoMatch) {
                const tableKey = getQualifiedKey(intoMatch[2], intoMatch[1], identifierSemantics);
                return this.resolveTableId(tableKey, filePath);
            }

            // INSERT INTO pattern
            const insertMatch = sql.match(/INSERT\s+INTO\s+(?:(\w+)\.)?([A-Z_][A-Z0-9_$#]*)/i);
            if (insertMatch) {
                const tableKey = getQualifiedKey(insertMatch[2], insertMatch[1], identifierSemantics);
                return this.resolveTableId(tableKey, filePath);
            }
        }

        return null;
    }

    private resolveDefinitionTargetId(
        query: any,
        queryIndex: number,
        analysis: FileAnalysis,
        filePath: string,
        definitionType: 'table' | 'view'
    ): string | null {
        const matchingDefs = analysis.definitions.filter(def => def.type === definitionType);
        if (matchingDefs.length === 0) {
            return null;
        }
        if (matchingDefs.length === 1) {
            const onlyDef = matchingDefs[0];
            return this.resolveTableId(getDefinitionKey(onlyDef), filePath);
        }

        const queryLineNumber = typeof query?.lineNumber === 'number' ? query.lineNumber : undefined;
        const queryStatementIndex = typeof query?.statementIndex === 'number' ? query.statementIndex : queryIndex;
        const rankedDefs = matchingDefs
            .map((def, index) => {
                const defStatementIndex = typeof (def as any).statementIndex === 'number' ? (def as any).statementIndex : undefined;
                const lineDistance = queryLineNumber === undefined
                    ? Number.MAX_SAFE_INTEGER
                    : Math.abs((def.lineNumber || queryLineNumber) - queryLineNumber);
                const statementDistance = defStatementIndex === undefined
                    ? Number.MAX_SAFE_INTEGER
                    : Math.abs(defStatementIndex - queryStatementIndex);
                const preferredOrder = queryLineNumber !== undefined && (def.lineNumber || 0) >= queryLineNumber ? 0 : 1;

                return { def, index, lineDistance, statementDistance, preferredOrder };
            })
            .sort((left, right) =>
                left.statementDistance - right.statementDistance
                || left.preferredOrder - right.preferredOrder
                || left.lineDistance - right.lineDistance
                || left.index - right.index
            );

        const bestDef = rankedDefs[0]?.def;
        if (!bestDef) {
            return null;
        }
        return this.resolveTableId(getDefinitionKey(bestDef), filePath);
    }

    /**
     * Map transformation operation type to column edge transformation type
     */
    private mapTransformationType(
        operation: string
    ): ColumnLineageEdge['transformationType'] {
        const typeMap: Record<string, ColumnLineageEdge['transformationType']> = {
            'direct': 'direct',
            'alias': 'rename',
            'aggregate': 'aggregate',
            'arithmetic': 'expression',
            'concat': 'expression',
            'scalar': 'expression',
            'case': 'case',
            'cast': 'cast',
            'window': 'expression',
            'subquery': 'expression',
            'literal': 'unknown',
            'complex': 'unknown'
        };

        return typeMap[operation] || 'unknown';
    }

    /**
     * Resolve external references (tables not defined in workspace)
     */
    addExternalNode(tableKey: string): LineageNode {
        const normalizedKey = tableKey;
        const parsed = parseQualifiedKey(normalizedKey);
        const nodeId = this.getTableNodeId('external', normalizedKey);

        const node: LineageNode = {
            id: nodeId,
            type: 'external',
            name: getDisplayName(parsed.name, parsed.schema, parsed.catalog),
            metadata: {
                isExternal: true
            }
        };

        this.nodes.set(nodeId, node);
        return node;
    }

    private addEdge(edge: LineageEdge): void {
        if (this.edgeIds.has(edge.id)) {
            return;
        }

        this.edgeIds.add(edge.id);
        this.edges.push(edge);
        this.addEdgeToIndex(edge);
    }

    private addEdgeToIndex(edge: LineageEdge): void {
        const incomingBucket = this.incomingEdgesByNodeId.get(edge.targetId);
        if (incomingBucket) {
            incomingBucket.push(edge);
        } else {
            this.incomingEdgesByNodeId.set(edge.targetId, [edge]);
        }

        const outgoingBucket = this.outgoingEdgesByNodeId.get(edge.sourceId);
        if (outgoingBucket) {
            outgoingBucket.push(edge);
        } else {
            this.outgoingEdgesByNodeId.set(edge.sourceId, [edge]);
        }
    }

    private getIncomingEdges(nodeId: string): LineageEdge[] {
        return this.incomingEdgesByNodeId.get(nodeId) || [];
    }

    private getOutgoingEdges(nodeId: string): LineageEdge[] {
        return this.outgoingEdgesByNodeId.get(nodeId) || [];
    }

    private collectIncomingEdges(nodeIds: Set<string>): LineageEdge[] {
        const collected: LineageEdge[] = [];
        for (const nodeId of nodeIds) {
            collected.push(...this.getIncomingEdges(nodeId));
        }
        return collected;
    }

    private collectOutgoingEdges(nodeIds: Set<string>): LineageEdge[] {
        const collected: LineageEdge[] = [];
        for (const nodeId of nodeIds) {
            collected.push(...this.getOutgoingEdges(nodeId));
        }
        return collected;
    }

    private collectDirectionalNodes(nodeId: string, direction: 'upstream' | 'downstream', depth: number): LineageNode[] {
        type TraversalFrame = {
            currentId: string;
            currentDepth: number;
            edges: LineageEdge[];
            nextEdgeIndex: number;
            entered: boolean;
        };

        const visited = new Set<string>();
        const result: LineageNode[] = [];
        const frames: TraversalFrame[] = [{
            currentId: nodeId,
            currentDepth: 0,
            edges: [],
            nextEdgeIndex: 0,
            entered: false
        }];

        while (frames.length > 0) {
            const frame = frames[frames.length - 1];

            if (!frame.entered) {
                if (depth !== -1 && frame.currentDepth >= depth) {
                    frames.pop();
                    continue;
                }
                if (visited.has(frame.currentId)) {
                    frames.pop();
                    continue;
                }

                visited.add(frame.currentId);
                frame.edges = direction === 'upstream'
                    ? this.getIncomingEdges(frame.currentId)
                    : this.getOutgoingEdges(frame.currentId);
                frame.entered = true;
            }

            if (frame.nextEdgeIndex >= frame.edges.length) {
                frames.pop();
                continue;
            }

            const edge = frame.edges[frame.nextEdgeIndex];
            frame.nextEdgeIndex++;

            const nextId = direction === 'upstream' ? edge.sourceId : edge.targetId;
            const nextNode = this.nodes.get(nextId);
            if (nextNode && !visited.has(nextNode.id)) {
                result.push(nextNode);
                frames.push({
                    currentId: nextNode.id,
                    currentDepth: frame.currentDepth + 1,
                    edges: [],
                    nextEdgeIndex: 0,
                    entered: false
                });
            }
        }

        return result;
    }

    /**
     * Get all nodes upstream of a target (data sources)
     */
    getUpstream(nodeId: string, depth: number = -1): LineageNode[] {
        return this.collectDirectionalNodes(nodeId, 'upstream', depth);
    }

    /**
     * Get all nodes downstream of a source (data consumers)
     */
    getDownstream(nodeId: string, depth: number = -1): LineageNode[] {
        return this.collectDirectionalNodes(nodeId, 'downstream', depth);
    }

    /**
     * Get column lineage path
     */
    getColumnLineage(tableId: string, columnName: string): LineagePath[] {
        const columnId = this.resolveColumnNodeId(tableId, columnName)
            || this.getColumnNodeId(tableId.replace(/^(?:table|view|external|cte):/, ''), columnName);
        const columnNode = this.nodes.get(columnId);

        if (!columnNode) {return [];}

        // Get upstream lineage
        const upstreamNodes = this.getUpstream(columnId, -1);
        const upstreamNodeIds = new Set<string>([columnId, ...upstreamNodes.map(node => node.id)]);
        const upstreamEdges = this.collectIncomingEdges(upstreamNodeIds);

        // Get downstream lineage
        const downstreamNodes = this.getDownstream(columnId, -1);
        const downstreamNodeIds = new Set<string>([columnId, ...downstreamNodes.map(node => node.id)]);
        const downstreamEdges = this.collectOutgoingEdges(downstreamNodeIds);

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
    private getColumnNodeId(tableKey: string, columnName: string, qualification: ColumnInfo = {
        name: columnName,
        dataType: 'unknown',
        nullable: true,
        primaryKey: false,
    }): string {
        return `column:${getColumnKey(tableKey, columnName, qualification)}`;
    }

    private resolveColumnNodeId(tableId: string, columnName: string): string | undefined {
        const relationKey = tableId.replace(/^(?:table|view|external|cte):/, '');
        const parentIds = new Set(
            tableId.includes(':')
                ? [tableId]
                : ['table', 'view', 'external', 'cte'].map(type => `${type}:${relationKey}`)
        );
        const candidateColumns = [...parentIds].flatMap(parentId =>
            this.columnNodesByParentId.get(parentId) || []
        );
        const exact = candidateColumns.find(node => node.name === columnName);
        if (exact) {return exact.id;}

        const folded = candidateColumns.filter(node =>
            node.name.toLowerCase() === columnName.toLowerCase()
        );
        return folded.length === 1 ? folded[0].id : undefined;
    }

    private resolveTableNodeId(tableKey: string): string | null {
        // A referenced object may have been defined as a table or view (or
        // already materialized as an external node). Statement edges must
        // resolve to whichever physical relation already exists.
        // Table references reaching this stage are physical relations; CTE
        // references are tagged and skipped in addFileEdges. Resolving a later
        // physical table to an earlier file-scoped CTE would conflate scopes.
        const candidateTypes = ['table', 'view', 'external'];

        const parsed = parseQualifiedKey(tableKey);
        const keysToTry = parsed.schema || parsed.catalog
            ? [tableKey, parsed.name]
            : [tableKey];

        for (const key of keysToTry) {
            for (const type of candidateTypes) {
                const nodeId = this.getTableNodeId(type, key);
                if (this.nodes.has(nodeId)) {
                    return nodeId;
                }
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
        const declarations = findCteDeclarations(sql);
        const ParserCtor = getNodeSqlParserCtor();
        if (!ParserCtor) {
            this.extractCTEsWithRegex(sql, filePath, cteNames, declarations);
            return;
        }

        const parser = new ParserCtor();
        const cteLineNumbers = new Map<string, number>();
        for (const declaration of declarations) {
            const cteKey = declaration.name.toLowerCase();
            if (!cteLineNumbers.has(cteKey)) {
                const lineNumber = sql.substring(0, declaration.index).split('\n').length;
                cteLineNumbers.set(cteKey, lineNumber);
            }
        }
        // Try different dialects
        const dialects = ['postgresql', 'mysql', 'transactsql', 'snowflake', 'bigquery'];
        let parsedSuccessfully = false;

        for (const dialect of dialects) {
            try {
                const ast = parser.astify(sql, { database: dialect });
                const statements = Array.isArray(ast) ? ast : [ast];

                for (const stmt of statements) {
                    if (!stmt || !stmt.type) {
                        continue;
                    }
                    const stmtType = stmt.type.toLowerCase();
                    // Check for WITH clause in SELECT statements
                    if (stmtType !== 'select' || !stmt.with) {
                        continue;
                    }
                    const withClause = Array.isArray(stmt.with) ? stmt.with : [stmt.with];
                    for (const cte of withClause) {
                        const cteName = cte.name?.value || cte.name;
                        if (cteName && typeof cteName === 'string') {
                            const cteKey = cteName.toLowerCase();
                            if (!cteNames.has(cteKey)) {
                                cteNames.set(cteKey, {
                                    name: cteName,
                                    filePath: filePath,
                                    lineNumber: cteLineNumbers.get(cteKey) ?? 1
                                });
                            }
                        }
                    }
                }

                parsedSuccessfully = true;
                break;
            } catch (parseError) {
                // Try next dialect
                continue;
            }
        }

        if (!parsedSuccessfully) {
            logger.debug(`[LineageBuilder] CTE parsing failed for ${filePath}; using regex fallback.`);
        }

        // Fallback to regex extraction
        this.extractCTEsWithRegex(sql, filePath, cteNames, declarations);
    }

    /**
     * Extract CTEs using regex as fallback when parsing fails
     */
    private extractCTEsWithRegex(
        sql: string,
        filePath: string,
        cteNames: Map<string, { name: string; filePath: string; lineNumber: number }>,
        declarations = findCteDeclarations(sql)
    ): void {
        for (const declaration of declarations) {
            const cteName = declaration.name;
            if (cteName && !this.isReservedWord(cteName)) {
                const lineNumber = sql.substring(0, declaration.index).split('\n').length;
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

}
