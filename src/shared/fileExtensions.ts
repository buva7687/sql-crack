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
 * - contain only [a-z0-9_-]; anything else (wildcards, slashes, dots, spaces…)
 *   is stripped or, if the remainder is invalid, the entry is dropped.
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
            // Strip any leading glob/wildcard/dot prefix such as `*.`, `**/*.`, `.`.
            const cleaned = part.toLowerCase().trim().replace(/^.*[*/.]/, '');

            // A valid extension is filename-safe characters only. Reject anything
            // that still contains glob/path characters after stripping.
            if (!cleaned || !/^[a-z0-9_-]+$/.test(cleaned)) {
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
