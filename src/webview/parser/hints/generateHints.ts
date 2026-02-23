import type { ParserContext } from '../context';

export function generateHints(context: ParserContext, stmt: any): void {
    if (!stmt) { return; }

    const type = stmt.type?.toLowerCase() || '';

    // SELECT * warning
    if (context.hasSelectStar) {
        context.hints.push({
            type: 'warning',
            message: 'SELECT * detected',
            suggestion: 'Specify only needed columns to reduce data transfer and improve performance'
        });
    }

    // Missing LIMIT on SELECT
    if (type === 'select' && context.hasNoLimit && context.stats.tables > 0) {
        context.hints.push({
            type: 'info',
            message: 'No LIMIT clause',
            suggestion: 'Consider adding LIMIT to prevent fetching large result sets'
        });
    }

    // Missing WHERE on UPDATE/DELETE
    if ((type === 'update' || type === 'delete') && !stmt.where) {
        context.hints.push({
            type: 'error',
            message: `${type.toUpperCase()} without WHERE clause`,
            suggestion: 'This will affect ALL rows in the table. Add a WHERE clause to limit scope'
        });
    }

    // Too many JOINs
    if (context.stats.joins > 5) {
        context.hints.push({
            type: 'warning',
            message: `High number of JOINs (${context.stats.joins})`,
            suggestion: 'Consider breaking into smaller queries or using CTEs for clarity'
        });
    }

    // Deeply nested subqueries
    if (context.stats.subqueries > 3) {
        context.hints.push({
            type: 'warning',
            message: `Multiple subqueries detected (${context.stats.subqueries})`,
            suggestion: 'Consider using CTEs (WITH clause) for better readability'
        });
    }

    // Cartesian product (no join condition)
    if (context.stats.tables > 1 && context.stats.joins === 0 && context.stats.conditions === 0) {
        context.hints.push({
            type: 'error',
            message: 'Possible Cartesian product',
            suggestion: 'Multiple tables without JOIN conditions will produce all row combinations',
            category: 'performance',
            severity: 'high'
        });
    }
}
