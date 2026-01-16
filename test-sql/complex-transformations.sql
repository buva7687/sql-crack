-- Test 5: Complex Transformations
-- Tests: Arithmetic, CAST, COALESCE, nested expressions

SELECT
    product_id,
    quantity,
    unit_price,
    discount,
    quantity * unit_price as total_price,
    (quantity * unit_price) - COALESCE(discount, 0) as final_price,
    CAST(created_at AS DATE) as order_date,
    ROUND((quantity * unit_price) * 0.1, 2) as tax_amount,
    quantity * unit_price - COALESCE(discount, 0) + ROUND((quantity * unit_price) * 0.1, 2) as grand_total
FROM order_items
WHERE quantity > 0
ORDER BY grand_total DESC;
