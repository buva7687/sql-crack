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

// ============================================================
// FEATURE: SQL Diff
// ============================================================

export interface DiffLine {
    type: 'same' | 'added' | 'removed' | 'modified';
    lineNumber1?: number;
    lineNumber2?: number;
    content: string;
    oldContent?: string;
}

export interface DiffResult {
    lines: DiffLine[];
    stats: {
        added: number;
        removed: number;
        modified: number;
        same: number;
    };
}

/**
 * Compare two SQL queries and return a diff result
 * Uses a simple line-by-line diff algorithm
 */
export function diffSql(sql1: string, sql2: string): DiffResult {
    // Format both queries for consistent comparison
    const formatted1 = formatSql(sql1);
    const formatted2 = formatSql(sql2);

    const lines1 = formatted1.split('\n');
    const lines2 = formatted2.split('\n');

    const diff = computeLCS(lines1, lines2);

    return diff;
}

/**
 * Compute diff using Longest Common Subsequence algorithm
 */
function computeLCS(lines1: string[], lines2: string[]): DiffResult {
    const m = lines1.length;
    const n = lines2.length;

    // Build LCS table
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (lines1[i - 1].trim() === lines2[j - 1].trim()) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to find diff
    const diffLines: DiffLine[] = [];
    let i = m, j = n;

    const tempLines: DiffLine[] = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && lines1[i - 1].trim() === lines2[j - 1].trim()) {
            tempLines.unshift({
                type: 'same',
                lineNumber1: i,
                lineNumber2: j,
                content: lines2[j - 1]
            });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            tempLines.unshift({
                type: 'added',
                lineNumber2: j,
                content: lines2[j - 1]
            });
            j--;
        } else if (i > 0) {
            tempLines.unshift({
                type: 'removed',
                lineNumber1: i,
                content: lines1[i - 1]
            });
            i--;
        }
    }

    // Merge adjacent added/removed into modified when they're on same position
    for (let k = 0; k < tempLines.length; k++) {
        const line = tempLines[k];

        // Check if this removed line is followed by added line (potential modification)
        if (line.type === 'removed' && k + 1 < tempLines.length && tempLines[k + 1].type === 'added') {
            const nextLine = tempLines[k + 1];
            // Check if lines are similar (modification rather than complete replacement)
            if (areSimilarLines(line.content, nextLine.content)) {
                diffLines.push({
                    type: 'modified',
                    lineNumber1: line.lineNumber1,
                    lineNumber2: nextLine.lineNumber2,
                    content: nextLine.content,
                    oldContent: line.content
                });
                k++; // Skip the next line as we've merged it
                continue;
            }
        }

        diffLines.push(line);
    }

    // Calculate stats
    const stats = {
        added: diffLines.filter(l => l.type === 'added').length,
        removed: diffLines.filter(l => l.type === 'removed').length,
        modified: diffLines.filter(l => l.type === 'modified').length,
        same: diffLines.filter(l => l.type === 'same').length
    };

    return { lines: diffLines, stats };
}

/**
 * Check if two lines are similar (for detecting modifications vs add/remove)
 */
function areSimilarLines(line1: string, line2: string): boolean {
    const words1 = line1.trim().toLowerCase().split(/\s+/);
    const words2 = line2.trim().toLowerCase().split(/\s+/);

    if (words1.length === 0 || words2.length === 0) return false;

    // Count common words
    const set1 = new Set(words1);
    let common = 0;
    for (const word of words2) {
        if (set1.has(word)) common++;
    }

    // If more than 30% of words are common, consider it a modification
    const similarity = common / Math.max(words1.length, words2.length);
    return similarity > 0.3;
}

/**
 * Generate HTML for diff visualization
 */
export function generateDiffHtml(diff: DiffResult, darkTheme: boolean = true): string {
    const colors = darkTheme ? {
        added: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', text: '#86efac' },
        removed: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#fca5a5' },
        modified: { bg: 'rgba(234, 179, 8, 0.15)', border: '#eab308', text: '#fde047' },
        same: { bg: 'transparent', border: 'transparent', text: '#94a3b8' },
        lineNum: '#64748b',
        codeBg: '#1e293b'
    } : {
        added: { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', text: '#166534' },
        removed: { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#991b1b' },
        modified: { bg: 'rgba(234, 179, 8, 0.1)', border: '#eab308', text: '#854d0e' },
        same: { bg: 'transparent', border: 'transparent', text: '#475569' },
        lineNum: '#94a3b8',
        codeBg: '#f1f5f9'
    };

    let html = `<div style="font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; font-size: 12px; line-height: 1.6;">`;

    for (const line of diff.lines) {
        const style = colors[line.type];
        const lineNum1 = line.lineNumber1?.toString().padStart(3, ' ') || '   ';
        const lineNum2 = line.lineNumber2?.toString().padStart(3, ' ') || '   ';

        const prefix = line.type === 'added' ? '+' :
                      line.type === 'removed' ? '-' :
                      line.type === 'modified' ? '~' : ' ';

        const escapedContent = escapeHtmlSimple(line.content);

        html += `
            <div style="
                display: flex;
                background: ${style.bg};
                border-left: 3px solid ${style.border};
                padding: 2px 8px;
                margin: 1px 0;
            ">
                <span style="color: ${colors.lineNum}; min-width: 30px; user-select: none;">${lineNum1}</span>
                <span style="color: ${colors.lineNum}; min-width: 30px; user-select: none;">${lineNum2}</span>
                <span style="color: ${style.text}; min-width: 16px; font-weight: 600;">${prefix}</span>
                <span style="color: ${style.text}; flex: 1; white-space: pre-wrap;">${highlightSqlInline(escapedContent, darkTheme)}</span>
            </div>
        `;

        // Show old content for modified lines
        if (line.type === 'modified' && line.oldContent) {
            const escapedOld = escapeHtmlSimple(line.oldContent);
            html += `
                <div style="
                    display: flex;
                    background: ${colors.removed.bg};
                    border-left: 3px solid transparent;
                    padding: 2px 8px;
                    margin: 1px 0;
                    opacity: 0.6;
                ">
                    <span style="color: ${colors.lineNum}; min-width: 30px;"></span>
                    <span style="color: ${colors.lineNum}; min-width: 30px;"></span>
                    <span style="color: ${colors.removed.text}; min-width: 16px; font-weight: 600;">-</span>
                    <span style="color: ${colors.removed.text}; flex: 1; white-space: pre-wrap; text-decoration: line-through;">${highlightSqlInline(escapedOld, darkTheme)}</span>
                </div>
            `;
        }
    }

    html += `</div>`;
    return html;
}

/**
 * Simple inline SQL highlighting (reuses keywords from highlightSql)
 */
function highlightSqlInline(html: string, darkTheme: boolean): string {
    const keywordColor = darkTheme ? '#c792ea' : '#7c3aed';
    const functionColor = darkTheme ? '#82aaff' : '#2563eb';
    const stringColor = darkTheme ? '#c3e88d' : '#16a34a';
    const numberColor = darkTheme ? '#f78c6c' : '#ea580c';

    // Highlight keywords (already escaped, so we match on the escaped text)
    const keywordPattern = new RegExp(
        '\\b(' + SQL_KEYWORDS.join('|') + ')\\b',
        'gi'
    );

    return html
        .replace(keywordPattern, `<span style="color: ${keywordColor}; font-weight: 600;">$1</span>`)
        .replace(/\b(\d+(?:\.\d+)?)\b/g, `<span style="color: ${numberColor};">$1</span>`)
        .replace(/(&apos;[^&]*&apos;|&quot;[^&]*&quot;)/g, `<span style="color: ${stringColor};">$1</span>`);
}

