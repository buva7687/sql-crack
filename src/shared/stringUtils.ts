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
 * Truncate by Unicode code points so a surrogate pair is never split.
 * `maxLength` includes the suffix.
 */
export function truncateCodePoints(value: string, maxLength: number, suffix = '…'): string {
    const characters = Array.from(value);
    if (characters.length <= maxLength) {
        return value;
    }

    const suffixCharacters = Array.from(suffix).slice(0, Math.max(0, maxLength));
    const contentLength = Math.max(0, maxLength - suffixCharacters.length);
    return characters.slice(0, contentLength).join('') + suffixCharacters.join('');
}

/**
 * Serialize a value with JSON.stringify and escape the HTML-significant sequences
 * that could break out of an inline `<script>` context (closing the script tag,
 * HTML comments, or a CDATA end). Canonical home for what the panel and workspace
 * previously implemented twice.
 */
export function escapeForInlineScriptValue(value: unknown): string {
    return JSON.stringify(value)
        // Unicode escapes are valid in both JSON and JavaScript string literals.
        // Escaping angle brackets prevents script termination, HTML comments,
        // and CDATA terminators without producing invalid JSON escapes such as
        // \! or \> that break callers which store the serialized value.
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

/**
 * Return whether a hash at the supplied offset is being used as a SQL Server /
 * Redshift temporary-table identifier instead of a MySQL hash comment.
 *
 * A leading `#word` is ambiguous without a dialect.  Treat it as an identifier
 * only in table-name positions (or when used as a qualified name), so MySQL
 * comments such as `#CONNECT BY ...` are still removed while `FROM #temp` and
 * `CREATE TABLE ##temp` remain intact.
 */
/**
 * SQL dialects whose quoted strings treat `\` as an escape character. In the
 * others (PostgreSQL standard strings, SQL Server, Oracle, Teradata, ...)
 * `'\'` is a complete one-character literal.
 */
const BACKSLASH_ESCAPE_DIALECTS: ReadonlySet<string> = new Set([
    'MySQL', 'MariaDB', 'BigQuery', 'Snowflake', 'Hive', 'Redshift',
]);

/** Whether `\` escapes the next character inside quoted strings in `dialect`. */
export function dialectSupportsBackslashEscapes(dialect: string): boolean {
    return BACKSLASH_ESCAPE_DIALECTS.has(dialect);
}

/**
 * Whether a string opened at `quoteOffset` honours backslash escapes: always in
 * backslash-escape dialects, and for PostgreSQL-style `E'...'` strings.
 */
export function quotedStringAllowsBackslashEscapes(
    sql: string,
    quoteOffset: number,
    backslashEscapes: boolean
): boolean {
    return backslashEscapes || (sql[quoteOffset] === "'" && /[Ee]/.test(sql[quoteOffset - 1] || ''));
}

/** SQL dialects in which `#` starts a line comment. */
const HASH_COMMENT_DIALECTS: ReadonlySet<string> = new Set(['MySQL', 'MariaDB', 'BigQuery']);

/** Whether `#` starts a line comment in `dialect` (MySQL, MariaDB, BigQuery). */
export function dialectSupportsHashComments(dialect: string): boolean {
    return HASH_COMMENT_DIALECTS.has(dialect);
}

/**
 * PostgreSQL JSON path operators `#>` and `#>>` are never treated as `#` line
 * comments. Without this, dialect-agnostic comment masking swallows the rest of
 * a JSON path expression — including the statement's terminating `;`.
 */
export function isPostgresJsonPathOperatorAt(sql: string, offset: number): boolean {
    return sql[offset] === '#' && sql[offset + 1] === '>';
}

export function isHashTempTableIdentifierAt(sql: string, offset: number): boolean {
    // The scanner visits both characters in a global-temp `##name`; normalize
    // the second hash back to the start of the identifier.
    if (offset > 0 && sql[offset - 1] === '#') {
        offset--;
    }
    if (sql[offset] !== '#') {
        return false;
    }

    let nameStart = offset + 1;
    if (sql[nameStart] === '#') {
        nameStart++;
    }
    if (!/[A-Za-z_]/.test(sql[nameStart] || '')) {
        return false;
    }

    let nameEnd = nameStart + 1;
    while (nameEnd < sql.length && /[A-Za-z0-9_]/.test(sql[nameEnd])) {
        nameEnd++;
    }
    if (sql[nameEnd] === '.') {
        return true;
    }

    const before = sql.slice(Math.max(0, offset - 160), offset);
    return /(?:\b(?:FROM|JOIN|INTO|UPDATE|INSERT|USING|REFERENCES|TABLE|TRUNCATE)\s+|\bDROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+|\bCREATE\s+(?:(?:LOCAL|GLOBAL)\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+)$/i.test(before);
}

export interface StripSqlCommentsOptions {
    /** Set false for MySQL-family SQL, where $$ can be a statement delimiter. */
    dollarQuotes?: boolean;
    /** Set false where an inner block-comment opener is plain text. */
    nestedBlockComments?: boolean;
    /** Set false when the caller knows `#` always starts a MySQL-style comment. */
    preserveHashTempIdentifiers?: boolean;
    /**
     * Set false for dialects where `\` is an ordinary character inside quotes
     * (see `dialectSupportsBackslashEscapes`). Defaults to true.
     */
    backslashEscapes?: boolean;
    /**
     * Set false for dialects where `#` is an operator rather than a line
     * comment (see `dialectSupportsHashComments`). Defaults to true.
     */
    hashComments?: boolean;
}

const DOLLAR_QUOTE_DELIMITER_PATTERN = /^\$(?:[_\p{L}][_\p{L}\p{M}\p{N}]*)?\$/u;
const SQL_IDENTIFIER_CONTINUATION_PATTERN = /[_$\p{L}\p{M}\p{N}]/u;
const DELIMITER_DIRECTIVE_PATTERN = /^[ \t]*DELIMITER[ \t]+$/i;

function getPreviousCodePoint(sql: string, offset: number): string {
    if (offset <= 0) {
        return '';
    }

    const previousCodeUnit = sql.charCodeAt(offset - 1);
    const startsSurrogatePair = previousCodeUnit >= 0xDC00
        && previousCodeUnit <= 0xDFFF
        && offset > 1
        && sql.charCodeAt(offset - 2) >= 0xD800
        && sql.charCodeAt(offset - 2) <= 0xDBFF;
    return sql.slice(startsSurrogatePair ? offset - 2 : offset - 1, offset);
}

/**
 * Return the dollar-quote delimiter opening at `offset`, or null when the
 * dollar sign does not start a PostgreSQL dollar-quoted string.
 *
 * Two shapes look like a delimiter but are not one:
 *  - `$` is a legal identifier continuation character, so `my$$tbl` is a single
 *    name and `END$$` ends one. A `$` directly after an identifier character
 *    therefore belongs to that identifier, matching PostgreSQL's own lexer.
 *  - MySQL's `DELIMITER $$` declares a statement terminator rather than a
 *    string, so procedure dumps must keep scanning their body normally.
 *
 * Only openings are filtered. A closing delimiter is located by searching for
 * the same token, so `$$SELECT 1$$` still closes correctly.
 */
export function getDollarQuoteDelimiterAt(sql: string, offset: number): string | null {
    if (sql[offset] !== '$') {
        return null;
    }
    if (SQL_IDENTIFIER_CONTINUATION_PATTERN.test(getPreviousCodePoint(sql, offset))) {
        return null;
    }

    const delimiter = DOLLAR_QUOTE_DELIMITER_PATTERN.exec(sql.slice(offset))?.[0];
    if (!delimiter) {
        return null;
    }
    const lineStart = Math.max(
        sql.lastIndexOf('\n', offset - 1),
        sql.lastIndexOf('\r', offset - 1)
    ) + 1;
    if (DELIMITER_DIRECTIVE_PATTERN.test(sql.slice(lineStart, offset))) {
        return null;
    }

    return delimiter;
}

/** Return the exclusive end of a PostgreSQL dollar-quoted token at `offset`. */
export function getDollarQuotedTokenEnd(sql: string, offset: number): number | null {
    const delimiter = getDollarQuoteDelimiterAt(sql, offset);
    if (!delimiter) {
        return null;
    }

    const closingOffset = sql.indexOf(delimiter, offset + delimiter.length);
    return closingOffset === -1 ? sql.length : closingOffset + delimiter.length;
}

/**
 * Mask SQL comments with spaces while preserving every character position and
 * newline. Quoted strings and identifiers remain unchanged, so regex matches in
 * the returned text map directly back to the original SQL.
 */
export function maskSqlCommentsPreservingPositions(
    sql: string,
    options: StripSqlCommentsOptions = {}
): string {
    const len = sql.length;
    const masked = sql.split('');
    let i = 0;

    const maskRange = (start: number, end: number): void => {
        for (let position = start; position < end; position++) {
            if (masked[position] !== '\n' && masked[position] !== '\r') {
                masked[position] = ' ';
            }
        }
    };

    while (i < len) {
        const ch = sql[i];

        const dollarQuotedEnd = options.dollarQuotes === false ? null : getDollarQuotedTokenEnd(sql, i);
        if (dollarQuotedEnd !== null) {
            i = dollarQuotedEnd;
            continue;
        }

        if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
            const closingQuote = ch === '[' ? ']' : ch;
            const escapesAllowed = ch !== '['
                && quotedStringAllowsBackslashEscapes(sql, i, options.backslashEscapes !== false);
            i++;
            while (i < len) {
                if (escapesAllowed && sql[i] === '\\' && i + 1 < len) {
                    i += 2;
                    continue;
                }
                if (sql[i] === closingQuote) {
                    if (i + 1 < len && sql[i + 1] === closingQuote) {
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }

        if (ch === '/' && i + 1 < len && sql[i + 1] === '*') {
            const start = i;
            let depth = 1;
            i += 2;
            while (i < len && depth > 0) {
                if (options.nestedBlockComments !== false
                    && sql[i] === '/' && i + 1 < len && sql[i + 1] === '*') {
                    depth++;
                    i += 2;
                } else if (sql[i] === '*' && i + 1 < len && sql[i + 1] === '/') {
                    depth--;
                    i += 2;
                } else {
                    i++;
                }
            }
            maskRange(start, i);
            continue;
        }

        if (ch === '-' && i + 1 < len && sql[i + 1] === '-') {
            const start = i;
            while (i < len && sql[i] !== '\n' && sql[i] !== '\r') { i++; }
            maskRange(start, i);
            continue;
        }

        if (ch === '#' && options.hashComments !== false && !isPostgresJsonPathOperatorAt(sql, i)) {
            const preserveTempIdentifier = options.preserveHashTempIdentifiers !== false
                && isHashTempTableIdentifierAt(sql, i);
            if (!preserveTempIdentifier) {
                const start = i;
                while (i < len && sql[i] !== '\n' && sql[i] !== '\r') { i++; }
                maskRange(start, i);
                continue;
            }
        }

        i++;
    }

    return masked.join('');
}

/**
 * Strip SQL comments while preserving quoted content (strings and identifiers).
 * Handles single-quoted strings (with '' escape), double-quoted identifiers,
 * and backtick-quoted identifiers. Strips --, /* *​/, and # comments.
 * Supports nested block comments used by PostgreSQL.
 */
export function stripSqlComments(sql: string, options: StripSqlCommentsOptions = {}): string {
    const len = sql.length;
    let out = '';
    let i = 0;

    while (i < len) {
        const ch = sql[i];

        // PostgreSQL dollar-quoted string: pass through verbatim. Comment-like
        // text inside the token is literal content, not SQL comments.
        const dollarQuotedEnd = options.dollarQuotes === false ? null : getDollarQuotedTokenEnd(sql, i);
        if (dollarQuotedEnd !== null) {
            out += sql.slice(i, dollarQuotedEnd);
            i = dollarQuotedEnd;
            continue;
        }

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

        // Block comment: /* ... */ (supports nesting)
        if (ch === '/' && i + 1 < len && sql[i + 1] === '*') {
            let depth = 1;
            i += 2;
            out += ' ';
            while (i < len && depth > 0) {
                if (options.nestedBlockComments !== false
                    && sql[i] === '/' && i + 1 < len && sql[i + 1] === '*') {
                    depth++;
                    i += 2;
                    continue;
                }
                if (sql[i] === '*' && i + 1 < len && sql[i + 1] === '/') {
                    depth--;
                    i += 2;
                    continue;
                }
                i++;
            }
            continue;
        }

        // Line comment: --
        if (ch === '-' && i + 1 < len && sql[i + 1] === '-') {
            while (i < len && sql[i] !== '\n' && sql[i] !== '\r') { i++; }
            out += ' ';
            continue;
        }

        // Hash line comment: # (but not a contextual #identifier/##identifier
        // temp table, or a PostgreSQL #> / #>> JSON path operator)
        if (ch === '#' && options.hashComments !== false && !isPostgresJsonPathOperatorAt(sql, i)) {
            const preserveTempIdentifier = options.preserveHashTempIdentifiers !== false
                && isHashTempTableIdentifierAt(sql, i);
            if (!preserveTempIdentifier) {
                while (i < len && sql[i] !== '\n' && sql[i] !== '\r') { i++; }
                out += ' ';
                continue;
            }
        }

        out += ch;
        i++;
    }

    return out;
}
