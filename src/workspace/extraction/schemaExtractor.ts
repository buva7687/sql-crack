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
import { escapeRegex, stripSqlComments, unwrapIdentifierValue } from '../../shared';
import { preprocessSqlForWorkspaceParsing } from '../parserConfig';
import { SCHEMA_SQL_RESERVED_WORDS } from './constants';

const SQL_IDENTIFIER_PATTERN =
    '(?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\\[(?:[^\\]]|\\]\\])*\\]|[\\w$#@]+)';

interface SqlSearchViews {
    searchableSql: string;
    structuralSql: string;
}

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
        const { sql: normalizedSql } = preprocessSqlForWorkspaceParsing(sql, dialect);
        const sourceViews = this.createSqlSearchViews(sql);

        try {
            const dbDialect = this.mapDialect(dialect);
            const ast = this.parser.astify(normalizedSql, { database: dbDialect });
            const statements = Array.isArray(ast) ? ast : [ast];

            for (let statementIndex = 0; statementIndex < statements.length; statementIndex++) {
                const stmt = statements[statementIndex];
                if (!stmt) {continue;}

                if (this.isCreateTable(stmt)) {
                    const def = this.parseCreateTable(
                        stmt,
                        filePath,
                        sql,
                        statementIndex,
                        sourceViews
                    );
                    if (def) {definitions.push(def);}
                } else if (this.isCreateView(stmt)) {
                    const def = this.parseCreateView(
                        stmt,
                        filePath,
                        sql,
                        statementIndex,
                        sourceViews
                    );
                    if (def) {definitions.push(def);}
                }
            }
        } catch (error) {
            // Fallback to regex-based extraction for unsupported dialects or parse errors
            const fallbackViews = normalizedSql === sql
                ? sourceViews
                : this.createSqlSearchViews(normalizedSql);
            definitions.push(...this.extractWithRegex(normalizedSql, filePath, fallbackViews));
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
        originalSql: string,
        statementIndex: number,
        sourceViews: SqlSearchViews
    ): SchemaDefinition | null {
        try {
            const { name: tableName, schema } = this.extractTableName(stmt);
            const columns = this.extractColumns(stmt);

            return {
                type: 'table',
                name: tableName,
                schema,
                statementIndex,
                columns,
                filePath,
                lineNumber: this.findLineNumber(
                    originalSql,
                    tableName,
                    'table',
                    sourceViews.searchableSql
                ),
                sql: this.extractStatementSql(
                    originalSql,
                    tableName,
                    'table',
                    sourceViews
                )
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
        originalSql: string,
        statementIndex: number,
        sourceViews: SqlSearchViews
    ): SchemaDefinition | null {
        try {
            const { name: viewName, schema } = this.extractTableName(stmt);
            const columns = this.extractViewColumns(stmt);

            return {
                type: 'view',
                name: viewName,
                schema,
                statementIndex,
                columns,
                filePath,
                lineNumber: this.findLineNumber(
                    originalSql,
                    viewName,
                    'view',
                    sourceViews.searchableSql
                ),
                sql: this.extractStatementSql(
                    originalSql,
                    viewName,
                    'view',
                    sourceViews
                )
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

        if (stmt.view) {
            if (Array.isArray(stmt.view) && stmt.view.length > 0) {
                name = stmt.view[0].view || stmt.view[0].table || stmt.view[0].name || 'unknown';
                schema = stmt.view[0].db || stmt.view[0].schema;
                return { name, schema };
            }
            if (typeof stmt.view === 'object') {
                name = stmt.view.view || stmt.view.table || stmt.view.name || 'unknown';
                schema = stmt.view.db || stmt.view.schema;
                return { name, schema };
            }
            if (typeof stmt.view === 'string') {
                return { name: stmt.view };
            }
        }

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
            const name = unwrapIdentifierValue(colDef.column)
                || unwrapIdentifierValue(colDef.column?.column)
                || unwrapIdentifierValue(colDef.column?.name);
            if (!name) {
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
        return SCHEMA_SQL_RESERVED_WORDS.has(name.toLowerCase());
    }

    private unquoteIdentifier(identifier: string): string {
        const trimmed = identifier.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return trimmed.slice(1, -1).replace(/""/g, '"');
        }
        if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
            return trimmed.slice(1, -1).replace(/``/g, '`');
        }
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            return trimmed.slice(1, -1).replace(/]]/g, ']');
        }
        return trimmed;
    }

    private createHeaderRegex(type: 'table' | 'view'): RegExp {
        const keyword = type === 'table' ? 'TABLE' : 'VIEW';
        return new RegExp(
            `(?<![\\w$#@])CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?` +
            `(?:MATERIALIZED\\s+)?${keyword}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?` +
            `(${SQL_IDENTIFIER_PATTERN})(?:\\s*\\.\\s*(${SQL_IDENTIFIER_PATTERN}))?`,
            'gi'
        );
    }


    /**
     * Regex-based fallback for extracting schema definitions
     */
    private extractWithRegex(
        sql: string,
        filePath: string,
        sourceViews: SqlSearchViews
    ): SchemaDefinition[] {
        const definitions: SchemaDefinition[] = [];

        const sqlNoComments = sourceViews.searchableSql;

        // CREATE TABLE pattern - capture table name and body
        // Use a simpler approach: find CREATE TABLE, then extract body separately
        const tableHeaderRegex = this.createHeaderRegex('table');
        let match;
        while ((match = tableHeaderRegex.exec(sqlNoComments)) !== null) {
            const tableName = this.unquoteIdentifier(match[2] || match[1]);
            const schema = match[2] ? this.unquoteIdentifier(match[1]) : undefined;

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
                const loc = this.findCreateStatementLocation(
                    sql,
                    tableName,
                    'table',
                    sourceViews.searchableSql
                );
                definitions.push({
                    type: 'table',
                    name: tableName,
                    schema,
                    columns,
                    filePath,
                    lineNumber: loc.lineNumber,
                    sql: this.extractStatementFromIndex(
                        sql,
                        loc.charIndex,
                        sourceViews.structuralSql
                    )
                });
            } else {
                // No parenthesis - might be CREATE TABLE AS SELECT
                // Use findCreateStatementLocation on ORIGINAL sql to get correct line number and char index
                const loc = this.findCreateStatementLocation(
                    sql,
                    tableName,
                    'table',
                    sourceViews.searchableSql
                );
                definitions.push({
                    type: 'table',
                    name: tableName,
                    schema,
                    columns: [],
                    filePath,
                    lineNumber: loc.lineNumber,
                    sql: this.extractStatementFromIndex(
                        sql,
                        loc.charIndex,
                        sourceViews.structuralSql
                    )
                });
            }
        }

        // CREATE VIEW pattern
        const viewRegex = this.createHeaderRegex('view');
        while ((match = viewRegex.exec(sqlNoComments)) !== null) {
            const viewName = this.unquoteIdentifier(match[2] || match[1]);
            const schema = match[2] ? this.unquoteIdentifier(match[1]) : undefined;

            // Skip if view name is a SQL reserved word
            if (this.isReservedWord(viewName)) {
                continue;
            }

            // Use findCreateStatementLocation on ORIGINAL sql (not sqlNoComments) to get correct line number
            const loc = this.findCreateStatementLocation(
                sql,
                viewName,
                'view',
                sourceViews.searchableSql
            );
            definitions.push({
                type: 'view',
                name: viewName,
                schema,
                columns: [],
                filePath,
                lineNumber: loc.lineNumber,
                sql: this.extractStatementFromIndex(
                    sql,
                    loc.charIndex,
                    sourceViews.structuralSql
                )
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
                const fkMatch = new RegExp(
                    `FOREIGN\\s+KEY\\s*\\(([^)]+)\\)\\s*REFERENCES\\s+` +
                    `(${SQL_IDENTIFIER_PATTERN})(?:\\s*\\.\\s*(${SQL_IDENTIFIER_PATTERN}))?` +
                    `\\s*\\(([^)]+)\\)`,
                    'i'
                ).exec(trimmed);
                if (fkMatch) {
                    const columnList = this.splitColumnDefinitions(fkMatch[1])
                        .map(col => this.unquoteIdentifier(col));
                    const refSchema = fkMatch[3]
                        ? this.unquoteIdentifier(fkMatch[2])
                        : undefined;
                    const refTableName = this.unquoteIdentifier(fkMatch[3] || fkMatch[2]);
                    const refTable = refSchema ? `${refSchema}.${refTableName}` : refTableName;
                    const refColumns = this.splitColumnDefinitions(fkMatch[4])
                        .map(col => this.unquoteIdentifier(col));

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
            const colMatch = new RegExp(
                `^(${SQL_IDENTIFIER_PATTERN})\\s+(\\w+)(?:\\s*\\([^)]*\\))?([\\s\\S]*)$`,
                'i'
            ).exec(trimmed);
            if (colMatch) {
                const name = this.unquoteIdentifier(colMatch[1]);
                let dataType = colMatch[2];
                const rest = colMatch[3] || '';

                // Check for type with precision like VARCHAR(255) or DECIMAL(10,2)
                const typeWithPrecision = new RegExp(
                    `^${SQL_IDENTIFIER_PATTERN}\\s+(\\w+\\s*\\([^)]+\\))`,
                    'i'
                ).exec(trimmed);
                if (typeWithPrecision) {
                    dataType = typeWithPrecision[1].replace(/\s+/g, '');
                }

                // Check constraints in the rest
                const isPrimaryKey = /PRIMARY\s+KEY/i.test(rest);
                const isNotNull = /NOT\s+NULL/i.test(rest);
                const hasReferences = new RegExp(
                    `REFERENCES\\s+(${SQL_IDENTIFIER_PATTERN})` +
                    `(?:\\s*\\.\\s*(${SQL_IDENTIFIER_PATTERN}))?` +
                    `\\s*\\(\\s*(${SQL_IDENTIFIER_PATTERN})\\s*\\)`,
                    'i'
                ).exec(rest);

                const column: ColumnInfo = {
                    name,
                    dataType: dataType.toUpperCase(),
                    nullable: !isNotNull && !isPrimaryKey,
                    primaryKey: isPrimaryKey,
                    isComputed: /GENERATED\s+ALWAYS/i.test(rest)
                };

                if (hasReferences) {
                    const refSchema = hasReferences[2]
                        ? this.unquoteIdentifier(hasReferences[1])
                        : undefined;
                    const refTableName = this.unquoteIdentifier(
                        hasReferences[2] || hasReferences[1]
                    );
                    const refTable = refSchema ? `${refSchema}.${refTableName}` : refTableName;
                    column.foreignKey = {
                        referencedTable: refTable,
                        referencedColumn: this.unquoteIdentifier(hasReferences[3])
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
        let quote: "'" | '"' | '`' | ']' | null = null;

        while (i < sql.length && depth > 0) {
            const char = sql[i];
            if (quote) {
                const closing = quote === ']' ? ']' : quote;
                if (char === '\\' && quote !== ']' && i + 1 < sql.length) {
                    i += 2;
                    continue;
                }
                if (char === closing) {
                    if (i + 1 < sql.length && sql[i + 1] === closing) {
                        i += 2;
                        continue;
                    }
                    quote = null;
                }
                i++;
                continue;
            }

            if (char === "'" || char === '"' || char === '`') {
                quote = char;
                i++;
                continue;
            }
            if (char === '[') {
                quote = ']';
                i++;
                continue;
            }
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
        let quote: "'" | '"' | '`' | ']' | null = null;

        for (let i = 0; i < body.length; i++) {
            const char = body[i];
            if (quote) {
                current += char;
                const closing = quote === ']' ? ']' : quote;
                if (char === '\\' && quote !== ']' && i + 1 < body.length) {
                    current += body[++i];
                    continue;
                }
                if (char === closing) {
                    if (i + 1 < body.length && body[i + 1] === closing) {
                        current += body[++i];
                        continue;
                    }
                    quote = null;
                }
                continue;
            }

            if (char === "'" || char === '"' || char === '`') {
                quote = char;
                current += char;
            } else if (char === '[') {
                quote = ']';
                current += char;
            } else if (char === '(') {
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
     * Mask comments without changing the length or line structure of the SQL.
     * Quoted identifiers can be retained for definition matching or masked for
     * structural statement-boundary scans.
     */
    private maskSqlComments(
        sql: string,
        maskStrings = false,
        maskIdentifiers = false
    ): string {
        const masked = sql.split('');
        let i = 0;

        const blankRange = (start: number, end: number): void => {
            for (let j = start; j < end; j++) {
                if (masked[j] !== '\n' && masked[j] !== '\r') {
                    masked[j] = ' ';
                }
            }
        };

        while (i < sql.length) {
            const char = sql[i];

            if (char === '\n' || char === '\r') {
                i++;
                continue;
            }
            if (/\s/.test(char)) {
                i++;
                continue;
            }

            if (char === "'" || char === '"' || char === '`' || char === '[') {
                const start = i;
                const closing = char === '[' ? ']' : char;
                i++;
                while (i < sql.length) {
                    if (sql[i] === '\\' && closing !== ']' && i + 1 < sql.length) {
                        i += 2;
                        continue;
                    }
                    if (sql[i] === closing) {
                        if (i + 1 < sql.length && sql[i + 1] === closing) {
                            i += 2;
                            continue;
                        }
                        i++;
                        break;
                    }
                    i++;
                }
                if ((maskStrings && char === "'") || (maskIdentifiers && char !== "'")) {
                    blankRange(start, i);
                }
                continue;
            }

            if (char === '/' && sql[i + 1] === '*') {
                const start = i;
                let depth = 1;
                i += 2;
                while (i < sql.length && depth > 0) {
                    if (sql[i] === '/' && sql[i + 1] === '*') {
                        depth++;
                        i += 2;
                    } else if (sql[i] === '*' && sql[i + 1] === '/') {
                        depth--;
                        i += 2;
                    } else {
                        i++;
                    }
                }
                blankRange(start, i);
                continue;
            }

            const isDashComment = char === '-' && sql[i + 1] === '-';
            let isHashComment = false;
            if (char === '#') {
                const tempIdentifier = /^#?[A-Za-z0-9_][\w$@]*/.exec(sql.slice(i + 1));
                const prefix = masked.slice(0, i).join('');
                const followsTempTarget = /(?:\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE(?:\s+IF\s+NOT\s+EXISTS)?|\bINTO(?:\s+TEMP(?:ORARY)?(?:\s+TABLE)?)?)\s*$/i
                    .test(prefix);

                if (tempIdentifier && followsTempTarget) {
                    i += tempIdentifier[0].length + 1;
                    continue;
                }
                isHashComment = true;
            }
            if (isDashComment || isHashComment) {
                const start = i;
                while (i < sql.length && sql[i] !== '\n' && sql[i] !== '\r') {
                    i++;
                }
                blankRange(start, i);
                continue;
            }

            i++;
        }

        return masked.join('');
    }

    private createSqlSearchViews(sql: string): SqlSearchViews {
        return {
            searchableSql: this.maskSqlComments(sql, true),
            structuralSql: this.maskSqlComments(sql, true, true),
        };
    }

    private findCreateStatementIndex(
        searchableSql: string,
        identifier: string,
        type: 'table' | 'view'
    ): number | null {
        const re = this.createHeaderRegex(type);
        let match: RegExpExecArray | null;

        while ((match = re.exec(searchableSql)) !== null) {
            const matchedName = this.unquoteIdentifier(match[2] || match[1]);
            if (matchedName.toLowerCase() === identifier.toLowerCase()) {
                return match.index;
            }
        }

        return null;
    }

    /**
     * Find line number and character index where a table/view is defined.
     *
     * Matches against an offset-preserving masked copy so CREATE examples inside
     * line, hash, or nested block comments cannot win over a real definition.
     *
     * @param sql The original SQL content (with comments intact)
     * @param identifier The table/view name to find
     * @param type Whether to search for 'table' or 'view'
     * @returns Object with lineNumber (1-based) and charIndex (0-based) of the CREATE statement
     */
    private findCreateStatementLocation(
        sql: string,
        identifier: string,
        type: 'table' | 'view',
        searchableSql: string
    ): { lineNumber: number; charIndex: number } {
        const charIndex = this.findCreateStatementIndex(searchableSql, identifier, type);
        if (charIndex !== null) {
            return {
                lineNumber: this.getLineNumberAtIndex(sql, charIndex),
                charIndex,
            };
        }

        if (type === 'table') {
            const selectIntoLocation = this.findSelectIntoStatementLocation(sql, identifier);
            if (selectIntoLocation) {
                return selectIntoLocation;
            }
        }

        // Fallback: return line 1 if not found (should rarely happen)
        return { lineNumber: 1, charIndex: 0 };
    }

    private findLineNumber(
        sql: string,
        identifier: string,
        type: 'table' | 'view',
        searchableSql: string
    ): number {
        return this.findCreateStatementLocation(
            sql,
            identifier,
            type,
            searchableSql
        ).lineNumber;
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
    private extractStatementSql(
        sql: string,
        name: string,
        type: 'table' | 'view',
        sourceViews: SqlSearchViews
    ): string {
        const charIndex = this.findCreateStatementIndex(
            sourceViews.searchableSql,
            name,
            type
        );
        if (charIndex !== null) {
            return this.extractStatementFromIndex(
                sql,
                charIndex,
                sourceViews.structuralSql,
                true
            );
        }

        if (type === 'table') {
            const selectIntoLocation = this.findSelectIntoStatementLocation(sql, name);
            if (selectIntoLocation) {
                return this.extractStatementFromIndex(
                    sql,
                    selectIntoLocation.charIndex,
                    sourceViews.structuralSql
                );
            }
        }

        return '';
    }

    private findSelectIntoStatementLocation(
        sql: string,
        identifier: string
    ): { lineNumber: number; charIndex: number } | null {
        const escaped = escapeRegex(identifier);
        const intoRegex = new RegExp(
            `\\bINTO\\s+(?:TEMP(?:ORARY)?(?:\\s+TABLE)?\\s+)?(?:\\w+\\.)?["'\`]?${escaped}["'\`]?`,
            'gi'
        );

        let match: RegExpExecArray | null;
        while ((match = intoRegex.exec(sql)) !== null) {
            const statementStart = sql.lastIndexOf(';', Math.max(0, match.index - 1)) + 1;
            const statementPrefix = stripSqlComments(sql.slice(statementStart, match.index)).toUpperCase();
            if (!/\bSELECT\b/.test(statementPrefix)) {
                continue;
            }

            const lineNumber = this.getLineNumberAtIndex(sql, statementStart);
            return { lineNumber, charIndex: statementStart };
        }

        return null;
    }

    /**
     * Extract statement starting from character index
     */
    private extractStatementFromIndex(
        sql: string,
        startIndex: number,
        structuralSql: string,
        includeTerminator = false
    ): string {
        let end = structuralSql.indexOf(';', startIndex);
        const createRegex = /(?<![\w$#@])CREATE(?=\s)/gi;
        createRegex.lastIndex = startIndex + 1;
        const nextCreate = createRegex.exec(structuralSql)?.index ?? -1;

        if (nextCreate >= 0 && (end < 0 || nextCreate < end)) {
            end = nextCreate;
        }

        if (end < 0) {end = sql.length;}

        const sliceEnd = includeTerminator && sql[end] === ';' ? end + 1 : end;
        return sql.substring(startIndex, sliceEnd).trim();
    }
}
