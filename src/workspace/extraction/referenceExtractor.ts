// Reference Extractor - Extract table references from SQL queries

import { Parser } from 'node-sql-parser';
import {
    TableReference,
    ReferenceType,
    SqlDialect,
    AliasMap,
    ExtractionOptions,
    DEFAULT_EXTRACTION_OPTIONS
} from './types';

/**
 * Extracts table references from SQL queries (SELECT, INSERT, UPDATE, DELETE)
 */
export class ReferenceExtractor {
    private parser: Parser;
    private options: ExtractionOptions;

    constructor(options: Partial<ExtractionOptions> = {}) {
        this.parser = new Parser();
        this.options = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
    }

    /**
     * Extract all table references from SQL
     */
    extractReferences(
        sql: string,
        filePath: string,
        dialect: SqlDialect = this.options.dialect
    ): TableReference[] {
        const references: TableReference[] = [];

        try {
            const dbDialect = this.mapDialect(dialect);
            const ast = this.parser.astify(sql, { database: dbDialect });
            const statements = Array.isArray(ast) ? ast : [ast];

            for (const stmt of statements) {
                if (!stmt) continue;
                const aliasMap = this.createAliasMap();
                this.extractFromStatement(stmt, filePath, sql, references, aliasMap, 0);
            }
        } catch (error) {
            // Fallback to regex extraction
            references.push(...this.extractWithRegex(sql, filePath));
        }

        return this.deduplicateReferences(references);
    }

    /**
     * Create empty alias tracking map
     */
    private createAliasMap(): AliasMap {
        return {
            tables: new Map(),
            cteNames: new Set(),
            columns: new Map()
        };
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
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number
    ): void {
        if (!stmt || !stmt.type) return;
        if (depth > this.options.maxSubqueryDepth) return;

        const stmtType = stmt.type.toLowerCase();

        switch (stmtType) {
            case 'select':
                this.extractFromSelect(stmt, filePath, sql, references, aliasMap, depth);
                break;
            case 'insert':
                this.extractFromInsert(stmt, filePath, sql, references, aliasMap, depth);
                break;
            case 'update':
                this.extractFromUpdate(stmt, filePath, sql, references, aliasMap, depth);
                break;
            case 'delete':
                this.extractFromDelete(stmt, filePath, sql, references, aliasMap, depth);
                break;
            case 'create':
                // Extract references from CREATE VIEW AS SELECT
                if (stmt.select || stmt.query) {
                    this.extractFromStatement(
                        stmt.select || stmt.query,
                        filePath,
                        sql,
                        references,
                        aliasMap,
                        depth + 1
                    );
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
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number
    ): void {
        // Process CTEs first - add to alias map to exclude from references
        if (stmt.with) {
            for (const cte of stmt.with) {
                const cteName = cte.name?.value || cte.name;
                if (cteName) {
                    aliasMap.cteNames.add(cteName.toLowerCase());
                }

                // Extract references from CTE definition
                const cteStmt = cte.stmt?.ast || cte.stmt || cte.ast ||
                    cte.definition?.ast || cte.definition;
                if (cteStmt) {
                    // Create new alias map for CTE scope
                    const cteAliasMap = this.createAliasMap();
                    cteAliasMap.cteNames = new Set(aliasMap.cteNames);
                    this.extractFromStatement(
                        cteStmt,
                        filePath,
                        sql,
                        references,
                        cteAliasMap,
                        depth + 1
                    );
                }
            }
        }

        // FROM clause
        if (stmt.from) {
            const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
            for (const item of fromItems) {
                this.extractFromItem(
                    item,
                    filePath,
                    sql,
                    references,
                    aliasMap,
                    'select',
                    depth
                );
            }
        }

        // Subqueries in SELECT columns
        if (stmt.columns) {
            this.extractFromColumns(stmt.columns, filePath, sql, references, aliasMap, depth);
        }

        // WHERE clause (may contain subqueries)
        if (stmt.where) {
            this.extractFromExpression(stmt.where, filePath, sql, references, aliasMap, depth);
        }

        // HAVING clause
        if (stmt.having) {
            this.extractFromExpression(stmt.having, filePath, sql, references, aliasMap, depth);
        }

        // UNION/INTERSECT/EXCEPT
        if (stmt._next) {
            this.extractFromStatement(stmt._next, filePath, sql, references, aliasMap, depth);
        }

        // Set operations
        if (stmt.set_op) {
            this.extractFromStatement(stmt.set_op, filePath, sql, references, aliasMap, depth);
        }
    }

    /**
     * Extract references from INSERT statement
     */
    private extractFromInsert(
        stmt: any,
        filePath: string,
        sql: string,
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number
    ): void {
        // Target table
        if (stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            for (const t of tables) {
                const ref = this.createTableReference(t, filePath, sql, 'insert', 'INSERT INTO');
                if (ref && !aliasMap.cteNames.has(ref.tableName.toLowerCase())) {
                    references.push(ref);
                }
            }
        }

        // SELECT subquery for INSERT...SELECT
        if (stmt.values) {
            if (stmt.values.type === 'select' || stmt.values.ast) {
                this.extractFromStatement(
                    stmt.values.ast || stmt.values,
                    filePath,
                    sql,
                    references,
                    aliasMap,
                    depth + 1
                );
            }
        }
    }

    /**
     * Extract references from UPDATE statement
     */
    private extractFromUpdate(
        stmt: any,
        filePath: string,
        sql: string,
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number
    ): void {
        // Target table
        if (stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            for (const t of tables) {
                const ref = this.createTableReference(t, filePath, sql, 'update', 'UPDATE');
                if (ref && !aliasMap.cteNames.has(ref.tableName.toLowerCase())) {
                    references.push(ref);
                    // Track alias if present
                    if (t.as) {
                        aliasMap.tables.set(t.as.toLowerCase(), { tableName: ref.tableName });
                    }
                }
            }
        }

        // FROM clause (PostgreSQL, SQL Server style UPDATE...FROM)
        if (stmt.from) {
            const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
            for (const item of fromItems) {
                this.extractFromItem(
                    item,
                    filePath,
                    sql,
                    references,
                    aliasMap,
                    'select',
                    depth
                );
            }
        }

        // WHERE clause
        if (stmt.where) {
            this.extractFromExpression(stmt.where, filePath, sql, references, aliasMap, depth);
        }
    }

    /**
     * Extract references from DELETE statement
     */
    private extractFromDelete(
        stmt: any,
        filePath: string,
        sql: string,
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number
    ): void {
        // Target table
        const tableSource = stmt.from || stmt.table;
        if (tableSource) {
            const tables = Array.isArray(tableSource) ? tableSource : [tableSource];
            for (const t of tables) {
                const ref = this.createTableReference(t, filePath, sql, 'delete', 'DELETE FROM');
                if (ref && !aliasMap.cteNames.has(ref.tableName.toLowerCase())) {
                    references.push(ref);
                }
            }
        }

        // USING clause (PostgreSQL)
        if (stmt.using) {
            const usingItems = Array.isArray(stmt.using) ? stmt.using : [stmt.using];
            for (const item of usingItems) {
                this.extractFromItem(
                    item,
                    filePath,
                    sql,
                    references,
                    aliasMap,
                    'select',
                    depth
                );
            }
        }

        // WHERE clause
        if (stmt.where) {
            this.extractFromExpression(stmt.where, filePath, sql, references, aliasMap, depth);
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
        aliasMap: AliasMap,
        defaultType: ReferenceType,
        depth: number
    ): void {
        if (!item) return;

        // Determine reference type (join or select)
        const refType: ReferenceType = item.join ? 'join' : defaultType;
        const context = item.join ? `${item.join.toUpperCase()} JOIN` : 'FROM';

        // Direct table reference
        const ref = this.createTableReference(item, filePath, sql, refType, context);
        if (ref && ref.tableName !== 'unknown') {
            // Skip if it's a CTE name
            if (!aliasMap.cteNames.has(ref.tableName.toLowerCase())) {
                references.push(ref);
            }

            // Track alias
            if (item.as) {
                aliasMap.tables.set(item.as.toLowerCase(), { tableName: ref.tableName });
            }
        }

        // Subquery
        if (item.expr?.type === 'select' || item.expr?.ast) {
            const subStmt = item.expr?.ast || item.expr;
            const subAliasMap = this.createAliasMap();
            subAliasMap.cteNames = new Set(aliasMap.cteNames);
            this.extractFromStatement(
                subStmt,
                filePath,
                sql,
                references,
                subAliasMap,
                depth + 1
            );
        }

        // JOIN condition may contain subqueries
        if (item.on) {
            this.extractFromExpression(item.on, filePath, sql, references, aliasMap, depth);
        }
    }

    /**
     * Create a TableReference from AST item
     */
    private createTableReference(
        item: any,
        filePath: string,
        sql: string,
        refType: ReferenceType,
        context: string
    ): TableReference | null {
        const tableName = this.getTableName(item);
        if (!tableName) return null;

        return {
            tableName,
            alias: item.as || undefined,
            schema: item.db || item.schema || undefined,
            referenceType: refType,
            filePath,
            lineNumber: this.findTableLine(sql, tableName),
            context
        };
    }

    /**
     * Extract references from SELECT columns (may contain subqueries)
     */
    private extractFromColumns(
        columns: any[],
        filePath: string,
        sql: string,
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number
    ): void {
        if (!Array.isArray(columns)) return;

        for (const col of columns) {
            if (!col) continue;

            // Scalar subquery in column
            if (col.expr?.type === 'select') {
                this.extractFromStatement(
                    col.expr,
                    filePath,
                    sql,
                    references,
                    aliasMap,
                    depth + 1
                );
            }

            // Expression with subquery
            if (col.expr) {
                this.extractFromExpression(col.expr, filePath, sql, references, aliasMap, depth);
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
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number
    ): void {
        if (!expr) return;
        if (depth > this.options.maxSubqueryDepth) return;

        // Subquery in expression
        if (expr.type === 'select') {
            this.extractFromStatement(expr, filePath, sql, references, aliasMap, depth + 1);
            return;
        }

        // EXISTS, IN, ANY, ALL with subquery
        if (expr.right?.type === 'select') {
            this.extractFromStatement(expr.right, filePath, sql, references, aliasMap, depth + 1);
        }
        if (expr.left?.type === 'select') {
            this.extractFromStatement(expr.left, filePath, sql, references, aliasMap, depth + 1);
        }

        // Scalar subquery
        if (expr.ast?.type === 'select') {
            this.extractFromStatement(expr.ast, filePath, sql, references, aliasMap, depth + 1);
        }

        // Nested expression in parentheses
        if (expr.expr?.type === 'select') {
            this.extractFromStatement(expr.expr, filePath, sql, references, aliasMap, depth + 1);
        }

        // Recursive for AND/OR/binary expressions
        if (expr.left && typeof expr.left === 'object') {
            this.extractFromExpression(expr.left, filePath, sql, references, aliasMap, depth);
        }
        if (expr.right && typeof expr.right === 'object') {
            this.extractFromExpression(expr.right, filePath, sql, references, aliasMap, depth);
        }

        // CASE expression args
        if (expr.args) {
            for (const arg of expr.args) {
                if (arg && typeof arg === 'object') {
                    this.extractFromExpression(arg, filePath, sql, references, aliasMap, depth);
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

        if (item.table) {
            if (typeof item.table === 'string') return item.table;
            if (item.table.table) return item.table.table;
            if (item.table.name) return item.table.name;
        }

        if (item.name) return item.name;

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
                alias: match[3],
                schema: match[1],
                referenceType: 'select',
                filePath,
                lineNumber: this.getLineNumberAtIndex(sql, match.index),
                context: 'FROM'
            });
        }

        // JOIN pattern
        const joinRegex = /\b(?:INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\s*JOIN\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?(?:\s+(?:AS\s+)?(\w+))?/gi;
        while ((match = joinRegex.exec(sql)) !== null) {
            references.push({
                tableName: match[2],
                alias: match[3],
                schema: match[1],
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
                schema: match[1],
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
                schema: match[1],
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
                schema: match[1],
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
