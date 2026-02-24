import type {
    FlowEdge,
    FlowNode,
    OptimizationHint,
    ParseResult,
    QueryStats,
    SqlDialect
} from '../../types';
import { findMatchingParen } from './preprocessing';

/**
 * Regex-based fallback parser for when AST parsing fails.
 * Extracts basic structure (tables, columns, JOINs) to show best-effort visualization.
 * This is better than showing nothing - 70% accuracy > 0%.
 */
export function regexFallbackParse(sql: string, dialect: SqlDialect): ParseResult {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const tableNames = new Set<string>();
    const hints: OptimizationHint[] = [];
    let nodeId = 0;

    const genId = (prefix: string) => `${prefix}_${nodeId++}`;
    const commentStripped = sql
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--[^\n]*/g, '')
        .replace(/#[^\n]*/g, '');

    const cteNames = new Set<string>();
    const cteBodies = new Map<string, string>();
    const identifierPart = '[\\p{L}\\p{N}_$]+';
    const quotedIdentifier = "(?:`[^`]+`|\"[^\"]+\"|\\[[^\\]]+\\]|'[^']+')";
    const identifier = `(?:${quotedIdentifier}|${identifierPart})`;
    const qualifiedIdentifier = `${identifier}(?:\\.${identifier})*`;
    const identifierWrapperPattern = /[`"'\[\]]/g;
    const normalizeObjectName = (raw: string): string => {
        const parts = raw.split('.').map((part) => part.replace(identifierWrapperPattern, '')).filter(Boolean);
        return parts[parts.length - 1] || raw.replace(identifierWrapperPattern, '');
    };

    const firstCtePattern = new RegExp(`\\bWITH\\s+(${identifier})\\s+AS\\s*\\(`, 'giu');
    let cteMatch = firstCtePattern.exec(commentStripped);
    if (cteMatch) {
        cteNames.add(normalizeObjectName(cteMatch[1]));
        const openParenIdx = cteMatch.index + cteMatch[0].length - 1;
        const bodyClose = findMatchingParen(commentStripped, openParenIdx);
        if (bodyClose !== -1) {
            cteBodies.set(normalizeObjectName(cteMatch[1]), commentStripped.substring(openParenIdx + 1, bodyClose));
        }

        const subsequentCtePattern = new RegExp(`,\\s*(${identifier})\\s+AS\\s*\\(`, 'giu');
        subsequentCtePattern.lastIndex = bodyClose !== -1 ? bodyClose + 1 : firstCtePattern.lastIndex;
        let subMatch;
        while ((subMatch = subsequentCtePattern.exec(commentStripped)) !== null) {
            const normalizedName = normalizeObjectName(subMatch[1]);
            cteNames.add(normalizedName);
            const subOpenParen = subMatch.index + subMatch[0].length - 1;
            const subBodyClose = findMatchingParen(commentStripped, subOpenParen);
            if (subBodyClose !== -1) {
                cteBodies.set(normalizedName, commentStripped.substring(subOpenParen + 1, subBodyClose));
                subsequentCtePattern.lastIndex = subBodyClose + 1;
            }
        }
    }

    for (const cteName of cteNames) {
        tableNames.add(cteName);
        nodes.push({
            id: genId('cte'),
            type: 'table',
            label: cteName,
            description: 'CTE (detected by fallback parser)',
            details: ['Common Table Expression'],
            x: 0,
            y: nodes.length * 100,
            width: 160,
            height: 60,
            tableCategory: 'cte_reference',
        });
    }

    const tablePatterns = [
        new RegExp(`\\bFROM\\s+(${qualifiedIdentifier})`, 'giu'),
        new RegExp(`\\bJOIN\\s+(${qualifiedIdentifier})`, 'giu'),
        new RegExp(`\\bINTO\\s+(${qualifiedIdentifier})`, 'giu'),
        new RegExp(`\\bUPDATE\\s+(?!SET\\b)(${qualifiedIdentifier})`, 'giu'),
        new RegExp(`\\bMERGE\\s+INTO\\s+(${qualifiedIdentifier})`, 'giu'),
        new RegExp(`\\bUSING\\s+(${qualifiedIdentifier})`, 'giu'),
    ];

    for (const pattern of tablePatterns) {
        let match;
        while ((match = pattern.exec(commentStripped)) !== null) {
            const tableName = normalizeObjectName(match[1]);
            if (tableName && !tableNames.has(tableName)) {
                tableNames.add(tableName);
                nodes.push({
                    id: genId('table'),
                    type: 'table',
                    label: tableName,
                    description: 'Table (detected by fallback parser)',
                    details: ['Partial visualization - parsing failed'],
                    x: 0,
                    y: nodes.length * 100,
                    width: 160,
                    height: 60,
                    tableCategory: 'physical',
                });
            }
        }
    }

    const tableRefPattern = new RegExp(`\\b(FROM|JOIN)\\s+(${qualifiedIdentifier})`, 'giu');
    let refMatch;
    const tableRefs: { keyword: string; table: string; pos: number }[] = [];

    while ((refMatch = tableRefPattern.exec(commentStripped)) !== null) {
        const keyword = refMatch[1].toUpperCase();
        const table = normalizeObjectName(refMatch[2]);
        tableRefs.push({ keyword, table, pos: refMatch.index });
    }

    let chainPrev: string | null = null;
    for (const ref of tableRefs) {
        if (ref.keyword === 'FROM') {
            chainPrev = ref.table;
        } else if (ref.keyword === 'JOIN' && chainPrev && tableNames.has(chainPrev) && tableNames.has(ref.table)) {
            edges.push({
                id: genId('edge'),
                source: nodes.find(n => n.label === chainPrev)?.id || '',
                target: nodes.find(n => n.label === ref.table)?.id || '',
                sqlClause: 'JOIN',
                clauseType: 'join',
            });
            chainPrev = ref.table;
        }
    }

    for (const [cteName, body] of cteBodies) {
        const bodyRefPattern = new RegExp(`\\b(?:FROM|JOIN)\\s+(${qualifiedIdentifier})`, 'giu');
        let bodyRef;
        while ((bodyRef = bodyRefPattern.exec(body)) !== null) {
            const srcTable = normalizeObjectName(bodyRef[1]);
            if (srcTable && tableNames.has(srcTable) && srcTable !== cteName) {
                const srcNode = nodes.find(n => n.label === srcTable);
                const cteNode = nodes.find(n => n.label === cteName);
                if (srcNode && cteNode) {
                    edges.push({
                        id: genId('edge'),
                        source: srcNode.id,
                        target: cteNode.id,
                        sqlClause: 'CTE reference',
                        clauseType: 'flow',
                    });
                }
            }
        }
    }

    const upperSql = commentStripped.toUpperCase().trim();
    let statementType = 'UNKNOWN';
    if (upperSql.startsWith('SELECT')) { statementType = 'SELECT'; }
    else if (upperSql.startsWith('INSERT')) { statementType = 'INSERT'; }
    else if (upperSql.startsWith('UPDATE')) { statementType = 'UPDATE'; }
    else if (upperSql.startsWith('DELETE')) { statementType = 'DELETE'; }
    else if (upperSql.startsWith('MERGE')) {
        statementType = 'MERGE';
        const whenClauses: Array<{ type: string; action: string }> = [];
        const whenMatchedPattern = /WHEN\s+MATCHED\s+(?:AND\s+[^:]+\s+)?THEN\s+(\w+)/gi;
        let match;
        while ((match = whenMatchedPattern.exec(commentStripped)) !== null) {
            whenClauses.push({
                type: 'MATCHED',
                action: match[1] || 'UPDATE',
            });
        }

        const whenNotMatchedPattern = /WHEN\s+NOT\s+MATCHED\s+(?:BY\s+\w+\s+)?THEN\s+(\w+)/gi;
        while ((match = whenNotMatchedPattern.exec(commentStripped)) !== null) {
            whenClauses.push({
                type: 'NOT MATCHED',
                action: match[1] || 'INSERT',
            });
        }

        const mergeTargetMatch = commentStripped.match(new RegExp(`MERGE\\s+INTO\\s+(${qualifiedIdentifier})`, 'iu'));
        const mergeSourceMatch = commentStripped.match(new RegExp(`USING\\s+(${qualifiedIdentifier})`, 'iu'));

        if (mergeTargetMatch && mergeSourceMatch) {
            const targetTable = normalizeObjectName(mergeTargetMatch[1]);
            const sourceTable = normalizeObjectName(mergeSourceMatch[1]);

            // Extract ON condition
            const onMatch = commentStripped.match(/\bON\s+(.+?)(?=\s*WHEN\b)/is);
            const onCondition = onMatch ? onMatch[1].trim().replace(/\s+/g, ' ') : '';

            // Extract UPDATE SET columns
            const updateCols: string[] = [];
            const setMatch = commentStripped.match(/UPDATE\s+SET\s+([\s\S]+?)(?=\bWHEN\b|\bINSERT\b|$)/i);
            if (setMatch) {
                const assignments = setMatch[1].split(',');
                for (const a of assignments) {
                    const colMatch = a.trim().match(/(?:\w+\.)?(\w+)\s*=/);
                    if (colMatch) { updateCols.push(colMatch[1]); }
                }
            }

            // Extract INSERT columns
            const insertCols: string[] = [];
            const insertMatch = commentStripped.match(/\bINSERT\s*\(([^)]+)\)/i);
            if (insertMatch) {
                insertCols.push(...insertMatch[1].split(',').map(c => c.trim()));
            }

            // Build a compact description (rendered) — details[] is NOT rendered for 'result' nodes
            const descParts: string[] = [];
            for (const w of whenClauses) {
                descParts.push(`${w.type} → ${w.action}`);
            }
            if (updateCols.length > 0) { descParts.push(`SET: ${updateCols.join(', ')}`); }
            if (insertCols.length > 0) { descParts.push(`INSERT: ${insertCols.join(', ')}`); }
            const description = descParts.join(' | ');

            const mergeNodeId = genId('merge');
            nodes.push({
                id: mergeNodeId,
                type: 'result',
                label: `MERGE INTO ${targetTable}`,
                description,
                x: 100,
                y: nodes.length * 100,
                width: 200,
                height: 60,
                accessMode: 'write',
                operationType: 'MERGE',
            });

            const sourceNode = nodes.find(n => n.label === sourceTable);
            const targetNode = nodes.find(n => n.label === targetTable);

            // Both source and target flow INTO the MERGE node
            if (targetNode) {
                edges.push({
                    id: genId('edge'),
                    source: targetNode.id,
                    target: mergeNodeId,
                    sqlClause: 'INTO',
                    clauseType: 'merge_target',
                });
            }

            if (sourceNode) {
                edges.push({
                    id: genId('edge'),
                    source: sourceNode.id,
                    target: mergeNodeId,
                    sqlClause: 'USING',
                    clauseType: 'merge_source',
                });
            }
        }

        if (dialect === 'PostgreSQL') {
            hints.push({
                type: 'info',
                message: 'MERGE statement detected (using fallback parser)',
                suggestion: 'Consider using INSERT ... ON CONFLICT DO UPDATE for PostgreSQL upserts, which is more widely supported.',
                category: 'best-practice',
                severity: 'low',
            });
        } else if (dialect === 'MySQL') {
            hints.push({
                type: 'info',
                message: 'MERGE statement detected (using fallback parser)',
                suggestion: 'Consider using INSERT ... ON DUPLICATE KEY UPDATE for MySQL upserts, which is more widely supported.',
                category: 'best-practice',
                severity: 'low',
            });
        } else if (dialect === 'TransactSQL') {
            hints.push({
                type: 'info',
                message: 'MERGE statement detected (using fallback parser)',
                suggestion: 'MERGE is fully supported in TransactSQL. This visualization is approximate due to parse limitations.',
                category: 'best-practice',
                severity: 'low',
            });
        } else {
            hints.push({
                type: 'info',
                message: 'MERGE statement detected (using fallback parser)',
                suggestion: 'MERGE syntax varies by dialect. This visualization shows approximate table relationships.',
                category: 'best-practice',
                severity: 'low',
            });
        }
    }
    else if (upperSql.startsWith('CREATE')) { statementType = 'CREATE'; }
    else if (upperSql.startsWith('ALTER')) { statementType = 'ALTER'; }
    else if (upperSql.startsWith('DROP')) { statementType = 'DROP'; }

    const stats: QueryStats = {
        tables: tableNames.size,
        joins: edges.length,
        subqueries: (commentStripped.match(/\(\s*SELECT\b/gi) || []).length,
        ctes: cteNames.size,
        aggregations: (commentStripped.match(/\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT)\b/gi) || []).length,
        windowFunctions: (commentStripped.match(/\bOVER\s*\(/gi) || []).length,
        unions: (commentStripped.match(/\bUNION\b/gi) || []).length,
        conditions: (commentStripped.match(/\bWHERE\b/gi) || []).length + (commentStripped.match(/\bHAVING\b/gi) || []).length,
        complexity: 'Simple',
        complexityScore: tableNames.size * 1 + edges.length * 3,
    };

    if (stats.complexityScore >= 30) { stats.complexity = 'Very Complex'; }
    else if (stats.complexityScore >= 15) { stats.complexity = 'Complex'; }
    else if (stats.complexityScore >= 5) { stats.complexity = 'Moderate'; }

    hints.push({
        type: 'warning',
        message: 'Partial visualization - SQL parser could not parse this query',
        suggestion: `Showing best-effort approximation with ${tableNames.size} table(s) detected. This query may use syntax not supported by the ${dialect} dialect parser.`,
        category: 'best-practice',
        severity: 'medium',
    });

    const validEdges = edges.filter(e => e.source && e.target);
    return {
        nodes,
        edges: validEdges,
        stats,
        hints,
        sql,
        columnLineage: [],
        tableUsage: new Map(),
        partial: true,
    };
}
