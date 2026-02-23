// Column extraction utilities

import type { ColumnInfo } from '../../types';

export type TrackFunctionUsageFn = (
    functionName: unknown,
    category: 'aggregate' | 'window' | 'tvf' | 'scalar'
) => void;

export interface ExpressionFormatOptions {
    trackFunctionUsage?: TrackFunctionUsageFn;
}

export interface ExtractColumnsOptions {
    onSelectStar?: () => void;
}

export interface ExtractColumnInfosOptions extends ExpressionFormatOptions {
    expressionMode?: 'json' | 'formatted';
}

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

export function formatExpressionFromAst(expr: any, options: ExpressionFormatOptions = {}): string {
    if (!expr) { return ''; }

    if (expr.type === 'column_ref') {
        const tableName = getAstString(expr.table);
        const columnName = getAstString(expr.column);
        const table = tableName ? `${tableName}.` : '';
        return `${table}${columnName || '?'}`;
    }

    if (expr.type === 'aggr_func') {
        const funcName = getAstString(expr.name) || 'AGG';
        options.trackFunctionUsage?.(funcName, 'aggregate');
        const distinct = expr.args?.distinct ? 'DISTINCT ' : '';
        let argsStr = '';

        if (expr.args) {
            const args = expr.args.value || expr.args.expr || expr.args;
            if (Array.isArray(args)) {
                argsStr = args.map((arg: any) => formatExpressionFromAst(arg, options)).join(', ');
            } else if (args) {
                argsStr = formatExpressionFromAst(args, options);
            }
        }

        return `${funcName}(${distinct}${argsStr})`;
    }

    if (expr.type === 'function') {
        const funcName = getAstString(expr.name) || 'FUNC';
        options.trackFunctionUsage?.(funcName, expr.over ? 'window' : 'scalar');
        const args = expr.args?.value || expr.args || [];
        const argsStr = Array.isArray(args)
            ? args.map((arg: any) => formatExpressionFromAst(arg, options)).join(', ')
            : formatExpressionFromAst(args, options);
        return `${funcName}(${argsStr})`;
    }

    if (expr.type === 'binary_expr') {
        const left = formatExpressionFromAst(expr.left, options);
        const right = formatExpressionFromAst(expr.right, options);
        return `${left} ${expr.operator || '?'} ${right}`;
    }

    if (expr.type === 'unary_expr') {
        return `${expr.operator || ''}${formatExpressionFromAst(expr.expr, options)}`;
    }

    if (expr.type === 'cast') {
        const innerExpr = formatExpressionFromAst(expr.expr, options);
        const dataType = expr.target?.dataType || expr.target || 'type';
        return `CAST(${innerExpr} AS ${dataType})`;
    }

    if (expr.type === 'extract') {
        options.trackFunctionUsage?.('EXTRACT', 'scalar');
        const field = expr.args?.field || '?';
        const source = formatExpressionFromAst(expr.args?.source, options) || '?';
        return `EXTRACT(${field} FROM ${source})`;
    }

    if (expr.type === 'number' || expr.type === 'single_quote_string' || expr.type === 'string') {
        return String(expr.value ?? '');
    }

    if (expr.type === 'star' || expr.column === '*') {
        return '*';
    }

    if (expr.over) {
        const funcName = typeof expr.name === 'string' ? expr.name : expr.name?.name || 'FUNC';
        return `${funcName}() OVER(...)`;
    }

    if (expr.type === 'case') {
        return 'CASE...END';
    }

    if (expr.column) { return getAstString(expr.column) || 'expr'; }
    if (expr.value !== undefined) { return String(expr.value); }
    if (expr.name) { return getAstString(expr.name) || 'expr'; }

    return 'expr';
}

export function extractColumns(columns: any, options: ExtractColumnsOptions = {}): string[] {
    if (!columns || columns === '*') {
        options.onSelectStar?.();
        return ['*'];
    }
    if (!Array.isArray(columns)) {
        return ['*'];
    }

    return columns.map((col: any) => {
        const exprColumn = getAstString(col?.expr?.column);
        if (col === '*' || exprColumn === '*') {
            options.onSelectStar?.();
            return '*';
        }
        const aliasName = getAstString(col?.as);
        if (aliasName) { return aliasName; }
        if (exprColumn) { return exprColumn; }
        const exprName = getAstString(col?.expr?.name);
        if (exprName) { return `${exprName}()`; }
        return 'expr';
    }).slice(0, 10);
}

export function extractColumnInfos(columns: any, options: ExtractColumnInfosOptions = {}): ColumnInfo[] {
    if (!columns || columns === '*') {
        return [];
    }
    if (!Array.isArray(columns)) { return []; }

    return columns.map((col: any): ColumnInfo => {
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

        const expression = col.expr
            ? (options.expressionMode === 'formatted'
                ? formatExpressionFromAst(col.expr, options)
                : JSON.stringify(col.expr))
            : name;

        let sourceColName: string | undefined;
        let sourceTableName: string | undefined;
        if (col.expr?.type === 'cast') {
            sourceColName = getAstString(col.expr.expr?.column) || undefined;
            sourceTableName = getAstString(col.expr.expr?.table) || undefined;
        } else {
            sourceColName = getAstString(col.expr?.column) || undefined;
            sourceTableName = getAstString(col.expr?.table) || undefined;
        }

        return {
            name: String(name),
            expression: expression,
            sourceColumn: sourceColName,
            sourceTable: sourceTableName,
            isAggregate: col.expr?.type === 'aggr_func' || false,
            isWindowFunc: !!col.expr?.over,
            transformationType: col.as && col.expr?.column ? 'renamed' :
                col.expr?.type === 'aggr_func' ? 'aggregated' :
                    col.expr?.over ? 'calculated' : 'passthrough'
        };
    });
}
