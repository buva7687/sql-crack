// Basic SQL hint generation

import { getStats, getHasSelectStar, getHasNoLimit, addHint } from '../state';

export function generateHints(stmt: any): void {
    if (!stmt) { return; }

    const type = stmt.type?.toLowerCase() || '';
    const stats = getStats();
    const hasSelectStar = getHasSelectStar();
    const hasNoLimit = getHasNoLimit();

    // SELECT * warning
    if (hasSelectStar) {
        addHint({
            type: 'warning',
            message: 'SELECT * detected',
            suggestion: 'Specify only needed columns to reduce data transfer and improve performance'
        });
    }

    // Missing LIMIT on SELECT
    if (type === 'select' && hasNoLimit && stats.tables > 0) {
        addHint({
            type: 'info',
            message: 'No LIMIT clause',
            suggestion: 'Consider adding LIMIT to prevent fetching large result sets'
        });
    }

    // Missing WHERE on UPDATE/DELETE
    if ((type === 'update' || type === 'delete') && !stmt.where) {
        addHint({
            type: 'error',
            message: `${type.toUpperCase()} without WHERE clause`,
            suggestion: 'This will affect ALL rows in the table. Add a WHERE clause to limit scope'
        });
    }

    // Too many JOINs
    if (stats.joins > 5) {
        addHint({
            type: 'warning',
            message: `High number of JOINs (${stats.joins})`,
            suggestion: 'Consider breaking into smaller queries or using CTEs for clarity'
        });
    }

    // Deeply nested subqueries
    if (stats.subqueries > 3) {
        addHint({
            type: 'warning',
            message: `Multiple subqueries detected (${stats.subqueries})`,
            suggestion: 'Consider using CTEs (WITH clause) for better readability'
        });
    }

    // Cartesian product (no join condition)
    if (stats.tables > 1 && stats.joins === 0 && stats.conditions === 0) {
        addHint({
            type: 'error',
            message: 'Possible Cartesian product',
            suggestion: 'Multiple tables without JOIN conditions will produce all row combinations',
            category: 'performance',
            severity: 'high'
        });
    }
}
