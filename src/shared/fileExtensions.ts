/**
 * Validate and normalize the `sqlCrack.additionalFileExtensions` setting into a
 * list of bare, lowercase file extensions (no leading dot, no glob/path syntax).
 *
 * Users may type values like "hql", ".hql", a leading-glob form like star-dot-hql,
 * a recursive-glob form, or even a comma/space separated "hql, ddl". Earlier call
 * sites only stripped a leading dot, so glob/path forms leaked through and
 * produced malformed watcher globs and selectors that never matched. This
 * centralizes the cleanup so every consumer treats the setting as extensions,
 * not globs.
 *
 * Returned extensions:
 * - are lowercase and de-duplicated,
 * - exclude "sql" (always handled separately by callers),
 * - preserve compound extensions such as "sql.j2",
 * - contain dot-separated [a-z0-9_-] segments; remaining wildcard/path syntax
 *   causes the entry to be dropped.
 */
export function normalizeFileExtensions(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    const seen = new Set<string>();
    const result: string[] = [];

    for (const entry of raw) {
        if (typeof entry !== 'string') {
            continue;
        }

        // Allow a single value to carry several comma/space separated extensions.
        for (const part of entry.split(/[\s,]+/)) {
            // Strip path and leading glob syntax, but preserve dots that are part
            // of a compound extension (`sql.j2`). For example:
            // `src/**/*.sql.j2` -> `sql.j2`, `.hql` -> `hql`.
            const basename = part.toLowerCase().trim().split(/[\\/]/).pop() || '';
            const cleaned = basename.replace(/^(?:\*\.)+/, '').replace(/^\.+/, '');

            // A valid extension is one or more filename-safe segments. Reject
            // anything that still contains glob/path syntax after cleanup.
            if (!cleaned || !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(cleaned)) {
                continue;
            }

            // `sql` is always included by callers; avoid duplicating it.
            if (cleaned === 'sql' || seen.has(cleaned)) {
                continue;
            }

            seen.add(cleaned);
            result.push(cleaned);
        }
    }

    return result;
}
