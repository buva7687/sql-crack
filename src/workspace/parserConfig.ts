import type { SqlDialect as WebviewSqlDialect } from '../webview/types';
import { preprocessForParsing } from '../webview/parser/dialects/preprocessing';

export type SqlDialect = WebviewSqlDialect;

/**
 * Workspace-facing parser preprocessing adapter.
 * Keeps workspace extraction decoupled from webview parser internals.
 */
export function preprocessSqlForWorkspaceParsing(sql: string, dialect: SqlDialect): string {
    return preprocessForParsing(sql, dialect);
}
