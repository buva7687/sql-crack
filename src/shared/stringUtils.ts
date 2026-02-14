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
