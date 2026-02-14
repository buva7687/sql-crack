import { getAggregateFunctions, getWindowFunctions } from '../../../dialects';
import type {
    ColumnInfo,
    ColumnLineage,
    FlowEdge,
    FlowNode,
    QueryStats
} from '../../types';
import { unwrapIdentifierValue } from '../astUtils';
import { createFreshContext, type ParserContext } from '../context';
import { getTableValuedFunctionName } from '../extractors/tables';

export interface SelectRuntimeDependencies {
    genId: (prefix: string) => string;
    processStatement: (context: ParserContext, stmt: any, nodes: FlowNode[], edges: FlowEdge[]) => string | null;
    layoutGraph: (nodes: FlowNode[], edges: FlowEdge[]) => void;
    extractColumnLineage: (stmt: any, nodes: FlowNode[]) => ColumnLineage[];
    calculateColumnPositions: (nodes: FlowNode[]) => void;
    assignLineNumbers: (nodes: FlowNode[], sql: string) => void;
    calculateComplexity: (context: ParserContext) => void;
    trackTableUsage: (context: ParserContext, tableName: string) => void;
    trackFunctionUsage: (
        context: ParserContext,
        functionName: unknown,
        category: 'aggregate' | 'window' | 'tvf' | 'scalar'
    ) => void;
}

let ctx: ParserContext = createFreshContext('MySQL');
let runtimeDeps: SelectRuntimeDependencies | null = null;

function getRuntimeDeps(): SelectRuntimeDependencies {
    if (!runtimeDeps) {
        throw new Error('Select runtime dependencies not initialized');
    }
    return runtimeDeps;
}

function genId(prefix: string): string {
    return getRuntimeDeps().genId(prefix);
}

function processStatement(context: ParserContext, stmt: any, nodes: FlowNode[], edges: FlowEdge[]): string | null {
    return getRuntimeDeps().processStatement(context, stmt, nodes, edges);
}

function layoutGraph(nodes: FlowNode[], edges: FlowEdge[]): void {
    getRuntimeDeps().layoutGraph(nodes, edges);
}

function extractColumnLineage(stmt: any, nodes: FlowNode[]): ColumnLineage[] {
    return getRuntimeDeps().extractColumnLineage(stmt, nodes);
}

function calculateColumnPositions(nodes: FlowNode[]): void {
    getRuntimeDeps().calculateColumnPositions(nodes);
}

function assignLineNumbers(nodes: FlowNode[], sql: string): void {
    getRuntimeDeps().assignLineNumbers(nodes, sql);
}

function calculateComplexity(context: ParserContext): void {
    getRuntimeDeps().calculateComplexity(context);
}

function trackTableUsage(context: ParserContext, tableName: string): void {
    getRuntimeDeps().trackTableUsage(context, tableName);
}

function trackFunctionUsage(
    context: ParserContext,
    functionName: unknown,
    category: 'aggregate' | 'window' | 'tvf' | 'scalar'
): void {
    getRuntimeDeps().trackFunctionUsage(context, functionName, category);
}

export function processSelectStatement(
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    deps: SelectRuntimeDependencies,
    cteNames: Set<string> = new Set()
): string {
    runtimeDeps = deps;
    return processSelect(context, stmt, nodes, edges, cteNames);
}

function processSelect(
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    cteNames: Set<string> = new Set()
): string {
    ctx = context;
    const nodeIds: string[] = [];

    // Collect CTE names first
    if (stmt.with && Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            const cteName = cte.name?.value || cte.name || 'CTE';
            cteNames.add(cteName.toLowerCase());
        }
    }

    // Process CTEs first - with nested sub-graph
    if (stmt.with && Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            ctx.stats.ctes++;
            const cteId = genId('cte');
            const cteName = cte.name?.value || cte.name || 'CTE';

            // Parse CTE's internal structure
            const cteChildren: FlowNode[] = [];
            const cteChildEdges: FlowEdge[] = [];

            // CTE statement can be in different locations depending on parser output
            // Handle various AST structures from node-sql-parser
            const cteStmt = getCteStatementAst(cte);

            if (cteStmt) {
                // Phase 1 Feature: CTE Expansion Controls & Breadcrumb Navigation
                // Recursively parse the CTE's SELECT statement with parentId and depth for breadcrumb navigation
                parseCteOrSubqueryInternals(context, cteStmt, cteChildren, cteChildEdges, cteId, 0);
            }

            // Calculate container size based on children
            const containerWidth = Math.max(200, cteChildren.length > 0 ? 220 : 160);
            const containerHeight = cteChildren.length > 0 ? 80 + cteChildren.length * 35 : 60;

            // Check if this CTE is recursive (node-sql-parser sets recursive flag on the CTE or parent)
            const isRecursive = cte.recursive === true || cte.prefix?.toLowerCase() === 'recursive';
            const cteLabel = isRecursive ? `WITH RECURSIVE ${cteName}` : `WITH ${cteName}`;
            const cteDescription = isRecursive ? 'Recursive Common Table Expression' : 'Common Table Expression';

            nodes.push({
                id: cteId,
                type: 'cte',
                label: cteLabel,
                description: cteDescription,
                children: cteChildren.length > 0 ? cteChildren : undefined,
                childEdges: cteChildren.length > 0 ? cteChildEdges : undefined, // Keep empty array if children exist
                expanded: false, // Start collapsed, expand on click to show subflow
                collapsible: cteChildren.length > 0, // Only collapsible if has children
                depth: 0, // Root level CTE - used for breadcrumb navigation
                x: 0, y: 0, width: containerWidth, height: containerHeight
            });
            nodeIds.push(cteId);
        }
    }

    // Process FROM tables (data sources) - first pass: create all table nodes
    const tableIds: string[] = [];
    const joinTableMap: Map<string, string> = new Map(); // Maps table name to its node id

    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            const tableId = processFromItem(context, fromItem, nodes, edges, cteNames, Boolean(fromItem.join));
            if (tableId) {
                tableIds.push(tableId);
                joinTableMap.set(getFromItemLookupKey(fromItem), tableId);
            }
        }
    }
    const seenTableLabels = new Set<string>();
    for (const tableId of tableIds) {
        const tableNode = nodes.find(node => node.id === tableId && node.type === 'table');
        if (tableNode) {
            seenTableLabels.add(tableNode.label.toLowerCase());
        }
    }
    const scalarSubquerySourceTables = collectScalarSubquerySourceTables(stmt, cteNames, seenTableLabels);

    // Process JOINs - create join nodes and connect tables properly
    let lastOutputId = tableIds[0]; // Start with first table as base

    if (stmt.from && Array.isArray(stmt.from)) {
        let leftTableId = tableIds[0];

        for (let i = 0; i < stmt.from.length; i++) {
            const fromItem = stmt.from[i];
            if (fromItem.join) {
                ctx.stats.joins++;
                const joinId = genId('join');
                const joinType = fromItem.join || 'JOIN';
                const joinTable = getFromItemDisplayName(fromItem);
                const rightTableId = joinTableMap.get(getFromItemLookupKey(fromItem));

                // Extract join condition details
                const joinDetails: string[] = [];
                if (fromItem.on) {
                    joinDetails.push(formatCondition(fromItem.on));
                }
                joinDetails.push(`${joinTable}`);

                nodes.push({
                    id: joinId,
                    type: 'join',
                    label: joinType.toUpperCase(),
                    description: `Join with ${joinTable}`,
                    details: joinDetails,
                    x: 0, y: 0, width: 140, height: 60
                });

                // Extract join condition SQL for edge
                const joinConditionSql = fromItem.on ? formatCondition(fromItem.on) : '';
                
                // Phase 1 Feature: Click Edge → View SQL Clauses
                // Connect left side to join (previous join result or first table)
                // Store SQL clause and line number for edge click navigation
                if (leftTableId) {
                    edges.push({
                        id: genId('e'),
                        source: leftTableId,
                        target: joinId,
                        sqlClause: joinConditionSql, // SQL clause for edge click display
                        clauseType: 'join',         // Type of clause for styling
                        startLine: fromItem.on?.location?.start?.line // Line number for navigation
                    });
                }

                // Connect right side (join table) to join
                if (rightTableId && rightTableId !== leftTableId) {
                    edges.push({
                        id: genId('e'),
                        source: rightTableId,
                        target: joinId,
                        sqlClause: joinConditionSql, // SQL clause for edge click display
                        clauseType: 'on',           // Type of clause for styling
                        startLine: fromItem.on?.location?.start?.line // Line number for navigation
                    });
                }

                // The join output becomes the left side for next join
                leftTableId = joinId;
                lastOutputId = joinId;
            }
        }
    }

    // Connect CTEs to first table
    for (const cteId of nodeIds) {
        if (tableIds[0]) {
            edges.push({
                id: genId('e'),
                source: cteId,
                target: tableIds[0]
            });
        }
    }

    // Connect comma-separated FROM items (implicit cross joins) that aren't
    // already wired by the explicit JOIN logic above. tableIds[0] is the base;
    // any additional non-join item needs an edge into the flow.
    if (stmt.from && Array.isArray(stmt.from)) {
        for (let i = 1; i < stmt.from.length; i++) {
            const fromItem = stmt.from[i];
            if (!fromItem.join) {
                const extraTableId = joinTableMap.get(getFromItemLookupKey(fromItem));
                if (extraTableId && lastOutputId) {
                    // Create an implicit CROSS JOIN node
                    ctx.stats.joins++;
                    const crossJoinId = genId('join');
                    nodes.push({
                        id: crossJoinId,
                        type: 'join',
                        label: 'CROSS JOIN',
                        description: `Implicit join with ${getFromItemDisplayName(fromItem)}`,
                        details: [getFromItemDisplayName(fromItem)],
                        x: 0, y: 0, width: 140, height: 60
                    });
                    edges.push({
                        id: genId('e'),
                        source: lastOutputId,
                        target: crossJoinId
                    });
                    edges.push({
                        id: genId('e'),
                        source: extraTableId,
                        target: crossJoinId
                    });
                    lastOutputId = crossJoinId;
                }
            }
        }
    }

    // Process WHERE - connect from the last join output or first table
    let previousId = lastOutputId || tableIds[0];
    if (stmt.where) {
        const whereId = genId('filter');
        const conditions = extractConditions(stmt.where);
        ctx.stats.conditions += conditions.length;
        nodes.push({
            id: whereId,
            type: 'filter',
            label: 'WHERE',
            description: 'Filter rows',
            details: conditions,
            x: 0, y: 0, width: 140, height: 60
        });

        // Phase 1 Feature: Click Edge → View SQL Clauses
        // Store WHERE clause SQL and line number for edge click navigation
        if (previousId) {
            // Format WHERE clause SQL
            const whereClauseSql = conditions.join(' AND ');
            edges.push({
                id: genId('e'),
                source: previousId,
                target: whereId,
                sqlClause: whereClauseSql, // SQL clause for edge click display
                clauseType: 'where',      // Type of clause for styling
                startLine: stmt.where?.location?.start?.line // Line number for navigation
            });
        }
        previousId = whereId;
    }

    // Process GROUP BY
    if (stmt.groupby && Array.isArray(stmt.groupby) && stmt.groupby.length > 0) {
        ctx.stats.aggregations++;
        const groupId = genId('agg');
        const groupCols = stmt.groupby.map((g: any) => g.column || g.expr?.column || '?').join(', ');
        nodes.push({
            id: groupId,
            type: 'aggregate',
            label: 'GROUP BY',
            description: 'Aggregate rows',
            details: [`Columns: ${groupCols}`],
            x: 0, y: 0, width: 140, height: 60
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: groupId
            });
        }
        previousId = groupId;
    }

    // Process HAVING
    if (stmt.having) {
        const havingId = genId('filter');
        nodes.push({
            id: havingId,
            type: 'filter',
            label: 'HAVING',
            description: 'Filter groups',
            details: [formatCondition(stmt.having)],
            x: 0, y: 0, width: 140, height: 60
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: havingId
            });
        }
        previousId = havingId;
    }

    // Check for aggregate functions in columns - with detailed breakdown
    const aggregateFuncDetails = extractAggregateFunctionDetails(stmt.columns);
    // Always show aggregate node when aggregate functions are present (similar to window functions)
    if (aggregateFuncDetails.length > 0) {
        const aggregateId = genId('aggregate');

        // Calculate height based on number of functions
        const baseHeight = 50;
        const perFuncHeight = 28;
        const aggregateHeight = baseHeight + aggregateFuncDetails.length * perFuncHeight;

        nodes.push({
            id: aggregateId,
            type: 'aggregate',
            label: 'AGGREGATE',
            description: `${aggregateFuncDetails.length} aggregate function${aggregateFuncDetails.length > 1 ? 's' : ''}`,
            aggregateDetails: { functions: aggregateFuncDetails },
            x: 0, y: 0, width: 220, height: Math.min(aggregateHeight, 180)
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: aggregateId
            });
        }
        previousId = aggregateId;
    }

    // Check for CASE statements in columns - with detailed breakdown
    const caseStatementDetails = extractCaseStatementDetails(stmt.columns);
    if (caseStatementDetails.length > 0) {
        const caseId = genId('case');

        // Calculate height based on number of CASE statements
        const baseHeight = 50;
        const perCaseHeight = 35; // More height per CASE due to multiple conditions
        const caseHeight = baseHeight + caseStatementDetails.length * perCaseHeight;

        nodes.push({
            id: caseId,
            type: 'case',
            label: 'CASE',
            description: `${caseStatementDetails.length} CASE statement${caseStatementDetails.length > 1 ? 's' : ''}`,
            caseDetails: { cases: caseStatementDetails },
            x: 0, y: 0, width: 220, height: Math.min(caseHeight, 200)
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: caseId
            });
        }
        previousId = caseId;
    }

    // Check for window functions in columns - with detailed breakdown
    const windowFuncDetails = extractWindowFunctionDetails(stmt.columns);
    if (windowFuncDetails.length > 0) {
        ctx.stats.windowFunctions += windowFuncDetails.length;
        const windowId = genId('window');

        // Calculate height based on number of functions
        const baseHeight = 50;
        const perFuncHeight = 28;
        const windowHeight = baseHeight + windowFuncDetails.length * perFuncHeight;

        nodes.push({
            id: windowId,
            type: 'window',
            label: 'WINDOW',
            description: `${windowFuncDetails.length} window function${windowFuncDetails.length > 1 ? 's' : ''}`,
            windowDetails: { functions: windowFuncDetails },
            x: 0, y: 0, width: 220, height: Math.min(windowHeight, 180)
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: windowId
            });
        }
        previousId = windowId;
    }

    // Process SELECT columns
    const selectId = genId('select');
    const columns = extractColumns(stmt.columns);
    // Extract column info for dead column detection
    const columnInfos: ColumnInfo[] = extractColumnInfos(stmt.columns);
    nodes.push({
        id: selectId,
        type: 'select',
        label: 'SELECT',
        description: 'Project columns',
        details: columns.length <= 5 ? columns : [`${columns.length} columns`],
        columns: columnInfos, // Store column info for dead column detection
        x: 0, y: 0, width: 140, height: 60
    });

    if (previousId) {
        edges.push({
            id: genId('e'),
            source: previousId,
            target: selectId
        });
    }

    for (const tableName of scalarSubquerySourceTables) {
        const tableKey = tableName.toLowerCase();
        if (seenTableLabels.has(tableKey)) {
            continue;
        }

        const tableId = genId('table');
        nodes.push({
            id: tableId,
            type: 'table',
            label: tableName,
            description: 'Scalar subquery source',
            tableCategory: 'physical',
            x: 0, y: 0, width: 140, height: 60
        });
        edges.push({
            id: genId('e'),
            source: tableId,
            target: selectId,
            sqlClause: 'Subquery source',
            clauseType: 'flow'
        });

        seenTableLabels.add(tableKey);
        const hadTable = ctx.tableUsageMap.has(tableKey);
        trackTableUsage(ctx, tableName);
        if (!hadTable) {
            ctx.stats.tables++;
        }
    }

    previousId = selectId;

    // Process ORDER BY
    if (stmt.orderby && Array.isArray(stmt.orderby) && stmt.orderby.length > 0) {
        const sortId = genId('sort');
        const sortCols = stmt.orderby.map((o: any) => {
            const col = o.expr?.column || o.expr?.value || '?';
            const dir = o.type || 'ASC';
            return `${col} ${dir}`;
        }).join(', ');
        nodes.push({
            id: sortId,
            type: 'sort',
            label: 'ORDER BY',
            description: 'Sort results',
            details: [sortCols],
            x: 0, y: 0, width: 140, height: 60
        });

        edges.push({
            id: genId('e'),
            source: previousId,
            target: sortId
        });
        previousId = sortId;
    }

    // Process LIMIT — guard against phantom objects from node-sql-parser
    // (PostgreSQL, Snowflake, Trino, Redshift return { seperator: "", value: [] } when no LIMIT exists)
    if (stmt.limit && !(Array.isArray(stmt.limit.value) && stmt.limit.value.length === 0)) {
        ctx.hasNoLimit = false;
        const limitId = genId('limit');
        const limitVal = stmt.limit.value?.[0]?.value ?? stmt.limit.value ?? stmt.limit;
        nodes.push({
            id: limitId,
            type: 'limit',
            label: 'LIMIT',
            description: 'Limit rows',
            details: [`${limitVal} rows`],
            x: 0, y: 0, width: 120, height: 60
        });

        edges.push({
            id: genId('e'),
            source: previousId,
            target: limitId
        });
        previousId = limitId;
    }

    // Add result node
    const resultId = genId('result');
    nodes.push({
        id: resultId,
        type: 'result',
        label: 'Result',
        description: 'Query output',
        x: 0, y: 0, width: 120, height: 60
    });

    edges.push({
        id: genId('e'),
        source: previousId,
        target: resultId
    });

    // Handle UNION/INTERSECT/EXCEPT
    if (stmt._next) {
        ctx.stats.unions++;
        const nextResultId = processStatement(context, stmt._next, nodes, edges);
        if (nextResultId) {
            const unionId = genId('union');
            const setOp = stmt.set_op || 'UNION';

            // Collect tables from both sides for details
            const leftTables = extractTablesFromStatement(stmt);
            const rightTables = extractTablesFromStatement(stmt._next);
            const unionDetails: string[] = [];
            if (leftTables.length > 0) {
                unionDetails.push(`Left: ${leftTables.join(', ')}`);
            }
            if (rightTables.length > 0) {
                unionDetails.push(`Right: ${rightTables.join(', ')}`);
            }

            nodes.push({
                id: unionId,
                type: 'union',
                label: setOp.toUpperCase(),
                description: `${setOp} operation`,
                details: unionDetails.length > 0 ? unionDetails : undefined,
                x: 0, y: 0, width: 140, height: 60
            });

            // Connect both results to the union
            edges.push({
                id: genId('e'),
                source: resultId,
                target: unionId
            });
            edges.push({
                id: genId('e'),
                source: nextResultId,
                target: unionId
            });
        }
    }

    return resultId;
}

function getCteStatementAst(cte: any): any {
    if (cte?.stmt?.ast) {
        return cte.stmt.ast;
    }
    if (cte?.stmt?.type === 'select' || cte?.stmt?.from) {
        return cte.stmt;
    }
    if (cte?.ast) {
        return cte.ast;
    }
    if (cte?.expr?.ast) {
        return cte.expr.ast;
    }
    if (cte?.definition?.ast) {
        return cte.definition.ast;
    }
    if (cte?.definition) {
        return cte.definition;
    }
    return null;
}

function processFromItem(
    context: ParserContext,
    fromItem: any,
    nodes: FlowNode[],
    _edges: FlowEdge[],
    cteNames: Set<string> = new Set(),
    asJoin: boolean = false
): string | null {
    ctx = context;
    // Check for subquery
    if (fromItem.expr && fromItem.expr.ast) {
        ctx.stats.subqueries++;
        const subqueryId = genId('subquery');
        const alias = fromItem.as || 'subquery';

        // Parse subquery's internal structure
        const subChildren: FlowNode[] = [];
        const subChildEdges: FlowEdge[] = [];
        parseCteOrSubqueryInternals(context, fromItem.expr.ast, subChildren, subChildEdges, subqueryId, 0);

        // Subqueries as data sources should always be expanded
        // Calculate container size based on children
        const hasChildren = subChildren.length > 0;
        const containerWidth = hasChildren ? 220 : 160;
        const containerHeight = hasChildren ? 55 + subChildren.length * 28 : 60;

        nodes.push({
            id: subqueryId,
            type: 'subquery',
            label: alias,
            description: hasChildren ? `Derived table with ${subChildren.length} operations` : 'Derived table',
            children: hasChildren ? subChildren : undefined,
            childEdges: subChildEdges.length > 0 ? subChildEdges : undefined,
            expanded: false, // Start collapsed, expand on click to show subflow
            collapsible: hasChildren, // Only collapsible if has children
            tableCategory: 'derived',
            depth: 0, // Subquery depth
            x: 0, y: 0, width: containerWidth, height: containerHeight
        });
        return subqueryId;
    }

    // Table-valued function (UNNEST, OPENJSON, FLATTEN, JSON_TABLE, etc.)
    const tableValuedFunctionName = getTableValuedFunctionName(fromItem, ctx.dialect);
    if (tableValuedFunctionName) {
        trackFunctionUsage(ctx, tableValuedFunctionName, 'tvf');
        ctx.stats.tables++;
        const tableId = genId('table');
        const label = getFromItemDisplayName(fromItem);
        const details: string[] = [`Function: ${tableValuedFunctionName}`];
        const rawAlias = typeof fromItem.as === 'string' ? fromItem.as.trim() : '';
        if (rawAlias && rawAlias !== label) {
            details.push(`Alias: ${rawAlias}`);
        }

        nodes.push({
            id: tableId,
            type: 'table',
            label,
            description: asJoin
                ? `Joined table function (${tableValuedFunctionName})`
                : `Table function source (${tableValuedFunctionName})`,
            details,
            tableCategory: 'table_function',
            x: 0, y: 0, width: 140, height: 60
        });
        trackTableUsage(ctx, label);
        return tableId;
    }

    // Regular table
    const tableName = getTableName(fromItem);
    if (!tableName) { return null; }

    ctx.stats.tables++;
    trackTableUsage(ctx, tableName);
    const tableId = genId('table');
    // Determine if this is a CTE reference
    const isCteRef = cteNames.has(tableName.toLowerCase());
    nodes.push({
        id: tableId,
        type: 'table',
        label: tableName,
        description: isCteRef
            ? (asJoin ? 'Joined CTE reference' : 'CTE reference')
            : (asJoin ? 'Joined table' : 'Source table'),
        details: fromItem.as ? [`Alias: ${fromItem.as}`] : undefined,
        tableCategory: isCteRef ? 'cte_reference' : 'physical',
        x: 0, y: 0, width: 140, height: 60
    });

    return tableId;
}

export function getTableName(item: any): string {
    if (typeof item === 'string') { return item; }
    
    // For table references, prefer the actual table name over alias
    // The AST structure varies by parser, so check multiple possible fields
    if (item.table) {
        // If table is an object, extract the name
        if (typeof item.table === 'object') {
            return item.table.table || item.table.name || item.table.value || item.as || 'table';
        }
        return item.table;
    }
    
    // Fallback to name, then alias, then default
    return item.name || item.as || 'table';
}

function getNormalizedFromAlias(item: any): string | null {
    const rawAlias = typeof item?.as === 'string' ? item.as.trim() : '';
    if (!rawAlias) {
        return null;
    }
    const parenIndex = rawAlias.indexOf('(');
    if (parenIndex > 0) {
        return rawAlias.slice(0, parenIndex).trim();
    }
    return rawAlias;
}

function getFromItemDisplayName(item: any): string {
    const alias = getNormalizedFromAlias(item);
    if (alias) {
        return alias;
    }
    const tableName = getTableName(item);
    if (tableName && tableName !== 'table') {
        return tableName;
    }
    return getTableValuedFunctionName(item, ctx.dialect) || tableName;
}

function getFromItemLookupKey(item: any): string {
    const alias = getNormalizedFromAlias(item);
    if (alias) {
        return alias;
    }
    const tableName = getTableName(item);
    if (tableName && tableName !== 'table') {
        return tableName;
    }
    return getTableValuedFunctionName(item, ctx.dialect) || tableName;
}

/**
 * Extract a readable identifier/value from parser AST nodes across dialects.
 * Handles wrapped nodes like { expr: { type: 'default', value: 'col' } }.
 */
export function getAstString(val: any, depth = 0): string | null {
    if (depth > 6 || val === null || val === undefined) { return null; }
    if (typeof val === 'string') { return val; }
    if (typeof val === 'number' || typeof val === 'boolean') { return String(val); }

    if (Array.isArray(val)) {
        for (const item of val) {
            const extracted = getAstString(item, depth + 1);
            if (extracted) { return extracted; }
        }
        return null;
    }

    if (typeof val === 'object') {
        const candidateKeys = ['value', 'name', 'column', 'table', 'expr'];
        for (const key of candidateKeys) {
            if (Object.prototype.hasOwnProperty.call(val, key)) {
                const extracted = getAstString(val[key], depth + 1);
                if (extracted) { return extracted; }
            }
        }
    }

    return null;
}

/**
 * Format an AST expression node into a readable SQL expression string
 */
function formatExpressionFromAst(expr: any): string {
    if (!expr) { return ''; }

    // Simple column reference
    if (expr.type === 'column_ref') {
        const tableName = getAstString(expr.table);
        const columnName = getAstString(expr.column);
        const table = tableName ? `${tableName}.` : '';
        return `${table}${columnName || '?'}`;
    }

    // Aggregate function
    if (expr.type === 'aggr_func') {
        const funcName = getAstString(expr.name) || 'AGG';
        trackFunctionUsage(ctx, funcName, 'aggregate');
        const distinct = expr.args?.distinct ? 'DISTINCT ' : '';
        let argsStr = '';

        if (expr.args) {
            const args = expr.args.value || expr.args.expr || expr.args;
            if (Array.isArray(args)) {
                argsStr = args.map((arg: any) => formatExpressionFromAst(arg)).join(', ');
            } else if (args) {
                argsStr = formatExpressionFromAst(args);
            }
        }

        return `${funcName}(${distinct}${argsStr})`;
    }

    // Function call
    if (expr.type === 'function') {
        const funcName = getAstString(expr.name) || 'FUNC';
        trackFunctionUsage(ctx, funcName, expr.over ? 'window' : 'scalar');
        const args = expr.args?.value || expr.args || [];
        const argsStr = Array.isArray(args)
            ? args.map((arg: any) => formatExpressionFromAst(arg)).join(', ')
            : formatExpressionFromAst(args);
        return `${funcName}(${argsStr})`;
    }

    // Binary expression
    if (expr.type === 'binary_expr') {
        const left = formatExpressionFromAst(expr.left);
        const right = formatExpressionFromAst(expr.right);
        return `${left} ${expr.operator || '?'} ${right}`;
    }

    // Unary expression
    if (expr.type === 'unary_expr') {
        return `${expr.operator || ''}${formatExpressionFromAst(expr.expr)}`;
    }

    // CAST expression
    if (expr.type === 'cast') {
        const innerExpr = formatExpressionFromAst(expr.expr);
        const dataType = expr.target?.dataType || expr.target || 'type';
        return `CAST(${innerExpr} AS ${dataType})`;
    }

    // Number or string literal
    if (expr.type === 'number' || expr.type === 'single_quote_string' || expr.type === 'string') {
        return String(expr.value ?? '');
    }

    // Star
    if (expr.type === 'star' || expr.column === '*') {
        return '*';
    }

    // Window function (has over clause)
    if (expr.over) {
        const funcName = typeof expr.name === 'string' ? expr.name : expr.name?.name || 'FUNC';
        return `${funcName}() OVER(...)`;
    }

    // CASE expression
    if (expr.type === 'case') {
        return 'CASE...END';
    }

    // Fallback: try common properties
    if (expr.column) { return getAstString(expr.column) || 'expr'; }
    if (expr.value !== undefined) { return String(expr.value); }
    if (expr.name) { return getAstString(expr.name) || 'expr'; }

    return 'expr';
}

function extractColumns(columns: any): string[] {
    if (!columns || columns === '*') {
        ctx.hasSelectStar = true;
        return ['*'];
    }
    if (!Array.isArray(columns)) { return ['*']; }

    return columns.map((col: any) => {
        const exprColumn = getAstString(col?.expr?.column);
        if (col === '*' || exprColumn === '*') {
            ctx.hasSelectStar = true;
            return '*';
        }
        const aliasName = getAstString(col?.as);
        if (aliasName) { return aliasName; }
        if (exprColumn) { return exprColumn; }
        const exprName = getAstString(col?.expr?.name);
        if (exprName) { return `${exprName}()`; }
        return 'expr';
    }).slice(0, 10); // Limit to first 10
}

/**
 * Extract column information from SELECT statement AST for dead column detection.
 * 
 * This function extracts detailed column information including:
 * - Column name (prioritizing alias if present)
 * - Source column and table references
 * - Aggregate and window function indicators
 * - Transformation types (renamed, aggregated, calculated, passthrough)
 * 
 * @param columns - Column AST nodes from the SELECT statement
 * @returns Array of ColumnInfo objects for dead column detection
 */
function extractColumnInfos(columns: any): ColumnInfo[] {
    if (!columns || columns === '*') {
        return [];
    }
    if (!Array.isArray(columns)) { return []; }

    return columns.map((col: any): ColumnInfo => {
        // Extract column name - prioritize alias, then column name, then expression
        let name: string;
        const aliasName = getAstString(col.as);
        const exprColumn = getAstString(col.expr?.column);
        const exprName = getAstString(col.expr?.name);
        const exprValue = getAstString(col.expr?.value);

        if (aliasName) {
            name = aliasName;
        } else if (exprColumn) {
            name = exprColumn;
        } else if (exprName) {
            name = exprName;
        } else if (exprValue) {
            name = exprValue;
        } else if (typeof col === 'string') {
            name = col;
        } else {
            name = 'expr';
        }
        
        const expression = col.expr ? formatExpressionFromAst(col.expr) : name;
        
        // Extract source column and table
        // For CAST expressions, the source column is inside col.expr.expr
        let sourceColName: string | undefined;
        let sourceTableName: string | undefined;
        
        if (col.expr?.type === 'cast') {
            // CAST expression: extract source from the inner expression
            sourceColName = getAstString(col.expr.expr?.column) || undefined;
            sourceTableName = getAstString(col.expr.expr?.table) || undefined;
        } else {
            // Regular expression: extract source from the expression itself
            sourceColName = getAstString(col.expr?.column) || undefined;
            sourceTableName = getAstString(col.expr?.table) || undefined;
        }

        return {
            name: name,
            expression: expression,
            sourceColumn: sourceColName || undefined,
            sourceTable: sourceTableName || undefined,
            isAggregate: col.expr?.type === 'aggr_func' || false,
            isWindowFunc: !!col.expr?.over,
            transformationType: col.as && col.expr?.column ? 'renamed' :
                               col.expr?.type === 'aggr_func' ? 'aggregated' :
                               col.expr?.over ? 'calculated' : 'passthrough'
        };
    });
}

function extractWindowFunctions(columns: any): string[] {
    if (!columns || !Array.isArray(columns)) { return []; }

    const windowFuncs: string[] = [];
    for (const col of columns) {
        if (col.expr?.over) {
            // Safely extract function name
            let funcName = 'WINDOW';
            const expr = col.expr;
            const extractedFunc = getAstString(expr.name);
            if (extractedFunc) { funcName = extractedFunc; }

            const partitionBy = col.expr.over?.partitionby?.map((p: any) =>
                getAstString(p.column) || getAstString(p.expr?.column) || '?'
            ).join(', ');
            let desc = `${funcName}()`;
            if (partitionBy) {
                desc += ` OVER(PARTITION BY ${partitionBy})`;
            }
            windowFuncs.push(desc);
        }
    }
    return windowFuncs;
}

// Extract detailed window function information
function extractWindowFunctionDetails(columns: any): Array<{
    name: string;
    partitionBy?: string[];
    orderBy?: string[];
    frame?: string;
}> {
    if (!columns || !Array.isArray(columns)) { return []; }

    const details: Array<{
        name: string;
        partitionBy?: string[];
        orderBy?: string[];
        frame?: string;
    }> = [];

    // Get dialect-specific window functions
    const windowFuncList = getWindowFunctions(ctx.dialect);

    for (const col of columns) {
        if (col.expr?.over) {
            // Safely extract function name - could be in various formats
            let funcName = 'WINDOW';
            const expr = col.expr;

            // Helper to safely get string value
            const getStringName = (obj: any): string | null => {
                if (typeof obj === 'string') {return obj;}
                if (obj && typeof obj.name === 'string') {return obj.name;}
                if (obj && typeof obj.value === 'string') {return obj.value;}
                return null;
            };

            // Try multiple paths to find the function name
            const nameFromExpr = getStringName(expr.name);
            if (nameFromExpr) {
                funcName = nameFromExpr;
            } else if (expr.type === 'aggr_func' || expr.type === 'function') {
                const aggName = getStringName(expr.name);
                if (aggName) {funcName = aggName;}
            } else if (expr.args?.expr) {
                const argsName = getStringName(expr.args.expr.name) || getStringName(expr.args.expr);
                if (argsName) {funcName = argsName;}
            }

            // Check for window function in alias patterns
            if (funcName === 'WINDOW' && col.as) {
                const alias = String(col.as).toLowerCase();
                if (alias.includes('prev') || alias.includes('lag')) {funcName = 'LAG';}
                else if (alias.includes('next') || alias.includes('lead')) {funcName = 'LEAD';}
                else if (alias.includes('rank')) {funcName = 'RANK';}
                else if (alias.includes('row_num')) {funcName = 'ROW_NUMBER';}
                else if (alias.includes('running') || alias.includes('total')) {funcName = 'SUM';}
                else if (alias.includes('avg') || alias.includes('average')) {funcName = 'AVG';}
            }

            // Final fallback - search JSON for known function names (dialect-aware)
            if (funcName === 'WINDOW') {
                try {
                    const exprStr = JSON.stringify(expr).toUpperCase();
                    for (const wf of windowFuncList) {
                        if (exprStr.includes(`"NAME":"${wf}"`) || exprStr.includes(`"${wf}"`)) {
                            funcName = wf;
                            break;
                        }
                    }
                } catch (e) {
                    window.debugLogging && console.debug('[sqlParser] JSON.stringify failed for window function detection:', e);
                }
            }

            // Extract PARTITION BY columns
            const partitionBy = col.expr.over?.partitionby?.map((p: any) =>
                p.column || p.expr?.column || p.value || '?'
            ).filter(Boolean);

            // Extract ORDER BY columns
            const orderBy = col.expr.over?.orderby?.map((o: any) => {
                const colName = o.expr?.column || o.column || '?';
                const dir = o.type || '';
                return dir ? `${colName} ${dir}` : colName;
            }).filter(Boolean);

            // Extract frame clause if present
            let frame: string | undefined;
            if (col.expr.over?.frame) {
                const f = col.expr.over.frame;
                frame = `${f.type || 'ROWS'} ${f.start || ''} ${f.end ? 'TO ' + f.end : ''}`.trim();
            }

            // Ensure funcName is a clean string
            const cleanName = typeof funcName === 'string' ? funcName : 'WINDOW';
            trackFunctionUsage(ctx, cleanName, 'window');

            details.push({
                name: cleanName.toUpperCase(),
                partitionBy: partitionBy?.length > 0 ? partitionBy : undefined,
                orderBy: orderBy?.length > 0 ? orderBy : undefined,
                frame
            });
        }
    }

    return details;
}

// Extract aggregate functions from SELECT columns (not just GROUP BY)
function extractAggregateFunctionDetails(columns: any): Array<{
    name: string;
    expression: string;
    alias?: string;
    sourceColumn?: string;
    sourceTable?: string;
}> {
    if (!columns || !Array.isArray(columns)) { return []; }

    // Get dialect-specific aggregate functions
    const aggregateFuncSet = new Set(getAggregateFunctions(ctx.dialect));
    const details: Array<{ name: string; expression: string; alias?: string; sourceColumn?: string; sourceTable?: string }> = [];

    function getExpressionFunctionName(expr: any): string {
        if (typeof expr?.name === 'string') {
            return expr.name.toUpperCase();
        }
        const nameParts = expr?.name?.name;
        if (Array.isArray(nameParts) && nameParts.length > 0) {
            return String(nameParts[0]?.value || '').toUpperCase();
        }
        return '';
    }

    function normalizeColumnRefName(columnRef: any): string {
        const normalized = unwrapIdentifierValue(columnRef?.column);
        if (normalized) {
            return normalized;
        }
        if (typeof columnRef?.column === 'string') {
            return columnRef.column;
        }
        return '?';
    }

    function formatAggregateArg(arg: any): string {
        if (!arg || typeof arg !== 'object') {
            return arg === undefined ? '?' : String(arg);
        }

        if (arg.type === 'star') {
            return '*';
        }
        if (arg.type === 'column_ref') {
            return normalizeColumnRefName(arg);
        }
        if (arg.type === 'expr_list' && Array.isArray(arg.value)) {
            return arg.value.map(formatAggregateArg).join(', ');
        }
        if (arg.type === 'number') {
            return String(arg.value ?? '?');
        }
        if (arg.type && String(arg.type).includes('string')) {
            return `'${String(arg.value ?? '')}'`;
        }
        if (arg.column) {
            return String(arg.column);
        }
        if (arg.expr) {
            return formatAggregateArg(arg.expr);
        }
        return '?';
    }

    function extractAggregatesFromExpr(expr: any): void {
        if (!expr || typeof expr !== 'object') {
            return;
        }

        if (Array.isArray(expr)) {
            for (const item of expr) {
                extractAggregatesFromExpr(item);
            }
            return;
        }

        // Check if this is an aggregate function (dialect-aware)
        const exprType = typeof expr.type === 'string' ? expr.type.toLowerCase() : '';
        const exprFuncName = getExpressionFunctionName(expr);
        if (exprType === 'aggr_func' || (exprFuncName && aggregateFuncSet.has(exprFuncName))) {
            const funcName = exprFuncName || 'AGG';
            const argsContainer = expr.args;
            const argNode = argsContainer?.value ?? argsContainer?.expr ?? argsContainer;
            const argList = Array.isArray(argNode) ? argNode : (argNode ? [argNode] : []);
            const hasDistinct = String(argsContainer?.distinct || '').toUpperCase() === 'DISTINCT';

            let sourceColumn: string | undefined;
            let sourceTable: string | undefined;
            const argStrs = argList.map((arg: any) => {
                if (!sourceColumn && arg?.type === 'column_ref') {
                    sourceColumn = normalizeColumnRefName(arg);
                    sourceTable = arg.table;
                } else if (!sourceColumn && arg?.expr?.type === 'column_ref') {
                    sourceColumn = normalizeColumnRefName(arg.expr);
                    sourceTable = arg.expr.table;
                }
                return formatAggregateArg(arg);
            }).filter(Boolean);

            const distinctPrefix = hasDistinct ? 'DISTINCT ' : '';
            const expression = `${funcName}(${distinctPrefix}${argStrs.join(', ')})`;

            details.push({
                name: funcName,
                expression,
                alias: undefined,
                sourceColumn,
                sourceTable
            });
        }

        // Recursively inspect all nested expression values so we catch
        // aggregates inside CASE conditions and function arguments.
        for (const value of Object.values(expr)) {
            extractAggregatesFromExpr(value);
        }
    }

    for (const col of columns) {
        if (!col?.expr) {
            continue;
        }

        const startIndex = details.length;
        extractAggregatesFromExpr(col.expr);
        const addedCount = details.length - startIndex;
        const topExprType = typeof col.expr?.type === 'string' ? col.expr.type.toLowerCase() : '';
        const topExprName = getExpressionFunctionName(col.expr);
        const isTopLevelAggregate =
            topExprType === 'aggr_func' || (topExprName && aggregateFuncSet.has(topExprName));

        // Only attach alias when the SELECT expression itself is an aggregate.
        // Derived expressions (e.g., DATE_DIFF(MAX(...)), CASE WHEN SUM(...)...) should not
        // re-label nested aggregate internals.
        if (col.as && addedCount === 1 && isTopLevelAggregate) {
            details[startIndex].alias = col.as;
        }
    }

    // De-duplicate repeated aggregate expressions while keeping the first meaningful alias.
    const deduped: Array<{ name: string; expression: string; alias?: string; sourceColumn?: string; sourceTable?: string }> = [];
    const indexByKey = new Map<string, number>();
    for (const detail of details) {
        const key = `${detail.name}|${detail.expression}|${detail.sourceTable || ''}|${detail.sourceColumn || ''}`;
        const existingIndex = indexByKey.get(key);
        if (existingIndex === undefined) {
            indexByKey.set(key, deduped.length);
            deduped.push(detail);
            continue;
        }
        if (!deduped[existingIndex].alias && detail.alias) {
            deduped[existingIndex].alias = detail.alias;
        }
    }

    return deduped;
}

// Extract CASE statements from SELECT columns
function extractCaseStatementDetails(columns: any): Array<{
    conditions: Array<{ when: string; then: string }>;
    elseValue?: string;
    alias?: string;
}> {
    if (!columns || !Array.isArray(columns)) { return []; }

    const caseDetails: Array<{
        conditions: Array<{ when: string; then: string }>;
        elseValue?: string;
        alias?: string;
    }> = [];

    function formatExpr(expr: any): string {
        if (!expr) {return '?';}
        if (expr.column) {return expr.column;}
        if (expr.value) {return String(expr.value);}
        if (expr.type === 'binary_expr') {
            const left = formatExpr(expr.left);
            const right = formatExpr(expr.right);
            return `${left} ${expr.operator} ${right}`;
        }
        return 'expr';
    }

    for (const col of columns) {
        if (col.expr && col.expr.type === 'case') {
            const caseExpr = col.expr;
            const conditions: Array<{ when: string; then: string }> = [];

            if (caseExpr.args && Array.isArray(caseExpr.args)) {
                for (const arg of caseExpr.args) {
                    if (arg.cond && arg.result) {
                        conditions.push({
                            when: formatExpr(arg.cond),
                            then: formatExpr(arg.result)
                        });
                    }
                }
            }

            const elseValue = caseExpr.else ? formatExpr(caseExpr.else) : undefined;
            const alias = col.as;

            if (conditions.length > 0) {
                caseDetails.push({ conditions, elseValue, alias });
            }
        }
    }

    return caseDetails;
}

// Parse CTE or Subquery internal structure for nested visualization
// Phase 1 Feature: Breadcrumb Navigation
// Parse CTE/subquery internals and set parentId/depth for breadcrumb trail navigation
function parseCteOrSubqueryInternals(
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    parentId?: string,
    depth: number = 0
): void {
    ctx = context;
    if (!stmt) { return; }

    let previousId: string | null = null;

    // Extract tables from FROM clause
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            // Check for nested subqueries in FROM clause
            if (fromItem.expr && fromItem.expr.ast) {
                ctx.stats.subqueries++; // Count nested subqueries
                // Recursively parse the nested subquery
                parseCteOrSubqueryInternals(context, fromItem.expr.ast, nodes, edges, parentId, depth + 1);
            } else if (!fromItem.join) {
                const tableName = getTableName(fromItem);
                if (tableName && tableName !== 'table') {
                    // Track table usage for stats (including tables from CTEs and subqueries)
                    trackTableUsage(ctx, tableName);
                    const tableId = genId('child_table');
                    nodes.push({
                        id: tableId,
                        type: 'table',
                        label: tableName,
                        description: 'Table',
                        parentId: parentId,
                        depth: depth + 1,
                        x: 0, y: 0, width: 100, height: 32
                    });
                    if (previousId) {
                        edges.push({ id: genId('ce'), source: previousId, target: tableId });
                    }
                    previousId = tableId;
                }
            }
        }

        // Add joins (also check for nested subqueries in joins)
        for (const fromItem of stmt.from) {
            if (fromItem.join) {
                // Check for nested subqueries in JOIN
                if (fromItem.expr && fromItem.expr.ast) {
                    ctx.stats.subqueries++; // Count nested subqueries in joins
                    // Recursively parse the nested subquery
                    parseCteOrSubqueryInternals(context, fromItem.expr.ast, nodes, edges, parentId, depth + 1);
                } else {
                    const joinId = genId('child_join');
                    const joinTable = getTableName(fromItem);
                    // Track table usage for joined tables in CTEs/subqueries
                    if (joinTable && joinTable !== 'table') {
                        trackTableUsage(ctx, joinTable);
                    }
                    nodes.push({
                        id: joinId,
                        type: 'join',
                        label: `${fromItem.join} ${joinTable}`,
                        description: 'Join',
                        parentId: parentId,
                        depth: depth + 1,
                        x: 0, y: 0, width: 120, height: 32
                    });
                    if (previousId) {
                        edges.push({ id: genId('ce'), source: previousId, target: joinId });
                    }
                    previousId = joinId;
                }
            }
        }
    }

    // Check for subqueries in WHERE clause
    if (stmt.where) {
        const whereSubqueries = findSubqueriesInExpression(stmt.where);
        ctx.stats.subqueries += whereSubqueries.length;
    }

    // Check for subqueries in SELECT clause (scalar subqueries)
    if (stmt.columns && Array.isArray(stmt.columns)) {
        for (const col of stmt.columns) {
            if (col.expr && col.expr.ast && (col.expr.type === 'select' || col.expr.ast.type === 'select')) {
                ctx.stats.subqueries++; // Count scalar subqueries
                // Recursively parse the nested subquery
                parseCteOrSubqueryInternals(context, col.expr.ast, nodes, edges, parentId, depth + 1);
            }
        }
    }

    // Add WHERE if present
    if (stmt.where) {
        const whereId = genId('child_where');
        nodes.push({
            id: whereId,
            type: 'filter',
            label: 'WHERE',
            description: 'Filter',
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 80, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: whereId });
        }
        previousId = whereId;
    }

    // Add GROUP BY if present
    // groupby can be an array or an object with columns property
    const hasGroupBy = stmt.groupby && (
        (Array.isArray(stmt.groupby) && stmt.groupby.length > 0) ||
        (stmt.groupby.columns && Array.isArray(stmt.groupby.columns) && stmt.groupby.columns.length > 0)
    );
    if (hasGroupBy) {
        const groupId = genId('child_group');
        nodes.push({
            id: groupId,
            type: 'aggregate',
            label: 'GROUP BY',
            description: 'Aggregate',
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 90, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: groupId });
        }
        previousId = groupId;
    }

    // Extract CASE statements from SELECT columns in CTEs
    const caseStatementDetails = extractCaseStatementDetails(stmt.columns);
    if (caseStatementDetails.length > 0) {
        const caseId = genId('child_case');

        // Calculate height based on number of CASE statements
        const baseHeight = 50;
        const perCaseHeight = 35;
        const caseHeight = baseHeight + caseStatementDetails.length * perCaseHeight;

        nodes.push({
            id: caseId,
            type: 'case',
            label: 'CASE',
            description: `${caseStatementDetails.length} CASE statement${caseStatementDetails.length > 1 ? 's' : ''}`,
            caseDetails: { cases: caseStatementDetails },
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 220, height: Math.min(caseHeight, 200)
        });

        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: caseId });
        }
        previousId = caseId;
    }

    // Add ORDER BY if present
    // orderby can be an array or an object with columns property
    const hasOrderBy = stmt.orderby && (
        (Array.isArray(stmt.orderby) && stmt.orderby.length > 0) ||
        (stmt.orderby.columns && Array.isArray(stmt.orderby.columns) && stmt.orderby.columns.length > 0)
    );
    if (hasOrderBy) {
        const sortId = genId('child_sort');
        nodes.push({
            id: sortId,
            type: 'sort',
            label: 'ORDER BY',
            description: 'Sort',
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 90, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: sortId });
        }
    }
}

function collectScalarSubquerySourceTables(
    stmt: any,
    cteNames: Set<string>,
    excludedTableLabels: Set<string>
): string[] {
    const sourceTables = new Set<string>();
    const scopedCteNames = new Set<string>(Array.from(cteNames).map(name => name.toLowerCase()));
    const expressions: any[] = [];

    if (stmt?.where) {
        expressions.push(stmt.where);
    }
    if (stmt?.having) {
        expressions.push(stmt.having);
    }
    if (Array.isArray(stmt?.columns)) {
        for (const col of stmt.columns) {
            if (col?.expr) {
                expressions.push(col.expr);
            }
        }
    }
    if (Array.isArray(stmt?.orderby)) {
        for (const orderItem of stmt.orderby) {
            if (orderItem?.expr) {
                expressions.push(orderItem.expr);
            }
        }
    }
    if (Array.isArray(stmt?.from)) {
        for (const fromItem of stmt.from) {
            if (fromItem?.on) {
                expressions.push(fromItem.on);
            }
        }
    }

    for (const expr of expressions) {
        const subqueries = findSubqueriesInExpression(expr);
        for (const subquery of subqueries) {
            collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
        }
    }

    return Array.from(sourceTables).filter(name => !excludedTableLabels.has(name.toLowerCase()));
}

function collectTablesFromSelectTree(stmt: any, sourceTables: Set<string>, inheritedCteNames: Set<string>): void {
    if (!stmt || typeof stmt !== 'object') {
        return;
    }

    const scopedCteNames = new Set(inheritedCteNames);

    if (Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            const cteName = (cte?.name?.value || cte?.name || '').toString().trim().toLowerCase();
            if (cteName) {
                scopedCteNames.add(cteName);
            }
        }
        for (const cte of stmt.with) {
            const cteStmt = getCteStatementAst(cte);
            if (cteStmt) {
                collectTablesFromSelectTree(cteStmt, sourceTables, scopedCteNames);
            }
        }
    }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : (stmt.from ? [stmt.from] : []);
    for (const fromItem of fromItems) {
        const nestedFromSubquery = fromItem?.expr?.ast || (fromItem?.expr?.type === 'select' ? fromItem.expr : null);
        if (nestedFromSubquery) {
            collectTablesFromSelectTree(nestedFromSubquery, sourceTables, scopedCteNames);
        } else {
            const tableValuedFunctionName = getTableValuedFunctionName(fromItem, ctx.dialect);
            if (tableValuedFunctionName) {
                sourceTables.add(tableValuedFunctionName);
            } else {
                const tableName = getTableName(fromItem);
                if (tableName && tableName !== 'table' && !scopedCteNames.has(tableName.toLowerCase())) {
                    sourceTables.add(tableName);
                }
            }
        }

        if (fromItem?.on) {
            const onSubqueries = findSubqueriesInExpression(fromItem.on);
            for (const subquery of onSubqueries) {
                collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
            }
        }
    }

    if (stmt.where) {
        const whereSubqueries = findSubqueriesInExpression(stmt.where);
        for (const subquery of whereSubqueries) {
            collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
        }
    }

    if (stmt.having) {
        const havingSubqueries = findSubqueriesInExpression(stmt.having);
        for (const subquery of havingSubqueries) {
            collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
        }
    }

    if (Array.isArray(stmt.columns)) {
        for (const col of stmt.columns) {
            if (!col?.expr) {
                continue;
            }
            const columnSubqueries = findSubqueriesInExpression(col.expr);
            for (const subquery of columnSubqueries) {
                collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
            }
        }
    }

    if (Array.isArray(stmt.orderby)) {
        for (const orderItem of stmt.orderby) {
            if (!orderItem?.expr) {
                continue;
            }
            const orderSubqueries = findSubqueriesInExpression(orderItem.expr);
            for (const subquery of orderSubqueries) {
                collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames);
            }
        }
    }

    if (stmt._next) {
        collectTablesFromSelectTree(stmt._next, sourceTables, scopedCteNames);
    }
}

// Helper function to find subqueries in expressions (for counting nested subqueries)
function findSubqueriesInExpression(expr: any): any[] {
    const subqueries: any[] = [];
    if (!expr) { return subqueries; }

    // Check if this expression itself is a subquery
    if (expr.type === 'select') {
        subqueries.push(expr);
    } else if (expr.ast && expr.ast.type === 'select') {
        subqueries.push(expr.ast);
    } else if (expr.ast && typeof expr.ast === 'object') {
        subqueries.push(...findSubqueriesInExpression(expr.ast));
    }

    if (expr.expr) {
        subqueries.push(...findSubqueriesInExpression(expr.expr));
    }

    if (expr.value && typeof expr.value === 'object') {
        subqueries.push(...findSubqueriesInExpression(expr.value));
    }

    // Recursively check left and right sides of binary expressions
    if (expr.left) {
        subqueries.push(...findSubqueriesInExpression(expr.left));
    }
    if (expr.right) {
        subqueries.push(...findSubqueriesInExpression(expr.right));
    }

    // Check function arguments
    if (expr.args && Array.isArray(expr.args)) {
        for (const arg of expr.args) {
            subqueries.push(...findSubqueriesInExpression(arg));
        }
    } else if (Array.isArray(expr.args?.value)) {
        for (const arg of expr.args.value) {
            subqueries.push(...findSubqueriesInExpression(arg));
        }
    } else if (expr.args && expr.args.expr) {
        subqueries.push(...findSubqueriesInExpression(expr.args.expr));
    } else if (expr.args && typeof expr.args === 'object') {
        subqueries.push(...findSubqueriesInExpression(expr.args));
    }

    if (Array.isArray(expr.columns)) {
        for (const col of expr.columns) {
            if (col?.expr) {
                subqueries.push(...findSubqueriesInExpression(col.expr));
            }
        }
    }

    return subqueries;
}

export function extractConditions(where: any): string[] {
    const conditions: string[] = [];
    formatConditionRecursive(where, conditions);
    return conditions.slice(0, 5); // Limit to first 5
}

function formatConditionRecursive(expr: any, conditions: string[], depth = 0): void {
    if (!expr || depth > 3) { return; }

    if (expr.type === 'binary_expr') {
        if (expr.operator === 'AND' || expr.operator === 'OR') {
            formatConditionRecursive(expr.left, conditions, depth + 1);
            formatConditionRecursive(expr.right, conditions, depth + 1);
        } else {
            conditions.push(formatCondition(expr));
        }
    }
}

function formatCondition(expr: any): string {
    if (!expr) { return '?'; }

    if (expr.type === 'binary_expr') {
        const left = expr.left?.column || expr.left?.value || '?';
        const right = expr.right?.column || expr.right?.value || '?';
        return `${left} ${expr.operator} ${right}`;
    }

    return 'condition';
}

function extractTablesFromStatement(stmt: any): string[] {
    const tables: string[] = [];
    if (!stmt || !stmt.from) { return tables; }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
    for (const item of fromItems) {
        const tableValuedFunctionName = getTableValuedFunctionName(item, ctx.dialect);
        if (tableValuedFunctionName) {
            tables.push(tableValuedFunctionName);
            continue;
        }
        const name = getTableName(item);
        if (name && name !== 'table') {
            tables.push(name);
        }
    }
    return tables;
}
