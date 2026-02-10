// Column extraction utilities (pure functions, no global state)

import { ColumnInfo } from '../../types';

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

/**
 * Extract column information from SELECT statement AST for dead column detection.
 */
export function extractColumnInfos(columns: any): ColumnInfo[] {
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

        const expression = col.expr ? JSON.stringify(col.expr) : name;

        return {
            name: String(name),
            expression: expression,
            sourceColumn: getAstString(col.expr?.column) || undefined,
            sourceTable: getAstString(col.expr?.table) || undefined,
            isAggregate: col.expr?.type === 'aggr_func' || false,
            isWindowFunc: !!col.expr?.over,
            transformationType: col.as && col.expr?.column ? 'renamed' :
                col.expr?.type === 'aggr_func' ? 'aggregated' :
                    col.expr?.over ? 'calculated' : 'passthrough'
        };
    });
}
