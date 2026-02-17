import type { SqlDialect } from '../../types';
import { maskStringsAndComments, stripSqlComments } from './preprocessing';

export interface DialectDetectionResult {
    dialect: SqlDialect | null;
    scores: Partial<Record<SqlDialect, number>>;
    confidence: 'high' | 'low' | 'none';
}

export function rankDialectScores(scores: Partial<Record<SqlDialect, number>>): Array<{ dialect: SqlDialect; score: number }> {
    return Object.entries(scores)
        .filter((entry): entry is [SqlDialect, number] => typeof entry[1] === 'number' && entry[1] > 0)
        .map(([dialect, score]) => ({ dialect, score }))
        .sort((a, b) => b.score - a.score);
}

export function detectDialectSyntaxPatterns(sql: string): {
    hasSnowflakePathOperator: boolean;
    hasSnowflakeNamedArgs: boolean;
    hasFlatten: boolean;
    hasThreePartNames: boolean;
    hasQualify: boolean;
    hasIlike: boolean;
    hasCreateOrReplaceTable: boolean;
    hasMergeInto: boolean;
    hasBigQueryStruct: boolean;
    hasBigQueryUnnest: boolean;
    hasBigQueryArrayType: boolean;
    hasPostgresInterval: boolean;
    hasPostgresTypeCast: boolean;
    hasPostgresAtTimeZone: boolean;
    hasPostgresDollarQuotes: boolean;
    hasPostgresArrayAccess: boolean;
    hasPostgresJsonOperators: boolean;
    hasMysqlBackticks: boolean;
    hasMysqlGroupByRollup: boolean;
    hasMysqlDual: boolean;
    hasTSqlApply: boolean;
    hasTSqlTop: boolean;
    hasTSqlPivot: boolean;
    hasOracleConnectBy: boolean;
    hasOracleRownum: boolean;
    hasOracleNvlDecode: boolean;
    hasOracleMinus: boolean;
    hasOracleSequence: boolean;
    hasOracleOuterJoinOperator: boolean;
    hasOracleSysdate: boolean;
} {
    const maskedSql = maskStringsAndComments(sql);
    return {
        hasSnowflakePathOperator: /\b[A-Za-z_][\w$]*\s*:\s*[A-Za-z_][\w$]*(?!:)/.test(maskedSql),
        hasSnowflakeNamedArgs: /\w+\s*=>\s*/.test(maskedSql),
        hasFlatten: /\bFLATTEN\s*\(/i.test(maskedSql),
        hasThreePartNames: /\b[\w$]+\.[\w$]+\.[\w$]+\b/.test(maskedSql),
        hasQualify: /\bQUALIFY\b/i.test(maskedSql),
        hasIlike: /\bILIKE\b/i.test(maskedSql),
        hasCreateOrReplaceTable: /\bCREATE\s+OR\s+REPLACE\s+TABLE\b/i.test(maskedSql),
        hasMergeInto: /\bMERGE\s+INTO\b/i.test(maskedSql),
        hasBigQueryStruct: /\bSTRUCT\s*\(/i.test(maskedSql),
        hasBigQueryUnnest: /\bUNNEST\s*\(/i.test(maskedSql),
        hasBigQueryArrayType: /\bARRAY<.*>/i.test(maskedSql),
        // Keep this check on raw SQL so quoted interval literals are preserved.
        hasPostgresInterval: /INTERVAL\s+'[^']+'/i.test(sql),
        hasPostgresTypeCast: /::\s*[a-z_][\w$]*(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?/i.test(maskedSql),
        hasPostgresAtTimeZone: /\bAT\s+TIME\s+ZONE\b/i.test(maskedSql),
        hasPostgresDollarQuotes: /\$\$/.test(maskedSql),
        hasPostgresArrayAccess: /\w+\[\d+\]/.test(maskedSql),
        hasPostgresJsonOperators: /->>|#>|\?&|\?\|/.test(maskedSql),
        hasMysqlBackticks: /`[\w-]+`/.test(maskedSql),
        hasMysqlGroupByRollup: /GROUP BY.*WITH ROLLUP/i.test(maskedSql),
        hasMysqlDual: /FROM\s+DUAL/i.test(maskedSql),
        hasTSqlApply: /\b(CROSS|OUTER)\s+APPLY\b/i.test(maskedSql),
        hasTSqlTop: /TOP\s*\(/i.test(maskedSql),
        hasTSqlPivot: /\bPIVOT\s*\(/i.test(maskedSql),
        hasOracleConnectBy: /\bCONNECT\s+BY\b/i.test(maskedSql),
        hasOracleRownum: /\bROWNUM\b/i.test(maskedSql),
        hasOracleNvlDecode: /\b(NVL2?|DECODE)\s*\(/i.test(maskedSql),
        hasOracleMinus: /\bMINUS\b/i.test(maskedSql),
        hasOracleSequence: /\.\s*(NEXTVAL|CURRVAL)\b/i.test(maskedSql),
        hasOracleOuterJoinOperator: /\(\+\)/.test(maskedSql),
        hasOracleSysdate: /\bSYS(DATE|TIMESTAMP)\b/i.test(maskedSql),
    };
}

export function detectDialect(sql: string): DialectDetectionResult {
    const strippedSql = stripSqlComments(sql);
    if (!strippedSql.trim()) {
        return {
            dialect: null,
            scores: {},
            confidence: 'none'
        };
    }

    const syntax = detectDialectSyntaxPatterns(strippedSql);
    const scores: Partial<Record<SqlDialect, number>> = {};
    const addScore = (dialect: SqlDialect, points = 1): void => {
        scores[dialect] = (scores[dialect] || 0) + points;
    };

    if (syntax.hasSnowflakePathOperator) { addScore('Snowflake'); }
    if (syntax.hasSnowflakeNamedArgs) { addScore('Snowflake'); }
    if (syntax.hasFlatten) { addScore('Snowflake'); }
    if (syntax.hasCreateOrReplaceTable) { addScore('Snowflake', 2); }
    if (syntax.hasQualify) { addScore('Snowflake', 2); }
    if (syntax.hasMergeInto) { addScore('Snowflake'); }
    if (syntax.hasThreePartNames) { addScore('Snowflake', 3); }
    if (syntax.hasIlike) { addScore('Snowflake'); }

    if (syntax.hasBigQueryStruct) { addScore('BigQuery'); }
    if (syntax.hasBigQueryArrayType) { addScore('BigQuery'); }
    if (syntax.hasBigQueryUnnest && (syntax.hasBigQueryStruct || syntax.hasBigQueryArrayType)) {
        addScore('BigQuery');
    }
    if (syntax.hasQualify) { addScore('BigQuery'); }

    if (syntax.hasPostgresDollarQuotes) { addScore('PostgreSQL'); }
    if (syntax.hasPostgresJsonOperators) { addScore('PostgreSQL'); }
    if (syntax.hasPostgresInterval) { addScore('PostgreSQL'); }
    if (syntax.hasPostgresTypeCast) { addScore('PostgreSQL'); }
    if (syntax.hasPostgresAtTimeZone) { addScore('PostgreSQL'); }
    if (syntax.hasIlike) { addScore('PostgreSQL'); }

    if (syntax.hasMysqlBackticks) { addScore('MySQL'); }
    if (syntax.hasMysqlGroupByRollup) { addScore('MySQL'); }
    if (syntax.hasMysqlDual) { addScore('MySQL'); }

    if (syntax.hasTSqlApply) { addScore('TransactSQL'); }
    if (syntax.hasTSqlTop) { addScore('TransactSQL'); }
    if (syntax.hasTSqlPivot) { addScore('TransactSQL'); }
    if (syntax.hasThreePartNames) { addScore('TransactSQL'); }
    if (syntax.hasMergeInto) { addScore('TransactSQL'); }

    if (syntax.hasThreePartNames) { addScore('Redshift'); }
    if (syntax.hasIlike) { addScore('Redshift'); }

    if (syntax.hasOracleConnectBy) { addScore('Oracle', 3); }
    if (syntax.hasOracleRownum) { addScore('Oracle', 2); }
    if (syntax.hasOracleNvlDecode) { addScore('Oracle'); }
    if (syntax.hasOracleSequence) { addScore('Oracle', 2); }
    if (syntax.hasOracleOuterJoinOperator) { addScore('Oracle', 3); }
    if (syntax.hasOracleSysdate) { addScore('Oracle'); }
    if (syntax.hasOracleMinus) { addScore('Oracle'); }
    if (syntax.hasMergeInto) { addScore('Oracle'); }

    const matchedDialects = rankDialectScores(scores);
    if (matchedDialects.length === 0) {
        return {
            dialect: null,
            scores,
            confidence: 'none'
        };
    }

    const topMatch = matchedDialects[0];
    const secondMatchScore = matchedDialects[1]?.score ?? 0;
    const isHighConfidence =
        matchedDialects.length === 1 ||
        (topMatch.score >= 3 && topMatch.score >= secondMatchScore + 2);

    if (!isHighConfidence) {
        return {
            dialect: null,
            scores,
            confidence: 'low'
        };
    }

    return {
        dialect: topMatch.dialect,
        scores,
        confidence: 'high'
    };
}
