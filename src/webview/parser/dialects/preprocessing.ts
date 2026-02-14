import type { SqlDialect } from '../../types';

/**
 * Preprocess PostgreSQL-specific syntax that node-sql-parser doesn't support.
 *
 * Rewrites:
 * 1. `AT TIME ZONE 'tz'` / `AT TIME ZONE identifier` - removed (timezone cast doesn't affect structure)
 * 2. Type-prefixed literals (`timestamptz '...'`, `timestamp '...'`, `date '...'`, `time '...'`, `interval '...'`) - just the string literal
 *
 * Returns the transformed SQL or `null` if no rewriting was needed.
 */
export function preprocessPostgresSyntax(sql: string, dialect: SqlDialect): string | null {
    if (dialect !== 'PostgreSQL') {
        return null;
    }

    const masked = maskStringsAndComments(sql);
    let result = sql;
    let changed = false;

    const atTimeZoneRegex = /\bAT\s+TIME\s+ZONE\b/gi;
    let match;
    const attzMatches: { start: number; end: number }[] = [];
    while ((match = atTimeZoneRegex.exec(masked)) !== null) {
        let end = match.index + match[0].length;
        while (end < result.length && /\s/.test(result[end])) {
            end++;
        }
        if (result[end] === '\'') {
            end = end + 1;
            while (end < result.length) {
                if (result[end] === '\'' && end + 1 < result.length && result[end + 1] === '\'') {
                    end += 2;
                    continue;
                }
                if (result[end] === '\'') {
                    end++;
                    break;
                }
                end++;
            }
        } else {
            while (end < result.length && /\w/.test(result[end])) {
                end++;
            }
        }
        attzMatches.push({ start: match.index, end });
    }
    for (let i = attzMatches.length - 1; i >= 0; i--) {
        const m = attzMatches[i];
        result = result.substring(0, m.start) + result.substring(m.end);
        changed = true;
    }

    const masked2 = changed ? maskStringsAndComments(result) : masked;
    const typePrefixRegex = /\b(timestamptz|timestamp|date|time|interval)\b/gi;
    const typePrefixMatches: { start: number; end: number }[] = [];
    while ((match = typePrefixRegex.exec(masked2)) !== null) {
        let pos = match.index + match[0].length;
        if (pos < result.length && /\s/.test(result[pos])) {
            while (pos < result.length && /\s/.test(result[pos])) {
                pos++;
            }
            if (pos < result.length && result[pos] === '\'') {
                typePrefixMatches.push({ start: match.index, end: pos });
            }
        }
    }
    for (let i = typePrefixMatches.length - 1; i >= 0; i--) {
        const m = typePrefixMatches[i];
        result = result.substring(0, m.start) + result.substring(m.end);
        changed = true;
    }

    return changed ? result : null;
}

/**
 * Hoist CTEs nested inside subqueries to the top level.
 * Snowflake / Tableau generates `FROM ( WITH cte AS (...) SELECT ... ) t`
 * which node-sql-parser cannot handle. This rewrites the SQL to move the
 * WITH block to the top level — a semantically equivalent transformation.
 *
 * Returns the transformed SQL or `null` if no hoisting was needed.
 */
export function hoistNestedCtes(sql: string): string | null {
    const masked = maskStringsAndComments(sql);

    let current = sql;
    let currentMasked = masked;
    let hoisted = false;

    for (let iteration = 0; iteration < 20; iteration++) {
        const result = hoistOneNestedCte(current, currentMasked);
        if (!result) {
            break;
        }
        current = result;
        currentMasked = maskStringsAndComments(current);
        hoisted = true;
    }

    return hoisted ? current : null;
}

/**
 * Replace string literals and comments with spaces (preserving length/positions).
 */
export function maskStringsAndComments(sql: string): string {
    const chars = sql.split('');
    let i = 0;
    while (i < chars.length) {
        if (chars[i] === '/' && i + 1 < chars.length && chars[i + 1] === '*') {
            chars[i] = ' ';
            chars[i + 1] = ' ';
            i += 2;
            while (i < chars.length) {
                if (chars[i] === '*' && i + 1 < chars.length && chars[i + 1] === '/') {
                    chars[i] = ' ';
                    chars[i + 1] = ' ';
                    i += 2;
                    break;
                }
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        if (chars[i] === '-' && i + 1 < chars.length && chars[i + 1] === '-') {
            while (i < chars.length && chars[i] !== '\n') {
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        if (chars[i] === '#') {
            while (i < chars.length && chars[i] !== '\n') {
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        if (chars[i] === '\'') {
            chars[i] = ' ';
            i++;
            while (i < chars.length) {
                if (chars[i] === '\'' && i + 1 < chars.length && chars[i + 1] === '\'') {
                    chars[i] = ' ';
                    chars[i + 1] = ' ';
                    i += 2;
                    continue;
                }
                if (chars[i] === '\'') {
                    chars[i] = ' ';
                    i++;
                    break;
                }
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        if (chars[i] === '"') {
            chars[i] = ' ';
            i++;
            while (i < chars.length) {
                if (chars[i] === '"') {
                    chars[i] = ' ';
                    i++;
                    break;
                }
                chars[i] = ' ';
                i++;
            }
            continue;
        }
        i++;
    }
    return chars.join('');
}

function hoistOneNestedCte(sql: string, masked: string): string | null {
    const parenWithRegex = /\(\s*WITH\b/gi;
    let match: RegExpExecArray | null;

    while ((match = parenWithRegex.exec(masked)) !== null) {
        const openParenPos = match.index;
        const beforeParen = masked.substring(0, openParenPos).trim();
        if (beforeParen.length === 0) {
            continue;
        }

        const withKeywordStart = openParenPos + 1;
        const cteResult = extractCteDefinitions(sql, masked, withKeywordStart);
        if (!cteResult) {
            continue;
        }

        const { cteBlock, innerSelectStart } = cteResult;
        const closingParenPos = findMatchingParen(masked, openParenPos);
        if (closingParenPos === -1) {
            continue;
        }

        const innerSelect = sql.substring(innerSelectStart, closingParenPos).trim();
        const topLevelWithMatch = masked.match(/^\s*WITH\b/i);

        const beforeSubquery = sql.substring(0, openParenPos + 1);
        const afterSubquery = sql.substring(closingParenPos);
        const rewrittenSubquery = beforeSubquery + '\n' + innerSelect + '\n' + afterSubquery;

        let newSql: string;
        if (topLevelWithMatch) {
            const rewrittenMasked = maskStringsAndComments(rewrittenSubquery);
            const mergePoint = findTopLevelCteEnd(rewrittenMasked);
            if (mergePoint === -1) {
                continue;
            }
            const before = rewrittenSubquery.substring(0, mergePoint);
            const after = rewrittenSubquery.substring(mergePoint);
            const cteList = cteBlock.replace(/^\s*WITH\s+/i, '');
            newSql = before.trimEnd() + ',\n' + cteList + '\n' + after;
        } else {
            newSql = cteBlock + '\n' + rewrittenSubquery;
        }

        return newSql;
    }

    return null;
}

function extractCteDefinitions(
    sql: string,
    masked: string,
    withKeywordStart: number
): { cteBlock: string; innerSelectStart: number } | null {
    const withMatch = masked.substring(withKeywordStart).match(/^(\s*WITH\s+)/i);
    if (!withMatch) {
        return null;
    }

    let pos = withKeywordStart + withMatch[0].length;
    const cteStartPos = withKeywordStart;

    while (pos < masked.length) {
        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }

        const nameStart = pos;
        if (sql[pos] === '"' || sql[pos] === '`' || sql[pos] === '[') {
            const closeChar = sql[pos] === '[' ? ']' : sql[pos];
            pos++;
            while (pos < sql.length && sql[pos] !== closeChar) { pos++; }
            if (pos < sql.length) { pos++; }
        } else {
            while (pos < sql.length && /\w/.test(sql[pos])) { pos++; }
        }

        if (pos === nameStart) {
            return null;
        }

        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }

        if (masked.substring(pos, pos + 2).toUpperCase() !== 'AS') {
            return null;
        }
        pos += 2;

        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }

        if (sql[pos] !== '(') {
            return null;
        }
        const cteBodyClose = findMatchingParen(sql, pos);
        if (cteBodyClose === -1) {
            return null;
        }
        pos = cteBodyClose + 1;

        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }
        if (sql[pos] === ',') {
            pos++;
            continue;
        }

        break;
    }

    const cteBlock = sql.substring(cteStartPos, pos).trim();
    const remaining = masked.substring(pos).trimStart();
    if (!/^(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i.test(remaining)) {
        return null;
    }

    const innerSelectStart = pos + (masked.substring(pos).length - masked.substring(pos).trimStart().length);
    return { cteBlock, innerSelectStart };
}

/**
 * Find the position of the matching closing parenthesis for an opening `(`.
 * Handles nested parens. Operates on the raw string (not masked) to handle
 * all paren types, but skips string literals and comments.
 */
export function findMatchingParen(sql: string, openPos: number): number {
    if (sql[openPos] !== '(') {
        return -1;
    }
    let depth = 1;
    let i = openPos + 1;
    while (i < sql.length && depth > 0) {
        const ch = sql[i];
        if (ch === '\'') {
            i++;
            while (i < sql.length) {
                if (sql[i] === '\'' && i + 1 < sql.length && sql[i + 1] === '\'') {
                    i += 2;
                    continue;
                }
                if (sql[i] === '\'') {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        if (ch === '"') {
            i++;
            while (i < sql.length && sql[i] !== '"') { i++; }
            if (i < sql.length) { i++; }
            continue;
        }
        if (ch === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
            i += 2;
            while (i < sql.length) {
                if (sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/') {
                    i += 2;
                    break;
                }
                i++;
            }
            continue;
        }
        if (ch === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
            while (i < sql.length && sql[i] !== '\n') { i++; }
            continue;
        }
        if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
        i++;
    }
    return -1;
}

function findTopLevelCteEnd(masked: string): number {
    const withMatch = masked.match(/^\s*WITH\s+/i);
    if (!withMatch) {
        return -1;
    }

    let pos = withMatch[0].length;
    while (pos < masked.length) {
        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }
        while (pos < masked.length && /\w/.test(masked[pos])) { pos++; }
        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }

        if (masked.substring(pos, pos + 2).toUpperCase() !== 'AS') {
            return -1;
        }
        pos += 2;
        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }

        if (masked[pos] !== '(') {
            return -1;
        }
        let depth = 1;
        pos++;
        while (pos < masked.length && depth > 0) {
            if (masked[pos] === '(') { depth++; }
            else if (masked[pos] === ')') { depth--; }
            pos++;
        }
        while (pos < masked.length && /\s/.test(masked[pos])) { pos++; }
        if (masked[pos] === ',') {
            pos++;
            continue;
        }
        break;
    }

    return pos;
}

export function stripSqlComments(sql: string): string {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n\r]*/g, ' ')
        .replace(/#[^\n\r]*/g, ' ');
}
