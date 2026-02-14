import type { ValidationError, ValidationLimits } from '../../types';

/**
 * Default validation limits for SQL parsing.
 * These can be overridden by passing custom limits to validateSql.
 */
export const DEFAULT_VALIDATION_LIMITS: ValidationLimits = {
    maxSqlSizeBytes: 100 * 1024, // 100KB
    maxQueryCount: 50, // 50 statements max
};

/**
 * Validates SQL input against size and query count limits.
 * Call this before parsing to prevent performance issues with large inputs.
 */
export function validateSql(
    sql: string,
    limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS
): ValidationError | null {
    if (!sql || !sql.trim()) {
        return {
            type: 'empty_input',
            message: 'No SQL provided',
            details: {
                actual: 0,
                limit: 1,
                unit: 'characters',
            },
        };
    }

    const sizeBytes = new Blob([sql]).size;
    if (sizeBytes > limits.maxSqlSizeBytes) {
        return {
            type: 'size_limit',
            message: `SQL input exceeds maximum size limit of ${formatBytes(limits.maxSqlSizeBytes)}`,
            details: {
                actual: sizeBytes,
                limit: limits.maxSqlSizeBytes,
                unit: 'bytes',
            },
        };
    }

    const estimatedStatements = countStatements(sql);
    if (estimatedStatements > limits.maxQueryCount) {
        return {
            type: 'query_count_limit',
            message: `SQL contains approximately ${estimatedStatements} statements, exceeding the limit of ${limits.maxQueryCount}`,
            details: {
                actual: estimatedStatements,
                limit: limits.maxQueryCount,
                unit: 'statements',
            },
        };
    }

    return null;
}

function countStatements(sql: string): number {
    let cleaned = sql.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');

    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

    cleaned = cleaned.replace(/--[^\n]*/g, '');
    cleaned = cleaned.replace(/#[^\n]*/g, '');

    const semicolons = (cleaned.match(/;/g) || []).length;
    const trimmed = cleaned.trim();
    if (!trimmed) {
        return 0;
    }
    if (semicolons === 0) {
        return 1;
    }
    return trimmed.endsWith(';') ? semicolons : semicolons + 1;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) { return `${bytes} bytes`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)}KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
