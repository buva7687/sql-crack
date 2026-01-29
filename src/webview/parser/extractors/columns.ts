// Column extraction utilities (pure functions, no global state)

import { ColumnInfo } from '../../types';

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
        if (col.as) {
            name = String(col.as);
        } else if (col.expr?.column) {
            name = String(col.expr.column);
        } else if (col.expr?.name) {
            name = String(col.expr.name);
        } else if (col.expr?.value) {
            name = String(col.expr.value);
        } else if (typeof col === 'string') {
            name = col;
        } else {
            name = 'expr';
        }

        const expression = col.expr ? JSON.stringify(col.expr) : name;

        return {
            name: String(name),
            expression: expression,
            sourceColumn: col.expr?.column ? String(col.expr.column) : undefined,
            sourceTable: col.expr?.table ? (typeof col.expr.table === 'string' ? col.expr.table : String(col.expr.table.table || col.expr.table.name || '')) : undefined,
            isAggregate: col.expr?.type === 'aggr_func' || false,
            isWindowFunc: !!col.expr?.over,
            transformationType: col.as && col.expr?.column ? 'renamed' :
                col.expr?.type === 'aggr_func' ? 'aggregated' :
                    col.expr?.over ? 'calculated' : 'passthrough'
        };
    });
}
