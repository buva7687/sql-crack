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
    'true', 'false', 'unknown', 'query', 'result', 'data', 'temp', 'temporary', 'without',
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
    private globalCteNames: Set<string> = new Set(); // Track CTE names across the entire file

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
     * Strip SQL comments from a string to simplify pattern matching
     * Handles both single-line (--) and multi-line comments
     */
    private stripSqlComments(sql: string): string {
        // Remove multi-line comments first (/* ... */)
        let result = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
        // Remove single-line comments (-- ... until end of line)
        result = result.replace(/--[^\n]*/g, ' ');
        return result;
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

            // First pass: collect all CTE names from WITH clauses across all statements
            const globalCteNames = new Set<string>();
            for (const stmt of statements) {
                if (!stmt) {continue;}
                this.collectCTENames(stmt, globalCteNames);
            }

            // Strip comments for cleaner regex-based pattern matching
            const sqlNoComments = this.stripSqlComments(sql);
            const reservedWords = new Set(['select', 'from', 'where', 'join', 'inner', 'left', 'right', 'outer', 'on', 'as', 'with', 'recursive']);

            // Also collect CTE names using regex as backup (handles cases AST parser might miss)
            // This pattern now works correctly since comments are stripped
            const ctePattern = /WITH\s+(?:RECURSIVE\s+)?(\w+)\s+AS\s*\(/gi;
            let match;
            while ((match = ctePattern.exec(sqlNoComments)) !== null) {
                const cteName = match[1];
                if (cteName && !reservedWords.has(cteName.toLowerCase())) {
                    globalCteNames.add(cteName.toLowerCase());
                }
            }

            // Also check for comma-separated CTEs: WITH name1 AS (...), name2 AS (...)
            const multiCtePattern = /,\s*(\w+)\s+AS\s*\(/gi;
            while ((match = multiCtePattern.exec(sqlNoComments)) !== null) {
                const cteName = match[1];
                if (cteName && !reservedWords.has(cteName.toLowerCase())) {
                    globalCteNames.add(cteName.toLowerCase());
                }
            }

            // Also collect subquery aliases from SQL using regex (as backup)
            // This catches subqueries like: FROM (SELECT ...) AS alias
            const subqueryAliasPattern = /\)\s+AS\s+(\w+)(?=\s|$|,|\n|WHERE|JOIN|ON)/gi;
            while ((match = subqueryAliasPattern.exec(sqlNoComments)) !== null) {
                const aliasName = match[1];
                if (aliasName && !reservedWords.has(aliasName.toLowerCase())) {
                    // Check if it's in a FROM clause context - look further back
                    const beforeMatch = sqlNoComments.substring(Math.max(0, match.index - 500), match.index);
                    // More flexible pattern for UPDATE...FROM
                    const fromContext = /\bFROM\s+\(/i.test(beforeMatch) ||
                                      /\bUPDATE\s+[\w\s]+\s+FROM\s+\(/i.test(beforeMatch) ||
                                      /FROM\s*\([\s\S]*?\)\s*AS\s*$/i.test(beforeMatch.slice(-200));
                    if (fromContext) {
                        globalCteNames.add(aliasName.toLowerCase());
                    }
                }
            }

            // Also extract subquery aliases from UPDATE...FROM patterns using balanced parenthesis matching
            // This is more efficient than regex with large ranges that can cause backtracking
            this.extractUpdateFromAliases(sqlNoComments, globalCteNames, reservedWords);

            // Store globally for defensive checks
            this.globalCteNames = globalCteNames;

            // Second pass: extract references with CTE names available
            for (let stmtIndex = 0; stmtIndex < statements.length; stmtIndex++) {
                const stmt = statements[stmtIndex];
                if (!stmt) {continue;}
                const aliasMap = this.createAliasMap();
                // Add globally collected CTE names to the alias map
                for (const cteName of globalCteNames) {
                    aliasMap.cteNames.add(cteName);
                }
                this.extractFromStatement(stmt, filePath, sql, references, aliasMap, 0, stmtIndex);
            }
        } catch (error) {
            // Fallback to regex extraction
            const regexRefs = this.extractWithRegex(sql, filePath);
            // Filter out CTE names and subquery aliases from regex fallback
            for (const ref of regexRefs) {
                const tableNameLower = ref.tableName.toLowerCase();
                if (!this.globalCteNames.has(tableNameLower)) {
                    references.push(ref);
                }
            }
        }

        // Final pass: filter out any references that match known CTE/subquery aliases
        // This is a defensive check in case any slipped through
        // Keep globalCteNames available for this check
        const filteredReferences: TableReference[] = [];
        for (const ref of references) {
            const tableNameLower = ref.tableName.toLowerCase();
            // Skip if it matches a known CTE/subquery alias
            if (this.globalCteNames.has(tableNameLower)) {
                continue;
            }
            filteredReferences.push(ref);
        }

        // Clear global CTE names after processing
        this.globalCteNames.clear();

        return this.deduplicateReferences(filteredReferences);
    }

    /**
     * Recursively collect all CTE names from a statement tree
     */
    private collectCTENames(stmt: any, cteNames: Set<string>): void {
        if (!stmt || typeof stmt !== 'object') {return;}

        // Check for WITH clause
        if (stmt.with) {
            const withClause = Array.isArray(stmt.with) ? stmt.with : [stmt.with];
            for (const cte of withClause) {
                const cteName = cte.name?.value || cte.name;
                if (cteName && typeof cteName === 'string') {
                    cteNames.add(cteName.toLowerCase());
                }
            }
        }

        // Check if statement is a WITH statement
        if (stmt.type && stmt.type.toLowerCase() === 'with') {
            if (stmt.ctes) {
                const ctes = Array.isArray(stmt.ctes) ? stmt.ctes : [stmt.ctes];
                for (const cte of ctes) {
                    const cteName = cte.name?.value || cte.name;
                    if (cteName && typeof cteName === 'string') {
                        cteNames.add(cteName.toLowerCase());
                    }
                }
            }
        }

        // Recursively check nested statements and all possible AST structures
        if (stmt.statement) {
            this.collectCTENames(stmt.statement, cteNames);
        }
        if (stmt.query) {
            this.collectCTENames(stmt.query, cteNames);
        }
        if (stmt.select) {
            this.collectCTENames(stmt.select, cteNames);
        }
        if (stmt.insert) {
            this.collectCTENames(stmt.insert, cteNames);
        }
        if (stmt.update) {
            this.collectCTENames(stmt.update, cteNames);
        }
        if (stmt.delete) {
            this.collectCTENames(stmt.delete, cteNames);
        }
        // Check all array properties that might contain statements
        if (Array.isArray(stmt)) {
            for (const item of stmt) {
                this.collectCTENames(item, cteNames);
            }
        }
        // Check all object properties recursively (but limit depth to avoid infinite loops)
        if (typeof stmt === 'object' && stmt !== null) {
            for (const key in stmt) {
                if (key !== 'with' && key !== 'ctes' && typeof stmt[key] === 'object' && stmt[key] !== null) {
                    // Only recurse into likely statement-like structures
                    if (key === 'statement' || key === 'query' || key === 'select' || 
                        key === 'insert' || key === 'update' || key === 'delete' ||
                        key === 'ast' || key === 'stmt' || key === 'definition' ||
                        Array.isArray(stmt[key])) {
                        this.collectCTENames(stmt[key], cteNames);
                    }
                }
            }
        }
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
        depth: number,
        statementIndex: number = 0
    ): void {
        if (!stmt) {return;}
        if (depth > this.options.maxSubqueryDepth) {return;}

        // Check for WITH clause at the top level (before statement type)
        // Some parsers structure WITH clauses separately from the main statement
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
                        depth + 1,
                        statementIndex
                    );
                }
            }
        }

        // Also check if the statement itself is a WITH statement (some parsers structure it this way)
        if (stmt.type && stmt.type.toLowerCase() === 'with') {
            // Process WITH CTEs
            if (stmt.ctes) {
                const ctes = Array.isArray(stmt.ctes) ? stmt.ctes : [stmt.ctes];
                for (const cte of ctes) {
                    const cteName = cte.name?.value || cte.name;
                    if (cteName) {
                        aliasMap.cteNames.add(cteName.toLowerCase());
                    }

                    const cteStmt = cte.stmt?.ast || cte.stmt || cte.ast ||
                        cte.definition?.ast || cte.definition;
                    if (cteStmt) {
                        const cteAliasMap = this.createAliasMap();
                        cteAliasMap.cteNames = new Set(aliasMap.cteNames);
                        this.extractFromStatement(
                            cteStmt,
                            filePath,
                            sql,
                            references,
                            cteAliasMap,
                            depth + 1,
                            statementIndex
                        );
                    }
                }
            }

            // Process the main statement after WITH
            if (stmt.statement || stmt.query) {
                const mainStmt = stmt.statement || stmt.query;
                this.extractFromStatement(
                    mainStmt,
                    filePath,
                    sql,
                    references,
                    aliasMap,
                    depth,
                    statementIndex
                );
            }
            return;
        }

        if (!stmt.type) {return;}
        const stmtType = stmt.type.toLowerCase();

        switch (stmtType) {
            case 'select':
                this.extractFromSelect(stmt, filePath, sql, references, aliasMap, depth, statementIndex);
                break;
            case 'insert':
                this.extractFromInsert(stmt, filePath, sql, references, aliasMap, depth, statementIndex);
                break;
            case 'update':
                this.extractFromUpdate(stmt, filePath, sql, references, aliasMap, depth, statementIndex);
                break;
            case 'delete':
                this.extractFromDelete(stmt, filePath, sql, references, aliasMap, depth, statementIndex);
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
                        depth + 1,
                        statementIndex
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
        depth: number,
        statementIndex: number = 0
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
                        depth + 1,
                        statementIndex
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
                    statementIndex,
                    stmt
                );
            }
        }

        // Subqueries in SELECT columns
        if (stmt.columns) {
            this.extractFromColumns(stmt.columns, filePath, sql, references, aliasMap, depth, statementIndex);
        }

        // WHERE clause (may contain subqueries)
        if (stmt.where) {
            this.extractFromExpression(stmt.where, filePath, sql, references, aliasMap, depth, statementIndex);
        }

        // HAVING clause
        if (stmt.having) {
            this.extractFromExpression(stmt.having, filePath, sql, references, aliasMap, depth, statementIndex);
        }

        // UNION/INTERSECT/EXCEPT
        if (stmt._next) {
            this.extractFromStatement(stmt._next, filePath, sql, references, aliasMap, depth, statementIndex);
        }

        // Set operations
        if (stmt.set_op) {
            this.extractFromStatement(stmt.set_op, filePath, sql, references, aliasMap, depth, statementIndex);
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
        depth: number,
        statementIndex: number = 0
    ): void {
        // Target table
        if (stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            for (const t of tables) {
                const ref = this.createTableReference(t, filePath, sql, 'insert', 'INSERT INTO', statementIndex);
                const tableNameLower = ref?.tableName?.toLowerCase();
                if (ref && tableNameLower) {
                    const isCTE = aliasMap.cteNames.has(tableNameLower) || this.globalCteNames.has(tableNameLower);
                    if (!isCTE) {
                        references.push(ref);
                    }
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
                    depth + 1,
                    statementIndex
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
        depth: number,
        statementIndex: number = 0
    ): void {
        // Process WITH clause first if present (for UPDATE ... WITH ... UPDATE)
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
                        depth + 1,
                        statementIndex
                    );
                }
            }
        }

        // Target table
        if (stmt.table) {
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            for (const t of tables) {
                const ref = this.createTableReference(t, filePath, sql, 'update', 'UPDATE', statementIndex);
                const tableNameLower = ref?.tableName?.toLowerCase();
                if (ref && tableNameLower) {
                    const isCTE = aliasMap.cteNames.has(tableNameLower) || this.globalCteNames.has(tableNameLower);
                    if (!isCTE) {
                        references.push(ref);
                        // Track alias if present
                        if (t.as) {
                            aliasMap.tables.set(t.as.toLowerCase(), { tableName: ref.tableName });
                        }
                    }
                }
            }
        }

        // FROM clause (PostgreSQL, SQL Server style UPDATE...FROM)
        // IMPORTANT: Process FROM clause BEFORE WHERE clause to track subquery aliases
        if (stmt.from) {
            const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
            for (const item of fromItems) {
                // Track subquery aliases in FROM clause FIRST
                // Check if this is a subquery with an alias
                if (item.expr?.type === 'select' || item.expr?.ast) {
                    // Extract alias name from various possible structures
                    let aliasName: string | null = null;
                    if (item.as) {
                        if (typeof item.as === 'string') {
                            aliasName = item.as;
                        } else if (item.as.value) {
                            aliasName = item.as.value;
                        } else if (item.as.name) {
                            aliasName = item.as.name;
                        } else if (typeof item.as === 'object' && 'alias' in item.as) {
                            aliasName = item.as.alias;
                        }
                    }

                    if (aliasName) {
                        const aliasLower = aliasName.toLowerCase();
                        // Mark subquery alias - it's not a real table
                        aliasMap.cteNames.add(aliasLower);
                        // Also add to global CTE names for defensive checking
                        this.globalCteNames.add(aliasLower);
                    }
                }

                // Now process the FROM item (this will process the subquery)
                this.extractFromItem(
                    item,
                    filePath,
                    sql,
                    references,
                    aliasMap,
                    'select',
                    depth,
                    statementIndex
                );
            }
        }

        // WHERE clause
        if (stmt.where) {
            this.extractFromExpression(stmt.where, filePath, sql, references, aliasMap, depth, statementIndex);
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
        depth: number,
        statementIndex: number = 0
    ): void {
        // Process WITH clause first if present (for DELETE ... WITH ... DELETE FROM)
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
                        depth + 1,
                        statementIndex
                    );
                }
            }
        }

        // Target table
        const tableSource = stmt.from || stmt.table;
        if (tableSource) {
            const tables = Array.isArray(tableSource) ? tableSource : [tableSource];
            for (const t of tables) {
                const ref = this.createTableReference(t, filePath, sql, 'delete', 'DELETE FROM', statementIndex);
                const tableNameLower = ref?.tableName?.toLowerCase();
                if (ref && tableNameLower) {
                    const isCTE = aliasMap.cteNames.has(tableNameLower) || this.globalCteNames.has(tableNameLower);
                    if (!isCTE) {
                        references.push(ref);
                    }
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
                    depth,
                    statementIndex
                );
            }
        }

        // WHERE clause
        if (stmt.where) {
            this.extractFromExpression(stmt.where, filePath, sql, references, aliasMap, depth, statementIndex);
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
        statementIndex: number = 0,
        parentStmt?: any
    ): void {
        if (!item) {return;}

        // Determine reference type (join or select)
        const refType: ReferenceType = item.join ? 'join' : defaultType;
        const context = item.join ? `${item.join.toUpperCase()} JOIN` : 'FROM';

        // Direct table reference
        const ref = this.createTableReference(item, filePath, sql, refType, context, statementIndex);
        if (ref && ref.tableName !== 'unknown') {
            // Skip if it's a CTE name (check both current aliasMap and global CTE names)
            const tableNameLower = ref.tableName.toLowerCase();
            const isCTE = aliasMap.cteNames.has(tableNameLower) || this.globalCteNames.has(tableNameLower);

            if (!isCTE) {
                // Extract columns if enabled and parent statement is provided
                if (this.options.extractColumns && parentStmt) {
                    ref.columns = this.extractColumnsFromTable(item, parentStmt, aliasMap);
                }

                references.push(ref);
            }
            // If it's a CTE, skip adding as a table reference

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
            subAliasMap.tables = new Map(aliasMap.tables); // Copy existing aliases

            // Track subquery alias if present - subqueries are not real tables
            if (item.as) {
                const aliasName = (typeof item.as === 'string' ? item.as : item.as.value || item.as.name || '').toLowerCase();
                if (aliasName) {
                    // Mark this as a subquery alias, not a real table
                    // We'll use a special marker or just track it separately
                    // For now, we'll add it to a set of subquery aliases
                    // Actually, we can use the tables map but mark it specially
                    // Or better: add to a new set for subquery aliases
                    // For simplicity, let's add it to cteNames since subqueries should be treated similarly
                    aliasMap.cteNames.add(aliasName);
                    subAliasMap.cteNames.add(aliasName);
                }
            }

            this.extractFromStatement(
                subStmt,
                filePath,
                sql,
                references,
                subAliasMap,
                depth + 1,
                statementIndex
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
        context: string,
        statementIndex: number = 0
    ): TableReference | null {
        const tableName = this.getTableName(item);
        if (!tableName) {return null;}

        return {
            tableName,
            alias: item.as || undefined,
            schema: item.db || item.schema || undefined,
            referenceType: refType,
            filePath,
            lineNumber: this.findTableLine(sql, tableName),
            context,
            statementIndex
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
        depth: number,
        statementIndex: number = 0
    ): void {
        if (!Array.isArray(columns)) {return;}

        for (const col of columns) {
            if (!col) {continue;}

            // Scalar subquery in column
            if (col.expr?.type === 'select') {
                this.extractFromStatement(
                    col.expr,
                    filePath,
                    sql,
                    references,
                    aliasMap,
                    depth + 1,
                    statementIndex
                );
            }

            // Expression with subquery
            if (col.expr) {
                this.extractFromExpression(col.expr, filePath, sql, references, aliasMap, depth, statementIndex);
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
        depth: number,
        statementIndex: number = 0
    ): void {
        if (!expr) {return;}
        if (depth > this.options.maxSubqueryDepth) {return;}

        // Check for column references with table qualifiers (e.g., customer_totals.customer_id)
        // These should NOT create table references if the table name is a known alias/CTE
        if (expr.type === 'column_ref' && expr.table) {
            const tableName = this.getTableNameFromItem(expr.table);
            if (tableName) {
                const tableNameLower = tableName.toLowerCase();
                // Skip if it's a CTE or subquery alias
                if (aliasMap.cteNames.has(tableNameLower) || this.globalCteNames.has(tableNameLower)) {
                    // This is a column reference to a CTE/subquery alias, not a real table
                    // Don't extract it as a table reference
                    return;
                }
            }
        }

        // Subquery in expression
        if (expr.type === 'select') {
            this.extractFromStatement(expr, filePath, sql, references, aliasMap, depth + 1, statementIndex);
            return;
        }

        // EXISTS, IN, ANY, ALL with subquery
        if (expr.right?.type === 'select') {
            this.extractFromStatement(expr.right, filePath, sql, references, aliasMap, depth + 1, statementIndex);
        }
        if (expr.left?.type === 'select') {
            this.extractFromStatement(expr.left, filePath, sql, references, aliasMap, depth + 1, statementIndex);
        }

        // Scalar subquery
        if (expr.ast?.type === 'select') {
            this.extractFromStatement(expr.ast, filePath, sql, references, aliasMap, depth + 1, statementIndex);
        }

        // Nested expression in parentheses
        if (expr.expr?.type === 'select') {
            this.extractFromStatement(expr.expr, filePath, sql, references, aliasMap, depth + 1, statementIndex);
        }

        // Recursive for AND/OR/binary expressions
        if (expr.left && typeof expr.left === 'object') {
            this.extractFromExpression(expr.left, filePath, sql, references, aliasMap, depth, statementIndex);
        }
        if (expr.right && typeof expr.right === 'object') {
            this.extractFromExpression(expr.right, filePath, sql, references, aliasMap, depth, statementIndex);
        }

        // CASE expression args
        if (expr.args) {
            for (const arg of expr.args) {
                if (arg && typeof arg === 'object') {
                    this.extractFromExpression(arg, filePath, sql, references, aliasMap, depth, statementIndex);
                }
            }
        }
    }

    /**
     * Get table name from AST item
     */
    private getTableName(item: any): string | null {
        if (!item) {return null;}
        if (typeof item === 'string') {return item;}

        if (item.table) {
            if (typeof item.table === 'string') {return item.table;}
            if (item.table.table) {return item.table.table;}
            if (item.table.name) {return item.table.name;}
        }

        if (item.name) {return item.name;}

        return null;
    }

    /**
     * Find line number where table is referenced in the correct SQL context.
     * 
     * This method fixes incorrect line number issues by:
     * 1. Searching for the table name in the correct SQL context (FROM, JOIN, INSERT INTO, UPDATE, DELETE FROM)
     *    instead of just any occurrence of the table name
     * 2. Skipping comment lines to avoid false matches
     * 3. Using word boundaries to prevent partial matches
     * 
     * Previous issues:
     * - Matched first occurrence of table name anywhere (including comments or wrong contexts)
     * - Could match table name in comments (e.g., "-- FROM employees")
     * - Could match table name in wrong contexts (e.g., column names containing the table name)
     * 
     * @param sql The original SQL content (with comments intact)
     * @param tableName The table name to find
     * @returns Line number (1-based) where the table is referenced, or 1 if not found
     */
    private findTableLine(sql: string, tableName: string): number {
        const escaped = this.escapeRegex(tableName);
        const lines = sql.split('\n');
        
        // Patterns to match table references in correct SQL contexts
        const patterns = [
            // FROM table
            new RegExp(`\\bFROM\\s+(?:\\w+\\.)?["'\`]?${escaped}["'\`]?\\b`, 'i'),
            // JOIN table
            new RegExp(`\\b(?:INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\\s*JOIN\\s+(?:\\w+\\.)?["'\`]?${escaped}["'\`]?\\b`, 'i'),
            // INSERT INTO table
            new RegExp(`\\bINSERT\\s+INTO\\s+(?:\\w+\\.)?["'\`]?${escaped}["'\`]?\\b`, 'i'),
            // UPDATE table
            new RegExp(`\\bUPDATE\\s+(?:\\w+\\.)?["'\`]?${escaped}["'\`]?\\b`, 'i'),
            // DELETE FROM table
            new RegExp(`\\bDELETE\\s+FROM\\s+(?:\\w+\\.)?["'\`]?${escaped}["'\`]?\\b`, 'i'),
        ];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Skip comment lines
            if (line.trimStart().startsWith('--')) {
                continue;
            }
            
            // Check if any pattern matches this line
            for (const pattern of patterns) {
                if (pattern.test(line)) {
                    return i + 1;
                }
            }
        }

        // Fallback: if no context match found, search for table name with word boundaries
        // (but still skip comments)
        const fallbackRegex = new RegExp(`\\b${escaped}\\b`, 'i');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trimStart().startsWith('--') && fallbackRegex.test(line)) {
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

        // Strip comments to prevent false matches like "UPDATE without WHERE" in comments
        const sqlNoComments = this.stripSqlComments(sql);

        // Build statement boundary map for comment-stripped SQL
        // Split on semicolons that aren't inside strings
        const statementBoundaries: number[] = [0]; // Start positions of each statement
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < sqlNoComments.length; i++) {
            const char = sqlNoComments[i];

            // Handle strings
            if (char === "'" || char === '"' || char === '`') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
                continue;
            }

            // Track semicolons as statement boundaries
            if (!inString && char === ';') {
                statementBoundaries.push(i + 1);
            }
        }

        // Helper to find statement index for a given character position
        // NOTE: charIndex should be from sqlNoComments (comment-stripped SQL) since
        // statementBoundaries are calculated from sqlNoComments. This is fine for statementIndex
        // (used for grouping), but NOT for line numbers (which must use original SQL).
        const getStatementIndex = (charIndex: number): number => {
            for (let i = statementBoundaries.length - 1; i >= 0; i--) {
                if (charIndex >= statementBoundaries[i]) {
                    return i;
                }
            }
            return 0;
        };

        const isFunctionFrom = (matchIndex: number): boolean => {
            const lineStart = sql.lastIndexOf('\n', matchIndex) + 1;
            const lineEnd = sql.indexOf('\n', matchIndex);
            const end = lineEnd === -1 ? sql.length : lineEnd;
            const line = sql.slice(lineStart, end);
            const fromPos = matchIndex - lineStart;
            const lowerLine = line.toLowerCase();

            for (const fn of functionFromKeywords) {
                const fnIndex = lowerLine.lastIndexOf(fn, fromPos);
                if (fnIndex === -1) {continue;}
                const parenIndex = lowerLine.indexOf('(', fnIndex + fn.length);
                if (parenIndex === -1 || parenIndex > fromPos) {continue;}
                const closeParenIndex = lowerLine.indexOf(')', parenIndex + 1);
                if (closeParenIndex !== -1 && closeParenIndex < fromPos) {continue;}
                return true;
            }

            return false;
        };

        // FROM table pattern
        const fromRegex = /\bFROM\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?(?:\s+(?:AS\s+)?(\w+))?/gi;
        let match;
        while ((match = fromRegex.exec(sqlNoComments)) !== null) {
            if (isFunctionFrom(match.index)) {
                continue;
            }
            const tableName = match[2];
            // Skip reserved words
            if (this.isReservedWord(tableName)) {
                continue;
            }
            // Find the reference in original SQL to get correct line number
            const loc = this.findTableReferenceLocation(sql, tableName, 'FROM', match[1]);
            if (loc) {
                references.push({
                    tableName,
                    alias: match[3],
                    schema: match[1],
                    referenceType: 'select',
                    filePath,
                    lineNumber: loc.lineNumber,
                    context: 'FROM',
                    statementIndex: getStatementIndex(match.index)
                });
            }
        }

        // JOIN pattern
        const joinRegex = /\b(?:INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\s*JOIN\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?(?:\s+(?:AS\s+)?(\w+))?/gi;
        while ((match = joinRegex.exec(sqlNoComments)) !== null) {
            const tableName = match[2];
            // Skip reserved words
            if (this.isReservedWord(tableName)) {
                continue;
            }
            // Find the reference in original SQL to get correct line number
            const loc = this.findTableReferenceLocation(sql, tableName, 'JOIN', match[1]);
            if (loc) {
                references.push({
                    tableName,
                    alias: match[3],
                    schema: match[1],
                    referenceType: 'join',
                    filePath,
                    lineNumber: loc.lineNumber,
                    context: 'JOIN',
                    statementIndex: getStatementIndex(match.index)
                });
            }
        }

        // INSERT INTO pattern
        const insertRegex = /\bINSERT\s+INTO\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        while ((match = insertRegex.exec(sqlNoComments)) !== null) {
            const tableName = match[2];
            // Skip reserved words
            if (this.isReservedWord(tableName)) {
                continue;
            }
            // Find the reference in original SQL to get correct line number
            const loc = this.findTableReferenceLocation(sql, tableName, 'INSERT INTO', match[1]);
            if (loc) {
                references.push({
                    tableName,
                    schema: match[1],
                    referenceType: 'insert',
                    filePath,
                    lineNumber: loc.lineNumber,
                    context: 'INSERT INTO',
                    statementIndex: getStatementIndex(match.index)
                });
            }
        }

        // UPDATE pattern
        const updateRegex = /\bUPDATE\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        while ((match = updateRegex.exec(sqlNoComments)) !== null) {
            const tableName = match[2];
            // Skip reserved words
            if (this.isReservedWord(tableName)) {
                continue;
            }
            // Find the reference in original SQL to get correct line number
            const loc = this.findTableReferenceLocation(sql, tableName, 'UPDATE', match[1]);
            if (loc) {
                references.push({
                    tableName,
                    schema: match[1],
                    referenceType: 'update',
                    filePath,
                    lineNumber: loc.lineNumber,
                    context: 'UPDATE',
                    statementIndex: getStatementIndex(match.index)
                });
            }
        }

        // DELETE FROM pattern
        const deleteRegex = /\bDELETE\s+FROM\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        while ((match = deleteRegex.exec(sqlNoComments)) !== null) {
            const tableName = match[2];
            // Skip reserved words
            if (this.isReservedWord(tableName)) {
                continue;
            }
            // Find the reference in original SQL to get correct line number
            const loc = this.findTableReferenceLocation(sql, tableName, 'DELETE FROM', match[1]);
            if (loc) {
                references.push({
                    tableName,
                    schema: match[1],
                    referenceType: 'delete',
                    filePath,
                    lineNumber: loc.lineNumber,
                    context: 'DELETE FROM',
                    statementIndex: getStatementIndex(match.index)
                });
            }
        }

        return references;
    }

    /**
     * Find table reference location in original SQL (not comment-stripped).
     * Searches for the table name in the correct SQL context and returns both line number and char index.
     * 
     * This fixes the bug where match.index from sqlNoComments was used with getLineNumberAtIndex(originalSql, ...)
     * causing character index misalignment and wrong line numbers.
     * 
     * @param sql The original SQL content (with comments intact)
     * @param tableName The table name to find
     * @param context The SQL context ('FROM', 'JOIN', 'INSERT INTO', 'UPDATE', 'DELETE FROM')
     * @param schema Optional schema name
     * @returns Object with lineNumber (1-based) and charIndex (0-based), or null if not found
     */
    private findTableReferenceLocation(
        sql: string,
        tableName: string,
        context: string,
        schema?: string
    ): { lineNumber: number; charIndex: number } | null {
        const escaped = this.escapeRegex(tableName);
        const schemaPart = schema ? `${this.escapeRegex(schema)}\\.` : '(?:\\w+\\.)?';
        const lines = sql.split('\n');
        
        let pattern: RegExp;
        switch (context) {
            case 'FROM':
                pattern = new RegExp(`\\bFROM\\s+${schemaPart}["'\`]?${escaped}["'\`]?\\b`, 'gi');
                break;
            case 'JOIN':
                pattern = new RegExp(`\\b(?:INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\\s*JOIN\\s+${schemaPart}["'\`]?${escaped}["'\`]?\\b`, 'gi');
                break;
            case 'INSERT INTO':
                pattern = new RegExp(`\\bINSERT\\s+INTO\\s+${schemaPart}["'\`]?${escaped}["'\`]?\\b`, 'gi');
                break;
            case 'UPDATE':
                pattern = new RegExp(`\\bUPDATE\\s+${schemaPart}["'\`]?${escaped}["'\`]?\\b`, 'gi');
                break;
            case 'DELETE FROM':
                pattern = new RegExp(`\\bDELETE\\s+FROM\\s+${schemaPart}["'\`]?${escaped}["'\`]?\\b`, 'gi');
                break;
            default:
                return null;
        }

        let m: RegExpExecArray | null;
        while ((m = pattern.exec(sql)) !== null) {
            const lineNum = this.getLineNumberAtIndex(sql, m.index);
            const lineContent = lines[lineNum - 1] ?? '';
            // Skip matches in comment lines
            if (!lineContent.trimStart().startsWith('--')) {
                return { lineNumber: lineNum, charIndex: m.index };
            }
        }

        return null;
    }

    /**
     * Get line number at character index.
     * 
     * IMPORTANT: The charIndex must be from the SAME sql string passed to this method.
     * Do NOT use charIndex from a comment-stripped or modified version of the SQL
     * with the original SQL string, as this will cause incorrect line numbers.
     * 
     * @param sql The SQL string to search in
     * @param charIndex Character index (0-based) in the sql string
     * @returns Line number (1-based) where the character index falls
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
        _aliasMap: AliasMap
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
        if (!expr) {return [];}

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
        if (!tableName) {return true;} // If no table specified, include all columns

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
        if (!item) {return undefined;}

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
            if (seen.has(key)) {return false;}
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
            if (seen.has(key)) {return false;}
            seen.add(key);
            return true;
        });
    }

    /**
     * Extract subquery aliases from UPDATE...FROM patterns using balanced parenthesis matching
     * More efficient than regex with large ranges that can cause catastrophic backtracking
     */
    private extractUpdateFromAliases(sql: string, cteNames: Set<string>, reservedWords: Set<string>): void {
        let updateIndex = 0;
        while ((updateIndex = sql.indexOf('UPDATE', updateIndex)) !== -1) {
            const fromIndex = sql.indexOf('FROM', updateIndex);
            if (fromIndex === -1 || fromIndex > updateIndex + 500) {
                updateIndex += 6;
                continue;
            }

            // Find the opening paren after FROM
            const openParenIndex = sql.indexOf('(', fromIndex);
            if (openParenIndex === -1) {
                updateIndex += 6;
                continue;
            }

            // Find the matching closing paren using balanced counting
            let parenCount = 0;
            let closeParenIndex = -1;
            const maxSearchLength = Math.min(sql.length, openParenIndex + 2000);
            for (let i = openParenIndex; i < maxSearchLength; i++) {
                if (sql[i] === '(') {parenCount++;}
                else if (sql[i] === ')') {
                    parenCount--;
                    if (parenCount === 0) {
                        closeParenIndex = i;
                        break;
                    }
                }
            }

            if (closeParenIndex !== -1) {
                // Check for AS alias after the closing paren
                const afterParen = sql.substring(closeParenIndex + 1, closeParenIndex + 50).trim();
                const asMatch = afterParen.match(/^AS\s+(\w+)/i);
                if (asMatch) {
                    const aliasName = asMatch[1].toLowerCase();
                    if (!reservedWords.has(aliasName)) {
                        cteNames.add(aliasName);
                    }
                }
            }

            updateIndex = fromIndex + 1;
        }
    }
}
