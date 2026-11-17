/**
 * Map the user-friendly dialect labels surfaced in the VS Code Settings UI to
 * the internal dialect identifiers used by the parser. Shared between the
 * extension host and the visualization panel so both apply the same mapping
 * (avoids a circular extension ↔ panel import).
 */
const KNOWN_DIALECTS = [
    'MySQL', 'PostgreSQL', 'TransactSQL', 'MariaDB', 'SQLite', 'Snowflake', 'BigQuery',
    'Hive', 'Redshift', 'Athena', 'Trino', 'Oracle', 'Teradata'
] as const;

const DIALECT_ALIASES: Record<string, string> = {
    'sql server': 'TransactSQL',
    'sqlserver': 'TransactSQL',
    'mssql': 'TransactSQL',
    'tsql': 'TransactSQL',
    't-sql': 'TransactSQL',
    'pl/sql': 'Oracle',
    'plsql': 'Oracle',
    'postgres': 'PostgreSQL',
    'presto': 'Trino',
};

const DIALECTS_BY_LOWERCASE = new Map<string, string>(
    KNOWN_DIALECTS.map(dialect => [dialect.toLowerCase(), dialect])
);

/**
 * Settings values can be hand-edited in settings.json, so match known dialects
 * and aliases case-insensitively and fall back to MySQL (the declared default)
 * for anything else instead of handing the parser a dialect it rejects.
 */
export function normalizeDialect(dialect: string): string {
    const key = typeof dialect === 'string' ? dialect.trim().toLowerCase() : '';
    return DIALECT_ALIASES[key] ?? DIALECTS_BY_LOWERCASE.get(key) ?? 'MySQL';
}

/**
 * Decide whether a runtime-config update should replace the dialect currently
 * displayed by the SQL Flow webview.
 *
 * With auto-detection enabled, an unrelated config/theme push must preserve the
 * detected dialect. A genuine default-dialect change still becomes the new base
 * dialect and triggers re-visualization, while auto-detect disabled always keeps
 * the runtime dialect aligned with the configured default.
 */
export function shouldSyncRuntimeDefaultDialect(
    previousDefaultDialect: string,
    requestedDefaultDialect: string,
    currentDialect: string,
    autoDetectDialect: boolean,
    userExplicitlySetDialect: boolean
): boolean {
    if (userExplicitlySetDialect || requestedDefaultDialect === currentDialect) {
        return false;
    }

    return !autoDetectDialect || previousDefaultDialect !== requestedDefaultDialect;
}
