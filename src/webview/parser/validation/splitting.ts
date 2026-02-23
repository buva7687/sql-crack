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
            const endIdx = result.indexOf('*/');
            if (endIdx === -1) {
                return '';
            }
            result = result.substring(endIdx + 2).trim();
            changed = true;
        }

        while (result.startsWith('#')) {
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

// Split SQL into individual statements
export function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;
    let depth = 0;

    // Track procedural blocks
    let beginEndDepth = 0;
    let caseDepth = 0;
    let inDollarQuotes = false;
    let dollarQuoteTag = '';
    let customDelimiter = null as string | null;

    const matchKeyword = (idx: number, keyword: string): boolean => {
        if (idx + keyword.length > sql.length) { return false; }
        if (sql.substring(idx, idx + keyword.length).toUpperCase() !== keyword) { return false; }
        if (idx > 0 && /[a-zA-Z0-9_]/.test(sql[idx - 1])) { return false; }
        const afterIdx = idx + keyword.length;
        if (afterIdx < sql.length && /[a-zA-Z0-9_]/.test(sql[afterIdx])) { return false; }
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

        if (inLineComment) {
            current += char;
            if (char === '\n') {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            current += char;
            if (char === '*' && nextChar === '/') {
                current += '/';
                i++;
                inBlockComment = false;
            }
            continue;
        }

        if (!inString && !inDollarQuotes) {
            if (char === '/' && nextChar === '*') {
                inBlockComment = true;
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
            if (char === '#') {
                inLineComment = true;
                current += char;
                continue;
            }
        }

        if (!inString && char === '$') {
            let j = i + 1;
            let tag = '';
            while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
                tag += sql[j];
                j++;
            }
            if (j < sql.length && sql[j] === '$') {
                const fullTag = '$' + tag + '$';
                if (inDollarQuotes && tag === dollarQuoteTag) {
                    inDollarQuotes = false;
                    dollarQuoteTag = '';
                    current += fullTag;
                    i = j;
                    continue;
                } else if (!inDollarQuotes) {
                    inDollarQuotes = true;
                    dollarQuoteTag = tag;
                    current += fullTag;
                    i = j;
                    continue;
                }
            }
        }

        if (!inString && !inDollarQuotes && !inBlockComment && !inLineComment) {
            const lineStart = current.trim();
            if (lineStart === '' && char.toUpperCase() === 'D') {
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
            if ((char === '\'' || char === '"') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }
        }

        if (!inString && !inDollarQuotes && !inBlockComment && !inLineComment) {
            if (char === '(') { depth++; }
            if (char === ')') { depth--; }

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
                    statements.push(trimmed);
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
            statements.push(trimmed);
        }
    }

    return statements;
}
