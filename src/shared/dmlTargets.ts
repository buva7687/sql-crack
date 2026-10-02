/**
 * Write-target selection for multi-table UPDATE statements.
 *
 * node-sql-parser reports MySQL/MariaDB `UPDATE a JOIN b ON ... SET ...` and
 * the comma form `UPDATE a, b SET ...` with every table in `stmt.table`; joined
 * entries carry a `join` property. Only the tables named by `SET` qualifiers
 * are written — the rest are read sources.
 */

export interface UpdateTableEntry {
    table?: unknown;
    as?: unknown;
    join?: unknown;
}

function lowerString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function getSetQualifiers(setClauses: unknown): { qualifiers: Set<string>; hasUnqualified: boolean } {
    const qualifiers = new Set<string>();
    let hasUnqualified = false;
    if (!Array.isArray(setClauses)) {
        return { qualifiers, hasUnqualified };
    }
    for (const clause of setClauses) {
        const qualifier = lowerString((clause as { table?: unknown } | null)?.table);
        if (qualifier) {
            qualifiers.add(qualifier);
        } else {
            hasUnqualified = true;
        }
    }
    return { qualifiers, hasUnqualified };
}

/**
 * Pick the written tables of an UPDATE whose `stmt.table` lists more than one
 * table. Tables whose alias or name qualifies a `SET` column are written. An
 * unqualified `SET col = ...` resolves to whichever table owns the column,
 * which cannot be known without a schema, so it keeps the primary (non-joined)
 * tables as targets rather than silently dropping that write.
 */
export function selectMultiTableUpdateTargets<T extends UpdateTableEntry>(
    tables: readonly T[],
    setClauses: unknown,
    getTableName: (entry: T) => string | null | undefined
): T[] {
    if (tables.length <= 1) {
        return [...tables];
    }

    const unjoined = tables.filter(entry => !entry.join);
    const primaryTargets = unjoined.length > 0 ? unjoined : [tables[0]];
    const { qualifiers, hasUnqualified } = getSetQualifiers(setClauses);
    const qualified = tables.filter(entry => {
        const alias = lowerString(entry.as);
        const name = lowerString(getTableName(entry));
        return (alias !== null && qualifiers.has(alias)) || (name !== null && qualifiers.has(name));
    });

    if (qualified.length === 0) {
        return primaryTargets;
    }
    if (!hasUnqualified) {
        return qualified;
    }
    // Keep source order so callers render targets deterministically.
    return tables.filter(entry => qualified.includes(entry) || primaryTargets.includes(entry));
}
