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
