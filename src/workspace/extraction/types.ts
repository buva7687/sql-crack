// Extraction Types - Core interfaces for SQL extraction
// These types support column-level lineage tracking

import { SqlDialect } from '../../webview/types/parser';

// Re-export SqlDialect for convenience
export type { SqlDialect };

// =============================================================================
// COLUMN TYPES
// =============================================================================

/**
 * Detailed column information with source tracking
 */
export interface ColumnInfo {
    name: string;
    dataType: string;
    nullable: boolean;
    primaryKey: boolean;
    foreignKey?: ForeignKeyRef;

    // Lineage tracking (populated during query analysis)
    sourceTable?: string;       // Original table this column comes from
    sourceColumn?: string;      // Original column name (if aliased or transformed)
    expression?: string;        // Full expression for computed columns
    isComputed?: boolean;       // True if derived from expression/function (default: false)
    lineNumber?: number;
}

/**
 * Foreign key reference
 */
export interface ForeignKeyRef {
    referencedTable: string;
    referencedColumn: string;
}

/**
 * Reference to a specific column within a query
 */
export interface ColumnReference {
    columnName: string;
    tableName?: string;         // Resolved table name (from alias or explicit)
    tableAlias?: string;        // Alias used in query
    schema?: string;
    expression?: string;        // Full expression if computed
    usedIn: ColumnUsageContext;
    lineNumber: number;
}

/**
 * Where a column is used in a query
 */
export type ColumnUsageContext =
    | 'select'      // In SELECT clause
    | 'where'       // In WHERE clause
    | 'join'        // In JOIN condition
    | 'group'       // In GROUP BY
    | 'order'       // In ORDER BY
    | 'having'      // In HAVING clause
    | 'set'         // In UPDATE SET clause
    | 'insert'      // In INSERT column list
    | 'partition'   // In PARTITION BY
    | 'function';   // As function argument

// =============================================================================
// TABLE/SCHEMA TYPES
// =============================================================================

/**
 * Schema definition from CREATE TABLE/VIEW statements
 */
export interface SchemaDefinition {
    type: 'table' | 'view';
    name: string;
    schema?: string;            // Database schema (e.g., dbo, public)
    columns: ColumnInfo[];
    filePath: string;
    lineNumber: number;
    sql: string;                // Original SQL statement

    // View-specific (for lineage tracking)
    sourceQuery?: QueryAnalysis;  // Parsed SELECT for views
}

/**
 * Table reference extracted from queries
 */
export interface TableReference {
    tableName: string;
    alias?: string;             // Table alias (e.g., "customers AS c")
    schema?: string;
    referenceType: ReferenceType;
    filePath: string;
    lineNumber: number;
    context: string;            // SQL context (e.g., "FROM", "JOIN", "INSERT INTO")

    // Column-level tracking (populated by column extractor)
    columns?: ColumnReference[];  // Columns used from this table
}

/**
 * Type of table reference
 */
export type ReferenceType =
    | 'select'
    | 'insert'
    | 'update'
    | 'delete'
    | 'join'
    | 'subquery'
    | 'cte'
    | 'merge';

// =============================================================================
// QUERY ANALYSIS TYPES
// =============================================================================

/**
 * Complete analysis of a single SQL query/statement
 */
export interface QueryAnalysis {
    statementType: StatementType;

    // Output (what this query produces)
    outputColumns: ColumnInfo[];

    // Input (what this query consumes)
    inputTables: TableReference[];
    inputColumns: ColumnReference[];

    // Transformations (how output relates to input)
    transformations: Transformation[];

    // CTEs defined in this query
    ctes: CTEDefinition[];

    // Subqueries (nested SELECT statements)
    subqueries: QueryAnalysis[];

    // Source location
    lineNumber: number;
    sql?: string;
}

/**
 * SQL statement type
 */
export type StatementType =
    | 'select'
    | 'insert'
    | 'update'
    | 'delete'
    | 'create_table'
    | 'create_view'
    | 'merge'
    | 'cte'
    | 'unknown';

/**
 * Describes how an output column is derived from input columns
 */
export interface Transformation {
    outputColumn: string;           // Name of output column
    outputAlias?: string;           // Alias if different from column name
    inputColumns: ColumnReference[]; // Source columns used
    operation: TransformationType;   // Type of transformation
    expression: string;              // Full SQL expression
    lineNumber: number;
}

/**
 * Type of column transformation
 */
export type TransformationType =
    | 'direct'       // Direct column reference (SELECT col)
    | 'alias'        // Simple alias (SELECT col AS alias)
    | 'concat'       // String concatenation
    | 'arithmetic'   // Math operations (+, -, *, /)
    | 'aggregate'    // Aggregate functions (SUM, COUNT, etc.)
    | 'scalar'       // Scalar functions (UPPER, COALESCE, etc.)
    | 'case'         // CASE expressions
    | 'cast'         // Type casting
    | 'window'       // Window functions
    | 'subquery'     // Scalar subquery
    | 'literal'      // Literal value (no input columns)
    | 'complex';     // Complex expression (multiple operations)

/**
 * CTE (Common Table Expression) definition
 */
export interface CTEDefinition {
    name: string;
    columns?: string[];          // Explicit column list if specified
    query: QueryAnalysis;        // The CTE's SELECT statement
    isRecursive: boolean;
    lineNumber: number;
}

// =============================================================================
// FILE ANALYSIS TYPES
// =============================================================================

/**
 * Complete analysis result for a single SQL file
 */
export interface FileAnalysis {
    filePath: string;
    fileName: string;
    lastModified: number;
    contentHash: string;         // SHA-256 hash for change detection

    // Schema definitions (CREATE TABLE/VIEW)
    definitions: SchemaDefinition[];

    // Table references (queries)
    references: TableReference[];

    // Detailed query analysis (for lineage)
    queries?: QueryAnalysis[];

    // Parse status
    parseError?: string;
    parseWarnings?: string[];
}

// =============================================================================
// ALIAS TRACKING
// =============================================================================

/**
 * Tracks table aliases within a query scope
 */
export interface AliasMap {
    // alias -> { tableName, schema }
    tables: Map<string, { tableName: string; schema?: string }>;

    // CTE names in current scope (to avoid false references)
    cteNames: Set<string>;

    // Column aliases in current SELECT scope
    // alias -> { expression, sourceColumns }
    columns: Map<string, {
        expression: string;
        sourceColumns: ColumnReference[];
    }>;
}

// =============================================================================
// EXTRACTION OPTIONS
// =============================================================================

/**
 * Options for extraction process
 */
export interface ExtractionOptions {
    dialect: SqlDialect;

    // Feature flags
    extractColumns: boolean;      // Extract column-level info (slower)
    extractTransformations: boolean; // Extract transformation logic
    trackAliases: boolean;        // Resolve aliases to original names

    // Performance limits
    maxSubqueryDepth: number;     // Max nested subquery depth to process
    maxColumnsPerQuery: number;   // Max columns to extract per query
}

/**
 * Default extraction options
 */
export const DEFAULT_EXTRACTION_OPTIONS: ExtractionOptions = {
    dialect: 'MySQL',
    extractColumns: true,
    extractTransformations: true,
    trackAliases: true,
    maxSubqueryDepth: 10,
    maxColumnsPerQuery: 500
};

// =============================================================================
// BACKWARD COMPATIBILITY
// =============================================================================

// Re-export types that match existing workspace/types.ts structure
// This ensures existing code continues to work

/**
 * @deprecated Use ColumnInfo instead
 */
export interface ColumnDefinition {
    name: string;
    dataType: string;
    nullable: boolean;
    primaryKey: boolean;
    foreignKey?: ForeignKeyRef;
}

/**
 * Convert ColumnInfo to legacy ColumnDefinition
 */
export function toColumnDefinition(col: ColumnInfo): ColumnDefinition {
    return {
        name: col.name,
        dataType: col.dataType,
        nullable: col.nullable,
        primaryKey: col.primaryKey,
        foreignKey: col.foreignKey
    };
}

/**
 * Convert legacy ColumnDefinition to ColumnInfo
 */
export function toColumnInfo(col: ColumnDefinition): ColumnInfo {
    return {
        ...col,
        isComputed: false
    };
}
