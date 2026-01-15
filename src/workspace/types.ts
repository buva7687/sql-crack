// Workspace SQL Analysis Types

// Re-export SqlDialect for convenience
export type { SqlDialect } from '../webview/types/parser';

/**
 * Column definition extracted from CREATE TABLE
 */
export interface ColumnDefinition {
    name: string;
    dataType: string;
    nullable: boolean;
    primaryKey: boolean;
    foreignKey?: ForeignKeyRef;
}

/**
 * Foreign key reference
 */
export interface ForeignKeyRef {
    referencedTable: string;
    referencedColumn: string;
}

/**
 * Schema definition from CREATE TABLE/VIEW statements
 */
export interface SchemaDefinition {
    type: 'table' | 'view';
    name: string;
    schema?: string;           // Database schema (e.g., dbo, public)
    columns: ColumnDefinition[];
    filePath: string;
    lineNumber: number;
    sql: string;               // Original SQL statement
}

/**
 * Table reference extracted from queries
 */
export interface TableReference {
    tableName: string;
    referenceType: 'select' | 'insert' | 'update' | 'delete' | 'join' | 'subquery';
    filePath: string;
    lineNumber: number;
    context: string;           // Surrounding SQL context (e.g., "FROM", "JOIN")
}

/**
 * Analysis result for a single SQL file
 */
export interface FileAnalysis {
    filePath: string;
    fileName: string;
    lastModified: number;
    definitions: SchemaDefinition[];
    references: TableReference[];
    parseError?: string;
}

/**
 * Workspace index containing all analyzed files
 */
export interface WorkspaceIndex {
    version: number;
    lastUpdated: number;
    fileCount: number;
    files: Map<string, FileAnalysis>;
    definitionMap: Map<string, SchemaDefinition>;  // tableName (lowercase) -> definition
    referenceMap: Map<string, TableReference[]>;   // tableName (lowercase) -> references
}

/**
 * Serializable version of WorkspaceIndex for persistence
 */
export interface SerializedWorkspaceIndex {
    version: number;
    lastUpdated: number;
    fileCount: number;
    filesArray: [string, FileAnalysis][];
    definitionArray: [string, SchemaDefinition][];
    referenceArray: [string, TableReference[]][];
}

/**
 * Node in the workspace dependency graph
 */
export interface WorkspaceNode {
    id: string;
    type: 'file' | 'table' | 'view' | 'external';
    label: string;
    filePath?: string;
    definitions?: SchemaDefinition[];
    references?: TableReference[];
    definitionCount?: number;
    referenceCount?: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Edge in the workspace dependency graph
 */
export interface WorkspaceEdge {
    id: string;
    source: string;            // Source node ID
    target: string;            // Target node ID
    referenceType: TableReference['referenceType'];
    count: number;             // Number of references
    tables: string[];          // Table names involved
}

/**
 * Statistics about the workspace
 */
export interface WorkspaceStats {
    totalFiles: number;
    totalTables: number;
    totalViews: number;
    totalReferences: number;
    orphanedDefinitions: string[];  // Tables defined but never referenced
    missingDefinitions: string[];   // Tables referenced but not defined
    circularDependencies: string[]; // Files with circular dependencies
}

/**
 * Complete workspace dependency graph
 */
export interface WorkspaceDependencyGraph {
    nodes: WorkspaceNode[];
    edges: WorkspaceEdge[];
    stats: WorkspaceStats;
}

/**
 * Graph visualization mode
 */
export type GraphMode = 'files' | 'tables' | 'hybrid';

/**
 * Options for workspace analysis
 */
export interface WorkspaceAnalysisOptions {
    dialect: string;
    includePatterns?: string[];   // Glob patterns to include
    excludePatterns?: string[];   // Glob patterns to exclude
    maxFileSize?: number;         // Skip files larger than this (bytes)
}

/**
 * Progress callback for long operations
 */
export type ProgressCallback = (current: number, total: number, fileName: string) => void;
