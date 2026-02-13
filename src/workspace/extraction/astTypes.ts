// AST Node Types - Practical interfaces for node-sql-parser AST nodes
// These describe the shapes actually used by extraction code, providing
// better type safety than `any` while accommodating the library's loose typing.
//
// Uses Record<string, unknown> base to allow property access patterns
// typical in AST traversal code (runtime type checking).

/**
 * Base for all AST nodes - allows dynamic property access.
 * Uses `any` values to stay compatible with node-sql-parser's untyped output,
 * while still documenting the expected shape of each node type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = Record<string, any>;

/**
 * A SQL SELECT statement AST node
 */
export type AstSelectStatement = AstNode & {
    type: 'select';
    columns: AstColumn[] | '*';
    from?: AstTableRef[];
    where?: AstExpression;
    groupby?: { columns: AstExpression[] | null };
    having?: AstExpression;
    orderby?: AstOrderByItem[];
    with?: AstCTE[];
};

/**
 * Any SQL statement AST node (SELECT, INSERT, UPDATE, DELETE, CREATE, etc.)
 * Uses optional `type` to allow partial/unknown statements.
 */
export type AstStatement = AstNode & {
    type?: string;
    columns?: AstColumn[] | string[] | '*' | null;
    from?: AstTableRef[] | null;
    where?: AstExpression | null;
    table?: AstTableRef | AstTableRef[] | string;
    set?: AstSetItem[];
    with?: AstCTE[];
    join?: AstTableRef[];
    groupby?: unknown;
    having?: unknown;
    orderby?: AstOrderByItem[];
    values?: unknown;
};

/**
 * A column in the SELECT clause
 */
export type AstColumn = AstNode & {
    expr: AstExpression;
    as: string | null;
    type?: string;
};

/**
 * Base expression node - all expression types extend this
 */
export type AstExpressionBase = AstNode & {
    type: string;
};

/**
 * Column reference expression (e.g., `t.column_name`)
 */
export type AstColumnRef = AstNode & {
    type: 'column_ref';
    table: string | null;
    column: string | { expr: { value: string } };
};

/**
 * Binary expression (e.g., `a + b`, `a = b`)
 */
export type AstBinaryExpr = AstNode & {
    type: 'binary_expr';
    operator: string;
    left: AstExpression;
    right: AstExpression;
};

/**
 * Unary expression (e.g., `-a`, `NOT a`)
 */
export type AstUnaryExpr = AstNode & {
    type: 'unary_expr';
    operator: string;
    expr: AstExpression;
};

/**
 * Function call expression (e.g., `UPPER(col)`)
 */
export type AstFunctionExpr = AstNode & {
    type: 'function';
    name: string;
    args?: { expr: AstExpression | AstExpression[] };
};

/**
 * Aggregate function expression (e.g., `SUM(col)`)
 */
export type AstAggrFuncExpr = AstNode & {
    type: 'aggr_func';
    name: string;
    args?: { expr: AstExpression | AstExpression[] };
    orderby?: AstOrderByItem | AstOrderByItem[];
};

/**
 * CASE expression
 */
export type AstCaseExpr = AstNode & {
    type: 'case';
    args?: AstCaseArg[];
    else?: AstExpression;
};

export interface AstCaseArg {
    cond?: AstExpression;
    result?: AstExpression;
    type: 'when' | 'else';
}

/**
 * CAST expression (e.g., `CAST(col AS INT)`)
 */
export type AstCastExpr = AstNode & {
    type: 'cast';
    expr: AstExpression;
    target?: unknown;
};

/**
 * Window function expression (e.g., `ROW_NUMBER() OVER (PARTITION BY ...)`)
 */
export type AstWindowFuncExpr = AstNode & {
    type: 'window_func';
    name?: string;
    args?: { expr: AstExpression | AstExpression[] };
    partitionby?: AstExpression | AstExpression[];
    orderby?: AstOrderByItem | AstOrderByItem[];
};

/**
 * Literal/value expression
 */
export type AstValueExpr = AstNode & {
    type: 'number' | 'string' | 'bool' | 'null' | 'single_quote_string' | 'double_quote_string';
    value: string | number | boolean | null;
};

/**
 * Subquery/select expression
 */
export type AstSubqueryExpr = AstNode & {
    type: 'select' | 'subquery';
};

/**
 * Union of all expression types
 */
export type AstExpression =
    | AstColumnRef
    | AstBinaryExpr
    | AstUnaryExpr
    | AstFunctionExpr
    | AstAggrFuncExpr
    | AstCaseExpr
    | AstCastExpr
    | AstWindowFuncExpr
    | AstValueExpr
    | AstSubqueryExpr
    | AstExpressionBase;

/**
 * Table reference in FROM clause
 */
export type AstTableRef = AstNode & {
    db?: string | null;
    table?: string | { table?: string; name?: string; value?: string; alias?: string };
    as?: string | { value?: string; name?: string; alias?: string } | null;
    schema?: string;
    join?: string;
    on?: AstExpression;
    using?: string[];
    expr?: AstNode & { ast?: AstStatement; type?: string };
};

/**
 * ORDER BY item
 */
export interface AstOrderByItem {
    expr: AstExpression;
    type?: 'ASC' | 'DESC';
}

/**
 * CTE (WITH clause) definition
 */
export type AstCTE = AstNode & {
    name: { value: string } | string;
    stmt?: { ast?: AstStatement } & AstNode;
    ast?: AstStatement;
    definition?: { ast?: AstStatement } & AstNode;
    columns?: Array<{ value: string } | string>;
};

/**
 * SET clause item (for UPDATE statements)
 */
export interface AstSetItem {
    column: string;
    value: AstExpression;
    table?: string | null;
}

/**
 * Table reference that may be a string or object (used in resolveTableName/getTableNameFromItem)
 */
export type AstTableIdentifier = string | AstNode & {
    alias?: string;
    table?: string | AstTableIdentifier;
    value?: string;
    name?: string;
};
