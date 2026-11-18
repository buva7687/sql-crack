import { getQueryScopeOffsets, visitQueryScopes } from './queryScopes';
import { dialectSupportsBackslashEscapes, dialectSupportsHashComments, maskSqlCommentsPreservingPositions } from './stringUtils';
import { normalizeDialect } from './dialect';
import { annotateSqlIdentifiers } from './sqlIdentifiers';

/**
 * Unwrap identifier-like AST nodes produced by node-sql-parser.
 * Handles plain strings and nested shapes such as:
 * - { value: 'col' }
 * - { expr: { value: 'col' } }
 * - { name: [{ value: 'col' }] }
 */
export function unwrapIdentifierValue(value: any): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    if (typeof value.value === 'string') {
        return value.value;
    }
    if (typeof value.expr?.value === 'string') {
        return value.expr.value;
    }
    if (typeof value.expr?.expr?.value === 'string') {
        return value.expr.expr.value;
    }
    if (Array.isArray(value.name) && value.name.length > 0) {
        const first = value.name[0];
        if (typeof first?.value === 'string') {
            return first.value;
        }
    }
    return undefined;
}

const JOIN_KEYWORD_ALIAS = /^(?:CROSS|NATURAL)$/i;

/** Restore join semantics and identifier provenance lost by parser grammars. */
export function prepareSqlAst<T>(ast: T, sql: string, dialect: string): T {
    repairJoinKeywordAliases(ast, sql, dialect);
    annotateSqlIdentifiers(ast, sql, dialect);
    return ast;
}

/**
 * Undo a node-sql-parser misread of `CROSS JOIN` and `NATURAL JOIN`.
 *
 * The PostgreSQL, Snowflake, Redshift, Trino and SQLite grammars read
 * `FROM a CROSS JOIN b` as `a` aliased `CROSS` followed by a plain
 * `INNER JOIN b` with no condition. The source SQL distinguishes these
 * misreads from explicitly quoted aliases.
 * The AST is repaired in place and returned.
 */
export function repairJoinKeywordAliases<T>(ast: T, sql?: string, dialect = 'PostgreSQL'): T {
    const sourceJoins = new Map<number, Array<string | undefined>>();
    if (sql !== undefined) {
        const sourceDialect = normalizeDialect(dialect);
        const masked = maskSqlCommentsPreservingPositions(sql, {
            maskQuotedText: true,
            backslashEscapes: dialectSupportsBackslashEscapes(sourceDialect),
            hashComments: dialectSupportsHashComments(sourceDialect),
            dollarQuotes: sourceDialect !== 'MySQL' && sourceDialect !== 'MariaDB',
        });
        const scopes = getQueryScopeOffsets(masked);
        for (const join of masked.matchAll(/\b(?:(CROSS|NATURAL)\s+(?:(?:LEFT|RIGHT|FULL|INNER|OUTER)\s+)*)?JOIN\b/gi)) {
            const scope = scopes[join.index];
            const joins = sourceJoins.get(scope) ?? [];
            joins.push(join[1]?.toUpperCase());
            sourceJoins.set(scope, joins);
        }
    }
    const repairFrom = (value: any, scope: number): void => {
        if (!Array.isArray(value.from)) { return; }
        const from = value.from;
        let joinIndex = 0;
        for (let i = 0; i + 1 < from.length; i++) {
            const item = from[i];
            const next = from[i + 1];
            if (typeof next?.join !== 'string') { continue; }
            const sourceKeyword = sourceJoins.get(scope)?.[joinIndex++];
            if (typeof item?.as !== 'string' || !JOIN_KEYWORD_ALIAS.test(item.as)) { continue; }
            if (next.on || next.using) { continue; }
            const keyword = item.as.toUpperCase();
            if (sql !== undefined && sourceKeyword !== keyword) { continue; }
            if (keyword === 'CROSS') {
                if (next.join !== 'INNER JOIN') { continue; }
                next.join = 'CROSS JOIN';
            } else {
                next.join = next.join === 'INNER JOIN' ? 'NATURAL JOIN' : `NATURAL ${next.join}`;
            }
            item.as = null;
        }
    };
    if (sql !== undefined) {
        visitQueryScopes(ast, repairFrom);
        return ast;
    }
    const seen = new Set<object>();
    const visit = (value: any): void => {
        if (!value || typeof value !== 'object' || seen.has(value)) { return; }
        seen.add(value);
        if (Array.isArray(value)) { value.forEach(visit); return; }
        repairFrom(value, -1);
        for (const key of Object.keys(value)) { visit(value[key]); }
    };
    visit(ast);
    return ast;
}
