import type { SqlDialect } from '../../types';
import { getAstString } from './columns';
import { getCteNameKey, getNormalizedFromAlias, getTableName } from './tables';
import { getAstIdentifier, getProjectionIdentifier, getRelationIdentifiers, getSetOperationTree, getSqlIdentifierKey, getStarQualifier } from '../../../shared';
import type { SqlIdentifier } from '../../../shared';

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
    const source = getRelationIdentifiers(item)?.table;
    const identifier = source ?? getAstIdentifier(item.table);
    const key = identifier ? getSqlIdentifierKey({ ...identifier, quoted: identifier.quoted || Boolean(item.surround?.table) }, dialect) : getCteNameKey(item.table, dialect);
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
    return (dialect === 'Snowflake' || dialect === 'SQLite')
        && Boolean(body?._next || body?.set_op || getSetOperationTree(body, dialect));
}

export function declaresRecursiveCte(cte: any): boolean {
    return cte?.recursive === true || cte?.prefix?.toLowerCase() === 'recursive';
}

type CteColumns = ReadonlyMap<string, readonly SqlIdentifier[]>;

function astColumnIdentifier(node: any): SqlIdentifier | null {
    if (!node) { return null; }
    const annotated = typeof node === 'object' ? getProjectionIdentifier(node) : undefined;
    if (annotated) { return annotated; }
    const target = node.type === 'column_ref' ? node.column : node;
    const identifier = getAstIdentifier(target);
    if (identifier) { return identifier; }
    const fallback = getAstString(node);
    return fallback ? { value: fallback, quoted: false } : null;
}

function projectionIdentifier(column: any, dialect: SqlDialect): SqlIdentifier | null {
    const annotated = column && typeof column === 'object' ? getProjectionIdentifier(column) : undefined;
    if (column?.as) {
        return annotated ?? getAstIdentifier(column.as) ?? null;
    }
    if (column?.expr?.type === 'column_ref') {
        return annotated ?? getAstIdentifier(column.expr.column) ?? null;
    }
    if (column?.expr?.type === 'double_quote_string' && dialect !== 'MySQL' && dialect !== 'MariaDB') {
        return annotated ?? getAstIdentifier(column.expr) ?? null;
    }
    return null;
}

export function isWildcardProjection(column: any): boolean {
    return column === '*' || (column?.expr?.type === 'column_ref' && getAstString(column.expr.column) === '*');
}

/**
 * Extract excluded column keys for `* EXCEPT (...)` / `* EXCLUDE (...)`.
 * Returns `undefined` for an unmodified star, a Set of keys for a recognized
 * exclusion modifier, or `null` when an unsupported star modifier (e.g.
 * `* REPLACE (...)` or unresolvable exclusion entries) prevents safe expansion.
 */
function getExcludedStarColumnKeys(column: any, dialect: SqlDialect): Set<string> | null | undefined {
    if (!column || typeof column !== 'object') { return undefined; }

    const columnType = typeof column.type === 'string' ? column.type.toLowerCase() : '';
    const suffix = column.expr?.suffix;
    const hasModifier = Boolean(suffix) || Boolean(column.expr_list)
        || (columnType !== '' && columnType !== 'expr');
    if (!hasModifier) { return undefined; }

    let rawItems: any[] | null = null;
    if (columnType === 'except' && Array.isArray(column.expr_list)) {
        rawItems = column.expr_list;
    } else if (suffix && !column.expr_list) {
        const suffixName = getAstString(suffix.name?.name?.[0] ?? suffix.name)?.toLowerCase();
        if (suffixName === 'exclude' && Array.isArray(suffix.args?.value)) {
            rawItems = suffix.args.value;
        }
    }
    if (!rawItems || rawItems.length === 0) { return null; }

    const excluded = new Set<string>();
    for (const item of rawItems) {
        const target = item?.expr?.type === 'column_ref'
            ? item.expr.column
            : item?.type === 'column_ref'
                ? item.column
                : item?.expr ?? item;
        const identifier = getAstIdentifier(target);
        if (!identifier) { return null; }
        excluded.add(getSqlIdentifierKey(identifier, dialect));
    }
    return excluded;
}

/** Expand only stars whose relation shapes are known from CTE definitions. */
export function getSelectProjection(stmt: any, shapes: CteColumns, dialect: SqlDialect): any[] {
    const columns = stmt?.columns === '*' ? ['*'] : stmt?.columns;
    if (!Array.isArray(columns)) { return []; }
    if (!columns.some(isWildcardProjection) || !Array.isArray(stmt.from)) { return columns; }
    const bindings = stmt.from.map((item: any) => ({
        qualifier: getNormalizedFromAlias(item) || getTableName(item),
        qualifierIdentity: getRelationIdentifiers(item)?.alias ?? getRelationIdentifiers(item)?.table
            ?? getAstIdentifier(item.as || item.table),
        key: getCteReferenceKey(item, shapes, dialect),
        using: item.using || /\bNATURAL\b/i.test(item.join || ''),
    }));
    return columns.flatMap(column => {
        if (!isWildcardProjection(column)) { return [column]; }
        const excludedKeys = getExcludedStarColumnKeys(column, dialect);
        if (excludedKeys === null) { return [column]; }
        const qualifier = getAstString(column?.expr?.table);
        const qualifierIdentity = (column?.expr ? getStarQualifier(column.expr) : undefined) ?? getAstIdentifier(column?.expr?.table);
        const selected = qualifier
            ? bindings.filter((binding: { qualifierIdentity?: { value: string; quoted: boolean } }) => binding.qualifierIdentity && qualifierIdentity
                && getSqlIdentifierKey(binding.qualifierIdentity, dialect) === getSqlIdentifierKey(qualifierIdentity, dialect))
            : bindings;
        if (selected.length === 0 || (qualifier && selected.length !== 1)) { return [column]; }
        if (selected.some((binding: { key?: string; using?: unknown }) => !binding.key || (!qualifier && binding.using))) {
            return [column];
        }
        const expanded = selected.flatMap((binding: { qualifier: string; key: string; qualifierIdentity?: { quoted: boolean } }) =>
            shapes.get(binding.key)!
                .filter(col => !excludedKeys?.has(getSqlIdentifierKey(col, dialect)))
                .map(col => ({
                    expr: {
                        type: 'column_ref',
                        table: binding.qualifierIdentity?.quoted
                            ? { type: 'double_quote_string', value: binding.qualifier } : binding.qualifier,
                        column: col.quoted
                            ? { type: 'double_quote_string', value: col.value } : col.value,
                    },
                }))
        );
        return expanded.length > 0 ? expanded : [column];
    });
}

export function collectCteColumnShapes(stmt: any, dialect: SqlDialect, inherited?: CteColumns): CteColumns {
    if (!Array.isArray(stmt?.with)) { return inherited ?? new Map(); }

    const shapes = new Map(inherited);
    for (const cte of stmt.with) {
        const key = getCteNameKey(cte.name, dialect);
        const body = getCteStatementAst(cte);
        const projection = getSelectProjection(body, shapes, dialect);
        const aliases = Array.isArray(cte.columns) ? cte.columns.map((col: any) => astColumnIdentifier(col)) : [];
        const names = projection.map((column, index) => aliases[index] || projectionIdentifier(column, dialect));
        if (names.length > 0 && !projection.some(isWildcardProjection) && names.every((name): name is SqlIdentifier => Boolean(name))) {
            shapes.set(key, names);
        } else {
            shapes.delete(key);
        }
    }
    return shapes;
}
