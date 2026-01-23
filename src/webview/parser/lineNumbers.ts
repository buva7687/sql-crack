// Line number extraction and assignment for nodes

import { FlowNode } from '../types';

export function extractKeywordLineNumbers(sql: string): Map<string, number[]> {
    const lines = sql.split('\n');
    const keywordLines = new Map<string, number[]>();

    const keywords = [
        'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT',
        'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
        'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
        'WITH', 'UNION', 'INTERSECT', 'EXCEPT', 'AS'
    ];

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1; // 1-indexed
        const upperLine = lines[i].toUpperCase();

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
    const usedJoinLines: number[] = [];

    for (const node of nodes) {
        switch (node.type) {
            case 'table': {
                const tableName = node.label.toLowerCase().trim();
                const sqlLines = sql.split('\n');
                const fromLines = keywordLines.get('FROM') || [];
                const joinLines = [
                    ...(keywordLines.get('JOIN') || []),
                    ...(keywordLines.get('INNER JOIN') || []),
                    ...(keywordLines.get('LEFT JOIN') || []),
                    ...(keywordLines.get('RIGHT JOIN') || []),
                    ...(keywordLines.get('FULL JOIN') || []),
                    ...(keywordLines.get('CROSS JOIN') || [])
                ];

                let foundLine: number | undefined;
                const searchStartLine = Math.min(...fromLines, ...joinLines, sqlLines.length);

                for (let i = 0; i < sqlLines.length; i++) {
                    const line = sqlLines[i].toLowerCase();
                    const tableRegex = new RegExp(`\\b${tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    if (tableRegex.test(line)) {
                        if (i >= searchStartLine - 1 ||
                            line.includes('from') ||
                            line.includes('join') ||
                            (i > 0 && (sqlLines[i - 1].toLowerCase().includes('from') || sqlLines[i - 1].toLowerCase().includes('join')))) {
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
                        const lines = keywordLines.get(jt) || keywordLines.get('JOIN') || [];
                        for (const line of lines) {
                            if (!usedJoinLines.includes(line)) {
                                node.startLine = line;
                                usedJoinLines.push(line);
                                break;
                            }
                        }
                        if (node.startLine) {break;}
                    }
                }
                break;
            }
            case 'filter': {
                if (node.label === 'WHERE') {
                    const whereLines = keywordLines.get('WHERE') || [];
                    if (whereLines.length > 0) {node.startLine = whereLines[0];}
                } else if (node.label === 'HAVING') {
                    const havingLines = keywordLines.get('HAVING') || [];
                    if (havingLines.length > 0) {node.startLine = havingLines[0];}
                }
                break;
            }
            case 'aggregate': {
                const groupLines = keywordLines.get('GROUP BY') || [];
                if (groupLines.length > 0) {node.startLine = groupLines[0];}
                break;
            }
            case 'sort': {
                const orderLines = keywordLines.get('ORDER BY') || [];
                if (orderLines.length > 0) {node.startLine = orderLines[0];}
                break;
            }
            case 'limit': {
                const limitLines = keywordLines.get('LIMIT') || [];
                if (limitLines.length > 0) {node.startLine = limitLines[0];}
                break;
            }
            case 'select': {
                const selectLines = keywordLines.get('SELECT') || [];
                if (selectLines.length > 0) {node.startLine = selectLines[0];}
                break;
            }
            case 'cte': {
                const withLines = keywordLines.get('WITH') || [];
                if (withLines.length > 0) {node.startLine = withLines[0];}
                break;
            }
            case 'union': {
                const unionLines = keywordLines.get('UNION') || keywordLines.get('INTERSECT') || keywordLines.get('EXCEPT') || [];
                if (unionLines.length > 0) {node.startLine = unionLines[0];}
                break;
            }
            case 'result': {
                const selectLines = keywordLines.get('SELECT') || [];
                if (selectLines.length > 0) {node.startLine = selectLines[0];}
                break;
            }
        }
    }
}
