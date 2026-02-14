import type { SqlDialect } from '../../types';
import type { ParserContext } from '../context';
import { detectDialectSyntaxPatterns } from './detection';
import { stripSqlComments } from './preprocessing';

/**
 * Detect dialect-specific syntax patterns and add appropriate hints.
 * This helps users identify when they're using syntax that's specific to a certain dialect.
 */
export function detectDialectSpecificSyntax(context: ParserContext, sql: string, currentDialect: SqlDialect): void {
    const strippedSql = stripSqlComments(sql);
    const syntax = detectDialectSyntaxPatterns(strippedSql);

    const hasSnowflakePathOperator = syntax.hasSnowflakePathOperator;
    const hasSnowflakeNamedArgs = syntax.hasSnowflakeNamedArgs;
    const hasFlatten = syntax.hasFlatten;
    if ((hasSnowflakePathOperator || hasSnowflakeNamedArgs || hasFlatten) && currentDialect !== 'Snowflake') {
        context.hints.push({
            type: 'warning',
            message: 'Snowflake-specific syntax detected',
            suggestion: currentDialect === 'MySQL' || currentDialect === 'PostgreSQL'
                ? 'This query uses Snowflake syntax (e.g., : path operator or => named arguments). Try Snowflake dialect for full support.'
                : 'This query uses Snowflake-specific syntax. Consider switching to Snowflake dialect.',
            category: 'best-practice',
            severity: 'medium'
        });
    }

    const hasBigQueryStruct = syntax.hasBigQueryStruct;
    const hasBigQueryUnnest = syntax.hasBigQueryUnnest;
    const hasBigQueryArrayType = syntax.hasBigQueryArrayType;
    const unnestOnlyDialects: SqlDialect[] = ['BigQuery', 'PostgreSQL', 'Trino', 'Athena'];
    if ((hasBigQueryStruct || hasBigQueryArrayType || (hasBigQueryUnnest && !unnestOnlyDialects.includes(currentDialect)))
        && currentDialect !== 'BigQuery') {
        context.hints.push({
            type: 'warning',
            message: 'BigQuery-specific syntax detected',
            suggestion: 'This query uses BigQuery syntax (e.g., STRUCT, UNNEST, or ARRAY<>). Try BigQuery dialect for full support.',
            category: 'best-practice',
            severity: 'medium'
        });
    }

    const hasPostgresInterval = syntax.hasPostgresInterval;
    const hasPostgresDollarQuotes = syntax.hasPostgresDollarQuotes;
    const hasPostgresArrayAccess = syntax.hasPostgresArrayAccess;
    const hasPostgresJsonOperators = syntax.hasPostgresJsonOperators;
    if ((hasPostgresInterval || hasPostgresDollarQuotes || hasPostgresArrayAccess || hasPostgresJsonOperators)
        && currentDialect !== 'PostgreSQL' && currentDialect !== 'Snowflake') {
        context.hints.push({
            type: 'warning',
            message: 'PostgreSQL-specific syntax detected',
            suggestion: 'This query uses PostgreSQL syntax (e.g., INTERVAL \'...\', $$ quotes, or JSON operators). Try PostgreSQL dialect.',
            category: 'best-practice',
            severity: 'medium'
        });
    }

    const hasMysqlBackticks = syntax.hasMysqlBackticks;
    const hasMysqlGroupByRollup = syntax.hasMysqlGroupByRollup;
    const hasMysqlDual = syntax.hasMysqlDual;
    if ((hasMysqlBackticks || hasMysqlGroupByRollup || hasMysqlDual)
        && currentDialect !== 'MySQL' && currentDialect !== 'MariaDB') {
        context.hints.push({
            type: 'info',
            message: 'MySQL-specific syntax detected',
            suggestion: 'This query uses MySQL syntax (e.g., backtick identifiers or WITH ROLLUP). Try MySQL dialect.',
            category: 'best-practice',
            severity: 'low'
        });
    }

    const hasTSqlApply = syntax.hasTSqlApply;
    const hasTSqlTop = syntax.hasTSqlTop;
    const hasTSqlPivot = syntax.hasTSqlPivot;
    if ((hasTSqlApply || hasTSqlTop || hasTSqlPivot) && currentDialect !== 'TransactSQL') {
        context.hints.push({
            type: 'warning',
            message: 'SQL Server (T-SQL) syntax detected',
            suggestion: 'This query uses SQL Server syntax (e.g., CROSS APPLY, TOP, or PIVOT). Try TransactSQL dialect.',
            category: 'best-practice',
            severity: 'medium'
        });
    }

    const hasMerge = /\bMERGE\s+INTO\b/i.test(strippedSql);
    if (hasMerge) {
        const dialectsWithMerge = ['TransactSQL', 'Oracle', 'Snowflake', 'BigQuery'];
        if (!dialectsWithMerge.includes(currentDialect)) {
            context.hints.push({
                type: 'warning',
                message: 'MERGE statement detected',
                suggestion: `MERGE statements are supported in TransactSQL, Oracle, Snowflake, and BigQuery dialects. Current dialect (${currentDialect}) may have limited support. Consider using dialect-specific alternatives: PostgreSQL (INSERT ... ON CONFLICT), MySQL (INSERT ... ON DUPLICATE KEY UPDATE), or SQLite (INSERT OR REPLACE/IGNORE).`,
                category: 'best-practice',
                severity: 'medium'
            });
        } else {
            context.hints.push({
                type: 'info',
                message: 'MERGE statement',
                suggestion: 'MERGE statements are complex and may not render fully in all cases. If parsing fails, try simplifying the query or using dialect-specific alternatives (ON CONFLICT, ON DUPLICATE KEY, etc.).',
                category: 'best-practice',
                severity: 'low'
            });
        }
    }
}
