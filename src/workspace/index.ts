// Workspace SQL Analysis Module - Exports

// Types (re-exported from extraction for backward compatibility)
export * from './types';

// Extraction module - only export classes (types already exported via ./types)
export { SchemaExtractor, ReferenceExtractor, DEFAULT_EXTRACTION_OPTIONS } from './extraction';

// Core workspace functionality
export { WorkspaceScanner } from './scanner';
export { IndexManager } from './indexManager';
export { buildDependencyGraph } from './dependencyGraph';
export { WorkspacePanel } from './workspacePanel';
