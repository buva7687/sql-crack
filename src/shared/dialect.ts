/**
 * Map the user-friendly dialect labels surfaced in the VS Code Settings UI to
 * the internal dialect identifiers used by the parser. Shared between the
 * extension host and the visualization panel so both apply the same mapping
 * (avoids a circular extension ↔ panel import).
 */
export function normalizeDialect(dialect: string): string {
    if (dialect === 'SQL Server') { return 'TransactSQL'; }
    if (dialect === 'PL/SQL') { return 'Oracle'; }
    return dialect;
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
