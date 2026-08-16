/**
 * Keep exported metadata on one Markdown line. SQL identifiers and workspace
 * paths can legally contain line breaks, but allowing them through verbatim
 * would let repository content add headings or list entries to an export.
 */
function normalizeMarkdownLine(value: unknown): string {
    return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ');
}

/**
 * Escape syntax that can create inline formatting, links, raw HTML, or code.
 * Characters that are harmless in an already-started list item (for example
 * dots and dashes in file paths) are intentionally preserved for readability.
 */
export function escapeMarkdownText(value: unknown): string {
    const escaped = normalizeMarkdownLine(value)
        .replace(/\\/g, '\\\\')
        .replace(/([`*\[\]<>|])/g, '\\$1');

    // CommonMark does not treat underscores inside words as emphasis. Keeping
    // those intact preserves familiar SQL names and paths such as user_id.
    return escaped.replace(/_/g, (match, offset, source: string) => {
        const previous = source[offset - 1] || '';
        const next = source[offset + 1] || '';
        return /[A-Za-z0-9]/.test(previous) && /[A-Za-z0-9]/.test(next)
            ? match
            : '\\_';
    });
}

/**
 * Format arbitrary text as a CommonMark code span. The delimiter is always
 * longer than any backtick run in the value, so identifiers cannot close it.
 */
export function markdownCodeSpan(value: unknown): string {
    const text = normalizeMarkdownLine(value);
    const backtickRuns = text.match(/`+/g) || [];
    const delimiterLength = Math.max(1, ...backtickRuns.map(run => run.length + 1));
    const delimiter = '`'.repeat(delimiterLength);
    const needsPadding = text.startsWith('`') || text.endsWith('`');
    return needsPadding
        ? `${delimiter} ${text} ${delimiter}`
        : `${delimiter}${text}${delimiter}`;
}
