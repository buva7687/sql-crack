// Line number extraction and assignment for nodes

import { FlowNode } from '../types';
import { escapeRegex } from '../../shared';

function stripCommentsPreserveLineNumbers(sql: string): string {
    const chars = sql.split('');
    let i = 0;

    while (i < chars.length) {
        if (chars[i] === '/' && i + 1 < chars.length && chars[i + 1] === '*') {
            chars[i] = ' ';
            chars[i + 1] = ' ';
            i += 2;
            while (i < chars.length) {
                if (chars[i] === '*' && i + 1 < chars.length && chars[i + 1] === '/') {
                    chars[i] = ' ';
                    chars[i + 1] = ' ';
                    i += 2;
                    break;
                }
                if (chars[i] !== '\n' && chars[i] !== '\r') {
                    chars[i] = ' ';
                }
                i++;
            }
            continue;
        }

        if (chars[i] === '-' && i + 1 < chars.length && chars[i + 1] === '-') {
            while (i < chars.length && chars[i] !== '\n' && chars[i] !== '\r') {
                chars[i] = ' ';
                i++;
            }
            continue;
        }

        if (chars[i] === '#') {
            const next = i + 1 < chars.length ? chars[i + 1] : '';
            const isIdentChar = /[a-zA-Z0-9_]/.test(next);
            if (!isIdentChar) {
                while (i < chars.length && chars[i] !== '\n' && chars[i] !== '\r') {
                    chars[i] = ' ';
                    i++;
                }
                continue;
            }
        }
        i++;
    }

    return chars.join('');
}

export function extractKeywordLineNumbers(sql: string): Map<string, number[]> {
    const lines = stripCommentsPreserveLineNumbers(sql).split('\n');
    const keywordLines = new Map<string, number[]>();

    const keywords = [
        'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT',
        'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
        'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
        'WITH', 'UNION', 'INTERSECT', 'EXCEPT', 'AS',
        'MERGE', 'INTO', 'USING', 'INSERT', 'UPDATE', 'DELETE'
    ];

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1; // 1-indexed
        const lineWithoutComments = lines[i];
        if (!lineWithoutComments.trim()) {
            continue;
        }
        const upperLine = lineWithoutComments.toUpperCase();

        for (const keyword of keywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(upperLine)) {
                if (!keywordLines.has(keyword)) {
                    keywordLines.set(keyword, []);
                }
                keywordLines.get(keyword)!.push(lineNum);
            }
        }
    }

    return keywordLines;
}

export function assignLineNumbers(nodes: FlowNode[], sql: string): void {
    const keywordLines = extractKeywordLineNumbers(sql);
    const sqlLines = sql.split('\n');
    const commentStrippedLines = stripCommentsPreserveLineNumbers(sql).split('\n');
    const clauseRegex = /\b(from|join|into|using|update|delete)\b/i;

    // Track used lines per keyword type so each node gets the next unused occurrence
    const usedLines = new Map<string, number[]>();

    /** Get the next unused line for a keyword, marking it as used. */
    function claimNextLine(...keywords: string[]): number | undefined {
        for (const kw of keywords) {
            const lines = keywordLines.get(kw) || [];
            const used = usedLines.get(kw) || [];
            for (const line of lines) {
                if (!used.includes(line)) {
                    if (!usedLines.has(kw)) { usedLines.set(kw, []); }
                    usedLines.get(kw)!.push(line);
                    return line;
                }
            }
        }
        return undefined;
    }

    for (const node of nodes) {
        switch (node.type) {
            case 'table': {
                const tableName = node.label.toLowerCase().trim();
                const fromLines = keywordLines.get('FROM') || [];
                const joinLines = [
                    ...(keywordLines.get('JOIN') || []),
                    ...(keywordLines.get('INNER JOIN') || []),
                    ...(keywordLines.get('LEFT JOIN') || []),
                    ...(keywordLines.get('RIGHT JOIN') || []),
                    ...(keywordLines.get('FULL JOIN') || []),
                    ...(keywordLines.get('CROSS JOIN') || [])
                ];
                const intoLines = keywordLines.get('INTO') || [];
                const usingLines = keywordLines.get('USING') || [];
                const updateLines = keywordLines.get('UPDATE') || [];
                const deleteLines = keywordLines.get('DELETE') || [];

                const anchorLines = [
                    ...fromLines,
                    ...joinLines,
                    ...intoLines,
                    ...usingLines,
                    ...updateLines,
                    ...deleteLines,
                ];

                let foundLine: number | undefined;
                const searchStartLine = anchorLines.length > 0 ? Math.min(...anchorLines) : 1;

                for (let i = 0; i < sqlLines.length; i++) {
                    const line = commentStrippedLines[i].toLowerCase();
                    const tableRegex = new RegExp(`\\b${escapeRegex(tableName)}\\b`, 'i');
                    if (tableRegex.test(line)) {
                        const previousLine = i > 0 ? commentStrippedLines[i - 1].toLowerCase() : '';
                        if (i >= searchStartLine - 1 ||
                            clauseRegex.test(line) ||
                            clauseRegex.test(previousLine)) {
                            foundLine = i + 1;
                            break;
                        }
                    }
                }

                node.startLine = foundLine || (fromLines.length > 0 ? fromLines[0] : undefined);
                break;
            }
            case 'join': {
                const joinTypes = ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
                    'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
                    'CROSS JOIN', 'JOIN'];
                for (const jt of joinTypes) {
                    if (node.label.toUpperCase().includes(jt.replace(' JOIN', ''))) {
                        node.startLine = claimNextLine(jt, 'JOIN');
                        if (node.startLine) {break;}
                    }
                }
                break;
            }
            case 'filter': {
                if (node.label === 'WHERE') {
                    node.startLine = claimNextLine('WHERE');
                } else if (node.label === 'HAVING') {
                    node.startLine = claimNextLine('HAVING');
                }
                break;
            }
            case 'aggregate': {
                node.startLine = claimNextLine('GROUP BY');
                break;
            }
            case 'sort': {
                node.startLine = claimNextLine('ORDER BY');
                break;
            }
            case 'limit': {
                node.startLine = claimNextLine('LIMIT');
                break;
            }
            case 'select': {
                node.startLine = claimNextLine('SELECT');
                break;
            }
            case 'cte': {
                node.startLine = claimNextLine('WITH');
                break;
            }
            case 'union': {
                node.startLine = claimNextLine('UNION', 'INTERSECT', 'EXCEPT');
                break;
            }
            case 'subquery':
            case 'window':
            case 'case': {
                // These node types use SELECT as their closest keyword anchor
                node.startLine = claimNextLine('SELECT');
                break;
            }
            case 'result': {
                const selectLines = keywordLines.get('SELECT') || [];
                const mergeLines = keywordLines.get('MERGE') || [];
                const insertLines = keywordLines.get('INSERT') || [];
                const updateLines = keywordLines.get('UPDATE') || [];
                const deleteLines = keywordLines.get('DELETE') || [];
                const candidateLines = [
                    ...selectLines,
                    ...mergeLines,
                    ...insertLines,
                    ...updateLines,
                    ...deleteLines,
                ];
                if (candidateLines.length > 0) {
                    node.startLine = Math.min(...candidateLines);
                }
                break;
            }
        }
    }
}
