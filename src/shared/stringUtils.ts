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
