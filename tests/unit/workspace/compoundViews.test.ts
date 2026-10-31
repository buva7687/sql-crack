import { SchemaExtractor, ReferenceExtractor } from '../../../src/workspace/extraction';
import type { SqlDialect } from '../../../src/workspace/types';
import { LineageBuilder } from '../../../src/workspace/lineage';
import { getQualifiedKey } from '../../../src/workspace/identifiers';

describe('compound CREATE VIEW extraction', () => {
    it.each(['PostgreSQL', 'MySQL', 'Snowflake'] as SqlDialect[])('extracts both UNION sources without fallback in %s', dialect => {
        const sql = 'CREATE VIEW combined (id) AS SELECT id FROM a UNION ALL SELECT id FROM b;';
        const definitions = new SchemaExtractor().extractDefinitionsWithStatus(sql, '/views.sql', dialect);
        const references = new ReferenceExtractor().extractReferencesWithStatus(sql, '/views.sql', dialect);
        expect(definitions.warnings).toEqual([]);
        expect(references.warnings).toEqual([]);
        expect(definitions.definitions.map(definition => definition.name)).toEqual(['combined']);
        expect(references.references.map(reference => reference.tableName)).toEqual(['a', 'b']);
        expect(references.queries[0].statementType).toBe('create_view');
        expect(references.queries[0].setOperationBranches).toHaveLength(1);
    });

    it.each(['PostgreSQL', 'MySQL', 'Snowflake'] as SqlDialect[])('builds column lineage for an inferred-column UNION view in %s', dialect => {
        const filePath = '/views.sql';
        const sql = 'CREATE TABLE a (id INT); CREATE TABLE b (id INT); CREATE VIEW combined AS SELECT id FROM a UNION ALL SELECT id FROM b;';
        const { definitions, warnings } = new SchemaExtractor().extractDefinitionsWithStatus(sql, filePath, dialect);
        const extracted = new ReferenceExtractor().extractReferencesWithStatus(sql, filePath, dialect);
        expect(warnings).toEqual([]);
        expect(extracted.warnings).toEqual([]);
        const graph = new LineageBuilder({ includeExternal: true, includeColumns: true, dialect }).buildFromIndex({
            version: 9, lastUpdated: 1, fileCount: 1,
            files: new Map([[filePath, { filePath, fileName: 'views.sql', lastModified: 1, contentHash: 'hash', definitions, references: extracted.references, queries: extracted.queries }]]),
            definitionMap: new Map(definitions.map(definition => [getQualifiedKey(definition.name, definition.schema, definition), [definition]])),
            fileHashes: new Map(), referenceMap: new Map(),
        });
        const view = definitions.find(definition => definition.type === 'view')!;
        const sources = definitions.filter(definition => definition.type === 'table');
        const edges = graph.columnEdges.filter(edge => edge.targetTableId === `view:${getQualifiedKey(view.name, view.schema, view)}`);
        expect(edges.map(edge => edge.sourceTableId)).toEqual(sources.map(source => `table:${getQualifiedKey(source.name, source.schema, source)}`));
        expect(edges.every(edge => edge.targetColumnName.toLowerCase() === 'id')).toBe(true);
    });

    it('keeps parser warnings for malformed compound view bodies', () => {
        const sql = 'CREATE VIEW broken AS SELECT id FROM a UNION ALL SELECT FROM;';
        expect(new SchemaExtractor().extractDefinitionsWithStatus(sql, '/views.sql', 'PostgreSQL').warnings.length).toBeGreaterThan(0);
        expect(new ReferenceExtractor().extractReferencesWithStatus(sql, '/views.sql', 'PostgreSQL').warnings.length).toBeGreaterThan(0);
    });
});
