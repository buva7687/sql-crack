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
import { ColumnExtractor } from './columnExtractor';

// SQL reserved words that should never be treated as table names
const SQL_RESERVED_WORDS = new Set([
    // DML/DDL keywords
    'select', 'insert', 'update', 'delete', 'create', 'drop', 'alter', 'truncate',
    'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'between',
    'join', 'inner', 'outer', 'left', 'right', 'full', 'cross', 'on', 'using',
    'group', 'by', 'having', 'order', 'asc', 'desc', 'limit', 'offset',
    'union', 'intersect', 'except', 'all', 'distinct', 'as',
    'case', 'when', 'then', 'else', 'end', 'if', 'exists',
    'values', 'set', 'into', 'table', 'view', 'index', 'database', 'schema',
    'primary', 'foreign', 'key', 'references', 'constraint', 'unique', 'check',
    'default', 'auto_increment', 'identity', 'serial',
    // Data types
    'int', 'integer', 'bigint', 'smallint', 'tinyint', 'float', 'double', 'decimal',
    'numeric', 'real', 'char', 'varchar', 'text', 'blob', 'clob', 'date', 'time',
    'datetime', 'timestamp', 'boolean', 'bool', 'binary', 'varbinary', 'json', 'xml',
    // Functions (common ones that might be mistaken for tables)
    'count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'cast', 'convert',
    'concat', 'substring', 'length', 'trim', 'upper', 'lower', 'replace',
    'now', 'current_date', 'current_time', 'current_timestamp', 'getdate',
    'year', 'month', 'day', 'hour', 'minute', 'second', 'dateadd', 'datediff',
    'row_number', 'rank', 'dense_rank', 'ntile', 'lead', 'lag', 'first_value', 'last_value',
    // Other common keywords
    'true', 'false', 'unknown', 'query', 'result', 'data', 'temp', 'temporary',
    'with', 'recursive', 'over', 'partition', 'rows', 'range', 'unbounded', 'preceding', 'following',
    'rollup', 'cube', 'grouping', 'sets', 'fetch', 'next', 'only', 'percent',
    'top', 'dual', 'sysdate', 'rownum', 'rowid', 'level', 'connect', 'start',
    // Transaction keywords
    'begin', 'commit', 'rollback', 'transaction', 'savepoint',
    // Permissions
    'grant', 'revoke', 'execute', 'procedure', 'function', 'trigger'
]);

/**
 * Extracts table references from SQL queries (SELECT, INSERT, UPDATE, DELETE)
 */
export class ReferenceExtractor {
    private parser: Parser;
    private options: ExtractionOptions;
    private columnExtractor: ColumnExtractor;

    constructor(options: Partial<ExtractionOptions> = {}) {
        this.parser = new Parser();
        this.options = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
        this.columnExtractor = new ColumnExtractor(options);
    }

    /**
     * Check if a name is a SQL reserved word
     */
    private isReservedWord(name: string): boolean {
        return SQL_RESERVED_WORDS.has(name.toLowerCase());
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
                    depth,
                    stmt
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
        depth: number,
        parentStmt?: any
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
                // Extract columns if enabled and parent statement is provided
                if (this.options.extractColumns && parentStmt) {
                    ref.columns = this.extractColumnsFromTable(item, parentStmt, aliasMap);
                }

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
        const functionFromKeywords = ['extract', 'substring', 'trim', 'position'];

        const isFunctionFrom = (matchIndex: number): boolean => {
            const lineStart = sql.lastIndexOf('\n', matchIndex) + 1;
            const lineEnd = sql.indexOf('\n', matchIndex);
            const end = lineEnd === -1 ? sql.length : lineEnd;
            const line = sql.slice(lineStart, end);
            const fromPos = matchIndex - lineStart;
            const lowerLine = line.toLowerCase();

            for (const fn of functionFromKeywords) {
                const fnIndex = lowerLine.lastIndexOf(fn, fromPos);
                if (fnIndex === -1) continue;
                const parenIndex = lowerLine.indexOf('(', fnIndex + fn.length);
                if (parenIndex === -1 || parenIndex > fromPos) continue;
                const closeParenIndex = lowerLine.indexOf(')', parenIndex + 1);
                if (closeParenIndex !== -1 && closeParenIndex < fromPos) continue;
                return true;
            }

            return false;
        };

        // FROM table pattern
        const fromRegex = /\bFROM\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?(?:\s+(?:AS\s+)?(\w+))?/gi;
        let match;
        while ((match = fromRegex.exec(sql)) !== null) {
            if (isFunctionFrom(match.index)) {
                continue;
            }
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
     * Extract columns used from a specific table in a statement
     */
    private extractColumnsFromTable(
        tableItem: any,
        stmt: any,
        aliasMap: AliasMap
    ): any[] {
        if (!stmt || !this.options.extractColumns) {
            return [];
        }

        const tableName = this.getTableNameFromItem(tableItem);
        const tableAlias = tableItem.as;
        const columns: any[] = [];

        // Build alias map from the statement
        const tableAliases = this.columnExtractor.buildAliasMap(stmt);

        // Add this table's alias
        if (tableAlias && tableName) {
            tableAliases.set(tableAlias, tableName);
        }

        // Extract columns from SELECT clause
        if (stmt.columns) {
            for (const col of stmt.columns) {
                const usedCols = this.extractColumnsFromExpression(col.expr, tableAliases, 'select');
                for (const usedCol of usedCols) {
                    if (this.isColumnFromTable(usedCol, tableName, tableAlias, tableAliases)) {
                        columns.push(usedCol);
                    }
                }
            }
        }

        // Extract columns from WHERE clause
        if (stmt.where) {
            const whereCols = this.extractColumnsFromExpression(stmt.where, tableAliases, 'where');
            for (const col of whereCols) {
                if (this.isColumnFromTable(col, tableName, tableAlias, tableAliases)) {
                    columns.push(col);
                }
            }
        }

        // Extract columns from JOIN conditions
        if (stmt.join) {
            for (const join of stmt.join) {
                if (join.on) {
                    const joinCols = this.extractColumnsFromExpression(join.on, tableAliases, 'join');
                    for (const col of joinCols) {
                        if (this.isColumnFromTable(col, tableName, tableAlias, tableAliases)) {
                            columns.push(col);
                        }
                    }
                }
            }
        }

        // Extract columns from GROUP BY
        if (stmt.groupby) {
            const groupCols = this.columnExtractor.extractUsedColumns(stmt, 'group');
            for (const col of groupCols) {
                if (this.isColumnFromTable(col, tableName, tableAlias, tableAliases)) {
                    columns.push(col);
                }
            }
        }

        // Extract columns from HAVING
        if (stmt.having) {
            const havingCols = this.columnExtractor.extractUsedColumns({ having: stmt.having }, 'having');
            for (const col of havingCols) {
                if (this.isColumnFromTable(col, tableName, tableAlias, tableAliases)) {
                    columns.push(col);
                }
            }
        }

        // Extract columns from ORDER BY
        if (stmt.orderby) {
            const orderCols = this.columnExtractor.extractUsedColumns({ orderby: stmt.orderby }, 'order');
            for (const col of orderCols) {
                if (this.isColumnFromTable(col, tableName, tableAlias, tableAliases)) {
                    columns.push(col);
                }
            }
        }

        // Deduplicate columns
        return this.deduplicateColumns(columns);
    }

    /**
     * Extract columns from an expression
     */
    private extractColumnsFromExpression(
        expr: any,
        tableAliases: Map<string, string>,
        context: string
    ): any[] {
        if (!expr) return [];

        const columns: any[] = [];

        if (expr.type === 'column_ref') {
            const columnName = expr.column || expr.value;
            if (columnName) {
                columns.push({
                    columnName,
                    tableName: expr.table ? this.getTableNameFromItem(expr.table) : undefined,
                    tableAlias: expr.table?.alias || expr.table,
                    usedIn: context,
                    lineNumber: 0
                });
            }
        } else if (expr.type === 'binary_expr') {
            columns.push(...this.extractColumnsFromExpression(expr.left, tableAliases, context));
            columns.push(...this.extractColumnsFromExpression(expr.right, tableAliases, context));
        } else if (expr.type === 'function' || expr.type === 'aggr_func') {
            if (expr.args && expr.args.expr) {
                const args = Array.isArray(expr.args.expr) ? expr.args.expr : [expr.args.expr];
                for (const arg of args) {
                    columns.push(...this.extractColumnsFromExpression(arg, tableAliases, context));
                }
            }
        }

        return columns;
    }

    /**
     * Check if a column reference belongs to a specific table
     */
    private isColumnFromTable(
        col: any,
        tableName: string | undefined,
        tableAlias: string | undefined,
        tableAliases: Map<string, string>
    ): boolean {
        if (!tableName) return true; // If no table specified, include all columns

        // Check if column explicitly references this table
        if (col.tableName === tableName) {
            return true;
        }

        // Check if column references this table's alias
        if (col.tableAlias === tableAlias) {
            return true;
        }

        // Check if column's table name resolves to this table via alias
        if (col.tableName && tableAliases.has(col.tableName)) {
            const resolved = tableAliases.get(col.tableName);
            if (resolved === tableName) {
                return true;
            }
        }

        // If column has no table qualifier, it might belong to this table
        if (!col.tableName && !col.tableAlias) {
            return true;
        }

        return false;
    }

    /**
     * Get table name from AST item
     */
    private getTableNameFromItem(item: any): string | undefined {
        if (!item) return undefined;

        if (item.table) {
            return this.getTableNameFromItem(item.table);
        }

        if (item.value) {
            return item.value;
        }

        if (typeof item === 'string') {
            return item;
        }

        return undefined;
    }

    /**
     * Deduplicate columns by name and context
     */
    private deduplicateColumns(columns: any[]): any[] {
        const seen = new Set<string>();
        return columns.filter(col => {
            const key = `${col.columnName}|${col.usedIn}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Remove duplicate references and filter out SQL reserved words
     */
    private deduplicateReferences(references: TableReference[]): TableReference[] {
        const seen = new Set<string>();
        return references.filter(ref => {
            // Filter out SQL reserved words that shouldn't be table names
            if (this.isReservedWord(ref.tableName)) {
                return false;
            }

            // Filter out single-character or empty names
            if (!ref.tableName || ref.tableName.length < 2) {
                return false;
            }

            // Filter out names that are purely numeric
            if (/^\d+$/.test(ref.tableName)) {
                return false;
            }

            const key = `${ref.tableName.toLowerCase()}|${ref.referenceType}|${ref.lineNumber}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}
