import { getDollarQuoteDelimiterAt, isHashTempTableIdentifierAt } from '../../../shared/stringUtils';
import type { SqlDialect } from '../../types/parser';
import { maskStringsAndComments } from '../dialects/preprocessing';

export function stripLeadingComments(sql: string): string {
    let result = sql.trim();
    let changed = true;

    while (changed) {
        changed = false;

        while (result.startsWith('--')) {
            const newlineIdx = result.indexOf('\n');
            if (newlineIdx === -1) {
                return '';
            }
            result = result.substring(newlineIdx + 1).trim();
            changed = true;
        }

        if (result.startsWith('/*')) {
            let blockDepth = 1;
            let endIdx = 2;
            while (endIdx < result.length && blockDepth > 0) {
                if (result[endIdx] === '/' && result[endIdx + 1] === '*') {
                    blockDepth++;
                    endIdx += 2;
                } else if (result[endIdx] === '*' && result[endIdx + 1] === '/') {
                    blockDepth--;
                    endIdx += 2;
                } else {
                    endIdx++;
                }
            }
            if (blockDepth > 0) {
                return '';
            }
            result = result.substring(endIdx).trim();
            changed = true;
        }

        while (result.startsWith('#') && !isHashTempTableIdentifierAt(result, 0)) {
            const newlineIdx = result.indexOf('\n');
            if (newlineIdx === -1) {
                return '';
            }
            result = result.substring(newlineIdx + 1).trim();
            changed = true;
        }
    }

    return result;
}

function scanSqlStatements(
    sql: string,
    onStatement: (statement: string) => void,
    dialect: SqlDialect = 'MySQL'
): void {
    let current = '';
    let inString = false;
    let stringChar = '';
    let stringAllowsBackslashEscapes = false;
    let inBracketIdentifier = false;
    let inLineComment = false;
    let blockCommentDepth = 0;
    let depth = 0;

    // Track procedural blocks
    let beginEndDepth = 0;
    let caseDepth = 0;
    let inDollarQuotes = false;
    let dollarQuoteTag = '';
    let customDelimiter = null as string | null;

    const isIdentifierChar = (ch: string | undefined): boolean => {
        if (!ch) { return false; }
        const code = ch.charCodeAt(0);
        return (code >= 48 && code <= 57) // 0-9
            || (code >= 65 && code <= 90) // A-Z
            || (code >= 97 && code <= 122) // a-z
            || code === 95; // _
    };

    const matchKeyword = (idx: number, keyword: string): boolean => {
        if (idx + keyword.length > sql.length) { return false; }
        for (let i = 0; i < keyword.length; i++) {
            const sourceCode = sql.charCodeAt(idx + i);
            const upperSourceCode = (sourceCode >= 97 && sourceCode <= 122) ? sourceCode - 32 : sourceCode;
            if (upperSourceCode !== keyword.charCodeAt(i)) {
                return false;
            }
        }
        if (idx > 0 && isIdentifierChar(sql[idx - 1])) { return false; }
        const afterIdx = idx + keyword.length;
        if (afterIdx < sql.length && isIdentifierChar(sql[afterIdx])) { return false; }
        return true;
    };

    const isProceduralBegin = (idx: number): boolean => {
        const after = sql.substring(idx + 5, idx + 25).trim().toUpperCase();
        if (/^(TRANSACTION|WORK|TRAN|TRY|CATCH)\b/.test(after)) { return false; }

        const before = sql.substring(Math.max(0, idx - 200), idx).toUpperCase();
        if (/\b(AS|THEN|ELSE|LOOP|IS)\s*$/.test(before)) { return true; }
        if (/\bCREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE|TRIGGER)\b[^;]*$/.test(before)) { return true; }

        return false;
    };

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const nextChar = i < sql.length - 1 ? sql[i + 1] : '';
        const prevChar = i > 0 ? sql[i - 1] : '';

        if (inBracketIdentifier) {
            current += char;
            if (char === ']') {
                if (nextChar === ']') {
                    current += nextChar;
                    i++;
                } else {
                    inBracketIdentifier = false;
                }
            }
            continue;
        }

        if (inLineComment) {
            current += char;
            if (char === '\n') {
                inLineComment = false;
            }
            continue;
        }

        if (blockCommentDepth > 0) {
            current += char;
            if (char === '/' && nextChar === '*') {
                current += '*';
                i++;
                blockCommentDepth++;
            } else if (char === '*' && nextChar === '/') {
                current += '/';
                i++;
                blockCommentDepth--;
            }
            continue;
        }

        if (!inString && !inDollarQuotes) {
            if (char === '/' && nextChar === '*') {
                blockCommentDepth = 1;
                current += '/*';
                i++;
                continue;
            }

            if ((char === '-' && nextChar === '-') || (char === '/' && nextChar === '/')) {
                inLineComment = true;
                current += char + nextChar;
                i++;
                continue;
            }
            if (char === '#' && !isHashTempTableIdentifierAt(sql, i)) {
                inLineComment = true;
                current += char;
                continue;
            }
        }

        if (!inString && char === '$') {
            if (inDollarQuotes) {
                const fullTag = `$${dollarQuoteTag}$`;
                if (sql.startsWith(fullTag, i)) {
                    inDollarQuotes = false;
                    dollarQuoteTag = '';
                    current += fullTag;
                    i += fullTag.length - 1;
                    continue;
                }
            } else {
                const fullTag = getDollarQuoteDelimiterAt(sql, i);
                if (fullTag) {
                    inDollarQuotes = true;
                    dollarQuoteTag = fullTag.slice(1, -1);
                    current += fullTag;
                    i += fullTag.length - 1;
                    continue;
                }
            }
        }

        if (!inString && !inDollarQuotes && blockCommentDepth === 0 && !inLineComment) {
            const lineStart = current.trim();
            if (lineStart === '' && (char === 'D' || char === 'd')) {
                const remaining = sql.substring(i, i + 20).toUpperCase();
                if (remaining.startsWith('DELIMITER ')) {
                    const delimiterMatch = sql.substring(i).match(/^DELIMITER\s+(\S+)/i);
                    if (delimiterMatch) {
                        customDelimiter = delimiterMatch[1] === ';' ? null : delimiterMatch[1];
                        while (i < sql.length && sql[i] !== '\n') {
                            i++;
                        }
                        current = '';
                        continue;
                    }
                }
            }
        }

        if (!inDollarQuotes) {
            if (inString && stringChar !== '`' && stringAllowsBackslashEscapes && char === '\\' && nextChar) {
                current += char + nextChar;
                i++;
                continue;
            }

            if (!inString && dialect === 'TransactSQL' && char === '[') {
                inBracketIdentifier = true;
                current += char;
                continue;
            }

            // Treat backticks as quote delimiters too (MySQL identifier quoting),
            // so a semicolon inside a `back``tick` identifier never splits a
            // statement. Doubled delimiters ('', "", ``) are in-string escapes.
            if (char === '\'' || char === '"' || char === '`') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                    stringAllowsBackslashEscapes = dialect === 'MySQL'
                        || dialect === 'MariaDB'
                        || dialect === 'BigQuery'
                        || dialect === 'Snowflake'
                        || dialect === 'Hive'
                        || dialect === 'Redshift'
                        || (char === '\'' && dialect === 'PostgreSQL' && /[Ee]/.test(prevChar));
                } else if (char === stringChar) {
                    // SQL-standard doubled quote escape: '' or "" (and `` for backticks)
                    const nextChar = i + 1 < sql.length ? sql[i + 1] : '';
                    if (nextChar === stringChar) {
                        // Preserve BOTH delimiter characters in the statement text.
                        // Dropping them corrupts identifiers/literals before parsing
                        // (e.g. `ab``c` would collapse to `abc`).
                        current += char + nextChar;
                        i++; // skip the escaped quote
                        continue;
                    }
                    inString = false;
                    stringAllowsBackslashEscapes = false;
                }
            }
        }

        if (!inString && !inDollarQuotes && blockCommentDepth === 0 && !inLineComment) {
            if (char === '(') { depth++; }
            // Recover from a stray closing parenthesis instead of carrying a
            // negative depth that disables every later semicolon split.
            if (char === ')') { depth = Math.max(0, depth - 1); }

            if (matchKeyword(i, 'CASE')) {
                caseDepth++;
            }

            if (matchKeyword(i, 'BEGIN')) {
                if (isProceduralBegin(i)) {
                    beginEndDepth++;
                }
            }

            if (matchKeyword(i, 'END')) {
                const afterEnd = sql.substring(i + 3, i + 15).trim().toUpperCase();
                if (/^(TRY|CATCH|IF|LOOP|WHILE)\b/.test(afterEnd)) {
                    // Block-qualifier END.
                } else if (caseDepth > 0) {
                    caseDepth--;
                } else if (beginEndDepth > 0) {
                    beginEndDepth--;
                }
            }
        }

        const delimiter = customDelimiter || ';';
        const isDelimiter = delimiter === ';'
            ? (char === ';' && !inString && !inDollarQuotes && depth === 0 && beginEndDepth === 0)
            : (sql.substring(i).startsWith(delimiter) && !inString && !inDollarQuotes && depth === 0 && beginEndDepth === 0);

        if (isDelimiter) {
            const trimmed = current.trim();
            if (trimmed) {
                const withoutComments = stripLeadingComments(trimmed).trim();
                if (withoutComments) {
                    onStatement(trimmed);
                }
            }
            current = '';

            if (delimiter !== ';') {
                i += delimiter.length - 1;
            }
        } else {
            current += char;
        }
    }

    const trimmed = current.trim();
    if (trimmed) {
        const withoutComments = stripLeadingComments(trimmed).trim();
        if (withoutComments) {
            onStatement(trimmed);
        }
    }
}

// Split SQL into individual statements
export function splitSqlStatements(sql: string, dialect: SqlDialect = 'MySQL'): string[] {
    const statements: string[] = [];
    scanSqlStatements(sql, (statement) => {
        statements.push(statement);
    }, dialect);
    return statements;
}

export function countSqlStatements(sql: string, dialect: SqlDialect = 'MySQL'): number {
    let count = 0;
    scanSqlStatements(sql, () => {
        count++;
    }, dialect);
    return count;
}

/** Split SQL Server batches on a line containing only GO (optionally with a repeat count). */
export function splitTransactSqlBatches(sql: string): string[] {
    const masked = maskStringsAndComments(sql);
    const separator = /^[ \t]*GO(?:[ \t]+\d+)?[ \t]*(?:\r?\n|$)/gim;
    const batches: string[] = [];
    let batchStart = 0;
    let match: RegExpExecArray | null;

    while ((match = separator.exec(masked)) !== null) {
        const batch = sql.slice(batchStart, match.index).trim();
        if (batch && stripLeadingComments(batch).trim()) {
            batches.push(batch);
        }
        batchStart = match.index + match[0].length;
    }

    const tail = sql.slice(batchStart).trim();
    if (tail && stripLeadingComments(tail).trim()) {
        batches.push(tail);
    }
    return batches;
}
