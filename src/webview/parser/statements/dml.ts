import type { FlowEdge, FlowNode } from '../../types';
import type { ParserContext } from '../context';

type GenIdFn = (prefix: string) => string;
type ProcessSelectFn = (
    context: ParserContext,
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[]
) => string | null;
type GetTableNameFn = (item: any) => string;
type ExtractConditionsFn = (where: any) => string[];

export interface ProcessDmlStatementsArgs {
    context: ParserContext;
    stmt: any;
    nodes: FlowNode[];
    edges: FlowEdge[];
    rootId: string;
    label: string;
    description: string;
    genId: GenIdFn;
    processSelect: ProcessSelectFn;
    getTableName: GetTableNameFn;
    extractConditions: ExtractConditionsFn;
}

export function tryProcessDmlStatements(args: ProcessDmlStatementsArgs): string | null {
    const {
        context,
        stmt,
        nodes,
        edges,
        rootId,
        label,
        description,
        genId,
        processSelect,
        getTableName,
        extractConditions
    } = args;

    // INSERT ... SELECT: render inner SELECT flow, then wire it to write target(s).
    if (context.statementType === 'insert') {
        const insertSourceSelect = getInsertSelectAst(stmt);
        if (insertSourceSelect) {
            const selectRootId = processSelect(context, insertSourceSelect, nodes, edges);
            const targetTables = stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) : [];

            nodes.push({
                id: rootId,
                type: 'result',
                label: 'INSERT',
                description: 'Insert statement',
                x: 0,
                y: 0,
                width: 160,
                height: 60
            });

            if (targetTables.length === 0) {
                if (selectRootId) {
                    edges.push({
                        id: genId('e'),
                        source: selectRootId,
                        target: rootId
                    });
                }
                return rootId;
            }

            for (const tableRef of targetTables) {
                const tableName = getTableName(tableRef);
                if (!tableName) { continue; }

                context.stats.tables++;
                const targetId = genId('table');
                nodes.push({
                    id: targetId,
                    type: 'table',
                    label: tableName,
                    description: 'Insert target table',
                    accessMode: 'write',
                    operationType: 'INSERT',
                    x: 0,
                    y: 0,
                    width: 140,
                    height: 60
                });

                if (selectRootId) {
                    edges.push({
                        id: genId('e'),
                        source: selectRootId,
                        target: targetId
                    });
                }

                edges.push({
                    id: genId('e'),
                    source: targetId,
                    target: rootId
                });
            }

            return rootId;
        }
    }

    // UPDATE/DELETE with source queries:
    // - UPDATE ... FROM ...
    // - UPDATE/DELETE ... WHERE ... IN (SELECT ...)
    // - UPDATE/DELETE ... WHERE EXISTS (SELECT ...)
    if (context.statementType === 'update' || context.statementType === 'delete') {
        const sourceRootIds: string[] = [];

        if (context.statementType === 'update') {
            const fromItems = getUpdateSourceFromItems(stmt, getTableName);
            if (fromItems.length > 0) {
                const updateSourceRootId = processSelect(
                    context,
                    buildSyntheticSelectFromFromItems(fromItems),
                    nodes,
                    edges
                );
                if (updateSourceRootId) {
                    sourceRootIds.push(updateSourceRootId);
                }
            }
        }

        const whereSelects = extractSelectSubqueriesFromExpression(stmt.where);
        for (const whereSelect of whereSelects) {
            const whereSourceRootId = processSelect(context, whereSelect, nodes, edges);
            if (whereSourceRootId) {
                sourceRootIds.push(whereSourceRootId);
            }
        }

        const uniqueSourceRootIds = Array.from(new Set(sourceRootIds));
        if (uniqueSourceRootIds.length > 0) {
            const labelWidth = Math.min(420, Math.max(160, label.length * 10 + 40));
            nodes.push({
                id: rootId,
                type: 'result',
                label,
                description,
                x: 0,
                y: 0,
                width: labelWidth,
                height: 60
            });

            const targetTables = stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) : [];
            const opType = context.statementType.toUpperCase() as 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE' | 'CREATE_TABLE_AS';
            const targetIds: string[] = [];

            for (const t of targetTables) {
                const tableName = getTableName(t);
                if (!tableName) {
                    continue;
                }
                context.stats.tables++;
                const targetId = genId('table');
                nodes.push({
                    id: targetId,
                    type: 'table',
                    label: tableName,
                    description: 'Target table',
                    accessMode: 'write',
                    operationType: opType,
                    x: 0,
                    y: 0,
                    width: 140,
                    height: 60
                });
                targetIds.push(targetId);
            }

            if (targetIds.length === 0) {
                for (const sourceId of uniqueSourceRootIds) {
                    edges.push({
                        id: genId('e'),
                        source: sourceId,
                        target: rootId
                    });
                }
                return rootId;
            }

            let inboundToTargets = uniqueSourceRootIds;
            if (stmt.where) {
                const conditionDetails = extractConditions(stmt.where);
                const filterId = genId('filter');
                nodes.push({
                    id: filterId,
                    type: 'filter',
                    label: 'WHERE',
                    description: 'DML filter condition',
                    details: conditionDetails.length > 0 ? [conditionDetails.join(' AND ')] : undefined,
                    x: 0,
                    y: 0,
                    width: 140,
                    height: 60
                });
                for (const sourceId of uniqueSourceRootIds) {
                    edges.push({
                        id: genId('e'),
                        source: sourceId,
                        target: filterId
                    });
                }
                inboundToTargets = [filterId];
            }

            for (const inboundId of inboundToTargets) {
                for (const targetId of targetIds) {
                    edges.push({
                        id: genId('e'),
                        source: inboundId,
                        target: targetId
                    });
                }
            }

            for (const targetId of targetIds) {
                edges.push({
                    id: genId('e'),
                    source: targetId,
                    target: rootId
                });
            }

            return rootId;
        }
    }

    return null;
}

function getInsertSelectAst(stmt: any): any | null {
    if (!stmt || stmt.type?.toLowerCase() !== 'insert') { return null; }
    const values = stmt.values;
    if (!values || typeof values !== 'object') { return null; }
    if (values.type?.toLowerCase() !== 'select') { return null; }
    return values;
}

function getUpdateSourceFromItems(stmt: any, getTableName: GetTableNameFn): any[] {
    if (!stmt || stmt.type?.toLowerCase() !== 'update' || !Array.isArray(stmt.from)) {
        return [];
    }

    const targetTables = stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) : [];
    if (targetTables.length === 0) {
        return stmt.from;
    }

    // Compare (tableName, alias) fingerprints so self-joins aren't filtered out.
    // e.g. UPDATE employees e ... FROM employees e2 should keep the FROM item.
    const targetFingerprints = new Set<string>();
    for (const target of targetTables) {
        const name = getTableName(target)?.toLowerCase() || '';
        const alias = (typeof target?.as === 'string' ? target.as : '').toLowerCase();
        targetFingerprints.add(`${name}::${alias}`);
    }

    return stmt.from.filter((fromItem: any) => {
        const name = getTableName(fromItem)?.toLowerCase() || '';
        const alias = (typeof fromItem?.as === 'string' ? fromItem.as : '').toLowerCase();
        const fingerprint = `${name}::${alias}`;
        return !targetFingerprints.has(fingerprint);
    });
}

function buildSyntheticSelectFromFromItems(fromItems: any[]): any {
    return {
        type: 'select',
        with: null,
        columns: [{ type: 'expr', expr: { type: 'star', value: '*' }, as: null }],
        from: fromItems,
        where: null,
        groupby: null,
        having: null,
        orderby: null,
        limit: null,
        window: null
    };
}

function extractSelectSubqueriesFromExpression(expression: any): any[] {
    const selects: any[] = [];
    const seen = new Set<any>();
    collectSelectSubqueriesFromExpression(expression, selects, seen);
    return selects;
}

function collectSelectSubqueriesFromExpression(expression: any, selects: any[], seen: Set<any>): void {
    if (!expression || typeof expression !== 'object') {
        return;
    }
    if (seen.has(expression)) {
        return;
    }
    seen.add(expression);

    if (Array.isArray(expression)) {
        for (const item of expression) {
            collectSelectSubqueriesFromExpression(item, selects, seen);
        }
        return;
    }

    const exprType = typeof expression.type === 'string' ? expression.type.toLowerCase() : '';
    if (exprType === 'select') {
        selects.push(expression);
    }

    const ast = (expression as any).ast;
    if (ast && typeof ast === 'object' && !seen.has(ast)) {
        const astType = typeof ast.type === 'string' ? ast.type.toLowerCase() : '';
        if (astType === 'select') {
            seen.add(ast);
            selects.push(ast);
        }
    }

    for (const value of Object.values(expression)) {
        collectSelectSubqueriesFromExpression(value, selects, seen);
    }
}
