// Reference Extractor - Extract table references from SQL queries

import { Parser } from 'node-sql-parser';
import { TableReference } from './types';
import { SqlDialect } from '../webview/types/parser';

/**
 * Extracts table references from SQL queries (SELECT, INSERT, UPDATE, DELETE)
 */
export class ReferenceExtractor {
    private parser: Parser;

    constructor() {
        this.parser = new Parser();
    }

    /**
     * Extract all table references from SQL
     */
    extractReferences(sql: string, filePath: string, dialect: SqlDialect = 'MySQL'): TableReference[] {
        const references: TableReference[] = [];

        try {
            const dbDialect = this.mapDialect(dialect);
            const ast = this.parser.astify(sql, { database: dbDialect });
            const statements = Array.isArray(ast) ? ast : [ast];

            for (const stmt of statements) {
                if (!stmt) continue;
                this.extractFromStatement(stmt, filePath, sql, references);
            }
        } catch (error) {
            // Fallback to regex extraction
            references.push(...this.extractWithRegex(sql, filePath));
        }

        // Deduplicate references (same table, same type, same line)
        return this.deduplicateReferences(references);
    }

    /**
     * Map SqlDialect to node-sql-parser database option
     */
    private mapDialect(dialect: SqlDialect): string {
        const dialectMap: Record<string, string> = {
            'MySQL': 'mysql',
            'PostgreSQL': 'postgresql',
            'TransactSQL': 'transactsql',
            'MariaDB': 'mariadb',
            'SQLite': 'sqlite',
            'Snowflake': 'snowflake',
            'BigQuery': 'bigquery',
            'Hive': 'hive',
            'Redshift': 'redshift',
            'Athena': 'athena',
            'Trino': 'trino'
        };
        return dialectMap[dialect] || 'mysql';
    }

    /**
     * Extract references from a single statement
     */
    private extractFromStatement(
        stmt: any,
        filePath: string,
        sql: string,
        references: TableReference[]
    ): void {
        if (!stmt || !stmt.type) return;

        const stmtType = stmt.type.toLowerCase();

        switch (stmtType) {
            case 'select':
                this.extractFromSelect(stmt, filePath, sql, references);
                break;
            case 'insert':
                this.extractFromInsert(stmt, filePath, sql, references);
                break;
            case 'update':
                this.extractFromUpdate(stmt, filePath, sql, references);
                break;
            case 'delete':
                this.extractFromDelete(stmt, filePath, sql, references);
                break;
            case 'create':
                // Extract references from CREATE VIEW AS SELECT
                if (stmt.select || stmt.query) {
                    this.extractFromStatement(stmt.select || stmt.query, filePath, sql, references);
                }
                break;
        }
    }

    /**
     * Extract references from SELECT statement
     */
    private extractFromSelect(
        stmt: any,
        filePath: string,
        sql: string,
        references: TableReference[]
    ): void {
        // Process CTEs first
        if (stmt.with) {
            const cteNames = new Set<string>();
            for (const cte of stmt.with) {
                // Track CTE names to exclude from references
                const cteName = cte.name?.value || cte.name;
                if (cteName) cteNames.add(cteName.toLowerCase());

                // Extract references from CTE definition
                const cteStmt = cte.stmt?.ast || cte.stmt || cte.ast || cte.definition?.ast || cte.definition;
                if (cteStmt) {
                    this.extractFromStatement(cteStmt, filePath, sql, references);
                }
            }
        }

        // FROM clause
        if (stmt.from) {
            const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
            for (const item of fromItems) {
                this.extractFromItem(item, filePath, sql, references, 'select');
            }
        }

        // Subqueries in SELECT columns
        if (stmt.columns) {
            this.extractFromColumns(stmt.columns, filePath, sql, references);
        }

        // WHERE clause (may contain subqueries)
        if (stmt.where) {
            this.extractFromExpression(stmt.where, filePath, sql, references);
        }

        // HAVING clause
        if (stmt.having) {
            this.extractFromExpression(stmt.having, filePath, sql, references);
        }

        // UNION/INTERSECT/EXCEPT
        if (stmt._next) {
            this.extractFromStatement(stmt._next, filePath, sql, references);
        }

        // Set operations (union, intersect, except)
        if (stmt.set_op) {
            this.extractFromStatement(stmt.set_op, filePath, sql, references);
        }
    }

    /**
     * Extract references from INSERT statement
     */
    private extractFromInsert(
        stmt: any,
        filePath: string,
        sql: string,
        references: TableReference[]
    ): void {
        // Target table
        if (stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            for (const t of tables) {
                const tableName = this.getTableName(t);
                if (tableName) {
                    references.push({
                        tableName,
                        referenceType: 'insert',
                        filePath,
                        lineNumber: this.findTableLine(sql, tableName),
                        context: 'INSERT INTO'
                    });
                }
            }
        }

        // SELECT subquery for INSERT...SELECT
        if (stmt.values) {
            if (stmt.values.type === 'select' || stmt.values.ast) {
                this.extractFromStatement(stmt.values.ast || stmt.values, filePath, sql, references);
            }
        }

        // ON DUPLICATE KEY UPDATE (MySQL)
        if (stmt.on_duplicate_key_update) {
            // This doesn't add new table references
        }
    }

    /**
     * Extract references from UPDATE statement
     */
    private extractFromUpdate(
        stmt: any,
        filePath: string,
        sql: string,
        references: TableReference[]
    ): void {
        // Target table
        if (stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            for (const t of tables) {
                const tableName = this.getTableName(t);
                if (tableName) {
                    references.push({
                        tableName,
                        referenceType: 'update',
                        filePath,
                        lineNumber: this.findTableLine(sql, tableName),
                        context: 'UPDATE'
                    });
                }
            }
        }

        // FROM clause (PostgreSQL, SQL Server style UPDATE...FROM)
        if (stmt.from) {
            const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
            for (const item of fromItems) {
                this.extractFromItem(item, filePath, sql, references, 'select');
            }
        }

        // WHERE clause
        if (stmt.where) {
            this.extractFromExpression(stmt.where, filePath, sql, references);
        }
    }

    /**
     * Extract references from DELETE statement
     */
    private extractFromDelete(
        stmt: any,
        filePath: string,
        sql: string,
        references: TableReference[]
    ): void {
        // Target table
        const tableSource = stmt.from || stmt.table;
        if (tableSource) {
            const tables = Array.isArray(tableSource) ? tableSource : [tableSource];
            for (const t of tables) {
                const tableName = this.getTableName(t);
                if (tableName) {
                    references.push({
                        tableName,
                        referenceType: 'delete',
                        filePath,
                        lineNumber: this.findTableLine(sql, tableName),
                        context: 'DELETE FROM'
                    });
                }
            }
        }

        // USING clause (PostgreSQL)
        if (stmt.using) {
            const usingItems = Array.isArray(stmt.using) ? stmt.using : [stmt.using];
            for (const item of usingItems) {
                this.extractFromItem(item, filePath, sql, references, 'select');
            }
        }

        // WHERE clause
        if (stmt.where) {
            this.extractFromExpression(stmt.where, filePath, sql, references);
        }
    }

    /**
     * Extract references from a FROM clause item
     */
    private extractFromItem(
        item: any,
        filePath: string,
        sql: string,
        references: TableReference[],
        defaultType: TableReference['referenceType']
    ): void {
        if (!item) return;

        // Determine reference type (join or select)
        const refType: TableReference['referenceType'] = item.join ? 'join' : defaultType;

        // Direct table reference
        const tableName = this.getTableName(item);
        if (tableName && tableName !== 'unknown') {
            references.push({
                tableName,
                referenceType: refType,
                filePath,
                lineNumber: this.findTableLine(sql, tableName),
                context: item.join ? `${item.join.toUpperCase()} JOIN` : 'FROM'
            });
        }

        // Subquery
        if (item.expr?.type === 'select' || item.expr?.ast) {
            const subStmt = item.expr?.ast || item.expr;
            this.extractFromStatement(subStmt, filePath, sql, references);
        }

        // JOIN condition may contain subqueries
        if (item.on) {
            this.extractFromExpression(item.on, filePath, sql, references);
        }
    }

    /**
     * Extract references from SELECT columns (may contain subqueries)
     */
    private extractFromColumns(
        columns: any[],
        filePath: string,
        sql: string,
        references: TableReference[]
    ): void {
        if (!Array.isArray(columns)) return;

        for (const col of columns) {
            if (!col) continue;

            // Scalar subquery in column
            if (col.expr?.type === 'select') {
                this.extractFromStatement(col.expr, filePath, sql, references);
            }

            // Expression with subquery
            if (col.expr) {
                this.extractFromExpression(col.expr, filePath, sql, references);
            }
        }
    }

    /**
     * Extract references from expressions (WHERE, HAVING, etc.)
     */
    private extractFromExpression(
        expr: any,
        filePath: string,
        sql: string,
        references: TableReference[]
    ): void {
        if (!expr) return;

        // Subquery in expression
        if (expr.type === 'select') {
            this.extractFromStatement(expr, filePath, sql, references);
            return;
        }

        // EXISTS, IN, ANY, ALL with subquery
        if (expr.right?.type === 'select') {
            this.extractFromStatement(expr.right, filePath, sql, references);
        }
        if (expr.left?.type === 'select') {
            this.extractFromStatement(expr.left, filePath, sql, references);
        }

        // Scalar subquery
        if (expr.ast?.type === 'select') {
            this.extractFromStatement(expr.ast, filePath, sql, references);
        }

        // Nested expression in parentheses
        if (expr.expr?.type === 'select') {
            this.extractFromStatement(expr.expr, filePath, sql, references);
        }

        // Recursive for AND/OR/binary expressions
        if (expr.left && typeof expr.left === 'object') {
            this.extractFromExpression(expr.left, filePath, sql, references);
        }
        if (expr.right && typeof expr.right === 'object') {
            this.extractFromExpression(expr.right, filePath, sql, references);
        }

        // CASE expression
        if (expr.args) {
            for (const arg of expr.args) {
                if (arg && typeof arg === 'object') {
                    this.extractFromExpression(arg, filePath, sql, references);
                }
            }
        }
    }

    /**
     * Get table name from AST item
     */
    private getTableName(item: any): string | null {
        if (!item) return null;
        if (typeof item === 'string') return item;

        // Try various AST structures
        if (item.table) {
            if (typeof item.table === 'string') return item.table;
            if (item.table.table) return item.table.table;
            if (item.table.name) return item.table.name;
        }

        if (item.name) return item.name;

        // Don't return alias as table name
        // if (item.as) return item.as;

        return null;
    }

    /**
     * Find line number where table is referenced
     */
    private findTableLine(sql: string, tableName: string): number {
        const lines = sql.split('\n');
        const regex = new RegExp(`\\b${this.escapeRegex(tableName)}\\b`, 'i');

        for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
                return i + 1;
            }
        }

        return 1;
    }

    /**
     * Escape special regex characters
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Regex-based fallback for reference extraction
     */
    private extractWithRegex(sql: string, filePath: string): TableReference[] {
        const references: TableReference[] = [];

        // FROM table pattern
        const fromRegex = /\bFROM\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?(?:\s+(?:AS\s+)?(\w+))?/gi;
        let match;
        while ((match = fromRegex.exec(sql)) !== null) {
            references.push({
                tableName: match[2],
                referenceType: 'select',
                filePath,
                lineNumber: this.getLineNumberAtIndex(sql, match.index),
                context: 'FROM'
            });
        }

        // JOIN pattern
        const joinRegex = /\b(?:INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\s*JOIN\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        while ((match = joinRegex.exec(sql)) !== null) {
            references.push({
                tableName: match[2],
                referenceType: 'join',
                filePath,
                lineNumber: this.getLineNumberAtIndex(sql, match.index),
                context: 'JOIN'
            });
        }

        // INSERT INTO pattern
        const insertRegex = /\bINSERT\s+INTO\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        while ((match = insertRegex.exec(sql)) !== null) {
            references.push({
                tableName: match[2],
                referenceType: 'insert',
                filePath,
                lineNumber: this.getLineNumberAtIndex(sql, match.index),
                context: 'INSERT INTO'
            });
        }

        // UPDATE pattern
        const updateRegex = /\bUPDATE\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        while ((match = updateRegex.exec(sql)) !== null) {
            references.push({
                tableName: match[2],
                referenceType: 'update',
                filePath,
                lineNumber: this.getLineNumberAtIndex(sql, match.index),
                context: 'UPDATE'
            });
        }

        // DELETE FROM pattern
        const deleteRegex = /\bDELETE\s+FROM\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        while ((match = deleteRegex.exec(sql)) !== null) {
            references.push({
                tableName: match[2],
                referenceType: 'delete',
                filePath,
                lineNumber: this.getLineNumberAtIndex(sql, match.index),
                context: 'DELETE FROM'
            });
        }

        return references;
    }

    /**
     * Get line number at character index
     */
    private getLineNumberAtIndex(sql: string, charIndex: number): number {
        return sql.substring(0, charIndex).split('\n').length;
    }

    /**
     * Remove duplicate references
     */
    private deduplicateReferences(references: TableReference[]): TableReference[] {
        const seen = new Set<string>();
        return references.filter(ref => {
            const key = `${ref.tableName.toLowerCase()}|${ref.referenceType}|${ref.lineNumber}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}
