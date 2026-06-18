import type { FlowNode } from '../../types';
import type { ParserContext } from '../context';
import { escapeRegex, stripSqlComments } from '../../../shared';
import { maskStringsAndComments } from '../dialects/preprocessing';

/** Extract the bare CTE name from a label like "WITH foo" or "WITH RECURSIVE foo" */
function extractCteName(label: string): string {
    let name = label.toLowerCase();
    if (name.startsWith('with recursive ')) {
        name = name.substring('with recursive '.length).trim();
    } else if (name.startsWith('with ')) {
        name = name.substring('with '.length).trim();
    }
    return name;
}

function findNodeById(nodes: FlowNode[], id: string): FlowNode | undefined {
    for (const node of nodes) {
        if (node.id === id) {
            return node;
        }
        if (node.children) {
            const child = findNodeById(node.children, id);
            if (child) {
                return child;
            }
        }
    }
    return undefined;
}

function collectSelectNodes(nodes: FlowNode[]): FlowNode[] {
    const selectNodes: FlowNode[] = [];
    const seen = new Set<string>();

    function collect(nodeList: FlowNode[]): void {
        for (const node of nodeList) {
            if (node.type === 'select' && node.columns && !seen.has(node.id)) {
                selectNodes.push(node);
                seen.add(node.id);
            }
            if (node.children) {
                collect(node.children);
            }
        }
    }

    collect(nodes);
    return selectNodes;
}

function extractCteBodyScope(fullNormalizedSql: string, cteName: string): { bodySql: string; downstreamSql: string } | null {
    const maskedSql = maskStringsAndComments(fullNormalizedSql);
    const ctePattern = new RegExp(`\\b${escapeRegex(cteName)}\\b\\s+as\\s*\\(`, 'i');
    const cteMatch = ctePattern.exec(maskedSql);
    if (!cteMatch) {
        return null;
    }

    const bodyStart = cteMatch.index + cteMatch[0].length;
    let depth = 1;
    let bodyEnd = bodyStart;
    for (let ci = bodyStart; ci < fullNormalizedSql.length && depth > 0; ci++) {
        if (maskedSql[ci] === '(') { depth++; }
        else if (maskedSql[ci] === ')') { depth--; }
        if (depth === 0) { bodyEnd = ci; }
    }
    if (depth !== 0) {
        return null;
    }

    let normalizedSql = fullNormalizedSql;
    normalizedSql = fullNormalizedSql.substring(bodyStart, bodyEnd).trim();

    return {
        bodySql: normalizedSql,
        downstreamSql: `${fullNormalizedSql.substring(0, bodyStart)} ${fullNormalizedSql.substring(bodyEnd + 1)}`.trim()
    };
}

const SQL_ALIAS_STOP_WORDS = new Set([
    'on', 'where', 'group', 'having', 'order', 'limit', 'join', 'inner', 'left',
    'right', 'full', 'cross', 'natural', 'union', 'intersect', 'except'
]);

function collectCteReferenceQualifiers(sql: string, cteName: string): string[] {
    const qualifiers = new Set<string>();
    const referencePattern = new RegExp(`\\b(?:from|join)\\s+${escapeRegex(cteName)}\\b(?:\\s+(?:as\\s+)?([a-z_][\\w$]*))?`, 'gi');
    let match: RegExpExecArray | null;

    while ((match = referencePattern.exec(sql)) !== null) {
        qualifiers.add(cteName.toLowerCase());
        const alias = match[1]?.toLowerCase();
        if (alias && !SQL_ALIAS_STOP_WORDS.has(alias)) {
            qualifiers.add(alias);
        }
    }

    return Array.from(qualifiers);
}

function containsColumnReference(text: string, columnName: string, qualifiers?: string[]): boolean {
    const escapedColName = escapeRegex(columnName);

    if (qualifiers && qualifiers.length > 0) {
        for (const qualifier of qualifiers) {
            const qualifiedPattern = new RegExp(`\\b${escapeRegex(qualifier)}\\s*\\.\\s*${escapedColName}\\b`, 'i');
            if (qualifiedPattern.test(text)) {
                return true;
            }
        }

        const withoutQualifiedRefs = text.replace(/\b[a-z_][\w$]*\s*\.\s*[a-z_][\w$]*\b/gi, ' ');
        return new RegExp(`\\b${escapedColName}\\b`, 'i').test(withoutQualifiedRefs);
    }

    return new RegExp(`\\b${escapedColName}\\b`, 'i').test(text);
}

function selectClauseHasStar(selectClause: string, qualifiers?: string[]): boolean {
    if (/(^|,)\s*\*(?:\s*,|\s*$)/.test(selectClause)) {
        return true;
    }

    return Boolean(qualifiers?.some(qualifier => {
        const qualifiedStarPattern = new RegExp(`\\b${escapeRegex(qualifier)}\\s*\\.\\s*\\*\\b`, 'i');
        return qualifiedStarPattern.test(selectClause);
    }));
}

function isColumnUsedInSql(sql: string, columnNames: string[], options: { includeSelectClause?: boolean; qualifiers?: string[] } = {}): boolean {
    if (!sql) {
        return false;
    }

    const sqlLower = sql.toLowerCase();

    for (const nameToCheck of columnNames) {
        if (options.includeSelectClause) {
            const selectClauseMatch = sqlLower.match(/\bselect\b\s+(.+?)\s+\bfrom\b/i);
            if (selectClauseMatch) {
                if (selectClauseHasStar(selectClauseMatch[1], options.qualifiers)) {
                    return true;
                }
                if (containsColumnReference(selectClauseMatch[1], nameToCheck, options.qualifiers)) {
                    return true;
                }
            }
        }

        // Check WHERE clause: extract text between WHERE and next clause keyword
        const whereMatch = sqlLower.match(/\bwhere\b\s+(.+?)(?:\s+(?:order|group|having|limit)\s+by|\s+limit|\s*;|\s*$)/i);
        if (whereMatch && containsColumnReference(whereMatch[1], nameToCheck, options.qualifiers)) {
            return true;
        }

        // Check ORDER BY clause: extract text between ORDER BY and LIMIT/end
        const orderByMatch = sqlLower.match(/\border\s+by\b\s+(.+?)(?:\s+limit|\s*;|\s*$)/i);
        if (orderByMatch && containsColumnReference(orderByMatch[1], nameToCheck, options.qualifiers)) {
            return true;
        }

        // Check GROUP BY clause: extract text between GROUP BY and HAVING/ORDER BY/LIMIT/end
        const groupByMatch = sqlLower.match(/\bgroup\s+by\b\s+(.+?)(?:\s+(?:having|order|limit)|\s*;|\s*$)/i);
        if (groupByMatch && containsColumnReference(groupByMatch[1], nameToCheck, options.qualifiers)) {
            return true;
        }

        // Check HAVING clause: extract text between HAVING and ORDER BY/LIMIT/end
        const havingMatch = sqlLower.match(/\bhaving\b\s+(.+?)(?:\s+(?:order|limit)|\s*;|\s*$)/i);
        if (havingMatch && containsColumnReference(havingMatch[1], nameToCheck, options.qualifiers)) {
            return true;
        }

        // Check JOIN ON clauses: find all "JOIN table ON condition" patterns
        // and check if column appears in the ON condition
        const joinOnPattern = /\bjoin\b\s+\w+(?:\s+\w+)?\s+\bon\b\s+(.+?)(?:\s+(?:join|where|group|having|order|limit)|\s*;|\s*$)/gi;
        let joinMatch: RegExpExecArray | null;
        while ((joinMatch = joinOnPattern.exec(sqlLower)) !== null) {
            if (containsColumnReference(joinMatch[1], nameToCheck, options.qualifiers)) {
                return true;
            }
        }
    }

    return false;
}

export function detectAdvancedIssues(context: ParserContext, nodes: FlowNode[], sql: string): void {
    // Detect unused CTEs
    // Fix: Properly match CTE names by removing "WITH " prefix and checking all table references
    const cteNodes = nodes.filter(n => n.type === 'cte');
    const referencedCTEs = new Set<string>();
    
    // Build a set of all CTE names (without "WITH " / "WITH RECURSIVE " prefix for accurate matching)
    const allCteNames = new Set<string>();
    cteNodes.forEach(cteNode => {
        const cteName = extractCteName(cteNode.label);
        allCteNames.add(cteName);
    });

    // Track which CTEs are actually referenced in the query
    // Check all table nodes AND join nodes (including those nested inside CTE children)
    function collectCteReferences(nodeList: FlowNode[]): void {
        for (const node of nodeList) {
            if (node.type === 'table') {
                const tableName = node.label.toLowerCase().trim();
                if (allCteNames.has(tableName)) {
                    referencedCTEs.add(tableName);
                }
                if (node.tableCategory === 'cte_reference') {
                    referencedCTEs.add(tableName);
                }
            }
            // Inside CTE children, join nodes have labels like "JOIN table_name" or "LEFT JOIN table_name"
            // Extract the table name from the join label to check for CTE references
            if (node.type === 'join') {
                const joinLabel = node.label.toLowerCase().trim();
                // Extract table name: last word after JOIN keyword(s)
                const parts = joinLabel.split(/\s+/);
                if (parts.length >= 2) {
                    const joinedTable = parts[parts.length - 1];
                    if (allCteNames.has(joinedTable)) {
                        referencedCTEs.add(joinedTable);
                    }
                }
            }
            // Recurse into CTE/subquery children to find nested references
            if (node.children && node.children.length > 0) {
                collectCteReferences(node.children);
            }
        }
    }
    collectCteReferences(nodes);

    cteNodes.forEach(cteNode => {
        const cteName = extractCteName(cteNode.label);
        
        if (!referencedCTEs.has(cteName)) {
            // CTE is defined but never used
            if (!cteNode.warnings) {cteNode.warnings = [];}
            cteNode.warnings.push({
                type: 'unused',
                severity: 'medium',
                message: 'This CTE is never referenced in the query'
            });

            context.hints.push({
                type: 'warning',
                message: `Unused CTE: "${cteNode.label}"`,
                suggestion: 'Remove this CTE as it is not used anywhere in the query',
                category: 'quality',
                nodeId: cteNode.id,
                severity: 'medium'
            });
        }
    });

    // ============================================================
    // Phase 2 Feature: Duplicate Subquery Detection
    // ============================================================
    // Detects duplicate or similar subqueries that could be extracted to CTEs
    // for better maintainability and performance.
    //
    // Detection Strategy:
    // 1. Collect FROM subqueries (already have nodes in the graph)
    // 2. Extract subqueries from WHERE/SELECT/HAVING clauses using SQL parsing
    // 3. Normalize subqueries for comparison (remove whitespace, aliases)
    // 4. Group by similarity (same FROM table, same aggregate, same WHERE presence)
    // 5. Add warnings to nodes and hints to the hints panel
    // ============================================================
    
    interface SubqueryMatch {
        sql: string;           // The subquery SQL
        normalized: string;    // Normalized signature for comparison
        location: 'from' | 'where' | 'select' | 'having';
        node?: FlowNode;       // For FROM subqueries that have nodes
        parentNodeId?: string; // For WHERE/SELECT subqueries
    }
    
    const allSubqueries: SubqueryMatch[] = [];
    const sqlLower = sql.toLowerCase();
    
    // 1. Collect FROM subqueries (already have nodes)
    const subqueryNodes = nodes.filter(n => n.type === 'subquery');
    subqueryNodes.forEach(node => {
        const desc = (node.description || node.label || '').toLowerCase();
        if (desc) {
            // Create normalized signature
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
    
    // 2. Extract subqueries from SQL using balanced parentheses matching
    // This handles nested subqueries correctly by tracking parenthesis depth
    const extractSubquery = (sql: string, startIndex: number): { sql: string; endIndex: number } | null => {
        if (sql[startIndex] !== '(') {return null;}
        
        let depth = 0;
        let i = startIndex;
        const start = i + 1; // Skip opening (
        
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
    
    // Find all (SELECT ...) patterns
    let searchIndex = 0;
    
    while (searchIndex < sql.length) {
        // Look for SELECT keyword
        const selectPos = sqlLower.indexOf('select', searchIndex);
        if (selectPos === -1) {break;}
        
        // Check if it's inside parentheses (subquery)
        // Look backwards for opening parenthesis
        let parenPos = -1;
        for (let i = selectPos - 1; i >= 0 && i >= selectPos - 100; i--) {
            if (sql[i] === '(') {
                parenPos = i;
                break;
            }
            if (sql[i] === ')' || sql[i] === ';') {break;} // Not a subquery
        }
        
        if (parenPos >= 0) {
            const subquery = extractSubquery(sql, parenPos);
            if (subquery && subquery.sql.toLowerCase().includes('from')) {
                // Normalize: remove extra whitespace, lowercase, remove table aliases for comparison
                let normalized = subquery.sql.replace(/\s+/g, ' ').toLowerCase();
                // Remove table aliases (e.g., "orders o" -> "orders"), but not SQL keywords
                normalized = normalized.replace(/\b(from|join|,)\s+(\w+)\s+(?:as\s+)?(\w+)\b/g, (match, clause, table, alias) => {
                    const sqlKeywords = new Set(['inner', 'outer', 'left', 'right', 'full', 'cross', 'natural', 'join', 'on', 'where', 'group', 'order', 'having', 'limit', 'union', 'intersect', 'except', 'select', 'from', 'set', 'into', 'values']);
                    if (sqlKeywords.has(alias)) {
                        return match;
                    }
                    return `${clause} ${table}`;
                });
                
                // Determine location based on context
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
    
    // 3. Group subqueries by normalized signature for exact duplicate detection
    const subqueryGroups = new Map<string, SubqueryMatch[]>();
    allSubqueries.forEach(subq => {
        if (!subqueryGroups.has(subq.normalized)) {
            subqueryGroups.set(subq.normalized, []);
        }
        subqueryGroups.get(subq.normalized)!.push(subq);
    });
    
    // 4. Detect similar subqueries (not just identical)
    // Similarity criteria: same FROM table, same aggregate function, same WHERE presence
    const similarGroups: SubqueryMatch[][] = [];
    const processed = new Set<string>();
    
    allSubqueries.forEach((subq1, idx1) => {
        if (processed.has(subq1.normalized)) {return;}
        
        const similar: SubqueryMatch[] = [subq1];
        allSubqueries.forEach((subq2, idx2) => {
            if (idx1 >= idx2 || processed.has(subq2.normalized)) {return;}
            
            // Check if subqueries are similar (same FROM table and similar structure)
            const sig1 = subq1.normalized;
            const sig2 = subq2.normalized;
            
            // Extract key parts: FROM table and aggregate function
            const from1 = sig1.match(/from\s+(\w+)/);
            const from2 = sig2.match(/from\s+(\w+)/);
            const agg1 = sig1.match(/(avg|count|sum|max|min)\s*\(/);
            const agg2 = sig2.match(/(avg|count|sum|max|min)\s*\(/);
            const where1 = sig1.includes('where');
            const where2 = sig2.includes('where');
            
            // Consider similar if: same FROM table, same aggregate (or both have aggregates), both have WHERE
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
        context.hints.push({
            type: 'info',
            message: `${group.length} similar subqueries detected`,
            suggestion: 'Consider extracting to a CTE to avoid duplication and improve maintainability',
            category: 'quality',
            severity: 'low'
        });
    });
    
    // Also check exact matches (original logic)
    subqueryGroups.forEach((group, signature) => {
        // Only flag if we have 2+ identical subqueries and signature is meaningful (at least 15 chars)
        if (group.length > 1 && signature.length > 15 && !processed.has(signature)) {
            group.forEach(subq => {
                if (subq.node) {
                    // FROM subquery - has a node, add warning to it
                    if (!subq.node.warnings) {subq.node.warnings = [];}
                    subq.node.warnings.push({
                        type: 'complex',
                        severity: 'low',
                        message: `Similar subquery (${group.length} duplicates detected)`
                    });
                } else {
                    // WHERE/SELECT subquery - find the appropriate node to warn
                    let targetNode: FlowNode | undefined;
                    
                    if (subq.location === 'where' || subq.location === 'having') {
                        // Find WHERE or HAVING filter node
                        targetNode = nodes.find(n => 
                            n.type === 'filter' && 
                            n.label === (subq.location === 'having' ? 'HAVING' : 'WHERE')
                        );
                    } else if (subq.location === 'select') {
                        // Find SELECT node
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
            
            // Add hint
            context.hints.push({
                type: 'info',
                message: `${group.length} similar subqueries detected`,
                suggestion: 'Consider extracting to a CTE to avoid duplication and improve maintainability',
                category: 'quality',
                severity: 'low'
            });
        }
    });

    // ============================================================
    // Phase 2 Feature: Dead Column Detection
    // ============================================================
    // Detects columns that are selected but never used in WHERE/ORDER BY/
    // GROUP BY/HAVING/JOIN clauses. These "dead columns" add unnecessary
    // data transfer and reduce query clarity.
    //
    // Detection Strategy:
    // 1. Extract column names from SELECT node (from AST) and SQL string (fallback)
    // 2. For each column, check if it appears in WHERE/ORDER BY/GROUP BY/HAVING/JOIN clauses
    // 3. Use word boundary regex to ensure exact column name matches
    // 4. Add warnings to SELECT node and hints to the hints panel
    // ============================================================
    
    const selectNodes = collectSelectNodes(nodes);
    selectNodes.forEach(selectNode => {
        if (!selectNode.columns || selectNode.columns.length === 0) {return;}

        // Skip dead column detection for top-level SELECT nodes (final query output)
        // A SELECT with no parentId is a top-level query - all its columns are output columns
        // Dead column detection should only apply to intermediate SELECTs (CTEs/subqueries)
        // where columns might be selected but not used downstream
        if (!selectNode.parentId) {
            // This is a top-level SELECT - all columns are valid output, skip dead column detection
            return;
        }

        // Normalize SQL: remove comments, normalize whitespace for reliable matching
        const fullNormalizedSql = stripSqlComments(sql).replace(/\s+/g, ' ').trim();

        // Scope SQL to the relevant CTE/subquery body, but keep downstream
        // query text so CTE output columns selected later are not treated as dead.
        let normalizedSql = fullNormalizedSql;
        let downstreamSql = '';
        let downstreamQualifiers: string[] | undefined;
        if (selectNode.parentId) {
            const parentNode = findNodeById(nodes, selectNode.parentId);
            if (parentNode?.type === 'cte' && parentNode.label) {
                const cteName = extractCteName(parentNode.label);
                if (cteName) {
                    const cteScope = extractCteBodyScope(fullNormalizedSql, cteName);
                    if (cteScope) {
                        normalizedSql = cteScope.bodySql;
                        const cteQualifiers = collectCteReferenceQualifiers(cteScope.downstreamSql, cteName);
                        if (cteQualifiers.length > 0) {
                            downstreamSql = cteScope.downstreamSql;
                            downstreamQualifiers = cteQualifiers;
                        }
                    }
                }
            }
        }

        // Extract column names directly from SQL SELECT clause as fallback
        // This ensures we have the actual column names as they appear in SQL,
        // which may differ from AST-extracted names (handles aliases, expressions)
        const selectClauseMatch = normalizedSql.match(/select\s+(.+?)\s+from/i);
        const sqlColumnNamesMap = new Map<string, string[]>(); // column name -> [all variations]
        if (selectClauseMatch) {
            const selectClause = selectClauseMatch[1];
            // Split by comma, handling potential commas in expressions
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
                // Extract column name and alias
                // Pattern: "column_name" or "column_name AS alias" or "table.column" or just "column"
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
            // Build list of all possible column name variations to check
            const colNamesToCheck = new Set<string>();
            colNamesToCheck.add(colName);
            if (col.sourceColumn && col.sourceColumn !== colName) {
                colNamesToCheck.add(col.sourceColumn);
            }
            // Add SQL-extracted names that match this column
            const colNameLower = colName.toLowerCase();
            if (sqlColumnNamesMap.has(colNameLower)) {
                sqlColumnNamesMap.get(colNameLower)!.forEach(name => colNamesToCheck.add(name));
            }
            // Also check if any SQL column name matches (case-insensitive)
            sqlColumnNamesMap.forEach((names, key) => {
                if (key === colNameLower) {
                    names.forEach(name => colNamesToCheck.add(name));
                }
            });
            
            const colNames = Array.from(colNamesToCheck);
            let isUsed = isColumnUsedInSql(normalizedSql, colNames);
            if (!isUsed && downstreamSql) {
                isUsed = isColumnUsedInSql(downstreamSql, colNames, {
                    includeSelectClause: true,
                    qualifiers: downstreamQualifiers
                });
            }

            // If column is not used in any clause, it's a dead column
            if (!isUsed) {
                if (!selectNode.warnings) {selectNode.warnings = [];}
                selectNode.warnings.push({
                    type: 'dead-column',
                    severity: 'low',
                    message: `Column "${colName}" is not used in WHERE/ORDER BY/GROUP BY/HAVING/JOIN clauses`
                });
            }
        });
        
        // Add optimization hint to hints panel if dead columns are detected
        // This provides a summary in the hints panel for better visibility
        const deadColumns = selectNode.warnings?.filter(w => w.type === 'dead-column') || [];
        if (deadColumns.length > 0) {
            const deadColNames = deadColumns.map(w => {
                const match = w.message.match(/Column "([^"]+)"/);
                return match ? match[1] : '';
            }).filter(Boolean);
            
            context.hints.push({
                type: 'info',
                message: `${deadColumns.length} dead column${deadColumns.length > 1 ? 's' : ''} detected: ${deadColNames.slice(0, 3).join(', ')}${deadColNames.length > 3 ? ` and ${deadColNames.length - 3} more` : ''}`,
                suggestion: 'Remove unused columns from SELECT clause to improve query clarity and reduce data transfer',
                category: 'quality',
                nodeId: selectNode.id,
                severity: 'low'
            });
        }
    });

    // Detect repeated table scans
    const tableUsage = new Map<string, FlowNode[]>();
    nodes.filter(n => n.type === 'table' && (n.tableCategory === 'physical' || n.tableCategory === 'subquery_source')).forEach(node => {
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

            context.hints.push({
                type: 'warning',
                message: `Table "${tableName}" scanned ${usages.length} times`,
                suggestion: 'Consider using a CTE or subquery to scan the table once',
                category: 'performance',
                severity: 'medium'
            });
        }
    });
}

// Calculate enhanced complexity metrics
