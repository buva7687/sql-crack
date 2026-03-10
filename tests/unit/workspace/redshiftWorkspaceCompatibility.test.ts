jest.mock('fs');

import * as fs from 'fs';
import * as path from 'path';
import { ReferenceExtractor } from '../../../src/workspace/extraction/referenceExtractor';
import { SchemaExtractor } from '../../../src/workspace/extraction/schemaExtractor';
import { LineageBuilder } from '../../../src/workspace/lineage/lineageBuilder';
import type { WorkspaceIndex, SchemaDefinition, FileAnalysis, TableReference } from '../../../src/workspace/types';

const mockedFs = fs as jest.Mocked<typeof fs>;

function makeDef(
    name: string,
    type: 'table' | 'view' = 'table',
    extra?: Partial<SchemaDefinition>
): SchemaDefinition {
    return {
        type,
        name,
        columns: [],
        filePath: extra?.filePath ?? 'test.sql',
        lineNumber: extra?.lineNumber ?? 1,
        sql: extra?.sql ?? `CREATE ${type.toUpperCase()} ${name}`,
        ...extra
    };
}

function makeFileAnalysis(
    filePath: string,
    defs: SchemaDefinition[] = [],
    refs: TableReference[] = [],
    queries?: any[]
): FileAnalysis {
    return {
        filePath,
        fileName: path.basename(filePath),
        lastModified: Date.now(),
        contentHash: 'abc123',
        definitions: defs,
        references: refs,
        queries
    } as FileAnalysis;
}

function makeIndex(
    defs: SchemaDefinition[] = [],
    files: Map<string, FileAnalysis> = new Map()
): WorkspaceIndex {
    const definitionMap = new Map<string, SchemaDefinition[]>();
    for (const def of defs) {
        const key = (def.schema ? `${def.schema}.` : '') + def.name.toLowerCase();
        if (!definitionMap.has(key)) {
            definitionMap.set(key, []);
        }
        definitionMap.get(key)!.push(def);
    }
    return {
        version: 1,
        lastUpdated: Date.now(),
        fileCount: files.size,
        files,
        fileHashes: new Map(),
        definitionMap,
        referenceMap: new Map()
    };
}

describe('Redshift workspace compatibility', () => {
    let referenceExtractor: ReferenceExtractor;
    let schemaExtractor: SchemaExtractor;

    beforeEach(() => {
        jest.resetAllMocks();
        mockedFs.existsSync.mockReturnValue(false);
        referenceExtractor = new ReferenceExtractor();
        schemaExtractor = new SchemaExtractor();
    });

    it('extracts SELECT INTO targets as table definitions and keeps source references', () => {
        const sql = `
            SELECT DISTINCT user_id
            INTO analytics.daily_users
            FROM raw_events
        `;

        const definitions = schemaExtractor.extractDefinitions(sql, 'daily_users.sql', 'Redshift');
        const references = referenceExtractor.extractReferences(sql, 'daily_users.sql', 'Redshift');

        expect(definitions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'table',
                name: 'daily_users',
                schema: 'analytics',
            }),
        ]));
        expect(references).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'raw_events',
                referenceType: 'select',
                context: 'FROM',
            }),
        ]));
        const def = definitions.find((entry) => entry.name === 'daily_users');
        expect(def?.lineNumber).toBeGreaterThanOrEqual(1);
        // def.sql must match the CTAS pattern for lineageBuilder.ts:345 to build edges
        expect(def?.sql).toBeTruthy();
        expect(def?.sql).toMatch(/\bAS\s+(?:SELECT|WITH)\b/i);
    });

    it('extracts Redshift CTAS with physical options through workspace preprocessing', () => {
        const sql = `
            CREATE TABLE analytics.sales_by_customer
            DISTSTYLE KEY
            DISTKEY(customer_id)
            SORTKEY(sale_date)
            AS
            SELECT customer_id, sale_date
            FROM sales
        `;

        const definitions = schemaExtractor.extractDefinitions(sql, 'sales_by_customer.sql', 'Redshift');
        const references = referenceExtractor.extractReferences(sql, 'sales_by_customer.sql', 'Redshift');

        expect(definitions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'table',
                name: 'sales_by_customer',
                schema: 'analytics',
            }),
        ]));
        expect(references).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'sales',
                referenceType: 'select',
                context: 'FROM',
            }),
        ]));
    });

    it('extracts Redshift late-binding views after preprocessing', () => {
        const sql = `
            CREATE VIEW analytics.active_sales AS
            SELECT * FROM sales
            WITH NO SCHEMA BINDING
        `;

        const definitions = schemaExtractor.extractDefinitions(sql, 'active_sales.sql', 'Redshift');
        const references = referenceExtractor.extractReferences(sql, 'active_sales.sql', 'Redshift');

        expect(definitions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'view',
                name: 'active_sales',
                schema: 'analytics',
            }),
        ]));
        expect(references).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tableName: 'sales',
                referenceType: 'select',
                context: 'FROM',
            }),
        ]));
    });

    describe('SELECT INTO lineage integration', () => {
        it('SELECT INTO definition has correct lineNumber and sql for CTAS lineage detection', () => {
            const sql = `
                WITH recent_events AS (
                    SELECT user_id
                    FROM raw_events
                )
                SELECT DISTINCT user_id
                INTO analytics.daily_users
                FROM recent_events
            `;

            const definitions = schemaExtractor.extractDefinitions(sql, 'daily_users.sql', 'Redshift');
            const def = definitions.find(d => d.name === 'daily_users');

            expect(def).toBeDefined();
            // lineNumber must point near the actual statement, not fall back to 1
            expect(def!.lineNumber).toBeGreaterThan(1);
            // sql must be truthy and match the CTAS pattern so lineageBuilder.ts:345
            // recognises it via /\bAS\s+(?:SELECT|\()/i and builds lineage edges
            expect(def!.sql).toBeTruthy();
            expect(def!.sql).toMatch(/\bAS\s+(?:SELECT|WITH)\b/i);
        });

        it('SELECT INTO creates a lineage edge from source to target in LineageBuilder', () => {
            const sql = `
                WITH recent_events AS (
                    SELECT user_id
                    FROM raw_events
                )
                SELECT DISTINCT user_id
                INTO analytics.daily_users
                FROM recent_events
            `;
            const definitions = schemaExtractor.extractDefinitions(sql, 'daily_users.sql', 'Redshift');
            const references = referenceExtractor.extractReferences(sql, 'daily_users.sql', 'Redshift');
            const selectIntoDef = definitions.find((entry) => entry.name === 'daily_users');

            expect(selectIntoDef).toBeDefined();
            const sourceTableDef = makeDef('raw_events', 'table', {
                filePath: 'events.sql',
                lineNumber: 1,
            });

            const files = new Map<string, FileAnalysis>();
            files.set('daily_users.sql', makeFileAnalysis('daily_users.sql', [selectIntoDef!], references));
            files.set('events.sql', makeFileAnalysis('events.sql', [sourceTableDef], []));

            const index = makeIndex([selectIntoDef!, sourceTableDef], files);
            const builder = new LineageBuilder();
            builder.buildFromIndex(index);

            // The CTAS lineage path (lineageBuilder.ts:345) should create an edge
            // from raw_events -> analytics.daily_users
            const targetNodeId = Array.from(builder.nodes.keys()).find(k => k.includes('daily_users'));
            expect(targetNodeId).toBeDefined();

            const hasEdgeFromSource = Array.from(builder.edges.values()).some(
                e => e.sourceId.includes('raw_events') && e.targetId.includes('daily_users')
            );
            expect(hasEdgeFromSource).toBe(true);
        });
    });
});
