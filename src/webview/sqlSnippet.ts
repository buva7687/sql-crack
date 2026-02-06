export interface SqlSnippet {
    snippet: string;
    lineLabel: string;
}

export function extractSqlSnippet(
    sql: string,
    startLine?: number,
    endLine?: number,
    maxLines = 3,
    maxChars = 180
): SqlSnippet | null {
    if (!sql || !startLine || startLine < 1) {
        return null;
    }

    const sqlLines = sql.split('\n');
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(
        sqlLines.length,
        Math.max(startIdx + 1, endLine ? endLine : startIdx + maxLines)
    );

    const selectedLines = sqlLines.slice(startIdx, Math.min(endIdx, startIdx + maxLines));
    const rawSnippet = selectedLines.join('\n').trim();
    if (!rawSnippet) {
        return null;
    }

    const snippet = rawSnippet.length > maxChars ? `${rawSnippet.slice(0, maxChars)}...` : rawSnippet;
    const resolvedEndLine = endLine && endLine >= startLine ? endLine : startLine + selectedLines.length - 1;
    const lineLabel = resolvedEndLine > startLine ? `Line ${startLine}-${resolvedEndLine}` : `Line ${startLine}`;

    return { snippet, lineLabel };
}
