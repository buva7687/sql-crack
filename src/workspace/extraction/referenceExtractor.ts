// Reference Extractor - Extract table references from SQL queries

import { Parser } from 'node-sql-parser';
import {
    TableReference,
    ReferenceType,
    SqlDialect,
    AliasMap,
    ExtractionOptions,
    DEFAULT_EXTRACTION_OPTIONS,
    ColumnReference,
    ColumnUsageContext,
    ColumnInfo,
    QueryAnalysis,
    StatementType,
    Transformation
} from './types';
import { ColumnExtractor } from './columnExtractor';
import { TransformExtractor } from './transformExtractor';
import { escapeRegex, getDollarQuoteDelimiterAt, maskSqlCommentsPreservingPositions, unwrapIdentifierValue } from '../../shared';
import { preprocessSqlForWorkspaceParsing } from '../parserConfig';
import { getIdentifierSemantics, getQualifiedKey } from '../identifiers';
import { REFERENCE_SQL_RESERVED_WORDS, TERADATA_RESERVED_WORDS } from './constants';
import type {
    AstStatement,
    AstTableRef,
    AstColumn,
    AstExpression,
    AstTableIdentifier,
    AstCTE,
    AstSelectStatement
} from './astTypes';

interface TableLineLookup {
    sql: string;
    contextLineByTable: Map<string, Map<number, number>>;
    fallbackLineByTable: Map<string, Map<number, number>>;
}

interface TableReferenceLocation {
    lineNumber: number;
    charIndex: number;
    nameQuoted: boolean;
    schemaQuoted: boolean;
    catalogQuoted: boolean;
}

const REFERENCE_SQL_IDENTIFIER_PATTERN =
    '(?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\\[(?:[^\\]]|\\]\\])*\\]|[#A-Za-z_@$][#A-Za-z0-9_$@]*)';

/**
 * Extracts table references from SQL queries (SELECT, INSERT, UPDATE, DELETE)
 */
export class ReferenceExtractor {
    private parser: Parser;
    private options: ExtractionOptions;
    private columnExtractor: ColumnExtractor;
    private transformExtractor: TransformExtractor;
    private _activeDialect: SqlDialect = 'MySQL'; // Per-call dialect for reserved word scoping
    private tableLineLookup: TableLineLookup | null = null;

    constructor(options: Partial<ExtractionOptions> = {}) {
        this.parser = new Parser();
        this.options = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
        this.columnExtractor = new ColumnExtractor();
        this.transformExtractor = new TransformExtractor();
    }

    /** Extract CTE name string from AST CTE name node (may be string or { value: string }) */
    private getCTENameString(name: AstCTE['name']): string | undefined {
        if (typeof name === 'string') {return this.unquoteIdentifier(name);}
        if (typeof name === 'object' && name !== null) {return unwrapIdentifierValue(name);}
        return undefined;
    }

    private isQuotedAstIdentifier(value: unknown): boolean {
        if (typeof value === 'string') {return this.isQuotedIdentifier(value);}
        if (!value || typeof value !== 'object') {return false;}
        const type = 'type' in value ? String(value.type).toLowerCase() : '';
        return type.includes('quote') || type.includes('backtick') || type === 'bracket_identifier';
    }

    private getIdentifierIdentity(value: string, quoted = false): string {
        const semantics = getIdentifierSemantics(this._activeDialect);
        return getQualifiedKey(value, undefined, { ...semantics, nameQuoted: quoted });
    }

    private getCTEIdentity(name: AstCTE['name']): string | undefined {
        const value = this.getCTENameString(name);
        return value ? this.getIdentifierIdentity(value, this.isQuotedAstIdentifier(name)) : undefined;
    }

    private addCTEName(cteNames: Set<string>, name: AstCTE['name']): void {
        const identity = this.getCTEIdentity(name);
        if (identity) {cteNames.add(identity);}
    }

    private isCTEReference(cteNames: Set<string>, reference: TableReference): boolean {
        return cteNames.has(getQualifiedKey(reference.tableName, reference.schema, {
            ...reference,
            ...getIdentifierSemantics(this._activeDialect),
        }));
    }

    private getWithClauses(stmt: AstStatement): AstCTE[] {
        if (!stmt?.with) {
            return [];
        }
        return Array.isArray(stmt.with) ? stmt.with : [stmt.with];
    }

    private getCteStatement(cte: AstCTE): AstStatement | null {
        return (cte.stmt?.ast || cte.stmt || cte.ast
            || cte.definition?.ast || cte.definition || null) as AstStatement | null;
    }

    /**
     * Check if a name is a SQL reserved word (dialect-scoped for Teradata-only keywords)
     */
    private isReservedWord(name: string): boolean {
        const lower = name.toLowerCase();
        if (REFERENCE_SQL_RESERVED_WORDS.has(lower)) { return true; }
        if (this._activeDialect === 'Teradata' && TERADATA_RESERVED_WORDS.has(lower)) { return true; }
        return false;
    }


    /**
     * Extract all table references from SQL
     */
    extractReferences(
        sql: string,
        filePath: string,
        dialect: SqlDialect = this.options.dialect
    ): TableReference[] {
        return this.extractReferencesWithStatus(sql, filePath, dialect).references;
    }

    /**
     * Extract references and expose primary-parser fallback use per invocation.
     * Returning status avoids shared mutable warning state during concurrent scans.
     */
    extractReferencesWithStatus(
        sql: string,
        filePath: string,
        dialect: SqlDialect = this.options.dialect
    ): { references: TableReference[]; warnings: string[]; queries: QueryAnalysis[] } {
        this._activeDialect = dialect;
        this.tableLineLookup = null;
        const references: TableReference[] = [];
        const warnings: string[] = [];
        let parsedStatements: AstStatement[] = [];
        const { sql: normalizedSql } = preprocessSqlForWorkspaceParsing(sql, dialect);

        // Pre-collect CTE names via regex BEFORE attempting AST parse.
        // This ensures the catch block (regex fallback) has CTE names available
        // even when the AST parser fails on complex multi-statement files.
        const sqlNoComments = this.maskSqlStringLiterals(maskSqlCommentsPreservingPositions(normalizedSql));
        const reservedWords = new Set(['select', 'from', 'where', 'join', 'inner', 'left', 'right', 'outer', 'on', 'as', 'with', 'recursive']);
        const statementBoundaries = this.getStatementBoundaries(sqlNoComments);
        const getStatementIndex = (charIndex: number): number => this.getStatementIndex(statementBoundaries, charIndex);
        const scopedCteNames = new Map<number, Set<string>>();
        const cteBodyLineRanges = new Map<string, Array<{ startLine: number; endLine: number }>>();
        const addScopedCteName = (rawName: string, charIndex: number): void => {
            const statementIndex = getStatementIndex(charIndex);
            const names = scopedCteNames.get(statementIndex) || new Set<string>();
            names.add(this.getIdentifierIdentity(
                this.unquoteIdentifier(rawName),
                this.isQuotedIdentifier(rawName)
            ));
            scopedCteNames.set(statementIndex, names);
        };
        const scopedCteKey = (statementIndex: number, identity: string): string => `${statementIndex}|${identity}`;

        const ctePattern = new RegExp(
            `WITH\\s+(?:RECURSIVE\\s+)?(${REFERENCE_SQL_IDENTIFIER_PATTERN})\\s+AS\\s*\\(`,
            'gi'
        );
        let match;
        while ((match = ctePattern.exec(sqlNoComments)) !== null) {
            const rawCteName = match[1];
            const cteName = this.unquoteIdentifier(rawCteName);
            if (cteName && !reservedWords.has(cteName.toLowerCase())) {
                const normalizedName = this.getIdentifierIdentity(cteName, this.isQuotedIdentifier(rawCteName));
                const statementIndex = getStatementIndex(match.index);
                addScopedCteName(rawCteName, match.index);
                const openParenIndex = match.index + match[0].length - 1;
                const closeParenIndex = this.findMatchingParen(sqlNoComments, openParenIndex);
                if (closeParenIndex !== -1) {
                    this.addCteBodyLineRange(cteBodyLineRanges, sqlNoComments, scopedCteKey(statementIndex, normalizedName), openParenIndex, closeParenIndex);
                }
            }
        }

        const multiCtePattern = new RegExp(
            `,\\s*(${REFERENCE_SQL_IDENTIFIER_PATTERN})\\s+AS\\s*\\(`,
            'gi'
        );
        while ((match = multiCtePattern.exec(sqlNoComments)) !== null) {
            const rawCteName = match[1];
            const cteName = this.unquoteIdentifier(rawCteName);
            if (cteName && !reservedWords.has(cteName.toLowerCase())) {
                const normalizedName = this.getIdentifierIdentity(cteName, this.isQuotedIdentifier(rawCteName));
                const statementIndex = getStatementIndex(match.index);
                addScopedCteName(rawCteName, match.index);
                const openParenIndex = match.index + match[0].length - 1;
                const closeParenIndex = this.findMatchingParen(sqlNoComments, openParenIndex);
                if (closeParenIndex !== -1) {
                    this.addCteBodyLineRange(cteBodyLineRanges, sqlNoComments, scopedCteKey(statementIndex, normalizedName), openParenIndex, closeParenIndex);
                }
            }
        }

        const subqueryAliasPattern = /\)\s+AS\s+(\w+)(?=\s|$|,|\n|WHERE|JOIN|ON)/gi;
        while ((match = subqueryAliasPattern.exec(sqlNoComments)) !== null) {
            const aliasName = match[1];
            if (aliasName && !reservedWords.has(aliasName.toLowerCase())) {
                const beforeMatch = sqlNoComments.substring(Math.max(0, match.index - 500), match.index);
                const fromContext = /\bFROM\s+\(/i.test(beforeMatch) ||
                                  /\bUPDATE\s+[\w\s]+\s+FROM\s+\(/i.test(beforeMatch) ||
                                  /FROM\s*\([\s\S]*?\)\s*AS\s*$/i.test(beforeMatch.slice(-200));
                if (fromContext) {
                    addScopedCteName(aliasName, match.index);
                }
            }
        }

        this.extractUpdateFromAliases(sqlNoComments, addScopedCteName, reservedWords);

        try {
            const dbDialect = this.mapDialect(dialect);
            const ast = this.parser.astify(normalizedSql, { database: dbDialect });
            const statements = Array.isArray(ast) ? ast : [ast];
            parsedStatements = statements.filter(Boolean) as AstStatement[];

            // Extract each statement with only its own CTE scope. A CTE name is
            // query-local and must not hide a physical table in a later statement.
            for (let stmtIndex = 0; stmtIndex < statements.length; stmtIndex++) {
                const stmt = statements[stmtIndex];
                if (!stmt) {continue;}
                const aliasMap = this.createAliasMap();
                this.collectCTENames(stmt as AstStatement, aliasMap.cteNames);
                this.extractFromStatement(stmt as AstStatement, filePath, normalizedSql, references, aliasMap, 0, stmtIndex);
            }
        } catch (error) {
            // Fallback to regex extraction with statement-local CTE/alias names.
            warnings.push(this.formatParserWarning('Reference', error));
            const regexRefs = this.extractWithRegex(normalizedSql, filePath);
            for (const ref of regexRefs) {
                const tableIdentity = getQualifiedKey(ref.tableName, ref.schema, {
                    ...ref,
                    ...getIdentifierSemantics(dialect),
                });
                const statementIndex = ref.statementIndex ?? 0;
                const isShadowedCteUsage = scopedCteNames.get(statementIndex)?.has(tableIdentity)
                    && !this.isInsideCteBodyLineRange(
                        cteBodyLineRanges,
                        scopedCteKey(statementIndex, tableIdentity),
                        ref.lineNumber
                    );
                if (!isShadowedCteUsage) {
                    references.push(ref);
                }
            }
        }


        // MERGE remains unsupported or only partially supported by several
        // node-sql-parser dialects. Extract its target/source from a masked,
        // statement-scoped fallback even when another statement parsed cleanly.
        references.push(...this.extractMergeWithRegex(normalizedSql, filePath));

        const identifierSemantics = getIdentifierSemantics(dialect);
        for (const reference of references) {
            Object.assign(reference, identifierSemantics);
        }

        const deduplicatedReferences = this.deduplicateReferences(references);
        return {
            references: deduplicatedReferences,
            warnings,
            queries: this.buildQueryAnalyses(parsedStatements, deduplicatedReferences, warnings),
        };
    }

    /**
     * Preserve the query/transform information already available from the AST
     * parse so workspace column lineage can consume it without parsing a file a
     * third time in WorkspaceScanner.
     */
    private buildQueryAnalyses(
        statements: AstStatement[],
        references: TableReference[],
        warnings: string[]
    ): QueryAnalysis[] {
        const referencesByStatement = new Map<number, TableReference[]>();
        for (const reference of references) {
            const statementIndex = reference.statementIndex ?? 0;
            const bucket = referencesByStatement.get(statementIndex) || [];
            bucket.push(reference);
            referencesByStatement.set(statementIndex, bucket);
        }
        return statements.map((statement, statementIndex) => {
            const statementReferences = referencesByStatement.get(statementIndex) || [];
            try {
                return this.buildQueryAnalysis(statement, statementIndex, statementReferences);
            } catch (error) {
                warnings.push(this.formatParserWarning(`Query analysis for statement ${statementIndex + 1}`, error));
                return this.createEmptyQueryAnalysis(statement, statementIndex, statementReferences);
            }
        });
    }

    private buildQueryAnalysis(
        statement: AstStatement,
        statementIndex: number,
        statementReferences: TableReference[],
        cteNamesInScope: ReadonlySet<string> = new Set()
    ): QueryAnalysis {
        const selectStatement = this.getAnalysisSelectStatement(statement);
        const allInputTables = statementReferences.filter(reference =>
            reference.referenceType !== 'insert'
            && reference.referenceType !== 'update'
            && reference.referenceType !== 'delete'
            && reference.referenceType !== 'merge'
        );
        const lineNumber = statementReferences.reduce(
            (earliest, reference) => Math.min(earliest, reference.lineNumber || earliest),
            Number.MAX_SAFE_INTEGER
        );
        const queryLineNumber = lineNumber === Number.MAX_SAFE_INTEGER ? 1 : lineNumber;
        const tableAliases = this.columnExtractor.buildAliasMap(selectStatement || statement);
        const directSourceTableNames = [...new Set(
            [...tableAliases.values()]
                .filter((name): name is string => typeof name === 'string' && name.length > 0)
        )];
        const scopedInputTables = directSourceTableNames.length > 0
            ? allInputTables.filter(reference => directSourceTableNames.some(name =>
                name.toLowerCase() === reference.tableName.toLowerCase()
            ))
            : allInputTables;
        // A direct source naming an in-scope CTE has no TableReference by
        // design, so an empty scoped result is accurate rather than a lookup
        // failure. Widen to the whole statement only when a source cannot be
        // accounted for as either a reference or a CTE.
        const unresolvedDirectSources = directSourceTableNames.filter(name =>
            !cteNamesInScope.has(name.toLowerCase())
            && !allInputTables.some(reference =>
                reference.tableName.toLowerCase() === name.toLowerCase())
        );
        const inputTables = scopedInputTables.length > 0 || unresolvedDirectSources.length === 0
            ? scopedInputTables
            : allInputTables;

        let outputColumns: ColumnInfo[] = selectStatement
            ? this.columnExtractor.extractSelectColumns(selectStatement, tableAliases)
            : [];
        let transformations: Transformation[] = selectStatement
            ? this.transformExtractor.extractTransformations(selectStatement, tableAliases)
            : this.extractUpdateTransformations(statement, tableAliases, queryLineNumber);

        const sourceTableNames = new Set(inputTables.map(reference => reference.tableName).filter(Boolean));
        const soleSourceTable = directSourceTableNames.length === 1
            ? directSourceTableNames[0]
            : (sourceTableNames.size === 1 ? [...sourceTableNames][0] : undefined);
        transformations = transformations.map((transformation, index) => {
            const inputColumns = transformation.inputColumns.map(column => ({
                ...column,
                tableName: column.tableName || soleSourceTable,
                lineNumber: column.lineNumber || queryLineNumber,
            }));
            return {
                ...transformation,
                ...this.getTargetColumnOverride(statement, index),
                inputColumns,
                lineNumber: transformation.lineNumber || queryLineNumber,
            };
        });

        const targetColumnNames = this.getTargetColumnNames(statement);
        if (targetColumnNames.length > 0) {
            outputColumns = targetColumnNames.map((name, index) => {
                const transformation = transformations[index];
                return {
                    name,
                    dataType: 'unknown',
                    nullable: true,
                    primaryKey: false,
                    ...(transformation ? {
                        expression: transformation.expression,
                        isComputed: transformation.operation !== 'direct',
                        lineNumber: transformation.lineNumber,
                    } : {}),
                };
            });
        } else if (outputColumns.length === 0 && transformations.length > 0) {
            outputColumns = transformations.map(transformation => ({
                name: transformation.outputColumn,
                dataType: 'unknown',
                nullable: true,
                primaryKey: false,
                expression: transformation.expression,
                isComputed: transformation.operation !== 'direct',
                lineNumber: transformation.lineNumber,
            }));
        }

        const inputColumns = this.collectQueryInputColumns(
            selectStatement,
            transformations,
            soleSourceTable,
            queryLineNumber
        );

        const cteSource = selectStatement || statement;
        const withClauses = this.getWithClauses(cteSource);
        const nestedCteNamesInScope = new Set(cteNamesInScope);
        for (const cte of withClauses) {
            const siblingName = this.getCTENameString(cte.name);
            if (siblingName) {
                nestedCteNamesInScope.add(siblingName.toLowerCase());
            }
        }
        const ctes = withClauses.flatMap(cte => {
            const cteStatement = this.getCteStatement(cte);
            if (!cteStatement) {
                return [];
            }
            const name = this.getCTENameString(cte.name) || 'cte';
            const columns = Array.isArray(cte.columns)
                ? cte.columns.map(column => unwrapIdentifierValue(column)).filter((column): column is string => Boolean(column))
                : undefined;
            return [{
                name,
                ...(columns && columns.length > 0 ? { columns } : {}),
                query: this.buildQueryAnalysis(
                    cteStatement,
                    statementIndex,
                    statementReferences,
                    nestedCteNamesInScope
                ),
                isRecursive: Boolean((cte as any).recursive || (cteSource as any).recursive),
                lineNumber: queryLineNumber,
            }];
        });

        return {
            statementType: this.getQueryStatementType(statement),
            statementIndex,
            outputColumns,
            inputTables,
            inputColumns,
            transformations,
            ctes,
            subqueries: [],
            lineNumber: queryLineNumber,
        };
    }

    private createEmptyQueryAnalysis(
        statement: AstStatement,
        statementIndex: number,
        statementReferences: TableReference[]
    ): QueryAnalysis {
        const lineNumber = statementReferences.reduce(
            (earliest, reference) => Math.min(earliest, reference.lineNumber || earliest),
            Number.MAX_SAFE_INTEGER
        );
        return {
            statementType: this.getQueryStatementType(statement),
            statementIndex,
            outputColumns: [],
            inputTables: statementReferences,
            inputColumns: [],
            transformations: [],
            ctes: [],
            subqueries: [],
            lineNumber: lineNumber === Number.MAX_SAFE_INTEGER ? 1 : lineNumber,
        };
    }

    private getAnalysisSelectStatement(statement: AstStatement): AstSelectStatement | null {
        if (statement?.type?.toLowerCase() === 'select') {
            return statement as AstSelectStatement;
        }
        for (const candidate of [statement?.select, statement?.query_expr, statement?.values]) {
            if (candidate && typeof candidate === 'object' && candidate.type?.toLowerCase() === 'select') {
                return candidate as AstSelectStatement;
            }
        }
        return null;
    }

    private getQueryStatementType(statement: AstStatement): StatementType {
        const type = statement?.type?.toLowerCase();
        if (type === 'create') {
            const keyword = String(statement.keyword || '').toLowerCase();
            if (keyword === 'view') {return 'create_view';}
            if (keyword === 'table') {return 'create_table';}
        }
        if (type === 'select' || type === 'insert' || type === 'update'
            || type === 'delete' || type === 'merge') {
            return type;
        }
        return 'unknown';
    }

    private getTargetColumnOverride(
        statement: AstStatement,
        columnIndex: number
    ): Pick<Transformation, 'outputColumn' | 'outputAlias'> | Record<string, never> {
        const targetColumn = this.getTargetColumnNames(statement)[columnIndex];
        return targetColumn
            ? { outputColumn: targetColumn, outputAlias: targetColumn }
            : {};
    }

    private getTargetColumnNames(statement: AstStatement): string[] {
        const statementType = statement?.type?.toLowerCase();
        const isInsert = statementType === 'insert';
        const isCreateView = statementType === 'create'
            && String(statement.keyword || '').toLowerCase() === 'view';
        if ((!isInsert && !isCreateView) || !Array.isArray(statement.columns)) {
            return [];
        }
        return statement.columns
            .map(column => unwrapIdentifierValue(column))
            .filter((column): column is string => Boolean(column));
    }

    private extractUpdateTransformations(
        statement: AstStatement,
        tableAliases: Map<string, string>,
        lineNumber: number
    ): Transformation[] {
        if (statement?.type?.toLowerCase() !== 'update' || !Array.isArray(statement.set)) {
            return [];
        }
        const transformations: Transformation[] = [];
        for (const assignment of statement.set) {
            const outputColumn = unwrapIdentifierValue(assignment.column);
            const expression = assignment.value as AstExpression | undefined;
            if (!outputColumn || !expression) {continue;}
            transformations.push({
                outputColumn,
                inputColumns: this.transformExtractor.parseExpression(expression, tableAliases),
                operation: this.transformExtractor.classifyTransformation(expression),
                expression: this.expressionToSql(expression),
                lineNumber,
            });
        }
        return transformations;
    }

    private expressionToSql(expression: AstExpression): string {
        try {
            return this.parser.exprToSQL(expression as any);
        } catch {
            return expression.type || 'expression';
        }
    }

    private collectQueryInputColumns(
        selectStatement: AstSelectStatement | null,
        transformations: Transformation[],
        soleSourceTable: string | undefined,
        lineNumber: number
    ): ColumnReference[] {
        const columns: ColumnReference[] = transformations.flatMap(transformation => transformation.inputColumns);
        if (selectStatement) {
            for (const context of ['select', 'where', 'join', 'group', 'order', 'having'] as ColumnUsageContext[]) {
                columns.push(...this.columnExtractor.extractUsedColumns(selectStatement, context));
            }
        }

        const unique = new Map<string, ColumnReference>();
        for (const column of columns) {
            const normalized = {
                ...column,
                tableName: column.tableName || soleSourceTable,
                lineNumber: column.lineNumber || lineNumber,
            };
            const key = `${normalized.tableName || ''}|${normalized.columnName}|${normalized.usedIn}`;
            if (!unique.has(key)) {
                unique.set(key, normalized);
            }
        }
        return [...unique.values()];
    }

    private formatParserWarning(scope: string, error: unknown): string {
        const message = error instanceof Error ? error.message : String(error || 'Unknown parser error');
        const compactMessage = message.replace(/\s+/g, ' ').trim().slice(0, 500);
        return `${scope} parser failed; regex fallback used: ${compactMessage || 'Unknown parser error'}`;
    }

    /**
     * Recursively collect all CTE names from a statement tree
     */
    private collectCTENames(stmt: AstStatement, cteNames: Set<string>): void {
        if (!stmt || typeof stmt !== 'object') {return;}

        // Check for WITH clause
        if (stmt.with) {
            const withClause = Array.isArray(stmt.with) ? stmt.with : [stmt.with];
            for (const cte of withClause) {
                const cteName = this.getCTENameString(cte.name);
                if (cteName && typeof cteName === 'string') {
                    this.addCTEName(cteNames, cte.name);
                }
            }
        }

        // Check if statement is a WITH statement
        if (stmt.type && stmt.type.toLowerCase() === 'with') {
            if (stmt.ctes) {
                const ctes = Array.isArray(stmt.ctes) ? stmt.ctes : [stmt.ctes];
                for (const cte of ctes) {
                    const cteName = this.getCTENameString(cte.name);
                    if (cteName && typeof cteName === 'string') {
                        this.addCTEName(cteNames, cte.name);
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
     * Create a child scope for traversing a CTE body while allowing the current
     * CTE name to still resolve to an external relation inside that definition.
     */
    private createCteDefinitionAliasMap(aliasMap: AliasMap, cteName?: AstCTE['name']): AliasMap {
        const childAliasMap = this.createAliasMap();
        childAliasMap.tables = new Map(aliasMap.tables);
        childAliasMap.columns = new Map(aliasMap.columns);
        childAliasMap.cteNames = new Set(aliasMap.cteNames);
        if (cteName) {
            const identity = this.getCTEIdentity(cteName);
            if (identity) {childAliasMap.cteNames.delete(identity);}
        }
        return childAliasMap;
    }

    private findMatchingParen(sql: string, openParenIndex: number): number {
        let depth = 0;
        for (let i = openParenIndex; i < sql.length; i++) {
            if (sql[i] === '(') {
                depth++;
                continue;
            }
            if (sql[i] === ')') {
                depth--;
                if (depth === 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    private addCteBodyLineRange(
        cteBodyLineRanges: Map<string, Array<{ startLine: number; endLine: number }>>,
        sql: string,
        cteName: string,
        openParenIndex: number,
        closeParenIndex: number
    ): void {
        const startLine = this.getLineNumberAtIndex(sql, openParenIndex + 1);
        const endLine = this.getLineNumberAtIndex(sql, closeParenIndex);
        const ranges = cteBodyLineRanges.get(cteName) || [];
        ranges.push({ startLine, endLine });
        cteBodyLineRanges.set(cteName, ranges);
    }

    private isInsideCteBodyLineRange(
        cteBodyLineRanges: Map<string, Array<{ startLine: number; endLine: number }>>,
        cteName: string,
        lineNumber: number
    ): boolean {
        const ranges = cteBodyLineRanges.get(cteName) || [];
        return ranges.some(range => lineNumber >= range.startLine && lineNumber <= range.endLine);
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
     * Extract references from a single statement
     */
    private extractFromStatement(
        stmt: AstStatement,
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
            for (const cte of this.getWithClauses(stmt)) {
                const cteName = this.getCTENameString(cte.name);
                if (cteName) {
                    this.addCTEName(aliasMap.cteNames, cte.name);
                }

                // Extract references from CTE definition
                const cteStmt = this.getCteStatement(cte);
                if (cteStmt) {
                    const cteAliasMap = this.createCteDefinitionAliasMap(aliasMap, cte.name);
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
                    const cteName = this.getCTENameString(cte.name);
                    if (cteName) {
                        this.addCTEName(aliasMap.cteNames, cte.name);
                    }

                    const cteStmt = this.getCteStatement(cte);
                    if (cteStmt) {
                        const cteAliasMap = this.createCteDefinitionAliasMap(aliasMap, cte.name);
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
            case 'merge':
                // MERGE AST shapes vary by parser dialect. The statement-scoped
                // masked fallback appended by extractReferences handles it.
                break;
            case 'create':
                // Extract references from CREATE VIEW/CTAS AS SELECT. node-sql-parser
                // emits CTAS SELECT bodies as query_expr for several dialects.
                if (stmt.select || stmt.query || stmt.query_expr) {
                    this.extractFromStatement(
                        stmt.select || stmt.query || stmt.query_expr,
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
        stmt: AstStatement,
        filePath: string,
        sql: string,
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number,
        statementIndex: number = 0
    ): void {
        // Process CTEs first - add to alias map to exclude from references
        if (stmt.with) {
            for (const cte of this.getWithClauses(stmt)) {
                const cteName = this.getCTENameString(cte.name);
                if (cteName) {
                    this.addCTEName(aliasMap.cteNames, cte.name);
                }

                // Extract references from CTE definition
                const cteStmt = this.getCteStatement(cte);
                if (cteStmt) {
                    const cteAliasMap = this.createCteDefinitionAliasMap(aliasMap, cte.name);
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
        if (stmt.columns && Array.isArray(stmt.columns) && stmt.columns.length > 0 && typeof stmt.columns[0] !== 'string') {
            this.extractFromColumns(stmt.columns as AstColumn[], filePath, sql, references, aliasMap, depth, statementIndex);
        }

        // WHERE clause (may contain subqueries)
        if (stmt.where) {
            this.extractFromExpression(stmt.where as AstExpression, filePath, sql, references, aliasMap, depth, statementIndex);
        }

        // HAVING clause
        if (stmt.having) {
            this.extractFromExpression(stmt.having as AstExpression, filePath, sql, references, aliasMap, depth, statementIndex);
        }

        // UNION/INTERSECT/EXCEPT
        if (stmt._next) {
            this.extractFromStatement(stmt._next, filePath, sql, references, aliasMap, depth, statementIndex);
        }

        // Note: set_op is a string like 'union', not an AST node.
        // The _next block above already handles the right-side statement.
    }

    /**
     * Extract references from INSERT statement
     */
    private extractFromInsert(
        stmt: AstStatement,
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
                const tableRef = typeof t === 'string' ? { table: t } as AstTableRef : t;
                const ref = this.createTableReference(tableRef, filePath, sql, 'insert', 'INSERT INTO', statementIndex);
                if (ref?.tableName) {
                    const isCTE = this.isCTEReference(aliasMap.cteNames, ref);
                    if (!isCTE) {
                        references.push(ref);
                    }
                }
            }
        }

        // SELECT subquery for INSERT...SELECT
        if (stmt.values) {
            const values = stmt.values as AstStatement;
            if (values.type === 'select' || values.ast) {
                this.extractFromStatement(
                    (values.ast || values) as AstStatement,
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
        stmt: AstStatement,
        filePath: string,
        sql: string,
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number,
        statementIndex: number = 0
    ): void {
        // Process WITH clause first if present (for UPDATE ... WITH ... UPDATE)
        if (stmt.with) {
            for (const cte of this.getWithClauses(stmt)) {
                const cteName = this.getCTENameString(cte.name);
                if (cteName) {
                    this.addCTEName(aliasMap.cteNames, cte.name);
                }

                // Extract references from CTE definition
                const cteStmt = this.getCteStatement(cte);
                if (cteStmt) {
                    const cteAliasMap = this.createCteDefinitionAliasMap(aliasMap, cte.name);
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
            const fromAliases = this.collectFromAliases(stmt.from);
            const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
            for (const t of tables) {
                const tableRef = typeof t === 'string' ? { table: t } as AstTableRef : t as AstTableRef;
                const targetName = this.getTableName(tableRef);
                const resolvedAlias = targetName ? fromAliases.get(targetName.toLowerCase()) : undefined;
                const ref = this.createTableReference(
                    resolvedAlias || tableRef,
                    filePath,
                    sql,
                    'update',
                    'UPDATE',
                    statementIndex
                );
                if (ref?.tableName) {
                    const isCTE = this.isCTEReference(aliasMap.cteNames, ref);
                    if (!isCTE) {
                        references.push(ref);
                        // Track alias if present
                        if (tableRef.as) {
                            aliasMap.tables.set((tableRef.as as string).toLowerCase(), { tableName: ref.tableName });
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
                            aliasName = item.as.alias ?? null;
                        }
                    }

                    if (aliasName) {
                        // Mark subquery alias - it's not a real table
                        aliasMap.cteNames.add(this.getIdentifierIdentity(aliasName, this.isQuotedAstIdentifier(item.as)));
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
        stmt: AstStatement,
        filePath: string,
        sql: string,
        references: TableReference[],
        aliasMap: AliasMap,
        depth: number,
        statementIndex: number = 0
    ): void {
        // Process WITH clause first if present (for DELETE ... WITH ... DELETE FROM)
        if (stmt.with) {
            for (const cte of this.getWithClauses(stmt)) {
                const cteName = this.getCTENameString(cte.name);
                if (cteName) {
                    this.addCTEName(aliasMap.cteNames, cte.name);
                }

                // Extract references from CTE definition
                const cteStmt = this.getCteStatement(cte);
                if (cteStmt) {
                    const cteAliasMap = this.createCteDefinitionAliasMap(aliasMap, cte.name);
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
                const tableRef = typeof t === 'string' ? { table: t } as AstTableRef : t as AstTableRef;
                const ref = this.createTableReference(tableRef, filePath, sql, 'delete', 'DELETE FROM', statementIndex);
                if (ref?.tableName) {
                    const isCTE = this.isCTEReference(aliasMap.cteNames, ref);
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
        item: AstTableRef,
        filePath: string,
        sql: string,
        references: TableReference[],
        aliasMap: AliasMap,
        defaultType: ReferenceType,
        depth: number,
        statementIndex: number = 0,
        parentStmt?: AstStatement
    ): void {
        if (!item) {return;}

        // Determine reference type (join or select)
        const refType: ReferenceType = item.join ? 'join' : defaultType;
        const context = item.join ? `${item.join.toUpperCase()} JOIN` : 'FROM';

        // Direct table reference
        const ref = this.createTableReference(item, filePath, sql, refType, context, statementIndex);
        if (ref && ref.tableName !== 'unknown') {
            // Skip if it's a CTE name (check both current aliasMap and global CTE names)
            const isCTE = this.isCTEReference(aliasMap.cteNames, ref);

            if (!isCTE) {
                // Extract columns if enabled and parent statement is provided
                if (this.options.extractColumns && parentStmt) {
                    ref.columns = this.extractColumnsFromTable(item, parentStmt, aliasMap);
                }

                references.push(ref);
            }
            // If it's a CTE, skip adding as a table reference

            // Track alias
            if (item.as && typeof item.as === 'string') {
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
                const aliasName = typeof item.as === 'string' ? item.as : item.as.value || item.as.name || '';
                if (aliasName) {
                    // Mark this as a subquery alias, not a real table
                    // We'll use a special marker or just track it separately
                    // For now, we'll add it to a set of subquery aliases
                    // Actually, we can use the tables map but mark it specially
                    // Or better: add to a new set for subquery aliases
                    // For simplicity, let's add it to cteNames since subqueries should be treated similarly
                    const aliasIdentity = this.getIdentifierIdentity(
                        this.unquoteIdentifier(aliasName),
                        this.isQuotedAstIdentifier(item.as)
                    );
                    aliasMap.cteNames.add(aliasIdentity);
                    subAliasMap.cteNames.add(aliasIdentity);
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
            this.extractFromExpression(item.on, filePath, sql, references, aliasMap, depth, statementIndex);
        }
    }

    private collectFromAliases(fromItems: AstStatement['from']): Map<string, AstTableRef> {
        const aliases = new Map<string, AstTableRef>();
        const items = Array.isArray(fromItems) ? fromItems : (fromItems ? [fromItems] : []);
        for (const item of items) {
            const aliasName = unwrapIdentifierValue(item?.as);
            if (!aliasName) {
                continue;
            }
            const tableName = this.getTableName(item);
            if (!tableName) {
                continue;
            }
            aliases.set(aliasName.toLowerCase(), item);
        }
        return aliases;
    }

    /**
     * Create a TableReference from AST item
     */
    private createTableReference(
        item: AstTableRef,
        filePath: string,
        sql: string,
        refType: ReferenceType,
        context: string,
        statementIndex: number = 0
    ): TableReference | null {
        const tableName = this.getTableName(item);
        if (!tableName) {return null;}
        const catalog = item.schema ? item.db || undefined : undefined;
        const schema = item.schema || item.db || undefined;
        const fallbackLineNumber = this.findTableLine(sql, tableName, statementIndex);
        const searchContext = refType === 'join'
            ? 'JOIN'
            : refType === 'insert'
                ? 'INSERT INTO'
                : refType === 'update'
                    ? 'UPDATE'
                    : refType === 'delete'
                        ? 'DELETE FROM'
                        : 'FROM';
        const needsSourceMetadata = Boolean(schema || catalog || /["`\[]/.test(sql));
        const location = needsSourceMetadata
            ? this.findTableReferenceLocation(
                sql,
                tableName,
                searchContext,
                schema,
                statementIndex,
                catalog
            )
            : null;

        return {
            tableName,
            alias: typeof item.as === 'string' ? item.as : undefined,
            schema,
            catalog,
            nameQuoted: location?.nameQuoted ?? false,
            schemaQuoted: location?.schemaQuoted ?? false,
            catalogQuoted: location?.catalogQuoted ?? false,
            referenceType: refType,
            filePath,
            lineNumber: location?.lineNumber ?? fallbackLineNumber,
            context,
            statementIndex
        };
    }

    /**
     * Extract references from SELECT columns (may contain subqueries)
     */
    private extractFromColumns(
        columns: AstColumn[],
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
        expr: AstExpression,
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
                const tableIdentity = this.getIdentifierIdentity(
                    this.unquoteIdentifier(tableName),
                    this.isQuotedAstIdentifier(expr.table)
                );
                // Skip if it's a CTE or subquery alias
                if (aliasMap.cteNames.has(tableIdentity)) {
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

        // Expression lists can contain select wrappers under `.ast`, such as IN (SELECT ...)
        if (Array.isArray(expr.value)) {
            for (const item of expr.value) {
                if (item?.ast?.type === 'select') {
                    this.extractFromStatement(item.ast, filePath, sql, references, aliasMap, depth + 1, statementIndex);
                    continue;
                }
                if (item && typeof item === 'object') {
                    this.extractFromExpression(item, filePath, sql, references, aliasMap, depth, statementIndex);
                }
            }
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
    private getTableName(item: AstTableRef | string): string | null {
        if (!item) {return null;}
        if (typeof item === 'string') {return item;}

        if (item.table) {
            const tableObject = typeof item.table === 'object' ? item.table : undefined;
            const tableName = unwrapIdentifierValue(item.table)
                || unwrapIdentifierValue(tableObject?.table)
                || unwrapIdentifierValue(tableObject?.name);
            if (tableName) {return tableName;}
        }

        const name = unwrapIdentifierValue(item.name);
        if (name) {return name;}

        return null;
    }

    private normalizeTableLineLookupKey(tableName: string): string {
        const raw = String(tableName || '').trim();
        const parts = raw.split('.');
        const finalPart = parts[parts.length - 1] || raw;
        return finalPart.replace(/^["'`]+|["'`]+$/g, '').toLowerCase();
    }

    private addTableLine(
        map: Map<string, Map<number, number>>,
        tableName: string | undefined,
        statementIndex: number,
        lineNumber: number
    ): void {
        if (!tableName) {
            return;
        }
        const key = this.normalizeTableLineLookupKey(tableName);
        if (!key) {
            return;
        }
        const linesByStatement = map.get(key) || new Map<number, number>();
        if (!linesByStatement.has(statementIndex)) {
            linesByStatement.set(statementIndex, lineNumber);
            map.set(key, linesByStatement);
        }
    }

    private getTableLineLookup(sql: string): TableLineLookup {
        if (this.tableLineLookup?.sql === sql) {
            return this.tableLineLookup;
        }

        const lookup = this.buildTableLineLookup(sql);
        this.tableLineLookup = lookup;
        return lookup;
    }

    private getStatementBoundaries(sql: string): number[] {
        const boundaries = [0];
        let inString = false;
        let stringChar = '';
        let inBracketIdentifier = false;
        const supportsBracketIdentifiers = this.supportsBracketIdentifiers();

        for (let index = 0; index < sql.length; index++) {
            const char = sql[index];
            if (!inString && !inBracketIdentifier && char === '$') {
                const delimiter = getDollarQuoteDelimiterAt(sql, index);
                if (delimiter) {
                    const close = sql.indexOf(delimiter, index + delimiter.length);
                    index = close === -1 ? sql.length : close + delimiter.length - 1;
                    continue;
                }
            }
            if (supportsBracketIdentifiers && !inString && char === '[') {
                inBracketIdentifier = true;
                continue;
            }
            if (inBracketIdentifier) {
                if (char === ']' && sql[index + 1] === ']') {
                    index++;
                } else if (char === ']') {
                    inBracketIdentifier = false;
                }
                continue;
            }
            if (char === "'" || char === '"' || char === '`') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    if (sql[index + 1] === stringChar) {
                        index++;
                    } else {
                        inString = false;
                    }
                }
                continue;
            }
            if (!inString && !inBracketIdentifier && char === ';') {
                boundaries.push(index + 1);
            }
        }

        return boundaries;
    }

    private supportsBracketIdentifiers(): boolean {
        return this._activeDialect === 'TransactSQL' || this._activeDialect === 'SQLite';
    }

    private getStatementIndex(boundaries: number[], charIndex: number): number {
        for (let index = boundaries.length - 1; index >= 0; index--) {
            if (charIndex >= boundaries[index]) {
                return index;
            }
        }
        return 0;
    }

    private buildTableLineLookup(sql: string): TableLineLookup {
        const contextLineByTable = new Map<string, Map<number, number>>();
        const fallbackLineByTable = new Map<string, Map<number, number>>();
        const searchableSql = this.maskSqlStringLiterals(maskSqlCommentsPreservingPositions(sql));
        const statementBoundaries = this.getStatementBoundaries(searchableSql);
        const identifier = '["\'`]?([#A-Za-z_][#A-Za-z0-9_$]*)["\'`]?';
        const qualifiedIdentifier = `(?:["'\`]?[#A-Za-z_][#A-Za-z0-9_$]*["'\`]?\\.)?${identifier}`;
        const contextPatterns = [
            new RegExp(`\\bFROM\\s+${qualifiedIdentifier}\\b`, 'gi'),
            new RegExp(`\\b(?:INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\\s*JOIN\\s+${qualifiedIdentifier}\\b`, 'gi'),
            new RegExp(`\\bINSERT\\s+INTO\\s+${qualifiedIdentifier}\\b`, 'gi'),
            new RegExp(`\\bUPDATE\\s+${qualifiedIdentifier}\\b`, 'gi'),
            new RegExp(`\\bDELETE\\s+FROM\\s+${qualifiedIdentifier}\\b`, 'gi'),
        ];
        const fallbackPattern = /["'`]?([#A-Za-z_][#A-Za-z0-9_$]*)["'`]?/g;

        for (const pattern of contextPatterns) {
            pattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(searchableSql)) !== null) {
                const tableOffset = match[1]
                    ? match[0].toLowerCase().lastIndexOf(match[1].toLowerCase())
                    : 0;
                const tableIndex = match.index + Math.max(0, tableOffset);
                this.addTableLine(
                    contextLineByTable,
                    match[1],
                    this.getStatementIndex(statementBoundaries, tableIndex),
                    this.getLineNumberAtIndex(searchableSql, tableIndex)
                );
            }
        }

        fallbackPattern.lastIndex = 0;
        let tokenMatch: RegExpExecArray | null;
        while ((tokenMatch = fallbackPattern.exec(searchableSql)) !== null) {
            this.addTableLine(
                fallbackLineByTable,
                tokenMatch[1],
                this.getStatementIndex(statementBoundaries, tokenMatch.index),
                this.getLineNumberAtIndex(searchableSql, tokenMatch.index)
            );
        }

        return { sql, contextLineByTable, fallbackLineByTable };
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
    private findTableLine(sql: string, tableName: string, statementIndex: number): number {
        const key = this.normalizeTableLineLookupKey(tableName);
        const lookup = this.getTableLineLookup(sql);
        const contextLines = lookup.contextLineByTable.get(key);
        const fallbackLines = lookup.fallbackLineByTable.get(key);
        return contextLines?.get(statementIndex)
            ?? fallbackLines?.get(statementIndex)
            ?? contextLines?.values().next().value
            ?? fallbackLines?.values().next().value
            ?? 1;
    }

    private isQuotedIdentifier(identifier: string | undefined): boolean {
        if (!identifier) {return false;}
        const trimmed = identifier.trim();
        return (trimmed.startsWith('"') && trimmed.endsWith('"'))
            || (trimmed.startsWith('`') && trimmed.endsWith('`'))
            || (trimmed.startsWith('[') && trimmed.endsWith(']'));
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

    private identifierMatches(rawIdentifier: string | undefined, expected: string | undefined): boolean {
        if (!rawIdentifier || expected === undefined) {
            return rawIdentifier === undefined && expected === undefined;
        }
        const unquoted = this.unquoteIdentifier(rawIdentifier);
        return this.isQuotedIdentifier(rawIdentifier)
            ? unquoted === expected
            : unquoted.toLowerCase() === expected.toLowerCase();
    }

    private isTopLevelFromListPosition(sql: string, statementStart: number, position: number): boolean {
        let depth = 0;
        let fromListActive = false;
        const supportsBracketIdentifiers = this.supportsBracketIdentifiers();

        for (let index = statementStart; index < position;) {
            const char = sql[index];
            if (char === '"' || char === '`' || (supportsBracketIdentifiers && char === '[')) {
                const closing = char === '[' ? ']' : char;
                index++;
                while (index < position) {
                    if (sql[index] === closing) {
                        if (sql[index + 1] === closing) {
                            index += 2;
                            continue;
                        }
                        index++;
                        break;
                    }
                    index++;
                }
                continue;
            }
            if (char === '(') {
                depth++;
                index++;
                continue;
            }
            if (char === ')') {
                depth = Math.max(0, depth - 1);
                index++;
                continue;
            }
            if (depth === 0 && /[A-Za-z_]/.test(char)) {
                const start = index++;
                while (index < position && /[A-Za-z0-9_$#@]/.test(sql[index])) {
                    index++;
                }
                const keyword = sql.slice(start, index).toUpperCase();
                if (keyword === 'FROM') {
                    fromListActive = true;
                } else if (['WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'QUALIFY', 'UNION', 'EXCEPT', 'INTERSECT', 'RETURNING'].includes(keyword)) {
                    fromListActive = false;
                }
                continue;
            }
            index++;
        }

        return depth === 0 && fromListActive;
    }

    /** Mask value literals while retaining delimited identifiers and offsets. */
    private maskSqlStringLiterals(sql: string): string {
        const masked = sql.split('');
        const blankRange = (start: number, end: number): void => {
            for (let index = start; index < end; index++) {
                if (masked[index] !== '\n' && masked[index] !== '\r') {
                    masked[index] = ' ';
                }
            }
        };

        for (let index = 0; index < sql.length;) {
            if (sql[index] === "'") {
                const start = index++;
                while (index < sql.length) {
                    if (sql[index] === "'" && sql[index + 1] === "'") {
                        index += 2;
                    } else if (sql[index] === "'") {
                        index++;
                        break;
                    } else if (sql[index] === '\\' && index + 1 < sql.length) {
                        index += 2;
                    } else {
                        index++;
                    }
                }
                blankRange(start, index);
                continue;
            }

            if (sql[index] === '$') {
                const delimiter = getDollarQuoteDelimiterAt(sql, index);
                if (delimiter) {
                    const start = index;
                    const close = sql.indexOf(delimiter, index + delimiter.length);
                    index = close === -1 ? sql.length : close + delimiter.length;
                    blankRange(start, index);
                    continue;
                }
            }
            index++;
        }

        return masked.join('');
    }

    private extractMergeWithRegex(sql: string, filePath: string): TableReference[] {
        const references: TableReference[] = [];
        const searchableSql = this.maskSqlStringLiterals(maskSqlCommentsPreservingPositions(sql));
        const statementBoundaries = this.getStatementBoundaries(searchableSql);
        const qualifiedPattern = `(${REFERENCE_SQL_IDENTIFIER_PATTERN})`
            + `(?:\\s*\\.\\s*(${REFERENCE_SQL_IDENTIFIER_PATTERN}))?`
            + `(?:\\s*\\.\\s*(${REFERENCE_SQL_IDENTIFIER_PATTERN}))?`;
        const parts = (match: RegExpExecArray): {
            rawName: string; rawSchema?: string; rawCatalog?: string;
        } => ({
            rawCatalog: match[3] ? match[1] : undefined,
            rawSchema: match[3] ? match[2] : (match[2] ? match[1] : undefined),
            rawName: match[3] || match[2] || match[1],
        });
        const targetRegex = new RegExp(
            `\\bMERGE(?:\\s+INTO)?\\s+${qualifiedPattern}`,
            'gi'
        );
        let match: RegExpExecArray | null;
        while ((match = targetRegex.exec(searchableSql)) !== null) {
            const { rawName, rawSchema, rawCatalog } = parts(match);
            const tableName = this.unquoteIdentifier(rawName);
            const statementIndex = this.getStatementIndex(statementBoundaries, match.index);
            references.push({
                tableName,
                schema: rawSchema ? this.unquoteIdentifier(rawSchema) : undefined,
                catalog: rawCatalog ? this.unquoteIdentifier(rawCatalog) : undefined,
                nameQuoted: this.isQuotedIdentifier(rawName),
                schemaQuoted: this.isQuotedIdentifier(rawSchema),
                catalogQuoted: this.isQuotedIdentifier(rawCatalog),
                referenceType: 'merge',
                filePath,
                lineNumber: this.getLineNumberAtIndex(searchableSql, match.index),
                context: 'MERGE INTO',
                statementIndex,
            });
        }

        const usingRegex = new RegExp(
            `\\bUSING\\s+${qualifiedPattern}`,
            'gi'
        );
        while ((match = usingRegex.exec(searchableSql)) !== null) {
            const statementIndex = this.getStatementIndex(statementBoundaries, match.index);
            const statementStart = statementBoundaries[statementIndex] ?? 0;
            if (!/\bMERGE\b/i.test(searchableSql.slice(statementStart, match.index))) {
                continue;
            }
            const { rawName, rawSchema, rawCatalog } = parts(match);
            const tableName = this.unquoteIdentifier(rawName);
            references.push({
                tableName,
                schema: rawSchema ? this.unquoteIdentifier(rawSchema) : undefined,
                catalog: rawCatalog ? this.unquoteIdentifier(rawCatalog) : undefined,
                nameQuoted: this.isQuotedIdentifier(rawName),
                schemaQuoted: this.isQuotedIdentifier(rawSchema),
                catalogQuoted: this.isQuotedIdentifier(rawCatalog),
                referenceType: 'select',
                filePath,
                lineNumber: this.getLineNumberAtIndex(searchableSql, match.index),
                context: 'MERGE USING',
                statementIndex,
            });
        }
        return references;
    }


    /**
     * Regex-based fallback for reference extraction
     */
    private extractWithRegex(sql: string, filePath: string): TableReference[] {
        const references: TableReference[] = [];
        const functionFromKeywords = ['extract', 'substring', 'trim', 'position'];

        // Strip comments to prevent false matches like "UPDATE without WHERE" in comments
        const sqlNoComments = this.maskSqlStringLiterals(maskSqlCommentsPreservingPositions(sql));

        const statementBoundaries = this.getStatementBoundaries(sqlNoComments);

        // Helper to find statement index for a given character position
        // NOTE: charIndex should be from sqlNoComments (comment-stripped SQL) since
        // statementBoundaries are calculated from sqlNoComments. This is fine for statementIndex
        // (used for grouping), but NOT for line numbers (which must use original SQL).
        const getStatementIndex = (charIndex: number): number =>
            this.getStatementIndex(statementBoundaries, charIndex);

        const hasPriorTopLevelStatementVerb = (charIndex: number): boolean => {
            const statementIndex = getStatementIndex(charIndex);
            const statementStart = statementBoundaries[statementIndex] ?? 0;
            let depth = 0;
            const supportsBracketIdentifiers = this.supportsBracketIdentifiers();

            for (let index = statementStart; index < charIndex;) {
                const char = sqlNoComments[index];
                if (char === '"' || char === '`' || (supportsBracketIdentifiers && char === '[')) {
                    const closingQuote = char === '[' ? ']' : char;
                    index++;
                    while (index < charIndex) {
                        if (sqlNoComments[index] === closingQuote) {
                            if (sqlNoComments[index + 1] === closingQuote) {
                                index += 2;
                                continue;
                            }
                            index++;
                            break;
                        }
                        index++;
                    }
                    continue;
                }
                if (char === '(') {
                    depth++;
                    index++;
                    continue;
                }
                if (char === ')') {
                    depth = Math.max(0, depth - 1);
                    index++;
                    continue;
                }
                if (depth === 0 && /[A-Za-z_]/.test(char)) {
                    const tokenStart = index++;
                    while (index < charIndex && /[A-Za-z0-9_$#@]/.test(sqlNoComments[index])) {
                        index++;
                    }
                    const token = sqlNoComments.slice(tokenStart, index).toUpperCase();
                    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE'].includes(token)) {
                        return true;
                    }
                    continue;
                }
                index++;
            }

            return false;
        };

        const isFunctionFrom = (matchIndex: number): boolean => {
            // matchIndex comes from regex matches against sqlNoComments, so line slicing
            // must use sqlNoComments too. Mixing with original SQL causes index drift.
            const lineStart = sqlNoComments.lastIndexOf('\n', matchIndex) + 1;
            const lineEnd = sqlNoComments.indexOf('\n', matchIndex);
            const end = lineEnd === -1 ? sqlNoComments.length : lineEnd;
            const line = sqlNoComments.slice(lineStart, end);
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

        const qualifiedTablePattern =
            `(${REFERENCE_SQL_IDENTIFIER_PATTERN})`
                + `(?:\\s*\\.\\s*(${REFERENCE_SQL_IDENTIFIER_PATTERN}))?`
                + `(?:\\s*\\.\\s*(${REFERENCE_SQL_IDENTIFIER_PATTERN}))?`;
        const appendMatches = (
            pattern: RegExp,
            referenceType: ReferenceType,
            context: string,
            hasAlias: boolean,
            skipFunctionFrom = false
        ): void => {
            let match: RegExpExecArray | null;
            while ((match = pattern.exec(sqlNoComments)) !== null) {
                if (skipFunctionFrom && isFunctionFrom(match.index)) {
                    continue;
                }
                if (referenceType === 'update' && hasPriorTopLevelStatementVerb(match.index)) {
                    continue;
                }
                const rawCatalog = match[3] ? match[1] : undefined;
                const rawSchema = match[3] ? match[2] : (match[2] ? match[1] : undefined);
                const rawName = match[3] || match[2] || match[1];
                const tableName = this.unquoteIdentifier(rawName);
                const nameQuoted = this.isQuotedIdentifier(rawName);
                if (this.isReservedWord(tableName) && !nameQuoted) {
                    continue;
                }
                const schema = rawSchema ? this.unquoteIdentifier(rawSchema) : undefined;
                const catalog = rawCatalog ? this.unquoteIdentifier(rawCatalog) : undefined;
                const statementIndex = getStatementIndex(match.index);
                const loc = this.findTableReferenceLocation(
                    sql,
                    tableName,
                    context,
                    schema,
                    statementIndex,
                    catalog
                );
                if (!loc) {
                    continue;
                }
                references.push({
                    tableName,
                    alias: hasAlias ? match[4] : undefined,
                    schema,
                    catalog,
                    nameQuoted,
                    schemaQuoted: this.isQuotedIdentifier(rawSchema),
                    catalogQuoted: this.isQuotedIdentifier(rawCatalog),
                    referenceType,
                    filePath,
                    lineNumber: loc.lineNumber,
                    context,
                    statementIndex,
                });
            }
        };

        appendMatches(
            new RegExp(`\\bFROM\\s+${qualifiedTablePattern}(?:\\s+(?:AS\\s+)?([A-Za-z_][\\w$#@]*))?`, 'gi'),
            'select',
            'FROM',
            true,
            true
        );
        appendMatches(
            new RegExp(`\\b(?:INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\\s*JOIN\\s+${qualifiedTablePattern}(?:\\s+(?:AS\\s+)?([A-Za-z_][\\w$#@]*))?`, 'gi'),
            'join',
            'JOIN',
            true
        );
        appendMatches(new RegExp(`\\bINSERT\\s+INTO\\s+${qualifiedTablePattern}`, 'gi'), 'insert', 'INSERT INTO', false);
        appendMatches(new RegExp(`\\bUPDATE\\s+${qualifiedTablePattern}`, 'gi'), 'update', 'UPDATE', false);
        appendMatches(new RegExp(`\\bDELETE\\s+FROM\\s+${qualifiedTablePattern}`, 'gi'), 'delete', 'DELETE FROM', false);

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
        schema?: string,
        statementIndex: number = 0,
        catalog?: string
    ): TableReferenceLocation | null {
        const identifierPattern = (identifier: string): string => {
            const escaped = escapeRegex(identifier);
            const doubleQuoted = escapeRegex(identifier.replace(/"/g, '""'));
            const backtickQuoted = escapeRegex(identifier.replace(/`/g, '``'));
            const bracketQuoted = escapeRegex(identifier.replace(/]/g, ']]'));
            return `(?:"${doubleQuoted}"|\`${backtickQuoted}\`|\\[${bracketQuoted}\\]|${escaped})`;
        };
        const tablePart = `(?<table>${identifierPattern(tableName)})`;
        const catalogPart = catalog
            ? `(?<catalog>${identifierPattern(catalog)})\\s*\\.\\s*`
            : '';
        const schemaPart = schema
            ? `(?<schema>${identifierPattern(schema)})\\s*\\.\\s*`
            : catalog
                ? ''
                : `(?:(?<schema>${REFERENCE_SQL_IDENTIFIER_PATTERN})\\s*\\.\\s*)?`;
        const qualifiedTablePart = `${catalogPart}${schemaPart}${tablePart}`;
        const searchableSql = this.maskSqlStringLiterals(maskSqlCommentsPreservingPositions(sql));
        const statementBoundaries = this.getStatementBoundaries(searchableSql);
        
        let pattern: RegExp;
        switch (context) {
            case 'FROM':
                pattern = new RegExp(`(?:\\bFROM\\s+|,\\s*)${qualifiedTablePart}(?![\\w$#@])`, 'gi');
                break;
            case 'JOIN':
                pattern = new RegExp(`\\b(?:INNER|LEFT|RIGHT|FULL|CROSS|OUTER)?\\s*JOIN\\s+${qualifiedTablePart}(?![\\w$#@])`, 'gi');
                break;
            case 'INSERT INTO':
                pattern = new RegExp(`\\bINSERT\\s+INTO\\s+${qualifiedTablePart}(?![\\w$#@])`, 'gi');
                break;
            case 'UPDATE':
                pattern = new RegExp(`\\bUPDATE\\s+${qualifiedTablePart}(?![\\w$#@])`, 'gi');
                break;
            case 'DELETE FROM':
                pattern = new RegExp(`\\bDELETE\\s+FROM\\s+${qualifiedTablePart}(?![\\w$#@])`, 'gi');
                break;
            default:
                return null;
        }

        let m: RegExpExecArray | null;
        while ((m = pattern.exec(searchableSql)) !== null) {
            const rawTable = m.groups?.table || tableName;
            const rawSchema = m.groups?.schema;
            const rawCatalog = m.groups?.catalog;
            const tableOffset = m[0].lastIndexOf(rawTable);
            const tableIndex = m.index + Math.max(0, tableOffset);
            const matchStatementIndex = this.getStatementIndex(statementBoundaries, tableIndex);
            const statementStart = statementBoundaries[matchStatementIndex] ?? 0;
            const isCommaFromEntry = context === 'FROM' && m[0].trimStart().startsWith(',');
            if (matchStatementIndex === statementIndex
                && (!isCommaFromEntry || this.isTopLevelFromListPosition(searchableSql, statementStart, m.index))
                && this.identifierMatches(rawTable, tableName)
                && this.identifierMatches(rawSchema, schema)
                && this.identifierMatches(rawCatalog, catalog)) {
                const lineNum = this.getLineNumberAtIndex(searchableSql, tableIndex);
                return {
                    lineNumber: lineNum,
                    charIndex: tableIndex,
                    nameQuoted: this.isQuotedIdentifier(rawTable),
                    schemaQuoted: this.isQuotedIdentifier(rawSchema),
                    catalogQuoted: this.isQuotedIdentifier(rawCatalog),
                };
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
        tableItem: AstTableRef,
        stmt: AstStatement,
        _aliasMap: AliasMap
    ): ColumnReference[] {
        if (!stmt || !this.options.extractColumns) {
            return [];
        }

        const tableName = this.getTableNameFromItem(tableItem);
        const tableAlias = typeof tableItem.as === 'string' ? tableItem.as : undefined;
        const columns: ColumnReference[] = [];

        // Build alias map from the statement
        const tableAliases = this.columnExtractor.buildAliasMap(stmt);

        // Add this table's alias
        if (tableAlias && tableName) {
            tableAliases.set(tableAlias, tableName);
        }

        // Extract columns from SELECT clause
        if (stmt.columns && Array.isArray(stmt.columns)) {
            for (const col of stmt.columns) {
                if (typeof col === 'string' || !col.expr) {continue;}
                const usedCols = this.extractColumnsFromExpression(col.expr as AstExpression, tableAliases, 'select');
                for (const usedCol of usedCols) {
                    if (this.isColumnFromTable(usedCol, tableName || undefined, tableAlias || undefined, tableAliases)) {
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
        expr: AstExpression,
        tableAliases: Map<string, string>,
        context: ColumnUsageContext
    ): ColumnReference[] {
        if (!expr) {return [];}

        const columns: ColumnReference[] = [];

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
        col: ColumnReference,
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
    private getTableNameFromItem(item: AstTableIdentifier): string | undefined {
        if (!item) {return undefined;}
        if (typeof item === 'string') {return item;}

        if (item.table) {
            return this.getTableNameFromItem(item.table as AstTableIdentifier);
        }

        if (item.value) {
            return item.value;
        }

        return undefined;
    }

    /**
     * Deduplicate columns by name and context
     */
    private deduplicateColumns(columns: ColumnReference[]): ColumnReference[] {
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
            // Structured AST references and regex fallbacks have already applied
            // context-aware reserved-word filtering. Keep legal one-character
            // names and delimited reserved identifiers here.
            if (!ref.tableName) {
                return false;
            }

            if (this.isReservedWord(ref.tableName) && !ref.nameQuoted) {
                return false;
            }

            // Filter out names that are purely numeric
            if (/^\d+$/.test(ref.tableName) && !ref.nameQuoted) {
                return false;
            }

            const relationKey = getQualifiedKey(ref.tableName, ref.schema, ref);
            const key = `${relationKey}|${ref.referenceType}|${ref.statementIndex ?? 0}|${ref.lineNumber}`;
            if (seen.has(key)) {return false;}
            seen.add(key);
            return true;
        });
    }

    /**
     * Extract subquery aliases from UPDATE...FROM patterns using balanced parenthesis matching
     * More efficient than regex with large ranges that can cause catastrophic backtracking
     */
    private extractUpdateFromAliases(
        sql: string,
        addAlias: (name: string, charIndex: number) => void,
        reservedWords: Set<string>
    ): void {
        const statementBoundaries = this.getStatementBoundaries(sql);
        const updatePattern = /\bUPDATE\b/gi;
        let updateMatch: RegExpExecArray | null;
        while ((updateMatch = updatePattern.exec(sql)) !== null) {
            const updateIndex = updateMatch.index;
            const statementIndex = this.getStatementIndex(statementBoundaries, updateIndex);
            const statementEnd = statementBoundaries[statementIndex + 1] ?? sql.length;
            const fromPattern = /\bFROM\b/gi;
            fromPattern.lastIndex = updateIndex + updateMatch[0].length;
            const fromMatch = fromPattern.exec(sql);
            if (!fromMatch || fromMatch.index >= statementEnd) {
                continue;
            }
            const fromIndex = fromMatch.index;

            // This helper is specifically for UPDATE ... FROM (subquery) alias
            // declarations. Do not borrow a parenthesis from a later expression.
            const openParenIndex = sql.indexOf('(', fromIndex + fromMatch[0].length);
            if (openParenIndex === -1 || openParenIndex >= statementEnd
                || !/^\s*$/.test(sql.slice(fromIndex + fromMatch[0].length, openParenIndex))) {
                continue;
            }

            // Find the matching closing paren using balanced counting
            let parenCount = 0;
            let closeParenIndex = -1;
            for (let i = openParenIndex; i < statementEnd; i++) {
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
                // Check for alias after the closing paren. SQL allows both
                // "AS alias" and bare "alias" forms.
                const afterParen = sql.substring(closeParenIndex + 1, closeParenIndex + 50).trim();
                const aliasMatch = afterParen.match(/^(?:AS\s+)?(\w+)/i);
                if (aliasMatch) {
                    const aliasName = aliasMatch[1].toLowerCase();
                    if (!reservedWords.has(aliasName)) {
                        addAlias(aliasName, updateIndex);
                    }
                }
            }
        }
    }
}
