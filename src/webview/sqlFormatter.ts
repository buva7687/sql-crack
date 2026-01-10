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

    // Normalize whitespace
    let formatted = sql.replace(/\s+/g, ' ').trim();

    // Uppercase keywords if enabled
    if (opts.uppercase) {
        formatted = uppercaseKeywords(formatted);
    }

    // Add line breaks before major clauses
    formatted = addLineBreaks(formatted, opts.indent);

    // Format comma-separated lists
    formatted = formatLists(formatted, opts.indent);

    // Clean up extra whitespace
    formatted = formatted
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');

    return formatted;
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
 */
export function highlightSql(sql: string): string {
    if (!sql) return '';

    let result = escapeHtml(sql);

    // Highlight keywords
    const keywordPattern = new RegExp(
        '\\b(' + SQL_KEYWORDS.join('|') + ')\\b',
        'gi'
    );
    result = result.replace(keywordPattern,
        '<span style="color: #c792ea; font-weight: 600;">$1</span>');

    // Highlight strings
    result = result.replace(
        /'([^'\\]|\\.)*'/g,
        '<span style="color: #c3e88d;">$&</span>'
    );

    // Highlight numbers
    result = result.replace(
        /\b(\d+\.?\d*)\b/g,
        '<span style="color: #f78c6c;">$1</span>'
    );

    // Highlight comments
    result = result.replace(
        /(--[^\n]*)/g,
        '<span style="color: #546e7a; font-style: italic;">$1</span>'
    );

    // Highlight functions (word followed by parenthesis)
    result = result.replace(
        /\b([A-Z_][A-Z0-9_]*)\s*\(/gi,
        '<span style="color: #82aaff;">$1</span>('
    );

    return result;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
