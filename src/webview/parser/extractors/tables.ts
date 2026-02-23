// Table extraction utilities

import { isTableValuedFunction } from '../../../dialects';
import type { SqlDialect } from '../../types';

export function getTableName(item: any): string {
    if (typeof item === 'string') { return item; }

    if (item.table) {
        if (typeof item.table === 'object') {
            return item.table.table || item.table.name || item.table.value || item.as || 'table';
        }
        return item.table;
    }

    return item.name || item.as || 'table';
}

export function getNormalizedFromAlias(item: any): string | null {
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

export function extractFunctionName(nameNode: any): string | null {
    if (!nameNode) {
        return null;
    }
    if (typeof nameNode === 'string') {
        return nameNode;
    }
    if (Array.isArray(nameNode.name)) {
        const parts = nameNode.name
            .map((part: any) => {
                if (typeof part === 'string') {
                    return part;
                }
                if (typeof part?.value === 'string') {
                    return part.value;
                }
                if (typeof part?.name === 'string') {
                    return part.name;
                }
                return null;
            })
            .filter((part: string | null): part is string => Boolean(part));
        if (parts.length > 0) {
            return parts.join('.');
        }
    }
    if (typeof nameNode.name === 'string') {
        return nameNode.name;
    }
    if (typeof nameNode.value === 'string') {
        return nameNode.value;
    }
    return null;
}

export function resolveFunctionNameFromExpr(expr: any): string | null {
    if (!expr) {
        return null;
    }
    if (expr.type === 'flatten') {
        return 'FLATTEN';
    }
    if (expr.type === 'function' || expr.type === 'aggr_func') {
        return extractFunctionName(expr.name);
    }
    return null;
}

export function getTableValuedFunctionName(item: any, dialect: SqlDialect = 'MySQL'): string | null {
    if (!item || typeof item !== 'object') {
        return null;
    }
    if (item.type === 'unnest') {
        return 'UNNEST';
    }

    const expr = item.expr;
    if (!expr) {
        return null;
    }
    if (expr.type === 'flatten') {
        return 'FLATTEN';
    }

    const directName = resolveFunctionNameFromExpr(expr);
    if (!directName) {
        return null;
    }

    if (directName.toUpperCase() === 'TABLE') {
        const firstArg = Array.isArray(expr.args?.value)
            ? expr.args.value[0]
            : (expr.args?.value ?? expr.args?.expr);
        const wrappedName = resolveFunctionNameFromExpr(firstArg);
        if (wrappedName && isTableValuedFunction(wrappedName, dialect)) {
            return wrappedName;
        }
        return null;
    }

    return isTableValuedFunction(directName, dialect) ? directName : null;
}

export function getFromItemDisplayName(item: any, dialect: SqlDialect = 'MySQL'): string {
    const alias = getNormalizedFromAlias(item);
    if (alias) {
        return alias;
    }
    const tableName = getTableName(item);
    if (tableName && tableName !== 'table') {
        return tableName;
    }
    return getTableValuedFunctionName(item, dialect) || tableName;
}

export function getFromItemLookupKey(item: any, dialect: SqlDialect = 'MySQL'): string {
    const alias = getNormalizedFromAlias(item);
    if (alias) {
        return alias;
    }
    const tableName = getTableName(item);
    if (tableName && tableName !== 'table') {
        return tableName;
    }
    return getTableValuedFunctionName(item, dialect) || tableName;
}

export function extractTablesFromStatement(stmt: any, dialect: SqlDialect = 'MySQL'): string[] {
    const tables: string[] = [];
    if (!stmt || !stmt.from) { return tables; }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
    for (const item of fromItems) {
        const tableValuedFunctionName = getTableValuedFunctionName(item, dialect);
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
