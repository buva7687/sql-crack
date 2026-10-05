import { SchemaExtractor, ReferenceExtractor } from '../../src/workspace/extraction';
export class WorkspaceAnalysisError extends Error {}
export class WorkspaceAnalysisClient {
    async analyze(sql: string, filePath: string, dialect: any) {
        const schemas = new SchemaExtractor().extractDefinitionsWithStatus(sql, filePath, dialect);
        const references = new ReferenceExtractor().extractReferencesWithStatus(sql, filePath, dialect);
        return { definitions: schemas.definitions, references: references.references, queries: references.queries,
            warnings: [...schemas.warnings, ...references.warnings] };
    }
    dispose() {}
}
