// Column lineage extraction

import { FlowNode, FlowEdge, ColumnLineage, SqlDialect } from '../../types';
import { getSetOperationTree, type SetOperationTree } from '../../../shared';
import { getSelectSourceScope, getIncomingEdgeMap } from './sourceScope';

import { getAstString, getNormalizedFromAlias, getTableName } from '../extractors';
import { collectCteColumnShapes, getSelectProjection } from '../extractors/selectProjection';

export function extractColumnLineage(stmt: any, nodes: FlowNode[], edges: FlowEdge[], dialect: SqlDialect = 'MySQL'): ColumnLineage[] {
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const incoming = getIncomingEdgeMap(edges, false);
    const selects = nodes.filter(node => node.type === 'select');
    let selectIndex = 0;
    const cteShapes = collectCteColumnShapes(stmt, dialect);
    const extractTreeLineage = (tree: SetOperationTree): ColumnLineage[] => {
        if ('statement' in tree) {
            const select = selects[selectIndex++];
            const scope = select ? [...getSelectSourceScope(select.id, nodeMap, incoming).values()] : [];
            const branch = tree.statement;
            const columns = getSelectProjection(branch, collectCteColumnShapes(branch, dialect, cteShapes), dialect);
            return extractSelectColumnLineage(branch, columns, scope);
        }
        const left = extractTreeLineage(tree.left);
        // Visit dependency-only branches as well so SELECT indices remain aligned
        // with the graph's SQL-order traversal, even when they contribute no values.
        const right = extractTreeLineage(tree.right);
        if (/^UNION\b/i.test(tree.operator)) {
            // UNION output names come from the first SELECT. Past an
            // unresolved star, a projection's ordinal cannot be determined.
            for (let ordinal = 0; ordinal < left.length && ordinal < right.length; ordinal++) {
                const column = left[ordinal];
                const contributor = right[ordinal];
                if (column.outputColumn === '*' || contributor.outputColumn === '*') { break; }
                for (const source of contributor.sources) {
                    if (!column.sources.some(existing => existing.nodeId === source.nodeId && existing.table === source.table && existing.column === source.column)) {
                        column.sources.push(source);
                    }
                }
            }
        }
        return left;
    };
    return extractTreeLineage(getSetOperationTree(stmt, dialect) || { statement: stmt });
}

function extractSelectColumnLineage(stmt: any, columns: any[], nodes: FlowNode[]): ColumnLineage[] {
    const lineage: ColumnLineage[] = [];

    if (!stmt || stmt.type?.toLowerCase() !== 'select' || !stmt.columns) {
        return lineage;
    }

    // Build table alias map
    const tableAliasMap = new Map<string, string>();
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            const tableName = getTableName(fromItem);
            const alias = getNormalizedFromAlias(fromItem) || tableName;
            if (tableName && alias) {
                tableAliasMap.set(alias.toLowerCase(), tableName);
            }
        }
    }

    // Find table nodes for mapping
    const tableNodes = nodes.filter(n => n.type === 'table');

    // Process each column
    for (const col of columns) {
        if (col === '*') {
            lineage.push({
                outputColumn: '*',
                sources: tableNodes.map(n => ({
                    table: n.label,
                    column: '*',
                    nodeId: n.id
                }))
            });
            continue;
        }

        const colName = getAstString(col.as) || getAstString(col.expr?.column) || getAstString(col.expr?.name) || 'expr';
        const sources: ColumnLineage['sources'] = [];

        // Try to extract source table and column
        if (col.expr) {
            extractSourcesFromExpr(col.expr, sources, tableAliasMap, tableNodes);
        }

        lineage.push({
            outputColumn: String(colName),
            sources
        });
    }

    return lineage;
}

// Recursively extract source columns from expression
export function extractSourcesFromExpr(
    expr: any,
    sources: ColumnLineage['sources'],
    tableAliasMap: Map<string, string>,
    tableNodes: FlowNode[]
): void {
    if (!expr) {return;}

    // Direct column reference
    if (expr.type === 'column_ref' || expr.column) {
        const column = getAstString(expr.column) || getAstString(expr.name) || 'expr';
        const rawTable = expr.table;
        const tableAlias = getAstString(rawTable) || '';

        let tableName = tableAlias;
        if (tableAlias && tableAliasMap.has(tableAlias.toLowerCase())) {
            tableName = tableAliasMap.get(tableAlias.toLowerCase()) || tableAlias;
        }

        // Aliases identify table instances; labels do not distinguish self-joins.
        const aliasNode = tableAlias ? tableNodes.find(n => n.alias?.toLowerCase() === tableAlias.toLowerCase()) : undefined;
        const labelNodes = tableNodes.filter(n => n.label.toLowerCase() === tableName.toLowerCase());
        const tableNode = aliasNode || (labelNodes.length === 1 ? labelNodes[0] : undefined);

        if (tableName || tableNodes.length === 1) {
            sources.push({
                table: tableName || (tableNodes[0]?.label || 'unknown'),
                column: column,
                nodeId: tableNode?.id || (!tableAlias && tableNodes.length === 1 ? tableNodes[0].id : '')
            });
        }
        return;
    }

    // Binary expression (e.g., a + b)
    if (expr.type === 'binary_expr') {
        extractSourcesFromExpr(expr.left, sources, tableAliasMap, tableNodes);
        extractSourcesFromExpr(expr.right, sources, tableAliasMap, tableNodes);
        return;
    }

    // Function call (including aggregates)
    if (expr.args) {
        const args = expr.args.value || expr.args;
        if (Array.isArray(args)) {
            for (const arg of args) {
                extractSourcesFromExpr(arg, sources, tableAliasMap, tableNodes);
            }
        } else if (typeof args === 'object') {
            extractSourcesFromExpr(args, sources, tableAliasMap, tableNodes);
        }
    }

    // CASE expression
    if (expr.type === 'case') {
        if (expr.args) {
            for (const caseArg of expr.args) {
                extractSourcesFromExpr(caseArg.cond, sources, tableAliasMap, tableNodes);
                extractSourcesFromExpr(caseArg.result, sources, tableAliasMap, tableNodes);
            }
        }
    }
}
