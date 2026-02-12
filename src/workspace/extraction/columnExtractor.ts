// Column Extractor - Extract column-level information from SQL queries

import { Parser } from 'node-sql-parser';
import {
    ColumnInfo,
    ColumnReference,
    ColumnUsageContext
} from './types';

/**
 * Extracts column-level information from SQL queries
 */
export class ColumnExtractor {
    private parser: Parser;

    constructor() {
        this.parser = new Parser();
    }

    /**
     * Extract columns from SELECT clause with source tracking
     */
    extractSelectColumns(
        ast: any,
        tableAliases: Map<string, string>
    ): ColumnInfo[] {
        if (!ast || !ast.columns) {
            return [];
        }

        const columns: ColumnInfo[] = [];

        for (const col of ast.columns) {
            if (col.type === 'star') {
                // Handle SELECT * - will be resolved later by schema
                continue;
            }

            const columnInfo = this.extractSingleColumn(col, tableAliases);
            if (columnInfo) {
                columns.push(columnInfo);
            }
        }

        return columns;
    }

    /**
     * Extract a single column from SELECT clause
     */
    private extractSingleColumn(
        col: any,
        tableAliases: Map<string, string>
    ): ColumnInfo | null {
        try {
            const expr = col.expr;
            const alias = col.as;

            if (!expr) {return null;}

            // Check if this is a direct column reference
            if (expr.type === 'column_ref') {
                const columnName = this.extractColumnName(expr);
                const sourceTable = this.resolveSourceTable(expr, tableAliases);

                return {
                    name: alias || columnName,
                    dataType: 'unknown', // Will be inferred from schema
                    nullable: true,
                    primaryKey: false,
                    sourceTable,
                    sourceColumn: columnName,
                    isComputed: false,
                    lineNumber: 0
                };
            }

            // Handle expressions (computed columns)
            if (this.isExpression(expr)) {
                return {
                    name: alias || this.generateExpressionName(expr),
                    dataType: 'unknown',
                    nullable: true,
                    primaryKey: false,
                    expression: this.expressionToString(expr),
                    isComputed: true,
                    lineNumber: 0
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Extract columns used in WHERE/JOIN/GROUP BY/HAVING/ORDER BY
     */
    extractUsedColumns(
        ast: any,
        context: ColumnUsageContext
    ): ColumnReference[] {
        const columns: ColumnReference[] = [];

        if (!ast) {return columns;}

        // Extract based on context
        switch (context) {
            case 'where':
                this.extractColumnsFromExpression(ast.where, columns, context);
                break;
            case 'join':
                this.extractColumnsFromJoins(ast.from, columns, context);
                break;
            case 'group':
                this.extractColumnsFromList(ast.groupby, columns, context);
                break;
            case 'order':
                this.extractColumnsFromList(ast.orderby, columns, context);
                break;
            case 'having':
                this.extractColumnsFromExpression(ast.having, columns, context);
                break;
            case 'select':
                this.extractColumnsFromSelect(ast.columns, columns, context);
                break;
        }

        return columns;
    }

    /**
     * Build table alias map from FROM clause
     */
    buildAliasMap(ast: any): Map<string, string> {
        const aliasMap = new Map<string, string>();

        if (!ast || !ast.from) {
            return aliasMap;
        }

        for (const fromClause of ast.from) {
            this.extractAliasFromTable(fromClause, aliasMap);
        }

        // Also extract from JOINs
        if (ast.join) {
            for (const join of ast.join) {
                this.extractAliasFromTable(join.table, aliasMap);
            }
        }

        return aliasMap;
    }

    /**
     * Extract alias mapping from a table reference
     */
    private extractAliasFromTable(
        tableRef: any,
        aliasMap: Map<string, string>
    ): void {
        if (!tableRef) {return;}

        const table = tableRef.table || tableRef;

        if (table && table.type === 'table') {
            const tableName = this.getTableName(table);
            const alias = tableRef.as;

            if (alias && tableName) {
                aliasMap.set(alias, tableName);
            }

            // Also register the table name itself
            if (tableName) {
                aliasMap.set(tableName, tableName);
            }
        }
    }

    /**
     * Get table name from table reference
     */
    private getTableName(table: any): string | null {
        if (!table) {return null;}

        if (table.table) {
            return this.getTableName(table.table);
        }

        if (table.value) {
            return table.value;
        }

        return null;
    }

    /**
     * Resolve source table from column reference
     */
    private resolveSourceTable(
        column: any,
        tableAliases: Map<string, string>
    ): string | undefined {
        if (!column.table) {
            return undefined;
        }

        const tableRef = column.table;
        const alias = tableRef.alias || tableRef;

        if (typeof alias === 'string') {
            return tableAliases.get(alias) || alias;
        }

        return undefined;
    }

    /**
     * Extract column name from column reference
     */
    private extractColumnName(column: any): string {
        if (!column) {return '';}

        if (column.column) {
            return column.column;
        }

        if (column.value) {
            return column.value;
        }

        return '';
    }

    /**
     * Check if expression is a computed expression (not simple column ref)
     */
    private isExpression(expr: any): boolean {
        if (!expr || !expr.type) {return false;}

        const expressionTypes = [
            'binary_expr',      // a + b
            'unary_expr',       // -a
            'function',         // COUNT(*)
            'aggr_func',        // SUM(amount)
            'case',             // CASE WHEN...
            'cast',             // CAST(x AS type)
            'window_func',      // ROW_NUMBER() OVER...
            'subquery'          // (SELECT ...)
        ];

        return expressionTypes.includes(expr.type);
    }

    /**
     * Generate a name for an expression
     */
    private generateExpressionName(expr: any): string {
        if (!expr) {return 'expr';}

        const type = expr.type || '';

        switch (type) {
            case 'aggr_func':
                return `${expr.name.toLowerCase()}_result`;
            case 'function':
                return `${expr.name?.toLowerCase() || 'func'}_result`;
            case 'binary_expr':
                return 'computed_value';
            default:
                return 'expr';
        }
    }

    /**
     * Convert expression to string representation
     */
    private expressionToString(expr: any): string {
        if (!expr) {return '';}

        try {
            const sql = this.parser.sqlify(expr);
            return sql || '';
        } catch (e) {
            console.debug('[columnExtractor] sqlify failed, using type fallback:', e);
            return expr.type || 'expression';
        }
    }

    /**
     * Extract columns from an expression (WHERE, HAVING, etc.)
     */
    private extractColumnsFromExpression(
        expr: any,
        columns: ColumnReference[],
        context: ColumnUsageContext
    ): void {
        if (!expr) {return;}

        if (expr.type === 'column_ref') {
            const columnName = this.extractColumnName(expr);
            if (columnName) {
                const tableName = expr.table ? this.getTableName(expr.table) : undefined;
                columns.push({
                    columnName,
                    tableName: tableName || undefined,
                    usedIn: context,
                    lineNumber: 0
                });
            }
        } else if (expr.type === 'binary_expr') {
            this.extractColumnsFromExpression(expr.left, columns, context);
            this.extractColumnsFromExpression(expr.right, columns, context);
        } else if (expr.type === 'unary_expr') {
            this.extractColumnsFromExpression(expr.expr, columns, context);
        } else if (expr.type === 'function' || expr.type === 'aggr_func') {
            if (expr.args && expr.args.expr) {
                const args = Array.isArray(expr.args.expr)
                    ? expr.args.expr
                    : [expr.args.expr];

                for (const arg of args) {
                    this.extractColumnsFromExpression(arg, columns, context);
                }
            }
        } else if (expr.type === 'case') {
            for (const caseExpr of expr.args || []) {
                this.extractColumnsFromExpression(caseExpr.cond, columns, context);
                this.extractColumnsFromExpression(caseExpr.result, columns, context);
            }
        }
    }

    /**
     * Extract columns from JOIN conditions
     */
    private extractColumnsFromJoins(
        from: any,
        columns: ColumnReference[],
        context: ColumnUsageContext
    ): void {
        if (!from) {return;}

        for (const fromClause of from) {
            if (fromClause.on) {
                this.extractColumnsFromExpression(fromClause.on, columns, context);
            }

            if (fromClause.using) {
                // USING (col1, col2) syntax
                const usingCols = Array.isArray(fromClause.using)
                    ? fromClause.using
                    : [fromClause.using];

                for (const col of usingCols) {
                    const colName = typeof col === 'object' ? col.value : col;
                    if (colName) {
                        columns.push({
                            columnName: colName,
                            usedIn: context,
                            lineNumber: 0
                        });
                    }
                }
            }

            // Recursively process nested joins
            if (fromClause.join) {
                this.extractColumnsFromJoins(fromClause.join, columns, context);
            }
        }
    }

    /**
     * Extract columns from a list (GROUP BY, ORDER BY)
     */
    private extractColumnsFromList(
        list: any,
        columns: ColumnReference[],
        context: ColumnUsageContext
    ): void {
        if (!list) {return;}

        const items = Array.isArray(list) ? list : [list];

        for (const item of items) {
            if (item.type === 'column_ref') {
                const columnName = this.extractColumnName(item);
                if (columnName) {
                    const tableName = item.table ? this.getTableName(item.table) : undefined;
                    columns.push({
                        columnName,
                        tableName: tableName || undefined,
                        usedIn: context,
                        lineNumber: 0
                    });
                }
            } else if (item.expr) {
                this.extractColumnsFromExpression(item.expr, columns, context);
            }
        }
    }

    /**
     * Extract columns from SELECT clause
     */
    private extractColumnsFromSelect(
        columns: any,
        result: ColumnReference[],
        context: ColumnUsageContext
    ): void {
        if (!columns) {return;}

        for (const col of columns) {
            if (col.expr) {
                this.extractColumnsFromExpression(col.expr, result, context);
            }
        }
    }
}
