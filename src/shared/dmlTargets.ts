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

function getSetQualifiers(setClauses: unknown): Set<string> {
    const qualifiers = new Set<string>();
    if (!Array.isArray(setClauses)) {
        return qualifiers;
    }
    for (const clause of setClauses) {
        const qualifier = lowerString((clause as { table?: unknown } | null)?.table);
        if (qualifier) {
            qualifiers.add(qualifier);
        }
    }
    return qualifiers;
}

/**
 * Pick the written tables of an UPDATE whose `stmt.table` lists more than one
 * table. Prefers tables whose alias or name is used as a `SET` qualifier, then
 * falls back to the non-joined tables; with a single entry it is the target.
 */
export function selectMultiTableUpdateTargets<T extends UpdateTableEntry>(
    tables: readonly T[],
    setClauses: unknown,
    getTableName: (entry: T) => string | null | undefined
): T[] {
    if (tables.length <= 1) {
        return [...tables];
    }

    const qualifiers = getSetQualifiers(setClauses);
    if (qualifiers.size > 0) {
        const qualified = tables.filter(entry => {
            const alias = lowerString(entry.as);
            const name = lowerString(getTableName(entry));
            return (alias !== null && qualifiers.has(alias)) || (name !== null && qualifiers.has(name));
        });
        if (qualified.length > 0) {
            return qualified;
        }
    }

    const unjoined = tables.filter(entry => !entry.join);
    return unjoined.length > 0 ? unjoined : [tables[0]];
}
