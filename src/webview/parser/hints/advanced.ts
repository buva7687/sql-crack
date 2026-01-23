// Advanced SQL quality checks - unused CTEs, dead columns, duplicate subqueries

import { FlowNode, FlowEdge } from '../../types';
import { addHint } from '../state';

interface SubqueryMatch {
    sql: string;
    normalized: string;
    location: 'from' | 'where' | 'select' | 'having';
    node?: FlowNode;
    parentNodeId?: string;
}

export function detectAdvancedIssues(nodes: FlowNode[], edges: FlowEdge[], sql: string): void {
    detectUnusedCTEs(nodes);
    detectDuplicateSubqueries(nodes, sql);
    detectDeadColumns(nodes, sql);
    detectRepeatedTableScans(nodes);
}

function detectUnusedCTEs(nodes: FlowNode[]): void {
    const cteNodes = nodes.filter(n => n.type === 'cte');
    const referencedCTEs = new Set<string>();

    const allCteNames = new Set<string>();
    cteNodes.forEach(cteNode => {
        let cteName = cteNode.label.toLowerCase();
        if (cteName.startsWith('with ')) {
            cteName = cteName.substring(5).trim();
        }
        allCteNames.add(cteName);
    });

    nodes.forEach(node => {
        if (node.type === 'table') {
            const tableName = node.label.toLowerCase().trim();
            if (allCteNames.has(tableName)) {
                referencedCTEs.add(tableName);
            }
            if (node.tableCategory === 'cte_reference') {
                referencedCTEs.add(tableName);
            }
        }
    });

    cteNodes.forEach(cteNode => {
        let cteName = cteNode.label.toLowerCase();
        if (cteName.startsWith('with ')) {
            cteName = cteName.substring(5).trim();
        }

        if (!referencedCTEs.has(cteName)) {
            if (!cteNode.warnings) {cteNode.warnings = [];}
            cteNode.warnings.push({
                type: 'unused',
                severity: 'medium',
                message: 'This CTE is never referenced in the query'
            });

            addHint({
                type: 'warning',
                message: `Unused CTE: "${cteNode.label}"`,
                suggestion: 'Remove this CTE as it is not used anywhere in the query',
                category: 'quality',
                nodeId: cteNode.id,
                severity: 'medium'
            });
        }
    });
}

function detectDuplicateSubqueries(nodes: FlowNode[], sql: string): void {
    const allSubqueries: SubqueryMatch[] = [];
    const sqlLower = sql.toLowerCase();

    // Collect FROM subqueries
    const subqueryNodes = nodes.filter(n => n.type === 'subquery');
    subqueryNodes.forEach(node => {
        const desc = (node.description || node.label || '').toLowerCase();
        if (desc) {
            const normalized = desc.replace(/\s+/g, ' ').trim();
            allSubqueries.push({
                sql: desc,
                normalized: normalized,
                location: 'from',
                node: node,
                parentNodeId: node.parentId
            });
        }
    });

    // Extract subqueries from SQL
    const extractSubquery = (sql: string, startIndex: number): { sql: string; endIndex: number } | null => {
        if (sql[startIndex] !== '(') {return null;}

        let depth = 0;
        let i = startIndex;
        let start = i + 1;

        while (i < sql.length) {
            if (sql[i] === '(') {depth++;}
            if (sql[i] === ')') {
                depth--;
                if (depth === 0) {
                    return {
                        sql: sql.substring(start, i).trim(),
                        endIndex: i
                    };
                }
            }
            i++;
        }
        return null;
    };

    let searchIndex = 0;
    while (searchIndex < sql.length) {
        const selectPos = sqlLower.indexOf('select', searchIndex);
        if (selectPos === -1) {break;}

        let parenPos = -1;
        for (let i = selectPos - 1; i >= 0 && i >= selectPos - 100; i--) {
            if (sql[i] === '(') {
                parenPos = i;
                break;
            }
            if (sql[i] === ')' || sql[i] === ';') {break;}
        }

        if (parenPos >= 0) {
            const subquery = extractSubquery(sql, parenPos);
            if (subquery && subquery.sql.toLowerCase().includes('from')) {
                let normalized = subquery.sql.replace(/\s+/g, ' ').toLowerCase();
                normalized = normalized.replace(/\b(\w+)\s+\w+\b/g, '$1');

                const beforeMatch = sql.substring(Math.max(0, parenPos - 100), parenPos).toLowerCase();
                let location: 'where' | 'select' | 'having' = 'where';
                if (beforeMatch.includes('select') && !beforeMatch.includes('where') && !beforeMatch.includes('having') && !beforeMatch.includes('from')) {
                    location = 'select';
                } else if (beforeMatch.includes('having')) {
                    location = 'having';
                }

                allSubqueries.push({
                    sql: subquery.sql,
                    normalized: normalized,
                    location: location
                });

                searchIndex = subquery.endIndex + 1;
            } else {
                searchIndex = selectPos + 6;
            }
        } else {
            searchIndex = selectPos + 6;
        }
    }

    // Group by normalized signature
    const subqueryGroups = new Map<string, SubqueryMatch[]>();
    allSubqueries.forEach(subq => {
        if (!subqueryGroups.has(subq.normalized)) {
            subqueryGroups.set(subq.normalized, []);
        }
        subqueryGroups.get(subq.normalized)!.push(subq);
    });

    // Detect similar subqueries
    const similarGroups: SubqueryMatch[][] = [];
    const processed = new Set<string>();

    allSubqueries.forEach((subq1, idx1) => {
        if (processed.has(subq1.normalized)) {return;}

        const similar: SubqueryMatch[] = [subq1];
        allSubqueries.forEach((subq2, idx2) => {
            if (idx1 >= idx2 || processed.has(subq2.normalized)) {return;}

            const sig1 = subq1.normalized;
            const sig2 = subq2.normalized;

            const from1 = sig1.match(/from\s+(\w+)/);
            const from2 = sig2.match(/from\s+(\w+)/);
            const agg1 = sig1.match(/(avg|count|sum|max|min)\s*\(/);
            const agg2 = sig2.match(/(avg|count|sum|max|min)\s*\(/);
            const where1 = sig1.includes('where');
            const where2 = sig2.includes('where');

            if (from1 && from2 && from1[1] === from2[1] &&
                where1 === where2 &&
                (agg1 && agg2 && agg1[1] === agg2[1] || (!agg1 && !agg2))) {
                similar.push(subq2);
                processed.add(subq2.normalized);
            }
        });

        if (similar.length > 1) {
            similarGroups.push(similar);
            processed.add(subq1.normalized);
        }
    });

    // Add warnings for similar groups
    similarGroups.forEach(group => {
        group.forEach(subq => {
            if (subq.node) {
                if (!subq.node.warnings) {subq.node.warnings = [];}
                subq.node.warnings.push({
                    type: 'complex',
                    severity: 'low',
                    message: `Similar subquery (${group.length} duplicates detected)`
                });
            } else {
                let targetNode: FlowNode | undefined;
                if (subq.location === 'where' || subq.location === 'having') {
                    targetNode = nodes.find(n =>
                        n.type === 'filter' &&
                        n.label === (subq.location === 'having' ? 'HAVING' : 'WHERE')
                    );
                } else if (subq.location === 'select') {
                    targetNode = nodes.find(n => n.type === 'select');
                }

                if (targetNode) {
                    if (!targetNode.warnings) {targetNode.warnings = [];}
                    targetNode.warnings.push({
                        type: 'complex',
                        severity: 'low',
                        message: `Duplicate subquery in ${subq.location.toUpperCase()} (${group.length} similar found)`
                    });
                }
            }
        });

        addHint({
            type: 'info',
            message: `${group.length} similar subqueries detected`,
            suggestion: 'Consider extracting to a CTE to avoid duplication and improve maintainability',
            category: 'quality',
            severity: 'low'
        });
    });

    // Check exact matches
    subqueryGroups.forEach((group, signature) => {
        if (group.length > 1 && signature.length > 15 && !processed.has(signature)) {
            group.forEach(subq => {
                if (subq.node) {
                    if (!subq.node.warnings) {subq.node.warnings = [];}
                    subq.node.warnings.push({
                        type: 'complex',
                        severity: 'low',
                        message: `Similar subquery (${group.length} duplicates detected)`
                    });
                } else {
                    let targetNode: FlowNode | undefined;
                    if (subq.location === 'where' || subq.location === 'having') {
                        targetNode = nodes.find(n =>
                            n.type === 'filter' &&
                            n.label === (subq.location === 'having' ? 'HAVING' : 'WHERE')
                        );
                    } else if (subq.location === 'select') {
                        targetNode = nodes.find(n => n.type === 'select');
                    }

                    if (targetNode) {
                        if (!targetNode.warnings) {targetNode.warnings = [];}
                        targetNode.warnings.push({
                            type: 'complex',
                            severity: 'low',
                            message: `Duplicate subquery in ${subq.location.toUpperCase()} (${group.length} similar found)`
                        });
                    }
                }
            });

            addHint({
                type: 'info',
                message: `${group.length} similar subqueries detected`,
                suggestion: 'Consider extracting to a CTE to avoid duplication and improve maintainability',
                category: 'quality',
                severity: 'low'
            });
        }
    });
}

function detectDeadColumns(nodes: FlowNode[], sql: string): void {
    const selectNodes = nodes.filter(n => n.type === 'select' && n.columns);
    selectNodes.forEach(selectNode => {
        if (!selectNode.columns || selectNode.columns.length === 0) {return;}

        // Skip top-level SELECT nodes
        if (!selectNode.parentId) {
            return;
        }

        const normalizedSql = sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
        const sqlLower = normalizedSql.toLowerCase();

        // Extract column names from SQL
        const selectClauseMatch = normalizedSql.match(/select\s+(.+?)\s+from/i);
        const sqlColumnNamesMap = new Map<string, string[]>();
        if (selectClauseMatch) {
            const selectClause = selectClauseMatch[1];
            const columnParts: string[] = [];
            let current = '';
            let parenDepth = 0;
            for (let i = 0; i < selectClause.length; i++) {
                const char = selectClause[i];
                if (char === '(') {parenDepth++;}
                else if (char === ')') {parenDepth--;}
                else if (char === ',' && parenDepth === 0) {
                    columnParts.push(current.trim());
                    current = '';
                    continue;
                }
                current += char;
            }
            if (current.trim()) {columnParts.push(current.trim());}

            columnParts.forEach(part => {
                const trimmed = part.trim();
                const aliasMatch = trimmed.match(/\s+as\s+(\w+)$/i);
                const columnMatch = trimmed.match(/(?:^|\s)(\w+)(?:\s|$)/);

                if (aliasMatch) {
                    const alias = aliasMatch[1];
                    const colName = columnMatch ? columnMatch[1] : null;
                    if (colName && colName !== alias) {
                        sqlColumnNamesMap.set(alias.toLowerCase(), [alias, colName]);
                    } else {
                        sqlColumnNamesMap.set(alias.toLowerCase(), [alias]);
                    }
                } else if (columnMatch) {
                    const colName = columnMatch[1];
                    sqlColumnNamesMap.set(colName.toLowerCase(), [colName]);
                }
            });
        }

        selectNode.columns.forEach(col => {
            const colName = col.name;
            const colNamesToCheck = new Set<string>();
            colNamesToCheck.add(colName);
            if (col.sourceColumn && col.sourceColumn !== colName) {
                colNamesToCheck.add(col.sourceColumn);
            }
            const colNameLower = colName.toLowerCase();
            if (sqlColumnNamesMap.has(colNameLower)) {
                sqlColumnNamesMap.get(colNameLower)!.forEach(name => colNamesToCheck.add(name));
            }
            sqlColumnNamesMap.forEach((names, key) => {
                if (key === colNameLower) {
                    names.forEach(name => colNamesToCheck.add(name));
                }
            });

            let isUsed = false;

            if (normalizedSql) {
                for (const nameToCheck of Array.from(colNamesToCheck)) {
                    if (isUsed) {break;}

                    const escapedColName = nameToCheck.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const wordBoundaryPattern = new RegExp(`\\b${escapedColName}\\b`, 'i');

                    const whereMatch = sqlLower.match(/\bwhere\b\s+(.+?)(?:\s+(?:order|group|having|limit)\s+by|\s+limit|\s*;|\s*$)/i);
                    if (whereMatch && wordBoundaryPattern.test(whereMatch[1])) {
                        isUsed = true;
                        break;
                    }

                    const orderByMatch = sqlLower.match(/\border\s+by\b\s+(.+?)(?:\s+limit|\s*;|\s*$)/i);
                    if (orderByMatch && wordBoundaryPattern.test(orderByMatch[1])) {
                        isUsed = true;
                        break;
                    }

                    const groupByMatch = sqlLower.match(/\bgroup\s+by\b\s+(.+?)(?:\s+(?:having|order|limit)|\s*;|\s*$)/i);
                    if (groupByMatch && wordBoundaryPattern.test(groupByMatch[1])) {
                        isUsed = true;
                        break;
                    }

                    const havingMatch = sqlLower.match(/\bhaving\b\s+(.+?)(?:\s+(?:order|limit)|\s*;|\s*$)/i);
                    if (havingMatch && wordBoundaryPattern.test(havingMatch[1])) {
                        isUsed = true;
                        break;
                    }

                    const joinOnPattern = /\bjoin\b\s+\w+(?:\s+\w+)?\s+\bon\b\s+(.+?)(?:\s+(?:join|where|group|having|order|limit)|\s*;|\s*$)/gi;
                    let joinMatch;
                    while ((joinMatch = joinOnPattern.exec(sqlLower)) !== null) {
                        if (wordBoundaryPattern.test(joinMatch[1])) {
                            isUsed = true;
                            break;
                        }
                    }
                    if (isUsed) {break;}
                }
            }

            if (!isUsed) {
                if (!selectNode.warnings) {selectNode.warnings = [];}
                selectNode.warnings.push({
                    type: 'dead-column',
                    severity: 'low',
                    message: `Column "${colName}" is not used in WHERE/ORDER BY/GROUP BY/HAVING/JOIN clauses`
                });
            }
        });

        const deadColumns = selectNode.warnings?.filter(w => w.type === 'dead-column') || [];
        if (deadColumns.length > 0) {
            const deadColNames = deadColumns.map(w => {
                const match = w.message.match(/Column "([^"]+)"/);
                return match ? match[1] : '';
            }).filter(Boolean);

            addHint({
                type: 'info',
                message: `${deadColumns.length} dead column${deadColumns.length > 1 ? 's' : ''} detected: ${deadColNames.slice(0, 3).join(', ')}${deadColNames.length > 3 ? ` and ${deadColNames.length - 3} more` : ''}`,
                suggestion: 'Remove unused columns from SELECT clause to improve query clarity and reduce data transfer',
                category: 'quality',
                nodeId: selectNode.id,
                severity: 'low'
            });
        }
    });
}

function detectRepeatedTableScans(nodes: FlowNode[]): void {
    const tableUsage = new Map<string, FlowNode[]>();
    nodes.filter(n => n.type === 'table' && n.tableCategory === 'physical').forEach(node => {
        const tableName = node.label.toLowerCase();
        if (!tableUsage.has(tableName)) {
            tableUsage.set(tableName, []);
        }
        tableUsage.get(tableName)!.push(node);
    });

    tableUsage.forEach((usages, tableName) => {
        if (usages.length > 1) {
            usages.forEach(node => {
                if (!node.warnings) {node.warnings = [];}
                node.warnings.push({
                    type: 'repeated-scan',
                    severity: 'medium',
                    message: `Table "${tableName}" is scanned ${usages.length} times`
                });
            });

            addHint({
                type: 'warning',
                message: `Table "${tableName}" scanned ${usages.length} times`,
                suggestion: 'Consider using a CTE or subquery to scan the table once',
                category: 'performance',
                severity: 'medium'
            });
        }
    });
}
