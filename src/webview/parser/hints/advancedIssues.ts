import type { FlowNode } from '../../types';
import type { ParserContext } from '../context';
import { escapeRegex } from '../../../shared';

export function detectAdvancedIssues(context: ParserContext, nodes: FlowNode[], sql: string): void {
    // Detect unused CTEs
    // Fix: Properly match CTE names by removing "WITH " prefix and checking all table references
    const cteNodes = nodes.filter(n => n.type === 'cte');
    const referencedCTEs = new Set<string>();
    
    // Build a set of all CTE names (without "WITH " prefix for accurate matching)
    const allCteNames = new Set<string>();
    cteNodes.forEach(cteNode => {
        let cteName = cteNode.label.toLowerCase();
        if (cteName.startsWith('with ')) {
            cteName = cteName.substring(5).trim();
        }
        allCteNames.add(cteName);
    });

    // Track which CTEs are actually referenced in the query
    // Check all table nodes, not just those marked as cte_reference
    nodes.forEach(node => {
        if (node.type === 'table') {
            const tableName = node.label.toLowerCase().trim();
            // Check if this table name matches any CTE name
            if (allCteNames.has(tableName)) {
                referencedCTEs.add(tableName);
            }
            // Also check if it's marked as cte_reference (backup check)
            if (node.tableCategory === 'cte_reference') {
                referencedCTEs.add(tableName);
            }
        }
    });

    cteNodes.forEach(cteNode => {
        // Extract CTE name from label (remove "WITH " prefix if present)
        // This ensures accurate matching between CTE definitions and references
        let cteName = cteNode.label.toLowerCase();
        if (cteName.startsWith('with ')) {
            cteName = cteName.substring(5).trim();
        }
        
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
        let start = i + 1; // Skip opening (
        
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
                // Remove table aliases (e.g., "orders o" -> "orders")
                normalized = normalized.replace(/\b(\w+)\s+\w+\b/g, '$1');
                
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
    
    const selectNodes = nodes.filter(n => n.type === 'select' && n.columns);
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
        const normalizedSql = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').replace(/#[^\n]*/g, '').replace(/\s+/g, ' ').trim();
        const sqlLower = normalizedSql.toLowerCase();

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
            
            let isUsed = false;

            // Check if column is used in any query clause using SQL string analysis
            // This is more reliable than AST traversal for detecting column usage
            if (normalizedSql) {
                for (const nameToCheck of Array.from(colNamesToCheck)) {
                    if (isUsed) {break;}
                    
                    // Escape special regex characters to prevent regex injection
                    const escapedColName = escapeRegex(nameToCheck);
                    // Use word boundary pattern to ensure exact column name matches
                    // (prevents matching partial names like "order_id" matching "order")
                    const wordBoundaryPattern = new RegExp(`\\b${escapedColName}\\b`, 'i');
                    
                    // Check WHERE clause: extract text between WHERE and next clause keyword
                    const whereMatch = sqlLower.match(/\bwhere\b\s+(.+?)(?:\s+(?:order|group|having|limit)\s+by|\s+limit|\s*;|\s*$)/i);
                    if (whereMatch && wordBoundaryPattern.test(whereMatch[1])) {
                        isUsed = true;
                        break;
                    }
                    
                    // Check ORDER BY clause: extract text between ORDER BY and LIMIT/end
                    const orderByMatch = sqlLower.match(/\border\s+by\b\s+(.+?)(?:\s+limit|\s*;|\s*$)/i);
                    if (orderByMatch && wordBoundaryPattern.test(orderByMatch[1])) {
                        isUsed = true;
                        break;
                    }
                    
                    // Check GROUP BY clause: extract text between GROUP BY and HAVING/ORDER BY/LIMIT/end
                    const groupByMatch = sqlLower.match(/\bgroup\s+by\b\s+(.+?)(?:\s+(?:having|order|limit)|\s*;|\s*$)/i);
                    if (groupByMatch && wordBoundaryPattern.test(groupByMatch[1])) {
                        isUsed = true;
                        break;
                    }
                    
                    // Check HAVING clause: extract text between HAVING and ORDER BY/LIMIT/end
                    const havingMatch = sqlLower.match(/\bhaving\b\s+(.+?)(?:\s+(?:order|limit)|\s*;|\s*$)/i);
                    if (havingMatch && wordBoundaryPattern.test(havingMatch[1])) {
                        isUsed = true;
                        break;
                    }
                    
                    // Check JOIN ON clauses: find all "JOIN table ON condition" patterns
                    // and check if column appears in the ON condition
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
