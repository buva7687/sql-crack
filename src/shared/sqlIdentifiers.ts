import { dialectSupportsBackslashEscapes, dialectSupportsHashComments, getDollarQuotedTokenEnd, maskSqlCommentsPreservingPositions, quotedStringAllowsBackslashEscapes } from './stringUtils';
import { getQueryScopeOffsets, visitQueryScopes } from './queryScopes';

export interface SqlIdentifier { value: string; quoted: boolean }
interface SqlToken extends SqlIdentifier { offset: number; depth: number; scope: number }
interface RelationIdentifiers { table?: SqlIdentifier; alias?: SqlIdentifier; offset?: number }
const relationIdentifiers = new WeakMap<object, RelationIdentifiers>();
const starQualifiers = new WeakMap<object, SqlIdentifier>();
const columnQualifiers = new WeakMap<object, SqlIdentifier>();
const projectionIdentifiers = new WeakMap<object, SqlIdentifier>();

export function getSqlIdentifierKey(identifier: SqlIdentifier, dialect: string): string {
    const sensitive = ['PostgreSQL', 'Redshift', 'Oracle', 'Snowflake'].includes(dialect);
    if (sensitive && identifier.quoted) { return identifier.value; }
    return dialect === 'Oracle' || dialect === 'Snowflake' ? identifier.value.toUpperCase() : identifier.value.toLowerCase();
}

export function getAstIdentifier(value: any): SqlIdentifier | undefined {
    if (typeof value === 'string') { return { value, quoted: false }; }
    if (!value || typeof value !== 'object') { return undefined; }
    const inner = getAstIdentifier(value.value ?? value.expr);
    return inner && { value: inner.value, quoted: inner.quoted || /quote|backtick|bracket/i.test(value.type ?? '') };
}

export function getRelationIdentifiers(item: object): RelationIdentifiers | undefined { return relationIdentifiers.get(item); }
export function getStarQualifier(expr: object): SqlIdentifier | undefined { return starQualifiers.get(expr); }
export function getColumnQualifier(expr: object): SqlIdentifier | undefined { return columnQualifiers.get(expr); }
export function getProjectionIdentifier(node: object): SqlIdentifier | undefined { return projectionIdentifiers.get(node); }

/** Tokenize identifiers without treating comments or literal contents as SQL. */
export function tokenizeSqlIdentifiers(sql: string, dialect: string): SqlToken[] {
    const options = {
        backslashEscapes: dialectSupportsBackslashEscapes(dialect),
        hashComments: dialectSupportsHashComments(dialect),
        dollarQuotes: dialect !== 'MySQL' && dialect !== 'MariaDB',
    };
    const text = maskSqlCommentsPreservingPositions(sql, options);
    const scopes = getQueryScopeOffsets(maskSqlCommentsPreservingPositions(sql, { ...options, maskQuotedText: true }));
    const tokens: SqlToken[] = [];
    const word = /[\p{L}_#$@][\p{L}\p{N}_#$@]*/uy;
    let depth = 0;
    for (let i = 0; i < text.length;) {
        if (/\s/.test(text[i])) { i++; continue; }
        const dollarEnd = options.dollarQuotes ? getDollarQuotedTokenEnd(text, i) : null;
        if (dollarEnd !== null) { i = dollarEnd; continue; }
        const start = i;
        const quote = text[i];
        if (['\'', '"', '`', '['].includes(quote)) {
            const close = quote === '[' ? ']' : quote;
            const escapes = quote !== '[' && quotedStringAllowsBackslashEscapes(text, i, options.backslashEscapes);
            i++;
            while (i < text.length) {
                if (escapes && text[i] === '\\') { i += 2; continue; }
                if (text[i] === close) {
                    if (text[i + 1] === close) { i += 2; continue; }
                    i++; break;
                }
                i++;
            }
            if (quote !== '\'') {
                tokens.push({ value: text.slice(start + 1, i - 1).split(close + close).join(close), quoted: true, offset: start, depth, scope: scopes[start] });
            }
            continue;
        }
        word.lastIndex = i;
        const match = word.exec(text);
        const value = match?.[0] ?? text[i];
        i += value.length;
        if (value === ')') { depth = Math.max(0, depth - 1); }
        tokens.push({ value, quoted: false, offset: start, depth, scope: scopes[start] });
        if (value === '(') { depth++; }
        if (value === ';') { depth = 0; }
    }
    return tokens;
}

const CLAUSES = new Set(['WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'QUALIFY', 'WINDOW', 'UNION', 'INTERSECT', 'EXCEPT', 'MINUS', 'FOR', 'RETURNING', 'OFFSET', 'FETCH']);
const NON_ALIASES = new Set([...CLAUSES, 'ON', 'USING', 'JOIN', 'LEFT', 'RIGHT', 'FULL', 'INNER', 'OUTER', 'CROSS', 'NATURAL', 'SEMI', 'ANTI', 'LATERAL', 'PIVOT', 'UNPIVOT', 'TABLESAMPLE', 'CONNECT', 'START']);
function isIdentifier(token?: SqlToken): boolean {
    return Boolean(token && (token.quoted || /^[\p{L}_#$@]/u.test(token.value)));
}

function readSources(sql: string, dialect: string): {
    relations: Map<number, RelationIdentifiers[]>;
    stars: Map<number, SqlIdentifier[]>;
    columns: Map<number, Map<string, SqlIdentifier[]>>;
    projections: Map<number, Array<SqlIdentifier | undefined>>;
    cteColumns: Map<string, SqlIdentifier[][]>;
} {
    const tokens = tokenizeSqlIdentifiers(sql, dialect);
    const closes = new Map<number, number>();
    const opens: number[] = [];
    tokens.forEach((token, index) => {
        if (!token.quoted && token.value === '(') { opens.push(index); }
        if (!token.quoted && token.value === ')') { const open = opens.pop(); if (open !== undefined) { closes.set(open, index); } }
    });
    const relations = new Map<number, RelationIdentifiers[]>();
    const stars = new Map<number, SqlIdentifier[]>();
    const columns = new Map<number, Map<string, SqlIdentifier[]>>();
    const projections = new Map<number, Array<SqlIdentifier | undefined>>();
    const cteColumns = new Map<string, SqlIdentifier[][]>();
    const states = new Map<number, {
        depth: number;
        from: boolean;
        seenFrom: boolean;
        expect: boolean;
        inSelectList: boolean;
        hasProjectionToken: boolean;
        currentProjection?: SqlIdentifier;
    }>();
    const pushProjection = (scope: number, item: SqlIdentifier | undefined): void => {
        const list = projections.get(scope) ?? [];
        list.push(item);
        projections.set(scope, list);
    };
    const flushProjection = (
        scope: number,
        state: { inSelectList: boolean; hasProjectionToken: boolean; currentProjection?: SqlIdentifier }
    ): void => {
        if (state.inSelectList && state.hasProjectionToken) {
            pushProjection(scope, state.currentProjection);
        }
        state.inSelectList = false;
        state.hasProjectionToken = false;
        state.currentProjection = undefined;
    };
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const prevDot = !tokens[i - 1]?.quoted && tokens[i - 1]?.value === '.';
        const nextDot = !tokens[i + 1]?.quoted && tokens[i + 1]?.value === '.'
            && (isIdentifier(tokens[i + 2]) || (!tokens[i + 2]?.quoted && tokens[i + 2]?.value === '*'));
        const keyword = token.quoted || prevDot || nextDot ? '' : token.value.toUpperCase();

        // Capture declared CTE column lists (`cte_name(col1, "Col2") AS (...)`)
        // so quote provenance survives grammars that flatten column lists to strings.
        if (isIdentifier(token) && !tokens[i + 1]?.quoted && tokens[i + 1]?.value === '(') {
            const close = closes.get(i + 1);
            if (close !== undefined && close > i + 2) {
                let after = close + 1;
                if (tokens[after] && !tokens[after].quoted && tokens[after].value.toUpperCase() === 'AS') {
                    after++;
                    if (tokens[after] && !tokens[after].quoted && tokens[after].value.toUpperCase() === 'NOT') { after++; }
                    if (tokens[after] && !tokens[after].quoted && tokens[after].value.toUpperCase() === 'MATERIALIZED') { after++; }
                    if (tokens[after] && !tokens[after].quoted && tokens[after].value === '(') {
                        const cols: SqlIdentifier[] = [];
                        let valid = true;
                        for (let j = i + 2; j < close; j++) {
                            const entry = tokens[j];
                            if (!entry.quoted && entry.value === ',') { continue; }
                            if (!isIdentifier(entry)) { valid = false; break; }
                            cols.push(entry);
                        }
                        if (valid && cols.length > 0) {
                            const key = JSON.stringify([token.value, ...cols.map(c => c.value)]);
                            const list = cteColumns.get(key) ?? [];
                            list.push(cols);
                            cteColumns.set(key, list);
                        }
                    }
                }
            }
        }

        if (keyword === 'SELECT') {
            states.set(token.scope, {
                depth: token.depth,
                from: false,
                seenFrom: false,
                expect: false,
                inSelectList: true,
                hasProjectionToken: false,
                currentProjection: undefined,
            });
        }
        const state = states.get(token.scope);
        // Capture projected qualifiers at every expression depth. Proxy grammars
        // discard their delimiters even when FROM aliases retain their identity.
        const column = tokens[i + 2];
        if (state && !state.seenFrom && isIdentifier(token) && !tokens[i + 1]?.quoted && tokens[i + 1]?.value === '.'
            && (isIdentifier(column) || (!column?.quoted && column?.value === '*'))) {
            const key = JSON.stringify([token.value, column.value]);
            const byName = columns.get(token.scope) ?? new Map<string, SqlIdentifier[]>();
            const qualifiers = byName.get(key) ?? [];
            qualifiers.push(token);
            byName.set(key, qualifiers);
            columns.set(token.scope, byName);
        }
        if (!state || token.depth !== state.depth) { continue; }
        if (state.inSelectList && keyword !== 'SELECT') {
            if (keyword === 'FROM' || keyword === 'INTO' || CLAUSES.has(keyword) || (!token.quoted && token.value === ';')) {
                flushProjection(token.scope, state);
            } else if (!token.quoted && token.value === ',') {
                if (state.hasProjectionToken) {
                    pushProjection(token.scope, state.currentProjection);
                }
                state.hasProjectionToken = false;
                state.currentProjection = undefined;
            } else {
                state.hasProjectionToken = true;
                state.currentProjection = isIdentifier(token) ? token : undefined;
            }
        }
        if (!state.seenFrom && isIdentifier(token) && !tokens[i + 1]?.quoted && tokens[i + 1]?.value === '.'
            && !tokens[i + 2]?.quoted && tokens[i + 2]?.value === '*') {
            const list = stars.get(token.scope) ?? []; list.push(token); stars.set(token.scope, list);
        }
        if (keyword === 'INTO') { state.seenFrom = true; }
        if (CLAUSES.has(keyword)) { state.from = false; state.expect = false; state.seenFrom = true; }
        if (keyword === 'FROM') { state.from = state.seenFrom = state.expect = true; continue; }
        if (state.from && (keyword === 'JOIN' || token.value === ',' && !token.quoted)) { state.expect = true; continue; }
        if (!state.expect || keyword === 'LATERAL' || keyword === 'ONLY') { continue; }
        state.expect = false;
        let cursor = i;
        let table: SqlIdentifier | undefined;
        if (isIdentifier(token)) {
            table = token;
            while (!tokens[cursor + 1]?.quoted && tokens[cursor + 1]?.value === '.' && isIdentifier(tokens[cursor + 2])) { cursor += 2; table = tokens[cursor]; }
        } else if (token.value !== '(') { continue; }
        if (token.value === '(' || (!tokens[cursor + 1]?.quoted && tokens[cursor + 1]?.value === '(')) {
            const close = closes.get(token.value === '(' ? cursor : cursor + 1);
            if (close === undefined) { continue; }
            cursor = close;
            table = undefined;
        }
        let next = tokens[cursor + 1];
        if (next && !next.quoted && next.value.toUpperCase() === 'AS') { next = tokens[cursor + 2]; }
        const alias = next && isIdentifier(next) && (next.quoted || !NON_ALIASES.has(next.value.toUpperCase())) ? next : undefined;
        const list = relations.get(token.scope) ?? []; list.push({ table, alias, offset: token.offset }); relations.set(token.scope, list);
    }
    for (const [scope, state] of states) {
        flushProjection(scope, state);
    }
    return { relations, stars, columns, projections, cteColumns };
}

/** Match repeated references by name and SQL order, without entering child queries. */
function annotateColumnQualifiers(statement: any, qualifiers: Map<string, SqlIdentifier[]> | undefined): void {
    if (!qualifiers) { return; }
    const expressions = new Map<string, object[]>();
    const visit = (value: any): void => {
        if (!value || typeof value !== 'object' || value.type === 'select') { return; }
        if (Array.isArray(value)) { value.forEach(visit); return; }
        if (value.type === 'column_ref') {
            const table = getAstIdentifier(value.table);
            const column = getAstIdentifier(value.column);
            if (table && column) {
                const key = JSON.stringify([table.value, column.value]);
                const matches = expressions.get(key) ?? [];
                matches.push(value);
                expressions.set(key, matches);
            }
            return;
        }
        Object.values(value).forEach(visit);
    };
    visit(statement.columns);
    for (const [key, matches] of expressions) {
        const tokens = qualifiers.get(key);
        // Do not guess when a grammar rewrote or omitted a projection.
        if (tokens?.length === matches.length) {
            matches.forEach((expr, index) => columnQualifiers.set(expr, tokens[index]));
        }
    }
}

export function getSqlRelationIdentifiers(sql: string, dialect: string): RelationIdentifiers[] {
    return [...readSources(sql, dialect).relations.values()].flat();
}

/** Restore identifier provenance that proxy grammars discard on FROM items and stars. */
export function annotateSqlIdentifiers(ast: unknown, sql: string, dialect: string): void {
    const sources = readSources(sql, dialect);
    visitQueryScopes(ast, (statement, scope) => {
        annotateColumnQualifiers(statement, sources.columns.get(scope));
        if (Array.isArray(statement.with)) {
            for (const cte of statement.with) {
                if (!Array.isArray(cte?.columns) || cte.columns.length === 0) { continue; }
                const cteName = getAstIdentifier(cte.name)?.value;
                const colNames = cte.columns.map((col: any) => getAstIdentifier(col?.type === 'column_ref' ? col.column : col)?.value);
                if (!cteName || colNames.some((name: unknown) => typeof name !== 'string')) { continue; }
                const key = JSON.stringify([cteName, ...colNames]);
                const entry = sources.cteColumns.get(key)?.shift();
                if (entry && entry.length === cte.columns.length) {
                    cte.columns.forEach((col: object, idx: number) => {
                        if (col && typeof col === 'object') {
                            projectionIdentifiers.set(col, entry[idx]);
                        }
                    });
                }
            }
        }
        const from = statement.from;
        const relations = sources.relations.get(scope);
        if (Array.isArray(from) && relations?.length === from.length) {
            from.forEach((item: object, index: number) => relationIdentifiers.set(item, relations[index]));
        }
        const statementColumns = Array.isArray(statement.columns) ? statement.columns : [];
        const projections = sources.projections.get(scope);
        if (projections && projections.length === statementColumns.length) {
            statementColumns.forEach((column: any, index: number) => {
                const token = projections[index];
                if (!column || typeof column !== 'object' || !token) { return; }
                const astOutput = getAstIdentifier(column.as)?.value
                    ?? (column.expr?.type === 'column_ref' ? getAstIdentifier(column.expr.column)?.value : undefined)
                    ?? (column.expr?.type === 'double_quote_string' ? getAstIdentifier(column.expr)?.value : undefined);
                if (astOutput === token.value) {
                    projectionIdentifiers.set(column, token);
                }
            });
        }
        const stars = sources.stars.get(scope) ?? [];
        let index = 0;
        for (const column of statementColumns) {
            if (column?.expr?.type === 'column_ref' && column.expr.column === '*' && column.expr.table && stars[index]) {
                starQualifiers.set(column.expr, stars[index++]);
            }
        }
    });
}
