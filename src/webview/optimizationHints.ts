export type HintSeverity = 'warning' | 'info' | 'suggestion';

export interface OptimizationHint {
    id: string;
    severity: HintSeverity;
    title: string;
    description: string;
    category: 'Performance' | 'Best Practice' | 'Maintainability' | 'Security';
}

export function analyzeQueryForHints(sqlCode: string, ast: any): OptimizationHint[] {
    const hints: OptimizationHint[] = [];

    if (!ast) return hints;

    const statements = Array.isArray(ast) ? ast : [ast];

    statements.forEach((statement: any, index: number) => {
        if (!statement || !statement.type) return;

        const statementType = statement.type.toLowerCase();

        if (statementType === 'select') {
            // Check for SELECT *
            if (statement.columns) {
                const hasSelectStar = statement.columns.some((col: any) =>
                    col.expr && col.expr.column === '*'
                );

                if (hasSelectStar) {
                    hints.push({
                        id: `select-star-${index}`,
                        severity: 'warning',
                        title: 'SELECT * detected',
                        description: 'Using SELECT * retrieves all columns, which can impact performance. Specify only the columns you need.',
                        category: 'Performance'
                    });
                }
            }

            // Check for missing LIMIT
            if (!statement.limit && statement.from) {
                hints.push({
                    id: `no-limit-${index}`,
                    severity: 'info',
                    title: 'No LIMIT clause',
                    description: 'Consider adding a LIMIT clause to prevent retrieving too many rows, especially during development.',
                    category: 'Best Practice'
                    });
            }

            // Check for missing WHERE on joins
            if (statement.from && statement.from.length > 0) {
                const hasJoins = statement.from.some((f: any) => f.join);
                if (hasJoins && !statement.where) {
                    hints.push({
                        id: `join-no-where-${index}`,
                        severity: 'info',
                        title: 'JOIN without WHERE clause',
                        description: 'Consider adding a WHERE clause to filter results when using JOINs.',
                        category: 'Performance'
                    });
                }
            }

            // Check for DISTINCT usage
            if (statement.distinct) {
                hints.push({
                    id: `distinct-${index}`,
                    severity: 'info',
                    title: 'DISTINCT keyword used',
                    description: 'DISTINCT can be expensive. Ensure it\'s necessary and consider if proper JOINs or GROUP BY would be more efficient.',
                    category: 'Performance'
                });
            }

            // Check for subqueries in SELECT clause
            if (statement.columns) {
                const hasSubqueryInSelect = statement.columns.some((col: any) =>
                    col.expr && col.expr.type === 'select'
                );

                if (hasSubqueryInSelect) {
                    hints.push({
                        id: `subquery-select-${index}`,
                        severity: 'warning',
                        title: 'Subquery in SELECT clause',
                        description: 'Subqueries in SELECT can cause N+1 query issues. Consider using JOINs instead.',
                        category: 'Performance'
                    });
                }
            }

            // Check for OR in WHERE clause
            if (statement.where && statement.where.operator === 'OR') {
                hints.push({
                    id: `or-where-${index}`,
                    severity: 'info',
                    title: 'OR in WHERE clause',
                    description: 'OR conditions can prevent index usage. Consider using UNION or IN() if possible.',
                    category: 'Performance'
                });
            }

            // Check for functions on indexed columns in WHERE
            if (statement.where && statement.where.left && statement.where.left.type === 'function') {
                hints.push({
                    id: `function-where-${index}`,
                    severity: 'warning',
                    title: 'Function on column in WHERE clause',
                    description: 'Using functions on columns in WHERE prevents index usage. Consider restructuring the condition.',
                    category: 'Performance'
                });
            }

            // Check for NOT IN
            if (statement.where) {
                const hasNotIn = checkForNotIn(statement.where);
                if (hasNotIn) {
                    hints.push({
                        id: `not-in-${index}`,
                        severity: 'info',
                        title: 'NOT IN detected',
                        description: 'NOT IN can perform poorly with large datasets. Consider using NOT EXISTS or LEFT JOIN with NULL check.',
                        category: 'Performance'
                    });
                }
            }
        }

        if (statementType === 'update' || statementType === 'delete') {
            // Check for UPDATE/DELETE without WHERE
            if (!statement.where) {
                hints.push({
                    id: `${statementType}-no-where-${index}`,
                    severity: 'warning',
                    title: `${statementType.toUpperCase()} without WHERE clause`,
                    description: `This will affect ALL rows! Always use a WHERE clause unless you intentionally want to modify all rows.`,
                    category: 'Security'
                });
            }
        }

        if (statementType === 'insert') {
            // Check for INSERT without column list
            if (statement.columns === null || statement.columns === undefined) {
                hints.push({
                    id: `insert-no-columns-${index}`,
                    severity: 'info',
                    title: 'INSERT without column list',
                    description: 'Specify column names explicitly for better maintainability when table structure changes.',
                    category: 'Maintainability'
                });
            }
        }
    });

    return hints;
}

function checkForNotIn(whereClause: any): boolean {
    if (!whereClause) return false;

    if (whereClause.operator === 'NOT IN') {
        return true;
    }

    // Recursively check nested conditions
    if (whereClause.left && typeof whereClause.left === 'object') {
        if (checkForNotIn(whereClause.left)) return true;
    }

    if (whereClause.right && typeof whereClause.right === 'object') {
        if (checkForNotIn(whereClause.right)) return true;
    }

    return false;
}

export function getHintColor(severity: HintSeverity): string {
    switch (severity) {
        case 'warning':
            return '#f59e0b';
        case 'info':
            return '#3b82f6';
        case 'suggestion':
            return '#10b981';
        default:
            return '#888';
    }
}

export function getHintIcon(severity: HintSeverity): string {
    switch (severity) {
        case 'warning':
            return '⚠️';
        case 'info':
            return 'ℹ️';
        case 'suggestion':
            return '💡';
        default:
            return '•';
    }
}
