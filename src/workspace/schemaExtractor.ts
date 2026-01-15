// Schema Extractor - Parse CREATE TABLE/VIEW statements

import { Parser } from 'node-sql-parser';
import { SchemaDefinition, ColumnDefinition, ForeignKeyRef } from './types';
import { SqlDialect } from '../webview/types/parser';

/**
 * Extracts schema definitions (CREATE TABLE/VIEW) from SQL
 */
export class SchemaExtractor {
    private parser: Parser;

    constructor() {
        this.parser = new Parser();
    }

    /**
     * Extract all CREATE TABLE/VIEW definitions from SQL
     */
    extractDefinitions(sql: string, filePath: string, dialect: SqlDialect = 'MySQL'): SchemaDefinition[] {
        const definitions: SchemaDefinition[] = [];

        try {
            // Map dialect to parser database option
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
        return type === 'create' && (stmt.keyword?.toLowerCase() === 'view' || stmt.keyword?.toLowerCase() === 'materialized view');
    }

    /**
     * Parse CREATE TABLE statement
     */
    private parseCreateTable(stmt: any, filePath: string, originalSql: string): SchemaDefinition | null {
        try {
            // Extract table name - handle various AST structures
            let tableName = 'unknown';
            let schema: string | undefined;

            if (stmt.table) {
                if (Array.isArray(stmt.table) && stmt.table.length > 0) {
                    tableName = stmt.table[0].table || stmt.table[0].name || 'unknown';
                    schema = stmt.table[0].db || stmt.table[0].schema;
                } else if (typeof stmt.table === 'object') {
                    tableName = stmt.table.table || stmt.table.name || 'unknown';
                    schema = stmt.table.db || stmt.table.schema;
                } else if (typeof stmt.table === 'string') {
                    tableName = stmt.table;
                }
            }

            // Extract columns
            const columns: ColumnDefinition[] = [];
            const createDefinitions = stmt.create_definitions || stmt.columns || [];

            for (const colDef of createDefinitions) {
                if (colDef.resource === 'column' || colDef.column) {
                    const column = this.parseColumnDefinition(colDef);
                    if (column) columns.push(column);
                }
            }

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
    private parseCreateView(stmt: any, filePath: string, originalSql: string): SchemaDefinition | null {
        try {
            // Extract view name
            let viewName = 'unknown';
            let schema: string | undefined;

            if (stmt.table) {
                if (Array.isArray(stmt.table) && stmt.table.length > 0) {
                    viewName = stmt.table[0].table || stmt.table[0].name || 'unknown';
                    schema = stmt.table[0].db || stmt.table[0].schema;
                } else if (typeof stmt.table === 'object') {
                    viewName = stmt.table.table || stmt.table.name || 'unknown';
                    schema = stmt.table.db || stmt.table.schema;
                } else if (typeof stmt.table === 'string') {
                    viewName = stmt.table;
                }
            }

            // Views typically don't have explicit column definitions
            // They inherit from the SELECT statement
            const columns: ColumnDefinition[] = [];

            // Try to extract column names if specified
            if (stmt.columns && Array.isArray(stmt.columns)) {
                for (const col of stmt.columns) {
                    const colName = typeof col === 'string' ? col : col.column || col.name;
                    if (colName) {
                        columns.push({
                            name: colName,
                            dataType: 'derived',
                            nullable: true,
                            primaryKey: false
                        });
                    }
                }
            }

            return {
                type: 'view',
                name: viewName,
                schema,
                columns,
                filePath,
                lineNumber: this.findLineNumber(originalSql, viewName, 'view'),
                sql: this.extractStatementSql(originalSql, viewName, 'view')
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Parse column definition from AST
     */
    private parseColumnDefinition(colDef: any): ColumnDefinition | null {
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
                    // Add length/precision if present
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
            const primaryKey = colDef.primary_key === true || colDef.constraint?.type === 'primary key';

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
                foreignKey
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

        // CREATE TABLE pattern
        const tableRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?["'`]?(\w+)["'`]?/gi;
        let match;
        while ((match = tableRegex.exec(sql)) !== null) {
            definitions.push({
                type: 'table',
                name: match[2],
                schema: match[1],
                columns: [], // Regex can't reliably extract columns
                filePath,
                lineNumber: this.getLineNumberAtIndex(sql, match.index),
                sql: this.extractStatementFromIndex(sql, match.index)
            });
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
     * Find line number where a table/view is defined
     */
    private findLineNumber(sql: string, identifier: string, type: 'table' | 'view'): number {
        const lines = sql.split('\n');
        const keyword = type === 'table' ? 'TABLE' : 'VIEW';
        const regex = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?(?:MATERIALIZED\\s+)?${keyword}`, 'i');

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
        // Find the end of statement (semicolon or next CREATE)
        let end = sql.indexOf(';', startIndex);
        const nextCreate = sql.indexOf('CREATE', startIndex + 1);

        if (nextCreate > 0 && (end < 0 || nextCreate < end)) {
            end = nextCreate;
        }

        if (end < 0) end = sql.length;

        return sql.substring(startIndex, end).trim();
    }
}
