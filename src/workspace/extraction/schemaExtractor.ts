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
import { dialectSupportsBackslashEscapes, dialectSupportsHashComments, escapeRegex, getDollarQuoteDelimiterAt, isPostgresJsonPathOperatorAt, maskSqlCommentsPreservingPositions, quotedStringAllowsBackslashEscapes, stripSqlComments, TextOffsetIndex, unwrapIdentifierValue } from '../../shared';
import { preprocessSqlForWorkspaceParsing } from '../parserConfig';
import { getIdentifierSemantics } from '../identifiers';
import { SCHEMA_SQL_RESERVED_WORDS } from './constants';

const SQL_IDENTIFIER_PATTERN =
    '(?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\\[(?:[^\\]]|\\]\\])*\\]|[\\w$#@]+)';

interface SqlSearchViews {
    searchableSql: string;
    structuralSql: string;
}

interface IdentifierMetadata {
    nameQuoted: boolean;
    schemaQuoted: boolean;
    catalogQuoted: boolean;
}

interface QualifiedIdentifierParts {
    name: string;
    schema?: string;
    catalog?: string;
    rawName: string;
    rawSchema?: string;
    rawCatalog?: string;
}

interface HeaderMatch {
    index: number;
    parts: QualifiedIdentifierParts;
}

type DefinitionType = 'table' | 'view';

/**
 * Extracts schema definitions (CREATE TABLE/VIEW) from SQL
 */
export class SchemaExtractor {
    private parser: Parser;
    private options: ExtractionOptions;
    /**
     * Per-extraction lookup caches. Every definition asks for its header
     * match, statement index, and line number; recomputing those from the
     * start of the file made large schema dumps cubic. Cleared after each
     * extraction so file text is not retained between calls.
     */
    private readonly offsets = new TextOffsetIndex();
    /**
     * Whether `\` escapes inside quotes for the dialect being extracted. In
     * PostgreSQL, SQL Server, Oracle, and Teradata `'\'` is a complete literal.
     */
    private backslashEscapes = true;
    /** Whether `#` starts a line comment (MySQL, MariaDB, BigQuery) for this extraction. */
    private hashComments = true;
    private dollarQuotes = true;
    private nestedBlockComments = true;
    private readonly headerMatchCache: Record<DefinitionType, Map<string, HeaderMatch[]>> = {
        table: new Map(),
        view: new Map(),
    };
    private readonly headerMatchesByStatementCache: Record<DefinitionType, Map<string, Map<number, HeaderMatch[]>>> = {
        table: new Map(),
        view: new Map(),
    };
    private readonly firstHeaderIndexByNameCache: Record<DefinitionType, Map<string, Map<string, number>>> = {
        table: new Map(),
        view: new Map(),
    };

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
        return this.extractDefinitionsWithStatus(sql, filePath, dialect).definitions;
    }

    /**
     * Extract definitions and report when the primary AST parser had to fall
     * back to the less-complete regex path. Status is returned per invocation
     * so concurrent workspace scans cannot leak warnings between files.
     */
    extractDefinitionsWithStatus(
        sql: string,
        filePath: string,
        dialect: SqlDialect = this.options.dialect
    ): { definitions: SchemaDefinition[]; warnings: string[] } {
        try {
            return this.extractDefinitionsUncached(sql, filePath, dialect);
        } finally {
            this.clearLookupCaches();
        }
    }

    private clearLookupCaches(): void {
        this.offsets.clear();
        for (const type of ['table', 'view'] as const) {
            this.headerMatchCache[type].clear();
            this.headerMatchesByStatementCache[type].clear();
            this.firstHeaderIndexByNameCache[type].clear();
        }
    }

    private extractDefinitionsUncached(
        sql: string,
        filePath: string,
        dialect: SqlDialect
    ): { definitions: SchemaDefinition[]; warnings: string[] } {
        const definitions: SchemaDefinition[] = [];
        const warnings: string[] = [];
        this.backslashEscapes = dialectSupportsBackslashEscapes(dialect);
        this.hashComments = dialectSupportsHashComments(dialect);
        this.dollarQuotes = dialect !== 'MySQL' && dialect !== 'MariaDB';
        this.nestedBlockComments = dialect !== 'MySQL' && dialect !== 'MariaDB';
        const { sql: normalizedSql } = preprocessSqlForWorkspaceParsing(sql, dialect);
        const sourceViews = this.createSqlSearchViews(sql);
        const normalizedViews = normalizedSql === sql
            ? sourceViews
            : this.createSqlSearchViews(normalizedSql);

        try {
            const dbDialect = this.mapDialect(dialect);
            const statementStarts = [0];
            for (let index = 0; index < normalizedViews.structuralSql.length; index++) {
                if (normalizedViews.structuralSql[index] === ';') {
                    statementStarts.push(index + 1);
                }
            }

            for (let statementIndex = 0; statementIndex < statementStarts.length; statementIndex++) {
                const start = statementStarts[statementIndex];
                const end = statementStarts[statementIndex + 1] ?? normalizedSql.length;
                const structuralStatement = normalizedViews.structuralSql.slice(start, end).replace(/;\s*$/, '');
                if (!structuralStatement.trim()) {continue;}

                const ast = this.parser.astify(normalizedSql.slice(start, end), { database: dbDialect });
                const statements = Array.isArray(ast) ? ast : [ast];
                for (const stmt of statements) {
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
            }
        } catch (error) {
            // Fallback to regex-based extraction for unsupported dialects or parse errors
            warnings.push(this.formatParserWarning('Schema', error));
            definitions.length = 0;
            definitions.push(...this.extractWithRegex(normalizedSql, filePath, normalizedViews));
        }

        // SELECT ... INTO is a table-producing statement in SQL Server,
        // PostgreSQL/Redshift, and compatible engines. Some parser dialects
        // reject it while others expose an `into` AST shape that the CREATE-only
        // dispatch above does not visit, so scan the original offset-preserving
        // SQL view and merge the result with any preprocessed Redshift CTAS.
        for (const definition of this.extractSelectIntoDefinitions(sql, filePath, sourceViews, dialect)) {
            const alreadyExtracted = definitions.some(existing =>
                existing.statementIndex === definition.statementIndex
                && existing.name.toLowerCase() === definition.name.toLowerCase()
                && (existing.schema || '').toLowerCase() === (definition.schema || '').toLowerCase()
                && (existing.catalog || '').toLowerCase() === (definition.catalog || '').toLowerCase()
            );
            if (!alreadyExtracted) {
                definitions.push(definition);
            }
        }

        const identifierSemantics = getIdentifierSemantics(dialect);
        for (const definition of definitions) {
            Object.assign(definition, identifierSemantics);
            const quoteFlags = this.getDeclaredColumnQuoteFlags(definition);
            for (const column of definition.columns) {
                column.name = this.unquoteIdentifier(column.name);
                const exactFlag = quoteFlags.get(column.name);
                const foldedFlag = exactFlag === undefined
                    ? [...quoteFlags.entries()].find(([name]) => name.toLowerCase() === column.name.toLowerCase())?.[1]
                    : undefined;
                column.nameQuoted = exactFlag ?? foldedFlag ?? column.nameQuoted ?? false;
                Object.assign(column, identifierSemantics);
            }
        }

        return { definitions, warnings };
    }

    private formatParserWarning(scope: string, error: unknown): string {
        const message = error instanceof Error ? error.message : String(error || 'Unknown parser error');
        const compactMessage = message.replace(/\s+/g, ' ').trim().slice(0, 500);
        return `${scope} parser failed; regex fallback used: ${compactMessage || 'Unknown parser error'}`;
    }

    /** Recover delimiter metadata that node-sql-parser omits from column ASTs. */
    private getDeclaredColumnQuoteFlags(definition: SchemaDefinition): Map<string, boolean> {
        const result = new Map<string, boolean>();
        if (!definition.sql || definition.columns.length === 0) {return result;}

        const searchableSql = maskSqlCommentsPreservingPositions(definition.sql, {
            backslashEscapes: this.backslashEscapes,
            hashComments: this.hashComments,
            dollarQuotes: this.dollarQuotes,
            nestedBlockComments: this.nestedBlockComments,
        });
        const header = this.createHeaderRegex(definition.type).exec(searchableSql);
        if (!header) {return result;}
        const openingIndex = searchableSql.indexOf('(', header.index + header[0].length);
        if (openingIndex < 0) {return result;}

        if (definition.type === 'view') {
            const asIndex = /\bAS\b/i.exec(searchableSql.slice(header.index + header[0].length))?.index;
            if (asIndex !== undefined && openingIndex >= header.index + header[0].length + asIndex) {
                return result;
            }
        }

        const body = this.extractBalancedParens(definition.sql, openingIndex + 1);
        for (const part of this.splitColumnDefinitions(body)) {
            const trimmed = part.trim();
            if (!trimmed || (definition.type === 'table' &&
                /^(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(trimmed))) {
                continue;
            }
            const match = new RegExp(`^(${SQL_IDENTIFIER_PATTERN})(?:\\s|$)`).exec(trimmed);
            if (!match) {continue;}
            result.set(this.unquoteIdentifier(match[1]), this.isQuotedIdentifier(match[1]));
        }
        return result;
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
            const astIdentifier = this.extractTableName(stmt);
            const header = this.findDefinitionHeader(sourceViews, 'table', statementIndex, astIdentifier.name);
            const { name: tableName, schema, catalog } = header?.parts || astIdentifier;
            const columns = this.extractColumns(stmt);
            const identifierMetadata = this.getIdentifierMetadata(header);

            return {
                type: 'table',
                name: tableName,
                schema,
                catalog,
                ...identifierMetadata,
                statementIndex,
                columns,
                filePath,
                lineNumber: header
                    ? this.getLineNumberAtIndex(originalSql, header.index)
                    : this.findLineNumber(originalSql, tableName, 'table', sourceViews.searchableSql),
                sql: header
                    ? this.extractStatementFromIndex(originalSql, header.index, sourceViews.structuralSql, true)
                    : this.extractStatementSql(originalSql, tableName, 'table', sourceViews)
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`CREATE TABLE extraction failed: ${message}`);
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
            const astIdentifier = this.extractTableName(stmt);
            const header = this.findDefinitionHeader(sourceViews, 'view', statementIndex, astIdentifier.name);
            const { name: viewName, schema, catalog } = header?.parts || astIdentifier;
            const columns = this.extractViewColumns(stmt);
            const identifierMetadata = this.getIdentifierMetadata(header);

            return {
                type: 'view',
                name: viewName,
                schema,
                catalog,
                ...identifierMetadata,
                statementIndex,
                columns,
                filePath,
                lineNumber: header
                    ? this.getLineNumberAtIndex(originalSql, header.index)
                    : this.findLineNumber(originalSql, viewName, 'view', sourceViews.searchableSql),
                sql: header
                    ? this.extractStatementFromIndex(originalSql, header.index, sourceViews.structuralSql, true)
                    : this.extractStatementSql(originalSql, viewName, 'view', sourceViews)
                // Note: sourceQuery will be populated by lineage builder
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`CREATE VIEW extraction failed: ${message}`);
        }
    }

    /**
     * Extract table/view name from AST
     */
    private extractTableName(stmt: any): { name: string; schema?: string; catalog?: string } {
        let name = 'unknown';
        let schema: string | undefined;
        let catalog: string | undefined;

        const qualifiers = (item: any): { schema?: string; catalog?: string } => item?.schema
            ? { schema: item.schema, catalog: item.db || undefined }
            : { schema: item?.db || undefined };

        if (stmt.view) {
            if (Array.isArray(stmt.view) && stmt.view.length > 0) {
                name = stmt.view[0].view || stmt.view[0].table || stmt.view[0].name || 'unknown';
                ({ schema, catalog } = qualifiers(stmt.view[0]));
                return { name, schema, catalog };
            }
            if (typeof stmt.view === 'object') {
                name = stmt.view.view || stmt.view.table || stmt.view.name || 'unknown';
                ({ schema, catalog } = qualifiers(stmt.view));
                return { name, schema, catalog };
            }
            if (typeof stmt.view === 'string') {
                return { name: stmt.view };
            }
        }

        if (stmt.table) {
            if (Array.isArray(stmt.table) && stmt.table.length > 0) {
                name = stmt.table[0].table || stmt.table[0].name || 'unknown';
                ({ schema, catalog } = qualifiers(stmt.table[0]));
            } else if (typeof stmt.table === 'object') {
                name = stmt.table.table || stmt.table.name || 'unknown';
                ({ schema, catalog } = qualifiers(stmt.table));
            } else if (typeof stmt.table === 'string') {
                name = stmt.table;
            }
        }

        return { name, schema, catalog };
    }

    /**
     * Extract columns from CREATE TABLE statement
     */
    private extractColumns(stmt: any): ColumnInfo[] {
        const columns: ColumnInfo[] = [];
        const tableForeignKeys = new Map<string, ForeignKeyRef>();
        const createDefinitions = stmt.create_definitions || stmt.columns || [];

        for (const colDef of createDefinitions) {
            if (colDef.resource === 'column' || colDef.column) {
                const column = this.parseColumnDefinition(colDef);
                if (column) {columns.push(column);}
            } else if (colDef.resource === 'constraint'
                && String(colDef.constraint_type || '').toUpperCase() === 'FOREIGN KEY') {
                const localColumns = Array.isArray(colDef.definition)
                    ? colDef.definition
                    : [colDef.definition];
                localColumns.forEach((localColumn: any, index: number) => {
                    const localName = unwrapIdentifierValue(localColumn?.column)
                        || unwrapIdentifierValue(localColumn);
                    const foreignKey = this.parseAstForeignKey(colDef.reference_definition, index);
                    if (localName && foreignKey) {
                        tableForeignKeys.set(localName.toLowerCase(), foreignKey);
                    }
                });
            }
        }

        for (const column of columns) {
            if (!column.foreignKey) {
                column.foreignKey = tableForeignKeys.get(column.name.toLowerCase());
            }
        }

        return columns;
    }

    private parseAstForeignKey(reference: any, columnIndex: number = 0): ForeignKeyRef | undefined {
        if (!reference) {return undefined;}
        const tableEntry = Array.isArray(reference.table) ? reference.table[0] : reference.table;
        const tableName = unwrapIdentifierValue(tableEntry?.table)
            || unwrapIdentifierValue(tableEntry?.name)
            || unwrapIdentifierValue(tableEntry);
        if (!tableName) {return undefined;}

        const schema = unwrapIdentifierValue(tableEntry?.db)
            || unwrapIdentifierValue(tableEntry?.schema);
        const referencedTable = schema ? `${schema}.${tableName}` : tableName;
        const definitions = Array.isArray(reference.definition)
            ? reference.definition
            : Array.isArray(reference.columns)
                ? reference.columns
                : [reference.definition ?? reference.column];
        const referencedDefinition = definitions[columnIndex] ?? definitions[0];
        const referencedColumn = unwrapIdentifierValue(referencedDefinition?.column)
            || unwrapIdentifierValue(referencedDefinition);
        if (!referencedColumn) {return undefined;}

        return { referencedTable, referencedColumn };
    }

    /**
     * Extract columns from CREATE VIEW statement
     */
    private extractViewColumns(stmt: any): ColumnInfo[] {
        const columns: ColumnInfo[] = [];

        // Views may have explicit column list
        if (stmt.columns && Array.isArray(stmt.columns)) {
            for (const col of stmt.columns) {
                const colName = unwrapIdentifierValue(col)
                    || unwrapIdentifierValue(col?.column)
                    || unwrapIdentifierValue(col?.name);
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
            const ref = colDef.reference_definition || colDef.reference || colDef.references;
            const foreignKey: ForeignKeyRef | undefined = this.parseAstForeignKey(ref);

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

    private isQuotedIdentifier(identifier: string | undefined): boolean {
        if (!identifier) {return false;}
        const trimmed = identifier.trim();
        return (trimmed.startsWith('"') && trimmed.endsWith('"'))
            || (trimmed.startsWith('`') && trimmed.endsWith('`'))
            || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    }

    private getIdentifierMetadata(header: HeaderMatch | null): IdentifierMetadata {
        if (!header) {
            return { nameQuoted: false, schemaQuoted: false, catalogQuoted: false };
        }
        const { parts } = header;
        return {
            nameQuoted: this.isQuotedIdentifier(parts.rawName),
            schemaQuoted: this.isQuotedIdentifier(parts.rawSchema),
            catalogQuoted: this.isQuotedIdentifier(parts.rawCatalog),
        };
    }

    /**
     * Statement index for a character offset. Counts against structuralSql so
     * semicolons inside string literals and quoted or bracketed identifiers
     * cannot inflate the count.
     */
    private getStatementIndexAt(structuralSql: string, charIndex: number): number {
        return this.offsets.semicolonSegmentAt(structuralSql, charIndex);
    }

    /**
     * The CREATE header of the definition parsed from statement
     * `statementIndex`. When a statement holds several headers, the one whose
     * name matches the AST wins; otherwise the first.
     */
    private findDefinitionHeader(
        sourceViews: SqlSearchViews,
        type: 'table' | 'view',
        statementIndex: number,
        astName: string
    ): HeaderMatch | null {
        const headers = this.getHeaderMatchesByStatement(sourceViews, type).get(statementIndex);
        if (!headers || headers.length === 0) {return null;}
        const astKey = astName.toLowerCase();
        return headers.find(header => header.parts.name.toLowerCase() === astKey) ?? headers[0];
    }

    /** All CREATE TABLE/VIEW header matches in `text`, in source order. */
    private getHeaderMatches(text: string, type: DefinitionType): HeaderMatch[] {
        const cached = this.headerMatchCache[type].get(text);
        if (cached) {return cached;}

        const matches: HeaderMatch[] = [];
        const regex = this.createHeaderRegex(type);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            matches.push({ index: match.index, parts: this.getQualifiedIdentifierParts(match) });
        }
        this.headerMatchCache[type].set(text, matches);
        return matches;
    }

    /**
     * Header matches grouped by the `;`-delimited statement they start in.
     * Headers are matched in `searchableSql`, which keeps quoted identifiers
     * (`structuralSql` blanks them, so `CREATE VIEW "v" AS` would capture
     * `AS`), while statements are counted in `structuralSql` so semicolons
     * inside quoted identifiers cannot shift the index. Both views preserve
     * offsets, so a match index is valid in either.
     */
    private getHeaderMatchesByStatement(sourceViews: SqlSearchViews, type: DefinitionType): Map<number, HeaderMatch[]> {
        const cached = this.headerMatchesByStatementCache[type].get(sourceViews.searchableSql);
        if (cached) {return cached;}

        const byStatement = new Map<number, HeaderMatch[]>();
        for (const match of this.getHeaderMatches(sourceViews.searchableSql, type)) {
            const statementIndex = this.getStatementIndexAt(sourceViews.structuralSql, match.index);
            const matches = byStatement.get(statementIndex);
            if (matches) {
                matches.push(match);
            } else {
                byStatement.set(statementIndex, [match]);
            }
        }
        this.headerMatchesByStatementCache[type].set(sourceViews.searchableSql, byStatement);
        return byStatement;
    }

    private getQualifiedIdentifierParts(match: RegExpExecArray): QualifiedIdentifierParts {
        const rawCatalog = match[3] ? match[1] : undefined;
        const rawSchema = match[3] ? match[2] : (match[2] ? match[1] : undefined);
        const rawName = match[3] || match[2] || match[1];
        return {
            rawName,
            rawSchema,
            rawCatalog,
            name: this.unquoteIdentifier(rawName),
            schema: rawSchema ? this.unquoteIdentifier(rawSchema) : undefined,
            catalog: rawCatalog ? this.unquoteIdentifier(rawCatalog) : undefined,
        };
    }

    private createHeaderRegex(type: 'table' | 'view'): RegExp {
        const keyword = type === 'table' ? 'TABLE' : 'VIEW';
        return new RegExp(
            `(?<![\\w$#@])CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+)?` +
            `(?:MATERIALIZED\\s+)?${keyword}\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?` +
            `(${SQL_IDENTIFIER_PATTERN})(?:\\s*\\.\\s*(${SQL_IDENTIFIER_PATTERN})?)?`
                + `(?:\\s*\\.\\s*(${SQL_IDENTIFIER_PATTERN}))?`,
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
            const parts = this.getQualifiedIdentifierParts(match);
            const tableName = parts.name;
            const schema = parts.schema;
            const catalog = parts.catalog;
            const nameQuoted = this.isQuotedIdentifier(parts.rawName);
            const schemaQuoted = this.isQuotedIdentifier(parts.rawSchema);
            const catalogQuoted = this.isQuotedIdentifier(parts.rawCatalog);

            // Skip if table name is a SQL reserved word
            if (this.isReservedWord(tableName) && !nameQuoted) {
                continue;
            }

            const startIndex = match.index + match[0].length;
            const statementIndex = this.getStatementIndexAt(sourceViews.structuralSql, match.index);

            // Restrict body detection to this CREATE statement. Searching the
            // whole remaining file can assign a later table's columns to CTAS.
            const afterHeader = this.extractStatementFromIndex(
                sqlNoComments,
                startIndex,
                sourceViews.structuralSql
            );
            const parenStart = afterHeader.indexOf('(');
            const asQueryIndex = /\bAS\s*(?:\(\s*)?(?:WITH|SELECT)\b/i.exec(afterHeader)?.index ?? -1;
            // Teradata preprocessing rewrites `CREATE TABLE x AS (SELECT ...)
            // WITH DATA` to `CREATE TABLE x (SELECT ...)`; that parenthesis
            // holds a query, not column definitions.
            const parenHoldsQuery = parenStart !== -1
                && /^\(\s*(?:WITH|SELECT)\b/i.test(afterHeader.slice(parenStart));
            const hasColumnBody = parenStart !== -1
                && !parenHoldsQuery
                && (asQueryIndex === -1 || parenStart < asQueryIndex);

            if (hasColumnBody) {
                // Find matching closing parenthesis
                const tableBody = this.extractBalancedParens(afterHeader, parenStart + 1);
                const columns = this.extractColumnsFromBody(tableBody);

                const loc = this.getHeaderLocation(sql, match.index);
                definitions.push({
                    type: 'table',
                    name: tableName,
                    schema,
                    catalog,
                    nameQuoted,
                    schemaQuoted,
                    catalogQuoted,
                    columns,
                    filePath,
                    statementIndex,
                    lineNumber: loc.lineNumber,
                    sql: this.extractStatementFromIndex(
                        sql,
                        loc.charIndex,
                        sourceViews.structuralSql
                    )
                });
            } else {
                // No parenthesis - might be CREATE TABLE AS SELECT
                const loc = this.getHeaderLocation(sql, match.index);
                definitions.push({
                    type: 'table',
                    name: tableName,
                    schema,
                    catalog,
                    nameQuoted,
                    schemaQuoted,
                    catalogQuoted,
                    columns: [],
                    filePath,
                    statementIndex,
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
            const parts = this.getQualifiedIdentifierParts(match);
            const viewName = parts.name;
            const schema = parts.schema;
            const catalog = parts.catalog;
            const nameQuoted = this.isQuotedIdentifier(parts.rawName);
            const schemaQuoted = this.isQuotedIdentifier(parts.rawSchema);
            const catalogQuoted = this.isQuotedIdentifier(parts.rawCatalog);

            // Skip if view name is a SQL reserved word
            if (this.isReservedWord(viewName) && !nameQuoted) {
                continue;
            }

            const loc = this.getHeaderLocation(sql, match.index);
            definitions.push({
                type: 'view',
                name: viewName,
                schema,
                catalog,
                nameQuoted,
                schemaQuoted,
                catalogQuoted,
                columns: [],
                filePath,
                statementIndex: this.getStatementIndexAt(sourceViews.structuralSql, match.index),
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

    private extractSelectIntoDefinitions(
        sql: string,
        filePath: string,
        sourceViews: SqlSearchViews,
        dialect: SqlDialect
    ): SchemaDefinition[] {
        if (!(['TransactSQL', 'PostgreSQL', 'Redshift'] as SqlDialect[]).includes(dialect)) {
            return [];
        }
        const definitions: SchemaDefinition[] = [];
        const intoRegex = new RegExp(
            `\\bINTO\\s+(?:(?:TEMP(?:ORARY)?|UNLOGGED)(?:\\s+TABLE)?\\s+|TABLE\\s+)?`
                + `(${SQL_IDENTIFIER_PATTERN})(?:\\s*\\.\\s*(${SQL_IDENTIFIER_PATTERN})?)?`
                + `(?:\\s*\\.\\s*(${SQL_IDENTIFIER_PATTERN}))?`,
            'gi'
        );
        let match: RegExpExecArray | null;

        while ((match = intoRegex.exec(sourceViews.searchableSql)) !== null) {
            const parts = this.getQualifiedIdentifierParts(match);
            const name = parts.name;
            if (/^(?:OUTFILE|DUMPFILE)$/i.test(name)
                || (name.startsWith('@') && !this.isQuotedIdentifier(parts.rawName))) {
                continue;
            }

            const statementStart = sourceViews.structuralSql.lastIndexOf(
                ';',
                Math.max(0, match.index - 1)
            ) + 1;
            if (!this.isTopLevelSelectInto(sourceViews.structuralSql, statementStart, match.index)) {
                continue;
            }

            let sqlStart = statementStart;
            while (sqlStart < sql.length && /\s/.test(sql[sqlStart])) {
                sqlStart++;
            }
            const statementIndex = this.getStatementIndexAt(sourceViews.structuralSql, statementStart);
            definitions.push({
                type: 'table',
                name,
                schema: parts.schema,
                catalog: parts.catalog,
                nameQuoted: this.isQuotedIdentifier(parts.rawName),
                schemaQuoted: this.isQuotedIdentifier(parts.rawSchema),
                catalogQuoted: this.isQuotedIdentifier(parts.rawCatalog),
                statementIndex,
                columns: [],
                filePath,
                lineNumber: this.getLineNumberAtIndex(sql, sqlStart),
                sql: this.extractStatementFromIndex(
                    sql,
                    sqlStart,
                    sourceViews.structuralSql,
                    true
                ),
            });
        }

        return definitions;
    }

    private isTopLevelSelectInto(structuralSql: string, start: number, intoIndex: number): boolean {
        const prefix = structuralSql.slice(start, intoIndex);
        let depth = 0;
        let lastTopLevelStatementKeyword = '';
        const tokenRegex = /\b(?:SELECT|WITH|INSERT|UPDATE|DELETE|MERGE|CREATE)\b|[()]/gi;
        let token: RegExpExecArray | null;
        while ((token = tokenRegex.exec(prefix)) !== null) {
            if (token[0] === '(') {
                depth++;
            } else if (token[0] === ')') {
                depth = Math.max(0, depth - 1);
            } else if (depth === 0 && token[0].toUpperCase() !== 'WITH') {
                lastTopLevelStatementKeyword = token[0].toUpperCase();
            }
        }
        return depth === 0 && lastTopLevelStatementKeyword === 'SELECT';
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
                    nameQuoted: this.isQuotedIdentifier(colMatch[1]),
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
                if (char === '\\' && quote !== ']' && this.backslashEscapes && i + 1 < sql.length) {
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
                if (char === '\\' && quote !== ']' && this.backslashEscapes && i + 1 < body.length) {
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

            if (maskStrings && this.dollarQuotes && char === '$') {
                const delimiter = getDollarQuoteDelimiterAt(sql, i);
                if (delimiter) {
                    const start = i;
                    const close = sql.indexOf(delimiter, i + delimiter.length);
                    i = close === -1 ? sql.length : close + delimiter.length;
                    blankRange(start, i);
                    continue;
                }
            }

            if (char === "'" || char === '"' || char === '`' || char === '[') {
                const start = i;
                const closing = char === '[' ? ']' : char;
                const escapesAllowed = closing !== ']'
                    && quotedStringAllowsBackslashEscapes(sql, i, this.backslashEscapes);
                i++;
                while (i < sql.length) {
                    if (escapesAllowed && sql[i] === '\\' && i + 1 < sql.length) {
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
                    if (this.nestedBlockComments && sql[i] === '/' && sql[i + 1] === '*') {
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
            if (char === '#' && this.hashComments && !isPostgresJsonPathOperatorAt(sql, i)) {
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
        let firstIndexByName = this.firstHeaderIndexByNameCache[type].get(searchableSql);
        if (!firstIndexByName) {
            firstIndexByName = new Map<string, number>();
            for (const match of this.getHeaderMatches(searchableSql, type)) {
                const key = match.parts.name.toLowerCase();
                if (!firstIndexByName.has(key)) {
                    firstIndexByName.set(key, match.index);
                }
            }
            this.firstHeaderIndexByNameCache[type].set(searchableSql, firstIndexByName);
        }

        return firstIndexByName.get(identifier.toLowerCase()) ?? null;
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

    /**
     * Location of a header matched in `sql`'s offset-preserving masked view.
     * Using the match itself (not a lookup by name) keeps same-name
     * definitions in different schemas at their own statements.
     */
    private getHeaderLocation(sql: string, charIndex: number): { lineNumber: number; charIndex: number } {
        return { lineNumber: this.getLineNumberAtIndex(sql, charIndex), charIndex };
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
        return this.offsets.lineNumberAt(sql, charIndex);
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
            const statementPrefix = stripSqlComments(sql.slice(statementStart, match.index), {
                dollarQuotes: this.dollarQuotes,
                nestedBlockComments: this.nestedBlockComments,
            }).toUpperCase();
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
