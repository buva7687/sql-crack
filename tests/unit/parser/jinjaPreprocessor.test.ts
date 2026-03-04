import { parseSql } from '../../../src/webview/sqlParser';
import { containsJinjaTemplates, preprocessJinjaTemplates } from '../../../src/webview/parser/dialects/jinjaPreprocessor';

describe('jinja preprocessor', () => {
    it('rewrites ref and source expressions to parser-friendly identifiers', () => {
        const sql = `
SELECT *
FROM {{ ref('orders') }} o
JOIN {{ source('raw', 'customers') }} c ON o.customer_id = c.id
`;

        const { rewritten, hadJinja } = preprocessJinjaTemplates(sql);

        expect(hadJinja).toBe(true);
        expect(rewritten).toContain('FROM orders');
        expect(rewritten).toContain('JOIN raw.customers');
        expect(rewritten.length).toBe(sql.length);
        expect(rewritten.split('\n')).toHaveLength(sql.split('\n').length);
    });

    it('rewrites var, this, bare identifiers, and opaque expressions', () => {
        const sql = `
SELECT {{ my_column }}
FROM {{ this }}
WHERE status = {{ var('status') }}
  AND value = {{ adapter.dispatch('func') }}
`;

        const { rewritten } = preprocessJinjaTemplates(sql);

        expect(rewritten).toContain('SELECT my_column');
        expect(rewritten).toContain('FROM __dbt_this');
        expect(rewritten).toContain('__dbt_var_status__');
        expect(rewritten).toContain('__dbt_expr');
        expect(rewritten.length).toBe(sql.length);
    });

    it('removes config and jinja comments while preserving layout', () => {
        const sql = "{{ config(materialized='table') }}\n{# model comment #}\nSELECT 1";
        const { rewritten, hadJinja } = preprocessJinjaTemplates(sql);

        expect(hadJinja).toBe(true);
        expect(rewritten).toContain('\nSELECT 1');
        expect(rewritten).not.toContain('config(');
        expect(rewritten).not.toContain('model comment');
        expect(rewritten.length).toBe(sql.length);
        expect(rewritten.split('\n')).toHaveLength(sql.split('\n').length);
    });

    it('keeps only the first if branch and preserves for-loop bodies once', () => {
        const sql = `
{% if target.name == 'prod' %}
SELECT {{ col }}
{% elif target.name == 'stage' %}
SELECT stage_col
{% else %}
SELECT fallback_col
{% endif %}
FROM orders
{% for suffix in ['a', 'b'] %}
, {{ suffix }}
{% endfor %}
`;

        const { rewritten } = preprocessJinjaTemplates(sql);

        expect(rewritten).toContain('SELECT col');
        expect(rewritten).not.toContain('stage_col');
        expect(rewritten).not.toContain('fallback_col');
        expect(rewritten).toContain('FROM orders');
        expect(rewritten).toContain(', suffix');
    });

    it('handles nested and same-line if blocks without leaking stripped branches', () => {
        const sql = '{% if outer %}{% if inner %}A{% else %}B{% endif %}C{% else %}D{% endif %}';
        const { rewritten } = preprocessJinjaTemplates(sql);

        expect(rewritten).toContain('A');
        expect(rewritten).toContain('C');
        expect(rewritten).not.toContain('B');
        expect(rewritten).not.toContain('D');
        expect(rewritten.length).toBe(sql.length);
    });

    it('whitespace-replaces inline set tags', () => {
        const sql = "{% set cutoff = '2024-01-01' %}\nSELECT * FROM orders";
        const { rewritten } = preprocessJinjaTemplates(sql);

        expect(rewritten).not.toContain('cutoff');
        expect(rewritten).toContain('SELECT * FROM orders');
        expect(rewritten.length).toBe(sql.length);
    });

    it('removes macro blocks entirely', () => {
        const sql = "{% macro format_name(value) %}SELECT {{ value }}{% endmacro %}\nSELECT 1";
        const { rewritten } = preprocessJinjaTemplates(sql);

        expect(rewritten).not.toContain('format_name');
        expect(rewritten).not.toContain('SELECT value');
        expect(rewritten).toContain('SELECT 1');
        expect(rewritten.length).toBe(sql.length);
    });

    it('ignores jinja-like syntax inside SQL comments', () => {
        const sql = "-- {{ ref('ignored_model') }}\n/* {{ source('raw', 'ignored_table') }} */\nSELECT 1";
        const { rewritten, hadJinja } = preprocessJinjaTemplates(sql);

        expect(hadJinja).toBe(false);
        expect(rewritten).toBe(sql);
    });

    it('rewrites Jinja inside SQL string literals', () => {
        const sql = `SELECT * FROM orders WHERE status = '{{ var("status") }}'`;
        const { rewritten, hadJinja } = preprocessJinjaTemplates(sql);

        expect(hadJinja).toBe(true);
        expect(rewritten).toContain('__dbt_var_status__');
        expect(rewritten.length).toBe(sql.length);
    });

    it('detects jinja delimiters but skips template-literal false positives', () => {
        expect(containsJinjaTemplates('{{ this }}')).toBe(true);
        expect(containsJinjaTemplates('{{ adapter.dispatch(\"x\") }}')).toBe(true);
        expect(containsJinjaTemplates('{% if x %}SELECT 1{% endif %}')).toBe(true);
        expect(containsJinjaTemplates('{# comment #}\nSELECT 1')).toBe(true);
        expect(containsJinjaTemplates('${id}{{"label"}}')).toBe(false);
        expect(containsJinjaTemplates('SELECT 1')).toBe(false);
    });

    it('allows SQL Flow parsing on representative DBT SQL', () => {
        const sql = `
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

        const result = parseSql(sql, 'MySQL');
        const tableNames = Array.from(result.tableUsage.keys());

        expect(result.error).toBeUndefined();
        expect(result.nodes.length).toBeGreaterThan(0);
        expect(tableNames).toEqual(expect.arrayContaining(['customers', 'stg_orders']));
        expect(result.hints.some(hint => hint.message.includes('DBT/Jinja templates detected'))).toBe(true);
    });

    it('returns unchanged SQL and hadJinja=false for plain SQL', () => {
        const sql = 'SELECT * FROM orders';
        const { rewritten, hadJinja } = preprocessJinjaTemplates(sql);

        expect(hadJinja).toBe(false);
        expect(rewritten).toBe(sql);
    });
});
