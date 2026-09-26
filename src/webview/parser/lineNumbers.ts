// Line number extraction and assignment for nodes

import { FlowNode } from '../types';
import {
    escapeRegex,
    getDollarQuotedTokenEnd,
    isPostgresJsonPathOperatorAt,
    maskSqlCommentsPreservingPositions,
    quotedStringAllowsBackslashEscapes,
} from '../../shared';

function stripCommentsPreserveLineNumbers(sql: string): string {
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
                if (chars[i] !== '\n' && chars[i] !== '\r') {
                    chars[i] = ' ';
                }
                i++;
            }
            continue;
        }

        if (chars[i] === '-' && i + 1 < chars.length && chars[i + 1] === '-') {
            while (i < chars.length && chars[i] !== '\n' && chars[i] !== '\r') {
                chars[i] = ' ';
                i++;
            }
            continue;
        }

        if (chars[i] === '#' && !isPostgresJsonPathOperatorAt(sql, i)) {
            const next = i + 1 < chars.length ? chars[i + 1] : '';
            const isIdentChar = /[a-zA-Z0-9_]/.test(next);
            if (!isIdentChar) {
                while (i < chars.length && chars[i] !== '\n' && chars[i] !== '\r') {
                    chars[i] = ' ';
                    i++;
                }
                continue;
            }
        }
        i++;
    }

    return chars.join('');
}

export function extractKeywordLineNumbers(sql: string): Map<string, number[]> {
    const lines = stripCommentsPreserveLineNumbers(sql).split('\n');
    const keywordLines = new Map<string, number[]>();

    const keywords = [
        'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT',
        'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
        'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
        'WITH', 'UNION', 'INTERSECT', 'EXCEPT', 'AS',
        'MERGE', 'INTO', 'USING', 'INSERT', 'UPDATE', 'DELETE'
    ];

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1; // 1-indexed
        const lineWithoutComments = lines[i];
        if (!lineWithoutComments.trim()) {
            continue;
        }
        const upperLine = lineWithoutComments.toUpperCase();

        for (const keyword of keywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(upperLine)) {
                if (!keywordLines.has(keyword)) {
                    keywordLines.set(keyword, []);
                }
                keywordLines.get(keyword)!.push(lineNum);
            }
        }
    }

    return keywordLines;
}

/**
 * Where a character sits relative to the statement's outer query.
 *
 * `depth` counts enclosing parentheses, except parens that only wrap a whole
 * query or set-operation branch (`(SELECT ...) UNION (SELECT ...)`,
 * `CREATE VIEW v AS (SELECT ...)`), so every branch of the outer query is at
 * depth 0 while CTE bodies, derived tables, scalar subqueries, and `OVER (...)`
 * specs are deeper. `group` is the offset of the innermost enclosing paren
 * (-1 outside all parens), so siblings in one list share a group.
 */
interface NestingInfo {
    depth: Int32Array;
    group: Int32Array;
    inCteBody: Uint8Array;
    inQuotes: Uint8Array;
}

interface SqlOccurrence {
    key: string;
    offset: number;
    line: number;
    depth: number;
    inCteBody: boolean;
    inQuotes: boolean;
}

interface KeywordOccurrence extends SqlOccurrence {
    keyword: string;
}

type OccurrencePredicate<T extends SqlOccurrence> = (occurrence: T) => boolean;

const OCCURRENCE_KEYWORDS: ReadonlyArray<[string, RegExp]> = [
    'SELECT', 'WHERE', 'HAVING', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 'WITH',
    'UNION', 'INTERSECT', 'EXCEPT', 'MINUS', 'MERGE', 'INSERT', 'UPDATE', 'DELETE',
    'OVER', 'CASE',
].map(keyword => [keyword, new RegExp(`\\b${keyword.replace(' ', '\\s+')}\\b`, 'gi')]);

const TRANSPARENT_PAREN_BODY = /^\s*(?:SELECT|WITH|VALUES|\()/i;
const SET_OPERATOR_BEFORE = /\b(?:UNION|INTERSECT|EXCEPT|MINUS)(?:\s+(?:ALL|DISTINCT))?\s*$/i;
const CTE_BODY_BEFORE = /\bAS\s*(?:NOT\s+)?(?:MATERIALIZED\s*)?$/i;
const JOIN_MODIFIER_BEFORE = /\b(?:LEFT|RIGHT|FULL|CROSS|NATURAL|OUTER|SEMI|ANTI|ASOF|POSITIONAL)\s+$/i;
const TABLE_KEYWORD_CONTEXT = /\b(?:FROM|JOIN|INTO|USING|UPDATE|TABLE|ONLY|DELETE|MERGE|VIEW|EXISTS)\s+(?:(?:[\w$#]+|"[^"]*"|`[^`]*`|\[[^\]]*\])\s*\.\s*)*["`[]?$/i;
const CTE_DEFINITION_AFTER = /^["`\]]?\s*(?:\([^()]*\)\s*)?AS\s*(?:NOT\s+)?(?:MATERIALIZED\s*)?\(/i;
const TABLE_COMMA_CONTEXT = /,\s*(?:(?:[\w$#]+|"[^"]*"|`[^`]*`|\[[^\]]*\])\s*\.\s*)*["`[]?$/i;
const CLAUSE_KEYWORD = /\b(?:SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|QUALIFY|WINDOW|ON|USING|JOIN|SET|VALUES|RETURNING|UPDATE|DELETE|INTO|UNION|INTERSECT|EXCEPT|MINUS)\b/gi;
/** Clauses whose comma-separated items are table references. */
const TABLE_LIST_CLAUSES: ReadonlySet<string> = new Set(['FROM', 'JOIN', 'ON', 'USING', 'UPDATE', 'DELETE']);

function analyzeNesting(sql: string): NestingInfo {
    // Comments are masked string-aware so parens and quotes inside them are ignored.
    const code = maskSqlCommentsPreservingPositions(sql);
    const depth = new Int32Array(code.length);
    const inCteBody = new Uint8Array(code.length);
    const inQuotes = new Uint8Array(code.length);
    const group = new Int32Array(code.length);
    // `withSeen` tracks a WITH clause per paren level, so CTE bodies nested
    // in a derived table (`FROM (WITH c AS (...) SELECT ...) s`) are found too.
    const topLevel = { withSeen: false };
    const stack: Array<{ counts: boolean; cteBody: boolean; open: number; withSeen: boolean }> = [];
    const firstCodeOffset = code.search(/\S/);
    let currentDepth = 0;
    let openCteBodies = 0;
    const currentLevel = (): { withSeen: boolean } => stack[stack.length - 1] ?? topLevel;

    const fill = (start: number, end: number, quoted: boolean): void => {
        const enclosing = stack.length > 0 ? stack[stack.length - 1].open : -1;
        for (let p = start; p < end && p < code.length; p++) {
            depth[p] = currentDepth;
            group[p] = enclosing;
            inCteBody[p] = openCteBodies > 0 ? 1 : 0;
            inQuotes[p] = quoted ? 1 : 0;
        }
    };

    let i = 0;
    while (i < code.length) {
        const ch = code[i];

        const dollarQuotedEnd = getDollarQuotedTokenEnd(code, i);
        if (dollarQuotedEnd !== null) {
            fill(i, dollarQuotedEnd, true);
            i = dollarQuotedEnd;
            continue;
        }

        // Mirrors maskSqlCommentsPreservingPositions so both agree on quote boundaries.
        if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
            const closingQuote = ch === '[' ? ']' : ch;
            const escapesAllowed = ch !== '[' && quotedStringAllowsBackslashEscapes(code, i, true);
            let end = i + 1;
            while (end < code.length) {
                if (escapesAllowed && code[end] === '\\' && end + 1 < code.length) {
                    end += 2;
                    continue;
                }
                if (code[end] === closingQuote) {
                    if (code[end + 1] === closingQuote) {
                        end += 2;
                        continue;
                    }
                    end++;
                    break;
                }
                end++;
            }
            fill(i, end, true);
            i = end;
            continue;
        }

        if (ch === '(') {
            const before = code.slice(Math.max(0, i - 48), i);
            const wrapsQuery = TRANSPARENT_PAREN_BODY.test(code.slice(i + 1, i + 64)) && (
                i === firstCodeOffset
                || /;\s*$/.test(before)
                || SET_OPERATOR_BEFORE.test(before)
                || (/\(\s*$/.test(before) && stack.length > 0 && !stack[stack.length - 1].counts)
                || (currentDepth === 0 && !currentLevel().withSeen && /\bAS\s*$/i.test(before))
            );
            const cteBody = !wrapsQuery && currentLevel().withSeen && CTE_BODY_BEFORE.test(before);
            fill(i, i + 1, false);
            stack.push({ counts: !wrapsQuery, cteBody, open: i, withSeen: false });
            if (!wrapsQuery) { currentDepth++; }
            if (cteBody) { openCteBodies++; }
            i++;
            continue;
        }

        if (ch === ')') {
            const open = stack.pop();
            if (open?.counts) { currentDepth--; }
            if (open?.cteBody) { openCteBodies--; }
            fill(i, i + 1, false);
            i++;
            continue;
        }

        if ((ch === 'W' || ch === 'w')
            && !/[\w$#]/.test(code[i - 1] || '') && /^WITH\b/i.test(code.slice(i, i + 5))) {
            currentLevel().withSeen = true;
        }

        fill(i, i + 1, false);
        i++;
    }

    return { depth, group, inCteBody, inQuotes };
}

export function assignLineNumbers(nodes: FlowNode[], sql: string): void {
    const keywordLines = extractKeywordLineNumbers(sql);
    const sqlLines = sql.split('\n');
    const commentStripped = stripCommentsPreserveLineNumbers(sql);
    const commentStrippedLines = commentStripped.split('\n');
    const clauseRegex = /\b(from|join|into|using|update|delete)\b/i;
    // DDL and utility statements (CREATE, DROP, ALTER, RENAME, TRUNCATE, ...)
    // have no SELECT/DML anchor; their nodes fall back to the statement's
    // first code line so click-to-source still works.
    const firstCodeLineIndex = commentStrippedLines.findIndex(line => line.trim() !== '');
    const firstCodeLine = firstCodeLineIndex >= 0 ? firstCodeLineIndex + 1 : undefined;

    const nesting = analyzeNesting(sql);
    const lineStarts = [0];
    for (let p = 0; p < commentStripped.length; p++) {
        if (commentStripped[p] === '\n') { lineStarts.push(p + 1); }
    }
    const lineAt = (offset: number): number => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= offset) { lo = mid; } else { hi = mid - 1; }
        }
        return lo + 1;
    };
    const occurrenceAt = (key: string, offset: number): SqlOccurrence => ({
        key,
        offset,
        line: lineAt(offset),
        depth: nesting.depth[offset] ?? 0,
        inCteBody: nesting.inCteBody[offset] === 1,
        inQuotes: nesting.inQuotes[offset] === 1,
    });

    const occurrencesByKeyword = new Map<string, KeywordOccurrence[]>();
    for (const [keyword, pattern] of OCCURRENCE_KEYWORDS) {
        const found: KeywordOccurrence[] = [];
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(commentStripped)) !== null) {
            found.push({ ...occurrenceAt(`${keyword}@${match.index}`, match.index), keyword });
        }
        occurrencesByKeyword.set(keyword, found);
    }
    const occurrencesOf = (...keywords: string[]): KeywordOccurrence[] => keywords
        .flatMap(keyword => occurrencesByKeyword.get(keyword) || [])
        .sort((a, b) => a.offset - b.offset);

    /** In the outer query: not inside a CTE body, subquery, OVER (...), or literal. */
    const isOuter = (occurrence: SqlOccurrence): boolean => occurrence.depth === 0 && !occurrence.inQuotes;
    const textBefore = (offset: number, length = 64): string =>
        commentStripped.slice(Math.max(0, offset - length), offset);

    const clauses: Array<{ offset: number; keyword: string }> = [];
    CLAUSE_KEYWORD.lastIndex = 0;
    let clauseMatch: RegExpExecArray | null;
    while ((clauseMatch = CLAUSE_KEYWORD.exec(commentStripped)) !== null) {
        if (nesting.inQuotes[clauseMatch.index] !== 1) {
            clauses.push({ offset: clauseMatch.index, keyword: clauseMatch[0].split(/\s/)[0].toUpperCase() });
        }
    }
    /** Whether the nearest clause before `offset` in its paren group lists tables. */
    const inTableList = (offset: number): boolean => {
        const offsetGroup = nesting.group[offset];
        for (let c = clauses.length - 1; c >= 0; c--) {
            if (clauses[c].offset < offset && nesting.group[clauses[c].offset] === offsetGroup) {
                return TABLE_LIST_CLAUSES.has(clauses[c].keyword);
            }
        }
        return false;
    };

    // Occurrences already attributed to a node, so same-type nodes (one per
    // UNION branch, say) each get their own clause.
    const used = new Set<string>();

    /**
     * Earliest occurrence satisfying the first predicate that matches any,
     * falling back to any occurrence at all. `claim` marks it used.
     */
    function pick<T extends SqlOccurrence>(
        candidates: T[],
        predicates: OccurrencePredicate<T>[],
        claim: boolean
    ): T | undefined {
        for (const predicate of [...predicates, () => true]) {
            const hit = candidates.find(c => (!claim || !used.has(c.key)) && predicate(c));
            if (hit) {
                if (claim) { used.add(hit.key); }
                return hit;
            }
        }
        return undefined;
    }

    /** Get the next unused line for a keyword, preferring the outer query. */
    function claimNextLine(keywords: string[], ...predicates: OccurrencePredicate<KeywordOccurrence>[]): number | undefined {
        return pick(occurrencesOf(...keywords), predicates.length > 0 ? predicates : [isOuter], true)?.line;
    }

    function peekLine(keywords: string[]): number | undefined {
        return pick(occurrencesOf(...keywords), [isOuter], false)?.line;
    }

    function findTableLine(tableName: string): number | undefined {
        const pattern = new RegExp(`(?<![\\w$#])${escapeRegex(tableName)}(?![\\w$#])`, 'gi');
        const candidates: Array<SqlOccurrence & { keywordContext: boolean; commaContext: boolean }> = [];
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(commentStripped)) !== null) {
            const after = commentStripped.slice(match.index + match[0].length, match.index + match[0].length + 160);
            // `orders.id` is a column qualifier and `, recent AS (` a CTE
            // definition; neither is a reference to the table.
            if (/^["`\]]?\s*\./.test(after) || CTE_DEFINITION_AFTER.test(after)) {
                continue;
            }
            const before = textBefore(match.index, 160);
            const occurrence = occurrenceAt(`table:${tableName.toLowerCase()}@${match.index}`, match.index);
            // A whole quoted identifier ("orders", `orders`, [orders]) is a
            // reference, not quoted text.
            const opener = commentStripped[match.index - 1];
            const closer = commentStripped[match.index + match[0].length];
            if ((opener === '"' || opener === '`' || opener === '[')
                && closer === (opener === '[' ? ']' : opener)) {
                occurrence.inQuotes = false;
            }
            candidates.push({
                ...occurrence,
                keywordContext: TABLE_KEYWORD_CONTEXT.test(before),
                commaContext: TABLE_COMMA_CONTEXT.test(before) && inTableList(match.index),
            });
        }
        const predicates: OccurrencePredicate<typeof candidates[number]>[] = [
            c => isOuter(c) && c.keywordContext,
            c => isOuter(c) && c.commaContext,
            c => !c.inQuotes && !c.inCteBody && c.keywordContext,
            c => !c.inQuotes && c.keywordContext,
            c => !c.inQuotes && c.commaContext,
        ];
        // Only clause references count; anything else defers to the line
        // heuristic in the caller. Reuse an occurrence when every one is taken.
        const inClause = candidates.filter(c => c.keywordContext || c.commaContext);
        return (pick(inClause, predicates, true) ?? pick(inClause, predicates, false))?.line;
    }

    function findCteDefinitionLine(cteName: string): number | undefined {
        const pattern = new RegExp(
            `(?<![\\w$#])["\`[]?${escapeRegex(cteName)}["\`\\]]?\\s*(?:\\([^()]*\\)\\s*)?AS\\s*(?:NOT\\s+)?(?:MATERIALIZED\\s*)?\\(`,
            'gi'
        );
        const candidates: SqlOccurrence[] = [];
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(commentStripped)) !== null) {
            candidates.push(occurrenceAt(`cte@${match.index}`, match.index));
        }
        return pick(candidates, [isOuter], false)?.line;
    }

    function matchesJoinType(label: string): OccurrencePredicate<KeywordOccurrence> {
        const modifier = label.toUpperCase().replace(/\bJOIN\b.*$/, '').trim().split(/\s+/)[0] || 'INNER';
        return occurrence => {
            const before = textBefore(occurrence.offset, 40);
            return modifier === 'INNER'
                ? !JOIN_MODIFIER_BEFORE.test(before)
                : new RegExp(`\\b${escapeRegex(modifier)}\\s+(?:\\w+\\s+)?$`, 'i').test(before);
        };
    }

    for (const node of nodes) {
        switch (node.type) {
            case 'table': {
                // RENAME targets are labeled "old → new"; locate the old name.
                const tableName = node.label.split(' → ')[0].trim();
                const clauseLine = tableName ? findTableLine(tableName) : undefined;
                if (clauseLine !== undefined) {
                    node.startLine = clauseLine;
                    break;
                }

                const fromLines = keywordLines.get('FROM') || [];
                const joinLines = [
                    ...(keywordLines.get('JOIN') || []),
                    ...(keywordLines.get('INNER JOIN') || []),
                    ...(keywordLines.get('LEFT JOIN') || []),
                    ...(keywordLines.get('RIGHT JOIN') || []),
                    ...(keywordLines.get('FULL JOIN') || []),
                    ...(keywordLines.get('CROSS JOIN') || [])
                ];
                const intoLines = keywordLines.get('INTO') || [];
                const usingLines = keywordLines.get('USING') || [];
                const updateLines = keywordLines.get('UPDATE') || [];
                const deleteLines = keywordLines.get('DELETE') || [];

                const anchorLines = [
                    ...fromLines,
                    ...joinLines,
                    ...intoLines,
                    ...usingLines,
                    ...updateLines,
                    ...deleteLines,
                ];

                let foundLine: number | undefined;
                const searchStartLine = anchorLines.length > 0 ? Math.min(...anchorLines) : 1;
                const tableRegex = new RegExp(`\\b${escapeRegex(tableName.toLowerCase())}\\b`, 'i');

                for (let i = 0; i < sqlLines.length; i++) {
                    const line = commentStrippedLines[i].toLowerCase();
                    if (tableRegex.test(line)) {
                        const previousLine = i > 0 ? commentStrippedLines[i - 1].toLowerCase() : '';
                        if (i >= searchStartLine - 1 ||
                            clauseRegex.test(line) ||
                            clauseRegex.test(previousLine)) {
                            foundLine = i + 1;
                            break;
                        }
                    }
                }

                node.startLine = foundLine || (fromLines.length > 0 ? fromLines[0] : firstCodeLine);
                break;
            }
            case 'join': {
                const typeMatches = matchesJoinType(node.label);
                node.startLine = claimNextLine(
                    ['JOIN'],
                    o => isOuter(o) && typeMatches(o),
                    isOuter,
                    typeMatches
                );
                break;
            }
            case 'filter': {
                if (node.label === 'WHERE') {
                    node.startLine = claimNextLine(['WHERE']);
                } else if (node.label === 'HAVING') {
                    node.startLine = claimNextLine(['HAVING']);
                }
                break;
            }
            case 'aggregate': {
                node.startLine = claimNextLine(['GROUP BY']);
                break;
            }
            case 'sort': {
                node.startLine = claimNextLine(['ORDER BY']);
                break;
            }
            case 'limit': {
                node.startLine = claimNextLine(['LIMIT']);
                break;
            }
            case 'select': {
                node.startLine = claimNextLine(['SELECT']);
                break;
            }
            case 'cte': {
                const cteName = node.label.replace(/^WITH\s+(?:RECURSIVE\s+)?/i, '').trim();
                node.startLine = (cteName ? findCteDefinitionLine(cteName) : undefined)
                    ?? claimNextLine(['WITH']);
                break;
            }
            case 'union': {
                const operator = node.label.trim().split(/\s+/)[0].toUpperCase();
                node.startLine = claimNextLine(
                    ['UNION', 'INTERSECT', 'EXCEPT', 'MINUS'],
                    o => isOuter(o) && o.keyword === operator,
                    isOuter,
                    o => o.keyword === operator
                );
                break;
            }
            case 'subquery': {
                // A derived table's own SELECT: nested, but not a CTE body.
                const nested = (o: KeywordOccurrence): boolean => o.depth > 0 && !o.inCteBody && !o.inQuotes;
                node.startLine = claimNextLine(
                    ['SELECT'],
                    o => nested(o) && /\(\s*$/.test(textBefore(o.offset)),
                    nested
                );
                break;
            }
            case 'window': {
                node.startLine = claimNextLine(['OVER']) ?? peekLine(['SELECT']);
                break;
            }
            case 'case': {
                node.startLine = claimNextLine(['CASE']) ?? peekLine(['SELECT']);
                break;
            }
            case 'result': {
                node.startLine = peekLine(['SELECT', 'MERGE', 'INSERT', 'UPDATE', 'DELETE'])
                    ?? firstCodeLine;
                break;
            }
        }
    }
}
