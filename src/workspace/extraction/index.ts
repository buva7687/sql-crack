// Extraction Module - Exports all extraction functionality

// Types
export type {
    // Column types
    ColumnInfo,
    ColumnReference,
    ColumnUsageContext,
    ForeignKeyRef,

    // Table/Schema types
    SchemaDefinition,
    TableReference,
    ReferenceType,

    // Query analysis types
    QueryAnalysis,
    StatementType,
    Transformation,
    TransformationType,
    CTEDefinition,

    // File analysis
    FileAnalysis,

    // Alias tracking
    AliasMap,

    // Options
    ExtractionOptions,
    SqlDialect,

    // Backward compatibility
    ColumnDefinition
} from './types';

// Constants
export { DEFAULT_EXTRACTION_OPTIONS } from './types';

// Utility functions
export { toColumnDefinition, toColumnInfo } from './types';

// Extractors
export { SchemaExtractor } from './schemaExtractor';
export { ReferenceExtractor } from './referenceExtractor';
