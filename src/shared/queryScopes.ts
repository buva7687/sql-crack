function isPrefixedSelectIdentifier(sql: string, index: number): boolean {
    if (index <= 0) { return false; }
    const prev = sql[index - 1];
    if (prev === '.' || prev === '$' || prev === '@' || prev === '#' || prev === ':') {
        return true;
    }
    let pos = index - 1;
    while (pos >= 0 && /\s/.test(sql[pos])) { pos--; }
    return pos >= 0 && sql[pos] === '.';
}

/** Query scopes in SQL order, shared by source annotations and AST repairs. */
export function getQueryScopeOffsets(maskedSql: string): Int32Array {
    const scopes = new Int32Array(maskedSql.length + 1).fill(-1);
    const parents = [-1];
    let depth = 0;
    let nextScope = 0;
    let cursor = 0;
    for (const token of maskedSql.matchAll(/[A-Za-z_][\w$]*|[();]/g)) {
        scopes.fill(parents[depth], cursor, token.index);
        if (token[0] === ';') {
            depth = 0;
            parents[0] = -1;
        } else if (token[0] === '(') {
            depth++;
            parents[depth] = parents[depth - 1];
        } else if (token[0] === ')') {
            depth = Math.max(0, depth - 1);
        } else if (token[0].toUpperCase() === 'SELECT' && !isPrefixedSelectIdentifier(maskedSql, token.index)) {
            parents[depth] = nextScope++;
        }
        cursor = token.index + token[0].length;
        scopes.fill(parents[depth], token.index, cursor);
    }
    scopes.fill(parents[depth], cursor);
    return scopes;
}

/** Visit CTE bodies before their SELECT, then expressions and nested relations. */
export function visitQueryScopes(ast: unknown, visitor: (statement: any, scope: number) => void): void {
    const seen = new Set<object>();
    let scope = 0;
    const visit = (value: any): void => {
        if (!value || typeof value !== 'object' || seen.has(value)) { return; }
        seen.add(value);
        if (Array.isArray(value)) { value.forEach(visit); return; }
        if (value.type === 'select') {
            visit(value.with);
            visitor(value, scope++);
        } else if (Array.isArray(value.from)) {
            visitor(value, -1);
        }
        for (const key of Object.keys(value)) {
            if (value.type !== 'select' || key !== 'with') { visit(value[key]); }
        }
    };
    visit(ast);
}
