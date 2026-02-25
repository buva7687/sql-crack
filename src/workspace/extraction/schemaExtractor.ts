// Schema Extractor - Parse CREATE TABLE/VIEW statements

import { Parser } from 'node-sql-parser';
import {
    SchemaDefinition,
    ColumnInfo,
    ForeignKeyRef,
    SqlDialect,
    ExtractionOptions,
    DEFAULT_EXTRACTION_OPTIONS,
} from './types';
import { escapeRegex } from '../../shared';
import { preprocessForParsing } from '../../webview/parser/dialects/preprocessing';

// SQL reserved words that should never be treated as table/view names
const SQL_RESERVED_WORDS = new Set([
    'select', 'insert', 'update', 'delete', 'create', 'drop', 'alter', 'truncate',
    'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'between',
    'join', 'inner', 'outer', 'left', 'right', 'full', 'cross', 'on', 'using',
    'group', 'by', 'having', 'order', 'asc', 'desc', 'limit', 'offset',
    'union', 'intersect', 'except', 'all', 'distinct', 'as',
    'case', 'when', 'then', 'else', 'end', 'if', 'exists',
    'values', 'set', 'into', 'table', 'view', 'index', 'database', 'schema',
    'primary', 'foreign', 'key', 'references', 'constraint', 'unique', 'check',
    'default', 'auto_increment', 'identity', 'serial',
    'with', 'recursive', 'over', 'partition', 'rows', 'range',
    'true', 'false', 'unknown'
]);

/**
 * Extracts schema definitions (CREATE TABLE/VIEW) from SQL
 */
export class SchemaExtractor {
    private parser: Parser;
    private options: ExtractionOptions;

    constructor(options: Partial<ExtractionOptions> = {}) {
        this.parser = new Parser();
        this.options = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
    }

    /**
     * Extract all CREATE TABLE/VIEW definitions from SQL
     */
    extractDefinitions(
        sql: string,
        filePath: string,
        dialect: SqlDialect = this.options.dialect
    ): SchemaDefinition[] {
        const definitions: SchemaDefinition[] = [];

        try {
            const dbDialect = this.mapDialect(dialect);
            const sqlToParse = preprocessForParsing(sql, dialect);
            const ast = this.parser.astify(sqlToParse, { database: dbDialect });
            const statements = Array.isArray(ast) ? ast : [ast];

            for (const stmt of statements) {
                if (!stmt) {continue;}

                if (this.isCreateTable(stmt)) {
                    const def = this.parseCreateTable(stmt, filePath, sql);
                    if (def) {definitions.push(def);}
                } else if (this.isCreateView(stmt)) {
                    const def = this.parseCreateView(stmt, filePath, sql);
                    if (def) {definitions.push(def);}
                }
            }
        } catch (error) {
            // Fallback to regex-based extraction for unsupported dialects or parse errors
            definitions.push(...this.extractWithRegex(sql, filePath));
        }

        return definitions;
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
            'Trino': 'trino',
            'Oracle': 'postgresql',
            'Teradata': 'mysql'
        };
        return dialectMap[dialect] || 'mysql';
    }

    /**
     * Check if statement is CREATE TABLE
     */
    private isCreateTable(stmt: any): boolean {
        if (!stmt || !stmt.type) {return false;}
        const type = stmt.type.toLowerCase();
        return type === 'create' && stmt.keyword?.toLowerCase() === 'table';
    }

    /**
     * Check if statement is CREATE VIEW
     */
    private isCreateView(stmt: any): boolean {
        if (!stmt || !stmt.type) {return false;}
        const type = stmt.type.toLowerCase();
        return type === 'create' && (
            stmt.keyword?.toLowerCase() === 'view' ||
            stmt.keyword?.toLowerCase() === 'materialized view'
        );
    }

    /**
     * Parse CREATE TABLE statement
     */
    private parseCreateTable(
        stmt: any,
        filePath: string,
        originalSql: string
    ): SchemaDefinition | null {
        try {
            const { name: tableName, schema } = this.extractTableName(stmt);
            const columns = this.extractColumns(stmt);

            return {
                type: 'table',
                name: tableName,
                schema,
                columns,
                filePath,
                lineNumber: this.findLineNumber(originalSql, tableName, 'table'),
                sql: this.extractStatementSql(originalSql, tableName, 'table')
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Parse CREATE VIEW statement
     */
    private parseCreateView(
        stmt: any,
        filePath: string,
        originalSql: string
    ): SchemaDefinition | null {
        try {
            const { name: viewName, schema } = this.extractTableName(stmt);
            const columns = this.extractViewColumns(stmt);

            return {
                type: 'view',
                name: viewName,
                schema,
                columns,
                filePath,
                lineNumber: this.findLineNumber(originalSql, viewName, 'view'),
                sql: this.extractStatementSql(originalSql, viewName, 'view')
                // Note: sourceQuery will be populated by lineage builder
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Extract table/view name from AST
     */
    private extractTableName(stmt: any): { name: string; schema?: string } {
        let name = 'unknown';
        let schema: string | undefined;

        if (stmt.table) {
            if (Array.isArray(stmt.table) && stmt.table.length > 0) {
                name = stmt.table[0].table || stmt.table[0].name || 'unknown';
                schema = stmt.table[0].db || stmt.table[0].schema;
            } else if (typeof stmt.table === 'object') {
                name = stmt.table.table || stmt.table.name || 'unknown';
                schema = stmt.table.db || stmt.table.schema;
            } else if (typeof stmt.table === 'string') {
                name = stmt.table;
            }
        }

        return { name, schema };
    }

    /**
     * Extract columns from CREATE TABLE statement
     */
    private extractColumns(stmt: any): ColumnInfo[] {
        const columns: ColumnInfo[] = [];
        const createDefinitions = stmt.create_definitions || stmt.columns || [];

        for (const colDef of createDefinitions) {
            if (colDef.resource === 'column' || colDef.column) {
                const column = this.parseColumnDefinition(colDef);
                if (column) {columns.push(column);}
            }
        }

        return columns;
    }

    /**
     * Extract columns from CREATE VIEW statement
     */
    private extractViewColumns(stmt: any): ColumnInfo[] {
        const columns: ColumnInfo[] = [];

        // Views may have explicit column list
        if (stmt.columns && Array.isArray(stmt.columns)) {
            for (const col of stmt.columns) {
                const colName = typeof col === 'string' ? col : col.column || col.name;
                if (colName) {
                    columns.push({
                        name: colName,
                        dataType: 'derived',
                        nullable: true,
                        primaryKey: false,
                        isComputed: true  // View columns are derived
                    });
                }
            }
        }

        return columns;
    }

    /**
     * Parse column definition from AST
     */
    private parseColumnDefinition(colDef: any): ColumnInfo | null {
        try {
            // Get column name
            let name: string;
            if (typeof colDef.column === 'string') {
                name = colDef.column;
            } else if (colDef.column?.column) {
                name = colDef.column.column;
            } else if (colDef.column?.name) {
                name = colDef.column.name;
            } else {
                return null;
            }

            // Get data type
            let dataType = 'unknown';
            if (colDef.definition) {
                if (typeof colDef.definition === 'string') {
                    dataType = colDef.definition;
                } else if (colDef.definition.dataType) {
                    dataType = colDef.definition.dataType;
                    if (colDef.definition.length) {
                        dataType += `(${colDef.definition.length})`;
                    }
                }
            }

            // Check nullable
            let nullable = true;
            if (colDef.nullable) {
                const nullValue = colDef.nullable.value?.toLowerCase?.() || '';
                nullable = !nullValue.includes('not null');
            }

            // Check primary key
            const primaryKey = colDef.primary_key === true ||
                colDef.constraint?.type === 'primary key';

            // Extract foreign key if present
            let foreignKey: ForeignKeyRef | undefined;
            if (colDef.reference || colDef.references) {
                const ref = colDef.reference || colDef.references;
                foreignKey = {
                    referencedTable: ref.table || 'unknown',
                    referencedColumn: ref.column || ref.columns?.[0] || 'unknown'
                };
            }

            return {
                name,
                dataType,
                nullable,
                primaryKey,
                foreignKey,
                isComputed: false
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if a name is a SQL reserved word
     */
    private isReservedWord(name: string): boolean {
        return SQL_RESERVED_WORDS.has(name.toLowerCase());
    }

    /**
     * Strip SQL comments from a string to prevent false matches
     * Handles single-line (--, #) and multi-line comments
     */
    private stripSqlComments(sql: string): string {
        // Remove multi-line comments first (/* ... */)
        let result = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
        // Remove single-line comments (-- ... until end of line)
        result = result.replace(/--[^\n\r]*/g, ' ');
        // Remove MySQL-style hash comments (# ... until end of line)
        result = result.replace(/#[^\n\r]*/g, ' ');
        return result;
    }

    /**
     * Regex-based fallback for extracting schema definitions
     */
    private extractWithRegex(sql: string, filePath: string): SchemaDefinition[] {
        const definitions: SchemaDefinition[] = [];

        // Strip comments to prevent false matches like "CREATE TABLE AS SELECT" in comments
        const sqlNoComments = this.stripSqlComments(sql);

        // CREATE TABLE pattern - capture table name and body
        // Use a simpler approach: find CREATE TABLE, then extract body separately
        const tableHeaderRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        let match;
        while ((match = tableHeaderRegex.exec(sqlNoComments)) !== null) {
            const tableName = match[2];

            // Skip if table name is a SQL reserved word
            if (this.isReservedWord(tableName)) {
                continue;
            }

            const startIndex = match.index + match[0].length;

            // Find the opening parenthesis
            const afterHeader = sqlNoComments.substring(startIndex);
            const parenStart = afterHeader.indexOf('(');

            if (parenStart !== -1) {
                // Find matching closing parenthesis
                const bodyStart = startIndex + parenStart + 1;
                const tableBody = this.extractBalancedParens(sqlNoComments, bodyStart);
                const columns = this.extractColumnsFromBody(tableBody);

                // Use findCreateStatementLocation on ORIGINAL sql (not sqlNoComments) to get correct line number
                // Previous bug: used match.index from sqlNoComments with getLineNumberAtIndex(originalSql, ...)
                // causing character index misalignment and wrong line numbers
                const loc = this.findCreateStatementLocation(sql, tableName, 'table');
                definitions.push({
                    type: 'table',
                    name: tableName,
                    schema: match[1],
                    columns,
                    filePath,
                    lineNumber: loc.lineNumber,
                    sql: this.extractStatementFromIndex(sql, loc.charIndex)
                });
            } else {
                // No parenthesis - might be CREATE TABLE AS SELECT
                // Use findCreateStatementLocation on ORIGINAL sql to get correct line number and char index
                const loc = this.findCreateStatementLocation(sql, tableName, 'table');
                definitions.push({
                    type: 'table',
                    name: tableName,
                    schema: match[1],
                    columns: [],
                    filePath,
                    lineNumber: loc.lineNumber,
                    sql: this.extractStatementFromIndex(sql, loc.charIndex)
                });
            }
        }

        // CREATE VIEW pattern
        const viewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        while ((match = viewRegex.exec(sqlNoComments)) !== null) {
            const viewName = match[2];

            // Skip if view name is a SQL reserved word
            if (this.isReservedWord(viewName)) {
                continue;
            }

            // Use findCreateStatementLocation on ORIGINAL sql (not sqlNoComments) to get correct line number
            const loc = this.findCreateStatementLocation(sql, viewName, 'view');
            definitions.push({
                type: 'view',
                name: viewName,
                schema: match[1],
                columns: [],
                filePath,
                lineNumber: loc.lineNumber,
                sql: this.extractStatementFromIndex(sql, loc.charIndex)
            });
        }

        return definitions;
    }

    /**
     * Extract columns from CREATE TABLE body using regex
     */
    private extractColumnsFromBody(body: string): ColumnInfo[] {
        const columns: ColumnInfo[] = [];
        const foreignKeyMap = new Map<string, ForeignKeyRef>();

        // Split by comma, but be careful about nested parentheses
        const parts = this.splitColumnDefinitions(body);

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) {continue;}

            // Skip constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, CONSTRAINT)
            if (/^\s*(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)/i.test(trimmed)) {
                // Capture table-level foreign key constraints like:
                // CONSTRAINT fk_name FOREIGN KEY (col) REFERENCES ref_table(ref_col)
                const fkMatch = trimmed.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?\s*\(([^)]+)\)/i);
                if (fkMatch) {
                    const columnList = fkMatch[1].split(',').map(col => col.trim().replace(/["'`]/g, ''));
                    const refSchema = fkMatch[2];
                    const refTableName = fkMatch[3];
                    const refTable = refSchema ? `${refSchema}.${refTableName}` : refTableName;
                    const refColumns = fkMatch[4].split(',').map(col => col.trim().replace(/["'`]/g, ''));

                    columnList.forEach((columnName, index) => {
                        if (!columnName) {return;}
                        const refColumn = refColumns[index] || refColumns[0];
                        if (!refColumn) {return;}
                        foreignKeyMap.set(columnName.toLowerCase(), {
                            referencedTable: refTable,
                            referencedColumn: refColumn
                        });
                    });
                }
                continue;
            }

            // Parse column: name datatype [constraints]
            // Match: column_name DATA_TYPE(args) or column_name DATA_TYPE
            const colMatch = trimmed.match(/^["'`]?(\w+)["'`]?\s+(\w+)(?:\s*\([^)]*\))?(.*)$/i);
            if (colMatch) {
                const name = colMatch[1];
                let dataType = colMatch[2];
                const rest = colMatch[3] || '';

                // Check for type with precision like VARCHAR(255) or DECIMAL(10,2)
                const typeWithPrecision = trimmed.match(/^["'`]?\w+["'`]?\s+(\w+\s*\([^)]+\))/i);
                if (typeWithPrecision) {
                    dataType = typeWithPrecision[1].replace(/\s+/g, '');
                }

                // Check constraints in the rest
                const isPrimaryKey = /PRIMARY\s+KEY/i.test(rest);
                const isNotNull = /NOT\s+NULL/i.test(rest);
                const hasReferences = /REFERENCES\s+(?:(\w+)\.)?["'`]?(\w+)["'`]?\s*\(\s*["'`]?(\w+)["'`]?\s*\)/i.exec(rest);

                const column: ColumnInfo = {
                    name,
                    dataType: dataType.toUpperCase(),
                    nullable: !isNotNull && !isPrimaryKey,
                    primaryKey: isPrimaryKey,
                    isComputed: /GENERATED\s+ALWAYS/i.test(rest)
                };

                if (hasReferences) {
                    const refSchema = hasReferences[1];
                    const refTableName = hasReferences[2];
                    const refTable = refSchema ? `${refSchema}.${refTableName}` : refTableName;
                    column.foreignKey = {
                        referencedTable: refTable,
                        referencedColumn: hasReferences[3]
                    };
                }

                columns.push(column);
            }
        }

        // Apply foreign keys from table-level constraints to columns
        for (const column of columns) {
            if (column.foreignKey) {continue;}
            const fk = foreignKeyMap.get(column.name.toLowerCase());
            if (fk) {
                column.foreignKey = fk;
            }
        }

        return columns;
    }

    /**
     * Extract content between balanced parentheses starting at given index
     */
    private extractBalancedParens(sql: string, startIndex: number): string {
        let depth = 1;
        let i = startIndex;

        while (i < sql.length && depth > 0) {
            const char = sql[i];
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            }
            i++;
        }

        // Return content between parens (excluding the final closing paren)
        return sql.substring(startIndex, i - 1);
    }

    /**
     * Split column definitions handling nested parentheses
     */
    private splitColumnDefinitions(body: string): string[] {
        const parts: string[] = [];
        let current = '';
        let depth = 0;

        for (const char of body) {
            if (char === '(') {
                depth++;
                current += char;
            } else if (char === ')') {
                depth--;
                current += char;
            } else if (char === ',' && depth === 0) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            parts.push(current);
        }

        return parts;
    }

    /**
     * Find line number and character index where a table/view is defined.
     * 
     * This method fixes incorrect line number issues by:
     * 1. Searching the ORIGINAL SQL (not comment-stripped) to ensure character indices align correctly
     * 2. Using an exact pattern match: "CREATE TABLE <identifier>" or "CREATE VIEW <identifier>"
     *    This avoids false matches from partial identifier occurrences (e.g., "2024" in "EXTRACT(...) = 2024")
     * 3. Skipping comment lines (lines starting with '--') to avoid matching CREATE statements in comments
     * 
     * Previous issues:
     * - Used match.index from comment-stripped SQL with getLineNumberAtIndex(originalSql, ...) 
     *   causing index misalignment and wrong line numbers
     * - Fallback to "first occurrence of identifier" matched unrelated text (e.g., "2024" in CASE statements)
     * - Could match CREATE TABLE in comments (e.g., "-- 8. CREATE TABLE AS SELECT (CTAS)")
     * 
     * @param sql The original SQL content (with comments intact)
     * @param identifier The table/view name to find
     * @param type Whether to search for 'table' or 'view'
     * @returns Object with lineNumber (1-based) and charIndex (0-based) of the CREATE statement
     */
    private findCreateStatementLocation(
        sql: string,
        identifier: string,
        type: 'table' | 'view'
    ): { lineNumber: number; charIndex: number } {
        const keyword = type === 'table' ? 'TABLE' : 'VIEW';
        // Escape special regex characters in identifier to prevent injection or false matches
        const escaped = escapeRegex(identifier);
        // Match exact pattern: CREATE [OR REPLACE] [TEMP] [MATERIALIZED] TABLE/VIEW [IF NOT EXISTS] [schema.]identifier
        const re = new RegExp(
            `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?(?:MATERIALIZED\\s+)?${keyword}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:\\w+\\.)?["'\`]?${escaped}["'\`]?`,
            'gi'
        );
        const lines = sql.split('\n');
        let m: RegExpExecArray | null;
        while ((m = re.exec(sql)) !== null) {
            const lineNum = this.getLineNumberAtIndex(sql, m.index);
            const lineContent = lines[lineNum - 1] ?? '';
            // Skip matches in comment lines (e.g., "-- CREATE TABLE example")
            if (!lineContent.trimStart().startsWith('--')) {
                return { lineNumber: lineNum, charIndex: m.index };
            }
        }
        // Fallback: return line 1 if not found (should rarely happen)
        return { lineNumber: 1, charIndex: 0 };
    }

    private findLineNumber(sql: string, identifier: string, type: 'table' | 'view'): number {
        return this.findCreateStatementLocation(sql, identifier, type).lineNumber;
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
     * Extract the full CREATE statement SQL
     */
    private extractStatementSql(sql: string, name: string, type: 'table' | 'view'): string {
        const keyword = type === 'table' ? 'TABLE' : 'VIEW';
        const escaped = escapeRegex(name);
        const regex = new RegExp(
            `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?(?:MATERIALIZED\\s+)?${keyword}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:\\w+\\.)?["'\`]?${escaped}["'\`]?[^;]*;?`,
            'gi'
        );
        const match = regex.exec(sql);
        return match ? match[0].trim() : '';
    }

    /**
     * Extract statement starting from character index
     */
    private extractStatementFromIndex(sql: string, startIndex: number): string {
        let end = sql.indexOf(';', startIndex);
        const nextCreate = sql.indexOf('CREATE', startIndex + 1);

        if (nextCreate > 0 && (end < 0 || nextCreate < end)) {
            end = nextCreate;
        }

        if (end < 0) {end = sql.length;}

        return sql.substring(startIndex, end).trim();
    }
}
