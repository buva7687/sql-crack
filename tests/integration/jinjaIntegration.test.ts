import { parseSql } from '../../src/webview/sqlParser';
import { stripSqlComments } from '../../src/shared/stringUtils';
import { preprocessJinjaTemplates } from '../../src/webview/parser/dialects/jinjaPreprocessor';
import { ReferenceExtractor } from '../../src/workspace/extraction/referenceExtractor';
import { SchemaExtractor } from '../../src/workspace/extraction/schemaExtractor';

const DBT_MODEL_SQL = `
{{ config(materialized='table') }}

WITH source_data AS (
    SELECT *
    FROM {{ source('raw', 'customers') }}
    WHERE created_at > {{ var('start_date') }}
),
model_ref AS (
    SELECT *
    FROM {{ ref('stg_orders') }}
    {% if target.name == 'prod' %}
    WHERE status = 'active'
    {% else %}
    WHERE 1 = 1
    {% endif %}
)
SELECT
    s.id,
    m.order_id
FROM source_data s
JOIN model_ref m ON s.id = m.customer_id
`;

function hasExecutableSqlLikeWebview(sql: string): boolean {
    const { rewritten } = preprocessJinjaTemplates(sql);
    return stripSqlComments(rewritten).trim().length > 0;
}

describe('DBT/Jinja integration', () => {
    it('parses a representative DBT model without errors and produces lineage artifacts', () => {
        const result = parseSql(DBT_MODEL_SQL, 'MySQL');
        const tableNames = Array.from(result.tableUsage.keys());
        const outputColumns = result.columnLineage.map(item => item.outputColumn.toLowerCase());

        expect(result.error).toBeUndefined();
        expect(result.partial).toBeUndefined();
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(tableNames).toEqual(expect.arrayContaining(['customers', 'stg_orders']));
        expect(result.columnLineage.length).toBeGreaterThan(0);
        expect(result.columnFlows?.length ?? 0).toBeGreaterThan(0);
        expect(outputColumns).toEqual(expect.arrayContaining(['id', 'order_id']));
        expect(result.hints.some(hint => hint.message.includes('DBT/Jinja templates detected'))).toBe(true);
    });

    it('falls back to regex parsing and still extracts DBT references', () => {
        const malformedSql = `${DBT_MODEL_SQL}\nFROOM broken_syntax`;
        const result = parseSql(malformedSql, 'MySQL');
        const tableNames = Array.from(result.tableUsage.keys());

        expect(result.partial).toBe(true);
        expect(tableNames).toEqual(expect.arrayContaining(['customers', 'stg_orders']));
    });

    it('workspace reference extraction works on both AST and regex fallback paths', () => {
        const extractor = new ReferenceExtractor();

        const astRefs = extractor.extractReferences(DBT_MODEL_SQL, 'models/customer_orders.sql', 'MySQL');
        const fallbackRefs = extractor.extractReferences(
            `${DBT_MODEL_SQL}\nQUALIFY ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY m.order_id DESC) = 1`,
            'models/customer_orders.sql',
            'MySQL'
        );

        expect(astRefs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 'customers', schema: 'raw' }),
            expect.objectContaining({ tableName: 'stg_orders' }),
        ]));
        expect(fallbackRefs).toEqual(expect.arrayContaining([
            expect.objectContaining({ tableName: 'customers', schema: 'raw' }),
            expect.objectContaining({ tableName: 'stg_orders' }),
        ]));
    });

    it('workspace schema extraction tolerates Jinja in CREATE VIEW bodies', () => {
        const extractor = new SchemaExtractor();
        const defs = extractor.extractDefinitions(
            `
            CREATE VIEW customer_orders AS
            SELECT *
            FROM {{ ref('stg_orders') }};
            `,
            'models/customer_orders.sql',
            'MySQL'
        );

        expect(defs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'view',
                name: 'customer_orders',
            }),
        ]));
    });

    it('treats DBT models as executable SQL but config-only files as non-executable', () => {
        expect(hasExecutableSqlLikeWebview(DBT_MODEL_SQL)).toBe(true);
        expect(hasExecutableSqlLikeWebview("{{ config(materialized='table') }}")).toBe(false);
    });
});
