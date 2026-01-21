// Schema Extractor - Parse CREATE TABLE/VIEW statements

import { Parser } from 'node-sql-parser';
import {
    SchemaDefinition,
    ColumnInfo,
    ForeignKeyRef,
    SqlDialect,
    ExtractionOptions,
    DEFAULT_EXTRACTION_OPTIONS
} from './types';

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
            const ast = this.parser.astify(sql, { database: dbDialect });
            const statements = Array.isArray(ast) ? ast : [ast];

            for (const stmt of statements) {
                if (!stmt) continue;

                if (this.isCreateTable(stmt)) {
                    const def = this.parseCreateTable(stmt, filePath, sql);
                    if (def) definitions.push(def);
                } else if (this.isCreateView(stmt)) {
                    const def = this.parseCreateView(stmt, filePath, sql);
                    if (def) definitions.push(def);
                }
            }
        } catch (error) {
            // Fallback to regex-based extraction for unsupported dialects or parse errors
            console.log(`[Schema Extractor] AST parse failed, using regex fallback:`, error);
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
            'Trino': 'trino'
        };
        return dialectMap[dialect] || 'mysql';
    }

    /**
     * Check if statement is CREATE TABLE
     */
    private isCreateTable(stmt: any): boolean {
        if (!stmt || !stmt.type) return false;
        const type = stmt.type.toLowerCase();
        return type === 'create' && stmt.keyword?.toLowerCase() === 'table';
    }

    /**
     * Check if statement is CREATE VIEW
     */
    private isCreateView(stmt: any): boolean {
        if (!stmt || !stmt.type) return false;
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

        // Debug: Log the structure
        console.log(`[Schema Extractor] extractColumns: create_definitions=${stmt.create_definitions?.length}, columns=${stmt.columns?.length}, total=${createDefinitions.length}`);
        if (createDefinitions.length > 0) {
            console.log(`[Schema Extractor] First column def:`, JSON.stringify(createDefinitions[0], null, 2).substring(0, 500));
        }

        for (const colDef of createDefinitions) {
            if (colDef.resource === 'column' || colDef.column) {
                const column = this.parseColumnDefinition(colDef);
                if (column) columns.push(column);
            }
        }

        console.log(`[Schema Extractor] Extracted ${columns.length} columns`);
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
     * Regex-based fallback for extracting schema definitions
     */
    private extractWithRegex(sql: string, filePath: string): SchemaDefinition[] {
        const definitions: SchemaDefinition[] = [];
        const fileName = filePath.split('/').pop() || filePath;

        // CREATE TABLE pattern - capture table name and body
        // Use a simpler approach: find CREATE TABLE, then extract body separately
        const tableHeaderRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        let match;
        while ((match = tableHeaderRegex.exec(sql)) !== null) {
            const tableName = match[2];
            const startIndex = match.index + match[0].length;

            // Find the opening parenthesis
            const afterHeader = sql.substring(startIndex);
            const parenStart = afterHeader.indexOf('(');

            if (parenStart !== -1) {
                // Find matching closing parenthesis
                const bodyStart = startIndex + parenStart + 1;
                const tableBody = this.extractBalancedParens(sql, bodyStart);
                const columns = this.extractColumnsFromBody(tableBody);

                console.log(`[Schema Extractor Regex] Table ${tableName}: found ${columns.length} columns`);

                definitions.push({
                    type: 'table',
                    name: tableName,
                    schema: match[1],
                    columns,
                    filePath,
                    lineNumber: this.getLineNumberAtIndex(sql, match.index),
                    sql: this.extractStatementFromIndex(sql, match.index)
                });
            } else {
                // No parenthesis - might be CREATE TABLE AS SELECT
                console.log(`[Schema Extractor Regex] Table ${tableName}: no column definitions (CTAS?)`);
                definitions.push({
                    type: 'table',
                    name: tableName,
                    schema: match[1],
                    columns: [],
                    filePath,
                    lineNumber: this.getLineNumberAtIndex(sql, match.index),
                    sql: this.extractStatementFromIndex(sql, match.index)
                });
            }
        }

        // CREATE VIEW pattern
        const viewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        while ((match = viewRegex.exec(sql)) !== null) {
            definitions.push({
                type: 'view',
                name: match[2],
                schema: match[1],
                columns: [],
                filePath,
                lineNumber: this.getLineNumberAtIndex(sql, match.index),
                sql: this.extractStatementFromIndex(sql, match.index)
            });
        }

        return definitions;
    }

    /**
     * Extract columns from CREATE TABLE body using regex
     */
    private extractColumnsFromBody(body: string): ColumnInfo[] {
        const columns: ColumnInfo[] = [];

        // Split by comma, but be careful about nested parentheses
        const parts = this.splitColumnDefinitions(body);

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            // Skip constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, CONSTRAINT)
            if (/^\s*(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)/i.test(trimmed)) {
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
                const hasReferences = /REFERENCES\s+(\w+)\s*\((\w+)\)/i.exec(rest);

                const column: ColumnInfo = {
                    name,
                    dataType: dataType.toUpperCase(),
                    nullable: !isNotNull && !isPrimaryKey,
                    primaryKey: isPrimaryKey,
                    isComputed: /GENERATED\s+ALWAYS/i.test(rest)
                };

                if (hasReferences) {
                    column.foreignKey = {
                        referencedTable: hasReferences[1],
                        referencedColumn: hasReferences[2]
                    };
                }

                columns.push(column);
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
     * Find line number where a table/view is defined
     */
    private findLineNumber(sql: string, identifier: string, type: 'table' | 'view'): number {
        const lines = sql.split('\n');
        const keyword = type === 'table' ? 'TABLE' : 'VIEW';
        const regex = new RegExp(
            `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?(?:MATERIALIZED\\s+)?${keyword}`,
            'i'
        );

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (regex.test(line) && line.toLowerCase().includes(identifier.toLowerCase())) {
                return i + 1;
            }
        }

        // Fallback: find first occurrence of identifier
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(identifier.toLowerCase())) {
                return i + 1;
            }
        }

        return 1;
    }

    /**
     * Get line number at character index
     */
    private getLineNumberAtIndex(sql: string, charIndex: number): number {
        return sql.substring(0, charIndex).split('\n').length;
    }

    /**
     * Extract the full CREATE statement SQL
     */
    private extractStatementSql(sql: string, name: string, type: 'table' | 'view'): string {
        const keyword = type === 'table' ? 'TABLE' : 'VIEW';
        const regex = new RegExp(
            `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?(?:MATERIALIZED\\s+)?${keyword}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:\\w+\\.)?["'\`]?${name}["'\`]?[^;]*;?`,
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

        if (end < 0) end = sql.length;

        return sql.substring(startIndex, end).trim();
    }
}
