import type {
    ColumnInfo,
    FlowEdge,
    FlowNode,
    SqlDialect
} from '../../types';
import { unwrapIdentifierValue } from '../astUtils';
import type { ParserContext } from '../context';
import {
    extractColumns,
    extractColumnInfos,
    extractConditions,
    extractAggregateFunctionDetails,
    extractCaseStatementDetails,
    extractTablesFromStatement,
    extractWindowFunctionDetails,
    formatCondition,
    getAstString,
    getFromItemDisplayName,
    getFromItemLookupKey,
    getTableName,
    getTableValuedFunctionName,
    resolveFunctionNameFromExpr
} from '../extractors';

export interface SelectRuntimeDependencies {
    genId: (prefix: string) => string;
    processStatement: (context: ParserContext, stmt: any, nodes: FlowNode[], edges: FlowEdge[]) => string | null;
    trackTableUsage: (context: ParserContext, tableName: string) => void;
    trackFunctionUsage: (
        context: ParserContext,
        functionName: unknown,
        category: 'aggregate' | 'window' | 'tvf' | 'scalar'
    ) => void;
}

interface SelectExecutionContext {
    context: ParserContext;
    deps: SelectRuntimeDependencies;
}

function genId(runtime: SelectExecutionContext, prefix: string): string {
    return runtime.deps.genId(prefix);
}

function processStatement(runtime: SelectExecutionContext, stmt: any, nodes: FlowNode[], edges: FlowEdge[]): string | null {
    return runtime.deps.processStatement(runtime.context, stmt, nodes, edges);
}

function trackTableUsage(runtime: SelectExecutionContext, tableName: string): void {
    runtime.deps.trackTableUsage(runtime.context, tableName);
}

function trackFunctionUsage(
    runtime: SelectExecutionContext,
    functionName: unknown,
    category: 'aggregate' | 'window' | 'tvf' | 'scalar'
): void {
    runtime.deps.trackFunctionUsage(runtime.context, functionName, category);
}

export function processSelectStatement(
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    deps: SelectRuntimeDependencies,
    cteNames: Set<string> = new Set()
): string {
    const runtime: SelectExecutionContext = { context, deps };
    return processSelect(runtime, stmt, nodes, edges, cteNames);
}

function processSelect(
    runtime: SelectExecutionContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    cteNames: Set<string> = new Set()
): string {
    const ctx = runtime.context;
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
            const cteId = genId(runtime, 'cte');
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
                parseCteOrSubqueryInternals(runtime, cteStmt, cteChildren, cteChildEdges, cteId, 0);
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
            const tableId = processFromItem(runtime, fromItem, nodes, edges, cteNames, Boolean(fromItem.join));
            if (tableId) {
                tableIds.push(tableId);
                joinTableMap.set(getFromItemLookupKey(fromItem, ctx.dialect), tableId);
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
    const scalarSubquerySourceTables = collectScalarSubquerySourceTables(
        stmt,
        cteNames,
        seenTableLabels,
        ctx.dialect
    );
    trackFunctionsFromExpressionSubqueries(runtime, stmt);

    // Process JOINs - create join nodes and connect tables properly
    let lastOutputId = tableIds[0]; // Start with first table as base

    if (stmt.from && Array.isArray(stmt.from)) {
        let leftTableId = tableIds[0];

        for (let i = 0; i < stmt.from.length; i++) {
            const fromItem = stmt.from[i];
            if (fromItem.join) {
                ctx.stats.joins++;
                const joinId = genId(runtime, 'join');
                const joinType = fromItem.join || 'JOIN';
                const joinTable = getFromItemDisplayName(fromItem, ctx.dialect);
                const rightTableId = joinTableMap.get(getFromItemLookupKey(fromItem, ctx.dialect));

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
                        id: genId(runtime, 'e'),
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
                        id: genId(runtime, 'e'),
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
                id: genId(runtime, 'e'),
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
                const extraTableId = joinTableMap.get(getFromItemLookupKey(fromItem, ctx.dialect));
                if (extraTableId && lastOutputId) {
                    // Create an implicit CROSS JOIN node
                    ctx.stats.joins++;
                    const crossJoinId = genId(runtime, 'join');
                    nodes.push({
                        id: crossJoinId,
                        type: 'join',
                        label: 'CROSS JOIN',
                        description: `Implicit join with ${getFromItemDisplayName(fromItem, ctx.dialect)}`,
                        details: [getFromItemDisplayName(fromItem, ctx.dialect)],
                        x: 0, y: 0, width: 140, height: 60
                    });
                    edges.push({
                        id: genId(runtime, 'e'),
                        source: lastOutputId,
                        target: crossJoinId
                    });
                    edges.push({
                        id: genId(runtime, 'e'),
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
        const whereId = genId(runtime, 'filter');
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
                id: genId(runtime, 'e'),
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
        const groupId = genId(runtime, 'agg');
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
                id: genId(runtime, 'e'),
                source: previousId,
                target: groupId
            });
        }
        previousId = groupId;
    }

    // Process HAVING
    if (stmt.having) {
        const havingId = genId(runtime, 'filter');
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
                id: genId(runtime, 'e'),
                source: previousId,
                target: havingId
            });
        }
        previousId = havingId;
    }

    // Check for aggregate functions in columns - with detailed breakdown
    const aggregateFuncDetails = extractAggregateFunctionDetails(stmt.columns, ctx.dialect);
    // Always show aggregate node when aggregate functions are present (similar to window functions)
    if (aggregateFuncDetails.length > 0) {
        const aggregateId = genId(runtime, 'aggregate');

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
                id: genId(runtime, 'e'),
                source: previousId,
                target: aggregateId
            });
        }
        previousId = aggregateId;
    }

    // Check for CASE statements in columns - with detailed breakdown
    const caseStatementDetails = extractCaseStatementDetails(stmt.columns);
    if (caseStatementDetails.length > 0) {
        const caseId = genId(runtime, 'case');

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
                id: genId(runtime, 'e'),
                source: previousId,
                target: caseId
            });
        }
        previousId = caseId;
    }

    // Check for window functions in columns - with detailed breakdown
    const windowFuncDetails = extractWindowFunctionDetails(stmt.columns, ctx.dialect, {
        trackFunctionUsage: (functionName, category) => trackFunctionUsage(runtime, functionName, category)
    });
    if (windowFuncDetails.length > 0) {
        ctx.stats.windowFunctions += windowFuncDetails.length;
        const windowId = genId(runtime, 'window');

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
                id: genId(runtime, 'e'),
                source: previousId,
                target: windowId
            });
        }
        previousId = windowId;
    }

    // Process SELECT columns
    const selectId = genId(runtime, 'select');
    const columns = extractColumns(stmt.columns, {
        onSelectStar: () => {
            ctx.hasSelectStar = true;
        }
    });
    // Extract column info for dead column detection
    const columnInfos: ColumnInfo[] = extractColumnInfos(stmt.columns, {
        expressionMode: 'formatted',
        trackFunctionUsage: (functionName, category) => trackFunctionUsage(runtime, functionName, category)
    });
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
            id: genId(runtime, 'e'),
            source: previousId,
            target: selectId
        });
    }

    for (const tableName of scalarSubquerySourceTables) {
        const tableKey = tableName.toLowerCase();
        if (seenTableLabels.has(tableKey)) {
            continue;
        }

        const tableId = genId(runtime, 'table');
        nodes.push({
            id: tableId,
            type: 'table',
            label: tableName,
            description: 'Subquery source (WHERE/SELECT/HAVING/ON)',
            tableCategory: 'subquery_source',
            x: 0, y: 0, width: 140, height: 60
        });
        edges.push({
            id: genId(runtime, 'e'),
            source: tableId,
            target: selectId,
            sqlClause: 'Subquery source',
            clauseType: 'subquery_flow'
        });

        seenTableLabels.add(tableKey);
        const hadTable = ctx.tableUsageMap.has(tableKey);
        trackTableUsage(runtime, tableName);
        if (!hadTable) {
            ctx.stats.tables++;
        }
    }

    previousId = selectId;

    // Process ORDER BY
    if (stmt.orderby && Array.isArray(stmt.orderby) && stmt.orderby.length > 0) {
        const sortId = genId(runtime, 'sort');
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
            id: genId(runtime, 'e'),
            source: previousId,
            target: sortId
        });
        previousId = sortId;
    }

    // Process LIMIT — guard against phantom objects from node-sql-parser
    // (PostgreSQL, Snowflake, Trino, Redshift return { seperator: "", value: [] } when no LIMIT exists)
    if (stmt.limit && !(Array.isArray(stmt.limit.value) && stmt.limit.value.length === 0)) {
        ctx.hasNoLimit = false;
        const limitId = genId(runtime, 'limit');
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
            id: genId(runtime, 'e'),
            source: previousId,
            target: limitId
        });
        previousId = limitId;
    }

    // Add result node
    const resultId = genId(runtime, 'result');
    nodes.push({
        id: resultId,
        type: 'result',
        label: 'Result',
        description: 'Query output',
        x: 0, y: 0, width: 120, height: 60
    });

    edges.push({
        id: genId(runtime, 'e'),
        source: previousId,
        target: resultId
    });

    // Handle UNION/INTERSECT/EXCEPT
    if (stmt._next) {
        ctx.stats.unions++;
        const nextResultId = processStatement(runtime, stmt._next, nodes, edges);
        if (nextResultId) {
            const unionId = genId(runtime, 'union');
            const setOp = stmt.set_op || 'UNION';

            // Collect tables from both sides for details
            const leftTables = extractTablesFromStatement(stmt, ctx.dialect);
            const rightTables = extractTablesFromStatement(stmt._next, ctx.dialect);
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
                id: genId(runtime, 'e'),
                source: resultId,
                target: unionId
            });
            edges.push({
                id: genId(runtime, 'e'),
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
    runtime: SelectExecutionContext,
    fromItem: any,
    nodes: FlowNode[],
    _edges: FlowEdge[],
    cteNames: Set<string> = new Set(),
    asJoin: boolean = false
): string | null {
    const ctx = runtime.context;
    // Check for subquery
    if (fromItem.expr && fromItem.expr.ast) {
        ctx.stats.subqueries++;
        const subqueryId = genId(runtime, 'subquery');
        const alias = fromItem.as || 'subquery';

        // Parse subquery's internal structure
        const subChildren: FlowNode[] = [];
        const subChildEdges: FlowEdge[] = [];
        parseCteOrSubqueryInternals(runtime, fromItem.expr.ast, subChildren, subChildEdges, subqueryId, 0);

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
        trackFunctionUsage(runtime, tableValuedFunctionName, 'tvf');
        ctx.stats.tables++;
        const tableId = genId(runtime, 'table');
        const label = getFromItemDisplayName(fromItem, ctx.dialect);
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
        trackTableUsage(runtime, label);
        return tableId;
    }

    if (fromItem?.expr && !fromItem.expr.ast && fromItem.expr.type === 'function') {
        let unrecognizedFunctionName = resolveFunctionNameFromExpr(fromItem.expr);
        if (unrecognizedFunctionName?.toUpperCase() === 'TABLE') {
            const firstArg = Array.isArray(fromItem.expr.args?.value)
                ? fromItem.expr.args.value[0]
                : (fromItem.expr.args?.value ?? fromItem.expr.args?.expr);
            const wrappedName = resolveFunctionNameFromExpr(firstArg);
            if (wrappedName) {
                unrecognizedFunctionName = wrappedName;
            }
        }

        if (unrecognizedFunctionName) {
            const hintMessage = `Unrecognized table function: ${unrecognizedFunctionName}`;
            const hasHint = ctx.hints.some(h => h.message === hintMessage && h.category === 'quality');
            if (!hasHint) {
                ctx.hints.push({
                    type: 'info',
                    message: hintMessage,
                    suggestion: 'Add to sqlCrack.customTableValuedFunctions in settings if this function should be treated as a table source.',
                    category: 'quality',
                    severity: 'low',
                });
            }
        }
    }

    // Regular table
    const tableName = getTableName(fromItem);
    if (!tableName) { return null; }

    ctx.stats.tables++;
    trackTableUsage(runtime, tableName);
    const tableId = genId(runtime, 'table');
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

function parseCteOrSubqueryInternals(
    runtime: SelectExecutionContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    parentId?: string,
    depth: number = 0
): void {
    const ctx = runtime.context;
    if (!stmt) { return; }

    // Track function usage inside nested SELECTs so stats include aggregates/scalars
    // that appear only in scalar/WHERE subqueries (e.g., COUNT(*) in Query 4 demo).
    if (stmt.columns && Array.isArray(stmt.columns)) {
        extractColumnInfos(stmt.columns, {
            expressionMode: 'formatted',
            trackFunctionUsage: (functionName, category) => trackFunctionUsage(runtime, functionName, category)
        });
    }

    let previousId: string | null = null;

    // Extract tables from FROM clause
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            // Check for nested subqueries in FROM clause
            if (fromItem.expr && fromItem.expr.ast) {
                ctx.stats.subqueries++; // Count nested subqueries
                // Recursively parse the nested subquery
                parseCteOrSubqueryInternals(runtime, fromItem.expr.ast, nodes, edges, parentId, depth + 1);
            } else if (!fromItem.join) {
                const tableName = getTableName(fromItem);
                if (tableName && tableName !== 'table') {
                    // Track table usage for stats (including tables from CTEs and subqueries)
                    trackTableUsage(runtime, tableName);
                    const tableId = genId(runtime, 'child_table');
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
                        edges.push({ id: genId(runtime, 'ce'), source: previousId, target: tableId });
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
                    parseCteOrSubqueryInternals(runtime, fromItem.expr.ast, nodes, edges, parentId, depth + 1);
                } else {
                    const joinId = genId(runtime, 'child_join');
                    const joinTable = getTableName(fromItem);
                    // Track table usage for joined tables in CTEs/subqueries
                    if (joinTable && joinTable !== 'table') {
                        trackTableUsage(runtime, joinTable);
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
                        edges.push({ id: genId(runtime, 'ce'), source: previousId, target: joinId });
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
                parseCteOrSubqueryInternals(runtime, col.expr.ast, nodes, edges, parentId, depth + 1);
            }
        }
    }

    // Add WHERE if present
    if (stmt.where) {
        const whereId = genId(runtime, 'child_where');
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
            edges.push({ id: genId(runtime, 'ce'), source: previousId, target: whereId });
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
        const groupId = genId(runtime, 'child_group');
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
            edges.push({ id: genId(runtime, 'ce'), source: previousId, target: groupId });
        }
        previousId = groupId;
    }

    // Extract CASE statements from SELECT columns in CTEs
    const caseStatementDetails = extractCaseStatementDetails(stmt.columns);
    if (caseStatementDetails.length > 0) {
        const caseId = genId(runtime, 'child_case');

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
            edges.push({ id: genId(runtime, 'ce'), source: previousId, target: caseId });
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
        const sortId = genId(runtime, 'child_sort');
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
            edges.push({ id: genId(runtime, 'ce'), source: previousId, target: sortId });
        }
    }
}

function collectScalarSubquerySourceTables(
    stmt: any,
    cteNames: Set<string>,
    excludedTableLabels: Set<string>,
    dialect: SqlDialect
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
            collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames, dialect);
        }
    }

    return Array.from(sourceTables).filter(name => !excludedTableLabels.has(name.toLowerCase()));
}

function trackFunctionsFromExpressionSubqueries(
    runtime: SelectExecutionContext,
    stmt: any
): void {
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

    const visited = new Set<any>();
    for (const expr of expressions) {
        const subqueries = findSubqueriesInExpression(expr);
        for (const subquery of subqueries) {
            collectFunctionsFromSelectTree(runtime, subquery, visited);
        }
    }
}

function collectFunctionsFromSelectTree(
    runtime: SelectExecutionContext,
    stmt: any,
    visited: Set<any>
): void {
    if (!stmt || typeof stmt !== 'object' || visited.has(stmt)) {
        return;
    }
    visited.add(stmt);

    if (Array.isArray(stmt.columns)) {
        extractColumnInfos(stmt.columns, {
            expressionMode: 'formatted',
            trackFunctionUsage: (functionName, category) => trackFunctionUsage(runtime, functionName, category)
        });
    }

    if (Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            const cteStmt = getCteStatementAst(cte);
            if (cteStmt) {
                collectFunctionsFromSelectTree(runtime, cteStmt, visited);
            }
        }
    }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : (stmt.from ? [stmt.from] : []);
    for (const fromItem of fromItems) {
        const nestedFromSubquery = fromItem?.expr?.ast || (fromItem?.expr?.type === 'select' ? fromItem.expr : null);
        if (nestedFromSubquery) {
            collectFunctionsFromSelectTree(runtime, nestedFromSubquery, visited);
        }

        if (fromItem?.on) {
            const onSubqueries = findSubqueriesInExpression(fromItem.on);
            for (const subquery of onSubqueries) {
                collectFunctionsFromSelectTree(runtime, subquery, visited);
            }
        }
    }

    if (stmt.where) {
        const whereSubqueries = findSubqueriesInExpression(stmt.where);
        for (const subquery of whereSubqueries) {
            collectFunctionsFromSelectTree(runtime, subquery, visited);
        }
    }

    if (stmt.having) {
        const havingSubqueries = findSubqueriesInExpression(stmt.having);
        for (const subquery of havingSubqueries) {
            collectFunctionsFromSelectTree(runtime, subquery, visited);
        }
    }

    if (Array.isArray(stmt.columns)) {
        for (const col of stmt.columns) {
            if (!col?.expr) {
                continue;
            }
            const columnSubqueries = findSubqueriesInExpression(col.expr);
            for (const subquery of columnSubqueries) {
                collectFunctionsFromSelectTree(runtime, subquery, visited);
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
                collectFunctionsFromSelectTree(runtime, subquery, visited);
            }
        }
    }

    if (stmt._next) {
        collectFunctionsFromSelectTree(runtime, stmt._next, visited);
    }
}

function collectTablesFromSelectTree(
    stmt: any,
    sourceTables: Set<string>,
    inheritedCteNames: Set<string>,
    dialect: SqlDialect
): void {
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
                collectTablesFromSelectTree(cteStmt, sourceTables, scopedCteNames, dialect);
            }
        }
    }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : (stmt.from ? [stmt.from] : []);
    for (const fromItem of fromItems) {
        const nestedFromSubquery = fromItem?.expr?.ast || (fromItem?.expr?.type === 'select' ? fromItem.expr : null);
        if (nestedFromSubquery) {
            collectTablesFromSelectTree(nestedFromSubquery, sourceTables, scopedCteNames, dialect);
        } else {
            const tableValuedFunctionName = getTableValuedFunctionName(fromItem, dialect);
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
                collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames, dialect);
            }
        }
    }

    if (stmt.where) {
        const whereSubqueries = findSubqueriesInExpression(stmt.where);
        for (const subquery of whereSubqueries) {
            collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames, dialect);
        }
    }

    if (stmt.having) {
        const havingSubqueries = findSubqueriesInExpression(stmt.having);
        for (const subquery of havingSubqueries) {
            collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames, dialect);
        }
    }

    if (Array.isArray(stmt.columns)) {
        for (const col of stmt.columns) {
            if (!col?.expr) {
                continue;
            }
            const columnSubqueries = findSubqueriesInExpression(col.expr);
            for (const subquery of columnSubqueries) {
                collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames, dialect);
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
                collectTablesFromSelectTree(subquery, sourceTables, scopedCteNames, dialect);
            }
        }
    }

    if (stmt._next) {
        collectTablesFromSelectTree(stmt._next, sourceTables, scopedCteNames, dialect);
    }
}

// Helper function to find subqueries in expressions (for counting nested subqueries)
function findSubqueriesInExpression(expr: any): any[] {
    const subqueries: any[] = [];
    if (!expr) { return subqueries; }
    if (Array.isArray(expr)) {
        for (const item of expr) {
            subqueries.push(...findSubqueriesInExpression(item));
        }
        return subqueries;
    }

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
