import type { SqlDialect as WebviewSqlDialect } from '../webview/types';
import { maskStringsAndComments, preprocessForParsing } from '../webview/parser/dialects/preprocessing';
import type { Parser } from 'node-sql-parser';

export type SqlDialect = WebviewSqlDialect;

/**
 * Workspace-facing parser preprocessing adapter.
 * Keeps workspace extraction decoupled from webview parser internals.
 */
export function preprocessSqlForWorkspaceParsing(sql: string, dialect: SqlDialect): { sql: string; hadJinja: boolean } {
    return preprocessForParsing(sql, dialect);
}

/** Parse compound view bodies separately when the parser's CREATE VIEW grammar rejects them. */
export function parseWorkspaceStatement(parser: Parser, sql: string, database: string): ReturnType<Parser['astify']> {
    try {
        return parser.astify(sql, { database });
    } catch (originalError) {
        // Match structural tokens only; quoted names, comments and strings may contain AS/UNION.
        const masked = maskStringsAndComments(sql);
        if (!/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:TEMP(?:ORARY)?|SECURE|RECURSIVE)\s+)*VIEW\b/i.test(masked)) {
            throw originalError;
        }
        const as = /\bAS\b/i.exec(masked);
        if (!as) { throw originalError; }
        try {
            const body = parser.astify(sql.slice(as.index + as[0].length).replace(/;\s*$/, ''), { database });
            if (Array.isArray(body) || body.type !== 'select') { throw originalError; }
            const compound = body as unknown as { _next?: unknown; from?: Array<{ join?: string }> };
            if (!compound._next && !compound.from?.some(item => /^(?:UNION|INTERSECT|EXCEPT)(?:\s+(?:ALL|DISTINCT))?$/i.test(item.join || ''))) {
                throw originalError;
            }
            const header = parser.astify(sql.slice(0, as.index + as[0].length) + ' SELECT 1', { database });
            if (Array.isArray(header) || header.type !== 'create' || header.keyword !== 'view') { throw originalError; }
            return Object.assign(header, { select: body });
        } catch {
            // Unsupported headers, suffixes and malformed queries retain their original warning.
            throw originalError;
        }
    }
}
