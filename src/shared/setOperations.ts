import type { SqlDialect } from '../webview/types';

export type SetOperationTree = {
    statement: any;
} | {
    operator: string;
    left: SetOperationTree;
    right: SetOperationTree;
    tail?: { orderby: any; limit: any };
};

function isSetOperationFromItem(item: any): boolean {
    // node-sql-parser represents a parenthesized right operand as a FROM item.
    return !!item?.expr?.ast && /^(?:UNION|INTERSECT|EXCEPT)(?:\s+(?:ALL|DISTINCT))?$/i.test(item.join || '');
}

function hasLimit(limit: any): boolean {
    return !!limit && !(Array.isArray(limit.value) && limit.value.length === 0);
}

function hasTail(statement: any): boolean {
    const orderby = statement.orderby;
    return !!(Array.isArray(orderby) ? orderby.length : orderby?.columns?.length) || hasLimit(statement.limit);
}

function precedence(operator: string, dialect: SqlDialect): number {
    // SQLite and Oracle evaluate compound operators from left to right.
    return /^INTERSECT\b/.test(operator) && dialect !== 'SQLite' && dialect !== 'Oracle' ? 2 : 1;
}

function foldOperations(operands: SetOperationTree[], operators: string[], dialect: SqlDialect): SetOperationTree {
    const values: SetOperationTree[] = [operands[0]];
    const pending: string[] = [];
    const reduce = (): void => {
        const right = values.pop()!;
        const left = values.pop()!;
        values.push({ operator: pending.pop()!, left, right });
    };
    operators.forEach((operator, index) => {
        while (pending.length && precedence(pending[pending.length - 1], dialect) >= precedence(operator, dialect)) {
            reduce();
        }
        pending.push(operator);
        values.push(operands[index + 1]);
    });
    while (pending.length) { reduce(); }
    return values[0];
}

function buildTree(statement: any, dialect: SqlDialect): SetOperationTree {
    const branches: any[] = [];
    const operators: string[] = [];
    for (let branch = statement; branch; branch = branch._next) {
        branches.push({ ...branch, _next: undefined, set_op: undefined, _orderby: undefined, _limit: undefined });
        if (branch._next) { operators.push(String(branch.set_op || 'UNION').toUpperCase()); }
    }

    let tail: { orderby: any; limit: any } | undefined;
    const last = branches[branches.length - 1];
    if ((branches.length > 1 || (Array.isArray(last.from) && last.from.some(isSetOperationFromItem))) && !last.parentheses_symbol && hasTail(last)) {
        // Without parentheses, the last SELECT's tail belongs to the compound query.
        tail = { orderby: last.orderby, limit: last.limit };
        last.orderby = undefined;
        last.limit = undefined;
    }
    if (statement._orderby || hasLimit(statement._limit)) {
        tail = { orderby: statement._orderby, limit: statement._limit };
    }

    const operands: SetOperationTree[] = [];
    const flattenedOperators: string[] = [];
    branches.forEach((branch, index) => {
        if (index > 0) { flattenedOperators.push(operators[index - 1]); }
        const setItems = Array.isArray(branch.from) ? branch.from.filter(isSetOperationFromItem) : [];
        if (setItems.length === 0) { operands.push({ statement: branch }); return; }
        const leaf = { ...branch, from: branch.from.filter((item: any) => !isSetOperationFromItem(item)), orderby: undefined, limit: undefined };
        const nestedOperands: SetOperationTree[] = [
            { statement: leaf },
            ...setItems.map((item: any) => buildTree(item.expr.ast, dialect))
        ];
        const nestedOperators = setItems.map((item: any) => String(item.join).toUpperCase());
        if (branch.parentheses_symbol) {
            const nested = foldOperations(nestedOperands, nestedOperators, dialect);
            if ('operator' in nested && hasTail(branch)) {
                nested.tail = { orderby: branch.orderby, limit: branch.limit };
            }
            operands.push(nested);
        } else {
            // The parentheses enclose the right operand, not the operations
            // preceding it. Keep its operator at the surrounding precedence level.
            operands.push(...nestedOperands);
            flattenedOperators.push(...nestedOperators);
        }
    });
    const tree = foldOperations(operands, flattenedOperators, dialect);
    if ('operator' in tree && tail) { tree.tail = tail; }
    return tree;
}

/** Normalize the parser's compound-query encodings without mutating the AST used by lineage. */
export function getSetOperationTree(statement: any, dialect: SqlDialect): SetOperationTree | null {
    if (!statement?._next && !(Array.isArray(statement?.from) && statement.from.some(isSetOperationFromItem))) { return null; }
    return buildTree(statement, dialect);
}
