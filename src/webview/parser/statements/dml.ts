import type { FlowEdge, FlowNode, OptimizationHint } from '../../types';
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

interface UpsertPresentation {
    label: string;
    description: string;
    details?: string[];
    hint: OptimizationHint;
}

const IDENTIFIER_WRAPPER_PATTERN = /[`"'\[\]]/g;

function normalizeIdentifier(value: string): string {
    return value.replace(IDENTIFIER_WRAPPER_PATTERN, '');
}

function extractIdentifierName(node: any): string | null {
    if (typeof node === 'string') {
        const trimmed = normalizeIdentifier(node.trim());
        return trimmed || null;
    }
    if (typeof node === 'number') {
        return String(node);
    }
    if (!node || typeof node !== 'object') {
        return null;
    }
    if (typeof node.column === 'string' || typeof node.column === 'number') {
        return extractIdentifierName(node.column);
    }
    if (node.column) {
        return extractIdentifierName(node.column);
    }
    if (typeof node.value === 'string' || typeof node.value === 'number') {
        return extractIdentifierName(node.value);
    }
    if (node.value) {
        return extractIdentifierName(node.value);
    }
    if (node.expr) {
        return extractIdentifierName(node.expr);
    }
    if (typeof node.name === 'string' || typeof node.name === 'number') {
        return extractIdentifierName(node.name);
    }
    if (Array.isArray(node.name)) {
        const parts = node.name.map((part: any) => extractIdentifierName(part)).filter(Boolean);
        return parts.length > 0 ? parts.join('.') : null;
    }
    return null;
}

function dedupe(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function extractConflictTargetColumns(target: any): string[] {
    if (!target || typeof target !== 'object') {
        return [];
    }

    if (Array.isArray(target.expr)) {
        return dedupe(target.expr.map((item: any) => extractIdentifierName(item)));
    }

    const single = extractIdentifierName(target.expr || target.column || target.value || target);
    return single ? [single] : [];
}

function extractSetColumns(assignments: any): string[] {
    if (!Array.isArray(assignments)) {
        return [];
    }

    return dedupe(assignments.map((assignment: any) => {
        if (!assignment || typeof assignment !== 'object') {
            return null;
        }
        if (typeof assignment.column === 'string' || typeof assignment.column === 'number') {
            return extractIdentifierName(assignment.column);
        }
        if (assignment.column) {
            return extractIdentifierName(assignment.column);
        }
        if (assignment.target) {
            return extractIdentifierName(assignment.target);
        }
        return extractIdentifierName(assignment);
    }));
}

function extractInsertOrAction(stmt: any): string | null {
    if (!Array.isArray(stmt?.or)) {
        return null;
    }

    const action = stmt.or
        .map((part: any) => typeof part?.value === 'string' ? part.value.toUpperCase() : '')
        .find((value: string) => value && value !== 'OR');

    return action || null;
}

function pushHintOnce(context: ParserContext, hint: OptimizationHint): void {
    const exists = context.hints.some(existing =>
        existing.message === hint.message
        && existing.suggestion === hint.suggestion
        && existing.category === hint.category
    );
    if (!exists) {
        context.hints.push(hint);
    }
}

function buildUpsertPresentation(context: ParserContext, stmt: any): UpsertPresentation | null {
    if (!stmt || stmt.type?.toLowerCase() !== 'insert') {
        return null;
    }

    if (stmt.conflict) {
        const targetColumns = extractConflictTargetColumns(stmt.conflict.target);
        const actionExpr = stmt.conflict.action?.expr;
        const actionType = typeof actionExpr?.type === 'string' ? actionExpr.type.toLowerCase() : '';
        const action = actionType === 'update'
            ? 'DO UPDATE'
            : actionType === 'origin'
                ? `DO ${String(actionExpr?.value || '').toUpperCase()}`
                : 'DO UPDATE';
        const updateColumns = actionType === 'update' ? extractSetColumns(actionExpr?.set) : [];
        const conflictTarget = targetColumns.length > 0
            ? `ON CONFLICT (${targetColumns.join(', ')})`
            : 'ON CONFLICT';
        const descriptionParts = [conflictTarget, action];
        if (updateColumns.length > 0) {
            descriptionParts.push(`SET: ${updateColumns.join(', ')}`);
        }

        const message = context.dialect === 'SQLite'
            ? 'Detected SQLite ON CONFLICT upsert'
            : 'Detected INSERT ... ON CONFLICT upsert';
        const suggestion = context.dialect === 'SQLite'
            ? 'SQLite ON CONFLICT was parsed using PostgreSQL-compatible conflict AST because direct SQLite grammar support is incomplete.'
            : `Conflict handling is modeled directly for ${context.dialect}.`;

        return {
            label: 'UPSERT',
            description: descriptionParts.join(' | '),
            details: descriptionParts,
            hint: {
                type: 'info',
                message,
                suggestion,
                category: 'best-practice',
                severity: 'low',
            }
        };
    }

    if (stmt.on_duplicate_update?.set) {
        const updateColumns = extractSetColumns(stmt.on_duplicate_update.set);
        const descriptionParts = ['ON DUPLICATE KEY UPDATE'];
        if (updateColumns.length > 0) {
            descriptionParts.push(`SET: ${updateColumns.join(', ')}`);
        }

        return {
            label: 'UPSERT',
            description: descriptionParts.join(' | '),
            details: descriptionParts,
            hint: {
                type: 'info',
                message: 'Detected ON DUPLICATE KEY UPDATE upsert',
                suggestion: `${context.dialect} duplicate-key conflict handling is modeled directly.`,
                category: 'best-practice',
                severity: 'low',
            }
        };
    }

    const sqliteAction = extractInsertOrAction(stmt);
    if (sqliteAction) {
        const description = `SQLite conflict resolution: ${sqliteAction}`;
        return {
            label: `INSERT OR ${sqliteAction}`,
            description,
            details: [description],
            hint: {
                type: 'info',
                message: `Detected SQLite INSERT OR ${sqliteAction}`,
                suggestion: `SQLite ${sqliteAction} conflict handling is modeled directly.`,
                category: 'best-practice',
                severity: 'low',
            }
        };
    }

    return null;
}

function trackTargetTable(context: ParserContext, tableName: string): void {
    const key = tableName.toLowerCase();
    context.tableUsageMap.set(key, (context.tableUsageMap.get(key) || 0) + 1);
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

    if (context.statementType === 'insert') {
        const upsertPresentation = buildUpsertPresentation(context, stmt);
        if (upsertPresentation) {
            const insertSourceSelect = getInsertSelectAst(stmt);
            const targetTables = stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) : [];
            const firstTargetName = targetTables.length === 1 ? getTableName(targetTables[0]) : '';
            const rootLabel = firstTargetName ? `${upsertPresentation.label} ${firstTargetName}` : upsertPresentation.label;
            const rootWidth = Math.min(420, Math.max(180, rootLabel.length * 10 + 40));

            nodes.push({
                id: rootId,
                type: 'result',
                label: rootLabel,
                description: upsertPresentation.description,
                details: upsertPresentation.details,
                accessMode: 'write',
                operationType: 'INSERT',
                x: 0,
                y: 0,
                width: rootWidth,
                height: 60
            });

            pushHintOnce(context, upsertPresentation.hint);

            const selectRootId = insertSourceSelect
                ? processSelect(context, insertSourceSelect, nodes, edges)
                : null;

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
                if (!tableName) {
                    continue;
                }

                trackTargetTable(context, tableName);
                const targetId = genId('table');
                nodes.push({
                    id: targetId,
                    type: 'table',
                    label: tableName,
                    description: 'Upsert target table',
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
                trackTargetTable(context, tableName);
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
        } else if (context.statementType === 'delete') {
            const fromItems = getDeleteSourceFromItems(stmt, getTableName);
            if (fromItems.length > 0) {
                const deleteSourceRootId = processSelect(
                    context,
                    buildSyntheticSelectFromFromItems(fromItems),
                    nodes,
                    edges
                );
                if (deleteSourceRootId) {
                    sourceRootIds.push(deleteSourceRootId);
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

            const targetTables = context.statementType === 'delete'
                ? resolveDeleteTargetTableNames(stmt, getTableName)
                : (stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]).map((tableRef: any) => getTableName(tableRef)).filter(Boolean) : []);
            const opType = context.statementType.toUpperCase() as 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE' | 'CREATE_TABLE_AS';
            const targetIds: string[] = [];

            for (const t of targetTables) {
                const tableName = typeof t === 'string' ? t : getTableName(t);
                if (!tableName) {
                    continue;
                }
                context.stats.tables++;
                trackTargetTable(context, tableName);
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

function getNormalizedAlias(item: any): string | null {
    const rawAlias = typeof item?.as === 'string' ? normalizeIdentifier(item.as.trim()) : '';
    return rawAlias || null;
}

export function resolveDeleteTargetTableNames(stmt: any, getTableName: GetTableNameFn): string[] {
    const targetTables = stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) : [];
    if (targetTables.length === 0) {
        return [];
    }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : [];
    const aliasToTable = new Map<string, string>();

    for (const fromItem of fromItems) {
        const tableName = getTableName(fromItem);
        if (!tableName) {
            continue;
        }

        aliasToTable.set(normalizeIdentifier(tableName).toLowerCase(), tableName);
        const alias = getNormalizedAlias(fromItem);
        if (alias) {
            aliasToTable.set(alias.toLowerCase(), tableName);
        }
    }

    return dedupe(targetTables.map((targetRef: any) => {
        const rawName = getTableName(targetRef);
        if (!rawName) {
            return null;
        }

        const lookupKey = normalizeIdentifier(rawName).toLowerCase();
        return aliasToTable.get(lookupKey) || rawName;
    }));
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

function getDeleteSourceFromItems(stmt: any, getTableName: GetTableNameFn): any[] {
    if (!stmt || stmt.type?.toLowerCase() !== 'delete' || !Array.isArray(stmt.from)) {
        return [];
    }

    const targetTables = stmt.table ? (Array.isArray(stmt.table) ? stmt.table : [stmt.table]) : [];
    if (targetTables.length === 0) {
        return stmt.from;
    }

    const fromFingerprints = stmt.from.map((fromItem: any) => {
        const tableName = getTableName(fromItem);
        const normalizedName = tableName ? normalizeIdentifier(tableName).toLowerCase() : '';
        const alias = getNormalizedAlias(fromItem)?.toLowerCase() || '';
        return { normalizedName, alias };
    });

    // Match DELETE target aliases back to FROM items so joined deletes do not
    // duplicate the write target as a read source.
    const targetFingerprints = new Set<string>();
    for (const target of targetTables) {
        const rawName = getTableName(target);
        if (!rawName) {
            continue;
        }

        const normalizedTarget = normalizeIdentifier(rawName).toLowerCase();
        const matchingFromItems = fromFingerprints.filter((fromItem: { normalizedName: string; alias: string }) =>
            fromItem.normalizedName === normalizedTarget || fromItem.alias === normalizedTarget
        );

        if (matchingFromItems.length > 0) {
            for (const match of matchingFromItems) {
                targetFingerprints.add(`${match.normalizedName}::${match.alias}`);
            }
            continue;
        }

        targetFingerprints.add(`${normalizedTarget}::`);
    }

    return stmt.from.filter((_: any, index: number) => {
        const fromItem = fromFingerprints[index];
        if (!fromItem || !fromItem.normalizedName) {
            return true;
        }

        const fingerprint = `${fromItem.normalizedName}::${fromItem.alias}`;
        if (targetFingerprints.has(fingerprint)) {
            return false;
        }

        return !targetFingerprints.has(`${fromItem.normalizedName}::`);
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
