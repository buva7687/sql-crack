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
 * Preprocess Oracle-specific syntax that node-sql-parser doesn't support.
 *
 * Rewrites:
 * 1. `(+)` outer join operator — removed (confuses other parsers)
 * 2. `MINUS` set operator — rewritten to `EXCEPT` for parser compatibility
 * 3. `CONNECT BY` / `START WITH` clauses — stripped (hierarchical queries unsupported)
 *
 * Returns the transformed SQL or `null` if no rewriting was needed.
 */
export function preprocessOracleSyntax(sql: string, dialect: SqlDialect): string | null {
    if (dialect !== 'Oracle') {
        return null;
    }

    let result = sql;
    let changed = false;

    // 1. Remove (+) outer join operator
    const outerJoinResult = result.replace(/\(\+\)/g, '');
    if (outerJoinResult !== result) {
        result = outerJoinResult;
        changed = true;
    }

    // 2. Rewrite MINUS → EXCEPT (Oracle's MINUS is standard SQL EXCEPT)
    const masked = maskStringsAndComments(result);
    const minusRegex = /\bMINUS\b/gi;
    const minusRewrites: Array<{ start: number; end: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = minusRegex.exec(masked)) !== null) {
        minusRewrites.push({ start: match.index, end: match.index + match[0].length });
    }
    for (let i = minusRewrites.length - 1; i >= 0; i--) {
        const m = minusRewrites[i];
        result = result.substring(0, m.start) + 'EXCEPT' + result.substring(m.end);
        changed = true;
    }

    // 3. Strip START WITH, CONNECT BY, and ORDER SIBLINGS BY clauses
    //    These are Oracle hierarchical query clauses unsupported by the proxy parser.
    //    We find each keyword in the masked SQL and scan forward to the clause boundary.
    const masked2 = changed ? maskStringsAndComments(result) : masked;
    const hierarchicalKeywords = /\b(START\s+WITH|CONNECT\s+BY|ORDER\s+SIBLINGS\s+BY)\b/gi;
    const hierarchicalRewrites: Array<{ start: number; end: number }> = [];
    while ((match = hierarchicalKeywords.exec(masked2)) !== null) {
        const start = match.index;
        const end = findHierarchicalClauseEnd(masked2, start + match[0].length);
        // Avoid overlapping with a previously found region
        if (hierarchicalRewrites.length > 0) {
            const prev = hierarchicalRewrites[hierarchicalRewrites.length - 1];
            if (start < prev.end) {
                prev.end = Math.max(prev.end, end);
                continue;
            }
        }
        hierarchicalRewrites.push({ start, end });
    }
    for (let i = hierarchicalRewrites.length - 1; i >= 0; i--) {
        const m = hierarchicalRewrites[i];
        result = result.substring(0, m.start) + ' '.repeat(m.end - m.start) + result.substring(m.end);
        changed = true;
    }

    return changed ? result : null;
}

/**
 * Find where an Oracle hierarchical clause (START WITH / CONNECT BY / ORDER SIBLINGS BY)
 * ends in masked SQL. Scans forward from `pos` until hitting a clause-ending keyword,
 * a semicolon, a closing paren at depth 0, or end-of-string.
 */
function findHierarchicalClauseEnd(masked: string, pos: number): number {
    const upper = masked.toUpperCase();
    let depth = 0;

    for (let i = pos; i < masked.length; i++) {
        const ch = masked[i];
        if (ch === '(') { depth++; continue; }
        if (ch === ')') {
            if (depth === 0) { return i; }
            depth--;
            continue;
        }
        if (ch === ';') { return i; }

        if (depth !== 0) { continue; }

        // Check for clause-ending keywords at word boundary
        if (!/\s/.test(ch)) { continue; }
        let keyStart = i;
        while (keyStart < masked.length && /\s/.test(masked[keyStart])) { keyStart++; }
        if (keyStart >= masked.length) { return masked.length; }

        // Keywords that end the hierarchical clause (another hierarchical keyword is handled by the caller)
        const terminators = [
            'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY',
            'UNION', 'INTERSECT', 'EXCEPT', 'MINUS', 'FETCH', 'LIMIT', 'OFFSET',
            'START WITH', 'CONNECT BY', 'ORDER SIBLINGS BY',
        ];
        for (const kw of terminators) {
            if (upper.startsWith(kw, keyStart)) {
                const afterKw = keyStart + kw.length;
                const nextCh = masked[afterKw];
                if (!nextCh || /[\s();,]/.test(nextCh)) {
                    return keyStart;
                }
            }
        }

        i = keyStart - 1;
    }

    return masked.length;
}

/**
 * Rewrite GROUPING SETS clauses into a flat GROUP BY column list so the parser
 * can continue when GROUPING SETS syntax is unsupported.
 */
export function rewriteGroupingSets(sql: string): string | null {
    const masked = maskStringsAndComments(sql);
    const groupByRegex = /\bGROUP\s+BY\b/gi;
    const rewrites: Array<{ start: number; end: number; replacement: string }> = [];

    let match: RegExpExecArray | null;
    while ((match = groupByRegex.exec(masked)) !== null) {
        const clauseStart = match.index + match[0].length;
        const clauseEnd = findGroupByClauseEnd(masked, clauseStart);
        const clauseSql = sql.substring(clauseStart, clauseEnd);
        const clauseMasked = masked.substring(clauseStart, clauseEnd);
        const rewrittenClause = rewriteGroupingSetsClause(clauseSql, clauseMasked);
        if (rewrittenClause === null) {
            continue;
        }

        rewrites.push({
            start: match.index,
            end: clauseEnd,
            replacement: rewrittenClause.length > 0 ? `GROUP BY ${rewrittenClause}` : '',
        });

        groupByRegex.lastIndex = clauseEnd;
    }

    if (rewrites.length === 0) {
        return null;
    }

    let result = sql;
    for (let i = rewrites.length - 1; i >= 0; i--) {
        const rewrite = rewrites[i];
        result = result.substring(0, rewrite.start) + rewrite.replacement + result.substring(rewrite.end);
    }
    return result;
}

/**
 * Collapse Snowflake path chains with 3+ segments (e.g. v:a:b:c) to 2 segments
 * (v:a:b), which is enough for structure parsing and avoids parser failures.
 */
export function collapseSnowflakePaths(sql: string, dialect: SqlDialect): string | null {
    if (dialect !== 'Snowflake') {
        return null;
    }

    const masked = maskStringsAndComments(sql);
    const deepPathRegex = /\b([A-Za-z0-9_][\w$]*)((?::(?!:)[A-Za-z0-9_][\w$]*){3,})/g;
    const rewrites: Array<{ start: number; end: number; replacement: string }> = [];

    let match: RegExpExecArray | null;
    while ((match = deepPathRegex.exec(masked)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const pathText = sql.substring(start, end);
        const segments = pathText.split(':');
        const prefix = segments[0]?.trim() || '';

        if (/^\d+$/.test(prefix)) {
            continue;
        }
        if (segments.length < 4) {
            continue;
        }

        const collapsedPath = `${segments[0]}:${segments[1]}:${segments[2]}`;
        if (collapsedPath === pathText) {
            continue;
        }

        rewrites.push({ start, end, replacement: collapsedPath });
    }

    if (rewrites.length === 0) {
        return null;
    }

    let result = sql;
    for (let i = rewrites.length - 1; i >= 0; i--) {
        const rewrite = rewrites[i];
        result = result.substring(0, rewrite.start) + rewrite.replacement + result.substring(rewrite.end);
    }
    return result;
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

function rewriteGroupingSetsClause(clauseSql: string, clauseMasked: string): string | null {
    const groupingSetsRegex = /\bGROUPING\s+SETS\s*\(/gi;
    const extractedGroupingColumns: string[] = [];
    const clauseFragments: string[] = [];
    let cursor = 0;
    let changed = false;
    let match: RegExpExecArray | null;

    while ((match = groupingSetsRegex.exec(clauseMasked)) !== null) {
        const openParenPos = match.index + match[0].length - 1;
        const closeParenPos = findMatchingParen(clauseMasked, openParenPos);
        if (closeParenPos === -1) {
            continue;
        }

        changed = true;
        clauseFragments.push(clauseSql.substring(cursor, match.index));
        const groupingSetsBody = clauseSql.substring(openParenPos + 1, closeParenPos);
        extractedGroupingColumns.push(...extractGroupingSetsColumns(groupingSetsBody));
        cursor = closeParenPos + 1;

        groupingSetsRegex.lastIndex = closeParenPos + 1;
    }

    if (!changed) {
        return null;
    }

    clauseFragments.push(clauseSql.substring(cursor));
    const mergedParts = [
        ...clauseFragments.flatMap(fragment => splitTopLevelComma(fragment)),
        ...extractedGroupingColumns,
    ]
        .map(part => part.trim())
        .filter(Boolean);

    const dedupedParts: string[] = [];
    const seen = new Set<string>();
    for (const part of mergedParts) {
        const dedupeKey = normalizeSqlExpression(part);
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);
        dedupedParts.push(part);
    }
    return dedupedParts.join(', ');
}

function extractGroupingSetsColumns(groupingSetsBody: string): string[] {
    const columns: string[] = [];
    const seen = new Set<string>();
    const groupingItems = splitTopLevelComma(groupingSetsBody)
        .map(item => item.trim())
        .filter(Boolean);

    for (const groupingItem of groupingItems) {
        let values: string[] = [];
        if (groupingItem.startsWith('(') && groupingItem.endsWith(')')) {
            const inner = groupingItem.slice(1, -1);
            values = splitTopLevelComma(inner);
        } else {
            values = [groupingItem];
        }

        for (const value of values) {
            const normalized = value.trim();
            if (!normalized) {
                continue;
            }
            const dedupeKey = normalizeSqlExpression(normalized);
            if (seen.has(dedupeKey)) {
                continue;
            }
            seen.add(dedupeKey);
            columns.push(normalized);
        }
    }

    return columns;
}

function normalizeSqlExpression(expression: string): string {
    return expression.replace(/\s+/g, ' ').trim().toLowerCase();
}

function splitTopLevelComma(value: string): string[] {
    const masked = maskStringsAndComments(value);
    const parts: string[] = [];
    let depth = 0;
    let segmentStart = 0;

    for (let i = 0; i < masked.length; i++) {
        const ch = masked[i];
        if (ch === '(') {
            depth++;
            continue;
        }
        if (ch === ')') {
            if (depth > 0) {
                depth--;
            }
            continue;
        }
        if (ch === ',' && depth === 0) {
            parts.push(value.substring(segmentStart, i));
            segmentStart = i + 1;
        }
    }

    parts.push(value.substring(segmentStart));
    return parts;
}

function findGroupByClauseEnd(masked: string, clauseStart: number): number {
    const upperMasked = masked.toUpperCase();
    let depth = 0;

    for (let i = clauseStart; i < masked.length; i++) {
        const ch = masked[i];

        if (ch === '(') {
            depth++;
            continue;
        }

        if (ch === ')') {
            if (depth === 0) {
                return i;
            }
            depth--;
            continue;
        }

        if (depth !== 0) {
            continue;
        }

        if (!isWhitespace(ch)) {
            continue;
        }

        let keywordStart = i;
        while (keywordStart < masked.length && isWhitespace(masked[keywordStart])) {
            keywordStart++;
        }
        if (keywordStart >= masked.length) {
            break;
        }

        if (isClauseEndingKeywordAt(upperMasked, keywordStart)) {
            return i;
        }
        i = keywordStart - 1;
    }

    return masked.length;
}

function isClauseEndingKeywordAt(upperSql: string, position: number): boolean {
    const clauseEndKeywords = ['HAVING', 'QUALIFY', 'WINDOW', 'LIMIT', 'FETCH', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT'];
    for (const keyword of clauseEndKeywords) {
        if (matchesKeywordAt(upperSql, position, keyword)) {
            return true;
        }
    }

    if (upperSql.startsWith('ORDER BY', position)) {
        const afterOrderBy = position + 'ORDER BY'.length;
        if (isBoundaryChar(upperSql[afterOrderBy])) {
            return true;
        }
    }

    return false;
}

function matchesKeywordAt(upperSql: string, position: number, keyword: string): boolean {
    if (!upperSql.startsWith(keyword, position)) {
        return false;
    }
    const nextChar = upperSql[position + keyword.length];
    return isBoundaryChar(nextChar);
}

function isWhitespace(ch: string | undefined): boolean {
    if (!ch) {
        return false;
    }
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isBoundaryChar(ch: string | undefined): boolean {
    if (!ch) {
        return true;
    }
    if (isWhitespace(ch)) {
        return true;
    }
    if (ch === ')' || ch === '(' || ch === ',' || ch === ';') {
        return true;
    }
    if (ch === '\0') {
        return true;
    }
    return !/[A-Z0-9_$]/.test(ch);
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
