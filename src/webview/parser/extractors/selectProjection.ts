import type { SqlDialect } from '../../types';
import { getAstString } from './columns';
import { getCteNameKey, getNormalizedFromAlias, getTableName } from './tables';

export function getCteStatementAst(cte: any): any {
    return cte?.stmt?.ast || cte?.stmt || cte?.ast || cte?.expr?.ast || cte?.definition?.ast || cte?.definition || null;
}

export function getCteReferenceKey(
    item: any,
    names: ReadonlySet<string> | ReadonlyMap<string, unknown>,
    dialect: SqlDialect,
): string | undefined {
    // A qualified relation can never name a CTE.
    if (!names.size || !item?.table || item.db || item.schema || item.catalog) { return undefined; }
    const table = getTableName(item);
    const key = getCteNameKey(item.table, dialect);
    // Some dialect ASTs unwrap quoted FROM identifiers to plain strings.
    // Prefer the spelling of a matching declared identifier before folding.
    if (names.has(table)) { return table; }
    if (names.has(key)) { return key; }
    return undefined;
}

/**
 * SQL Server and Oracle have no RECURSIVE keyword. Snowflake and SQLite make it
 * optional: a compound body that names its own CTE is recursive, while a plain
 * body with the same name still reads the physical relation.
 */
export function allowsImplicitCteSelfReference(body: any, dialect: SqlDialect): boolean {
    if (dialect === 'TransactSQL' || dialect === 'Oracle') { return true; }
    return (dialect === 'Snowflake' || dialect === 'SQLite') && Boolean(body?._next || body?.set_op);
}

export function declaresRecursiveCte(cte: any): boolean {
    return cte?.recursive === true || cte?.prefix?.toLowerCase() === 'recursive';
}

type CteColumns = ReadonlyMap<string, readonly string[]>;

function projectionName(column: any): string | null {
    return getAstString(column?.as) || (column?.expr?.type === 'column_ref' ? getAstString(column.expr.column) : null);
}

export function isWildcardProjection(column: any): boolean {
    return column === '*' || (column?.expr?.type === 'column_ref' && getAstString(column.expr.column) === '*');
}

/** Expand only stars whose relation shapes are known from CTE definitions. */
export function getSelectProjection(stmt: any, shapes: CteColumns, dialect: SqlDialect): any[] {
    const columns = stmt?.columns === '*' ? ['*'] : stmt?.columns;
    if (!Array.isArray(columns)) { return []; }
    if (!columns.some(isWildcardProjection) || !Array.isArray(stmt.from)) { return columns; }
    const bindings = stmt.from.map((item: any) => ({
        qualifier: getNormalizedFromAlias(item) || getTableName(item),
        key: getCteReferenceKey(item, shapes, dialect),
        using: item.using || /\bNATURAL\b/i.test(item.join || ''),
    }));
    return columns.flatMap(column => {
        if (!isWildcardProjection(column)) { return [column]; }
        const qualifier = getAstString(column?.expr?.table);
        const selected = qualifier
            ? bindings.filter((binding: { qualifier: string }) => binding.qualifier === qualifier)
            : bindings;
        if (selected.length === 0 || (qualifier && selected.length !== 1)) { return [column]; }
        if (selected.some((binding: { key?: string; using?: unknown }) => !binding.key || (!qualifier && binding.using))) {
            return [column];
        }
        return selected.flatMap((binding: { qualifier: string; key: string }) =>
            shapes.get(binding.key)!.map(name => ({
                expr: { type: 'column_ref', table: binding.qualifier, column: name },
            }))
        );
    });
}

export function collectCteColumnShapes(stmt: any, dialect: SqlDialect, inherited?: CteColumns): CteColumns {
    if (!Array.isArray(stmt?.with)) { return inherited ?? new Map(); }

    const shapes = new Map(inherited);
    for (const cte of stmt.with) {
        const key = getCteNameKey(cte.name, dialect);
        const body = getCteStatementAst(cte);
        const projection = getSelectProjection(body, shapes, dialect);
        const aliases = Array.isArray(cte.columns) ? cte.columns.map((col: any) => getAstString(col)) : [];
        const names = projection.map((column, index) => aliases[index] || projectionName(column));
        if (names.length > 0 && !projection.some(isWildcardProjection) && names.every((name): name is string => Boolean(name))) {
            shapes.set(key, names);
        } else {
            shapes.delete(key);
        }
    }
    return shapes;
}
