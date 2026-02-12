// Transform Extractor - Identify how output columns are derived from input columns

import { Parser } from 'node-sql-parser';
import {
    Transformation,
    TransformationType,
    ColumnReference
} from './types';
import { logger } from '../../logger';
import type {
    AstSelectStatement,
    AstColumn,
    AstExpression,
    AstFunctionExpr,
    AstAggrFuncExpr,
    AstCaseExpr,
    AstWindowFuncExpr,
    AstColumnRef,
    AstTableIdentifier
} from './astTypes';

/**
 * Extracts transformation information from SQL queries
 */
export class TransformExtractor {
    private parser: Parser;

    constructor() {
        this.parser = new Parser();
    }

    /**
     * Identify how output columns are derived from input columns
     */
    extractTransformations(
        ast: AstSelectStatement,
        tableAliases: Map<string, string>
    ): Transformation[] {
        if (!ast || !ast.columns || !Array.isArray(ast.columns)) {
            return [];
        }

        const transformations: Transformation[] = [];

        for (const col of ast.columns as AstColumn[]) {
            if (col.type === 'star') {
                // SELECT * - no transformation info
                continue;
            }

            const transformation = this.extractColumnTransformation(col, tableAliases);
            if (transformation) {
                transformations.push(transformation);
            }
        }

        return transformations;
    }

    /**
     * Extract transformation for a single column
     */
    private extractColumnTransformation(
        col: AstColumn,
        tableAliases: Map<string, string>
    ): Transformation | null {
        if (!col || !col.expr) {return null;}

        const expr = col.expr;
        const alias = col.as;
        const operation = this.classifyTransformation(expr);

        const inputColumns = this.parseExpression(expr, tableAliases);

        // Determine output column name
        let outputColumn: string;
        if (alias) {
            outputColumn = alias;
        } else if (expr.type === 'column_ref') {
            outputColumn = this.extractColumnName(expr as AstColumnRef);
        } else {
            outputColumn = this.generateOutputName(expr);
        }

        return {
            outputColumn,
            outputAlias: alias || undefined,
            inputColumns,
            operation,
            expression: this.expressionToString(expr),
            lineNumber: 0
        };
    }

    /**
     * Parse expression to identify source columns
     */
    parseExpression(
        expr: AstExpression,
        tableAliases: Map<string, string>
    ): ColumnReference[] {
        if (!expr) {return [];}

        const columns: ColumnReference[] = [];

        this.extractColumnsFromExpression(expr, columns, tableAliases);

        return columns;
    }

    /**
     * Recursively extract columns from expression
     */
    private extractColumnsFromExpression(
        expr: AstExpression,
        columns: ColumnReference[],
        tableAliases: Map<string, string>
    ): void {
        if (!expr) {return;}

        // Direct column reference
        if (expr.type === 'column_ref') {
            const colRef = expr as AstColumnRef;
            const columnName = this.extractColumnName(colRef);
            if (columnName) {
                columns.push({
                    columnName,
                    tableName: this.resolveTableName(colRef.table, tableAliases),
                    tableAlias: colRef.table || undefined,
                    usedIn: 'select',
                    lineNumber: 0
                });
            }
            return;
        }

        // Binary expression (a + b, a = b, etc.)
        if (expr.type === 'binary_expr') {
            this.extractColumnsFromExpression(expr.left as AstExpression, columns, tableAliases);
            this.extractColumnsFromExpression(expr.right as AstExpression, columns, tableAliases);
            return;
        }

        // Unary expression (-a, +a, NOT a)
        if (expr.type === 'unary_expr') {
            this.extractColumnsFromExpression(expr.expr as AstExpression, columns, tableAliases);
            return;
        }

        // Function call
        if (expr.type === 'function') {
            this.extractColumnsFromFunction(expr as AstFunctionExpr, columns, tableAliases);
            return;
        }

        // Aggregate function
        if (expr.type === 'aggr_func') {
            this.extractColumnsFromAggregate(expr as AstAggrFuncExpr, columns, tableAliases);
            return;
        }

        // CASE expression
        if (expr.type === 'case') {
            this.extractColumnsFromCase(expr as AstCaseExpr, columns, tableAliases);
            return;
        }

        // CAST expression
        if (expr.type === 'cast') {
            this.extractColumnsFromExpression(expr.expr as AstExpression, columns, tableAliases);
            return;
        }

        // Window function
        if (expr.type === 'window_func') {
            this.extractColumnsFromWindowFunction(expr as AstWindowFuncExpr, columns, tableAliases);
            return;
        }

        // Subquery
        if (expr.type === 'select' || expr.type === 'subquery') {
            // Extract columns from subquery - this is complex
            // For now, just note that it's a subquery
            return;
        }
    }

    /**
     * Extract columns from function call
     */
    private extractColumnsFromFunction(
        func: AstFunctionExpr,
        columns: ColumnReference[],
        tableAliases: Map<string, string>
    ): void {
        if (!func.args) {return;}

        const args = Array.isArray(func.args.expr)
            ? func.args.expr
            : [func.args.expr];

        for (const arg of args) {
            this.extractColumnsFromExpression(arg, columns, tableAliases);
        }
    }

    /**
     * Extract columns from aggregate function
     */
    private extractColumnsFromAggregate(
        aggr: AstAggrFuncExpr,
        columns: ColumnReference[],
        tableAliases: Map<string, string>
    ): void {
        if (aggr.args && aggr.args.expr) {
            const args = Array.isArray(aggr.args.expr)
                ? aggr.args.expr
                : [aggr.args.expr];

            for (const arg of args) {
                this.extractColumnsFromExpression(arg, columns, tableAliases);
            }
        }

        // Also extract from ORDER BY if present (for ARRAY_AGG, etc.)
        if (aggr.orderby) {
            const orderItems = Array.isArray(aggr.orderby)
                ? aggr.orderby
                : [aggr.orderby];

            for (const item of orderItems) {
                this.extractColumnsFromExpression(item.expr, columns, tableAliases);
            }
        }
    }

    /**
     * Extract columns from CASE expression
     */
    private extractColumnsFromCase(
        caseExpr: AstCaseExpr,
        columns: ColumnReference[],
        tableAliases: Map<string, string>
    ): void {
        if (!caseExpr.args) {return;}

        for (const caseArg of caseExpr.args) {
            // CASE WHEN condition THEN result
            if (caseArg.cond) {
                this.extractColumnsFromExpression(caseArg.cond, columns, tableAliases);
            }
            if (caseArg.result) {
                this.extractColumnsFromExpression(caseArg.result, columns, tableAliases);
            }
        }

        // ELSE clause
        if (caseExpr.else) {
            this.extractColumnsFromExpression(caseExpr.else, columns, tableAliases);
        }
    }

    /**
     * Extract columns from window function
     */
    private extractColumnsFromWindowFunction(
        window: AstWindowFuncExpr,
        columns: ColumnReference[],
        tableAliases: Map<string, string>
    ): void {
        // Extract from function arguments
        if (window.args && window.args.expr) {
            const args = Array.isArray(window.args.expr)
                ? window.args.expr
                : [window.args.expr];

            for (const arg of args) {
                this.extractColumnsFromExpression(arg, columns, tableAliases);
            }
        }

        // Extract from PARTITION BY
        if (window.partitionby) {
            const partitions = Array.isArray(window.partitionby)
                ? window.partitionby
                : [window.partitionby];

            for (const partition of partitions) {
                this.extractColumnsFromExpression(partition, columns, tableAliases);
            }
        }

        // Extract from ORDER BY
        if (window.orderby) {
            const orders = Array.isArray(window.orderby)
                ? window.orderby
                : [window.orderby];

            for (const order of orders) {
                this.extractColumnsFromExpression(order.expr, columns, tableAliases);
            }
        }
    }

    /**
     * Classify transformation type
     */
    classifyTransformation(expr: AstExpression): TransformationType {
        if (!expr || !expr.type) {
            return 'complex';
        }

        switch (expr.type) {
            case 'column_ref':
                // Direct column reference: SELECT col FROM table
                return 'direct';

            case 'binary_expr':
                return this.classifyBinaryExpression(expr);

            case 'aggr_func':
                return 'aggregate';

            case 'function':
                return this.classifyFunction(expr as AstFunctionExpr);

            case 'case':
                return 'case';

            case 'cast':
                return 'cast';

            case 'window_func':
                return 'window';

            case 'subquery':
                return 'subquery';

            case 'unary_expr':
                return 'complex';

            default:
                return 'complex';
        }
    }

    /**
     * Classify binary expression
     */
    private classifyBinaryExpression(expr: AstExpression): TransformationType {
        const operator = expr.operator;

        // Arithmetic operations
        if (['+', '-', '*', '/', '%'].includes(operator)) {
            return 'arithmetic';
        }

        // String concatenation
        if (operator === '||' || operator === 'CONCAT') {
            return 'concat';
        }

        // Comparison operators (not really transformations, but we classify them)
        if (['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'IN', 'BETWEEN'].includes(operator)) {
            return 'complex';
        }

        // Logical operators
        if (['AND', 'OR', 'NOT', 'XOR'].includes(operator.toUpperCase())) {
            return 'complex';
        }

        return 'complex';
    }

    /**
     * Classify function
     */
    private classifyFunction(func: AstFunctionExpr): TransformationType {
        if (!func.name) {return 'scalar';}

        const name = func.name.toUpperCase();

        // String manipulation functions
        const stringFunctions = [
            'UPPER', 'LOWER', 'TRIM', 'LTRIM', 'RTRIM',
            'SUBSTRING', 'SUBSTR', 'CONCAT', 'LENGTH',
            'REPLACE', 'COALESCE', 'NULLIF', 'ISNULL'
        ];

        // Date functions
        const dateFunctions = [
            'DATE', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND',
            'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP',
            'DATE_ADD', 'DATE_SUB', 'DATE_DIFF', 'DATEDIFF'
        ];

        // Math functions
        const mathFunctions = [
            'ABS', 'CEIL', 'CEILING', 'FLOOR', 'ROUND',
            'SQRT', 'POWER', 'MOD', 'LOG', 'EXP'
        ];

        if (stringFunctions.includes(name)) {
            return 'scalar';
        }

        if (dateFunctions.includes(name)) {
            return 'scalar';
        }

        if (mathFunctions.includes(name)) {
            return 'scalar';
        }

        // Default to scalar
        return 'scalar';
    }

    /**
     * Extract column name from column reference
     */
    private extractColumnName(column: AstColumnRef): string {
        if (!column) {return '';}

        if (column.column) {
            return typeof column.column === 'string' ? column.column : column.column.expr.value;
        }

        if (column.value) {
            return String(column.value);
        }

        return '';
    }

    /**
     * Resolve table name from reference using aliases
     */
    private resolveTableName(
        tableRef: AstTableIdentifier | null | undefined,
        tableAliases: Map<string, string>
    ): string | undefined {
        if (!tableRef) {return undefined;}
        if (typeof tableRef === 'string') {
            const resolved = tableAliases.get(tableRef);
            return resolved || tableRef;
        }

        const alias = tableRef.alias || (typeof tableRef === 'string' ? tableRef : undefined);

        if (alias && typeof alias === 'string') {
            const resolved = tableAliases.get(alias);
            return resolved || alias;
        }

        if (tableRef.table) {
            return this.resolveTableName(tableRef.table as AstTableIdentifier, tableAliases);
        }

        return undefined;
    }

    /**
     * Generate output column name for expressions
     */
    private generateOutputName(expr: AstExpression): string {
        if (!expr) {return 'expr';}

        const type = expr.type || '';

        switch (type) {
            case 'aggr_func':
                return `${expr.name.toLowerCase()}_result`;
            case 'function':
                return `${expr.name?.toLowerCase() || 'func'}_result`;
            case 'binary_expr':
                return 'computed_value';
            case 'case':
                return 'case_result';
            case 'cast':
                return 'cast_result';
            case 'window_func':
                return 'window_result';
            default:
                return 'expr';
        }
    }

    /**
     * Convert expression to string representation
     */
    private expressionToString(expr: AstExpression): string {
        if (!expr) {return '';}

        try {
            const sql = this.parser.exprToSQL(expr);
            return sql || '';
        } catch (e) {
            logger.debug('[transformExtractor] sqlify failed, using type fallback: ' + String(e));
            return expr.type || 'expression';
        }
    }
}
