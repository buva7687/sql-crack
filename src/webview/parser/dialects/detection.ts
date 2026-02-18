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
    hasPivot: boolean;
    hasOracleConnectBy: boolean;
    hasOracleRownum: boolean;
    hasOracleNvlDecode: boolean;
    hasOracleMinus: boolean;
    hasOracleSequence: boolean;
    hasOracleOuterJoinOperator: boolean;
    hasOracleSysdate: boolean;
    hasFlashback: boolean;
    hasModelClause: boolean;
    // Hive
    hasHiveLateralView: boolean;
    hasHiveDistributeBy: boolean;
    hasHiveClusterBy: boolean;
    hasHiveSortBy: boolean;
    hasHiveSerDe: boolean;
    // Trino
    hasTrinoRowsFrom: boolean;
    hasTrinoMapFunctions: boolean;
    // Athena/Hive DDL
    hasExternalTable: boolean;
    hasTblProperties: boolean;
    // Redshift
    hasDistkey: boolean;
    hasSortkey: boolean;
    hasDiststyle: boolean;
    hasRedshiftCopy: boolean;
    hasRedshiftUnload: boolean;
    // SQLite
    hasSqliteAutoincrement: boolean;
    hasSqliteGlob: boolean;
    hasSqlitePragma: boolean;
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
        hasPivot: /\bPIVOT\s*\(/i.test(maskedSql),
        hasOracleConnectBy: /\bCONNECT\s+BY\b/i.test(maskedSql),
        hasOracleRownum: /\bROWNUM\b/i.test(maskedSql),
        hasOracleNvlDecode: /\b(NVL2?|DECODE)\s*\(/i.test(maskedSql),
        hasOracleMinus: /\bMINUS\b/i.test(maskedSql),
        hasOracleSequence: /\.\s*(NEXTVAL|CURRVAL)\b/i.test(maskedSql),
        hasOracleOuterJoinOperator: /\(\+\)/.test(maskedSql),
        hasOracleSysdate: /\bSYS(DATE|TIMESTAMP)\b/i.test(maskedSql),
        hasFlashback: /\bAS\s+OF\s+(SCN|TIMESTAMP)\b/i.test(maskedSql),
        hasModelClause: /\bMODEL\s+(PARTITION\s+BY|DIMENSION\s+BY|MEASURES|RULES)\b/i.test(maskedSql),
        // Hive
        hasHiveLateralView: /\bLATERAL\s+VIEW\b/i.test(maskedSql),
        hasHiveDistributeBy: /\bDISTRIBUTE\s+BY\b/i.test(maskedSql),
        hasHiveClusterBy: /\bCLUSTER\s+BY\b/i.test(maskedSql),
        hasHiveSortBy: /\bSORT\s+BY\b/i.test(maskedSql),
        hasHiveSerDe: /\b(SERDE|ROW\s+FORMAT)\b/i.test(maskedSql),
        // Trino
        hasTrinoRowsFrom: /\bROWS\s+FROM\s*\(/i.test(maskedSql),
        hasTrinoMapFunctions: /\b(MAP_FROM_ENTRIES|MAP_AGG|ARRAY_JOIN)\s*\(/i.test(maskedSql),
        // Athena/Hive DDL
        hasExternalTable: /\bCREATE\s+EXTERNAL\s+TABLE\b/i.test(maskedSql),
        hasTblProperties: /\bTBLPROPERTIES\s*\(/i.test(maskedSql),
        // Redshift
        hasDistkey: /\bDISTKEY\b/i.test(maskedSql),
        hasSortkey: /\bSORTKEY\b/i.test(maskedSql),
        hasDiststyle: /\bDISTSTYLE\s+(KEY|ALL|EVEN|AUTO)\b/i.test(maskedSql),
        hasRedshiftCopy: /\bCOPY\s+\w+\s+FROM\b/i.test(maskedSql),
        hasRedshiftUnload: /\bUNLOAD\s*\(/i.test(maskedSql),
        // SQLite
        hasSqliteAutoincrement: /\bAUTOINCREMENT\b/i.test(maskedSql),
        hasSqliteGlob: /\bGLOB\b/i.test(maskedSql),
        hasSqlitePragma: /\bPRAGMA\s+/i.test(maskedSql),
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
    if (syntax.hasPivot) { addScore('TransactSQL'); }
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
    if (syntax.hasPivot) { addScore('Oracle'); }
    if (syntax.hasFlashback) { addScore('Oracle', 3); }
    if (syntax.hasModelClause) { addScore('Oracle', 2); }

    // Hive
    if (syntax.hasHiveLateralView) { addScore('Hive', 3); }
    if (syntax.hasHiveDistributeBy) { addScore('Hive', 3); }
    if (syntax.hasHiveClusterBy) { addScore('Hive', 2); }
    if (syntax.hasHiveSortBy) { addScore('Hive', 2); }
    if (syntax.hasHiveSerDe) { addScore('Hive', 2); }

    // Trino
    if (syntax.hasTrinoRowsFrom) { addScore('Trino', 3); }
    if (syntax.hasTrinoMapFunctions) { addScore('Trino', 2); }

    // Athena (shares Hive DDL patterns)
    if (syntax.hasExternalTable) { addScore('Athena', 2); }
    if (syntax.hasTblProperties) { addScore('Athena', 1); }

    // Redshift
    if (syntax.hasDistkey) { addScore('Redshift', 3); }
    if (syntax.hasSortkey) { addScore('Redshift', 3); }
    if (syntax.hasDiststyle) { addScore('Redshift', 2); }
    if (syntax.hasRedshiftCopy) { addScore('Redshift', 2); }
    if (syntax.hasRedshiftUnload) { addScore('Redshift', 3); }

    // SQLite
    if (syntax.hasSqliteAutoincrement) { addScore('SQLite', 3); }
    if (syntax.hasSqliteGlob) { addScore('SQLite', 2); }
    if (syntax.hasSqlitePragma) { addScore('SQLite', 3); }

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
