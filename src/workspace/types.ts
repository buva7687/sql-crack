// Workspace SQL Analysis Types

// Import types from extraction module for use in this file
import type {
    SqlDialect as SqlDialectType,
    ColumnDefinition as ColumnDefinitionType,
    ColumnInfo as ColumnInfoType,
    ForeignKeyRef as ForeignKeyRefType,
    SchemaDefinition as SchemaDefinitionType,
    TableReference as TableReferenceType,
    FileAnalysis as FileAnalysisType,
    ReferenceType as ReferenceTypeValue
} from './extraction';

// Re-export types from extraction module for backward compatibility
export type SqlDialect = SqlDialectType;
export type ColumnDefinition = ColumnDefinitionType;
export type ColumnInfo = ColumnInfoType;
export type ForeignKeyRef = ForeignKeyRefType;
export type SchemaDefinition = SchemaDefinitionType;
export type TableReference = TableReferenceType;
export type FileAnalysis = FileAnalysisType;
export type ReferenceType = ReferenceTypeValue;

// Re-export utility functions
export { toColumnDefinition, toColumnInfo } from './extraction';

/**
 * Workspace index containing all analyzed files
 */
export interface WorkspaceIndex {
    version: number;
    lastUpdated: number;
    fileCount: number;
    files: Map<string, FileAnalysis>;
    fileHashes: Map<string, string>;   // filePath -> contentHash for incremental parsing
    definitionMap: Map<string, SchemaDefinition[]>;  // qualifiedName (lowercase) -> definitions
    referenceMap: Map<string, TableReference[]>;     // qualifiedName (lowercase) -> references
}

/**
 * Serializable version of WorkspaceIndex for persistence
 */
export interface SerializedWorkspaceIndex {
    version: number;
    lastUpdated: number;
    fileCount: number;
    filesArray: [string, FileAnalysis][];
    fileHashesArray: [string, string][];   // filePath -> contentHash pairs
    definitionArray: [string, SchemaDefinition[]][];
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
    parseErrors: number;            // Files that failed to parse
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
export type GraphMode = 'files' | 'tables';

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
 * Returns true if operation should be cancelled
 */
export type ProgressCallback = (current: number, total: number, fileName: string) => void;

/**
 * Cancellation token for long-running operations
 */
export interface CancellationToken {
    isCancellationRequested: boolean;
}

/**
 * Search filter options for workspace
 */
export interface SearchFilter {
    query: string;                    // Search query text
    nodeTypes?: WorkspaceNode['type'][];  // Filter by node type
    useRegex: boolean;                // Enable regex matching
    caseSensitive: boolean;           // Case-sensitive search
}

/**
 * Search result with match details
 */
export interface SearchResult {
    nodeId: string;
    node: WorkspaceNode;
    matchType: 'name' | 'filePath' | 'definition' | 'reference';
    matchText: string;
    matchPosition?: number;           // Character position of match
}

/**
 * Enhanced statistics with detailed issue information
 */
export interface DetailedWorkspaceStats extends WorkspaceStats {
    orphanedDetails: DefinitionDetail[];
    missingDetails: MissingDefinitionDetail[];
    parseErrorDetails: ParseErrorDetail[];
}

/**
 * Detail for an orphaned definition
 */
export interface DefinitionDetail {
    name: string;
    type: 'table' | 'view';
    filePath: string;
    lineNumber: number;
}

/**
 * Detail for a missing definition
 */
export interface MissingDefinitionDetail {
    tableName: string;
    references: TableReference[];
    referenceCount: number;
    referencingFiles: string[];
}

/**
 * Detail for a file that failed to parse
 */
export interface ParseErrorDetail {
    filePath: string;
    fileName: string;
    error: string;
}
