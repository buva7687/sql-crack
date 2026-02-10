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
    if (value == null) { return ''; }
    if (typeof value === 'object') {
        const v = value as Record<string, unknown>;
        if (typeof v.value === 'string') { return v.value; }
        if (typeof v.name === 'string') { return v.name; }
        if (typeof v.column === 'string') { return v.column; }
    }
    return String(value);
}
