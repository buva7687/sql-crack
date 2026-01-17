/**
 * SQL Formatter - Simple SQL formatting utility
 * Formats SQL with proper indentation, capitalized keywords, and line breaks
 */

const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL',
    'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL',
    'AS', 'DISTINCT', 'ALL', 'UNION', 'INTERSECT', 'EXCEPT', 'ORDER', 'BY',
    'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'ASC', 'DESC', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'CAST', 'CONVERT', 'COALESCE', 'NULLIF', 'WITH', 'RECURSIVE',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
    'ALTER', 'DROP', 'INDEX', 'VIEW', 'OVER', 'PARTITION', 'ROW', 'ROWS',
    'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'CROSS', 'NATURAL'
];

const MAJOR_CLAUSES = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
    'INNER JOIN', 'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'GROUP BY', 'HAVING',
    'ORDER BY', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT', 'WITH', 'INSERT', 'UPDATE',
    'DELETE', 'SET', 'VALUES'];

export interface FormatOptions {
    indent: string;
    uppercase: boolean;
    lineWidth: number;
}

const DEFAULT_OPTIONS: FormatOptions = {
    indent: '    ',
    uppercase: true,
    lineWidth: 80
};

/**
 * Format SQL query with proper indentation and keyword capitalization
 */
export function formatSql(sql: string, options: Partial<FormatOptions> = {}): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (!sql || !sql.trim()) {
        return sql;
    }

    // Extract comments and replace with placeholders to preserve them
    const { sqlWithoutComments, comments } = extractComments(sql);

    // Normalize whitespace (only on non-comment parts)
    let formatted = sqlWithoutComments.replace(/\s+/g, ' ').trim();

    // Uppercase keywords if enabled
    if (opts.uppercase) {
        formatted = uppercaseKeywords(formatted);
    }

    // Add line breaks before major clauses
    formatted = addLineBreaks(formatted, opts.indent);

    // Format comma-separated lists
    formatted = formatLists(formatted, opts.indent);

    // Restore comments
    formatted = restoreComments(formatted, comments);

    // Clean up extra whitespace
    formatted = formatted
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');

    return formatted;
}

/**
 * Extract comments from SQL and replace with placeholders
 */
function extractComments(sql: string): { sqlWithoutComments: string; comments: Map<string, string> } {
    const comments = new Map<string, string>();
    let result = sql;
    let commentIndex = 0;

    // Extract -- style comments
    result = result.replace(/--[^\n]*/g, (match) => {
        const placeholder = `__COMMENT_${commentIndex++}__`;
        comments.set(placeholder, match);
        return placeholder;
    });

    // Extract /* */ style comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, (match) => {
        const placeholder = `__COMMENT_${commentIndex++}__`;
        comments.set(placeholder, match);
        return placeholder;
    });

    return { sqlWithoutComments: result, comments };
}

/**
 * Restore comments from placeholders
 */
function restoreComments(sql: string, comments: Map<string, string>): string {
    let result = sql;
    for (const [placeholder, comment] of comments) {
        result = result.replace(placeholder, comment);
    }
    return result;
}

/**
 * Uppercase SQL keywords while preserving string literals
 */
function uppercaseKeywords(sql: string): string {
    // Split by string literals to avoid modifying them
    const parts: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const prevChar = i > 0 ? sql[i - 1] : '';

        if ((char === "'" || char === '"') && prevChar !== '\\') {
            if (!inString) {
                // Save non-string part and uppercase it
                if (current) {
                    parts.push(uppercaseNonString(current));
                }
                current = char;
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                current += char;
                parts.push(current);
                current = '';
                inString = false;
            } else {
                current += char;
            }
        } else {
            current += char;
        }
    }

    if (current) {
        parts.push(inString ? current : uppercaseNonString(current));
    }

    return parts.join('');
}

function uppercaseNonString(text: string): string {
    // Create regex pattern for keywords with word boundaries
    const pattern = new RegExp(
        '\\b(' + SQL_KEYWORDS.join('|') + ')\\b',
        'gi'
    );
    return text.replace(pattern, match => match.toUpperCase());
}

/**
 * Add line breaks before major clauses
 */
function addLineBreaks(sql: string, indent: string): string {
    let result = sql;

    // Add line break before major clauses
    for (const clause of MAJOR_CLAUSES) {
        const pattern = new RegExp(`\\s+${clause.replace(' ', '\\s+')}\\b`, 'gi');
        result = result.replace(pattern, match => '\n' + match.trim());
    }

    // Handle CTEs - format WITH clause
    result = result.replace(/\bWITH\s+(\w+)\s+AS\s*\(/gi, 'WITH $1 AS (\n' + indent);

    // Add line break after opening parenthesis in subqueries
    result = result.replace(/\(\s*(SELECT)\b/gi, '(\n' + indent + '$1');

    // Handle closing parenthesis for subqueries
    result = result.replace(/\)\s*(SELECT|FROM|WHERE|JOIN|ORDER|GROUP|HAVING)/gi, ')\n$1');

    // Indent JOIN conditions
    result = result.replace(/\bON\s+/gi, '\n' + indent + 'ON ');

    // Handle AND/OR in WHERE clauses (indent continuation)
    result = result.replace(/\s+(AND|OR)\s+/gi, '\n' + indent + '$1 ');

    return result;
}

/**
 * Format comma-separated column lists
 */
function formatLists(sql: string, indent: string): string {
    const lines = sql.split('\n');
    const formatted: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Check if this is a SELECT line with multiple columns
        if (trimmed.toUpperCase().startsWith('SELECT') && trimmed.includes(',')) {
            const selectMatch = trimmed.match(/^SELECT\s+(DISTINCT\s+)?(.+)$/i);
            if (selectMatch) {
                const distinct = selectMatch[1] || '';
                const columns = selectMatch[2];

                // Split by comma but respect parentheses
                const cols = splitByComma(columns);

                if (cols.length > 2) {
                    formatted.push('SELECT ' + distinct.trim());
                    cols.forEach((col, idx) => {
                        const suffix = idx < cols.length - 1 ? ',' : '';
                        formatted.push(indent + col.trim() + suffix);
                    });
                    continue;
                }
            }
        }

        formatted.push(line);
    }

    return formatted.join('\n');
}

/**
 * Split by comma while respecting parentheses depth
 */
function splitByComma(text: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : '';

        // Handle strings
        if ((char === "'" || char === '"') && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }

        if (!inString) {
            if (char === '(') depth++;
            if (char === ')') depth--;

            if (char === ',' && depth === 0) {
                parts.push(current.trim());
                current = '';
                continue;
            }
        }

        current += char;
    }

    if (current.trim()) {
        parts.push(current.trim());
    }

    return parts;
}

/**
 * Generate syntax-highlighted HTML for SQL
 * Uses a token-based approach to avoid HTML escaping issues
 */
export function highlightSql(sql: string): string {
    if (!sql) return '';

    const tokens: Array<{ type: string; value: string }> = [];
    let i = 0;

    while (i < sql.length) {
        // Comments (-- style)
        if (sql[i] === '-' && sql[i + 1] === '-') {
            let comment = '';
            while (i < sql.length && sql[i] !== '\n') {
                comment += sql[i++];
            }
            tokens.push({ type: 'comment', value: comment });
            continue;
        }

        // String literals
        if (sql[i] === "'" || sql[i] === '"') {
            const quote = sql[i];
            let str = sql[i++];
            while (i < sql.length && sql[i] !== quote) {
                if (sql[i] === '\\' && i + 1 < sql.length) {
                    str += sql[i++];
                }
                str += sql[i++];
            }
            if (i < sql.length) str += sql[i++];
            tokens.push({ type: 'string', value: str });
            continue;
        }

        // Numbers
        if (/\d/.test(sql[i])) {
            let num = '';
            while (i < sql.length && /[\d.]/.test(sql[i])) {
                num += sql[i++];
            }
            tokens.push({ type: 'number', value: num });
            continue;
        }

        // Words (keywords, identifiers, functions)
        if (/[a-zA-Z_]/.test(sql[i])) {
            let word = '';
            while (i < sql.length && /[a-zA-Z0-9_]/.test(sql[i])) {
                word += sql[i++];
            }

            // Check if it's followed by ( - it's a function
            let j = i;
            while (j < sql.length && /\s/.test(sql[j])) j++;

            if (sql[j] === '(') {
                tokens.push({ type: 'function', value: word });
            } else if (SQL_KEYWORDS.includes(word.toUpperCase())) {
                tokens.push({ type: 'keyword', value: word });
            } else {
                tokens.push({ type: 'identifier', value: word });
            }
            continue;
        }

        // Whitespace
        if (/\s/.test(sql[i])) {
            let ws = '';
            while (i < sql.length && /\s/.test(sql[i])) {
                ws += sql[i++];
            }
            tokens.push({ type: 'whitespace', value: ws });
            continue;
        }

        // Other characters (operators, punctuation)
        tokens.push({ type: 'other', value: sql[i++] });
    }

    // Convert tokens to HTML
    return tokens.map(token => {
        const escaped = escapeHtmlSimple(token.value);
        switch (token.type) {
            case 'keyword':
                return `<span style="color: #c792ea; font-weight: 600;">${escaped}</span>`;
            case 'function':
                return `<span style="color: #82aaff;">${escaped}</span>`;
            case 'string':
                return `<span style="color: #c3e88d;">${escaped}</span>`;
            case 'number':
                return `<span style="color: #f78c6c;">${escaped}</span>`;
            case 'comment':
                return `<span style="color: #546e7a; font-style: italic;">${escaped}</span>`;
            default:
                return escaped;
        }
    }).join('');
}

function escapeHtmlSimple(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}


