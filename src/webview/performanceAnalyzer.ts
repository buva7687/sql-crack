import { FlowNode, FlowEdge, OptimizationHint } from './sqlParser';

export interface IndexSuggestion {
    columns: string[];
    indexType: 'btree' | 'hash' | 'composite';
    reason: 'filter' | 'join' | 'sort' | 'group';
    message: string;
    suggestion: string;
}

export interface RefactoringHint extends OptimizationHint {
    refactoringType: 'subquery-to-join' | 'self-join-to-window' | 'cte-extraction';
    originalPattern: string;
    suggestedPattern: string;
}

export interface PerformanceAnalysisResult {
    hints: OptimizationHint[];
    indexSuggestions: IndexSuggestion[];
    refactoringOpportunities: RefactoringHint[];
}

// Helper function to extract column references from an expression
function extractColumnReferences(expr: any): string[] {
    const columns: string[] = [];
    
    if (!expr) return columns;
    
    if (typeof expr === 'string') {
        // Simple column reference
        columns.push(expr);
    } else if (expr.type === 'column_ref') {
        columns.push(expr.column || expr.table + '.' + expr.column);
    } else if (expr.type === 'binary_expr') {
        // Recursively extract from left and right
        columns.push(...extractColumnReferences(expr.left));
        columns.push(...extractColumnReferences(expr.right));
    } else if (expr.type === 'function') {
        // Extract from function arguments
        if (expr.args && Array.isArray(expr.args)) {
            expr.args.forEach((arg: any) => {
                columns.push(...extractColumnReferences(arg));
            });
        }
    } else if (expr.expr) {
        columns.push(...extractColumnReferences(expr.expr));
    } else if (expr.left) {
        columns.push(...extractColumnReferences(expr.left));
    } else if (expr.right) {
        columns.push(...extractColumnReferences(expr.right));
    }
    
    return columns;
}

// Helper function to extract table name from a column reference
function getTableFromColumn(columnRef: string): string | null {
    if (columnRef.includes('.')) {
        return columnRef.split('.')[0];
    }
    return null;
}

// Helper function to check if a condition uses aggregates
function hasAggregateFunctions(expr: any): boolean {
    if (!expr) return false;
    
    if (expr.type === 'aggr_func') {
        return true;
    }
    
    if (expr.left && hasAggregateFunctions(expr.left)) return true;
    if (expr.right && hasAggregateFunctions(expr.right)) return true;
    if (expr.expr && hasAggregateFunctions(expr.expr)) return true;
    if (expr.args && Array.isArray(expr.args)) {
        return expr.args.some((arg: any) => hasAggregateFunctions(arg));
    }
    
    return false;
}

// Helper function to find nodes by type
function findNodesByType(nodes: FlowNode[], type: FlowNode['type']): FlowNode[] {
    return nodes.filter(n => n.type === type);
}

// Helper function to trace lineage from a filter node to source tables
function traceFilterLineage(filterNode: FlowNode, nodes: FlowNode[], edges: FlowEdge[]): string[] {
    const sourceTables: string[] = [];
    const visited = new Set<string>();
    
    function traverse(nodeId: string) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        if (node.type === 'table') {
            sourceTables.push(node.label);
            return;
        }
        
        // Find incoming edges
        const incomingEdges = edges.filter(e => e.target === nodeId);
        incomingEdges.forEach(edge => {
            traverse(edge.source);
        });
    }
    
    traverse(filterNode.id);
    return sourceTables;
}

// 1. Filter Pushdown Detection
function detectFilterPushdownOpportunities(
    ast: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    hints: OptimizationHint[]
): void {
    const filterNodes = findNodesByType(nodes, 'filter');
    
    filterNodes.forEach(filterNode => {
        // Check if filter is after a JOIN
        const incomingEdges = edges.filter(e => e.target === filterNode.id);
        const hasJoinBefore = incomingEdges.some(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            return sourceNode?.type === 'join';
        });
        
        if (hasJoinBefore && filterNode.details) {
            // Extract column references from filter details
            const filterText = filterNode.details.join(' ');
            const sourceTables = traceFilterLineage(filterNode, nodes, edges);
            
            // If filter only references one table but comes after JOIN, suggest pushdown
            if (sourceTables.length === 1) {
                hints.push({
                    type: 'warning',
                    message: `Filter on ${sourceTables[0]} could be applied before JOIN`,
                    suggestion: 'Move filter to a subquery or apply earlier in execution to reduce intermediate result size',
                    category: 'performance',
                    severity: 'medium',
                    nodeId: filterNode.id
                });
                
                // Add warning to the filter node
                if (!filterNode.warnings) filterNode.warnings = [];
                filterNode.warnings.push({
                    type: 'filter-pushdown',
                    severity: 'medium',
                    message: 'Filter could be pushed down before JOIN'
                });
            }
        }
    });
    
    // Check HAVING clauses for conditions that don't use aggregates
    if (ast.having) {
        const havingExpr = ast.having;
        if (!hasAggregateFunctions(havingExpr)) {
            hints.push({
                type: 'info',
                message: 'HAVING clause without aggregate functions',
                suggestion: 'Consider moving this condition to WHERE clause for better performance',
                category: 'performance',
                severity: 'medium'
            });
        }
    }
}

// 2. Join Order Optimization Hints
function analyzeJoinOrder(
    ast: any,
    nodes: FlowNode[],
    hints: OptimizationHint[]
): void {
    if (!ast.from || !Array.isArray(ast.from)) return;
    
    const joinNodes = findNodesByType(nodes, 'join');
    const tableNodes = findNodesByType(nodes, 'table');
    
    // Build a map of tables with filters
    const tablesWithFilters = new Set<string>();
    const filterNodes = findNodesByType(nodes, 'filter');
    
    filterNodes.forEach(filterNode => {
        if (filterNode.details) {
            const filterText = filterNode.details.join(' ').toLowerCase();
            tableNodes.forEach(tableNode => {
                const tableName = tableNode.label.toLowerCase();
                if (filterText.includes(tableName)) {
                    tablesWithFilters.add(tableName);
                }
            });
        }
    });
    
    // Check if unfiltered tables are joined before filtered tables
    let hasUnfilteredBeforeFiltered = false;
    let hasCrossJoinEarly = false;
    
    joinNodes.forEach((joinNode, index) => {
        // Check for CROSS JOINs appearing early
        if (joinNode.joinType === 'CROSS' && index < joinNodes.length - 1) {
            hasCrossJoinEarly = true;
        }
    });
    
    if (hasCrossJoinEarly) {
        const crossJoinNode = joinNodes.find(n => n.joinType === 'CROSS');
        hints.push({
            type: 'warning',
            message: 'CROSS JOIN appears before other JOINs',
            suggestion: 'CROSS JOINs should be as late as possible to avoid Cartesian explosion',
            category: 'performance',
            severity: 'high',
            nodeId: crossJoinNode?.id
        });
        
        // Add warning to the join node
        if (crossJoinNode) {
            if (!crossJoinNode.warnings) crossJoinNode.warnings = [];
            crossJoinNode.warnings.push({
                type: 'join-order',
                severity: 'high',
                message: 'CROSS JOIN should be later in join order'
            });
        }
    }
    
    // Suggest joining filtered tables first
    if (tablesWithFilters.size > 0 && joinNodes.length > 1) {
        hints.push({
            type: 'info',
            message: 'Tables with WHERE filters detected',
            suggestion: 'Consider joining filtered tables first to reduce intermediate result size',
            category: 'performance',
            severity: 'low'
        });
    }
}

// 3. Repeated Table Scan Detection
// Note: This function receives existingHints to check for duplicate subquery hints
// from detectAdvancedIssues() and merge them into comprehensive hints
function detectRepeatedScans(
    ast: any,
    tableUsage: Map<string, number>,
    hints: OptimizationHint[],
    existingHints: OptimizationHint[]
): void {
    tableUsage.forEach((count, tableName) => {
        if (count > 1) {
            const tableNameLower = tableName.toLowerCase();

            // Check if there's already a duplicate/similar subquery hint for this table
            const hasDuplicateSubqueryHint = existingHints.some(h => {
                const msgLower = h.message.toLowerCase();
                return (msgLower.includes('duplicate') || msgLower.includes('similar')) &&
                       msgLower.includes('subquer') &&
                       msgLower.includes(tableNameLower);
            });

            if (hasDuplicateSubqueryHint) {
                // Merge: Create a comprehensive hint that covers both issues
                hints.push({
                    type: 'warning',
                    message: `Table '${tableName}' is scanned ${count} times via duplicate subqueries`,
                    suggestion: 'Extract the repeated subqueries into a single CTE to scan once and reuse. This improves both performance and maintainability.',
                    category: 'performance',
                    severity: count > 2 ? 'high' : 'medium'
                });

                // Mark the existing duplicate subquery hint for removal (by setting a flag)
                existingHints.forEach(h => {
                    const msgLower = h.message.toLowerCase();
                    if ((msgLower.includes('duplicate') || msgLower.includes('similar')) &&
                        msgLower.includes('subquer') &&
                        msgLower.includes(tableNameLower)) {
                        // Mark for removal by setting a special property
                        (h as any)._merged = true;
                    }
                });
            } else {
                // No duplicate subquery hint, add standalone repeated scan hint
                hints.push({
                    type: 'warning',
                    message: `Table '${tableName}' is accessed ${count} times`,
                    suggestion: 'Consider using a CTE to scan the table once and reuse the result',
                    category: 'performance',
                    severity: count > 2 ? 'high' : 'medium'
                });
            }
        }
    });
}

// 4. Subquery to JOIN Conversion
function detectSubqueryConversionOpportunities(
    ast: any,
    hints: OptimizationHint[]
): void {
    function analyzeSubquery(subquery: any, context: string): void {
        if (!subquery || !subquery.expr) return;
        
        const expr = subquery.expr;
        
        // Check for IN subquery
        if (expr.operator === 'IN' && expr.right && expr.right.subquery) {
            const subq = expr.right.subquery;
            if (subq.from && subq.columns && subq.columns.length === 1) {
                hints.push({
                    type: 'info',
                    message: 'IN subquery could be converted to JOIN',
                    suggestion: `Consider: JOIN ${subq.from[0]?.table || 'table'} ON ${expr.left?.column || 'column'} = ${subq.columns[0]?.expr?.column || 'column'}`,
                    category: 'performance',
                    severity: 'medium'
                });
            }
        }
        
        // Check for EXISTS subquery
        if (expr.operator === 'EXISTS' && expr.right && expr.right.subquery) {
            const subq = expr.right.subquery;
            if (subq.where) {
                hints.push({
                    type: 'info',
                    message: 'EXISTS subquery could be converted to JOIN',
                    suggestion: 'Consider converting to INNER JOIN with the same condition for better performance',
                    category: 'performance',
                    severity: 'medium'
                });
            }
        }
        
        // Check for scalar subquery in SELECT
        if (context === 'select' && subquery.type === 'subquery') {
            hints.push({
                type: 'info',
                message: 'Scalar subquery in SELECT list',
                suggestion: 'Consider using LEFT JOIN instead to avoid executing subquery for each row',
                category: 'performance',
                severity: 'medium'
            });
        }
        
        // Check for NOT IN with nullable columns
        if (expr.operator === 'NOT IN' && expr.right && expr.right.subquery) {
            hints.push({
                type: 'warning',
                message: 'NOT IN with subquery may have unexpected NULL behavior',
                suggestion: 'Consider using NOT EXISTS or LEFT JOIN ... WHERE ... IS NULL for correct NULL handling',
                category: 'quality',
                severity: 'high'
            });
        }
    }
    
    // Analyze WHERE clause subqueries
    if (ast.where) {
        analyzeSubquery(ast.where, 'where');
    }
    
    // Analyze SELECT list subqueries
    if (ast.columns && Array.isArray(ast.columns)) {
        ast.columns.forEach((col: any) => {
            if (col.expr && col.expr.subquery) {
                analyzeSubquery(col.expr.subquery, 'select');
            }
        });
    }
}

// 5. Index Usage Hints
// Consolidated into a single vendor-agnostic hint to avoid repetition
// Works for databases with indexes (PostgreSQL, MySQL) or clustering (Snowflake, BigQuery)
function generateIndexHints(
    ast: any,
    hints: OptimizationHint[]
): IndexSuggestion[] {
    const indexSuggestions: IndexSuggestion[] = [];
    const columnsByPurpose: Record<string, Set<string>> = {
        filter: new Set(),
        join: new Set(),
        sort: new Set(),
        group: new Set()
    };

    // Extract WHERE columns
    if (ast.where) {
        const columns = extractColumnReferences(ast.where);
        columns.forEach(col => columnsByPurpose.filter.add(col));
    }

    // Extract JOIN columns
    if (ast.from && Array.isArray(ast.from)) {
        ast.from.forEach((fromItem: any) => {
            if (fromItem.join && fromItem.on) {
                const columns = extractColumnReferences(fromItem.on);
                columns.forEach(col => columnsByPurpose.join.add(col));
            }
        });
    }

    // Extract ORDER BY columns
    if (ast.orderby && Array.isArray(ast.orderby)) {
        ast.orderby.forEach((orderItem: any) => {
            if (orderItem.expr && orderItem.expr.column) {
                columnsByPurpose.sort.add(orderItem.expr.column);
            }
        });
    }

    // Extract GROUP BY columns
    if (ast.groupby && Array.isArray(ast.groupby)) {
        ast.groupby.forEach((groupItem: any) => {
            if (groupItem.expr && groupItem.expr.column) {
                columnsByPurpose.group.add(groupItem.expr.column);
            }
        });
    }

    // Collect all unique columns and build consolidated suggestion
    const allColumns = new Set<string>();
    const purposeDetails: string[] = [];

    if (columnsByPurpose.filter.size > 0) {
        const cols = Array.from(columnsByPurpose.filter);
        cols.forEach(c => allColumns.add(c));
        purposeDetails.push(`filter: ${cols.join(', ')}`);
        indexSuggestions.push({
            columns: cols,
            indexType: cols.length > 1 ? 'composite' : 'btree',
            reason: 'filter',
            message: `Columns used in WHERE: ${cols.join(', ')}`,
            suggestion: 'Consider indexing for filter optimization'
        });
    }

    if (columnsByPurpose.join.size > 0) {
        const cols = Array.from(columnsByPurpose.join);
        cols.forEach(c => allColumns.add(c));
        purposeDetails.push(`join: ${cols.join(', ')}`);
        indexSuggestions.push({
            columns: cols,
            indexType: 'btree',
            reason: 'join',
            message: `Columns used in JOIN: ${cols.join(', ')}`,
            suggestion: 'Consider indexing for join optimization'
        });
    }

    if (columnsByPurpose.sort.size > 0) {
        const cols = Array.from(columnsByPurpose.sort);
        cols.forEach(c => allColumns.add(c));
        purposeDetails.push(`sort: ${cols.join(', ')}`);
        indexSuggestions.push({
            columns: cols,
            indexType: 'btree',
            reason: 'sort',
            message: `Columns used in ORDER BY: ${cols.join(', ')}`,
            suggestion: 'Consider indexing for sort optimization'
        });
    }

    if (columnsByPurpose.group.size > 0) {
        const cols = Array.from(columnsByPurpose.group);
        cols.forEach(c => allColumns.add(c));
        purposeDetails.push(`group: ${cols.join(', ')}`);
        indexSuggestions.push({
            columns: cols,
            indexType: 'btree',
            reason: 'group',
            message: `Columns used in GROUP BY: ${cols.join(', ')}`,
            suggestion: 'Consider indexing for group optimization'
        });
    }

    // Only add a single consolidated hint if there are indexable columns
    if (allColumns.size > 0) {
        const uniqueColumns = Array.from(allColumns);
        hints.push({
            type: 'info',
            message: `Columns that may benefit from indexing/clustering: ${uniqueColumns.join(', ')}`,
            suggestion: `Usage: ${purposeDetails.join('; ')}. Check your database's optimization options (indexes, clustering keys, sort keys).`,
            category: 'performance',
            severity: 'low'
        });
    }

    return indexSuggestions;
}

// 6. Function in WHERE Clause Detection (Non-Sargable Expressions)
function detectNonSargableExpressions(
    ast: any,
    hints: OptimizationHint[]
): void {
    function checkExpression(expr: any, context: string): void {
        if (!expr) return;
        
        // Check for function calls wrapping columns
        if (expr.type === 'function') {
            // Handle function name - it might be a string or an object
            let funcName: string | null = null;
            if (typeof expr.name === 'string') {
                funcName = expr.name.toUpperCase();
            } else if (expr.name && typeof expr.name === 'object' && expr.name.name) {
                funcName = String(expr.name.name).toUpperCase();
            } else if (expr.name) {
                funcName = String(expr.name).toUpperCase();
            }
            
            if (!funcName) return;
            
            const args = expr.args?.expr || expr.args;
            
            if (args && args.type === 'column_ref') {
                const columnName = args.column || (args.table ? `${args.table}.${args.column}` : '');
                
                // Common non-sargable patterns
                if (funcName === 'YEAR' || funcName === 'MONTH' || funcName === 'DAY') {
                    const hint: OptimizationHint = {
                        type: 'warning',
                        message: `Function ${funcName}() on column ${columnName} prevents index usage`,
                        suggestion: `Rewrite as: ${columnName} >= '2024-01-01' AND ${columnName} < '2025-01-01' (for YEAR)`,
                        category: 'performance',
                        severity: 'high',
                        nodeId: undefined
                    };
                    hints.push(hint);
                } else if (funcName === 'UPPER' || funcName === 'LOWER') {
                    hints.push({
                        type: 'warning',
                        message: `Function ${funcName}() on column prevents index usage`,
                        suggestion: 'Consider using case-insensitive collation or storing normalized values',
                        category: 'performance',
                        severity: 'medium'
                    });
                } else if (funcName !== 'COUNT' && funcName !== 'SUM' && funcName !== 'AVG' && funcName !== 'MAX' && funcName !== 'MIN') {
                    hints.push({
                        type: 'info',
                        message: `Function ${funcName}() on column may prevent index usage`,
                        suggestion: 'Consider rewriting to avoid function on indexed column',
                        category: 'performance',
                        severity: 'medium'
                    });
                }
            }
        }
        
        // Check for LIKE with leading wildcard
        if (expr.operator === 'LIKE' && expr.right && typeof expr.right.value === 'string') {
            const pattern = expr.right.value;
            if (pattern.startsWith('%')) {
                hints.push({
                    type: 'warning',
                    message: 'LIKE pattern starts with wildcard (%)',
                    suggestion: 'Leading wildcards prevent index usage. Consider full-text search or reverse index',
                    category: 'performance',
                    severity: 'high'
                });
            }
        }
        
        // Check for OR conditions spanning different columns
        if (expr.operator === 'OR') {
            const leftCols = extractColumnReferences(expr.left);
            const rightCols = extractColumnReferences(expr.right);
            
            if (leftCols.length > 0 && rightCols.length > 0) {
                const leftTables = leftCols.map(c => getTableFromColumn(c)).filter(Boolean);
                const rightTables = rightCols.map(c => getTableFromColumn(c)).filter(Boolean);
                
                if (leftTables.length > 0 && rightTables.length > 0 && 
                    !leftTables.some(t => rightTables.includes(t))) {
                    hints.push({
                        type: 'info',
                        message: 'OR condition spans different columns',
                        suggestion: 'Consider using UNION or separate indexes for better performance',
                        category: 'performance',
                        severity: 'medium'
                    });
                }
            }
        }
        
        // Recursively check nested expressions
        if (expr.left) checkExpression(expr.left, context);
        if (expr.right) checkExpression(expr.right, context);
        if (expr.expr) checkExpression(expr.expr, context);
    }
    
    if (ast.where) {
        checkExpression(ast.where, 'where');
    }
}

// 7. Aggregate Optimization Hints
function analyzeAggregatePerformance(
    ast: any,
    hints: OptimizationHint[]
): void {
    if (!ast.columns || !Array.isArray(ast.columns)) return;
    
    let hasCountStar = false;
    let hasCountDistinct = false;
    let hasAggregateWithoutFilter = false;
    let groupByColumnCount = 0;
    
    ast.columns.forEach((col: any) => {
        if (col.expr && col.expr.type === 'aggr_func') {
            // Handle function name - it might be a string or an object
            let funcName: string | null = null;
            if (typeof col.expr.name === 'string') {
                funcName = col.expr.name.toUpperCase();
            } else if (col.expr.name && typeof col.expr.name === 'object' && col.expr.name.name) {
                funcName = String(col.expr.name.name).toUpperCase();
            } else if (col.expr.name) {
                funcName = String(col.expr.name).toUpperCase();
            }
            
            if (!funcName) return;
            
            if (funcName === 'COUNT') {
                if (col.expr.args && col.expr.args.expr === '*') {
                    hasCountStar = true;
                } else if (col.expr.args && col.expr.args.distinct) {
                    hasCountDistinct = true;
                }
            }
        }
    });
    
    // Check GROUP BY column count
    if (ast.groupby && Array.isArray(ast.groupby)) {
        groupByColumnCount = ast.groupby.length;
        if (groupByColumnCount > 5) {
            hints.push({
                type: 'warning',
                message: `GROUP BY with ${groupByColumnCount} columns`,
                suggestion: 'High cardinality grouping may impact performance. Review if all columns are necessary',
                category: 'performance',
                severity: 'medium'
            });
        }
    }
    
    // Check if aggregation happens without WHERE filter
    if (!ast.where && (ast.groupby || hasCountStar || hasCountDistinct)) {
        hasAggregateWithoutFilter = true;
        hints.push({
            type: 'info',
            message: 'Aggregate query without WHERE clause',
            suggestion: 'Consider adding WHERE clause to reduce rows before aggregation',
            category: 'performance',
            severity: 'low'
        });
    }
    
    // COUNT(*) vs COUNT(col) suggestion
    if (hasCountStar) {
        // This is actually good, no hint needed
    } else if (hasCountDistinct) {
        hints.push({
            type: 'info',
            message: 'COUNT(DISTINCT) detected',
            suggestion: 'COUNT(DISTINCT) is expensive. Consider approximate alternatives if exact count is not required',
            category: 'performance',
            severity: 'medium'
        });
    }
}

// Main analysis function
// existingHints: Hints already generated by generateHints() and detectAdvancedIssues()
// These are used to merge overlapping hints (e.g., duplicate subquery + repeated scan)
export function analyzePerformance(
    ast: any,
    nodes: FlowNode[],
    edges: FlowEdge[],
    tableUsage: Map<string, number>,
    existingHints: OptimizationHint[] = []
): PerformanceAnalysisResult {
    const hints: OptimizationHint[] = [];
    const indexSuggestions: IndexSuggestion[] = [];
    const refactoringOpportunities: RefactoringHint[] = [];

    // Run all analyzers
    detectFilterPushdownOpportunities(ast, nodes, edges, hints);
    analyzeJoinOrder(ast, nodes, hints);
    detectRepeatedScans(ast, tableUsage, hints, existingHints);
    detectSubqueryConversionOpportunities(ast, hints);
    const indexHints = generateIndexHints(ast, hints);
    indexSuggestions.push(...indexHints);
    detectNonSargableExpressions(ast, hints);
    analyzeAggregatePerformance(ast, hints);

    return { hints, indexSuggestions, refactoringOpportunities };
}

