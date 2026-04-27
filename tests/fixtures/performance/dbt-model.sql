{{ config(materialized='table') }}

WITH source_data AS (
    SELECT
        customer_id,
        created_at,
        order_total
    FROM {{ source('raw', 'customers') }}
    WHERE created_at >= {{ var('start_date') }}
),
model_ref AS (
    SELECT
        customer_id,
        order_id,
        status
    FROM {{ ref('stg_orders') }}
    {% if target.name == 'prod' %}
    WHERE status = 'active'
    {% else %}
    WHERE 1 = 1
    {% endif %}
)
SELECT
    s.customer_id,
    m.order_id,
    m.status,
    s.order_total
FROM source_data s
JOIN model_ref m ON s.customer_id = m.customer_id
