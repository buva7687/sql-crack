import { parentPort } from 'worker_threads';
import { SchemaExtractor, ReferenceExtractor } from './extraction';
import type { SqlDialect } from './extraction/types';
const schemas = new SchemaExtractor();
const references = new ReferenceExtractor();
parentPort?.on('message', ({ sql, filePath, dialect }: { sql: string; filePath: string; dialect: SqlDialect }) => {
    try {
        const definitions = schemas.extractDefinitionsWithStatus(sql, filePath, dialect);
        const inputs = references.extractReferencesWithStatus(sql, filePath, dialect);
        parentPort?.postMessage({ result: {
            definitions: definitions.definitions,
            references: inputs.references,
            queries: inputs.queries,
            warnings: [...definitions.warnings, ...inputs.warnings]
        } });
    } catch (error) {
        parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
});
