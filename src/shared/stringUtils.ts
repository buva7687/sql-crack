// String utility functions

/**
 * Escape special regex characters in a string.
 * Use this when building dynamic RegExp patterns from user input or identifiers.
 *
 * @example
 * const pattern = new RegExp(`\\b${escapeRegex(tableName)}\\b`, 'i');
 */
export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Safely coerce a value to a string. Handles AST objects returned by
 * node-sql-parser where a column name may be an object instead of a string.
 */
export function safeString(value: unknown): string {
    if (typeof value === 'string') { return value; }
    // eslint-disable-next-line eqeqeq -- intentional: catches both null and undefined
    if (value == null) { return ''; }
    if (typeof value === 'object') {
        const v = value as Record<string, unknown>;
        if (typeof v.value === 'string') { return v.value; }
        if (typeof v.name === 'string') { return v.name; }
        if (typeof v.column === 'string') { return v.column; }
    }
    return String(value);
}

/**
 * Escape HTML-sensitive characters for safe insertion into text/attribute markup.
 */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Strip SQL comments while preserving quoted content (strings and identifiers).
 * Handles single-quoted strings (with '' escape), double-quoted identifiers,
 * and backtick-quoted identifiers. Strips --, /* *​/, and # comments.
 */
export function stripSqlComments(sql: string): string {
    const len = sql.length;
    let out = '';
    let i = 0;

    while (i < len) {
        const ch = sql[i];

        // Single-quoted string: pass through verbatim ('' escape)
        if (ch === "'") {
            let j = i + 1;
            out += ch;
            while (j < len) {
                if (sql[j] === "'" && j + 1 < len && sql[j + 1] === "'") {
                    out += "''";
                    j += 2;
                } else if (sql[j] === "'") {
                    out += "'";
                    j++;
                    break;
                } else {
                    out += sql[j];
                    j++;
                }
            }
            i = j;
            continue;
        }

        // Double-quoted identifier: pass through verbatim
        if (ch === '"') {
            let j = i + 1;
            out += ch;
            while (j < len) {
                if (sql[j] === '"') {
                    out += '"';
                    j++;
                    break;
                } else {
                    out += sql[j];
                    j++;
                }
            }
            i = j;
            continue;
        }

        // Backtick-quoted identifier: pass through verbatim
        if (ch === '`') {
            let j = i + 1;
            out += ch;
            while (j < len) {
                if (sql[j] === '`') {
                    out += '`';
                    j++;
                    break;
                } else {
                    out += sql[j];
                    j++;
                }
            }
            i = j;
            continue;
        }

        // Block comment: /* ... */
        if (ch === '/' && i + 1 < len && sql[i + 1] === '*') {
            const end = sql.indexOf('*/', i + 2);
            i = end === -1 ? len : end + 2;
            out += ' ';
            continue;
        }

        // Line comment: --
        if (ch === '-' && i + 1 < len && sql[i + 1] === '-') {
            while (i < len && sql[i] !== '\n' && sql[i] !== '\r') { i++; }
            out += ' ';
            continue;
        }

        // Hash line comment: #
        if (ch === '#') {
            while (i < len && sql[i] !== '\n' && sql[i] !== '\r') { i++; }
            out += ' ';
            continue;
        }

        out += ch;
        i++;
    }

    return out;
}
