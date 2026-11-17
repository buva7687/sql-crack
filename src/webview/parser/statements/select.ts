import type {
    ColumnInfo,
    FlowEdge,
    FlowNode,
    SqlDialect
} from '../../types';
import { getSetOperationTree, type SetOperationTree } from './setOperations';
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
    getCteNameKey,
    getFromItemDisplayName,
    getFromItemIdentity,
    getFromItemLookupKey,
    getTableName,
    getTableValuedFunctionName,
    resolveFunctionNameFromExpr
} from '../extractors';

import {
    allowsImplicitCteSelfReference,
    declaresRecursiveCte,
    getCteReferenceKey,
    getCteStatementAst,
    collectCteColumnShapes,
    getSelectProjection,
    isWildcardProjection,
} from '../extractors/selectProjection';

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

/** Extract column name string from AST column_ref (handles PostgreSQL wrapped object form). */
function resolveColumnName(col: any): string {
    if (col === null || col === undefined) { return ''; }
    if (typeof col === 'string') { return col; }
    if (typeof col === 'number') { return String(col); }
    if (typeof col === 'object') {
        // PostgreSQL wraps column as { expr: { type: 'default', value: 'name' } }
        if (col.expr?.value) { return String(col.expr.value); }
        if (col.value) { return String(col.value); }
        // column_ref: { table: 't', column: 'name' }
        if (col.column) { return resolveColumnName(col.column); }
        // Function call: { type: 'function', name: { ... } }
        if (col.type === 'function' && col.name) {
            const fname = typeof col.name === 'string' ? col.name : col.name?.name?.[0]?.value || col.name;
            return typeof fname === 'string' ? `${fname}(...)` : '';
        }
        // Aggregate expression: { type: 'aggr_func', name: 'COUNT' }
        if (col.type === 'aggr_func' && col.name) { return `${col.name}(...)`; }
        // CASE expression: { type: 'case', args: [...] } or parser variants with expr
        if (col.type === 'case') { return 'CASE'; }
        // Window function wrappers often expose the function under expr/over.
        if ((col.type === 'window_func' || col.over) && col.expr) {
            return resolveColumnName(col.expr);
        }
        // Binary expression: { type: 'binary_expr', operator: '+', left, right }
        if (col.type === 'binary_expr' && col.operator) { return `expr(${col.operator})`; }
        // Cast: { type: 'cast', expr, target }
        if (col.type === 'cast' && col.expr) { return `CAST(${resolveColumnName(col.expr)})`; }
    }
    return '';
}

function resolveLimitValue(value: any): string {
    const unwrappedValue = value?.value ?? value;

    if (unwrappedValue === null || unwrappedValue === undefined) {
        return '?';
    }
    if (Array.isArray(unwrappedValue)) {
        return resolveLimitValue(unwrappedValue[0]);
    }
    if (typeof unwrappedValue === 'string' || typeof unwrappedValue === 'number' || typeof unwrappedValue === 'bigint') {
        return String(unwrappedValue);
    }
    if (typeof unwrappedValue === 'object') {
        if (unwrappedValue.value !== null && unwrappedValue.value !== undefined) {
            return resolveLimitValue(unwrappedValue.value);
        }
        if (unwrappedValue.type === 'var' && unwrappedValue.name !== null && unwrappedValue.name !== undefined) {
            const prefix = typeof unwrappedValue.prefix === 'string' ? unwrappedValue.prefix : '';
            return prefix + String(unwrappedValue.name);
        }
    }
    return '?';
}

function resolveLimitDetails(limit: any): string {
    const values = Array.isArray(limit?.value) ? limit.value : [limit?.value ?? limit];
    const separator = String(limit?.seperator ?? limit?.separator ?? '').toLowerCase();
    let rowCount = values[0];
    let offset: any;

    if (values.length > 1) {
        if (separator === ',') {
            offset = values[0];
            rowCount = values[1];
        } else if (separator === 'offset') {
            rowCount = values[0];
            offset = values[1];
        }
    }

    const rowText = resolveLimitValue(rowCount);
    const offsetText = offset === undefined ? null : resolveLimitValue(offset);
    return offsetText === null
        ? rowText + ' rows'
        : rowText + ' rows (offset ' + offsetText + ')';
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
    cteNames: Set<string> = new Set(),
    cteNodeIdsByName: Map<string, string> = new Map()
): string {
    const ctx = runtime.context;
    const setTree = getSetOperationTree(stmt, ctx.dialect);
    if (setTree) {
        const intoTarget = getSelectIntoTarget(stmt, ctx.dialect);
        const root = processSetOperationTree(runtime, setTree, nodes, edges,
            branch => processSelect(runtime, intoTarget ? { ...branch, into: undefined } : branch,
                nodes, edges, cteNames, cteNodeIdsByName), undefined, collectCteColumnShapes(stmt, ctx.dialect)).id!;
        return intoTarget ? appendSelectIntoTarget(runtime, nodes, edges, root, intoTarget) : root;
    }
    const cteReferenceIdsByName = new Map<string, string[]>();

    const recordCteReference = (cteKey: string, nodeId: string): void => {
        const existing = cteReferenceIdsByName.get(cteKey);
        if (existing) {
            if (!existing.includes(nodeId)) { existing.push(nodeId); }
            return;
        }
        cteReferenceIdsByName.set(cteKey, [nodeId]);
    };

    if (Array.isArray(stmt.with)) {
        const recursive = stmt.with.some(declaresRecursiveCte);
        const supportsForwardCteReferences = recursive && (ctx.dialect === 'PostgreSQL' || ctx.dialect === 'BigQuery');
        if (supportsForwardCteReferences) {
            for (const cte of stmt.with) {
                const key = getCteNameKey(cte.name, ctx.dialect);
                cteNames.add(key);
                cteNodeIdsByName.set(key, genId(runtime, 'cte'));
            }
        }

        for (const cte of stmt.with) {
            ctx.stats.ctes++;
            const key = getCteNameKey(cte.name, ctx.dialect);
            const cteId = supportsForwardCteReferences ? cteNodeIdsByName.get(key)! : genId(runtime, 'cte');
            const cteName = getAstString(cte.name) || 'CTE';
            const cteChildren: FlowNode[] = [];
            const cteChildEdges: FlowEdge[] = [];
            const cteStmt = getCteStatementAst(cte);
            const isRecursive = declaresRecursiveCte(cte);
            if (isRecursive || allowsImplicitCteSelfReference(cteStmt, ctx.dialect)) {
                cteNames.add(key);
            }
            const dependencies = new Set<string>();
            if (cteStmt) {
                parseCteOrSubqueryInternals(runtime, cteStmt, cteChildren, cteChildEdges, cteId, 0, cteNames,
                    referencedKey => {
                        const dependencyId = cteNodeIdsByName.get(referencedKey);
                        if (dependencyId && dependencyId !== cteId) { dependencies.add(dependencyId); }
                    });
            }
            for (const dependencyId of dependencies) {
                edges.push({ id: genId(runtime, 'e'), source: dependencyId, target: cteId });
            }

            const containerWidth = Math.max(200, cteChildren.length > 0 ? 220 : 160);
            const containerHeight = cteChildren.length > 0 ? 80 + cteChildren.length * 35 : 60;
            const ctePrefix = isRecursive ? 'WITH RECURSIVE ' : 'WITH ';
            nodes.push({
                id: cteId,
                type: 'cte',
                label: ctePrefix + cteName,
                relationIdentity: { name: ctePrefix + key, qualifiers: [] },
                description: isRecursive ? 'Recursive Common Table Expression' : 'Common Table Expression',
                children: cteChildren.length > 0 ? cteChildren : undefined,
                childEdges: cteChildren.length > 0 ? cteChildEdges : undefined,
                expanded: false,
                collapsible: cteChildren.length > 0,
                depth: 0,
                x: 0, y: 0, width: containerWidth, height: containerHeight
            });
            cteNames.add(key);
            cteNodeIdsByName.set(key, cteId);
        }
    }

    // Process FROM tables (data sources) - first pass: create all table nodes
    const tableIds: string[] = [];
    const joinTableMap: Map<string, string> = new Map(); // Maps table name to its node id

    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            const tableId = processFromItem(
                runtime,
                fromItem,
                nodes,
                edges,
                cteNames,
                Boolean(fromItem.join),
                recordCteReference
            );
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
    const baseTableId = tableIds[0] ?? null;
    let lastOutputId: string | null = baseTableId; // Start with first table as base when present

    if (stmt.from && Array.isArray(stmt.from)) {
        let leftTableId: string | null = baseTableId;

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
                    joinType: joinType.toUpperCase(),
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
                    });
                }

                // The join output becomes the left side for next join
                leftTableId = joinId;
                lastOutputId = joinId;
            }
        }
    }

    // Connect each CTE node to the actual outer-flow nodes that reference it.
    for (const [cteName, referenceIds] of cteReferenceIdsByName.entries()) {
        const cteId = cteNodeIdsByName.get(cteName);
        if (!cteId) {
            continue;
        }

        for (const referenceId of referenceIds) {
            edges.push({
                id: genId(runtime, 'e'),
                source: cteId,
                target: referenceId
            });
        }
    }

    // Connect comma-separated FROM items (implicit cross joins) that aren't
    // already wired by the explicit JOIN logic above. The first table, when
    // present, is the base; additional non-join items need an edge into flow.
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
                        joinType: 'CROSS',
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
    let previousId: string | null = lastOutputId ?? baseTableId;
    let savedWhereId: string | null = null;
    let savedHavingId: string | null = null;
    if (stmt.where) {
        const whereId = genId(runtime, 'filter');
        savedWhereId = whereId;
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
            });
        }
        previousId = whereId;
    }

    // Process GROUP BY
    // groupby can be an array or an object with columns property
    const hasGroupBy = stmt.groupby && (
        (Array.isArray(stmt.groupby) && stmt.groupby.length > 0) ||
        (stmt.groupby.columns && Array.isArray(stmt.groupby.columns) && stmt.groupby.columns.length > 0)
    );
    if (hasGroupBy) {
        ctx.stats.aggregations++;
        const groupId = genId(runtime, 'agg');
        const groupbyArr = Array.isArray(stmt.groupby) ? stmt.groupby : (stmt.groupby.columns || []);
        const groupCols = groupbyArr.map((g: any) => resolveColumnName(g.column) || resolveColumnName(g.expr?.column) || '?').join(', ');
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
        const havingConditions = extractConditions(stmt.having);
        ctx.stats.conditions += havingConditions.length;
        const havingId = genId(runtime, 'filter');
        savedHavingId = havingId;
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
    if (aggregateFuncDetails.length && !hasGroupBy) {ctx.stats.aggregations++;}
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
    const projectedColumnCount = Array.isArray(stmt.columns) ? stmt.columns.length : columns.length;
    // Extract column info for dead column detection
    const columnInfos: ColumnInfo[] = extractColumnInfos(stmt.columns, {
        expressionMode: 'formatted',
        dialect: runtime.context.dialect,
        trackFunctionUsage: (functionName, category) => trackFunctionUsage(runtime, functionName, category)
    });
    nodes.push({
        id: selectId,
        type: 'select',
        label: 'SELECT',
        description: 'Project columns',
        details: projectedColumnCount <= 5 ? columns : [`${projectedColumnCount} columns`],
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

    for (const { tableName, clause } of scalarSubquerySourceTables) {
        const tableKey = tableName.toLowerCase();
        if (seenTableLabels.has(tableKey)) {
            continue;
        }

        const clauseDescriptions: Record<SqClause, string> = {
            where: 'WHERE subquery source',
            having: 'HAVING subquery source',
            select: 'SELECT subquery source',
            on: 'JOIN ON subquery source',
            orderby: 'ORDER BY subquery source'
        };

        const targetId =
            clause === 'where' && savedWhereId ? savedWhereId :
            clause === 'having' && savedHavingId ? savedHavingId :
            clause === 'on' && lastOutputId ? lastOutputId :
            selectId;

        const tableId = genId(runtime, 'table');
        nodes.push({
            id: tableId,
            type: 'table',
            label: tableName,
            description: clauseDescriptions[clause],
            tableCategory: 'subquery_source',
            x: 0, y: 0, width: 140, height: 60
        });
        edges.push({
            id: genId(runtime, 'e'),
            source: tableId,
            target: targetId,
            sqlClause: clauseDescriptions[clause],
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

    previousId = appendSelectTail(runtime, stmt, nodes, edges, previousId)!;

    const intoTarget = getSelectIntoTarget(stmt, ctx.dialect);
    if (intoTarget) {
        return appendSelectIntoTarget(runtime, nodes, edges, previousId, intoTarget);
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

    return resultId;
}

function getSelectIntoTarget(stmt: any, dialect: SqlDialect): string | null {
    if (dialect !== 'PostgreSQL' && dialect !== 'TransactSQL') { return null; }
    const into = stmt.into;
    if (into?.type !== 'into' || into.keyword || typeof into.expr !== 'string' || into.expr.startsWith('@')) {
        return null;
    }
    return into.expr;
}

function appendSelectIntoTarget(
    runtime: SelectExecutionContext,
    nodes: FlowNode[],
    edges: FlowEdge[],
    source: string,
    target: string
): string {
    const id = genId(runtime, 'table');
    nodes.push({
        id, type: 'table', label: target,
        description: 'Table created by SELECT INTO',
        tableCategory: 'physical', accessMode: 'write', operationType: 'CREATE_TABLE',
        x: 0, y: 0, width: 140, height: 60,
    });
    edges.push({ id: genId(runtime, 'e'), source, target: id, label: 'SELECT INTO' });
    runtime.context.stats.tables++;
    return id;
}

interface NestedSelectPosition {
    parentId?: string;
    depth: number;
}

function appendSelectTail(
    runtime: SelectExecutionContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    previousId: string | null,
    nested?: NestedSelectPosition
): string | null {
    const position = nested ? { parentId: nested.parentId, depth: nested.depth + 1 } : {};
    const prefix = nested ? 'child_' : '';
    const orderby = Array.isArray(stmt.orderby) ? stmt.orderby : stmt.orderby?.columns;
    if (orderby?.length) {
        const sortId = genId(runtime, `${prefix}sort`);
        const sortCols = orderby.map((item: any) => {
            const column = resolveColumnName(item.expr?.column) || resolveColumnName(item.expr) || item.expr?.value || '?';
            return `${column} ${item.type || 'ASC'}`;
        }).join(', ');
        nodes.push({
            id: sortId, type: 'sort', label: 'ORDER BY', description: 'Sort results', details: [sortCols],
            ...position, x: 0, y: 0, width: 140, height: 60
        });
        if (previousId) { edges.push({ id: genId(runtime, nested ? 'ce' : 'e'), source: previousId, target: sortId }); }
        previousId = sortId;
    }
    // Several dialects emit an empty LIMIT object when no clause is present.
    if (stmt.limit && !(Array.isArray(stmt.limit.value) && stmt.limit.value.length === 0)) {
        if (!nested) { runtime.context.hasNoLimit = false; }
        const limitId = genId(runtime, `${prefix}limit`);
        nodes.push({
            id: limitId, type: 'limit', label: 'LIMIT', description: 'Limit rows', details: [resolveLimitDetails(stmt.limit)],
            ...position, x: 0, y: 0, width: 120, height: 60
        });
        if (previousId) { edges.push({ id: genId(runtime, nested ? 'ce' : 'e'), source: previousId, target: limitId }); }
        previousId = limitId;
    }
    return previousId;
}

function processSetOperationTree(
    runtime: SelectExecutionContext,
    tree: SetOperationTree,
    nodes: FlowNode[],
    edges: FlowEdge[],
    renderBranch: (statement: any) => string | null,
    nested?: NestedSelectPosition,
    cteShapes: ReturnType<typeof collectCteColumnShapes> = new Map(),
): { id: string | null; statement: any; tables: string[] } {
    if ('statement' in tree) {
        return { id: renderBranch(tree.statement), statement: tree.statement,
            tables: extractTablesFromStatement(tree.statement, runtime.context.dialect) };
    }
    // Render leaves in SQL order so SELECT/UNION lineage keeps its branch ordinals.
    const left = processSetOperationTree(runtime, tree.left, nodes, edges, renderBranch, nested, cteShapes);
    const right = processSetOperationTree(runtime, tree.right, nodes, edges, renderBranch, nested, cteShapes);
    runtime.context.stats.unions++;
    maybeAddSetOperationColumnCountHint(runtime.context, tree.operator, left.statement, right.statement, cteShapes);
    const edgePrefix = nested ? 'ce' : 'e';
    const leftNode = nodes.find(node => node.id === left.id);
    const rightNode = nodes.find(node => node.id === right.id);
    // Keep associative UNION ALL chains shallow for large files. An operand's
    // local ORDER BY/LIMIT ends in a tail node, so it cannot be flattened here.
    const reusable = tree.operator === 'UNION ALL'
        ? [leftNode, rightNode].find(node => node?.type === 'union' && node.label === 'UNION ALL')
        : undefined;
    let unionId: string;
    if (reusable) {
        unionId = reusable.id;
        const branchCount = (node: FlowNode | undefined): number => {
            if (node?.type !== 'union' || node.label !== 'UNION ALL') { return 1; }
            const count = /^(\d+) branches$/.exec(node.details?.[0] || '');
            return count ? Number(count[1]) : 2;
        };
        reusable.details = [`${branchCount(leftNode) + branchCount(rightNode)} branches`];
        const addedId = reusable.id === left.id ? right.id : left.id;
        if (addedId) { edges.push({ id: genId(runtime, edgePrefix), source: addedId, target: unionId }); }
    } else {
        unionId = genId(runtime, nested ? 'child_union' : 'union');
        const details: string[] = [];
        if (left.tables.length) { details.push(`Left: ${left.tables.join(', ')}`); }
        if (right.tables.length) { details.push(`Right: ${right.tables.join(', ')}`); }
        nodes.push({
            id: unionId, type: 'union', label: tree.operator, description: `${tree.operator} operation`,
            details: details.length ? details : undefined,
            ...(nested ? { parentId: nested.parentId, depth: nested.depth + 1 } : {}),
            x: 0, y: 0, width: 140, height: 60
        });
        if (left.id) { edges.push({ id: genId(runtime, edgePrefix), source: left.id, target: unionId }); }
        if (right.id) { edges.push({ id: genId(runtime, edgePrefix), source: right.id, target: unionId }); }
    }
    const id = tree.tail ? appendSelectTail(runtime, tree.tail, nodes, edges, unionId, nested) : unionId;
    return { id, statement: left.statement, tables: [...new Set([...left.tables, ...right.tables])] };
}

function maybeAddSetOperationColumnCountHint(
    context: ParserContext,
    setOp: string,
    leftStmt: any,
    rightStmt: any,
    cteShapes: ReturnType<typeof collectCteColumnShapes>
): void {
    const count = (stmt: any): number | null => {
        const columns = getSelectProjection(stmt, collectCteColumnShapes(stmt, context.dialect, cteShapes), context.dialect);
        return columns.length === 0 || columns.some(isWildcardProjection) ? null : columns.length;
    };
    const leftCount = count(leftStmt);
    const rightCount = count(rightStmt);
    if (leftCount === null || rightCount === null || leftCount === rightCount) {
        return;
    }

    const signature = `${setOp.toUpperCase()}:${leftCount}:${rightCount}`;
    const mutableContext = context as ParserContext & { setOpColumnCountHints?: Set<string> };
    if (!mutableContext.setOpColumnCountHints) {
        mutableContext.setOpColumnCountHints = new Set<string>();
    }
    if (mutableContext.setOpColumnCountHints.has(signature)) {
        return;
    }
    mutableContext.setOpColumnCountHints.add(signature);

    context.hints.push({
        type: 'warning',
        severity: 'medium',
        category: 'quality',
        message: `${setOp.toUpperCase()} branches project different column counts (${leftCount} vs ${rightCount}).`,
        suggestion: 'Set operations should return the same number of columns in each branch. Align the SELECT lists to avoid runtime errors.',
    });
}

function processFromItem(
    runtime: SelectExecutionContext,
    fromItem: any,
    nodes: FlowNode[],
    _edges: FlowEdge[],
    cteNames: Set<string> = new Set(),
    asJoin: boolean = false,
    onCteReference?: (cteName: string, nodeId: string) => void
): string | null {
    const ctx = runtime.context;
    // Check for subquery
    if (fromItem.expr && fromItem.expr.ast) {
        ctx.stats.subqueries++;
        const subqueryId = genId(runtime, 'subquery');
        const alias = getAstString(fromItem.as) || 'subquery';

        // Parse subquery's internal structure
        const subChildren: FlowNode[] = [];
        const subChildEdges: FlowEdge[] = [];
        parseCteOrSubqueryInternals(runtime, fromItem.expr.ast, subChildren, subChildEdges, subqueryId, 0,
            cteNames, name => onCteReference?.(name, subqueryId));

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
        const tableAlias = getAstString(fromItem.as)?.trim() || undefined;
        if (tableAlias && tableAlias !== label) {
            details.push(`Alias: ${tableAlias}`);
        }

        nodes.push({
            id: tableId,
            type: 'table',
            label,
            alias: tableAlias,
            relationIdentity: getFromItemIdentity(fromItem),
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
    const tableAlias = getAstString(fromItem.as)?.trim() || undefined;
    // Determine if this is a CTE reference
    const cteKey = getCteReferenceKey(fromItem, cteNames, ctx.dialect);
    nodes.push({
        id: tableId,
        type: 'table',
        label: tableName,
        alias: tableAlias,
        relationIdentity: getFromItemIdentity(fromItem),
        description: cteKey !== undefined
            ? (asJoin ? 'Joined CTE reference' : 'CTE reference')
            : (asJoin ? 'Joined table' : 'Source table'),
        details: tableAlias ? [`Alias: ${tableAlias}`] : undefined,
        tableCategory: cteKey !== undefined ? 'cte_reference' : 'physical',
        x: 0, y: 0, width: 140, height: 60
    });

    if (cteKey !== undefined && onCteReference) {
        onCteReference(cteKey, tableId);
    }

    return tableId;
}

function parseCteOrSubqueryInternals(
    runtime: SelectExecutionContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    parentId?: string,
    depth: number = 0,
    cteNames: Set<string> = new Set(),
    onCteReference?: (cteName: string) => void
): string | null {
    const ctx = runtime.context;
    if (!stmt) { return null; }
    const setTree = getSetOperationTree(stmt, ctx.dialect);
    if (setTree) {
        return processSetOperationTree(runtime, setTree, nodes, edges,
            branch => parseCteOrSubqueryInternals(runtime, branch, nodes, edges, parentId, depth, cteNames, onCteReference),
            { parentId, depth }, collectCteColumnShapes(stmt, ctx.dialect)).id;
    }

    // Track function usage inside nested SELECTs so stats include aggregates/scalars
    // that appear only in scalar/WHERE subqueries (e.g., COUNT(*) in Query 4 demo).
    if (stmt.columns && Array.isArray(stmt.columns)) {
        extractColumnInfos(stmt.columns, {
            expressionMode: 'formatted',
            dialect: runtime.context.dialect,
            trackFunctionUsage: (functionName, category) => trackFunctionUsage(runtime, functionName, category)
        });
    }

    let previousId: string | null = null;
    const parseExpressionSubqueries = (expressions: any[]): void => {
        for (const expr of expressions) {
            const subqueries = findSubqueriesInExpression(expr);
            ctx.stats.subqueries += subqueries.length;
            for (const subquery of subqueries) {
                // Expression subqueries are side branches, not part of the main
                // FROM -> clause pipeline for the containing CTE/subquery.
                parseCteOrSubqueryInternals(runtime, subquery, nodes, edges, parentId, depth + 1, cteNames, onCteReference);
            }
        }
    };

    // Extract tables from FROM clause
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            // Check for nested subqueries in FROM clause
            if (fromItem.expr && fromItem.expr.ast && !fromItem.join) {
                ctx.stats.subqueries++; // Count nested subqueries
                // Recursively parse the nested subquery and capture last node for chaining
                const subqLastId = parseCteOrSubqueryInternals(runtime, fromItem.expr.ast, nodes, edges, parentId, depth + 1, cteNames, onCteReference);
                if (subqLastId) { previousId = subqLastId; }
            } else if (!fromItem.join) {
                const tableName = getTableName(fromItem);
                if (tableName && tableName !== 'table') {
                    // Track table usage for stats (including tables from CTEs and subqueries)
                    trackTableUsage(runtime, tableName);
                    const tableId = genId(runtime, 'child_table');
                    const tableAlias = getAstString(fromItem.as)?.trim() || undefined;
                    const cteKey = getCteReferenceKey(fromItem, cteNames, ctx.dialect);
                    if (cteKey !== undefined) { onCteReference?.(cteKey); }
                    nodes.push({
                        id: tableId,
                        type: 'table',
                        label: tableName,
                        alias: tableAlias,
                        relationIdentity: getFromItemIdentity(fromItem),
                        description: cteKey !== undefined ? 'CTE reference' : 'Table',
                        tableCategory: cteKey !== undefined ? 'cte_reference' : 'physical',
                        details: tableAlias ? [`Alias: ${tableAlias}`] : undefined,
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
                    // Recursively parse the nested subquery and capture last node for chaining
                    const joinSubqLastId = parseCteOrSubqueryInternals(runtime, fromItem.expr.ast, nodes, edges, parentId, depth + 1, cteNames, onCteReference);
                    if (joinSubqLastId) { previousId = joinSubqLastId; }
                } else {
                    const joinId = genId(runtime, 'child_join');
                    const joinTable = getTableName(fromItem);
                    // Track table usage for joined tables in CTEs/subqueries
                    if (joinTable && joinTable !== 'table') {
                        trackTableUsage(runtime, joinTable);
                        const cteKey = getCteReferenceKey(fromItem, cteNames, ctx.dialect);
                        if (cteKey !== undefined) { onCteReference?.(cteKey); }
                    }
                    // Extract join condition details
                    const joinDetails: string[] = [];
                    if (fromItem.on) {
                        joinDetails.push(formatCondition(fromItem.on));
                    }
                    joinDetails.push(`${joinTable}`);
                    nodes.push({
                        id: joinId,
                        type: 'join',
                        label: `${fromItem.join} ${joinTable}`,
                        relationIdentity: getFromItemIdentity(fromItem),
                        joinType: String(fromItem.join || 'JOIN').toUpperCase(),
                        description: 'Join',
                        details: joinDetails,
                        parentId: parentId,
                        depth: depth + 1,
                        x: 0, y: 0, width: 140, height: 60
                    });
                    if (previousId) {
                        edges.push({ id: genId(runtime, 'ce'), source: previousId, target: joinId });
                    }
                    previousId = joinId;
                }
            }
        }
    }

    const expressionSubqueries: any[] = [];
    if (stmt.where) {
        expressionSubqueries.push(stmt.where);
    }
    if (stmt.having) {
        expressionSubqueries.push(stmt.having);
    }
    if (stmt.columns && Array.isArray(stmt.columns)) {
        for (const col of stmt.columns) {
            if (col?.expr) {
                expressionSubqueries.push(col.expr);
            }
        }
    }
    if (Array.isArray(stmt.orderby)) {
        for (const orderItem of stmt.orderby) {
            if (orderItem?.expr) {
                expressionSubqueries.push(orderItem.expr);
            }
        }
    }
    if (Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            if (fromItem?.on) {
                expressionSubqueries.push(fromItem.on);
            }
        }
    }
    parseExpressionSubqueries(expressionSubqueries);

    // Add WHERE if present
    if (stmt.where) {
        const whereId = genId(runtime, 'child_where');
        const conditions = extractConditions(stmt.where);
        ctx.stats.conditions += conditions.length;
        nodes.push({
            id: whereId,
            type: 'filter',
            label: 'WHERE',
            description: 'Filter rows',
            details: conditions,
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 140, height: 60
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
        ctx.stats.aggregations++;
        const groupId = genId(runtime, 'child_group');
        const groupbyArr = Array.isArray(stmt.groupby) ? stmt.groupby : (stmt.groupby.columns || []);
        const groupCols = groupbyArr.map((g: any) => resolveColumnName(g.column) || resolveColumnName(g.expr?.column) || '?').join(', ');
        nodes.push({
            id: groupId,
            type: 'aggregate',
            label: 'GROUP BY',
            description: 'Aggregate rows',
            details: [`Columns: ${groupCols}`],
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 140, height: 60
        });
        if (previousId) {
            edges.push({ id: genId(runtime, 'ce'), source: previousId, target: groupId });
        }
        previousId = groupId;
    }

    // Add HAVING if present
    if (stmt.having) {
        const havingConditions = extractConditions(stmt.having);
        ctx.stats.conditions += havingConditions.length;
        const havingId = genId(runtime, 'child_having');
        nodes.push({
            id: havingId,
            type: 'filter',
            label: 'HAVING',
            description: 'Filter groups',
            details: [formatCondition(stmt.having)],
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 140, height: 60
        });
        if (previousId) {
            edges.push({ id: genId(runtime, 'ce'), source: previousId, target: havingId });
        }
        previousId = havingId;
    }

    // Add aggregate function details
    const aggregateFuncDetails = extractAggregateFunctionDetails(stmt.columns, ctx.dialect);
    if (aggregateFuncDetails.length && !hasGroupBy) {ctx.stats.aggregations++;}
    if (aggregateFuncDetails.length > 0) {
        const aggregateId = genId(runtime, 'child_aggregate');
        const baseHeight = 50;
        const perFuncHeight = 28;
        const aggregateHeight = baseHeight + aggregateFuncDetails.length * perFuncHeight;
        nodes.push({
            id: aggregateId,
            type: 'aggregate',
            label: 'AGGREGATE',
            description: `${aggregateFuncDetails.length} aggregate function${aggregateFuncDetails.length > 1 ? 's' : ''}`,
            aggregateDetails: { functions: aggregateFuncDetails },
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 180, height: Math.min(aggregateHeight, 150)
        });
        if (previousId) {
            edges.push({ id: genId(runtime, 'ce'), source: previousId, target: aggregateId });
        }
        previousId = aggregateId;
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

    // Add window function details
    const windowFuncDetails = extractWindowFunctionDetails(stmt.columns, ctx.dialect, {
        trackFunctionUsage: (functionName, category) => trackFunctionUsage(runtime, functionName, category)
    });
    if (windowFuncDetails.length > 0) {
        ctx.stats.windowFunctions += windowFuncDetails.length;
        const windowId = genId(runtime, 'child_window');
        const baseHeight = 50;
        const perFuncHeight = 28;
        const windowHeight = baseHeight + windowFuncDetails.length * perFuncHeight;
        nodes.push({
            id: windowId,
            type: 'window',
            label: 'WINDOW',
            description: `${windowFuncDetails.length} window function${windowFuncDetails.length > 1 ? 's' : ''}`,
            windowDetails: { functions: windowFuncDetails },
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 180, height: Math.min(windowHeight, 150)
        });
        if (previousId) {
            edges.push({ id: genId(runtime, 'ce'), source: previousId, target: windowId });
        }
        previousId = windowId;
    }

    // Add SELECT projection node for CTE/subquery internals so internal flow
    // includes a clear projection step (mirrors top-level SELECT pipeline).
    if (stmt.columns && Array.isArray(stmt.columns) && stmt.columns.length > 0) {
        const selectId = genId(runtime, 'child_select');
        const columns = extractColumns(stmt.columns, {
            onSelectStar: () => {
                ctx.hasSelectStar = true;
            }
        });
        const projectedColumnCount = stmt.columns.length;
        const columnInfos: ColumnInfo[] = extractColumnInfos(stmt.columns, {
            expressionMode: 'formatted',
            dialect: runtime.context.dialect,
            trackFunctionUsage: (functionName, category) => trackFunctionUsage(runtime, functionName, category)
        });
        nodes.push({
            id: selectId,
            type: 'select',
            label: 'SELECT',
            description: 'Project columns',
            details: projectedColumnCount <= 5 ? columns : [`${projectedColumnCount} columns`],
            columns: columnInfos,
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 140, height: 60
        });
        if (previousId) {
            edges.push({ id: genId(runtime, 'ce'), source: previousId, target: selectId });
        }
        previousId = selectId;
    }

    previousId = appendSelectTail(runtime, stmt, nodes, edges, previousId, { parentId, depth });

    return previousId;
}

type SqClause = 'where' | 'having' | 'select' | 'orderby' | 'on';

function collectScalarSubquerySourceTables(
    stmt: any,
    cteNames: Set<string>,
    excludedTableLabels: Set<string>,
    dialect: SqlDialect
): Array<{ tableName: string; clause: SqClause }> {
    const scopedCteNames = new Set(cteNames);
    // Map from lowercase table name → { originalName, clause } (first clause wins for dedup)
    const tableClauseMap = new Map<string, { originalName: string; clause: SqClause }>();

    const collectFromExpressions = (expressions: any[], clause: SqClause) => {
        const tables = new Set<string>();
        for (const expr of expressions) {
            const subqueries = findSubqueriesInExpression(expr);
            for (const subquery of subqueries) {
                collectTablesFromSelectTree(subquery, tables, scopedCteNames, dialect);
            }
        }
        for (const name of tables) {
            const key = name.toLowerCase();
            if (!tableClauseMap.has(key)) {
                tableClauseMap.set(key, { originalName: name, clause });
            }
        }
    };

    if (stmt?.where) {
        collectFromExpressions([stmt.where], 'where');
    }
    if (stmt?.having) {
        collectFromExpressions([stmt.having], 'having');
    }
    if (Array.isArray(stmt?.columns)) {
        const colExprs = stmt.columns.filter((col: any) => col?.expr).map((col: any) => col.expr);
        collectFromExpressions(colExprs, 'select');
    }
    if (Array.isArray(stmt?.orderby)) {
        const orderExprs = stmt.orderby.filter((o: any) => o?.expr).map((o: any) => o.expr);
        collectFromExpressions(orderExprs, 'orderby');
    }
    if (Array.isArray(stmt?.from)) {
        const onExprs = stmt.from.filter((f: any) => f?.on).map((f: any) => f.on);
        collectFromExpressions(onExprs, 'on');
    }

    return Array.from(tableClauseMap.entries())
        .filter(([key]) => !excludedTableLabels.has(key))
        .map(([, { originalName, clause }]) => ({ tableName: originalName, clause }));
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
            dialect: runtime.context.dialect,
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
        const recursive = stmt.with.some(declaresRecursiveCte);
        if (recursive && (dialect === 'PostgreSQL' || dialect === 'BigQuery')) {
            for (const cte of stmt.with) { scopedCteNames.add(getCteNameKey(cte.name, dialect)); }
        }
        for (const cte of stmt.with) {
            const key = getCteNameKey(cte.name, dialect);
            const cteStmt = getCteStatementAst(cte);
            if (declaresRecursiveCte(cte) || allowsImplicitCteSelfReference(cteStmt, dialect)) {
                scopedCteNames.add(key);
            }
            if (cteStmt) {
                collectTablesFromSelectTree(cteStmt, sourceTables, scopedCteNames, dialect);
            }
            scopedCteNames.add(key);
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
                if (tableName && tableName !== 'table' && getCteReferenceKey(fromItem, scopedCteNames, dialect) === undefined) {
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
function findSubqueriesInExpression(expr: any, visited: WeakSet<object> = new WeakSet<object>()): any[] {
    const subqueries: any[] = [];
    if (!expr) { return subqueries; }
    if (typeof expr === 'object') {
        if (visited.has(expr)) {
            return subqueries;
        }
        visited.add(expr);
    }
    if (Array.isArray(expr)) {
        for (const item of expr) {
            subqueries.push(...findSubqueriesInExpression(item, visited));
        }
        return subqueries;
    }

    // Check if this expression itself is a subquery
    if (expr.type === 'select') {
        subqueries.push(expr);
    } else if (expr.ast && expr.ast.type === 'select') {
        subqueries.push(expr.ast);
    } else if (expr.ast && typeof expr.ast === 'object') {
        subqueries.push(...findSubqueriesInExpression(expr.ast, visited));
    }

    if (expr.expr) {
        subqueries.push(...findSubqueriesInExpression(expr.expr, visited));
    }

    if (expr.value && typeof expr.value === 'object') {
        subqueries.push(...findSubqueriesInExpression(expr.value, visited));
    }

    // Recursively check left and right sides of binary expressions
    if (expr.left) {
        subqueries.push(...findSubqueriesInExpression(expr.left, visited));
    }
    if (expr.right) {
        subqueries.push(...findSubqueriesInExpression(expr.right, visited));
    }

    // Check function arguments
    if (expr.args && Array.isArray(expr.args)) {
        for (const arg of expr.args) {
            subqueries.push(...findSubqueriesInExpression(arg, visited));
        }
    } else if (Array.isArray(expr.args?.value)) {
        for (const arg of expr.args.value) {
            subqueries.push(...findSubqueriesInExpression(arg, visited));
        }
    } else if (expr.args && expr.args.expr) {
        subqueries.push(...findSubqueriesInExpression(expr.args.expr, visited));
    } else if (expr.args && typeof expr.args === 'object') {
        subqueries.push(...findSubqueriesInExpression(expr.args, visited));
    }

    if (Array.isArray(expr.columns)) {
        for (const col of expr.columns) {
            if (col?.expr) {
                subqueries.push(...findSubqueriesInExpression(col.expr, visited));
            }
        }
    }

    return subqueries;
}
