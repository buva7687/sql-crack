// Column lineage extraction

import { FlowNode, FlowEdge, ColumnLineage } from '../../types';
import { getSelectSourceScope, getIncomingEdgeMap } from './sourceScope';

function getAstString(val: any, depth = 0): string | null {
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

export function extractColumnLineage(stmt: any, nodes: FlowNode[], edges: FlowEdge[]): ColumnLineage[] {
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const incoming = getIncomingEdgeMap(edges, false);
    const selects = nodes.filter(node => node.type === 'select');
    let branch = stmt;
    let index = 0;
    let lineage: ColumnLineage[] = [];
    const visited = new Set<any>();
    while (branch && !visited.has(branch)) {
        visited.add(branch);
        const select = selects[index];
        const scope = select ? [...getSelectSourceScope(select.id, nodeMap, incoming).values()] : [];
        const branchLineage = extractSelectColumnLineage(branch, scope);
        if (index === 0) {
            lineage = branchLineage;
        } else {
            // UNION output names come from the first SELECT; aliases in later branches may differ.
            lineage.forEach((column, ordinal) => {
                for (const source of branchLineage[ordinal]?.sources || []) {
                    if (!column.sources.some(existing => existing.nodeId === source.nodeId && existing.table === source.table && existing.column === source.column)) {
                        column.sources.push(source);
                    }
                }
            });
        }
        if (!/^UNION\b/i.test(branch.set_op || '')) { break; }
        branch = branch._next;
        index++;
    }
    return lineage;
}

function extractSelectColumnLineage(stmt: any, nodes: FlowNode[]): ColumnLineage[] {
    const lineage: ColumnLineage[] = [];

    if (!stmt || stmt.type?.toLowerCase() !== 'select' || !stmt.columns) {
        return lineage;
    }

    // Build table alias map
    const tableAliasMap = new Map<string, string>();
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            const rawTable = fromItem.table || fromItem.name;
            const tableName = typeof rawTable === 'string' ? rawTable : (rawTable?.table || rawTable?.name || '');
            const rawAlias = fromItem.as || tableName;
            const alias = typeof rawAlias === 'string' ? rawAlias : (rawAlias?.table || rawAlias?.name || tableName);
            if (tableName && alias) {
                tableAliasMap.set(alias.toLowerCase(), tableName);
            }
        }
    }

    // Find table nodes for mapping
    const tableNodes = nodes.filter(n => n.type === 'table');

    // Process each column
    const columns = Array.isArray(stmt.columns) ? stmt.columns : [];
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
