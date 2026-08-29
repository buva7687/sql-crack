import { maskStringsAndComments } from './dialects/preprocessing';

function isIdentifierCharacter(char: string | undefined): boolean {
    return Boolean(char && /[\p{L}\p{N}_$]/u.test(char));
}

function matchesKeyword(sql: string, index: number, keyword: string): boolean {
    if (sql.slice(index, index + keyword.length).toUpperCase() !== keyword) {
        return false;
    }

    return !isIdentifierCharacter(sql[index - 1])
        && !isIdentifierCharacter(sql[index + keyword.length]);
}

/**
 * Extract the MERGE predicate that separates USING from the first action.
 *
 * A USING query can contain its own JOIN ... ON clauses, so the first ON in
 * the statement is not necessarily the MERGE predicate. At depth zero the
 * MERGE predicate is the last ON before WHEN [NOT] MATCHED.
 */
export function extractMergeOnCondition(sql: string): string | null {
    const maskedCharacters = maskStringsAndComments(sql).split('');
    for (let index = 0; index < maskedCharacters.length; index++) {
        const opening = maskedCharacters[index];
        if (opening !== '`' && opening !== '[') {
            continue;
        }

        const closing = opening === '[' ? ']' : '`';
        maskedCharacters[index] = ' ';
        index++;
        while (index < maskedCharacters.length) {
            if (maskedCharacters[index] === closing) {
                maskedCharacters[index] = ' ';
                if (maskedCharacters[index + 1] === closing) {
                    maskedCharacters[index + 1] = ' ';
                    index += 2;
                    continue;
                }
                break;
            }
            maskedCharacters[index] = ' ';
            index++;
        }
    }
    const masked = maskedCharacters.join('');
    const usingMatch = /\bUSING\b/i.exec(masked);
    if (!usingMatch) {
        return null;
    }

    let depth = 0;
    let conditionStart = -1;
    let actionStart = masked.length;

    for (let index = usingMatch.index + usingMatch[0].length; index < masked.length; index++) {
        const char = masked[index];
        if (char === '(') {
            depth++;
            continue;
        }
        if (char === ')') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth !== 0) {
            continue;
        }

        if (matchesKeyword(masked, index, 'ON')) {
            conditionStart = index + 2;
            index++;
            continue;
        }

        if (conditionStart !== -1 && matchesKeyword(masked, index, 'WHEN')) {
            const action = masked.slice(index).match(/^WHEN\s+(?:NOT\s+)?MATCHED\b/i);
            if (action) {
                actionStart = index;
                break;
            }
        }
    }

    if (conditionStart === -1 || conditionStart >= actionStart) {
        return null;
    }

    const condition = sql.slice(conditionStart, actionStart).trim().replace(/\s+/g, ' ');
    return condition || null;
}
