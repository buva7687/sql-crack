import { Parser } from 'node-sql-parser';
import dagre from 'dagre';
import { analyzePerformance } from './performanceAnalyzer';
import { isAggregateFunction, isWindowFunction, getAggregateFunctions, getWindowFunctions } from '../dialects';

// Import types from centralized type definitions
import {
    FlowNode,
    FlowEdge,
    ColumnFlow,
    ColumnInfo,
    ColumnLineage,
    QueryStats,
    OptimizationHint,
    ParseResult,
    BatchParseResult,
    SqlDialect,
    NodeType,
} from './types';

// Import color constants
import { getNodeColor } from './constants';

// Re-export types for backward compatibility
export type {
    FlowNode,
    FlowEdge,
    ColumnFlow,
    ColumnInfo,
    ColumnLineage,
    QueryStats,
    OptimizationHint,
    ParseResult,
    BatchParseResult,
    SqlDialect,
};

// Re-export getNodeColor for backward compatibility
export { getNodeColor };

// Stats tracking during parsing
let stats: QueryStats;
let hints: OptimizationHint[];
let nodeCounter = 0;
let hasSelectStar = false;
let hasNoLimit = false;
let statementType = '';
let tableUsageMap: Map<string, number> = new Map();
let currentDialect: SqlDialect = 'MySQL';

function resetStats(): void {
    stats = {
        tables: 0,
        joins: 0,
        subqueries: 0,
        ctes: 0,
        aggregations: 0,
        windowFunctions: 0,
        unions: 0,
        conditions: 0,
        complexity: 'Simple',
        complexityScore: 0
    };
    hints = [];
    hasSelectStar = false;
    hasNoLimit = true;
    statementType = '';
    tableUsageMap = new Map();
}

// Track table usage
function trackTableUsage(tableName: string): void {
    const normalizedName = tableName.toLowerCase();
    tableUsageMap.set(normalizedName, (tableUsageMap.get(normalizedName) || 0) + 1);
}

function calculateComplexity(): void {
    const score =
        stats.tables * 1 +
        stats.joins * 3 +
        stats.subqueries * 5 +
        stats.ctes * 4 +
        stats.aggregations * 2 +
        stats.windowFunctions * 4 +
        stats.unions * 3 +
        stats.conditions * 0.5;

    stats.complexityScore = Math.round(score);

    if (score < 5) {
        stats.complexity = 'Simple';
    } else if (score < 15) {
        stats.complexity = 'Moderate';
    } else if (score < 30) {
        stats.complexity = 'Complex';
    } else {
        stats.complexity = 'Very Complex';
    }
}

function genId(prefix: string): string {
    return `${prefix}_${nodeCounter++}`;
}

// Split SQL into individual statements
export function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let depth = 0;

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const prevChar = i > 0 ? sql[i - 1] : '';

        // Handle string literals
        if ((char === "'" || char === '"') && prevChar !== '\\') {
            if (!inString) {
                inString = true;
                stringChar = char;
            } else if (char === stringChar) {
                inString = false;
            }
        }

        // Handle parentheses depth
        if (!inString) {
            if (char === '(') { depth++; }
            if (char === ')') { depth--; }
        }

        // Split on semicolon at depth 0
        if (char === ';' && !inString && depth === 0) {
            const trimmed = current.trim();
            if (trimmed) {
                statements.push(trimmed);
            }
            current = '';
        } else {
            current += char;
        }
    }

    // Add last statement
    const trimmed = current.trim();
    if (trimmed) {
        statements.push(trimmed);
    }

    return statements;
}

// Parse multiple SQL statements
export function parseSqlBatch(sql: string, dialect: SqlDialect = 'MySQL'): BatchParseResult {
    const statements = splitSqlStatements(sql);
    const queries: ParseResult[] = [];
    const queryLineRanges: Array<{ startLine: number; endLine: number }> = [];

    // Track line offsets for each statement
    let currentLine = 1;
    const lines = sql.split('\n');

    for (const stmt of statements) {
        // Find the starting line of this statement in the original SQL
        let stmtStartLine = currentLine;
        const stmtFirstLine = stmt.trim().split('\n')[0];
        for (let i = currentLine - 1; i < lines.length; i++) {
            if (lines[i].includes(stmtFirstLine.substring(0, Math.min(30, stmtFirstLine.length)))) {
                stmtStartLine = i + 1;
                break;
            }
        }

        const result = parseSql(stmt, dialect);

        // Adjust line numbers by adding the offset
        const lineOffset = stmtStartLine - 1;
        for (const node of result.nodes) {
            if (node.startLine) {
                node.startLine += lineOffset;
            }
            if (node.endLine) {
                node.endLine += lineOffset;
            }
        }
        // Also adjust line numbers for edges
        for (const edge of result.edges) {
            if (edge.startLine) {
                edge.startLine += lineOffset;
            }
            if (edge.endLine) {
                edge.endLine += lineOffset;
            }
        }

        queries.push(result);

        // Calculate end line for this statement
        const stmtEndLine = stmtStartLine + stmt.split('\n').length - 1;
        queryLineRanges.push({ startLine: stmtStartLine, endLine: stmtEndLine });

        // Update current line past this statement
        currentLine = stmtStartLine + stmt.split('\n').length;
    }

    // Calculate total stats
    const totalStats: QueryStats = {
        tables: 0,
        joins: 0,
        subqueries: 0,
        ctes: 0,
        aggregations: 0,
        windowFunctions: 0,
        unions: 0,
        conditions: 0,
        complexity: 'Simple',
        complexityScore: 0
    };

    for (const q of queries) {
        totalStats.tables += q.stats.tables;
        totalStats.joins += q.stats.joins;
        totalStats.subqueries += q.stats.subqueries;
        totalStats.ctes += q.stats.ctes;
        totalStats.aggregations += q.stats.aggregations;
        totalStats.windowFunctions += q.stats.windowFunctions;
        totalStats.unions += q.stats.unions;
        totalStats.conditions += q.stats.conditions;
        totalStats.complexityScore += q.stats.complexityScore;
    }

    // Determine overall complexity
    const avgScore = queries.length > 0 ? totalStats.complexityScore / queries.length : 0;
    if (avgScore < 5) {
        totalStats.complexity = 'Simple';
    } else if (avgScore < 15) {
        totalStats.complexity = 'Moderate';
    } else if (avgScore < 30) {
        totalStats.complexity = 'Complex';
    } else {
        totalStats.complexity = 'Very Complex';
    }

    return { queries, totalStats, queryLineRanges };
}

// Extract line numbers for SQL keywords
function extractKeywordLineNumbers(sql: string): Map<string, number[]> {
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
            // Check for keyword at word boundary
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

// Assign line numbers to nodes based on their type and label
function assignLineNumbers(nodes: FlowNode[], sql: string): void {
    const keywordLines = extractKeywordLineNumbers(sql);

    // Track used line numbers to avoid duplicates
    const usedJoinLines: number[] = [];

    for (const node of nodes) {
        switch (node.type) {
            case 'table': {
                // Try to find the actual line where this table appears
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
                
                // Search all lines for the table name
                let foundLine: number | undefined;
                const searchStartLine = Math.min(...fromLines, ...joinLines, sqlLines.length);
                
                // Search from the beginning, but prioritize lines after FROM/JOIN
                for (let i = 0; i < sqlLines.length; i++) {
                    const line = sqlLines[i].toLowerCase();
                    // Check if this line contains the table name as a word boundary
                    // Also check for table aliases (e.g., "employees e" or "employees AS e")
                    const tableRegex = new RegExp(`\\b${tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    if (tableRegex.test(line)) {
                        // Make sure it's in a FROM or JOIN context
                        if (i >= searchStartLine - 1 || 
                            line.includes('from') || 
                            line.includes('join') ||
                            (i > 0 && (sqlLines[i-1].toLowerCase().includes('from') || sqlLines[i-1].toLowerCase().includes('join')))) {
                            foundLine = i + 1;
                            break;
                        }
                    }
                }
                
                // Fallback to first FROM line if not found
                node.startLine = foundLine || (fromLines.length > 0 ? fromLines[0] : undefined);
                break;
            }
            case 'join': {
                // Find the appropriate join line
                const joinTypes = ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
                                   'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
                                   'CROSS JOIN', 'JOIN'];
                for (const jt of joinTypes) {
                    if (node.label.toUpperCase().includes(jt.replace(' JOIN', ''))) {
                        const lines = keywordLines.get(jt) || keywordLines.get('JOIN') || [];
                        // Find first unused line
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
                // Result is at the end - use last SELECT line
                const selectLines = keywordLines.get('SELECT') || [];
                if (selectLines.length > 0) {node.startLine = selectLines[0];}
                break;
            }
        }
    }
}

export function parseSql(sql: string, dialect: SqlDialect = 'MySQL'): ParseResult {
    nodeCounter = 0;
    currentDialect = dialect;
    resetStats();
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    if (!sql || !sql.trim()) {
        return { nodes, edges, stats, hints, sql, columnLineage: [], tableUsage: new Map(), error: 'No SQL provided' };
    }

    const parser = new Parser();

    try {
        const ast = parser.astify(sql, { database: dialect });
        const statements = Array.isArray(ast) ? ast : [ast];

        for (const stmt of statements) {
            processStatement(stmt, nodes, edges);
        }

        // Calculate complexity
        calculateComplexity();

        // Generate optimization hints
        generateHints(statements[0]);

        // Detect advanced issues (unused CTEs, dead columns, etc.)
        detectAdvancedIssues(nodes, edges, sql);

        // Calculate enhanced complexity metrics
        calculateEnhancedMetrics(nodes, edges);

        // Phase 3: Static performance analysis
        // Pass existing hints so performance analyzer can merge overlapping hints
        // (e.g., duplicate subquery hints + repeated table scan hints)
        if (statements[0]) {
            const perfAnalysis = analyzePerformance(statements[0], nodes, edges, tableUsageMap, hints);
            hints.push(...perfAnalysis.hints);

            // Filter out hints that were merged into performance hints
            // (marked with _merged flag by detectRepeatedScans)
            const mergedCount = hints.filter(h => (h as any)._merged).length;
            if (mergedCount > 0) {
                hints = hints.filter(h => !(h as any)._merged);
            }
        }

        // Calculate performance score after all hints are collected (0-100, higher is better)
        const perfHints = hints.filter(h => h.category === 'performance');
        if (perfHints.length > 0) {
            const highSeverityCount = perfHints.filter(h => h.severity === 'high').length;
            const mediumSeverityCount = perfHints.filter(h => h.severity === 'medium').length;
            const lowSeverityCount = perfHints.filter(h => h.severity === 'low').length;
            
            // Start with 100 and deduct points for issues
            let score = 100;
            score -= highSeverityCount * 15;  // High severity issues cost 15 points
            score -= mediumSeverityCount * 8; // Medium severity issues cost 8 points
            score -= lowSeverityCount * 3;    // Low severity issues cost 3 points
            
            stats.performanceScore = Math.max(0, Math.min(100, Math.round(score)));
            stats.performanceIssues = perfHints.length;
        }

        // Use dagre for layout
        layoutGraph(nodes, edges);

        // Assign line numbers to nodes for editor sync
        assignLineNumbers(nodes, sql);

        // Extract column lineage
        const columnLineage = extractColumnLineage(statements[0], nodes);

        // Generate column flows for visualization
        const columnFlows = generateColumnFlows(statements[0], nodes, edges);

        // Calculate column positions on nodes
        calculateColumnPositions(nodes);

        return { nodes, edges, stats, hints, sql, columnLineage, columnFlows, tableUsage: tableUsageMap };
    } catch (err) {
        let message = err instanceof Error ? err.message : 'Parse error';

        // Enhance error messages with helpful dialect suggestions for common issues
        // This helps users quickly identify when they need to switch SQL dialects
        const upperSql = sql.toUpperCase();
        const hasIntervalQuoted = /INTERVAL\s*'[^']+'/i.test(sql);
        const hasParenthesizedUnion = /\(\s*SELECT[\s\S]+\)\s*(UNION|INTERSECT|EXCEPT)/i.test(sql);

        if (message.includes('found') || message.includes('Expected')) {
            if (currentDialect === 'MySQL') {
                // MySQL-specific issues - check in order of likelihood
                if (hasParenthesizedUnion && hasIntervalQuoted) {
                    message = `This query uses PostgreSQL syntax (INTERVAL '...' and parenthesized UNION). Try PostgreSQL dialect.`;
                } else if (hasParenthesizedUnion) {
                    message = `Parenthesized set operations not supported in MySQL. Try PostgreSQL dialect.`;
                } else if (hasIntervalQuoted) {
                    message = `PostgreSQL-style INTERVAL syntax detected. Try PostgreSQL dialect, or use MySQL syntax: INTERVAL 30 DAY.`;
                } else {
                    message = `SQL syntax not recognized by MySQL parser. Try PostgreSQL dialect (most compatible).`;
                }
            }
            // Check for INTERSECT/EXCEPT which are only supported in MySQL/PostgreSQL
            else if (upperSql.includes('INTERSECT') || upperSql.includes('EXCEPT')) {
                const dialectsWithSupport = ['MySQL', 'PostgreSQL'];
                if (!dialectsWithSupport.includes(currentDialect)) {
                    message = `INTERSECT/EXCEPT not supported in ${currentDialect}. Try MySQL or PostgreSQL dialect.`;
                }
            }
            // Check for recursive CTE
            else if (upperSql.includes('RECURSIVE') && !['PostgreSQL', 'MySQL', 'SQLite'].includes(currentDialect)) {
                message = `RECURSIVE CTE not supported in ${currentDialect}. Try PostgreSQL or MySQL dialect.`;
            }
            // Generic parse error - make it more user-friendly
            else {
                message = `SQL syntax not recognized by ${currentDialect} parser. Try PostgreSQL dialect (most compatible).`;
            }
        }

        return { nodes: [], edges: [], stats, hints, sql, columnLineage: [], tableUsage: new Map(), error: message };
    }
}

function generateHints(stmt: any): void {
    if (!stmt) { return; }

    const type = stmt.type?.toLowerCase() || '';

    // SELECT * warning
    if (hasSelectStar) {
        hints.push({
            type: 'warning',
            message: 'SELECT * detected',
            suggestion: 'Specify only needed columns to reduce data transfer and improve performance'
        });
    }

    // Missing LIMIT on SELECT
    if (type === 'select' && hasNoLimit && stats.tables > 0) {
        hints.push({
            type: 'info',
            message: 'No LIMIT clause',
            suggestion: 'Consider adding LIMIT to prevent fetching large result sets'
        });
    }

    // Missing WHERE on UPDATE/DELETE
    if ((type === 'update' || type === 'delete') && !stmt.where) {
        hints.push({
            type: 'error',
            message: `${type.toUpperCase()} without WHERE clause`,
            suggestion: 'This will affect ALL rows in the table. Add a WHERE clause to limit scope'
        });
    }

    // Too many JOINs
    if (stats.joins > 5) {
        hints.push({
            type: 'warning',
            message: `High number of JOINs (${stats.joins})`,
            suggestion: 'Consider breaking into smaller queries or using CTEs for clarity'
        });
    }

    // Deeply nested subqueries
    if (stats.subqueries > 3) {
        hints.push({
            type: 'warning',
            message: `Multiple subqueries detected (${stats.subqueries})`,
            suggestion: 'Consider using CTEs (WITH clause) for better readability'
        });
    }

    // Cartesian product (no join condition)
    if (stats.tables > 1 && stats.joins === 0 && stats.conditions === 0) {
        hints.push({
            type: 'error',
            message: 'Possible Cartesian product',
            suggestion: 'Multiple tables without JOIN conditions will produce all row combinations',
            category: 'performance',
            severity: 'high'
        });
    }
}

// Advanced quality checks - detect unused CTEs, dead columns, duplicate subqueries
// Phase 2 Feature: Advanced SQL Annotations
function detectAdvancedIssues(nodes: FlowNode[], edges: FlowEdge[], sql: string): void {
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

            hints.push({
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
        
            hints.push({
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
            hints.push({
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
        const normalizedSql = sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
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
                    const escapedColName = nameToCheck.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            
            hints.push({
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

            hints.push({
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
function calculateEnhancedMetrics(nodes: FlowNode[], edges: FlowEdge[]): void {
    // Calculate max CTE depth
    let maxDepth = 0;
    nodes.forEach(node => {
        if (node.type === 'cte' && node.depth !== undefined) {
            maxDepth = Math.max(maxDepth, node.depth);
        }
    });
    stats.maxCteDepth = maxDepth;

    // Calculate max fan-out (number of outgoing edges per node)
    const fanOutMap = new Map<string, number>();
    edges.forEach(edge => {
        const count = fanOutMap.get(edge.source) || 0;
        fanOutMap.set(edge.source, count + 1);
    });
    stats.maxFanOut = Math.max(0, ...Array.from(fanOutMap.values()));

    // Calculate critical path length (longest path from source to result)
    const calculatePathLength = (nodeId: string, visited: Set<string>): number => {
        if (visited.has(nodeId)) {return 0;}
        visited.add(nodeId);

        const outgoing = edges.filter(e => e.source === nodeId);
        if (outgoing.length === 0) {return 1;}

        const maxChildPath = Math.max(
            ...outgoing.map(edge => calculatePathLength(edge.target, new Set(visited)))
        );
        return 1 + maxChildPath;
    };

    // Find root nodes (nodes with no incoming edges)
    const nodesWithIncoming = new Set(edges.map(e => e.target));
    const rootNodes = nodes.filter(n => !nodesWithIncoming.has(n.id));

    stats.criticalPathLength = Math.max(
        0,
        ...rootNodes.map(node => calculatePathLength(node.id, new Set()))
    );

    // Complexity breakdown
    stats.complexityBreakdown = {
        joins: stats.joins * 3,           // Joins add significant complexity
        subqueries: stats.subqueries * 2,
        ctes: stats.ctes * 2,
        aggregations: stats.aggregations * 1,
        windowFunctions: stats.windowFunctions * 2
    };

    // Identify bottlenecks (nodes with high fan-out or in critical path)
    nodes.forEach(node => {
        const fanOut = fanOutMap.get(node.id) || 0;
        if (fanOut >= 3) {
            if (!node.warnings) {node.warnings = [];}
            node.warnings.push({
                type: 'fan-out',
                severity: fanOut >= 5 ? 'high' : 'medium',
                message: `High fan-out: ${fanOut} outgoing connections`
            });
        }

        // Mark nodes with high complexity
        if ((node.type === 'join' && stats.joins > 3) ||
            (node.type === 'aggregate' && node.aggregateDetails && node.aggregateDetails.functions.length > 3)) {
            if (!node.warnings) {node.warnings = [];}
            node.warnings.push({
                type: 'complex',
                severity: 'medium',
                message: 'Complex operation - may impact performance'
            });
        }
    });

    // Assign complexity levels to nodes
    nodes.forEach(node => {
        if (node.type === 'join') {
            node.complexityLevel = stats.joins > 5 ? 'high' : stats.joins > 2 ? 'medium' : 'low';
        } else if (node.type === 'aggregate') {
            const funcCount = node.aggregateDetails?.functions.length || 0;
            node.complexityLevel = funcCount > 4 ? 'high' : funcCount > 2 ? 'medium' : 'low';
        } else if (node.type === 'subquery') {
            node.complexityLevel = stats.subqueries > 2 ? 'high' : 'low';
        }
    });
}

function processStatement(stmt: any, nodes: FlowNode[], edges: FlowEdge[]): string | null {
    if (!stmt || !stmt.type) { return null; }

    statementType = stmt.type.toLowerCase();

    if (statementType === 'select') {
        return processSelect(stmt, nodes, edges);
    }

    // For non-SELECT, create a simple representation
    const rootId = genId('stmt');
    nodes.push({
        id: rootId,
        type: 'result',
        label: stmt.type.toUpperCase(),
        description: `${stmt.type} statement`,
        x: 0, y: 0, width: 160, height: 60
    });

    // Process table for UPDATE/DELETE/INSERT
    // Phase 1 Feature: Read vs Write Differentiation
    // Mark write operations with accessMode and operationType for visual distinction
    if (stmt.table) {
        const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
        // Determine operation type and access mode for write operations
        const opType = statementType.toUpperCase() as 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE' | 'CREATE_TABLE_AS';
        const accessMode: 'write' = 'write';
        
        for (const t of tables) {
            stats.tables++;
            const tableId = genId('table');
            const tableName = t.table || t.name || t;
            nodes.push({
                id: tableId,
                type: 'table',
                label: String(tableName),
                description: 'Target table',
                accessMode: accessMode, // Mark as write operation for red border/badge
                operationType: opType,  // Store operation type for badge display
                x: 0, y: 0, width: 140, height: 60
            });
            edges.push({
                id: genId('e'),
                source: tableId,
                target: rootId
            });
        }
    }

    return rootId;
}

function processSelect(stmt: any, nodes: FlowNode[], edges: FlowEdge[], cteNames: Set<string> = new Set()): string {
    const nodeIds: string[] = [];

    // Collect CTE names first
    if (stmt.with && Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            const cteName = cte.name?.value || cte.name || 'CTE';
            cteNames.add(cteName.toLowerCase());
        }
    }

    // Process CTEs first - with nested sub-graph
    if (stmt.with && Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            stats.ctes++;
            const cteId = genId('cte');
            const cteName = cte.name?.value || cte.name || 'CTE';

            // Parse CTE's internal structure
            const cteChildren: FlowNode[] = [];
            const cteChildEdges: FlowEdge[] = [];

            // CTE statement can be in different locations depending on parser output
            // Handle various AST structures from node-sql-parser
            let cteStmt = null;
            if (cte.stmt?.ast) {
                cteStmt = cte.stmt.ast;
            } else if (cte.stmt?.type === 'select' || cte.stmt?.from) {
                cteStmt = cte.stmt;
            } else if (cte.ast) {
                cteStmt = cte.ast;
            } else if (cte.expr?.ast) {
                cteStmt = cte.expr.ast;
            } else if (cte.definition?.ast) {
                cteStmt = cte.definition.ast;
            } else if (cte.definition) {
                cteStmt = cte.definition;
            }

            if (cteStmt) {
                // Phase 1 Feature: CTE Expansion Controls & Breadcrumb Navigation
                // Recursively parse the CTE's SELECT statement with parentId and depth for breadcrumb navigation
                parseCteOrSubqueryInternals(cteStmt, cteChildren, cteChildEdges, cteId, 0);
            }

            // Calculate container size based on children
            const containerWidth = Math.max(200, cteChildren.length > 0 ? 220 : 160);
            const containerHeight = cteChildren.length > 0 ? 80 + cteChildren.length * 35 : 60;

            nodes.push({
                id: cteId,
                type: 'cte',
                label: `WITH ${cteName}`,
                description: 'Common Table Expression',
                children: cteChildren.length > 0 ? cteChildren : undefined,
                childEdges: cteChildren.length > 0 ? cteChildEdges : undefined, // Keep empty array if children exist
                expanded: false, // Start collapsed, expand on click to show subflow
                collapsible: cteChildren.length > 0, // Only collapsible if has children
                depth: 0, // Root level CTE - used for breadcrumb navigation
                x: 0, y: 0, width: containerWidth, height: containerHeight
            });
            nodeIds.push(cteId);
        }
    }

    // Process FROM tables (data sources) - first pass: create all table nodes
    const tableIds: string[] = [];
    const joinTableMap: Map<string, string> = new Map(); // Maps table name to its node id

    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            // Create table node for non-join tables
            if (!fromItem.join) {
                const tableId = processFromItem(fromItem, nodes, edges, cteNames);
                if (tableId) {
                    tableIds.push(tableId);
                    const tableName = getTableName(fromItem);
                    joinTableMap.set(tableName, tableId);
                }
            } else {
                // Create table node for join tables too
                stats.tables++;
                const tableName = getTableName(fromItem);
                trackTableUsage(tableName);
                const tableId = genId('table');
                // Determine table category
                const isCteRef = cteNames.has(tableName.toLowerCase());
                nodes.push({
                    id: tableId,
                    type: 'table',
                    label: tableName,
                    description: isCteRef ? 'CTE reference' : 'Joined table',
                    details: fromItem.as ? [`Alias: ${fromItem.as}`] : undefined,
                    tableCategory: isCteRef ? 'cte_reference' : 'physical',
                    x: 0, y: 0, width: 140, height: 60
                });
                tableIds.push(tableId);
                joinTableMap.set(tableName, tableId);
            }
        }
    }

    // Process JOINs - create join nodes and connect tables properly
    let lastOutputId = tableIds[0]; // Start with first table as base

    if (stmt.from && Array.isArray(stmt.from)) {
        let leftTableId = tableIds[0];

        for (let i = 0; i < stmt.from.length; i++) {
            const fromItem = stmt.from[i];
            if (fromItem.join) {
                stats.joins++;
                const joinId = genId('join');
                const joinType = fromItem.join || 'JOIN';
                const joinTable = getTableName(fromItem);
                const rightTableId = joinTableMap.get(joinTable);

                // Extract join condition details
                const joinDetails: string[] = [];
                if (fromItem.on) {
                    joinDetails.push(formatCondition(fromItem.on));
                }
                joinDetails.push(`${joinTable}`);

                nodes.push({
                    id: joinId,
                    type: 'join',
                    label: joinType.toUpperCase(),
                    description: `Join with ${joinTable}`,
                    details: joinDetails,
                    x: 0, y: 0, width: 140, height: 60
                });

                // Extract join condition SQL for edge
                const joinConditionSql = fromItem.on ? formatCondition(fromItem.on) : '';
                
                // Phase 1 Feature: Click Edge → View SQL Clauses
                // Connect left side to join (previous join result or first table)
                // Store SQL clause and line number for edge click navigation
                if (leftTableId) {
                    edges.push({
                        id: genId('e'),
                        source: leftTableId,
                        target: joinId,
                        sqlClause: joinConditionSql, // SQL clause for edge click display
                        clauseType: 'join',         // Type of clause for styling
                        startLine: fromItem.on?.location?.start?.line // Line number for navigation
                    });
                }

                // Connect right side (join table) to join
                if (rightTableId && rightTableId !== leftTableId) {
                    edges.push({
                        id: genId('e'),
                        source: rightTableId,
                        target: joinId,
                        sqlClause: joinConditionSql, // SQL clause for edge click display
                        clauseType: 'on',           // Type of clause for styling
                        startLine: fromItem.on?.location?.start?.line // Line number for navigation
                    });
                }

                // The join output becomes the left side for next join
                leftTableId = joinId;
                lastOutputId = joinId;
            }
        }
    }

    // Connect CTEs to first table
    for (const cteId of nodeIds) {
        if (tableIds[0]) {
            edges.push({
                id: genId('e'),
                source: cteId,
                target: tableIds[0]
            });
        }
    }

    // Process WHERE - connect from the last join output or first table
    let previousId = lastOutputId || tableIds[0];
    if (stmt.where) {
        const whereId = genId('filter');
        const conditions = extractConditions(stmt.where);
        stats.conditions += conditions.length;
        nodes.push({
            id: whereId,
            type: 'filter',
            label: 'WHERE',
            description: 'Filter rows',
            details: conditions,
            x: 0, y: 0, width: 140, height: 60
        });

        // Phase 1 Feature: Click Edge → View SQL Clauses
        // Store WHERE clause SQL and line number for edge click navigation
        if (previousId) {
            // Format WHERE clause SQL
            const whereClauseSql = conditions.join(' AND ');
            edges.push({
                id: genId('e'),
                source: previousId,
                target: whereId,
                sqlClause: whereClauseSql, // SQL clause for edge click display
                clauseType: 'where',      // Type of clause for styling
                startLine: stmt.where?.location?.start?.line // Line number for navigation
            });
        }
        previousId = whereId;
    }

    // Process GROUP BY
    if (stmt.groupby && Array.isArray(stmt.groupby) && stmt.groupby.length > 0) {
        stats.aggregations++;
        const groupId = genId('agg');
        const groupCols = stmt.groupby.map((g: any) => g.column || g.expr?.column || '?').join(', ');
        nodes.push({
            id: groupId,
            type: 'aggregate',
            label: 'GROUP BY',
            description: 'Aggregate rows',
            details: [`Columns: ${groupCols}`],
            x: 0, y: 0, width: 140, height: 60
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: groupId
            });
        }
        previousId = groupId;
    }

    // Process HAVING
    if (stmt.having) {
        const havingId = genId('filter');
        nodes.push({
            id: havingId,
            type: 'filter',
            label: 'HAVING',
            description: 'Filter groups',
            details: [formatCondition(stmt.having)],
            x: 0, y: 0, width: 140, height: 60
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: havingId
            });
        }
        previousId = havingId;
    }

    // Check for aggregate functions in columns - with detailed breakdown
    const aggregateFuncDetails = extractAggregateFunctionDetails(stmt.columns);
    // Always show aggregate node when aggregate functions are present (similar to window functions)
    if (aggregateFuncDetails.length > 0) {
        const aggregateId = genId('aggregate');

        // Calculate height based on number of functions
        const baseHeight = 50;
        const perFuncHeight = 28;
        const aggregateHeight = baseHeight + aggregateFuncDetails.length * perFuncHeight;

        nodes.push({
            id: aggregateId,
            type: 'aggregate',
            label: 'AGGREGATE',
            description: `${aggregateFuncDetails.length} aggregate function${aggregateFuncDetails.length > 1 ? 's' : ''}`,
            aggregateDetails: { functions: aggregateFuncDetails },
            x: 0, y: 0, width: 220, height: Math.min(aggregateHeight, 180)
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: aggregateId
            });
        }
        previousId = aggregateId;
    }

    // Check for CASE statements in columns - with detailed breakdown
    const caseStatementDetails = extractCaseStatementDetails(stmt.columns);
    if (caseStatementDetails.length > 0) {
        const caseId = genId('case');

        // Calculate height based on number of CASE statements
        const baseHeight = 50;
        const perCaseHeight = 35; // More height per CASE due to multiple conditions
        const caseHeight = baseHeight + caseStatementDetails.length * perCaseHeight;

        nodes.push({
            id: caseId,
            type: 'case',
            label: 'CASE',
            description: `${caseStatementDetails.length} CASE statement${caseStatementDetails.length > 1 ? 's' : ''}`,
            caseDetails: { cases: caseStatementDetails },
            x: 0, y: 0, width: 220, height: Math.min(caseHeight, 200)
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: caseId
            });
        }
        previousId = caseId;
    }

    // Check for window functions in columns - with detailed breakdown
    const windowFuncDetails = extractWindowFunctionDetails(stmt.columns);
    if (windowFuncDetails.length > 0) {
        stats.windowFunctions += windowFuncDetails.length;
        const windowId = genId('window');

        // Calculate height based on number of functions
        const baseHeight = 50;
        const perFuncHeight = 28;
        const windowHeight = baseHeight + windowFuncDetails.length * perFuncHeight;

        nodes.push({
            id: windowId,
            type: 'window',
            label: 'WINDOW',
            description: `${windowFuncDetails.length} window function${windowFuncDetails.length > 1 ? 's' : ''}`,
            windowDetails: { functions: windowFuncDetails },
            x: 0, y: 0, width: 220, height: Math.min(windowHeight, 180)
        });

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: windowId
            });
        }
        previousId = windowId;
    }

    // Process SELECT columns
    const selectId = genId('select');
    const columns = extractColumns(stmt.columns);
    // Extract column info for dead column detection
    const columnInfos: ColumnInfo[] = extractColumnInfos(stmt.columns);
    nodes.push({
        id: selectId,
        type: 'select',
        label: 'SELECT',
        description: 'Project columns',
        details: columns.length <= 5 ? columns : [`${columns.length} columns`],
        columns: columnInfos, // Store column info for dead column detection
        x: 0, y: 0, width: 140, height: 60
    });

    if (previousId) {
        edges.push({
            id: genId('e'),
            source: previousId,
            target: selectId
        });
    }
    previousId = selectId;

    // Process ORDER BY
    if (stmt.orderby && Array.isArray(stmt.orderby) && stmt.orderby.length > 0) {
        const sortId = genId('sort');
        const sortCols = stmt.orderby.map((o: any) => {
            const col = o.expr?.column || o.expr?.value || '?';
            const dir = o.type || 'ASC';
            return `${col} ${dir}`;
        }).join(', ');
        nodes.push({
            id: sortId,
            type: 'sort',
            label: 'ORDER BY',
            description: 'Sort results',
            details: [sortCols],
            x: 0, y: 0, width: 140, height: 60
        });

        edges.push({
            id: genId('e'),
            source: previousId,
            target: sortId
        });
        previousId = sortId;
    }

    // Process LIMIT
    if (stmt.limit) {
        hasNoLimit = false;
        const limitId = genId('limit');
        const limitVal = stmt.limit.value?.[0]?.value ?? stmt.limit.value ?? stmt.limit;
        nodes.push({
            id: limitId,
            type: 'limit',
            label: 'LIMIT',
            description: 'Limit rows',
            details: [`${limitVal} rows`],
            x: 0, y: 0, width: 120, height: 60
        });

        edges.push({
            id: genId('e'),
            source: previousId,
            target: limitId
        });
        previousId = limitId;
    }

    // Add result node
    const resultId = genId('result');
    nodes.push({
        id: resultId,
        type: 'result',
        label: 'Result',
        description: 'Query output',
        x: 0, y: 0, width: 120, height: 60
    });

    edges.push({
        id: genId('e'),
        source: previousId,
        target: resultId
    });

    // Handle UNION/INTERSECT/EXCEPT
    if (stmt._next) {
        stats.unions++;
        const nextResultId = processStatement(stmt._next, nodes, edges);
        if (nextResultId) {
            const unionId = genId('union');
            const setOp = stmt.set_op || 'UNION';

            // Collect tables from both sides for details
            const leftTables = extractTablesFromStatement(stmt);
            const rightTables = extractTablesFromStatement(stmt._next);
            const unionDetails: string[] = [];
            if (leftTables.length > 0) {
                unionDetails.push(`Left: ${leftTables.join(', ')}`);
            }
            if (rightTables.length > 0) {
                unionDetails.push(`Right: ${rightTables.join(', ')}`);
            }

            nodes.push({
                id: unionId,
                type: 'union',
                label: setOp.toUpperCase(),
                description: `${setOp} operation`,
                details: unionDetails.length > 0 ? unionDetails : undefined,
                x: 0, y: 0, width: 140, height: 60
            });

            // Connect both results to the union
            edges.push({
                id: genId('e'),
                source: resultId,
                target: unionId
            });
            edges.push({
                id: genId('e'),
                source: nextResultId,
                target: unionId
            });
        }
    }

    return resultId;
}

function processFromItem(fromItem: any, nodes: FlowNode[], edges: FlowEdge[], cteNames: Set<string> = new Set()): string | null {
    // Check for subquery
    if (fromItem.expr && fromItem.expr.ast) {
        stats.subqueries++;
        const subqueryId = genId('subquery');
        const alias = fromItem.as || 'subquery';

        // Parse subquery's internal structure
        const subChildren: FlowNode[] = [];
        const subChildEdges: FlowEdge[] = [];
        parseCteOrSubqueryInternals(fromItem.expr.ast, subChildren, subChildEdges, subqueryId, 0);

        // Subqueries as data sources should always be expanded
        // Calculate container size based on children
        const hasChildren = subChildren.length > 0;
        const containerWidth = hasChildren ? 220 : 160;
        const containerHeight = hasChildren ? 55 + subChildren.length * 28 : 60;

        nodes.push({
            id: subqueryId,
            type: 'subquery',
            label: alias,
            description: hasChildren ? `Derived table with ${subChildren.length} operations` : 'Derived table',
            children: hasChildren ? subChildren : undefined,
            childEdges: subChildEdges.length > 0 ? subChildEdges : undefined,
            expanded: false, // Start collapsed, expand on click to show subflow
            collapsible: hasChildren, // Only collapsible if has children
            tableCategory: 'derived',
            depth: 0, // Subquery depth
            x: 0, y: 0, width: containerWidth, height: containerHeight
        });
        return subqueryId;
    }

    // Regular table
    const tableName = getTableName(fromItem);
    if (!tableName || fromItem.join) { return null; } // Skip join tables, handled separately

    stats.tables++;
    trackTableUsage(tableName);
    const tableId = genId('table');
    // Determine if this is a CTE reference
    const isCteRef = cteNames.has(tableName.toLowerCase());
    nodes.push({
        id: tableId,
        type: 'table',
        label: tableName,
        description: isCteRef ? 'CTE reference' : 'Source table',
        details: fromItem.as ? [`Alias: ${fromItem.as}`] : undefined,
        tableCategory: isCteRef ? 'cte_reference' : 'physical',
        x: 0, y: 0, width: 140, height: 60
    });

    return tableId;
}

function getTableName(item: any): string {
    if (typeof item === 'string') { return item; }
    
    // For table references, prefer the actual table name over alias
    // The AST structure varies by parser, so check multiple possible fields
    if (item.table) {
        // If table is an object, extract the name
        if (typeof item.table === 'object') {
            return item.table.table || item.table.name || item.table.value || item.as || 'table';
        }
        return item.table;
    }
    
    // Fallback to name, then alias, then default
    return item.name || item.as || 'table';
}

function extractColumns(columns: any): string[] {
    if (!columns || columns === '*') {
        hasSelectStar = true;
        return ['*'];
    }
    if (!Array.isArray(columns)) { return ['*']; }

    return columns.map((col: any) => {
        if (col === '*' || col.expr?.column === '*') {
            hasSelectStar = true;
            return '*';
        }
        if (col.as) { return col.as; }
        if (col.expr?.column) { return col.expr.column; }
        if (col.expr?.name) { return `${col.expr.name}()`; }
        return 'expr';
    }).slice(0, 10); // Limit to first 10
}

/**
 * Extract column information from SELECT statement AST for dead column detection.
 * 
 * This function extracts detailed column information including:
 * - Column name (prioritizing alias if present)
 * - Source column and table references
 * - Aggregate and window function indicators
 * - Transformation types (renamed, aggregated, calculated, passthrough)
 * 
 * @param columns - Column AST nodes from the SELECT statement
 * @returns Array of ColumnInfo objects for dead column detection
 */
function extractColumnInfos(columns: any): ColumnInfo[] {
    if (!columns || columns === '*') {
        return [];
    }
    if (!Array.isArray(columns)) { return []; }

    return columns.map((col: any): ColumnInfo => {
        // Extract column name - prioritize alias, then column name, then expression
        let name: string;
        if (col.as) {
            name = String(col.as);
        } else if (col.expr?.column) {
            name = String(col.expr.column);
        } else if (col.expr?.name) {
            name = String(col.expr.name);
        } else if (col.expr?.value) {
            name = String(col.expr.value);
        } else if (typeof col === 'string') {
            name = col;
        } else {
            name = 'expr';
        }
        
        const expression = col.expr ? JSON.stringify(col.expr) : name;
        
        return {
            name: String(name),
            expression: expression,
            sourceColumn: col.expr?.column ? String(col.expr.column) : undefined,
            sourceTable: col.expr?.table ? (typeof col.expr.table === 'string' ? col.expr.table : String(col.expr.table.table || col.expr.table.name || '')) : undefined,
            isAggregate: col.expr?.type === 'aggr_func' || false,
            isWindowFunc: !!col.expr?.over,
            transformationType: col.as && col.expr?.column ? 'renamed' : 
                               col.expr?.type === 'aggr_func' ? 'aggregated' :
                               col.expr?.over ? 'calculated' : 'passthrough'
        };
    });
}

function extractWindowFunctions(columns: any): string[] {
    if (!columns || !Array.isArray(columns)) { return []; }

    const windowFuncs: string[] = [];
    for (const col of columns) {
        if (col.expr?.over) {
            // Safely extract function name
            let funcName = 'WINDOW';
            const expr = col.expr;
            if (typeof expr.name === 'string') {
                funcName = expr.name;
            } else if (expr.name?.name && typeof expr.name.name === 'string') {
                funcName = expr.name.name;
            } else if (expr.name?.value && typeof expr.name.value === 'string') {
                funcName = expr.name.value;
            }

            const partitionBy = col.expr.over?.partitionby?.map((p: any) => p.column || p.expr?.column).join(', ');
            let desc = `${funcName}()`;
            if (partitionBy) {
                desc += ` OVER(PARTITION BY ${partitionBy})`;
            }
            windowFuncs.push(desc);
        }
    }
    return windowFuncs;
}

// Extract detailed window function information
function extractWindowFunctionDetails(columns: any): Array<{
    name: string;
    partitionBy?: string[];
    orderBy?: string[];
    frame?: string;
}> {
    if (!columns || !Array.isArray(columns)) { return []; }

    const details: Array<{
        name: string;
        partitionBy?: string[];
        orderBy?: string[];
        frame?: string;
    }> = [];

    // Get dialect-specific window functions
    const windowFuncList = getWindowFunctions(currentDialect);

    for (const col of columns) {
        if (col.expr?.over) {
            // Safely extract function name - could be in various formats
            let funcName = 'WINDOW';
            const expr = col.expr;

            // Helper to safely get string value
            const getStringName = (obj: any): string | null => {
                if (typeof obj === 'string') {return obj;}
                if (obj && typeof obj.name === 'string') {return obj.name;}
                if (obj && typeof obj.value === 'string') {return obj.value;}
                return null;
            };

            // Try multiple paths to find the function name
            const nameFromExpr = getStringName(expr.name);
            if (nameFromExpr) {
                funcName = nameFromExpr;
            } else if (expr.type === 'aggr_func' || expr.type === 'function') {
                const aggName = getStringName(expr.name);
                if (aggName) {funcName = aggName;}
            } else if (expr.args?.expr) {
                const argsName = getStringName(expr.args.expr.name) || getStringName(expr.args.expr);
                if (argsName) {funcName = argsName;}
            }

            // Check for window function in alias patterns
            if (funcName === 'WINDOW' && col.as) {
                const alias = String(col.as).toLowerCase();
                if (alias.includes('prev') || alias.includes('lag')) {funcName = 'LAG';}
                else if (alias.includes('next') || alias.includes('lead')) {funcName = 'LEAD';}
                else if (alias.includes('rank')) {funcName = 'RANK';}
                else if (alias.includes('row_num')) {funcName = 'ROW_NUMBER';}
                else if (alias.includes('running') || alias.includes('total')) {funcName = 'SUM';}
                else if (alias.includes('avg') || alias.includes('average')) {funcName = 'AVG';}
            }

            // Final fallback - search JSON for known function names (dialect-aware)
            if (funcName === 'WINDOW') {
                try {
                    const exprStr = JSON.stringify(expr).toUpperCase();
                    for (const wf of windowFuncList) {
                        if (exprStr.includes(`"NAME":"${wf}"`) || exprStr.includes(`"${wf}"`)) {
                            funcName = wf;
                            break;
                        }
                    }
                } catch {
                    // Ignore JSON errors
                }
            }

            // Extract PARTITION BY columns
            const partitionBy = col.expr.over?.partitionby?.map((p: any) =>
                p.column || p.expr?.column || p.value || '?'
            ).filter(Boolean);

            // Extract ORDER BY columns
            const orderBy = col.expr.over?.orderby?.map((o: any) => {
                const colName = o.expr?.column || o.column || '?';
                const dir = o.type || '';
                return dir ? `${colName} ${dir}` : colName;
            }).filter(Boolean);

            // Extract frame clause if present
            let frame: string | undefined;
            if (col.expr.over?.frame) {
                const f = col.expr.over.frame;
                frame = `${f.type || 'ROWS'} ${f.start || ''} ${f.end ? 'TO ' + f.end : ''}`.trim();
            }

            // Ensure funcName is a clean string
            const cleanName = typeof funcName === 'string' ? funcName : 'WINDOW';

            details.push({
                name: cleanName.toUpperCase(),
                partitionBy: partitionBy?.length > 0 ? partitionBy : undefined,
                orderBy: orderBy?.length > 0 ? orderBy : undefined,
                frame
            });
        }
    }

    return details;
}

// Extract aggregate functions from SELECT columns (not just GROUP BY)
function extractAggregateFunctionDetails(columns: any): Array<{
    name: string;
    expression: string;
    alias?: string;
}> {
    if (!columns || !Array.isArray(columns)) { return []; }

    // Get dialect-specific aggregate functions
    const aggregateFuncSet = new Set(getAggregateFunctions(currentDialect));
    const details: Array<{ name: string; expression: string; alias?: string }> = [];

    function extractAggregatesFromExpr(expr: any): void {
        if (!expr) {return;}

        // Check if this is an aggregate function (dialect-aware)
        const exprFuncName = String(expr.name || '').toUpperCase();
        if (expr.type === 'aggr_func' || (exprFuncName && aggregateFuncSet.has(exprFuncName))) {
            const funcName = exprFuncName || 'AGG';
            
            // Extract arguments/expression
            let expression = funcName + '()';
            if (expr.args) {
                const args = expr.args.value || expr.args;
                if (Array.isArray(args)) {
                    const argStrs = args.map((arg: any) => {
                        if (arg.column) {return arg.column;}
                        if (arg.value) {return String(arg.value);}
                        if (arg.expr?.column) {return arg.expr.column;}
                        return '?';
                    });
                    expression = funcName + '(' + argStrs.join(', ') + ')';
                } else if (args.column) {
                    expression = funcName + '(' + args.column + ')';
                }
            }

            details.push({
                name: funcName,
                expression: expression,
                alias: undefined
            });
            return;
        }

        // Recursively check nested expressions
        if (expr.args) {
            const args = expr.args.value || expr.args;
            if (Array.isArray(args)) {
                args.forEach(extractAggregatesFromExpr);
            } else {
                extractAggregatesFromExpr(args);
            }
        }
        if (expr.left) {extractAggregatesFromExpr(expr.left);}
        if (expr.right) {extractAggregatesFromExpr(expr.right);}
    }

    for (const col of columns) {
        if (col.expr) {
            extractAggregatesFromExpr(col.expr);
            // Store alias if present
            if (col.as && details.length > 0) {
                details[details.length - 1].alias = col.as;
            }
        }
    }

    return details;
}

// Extract CASE statements from SELECT columns
function extractCaseStatementDetails(columns: any): Array<{
    conditions: Array<{ when: string; then: string }>;
    elseValue?: string;
    alias?: string;
}> {
    if (!columns || !Array.isArray(columns)) { return []; }

    const caseDetails: Array<{
        conditions: Array<{ when: string; then: string }>;
        elseValue?: string;
        alias?: string;
    }> = [];

    function formatExpr(expr: any): string {
        if (!expr) {return '?';}
        if (expr.column) {return expr.column;}
        if (expr.value) {return String(expr.value);}
        if (expr.type === 'binary_expr') {
            const left = formatExpr(expr.left);
            const right = formatExpr(expr.right);
            return `${left} ${expr.operator} ${right}`;
        }
        return 'expr';
    }

    for (const col of columns) {
        if (col.expr && col.expr.type === 'case') {
            const caseExpr = col.expr;
            const conditions: Array<{ when: string; then: string }> = [];

            if (caseExpr.args && Array.isArray(caseExpr.args)) {
                for (const arg of caseExpr.args) {
                    if (arg.cond && arg.result) {
                        conditions.push({
                            when: formatExpr(arg.cond),
                            then: formatExpr(arg.result)
                        });
                    }
                }
            }

            const elseValue = caseExpr.else ? formatExpr(caseExpr.else) : undefined;
            const alias = col.as;

            if (conditions.length > 0) {
                caseDetails.push({ conditions, elseValue, alias });
            }
        }
    }

    return caseDetails;
}

// Parse CTE or Subquery internal structure for nested visualization
// Phase 1 Feature: Breadcrumb Navigation
// Parse CTE/subquery internals and set parentId/depth for breadcrumb trail navigation
function parseCteOrSubqueryInternals(stmt: any, nodes: FlowNode[], edges: FlowEdge[], parentId?: string, depth: number = 0): void {
    if (!stmt) { return; }

    let previousId: string | null = null;

    // Extract tables from FROM clause
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            if (!fromItem.join) {
                const tableName = getTableName(fromItem);
                if (tableName && tableName !== 'table') {
                    const tableId = genId('child_table');
                    nodes.push({
                        id: tableId,
                        type: 'table',
                        label: tableName,
                        description: 'Table',
                        parentId: parentId,
                        depth: depth + 1,
                        x: 0, y: 0, width: 100, height: 32
                    });
                    if (previousId) {
                        edges.push({ id: genId('ce'), source: previousId, target: tableId });
                    }
                    previousId = tableId;
                }
            }
        }

        // Add joins
        for (const fromItem of stmt.from) {
            if (fromItem.join) {
                const joinId = genId('child_join');
                const joinTable = getTableName(fromItem);
                nodes.push({
                    id: joinId,
                    type: 'join',
                    label: `${fromItem.join} ${joinTable}`,
                    description: 'Join',
                    parentId: parentId,
                    depth: depth + 1,
                    x: 0, y: 0, width: 120, height: 32
                });
                if (previousId) {
                    edges.push({ id: genId('ce'), source: previousId, target: joinId });
                }
                previousId = joinId;
            }
        }
    }

    // Add WHERE if present
    if (stmt.where) {
        const whereId = genId('child_where');
        nodes.push({
            id: whereId,
            type: 'filter',
            label: 'WHERE',
            description: 'Filter',
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 80, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: whereId });
        }
        previousId = whereId;
    }

    // Add GROUP BY if present
    // groupby can be an array or an object with columns property
    const hasGroupBy = stmt.groupby && (
        (Array.isArray(stmt.groupby) && stmt.groupby.length > 0) ||
        (stmt.groupby.columns && Array.isArray(stmt.groupby.columns) && stmt.groupby.columns.length > 0)
    );
    if (hasGroupBy) {
        const groupId = genId('child_group');
        nodes.push({
            id: groupId,
            type: 'aggregate',
            label: 'GROUP BY',
            description: 'Aggregate',
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 90, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: groupId });
        }
        previousId = groupId;
    }

    // Add ORDER BY if present
    // orderby can be an array or an object with columns property
    const hasOrderBy = stmt.orderby && (
        (Array.isArray(stmt.orderby) && stmt.orderby.length > 0) ||
        (stmt.orderby.columns && Array.isArray(stmt.orderby.columns) && stmt.orderby.columns.length > 0)
    );
    if (hasOrderBy) {
        const sortId = genId('child_sort');
        nodes.push({
            id: sortId,
            type: 'sort',
            label: 'ORDER BY',
            description: 'Sort',
            parentId: parentId,
            depth: depth + 1,
            x: 0, y: 0, width: 90, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: sortId });
        }
    }
}

function extractConditions(where: any): string[] {
    const conditions: string[] = [];
    formatConditionRecursive(where, conditions);
    return conditions.slice(0, 5); // Limit to first 5
}

function formatConditionRecursive(expr: any, conditions: string[], depth = 0): void {
    if (!expr || depth > 3) { return; }

    if (expr.type === 'binary_expr') {
        if (expr.operator === 'AND' || expr.operator === 'OR') {
            formatConditionRecursive(expr.left, conditions, depth + 1);
            formatConditionRecursive(expr.right, conditions, depth + 1);
        } else {
            conditions.push(formatCondition(expr));
        }
    }
}

function formatCondition(expr: any): string {
    if (!expr) { return '?'; }

    if (expr.type === 'binary_expr') {
        const left = expr.left?.column || expr.left?.value || '?';
        const right = expr.right?.column || expr.right?.value || '?';
        return `${left} ${expr.operator} ${right}`;
    }

    return 'condition';
}

function extractTablesFromStatement(stmt: any): string[] {
    const tables: string[] = [];
    if (!stmt || !stmt.from) { return tables; }

    const fromItems = Array.isArray(stmt.from) ? stmt.from : [stmt.from];
    for (const item of fromItems) {
        const name = getTableName(item);
        if (name && name !== 'table') {
            tables.push(name);
        }
    }
    return tables;
}

function layoutGraph(nodes: FlowNode[], edges: FlowEdge[]): void {
    if (nodes.length === 0) { return; }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: 'TB',
        nodesep: 60,
        ranksep: 80,
        marginx: 40,
        marginy: 40
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes
    for (const node of nodes) {
        g.setNode(node.id, { width: node.width, height: node.height });
    }

    // Add edges
    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    // Run layout
    dagre.layout(g);

    // Apply positions
    for (const node of nodes) {
        const layoutNode = g.node(node.id);
        if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
            node.x = layoutNode.x - node.width / 2;
            node.y = layoutNode.y - node.height / 2;
        }
    }
}

// Extract column lineage from SELECT statement
function extractColumnLineage(stmt: any, nodes: FlowNode[]): ColumnLineage[] {
    const lineage: ColumnLineage[] = [];

    if (!stmt || stmt.type?.toLowerCase() !== 'select' || !stmt.columns) {
        return lineage;
    }

    // Build table alias map
    const tableAliasMap = new Map<string, string>();
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            const rawTable = fromItem.table || fromItem.name;
            const tableName = typeof rawTable === 'string' ? rawTable : (rawTable?.table || rawTable?.name || '');
            const rawAlias = fromItem.as || tableName;
            const alias = typeof rawAlias === 'string' ? rawAlias : (rawAlias?.table || rawAlias?.name || tableName);
            if (tableName && alias) {
                tableAliasMap.set(alias.toLowerCase(), tableName);
            }
        }
    }

    // Find table nodes for mapping
    const tableNodes = nodes.filter(n => n.type === 'table');

    // Process each column
    const columns = Array.isArray(stmt.columns) ? stmt.columns : [];
    for (const col of columns) {
        if (col === '*') {
            lineage.push({
                outputColumn: '*',
                sources: tableNodes.map(n => ({
                    table: n.label,
                    column: '*',
                    nodeId: n.id
                }))
            });
            continue;
        }

        const colName = col.as || col.expr?.column || col.expr?.name || 'expr';
        const sources: ColumnLineage['sources'] = [];

        // Try to extract source table and column
        if (col.expr) {
            extractSourcesFromExpr(col.expr, sources, tableAliasMap, tableNodes);
        }

        lineage.push({
            outputColumn: String(colName),
            sources
        });
    }

    return lineage;
}

// Recursively extract source columns from expression
function extractSourcesFromExpr(
    expr: any,
    sources: ColumnLineage['sources'],
    tableAliasMap: Map<string, string>,
    tableNodes: FlowNode[]
): void {
    if (!expr) {return;}

    // Direct column reference
    if (expr.type === 'column_ref' || expr.column) {
        const column = expr.column || expr.name;
        const rawTable = expr.table;
        const tableAlias = typeof rawTable === 'string' ? rawTable : (rawTable?.table || rawTable?.name || '');

        let tableName = tableAlias;
        if (tableAlias && tableAliasMap.has(tableAlias.toLowerCase())) {
            tableName = tableAliasMap.get(tableAlias.toLowerCase()) || tableAlias;
        }

        // Find matching table node
        const tableNode = tableNodes.find(n =>
            n.label.toLowerCase() === (tableName || '').toLowerCase() ||
            n.label.toLowerCase() === (tableAlias || '').toLowerCase()
        );

        if (tableName || tableNodes.length === 1) {
            sources.push({
                table: tableName || (tableNodes[0]?.label || 'unknown'),
                column: String(column),
                nodeId: tableNode?.id || tableNodes[0]?.id || ''
            });
        }
        return;
    }

    // Binary expression (e.g., a + b)
    if (expr.type === 'binary_expr') {
        extractSourcesFromExpr(expr.left, sources, tableAliasMap, tableNodes);
        extractSourcesFromExpr(expr.right, sources, tableAliasMap, tableNodes);
        return;
    }

    // Function call (including aggregates)
    if (expr.args) {
        const args = expr.args.value || expr.args;
        if (Array.isArray(args)) {
            for (const arg of args) {
                extractSourcesFromExpr(arg, sources, tableAliasMap, tableNodes);
            }
        } else if (typeof args === 'object') {
            extractSourcesFromExpr(args, sources, tableAliasMap, tableNodes);
        }
    }

    // CASE expression
    if (expr.type === 'case') {
        if (expr.args) {
            for (const caseArg of expr.args) {
                extractSourcesFromExpr(caseArg.cond, sources, tableAliasMap, tableNodes);
                extractSourcesFromExpr(caseArg.result, sources, tableAliasMap, tableNodes);
            }
        }
    }
}

// ============================================================
// REDESIGNED: Column-Level Lineage Visualization
// Now builds FULL lineage paths from source tables to output
// ============================================================

/**
 * Generate column flows with full lineage paths from source to output
 */
function generateColumnFlows(
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[]
): ColumnFlow[] {
    const columnFlows: ColumnFlow[] = [];
    if (!stmt || stmt.type?.toLowerCase() !== 'select') {
        return columnFlows;
    }

    // Build node map for quick lookup
    const nodeMap = new Map<string, FlowNode>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    // Build edge map: target -> sources (for tracing backwards)
    const incomingEdges = new Map<string, string[]>();
    edges.forEach(edge => {
        if (!incomingEdges.has(edge.target)) {
            incomingEdges.set(edge.target, []);
        }
        incomingEdges.get(edge.target)!.push(edge.source);
    });

    // Find SELECT nodes (output nodes)
    const selectNodes = nodes.filter(n => n.type === 'select');
    if (selectNodes.length === 0) {return columnFlows;}

    // Process each SELECT node's output columns
    for (const selectNode of selectNodes) {
        if (!selectNode.columns || selectNode.columns.length === 0) {continue;}

        for (const outputCol of selectNode.columns) {
            // Build full lineage path for this output column
            const lineagePath = buildColumnLineagePath(
                outputCol,
                selectNode,
                nodeMap,
                incomingEdges
            );

            if (lineagePath.length > 0) {
                const flowId = `lineage_${selectNode.id}_${outputCol.name}`;
                columnFlows.push({
                    id: flowId,
                    outputColumn: outputCol.name,
                    outputNodeId: selectNode.id,
                    lineagePath
                });
            }
        }
    }

    return columnFlows;
}

/**
 * Build complete lineage path from source table to output column
 */
function buildColumnLineagePath(
    column: ColumnInfo,
    currentNode: FlowNode,
    nodeMap: Map<string, FlowNode>,
    incomingEdges: Map<string, string[]>,
    visited: Set<string> = new Set()
): ColumnFlow['lineagePath'] {
    const path: ColumnFlow['lineagePath'] = [];

    // Prevent infinite loops
    if (visited.has(currentNode.id)) {return path;}
    visited.add(currentNode.id);

    // Determine transformation at current node
    const transformation = getTransformationType(column, currentNode);

    // Add current node to path
    path.push({
        nodeId: currentNode.id,
        nodeName: currentNode.label,
        nodeType: currentNode.type,
        columnName: column.name,
        transformation,
        expression: column.expression !== column.name ? column.expression : undefined
    });

    // If this is a table node, we've reached the source
    if (currentNode.type === 'table') {
        // Mark as source
        path[path.length - 1].transformation = 'source';
        return path;
    }

    // Trace back through incoming edges
    const incoming = incomingEdges.get(currentNode.id) || [];

    for (const sourceNodeId of incoming) {
        const sourceNode = nodeMap.get(sourceNodeId);
        if (!sourceNode) {continue;}

        // Find matching source column
        const sourceColumn = findSourceColumn(column, sourceNode, currentNode);

        if (sourceColumn) {
            // Recursively trace this source
            const sourcePath = buildColumnLineagePath(
                sourceColumn,
                sourceNode,
                nodeMap,
                incomingEdges,
                new Set(visited)
            );

            if (sourcePath.length > 0) {
                // Prepend source path (source comes before current)
                return [...sourcePath, ...path];
            }
        }
    }

    // If we couldn't trace further and column has explicit source info
    if (column.sourceTable && column.sourceColumn) {
        // Try to find the source table node
        for (const node of nodeMap.values()) {
            if (node.type === 'table' &&
                (node.label.toLowerCase() === column.sourceTable.toLowerCase() ||
                 node.label.toLowerCase().includes(column.sourceTable.toLowerCase()))) {
                path.unshift({
                    nodeId: node.id,
                    nodeName: node.label,
                    nodeType: 'table',
                    columnName: column.sourceColumn,
                    transformation: 'source'
                });
                break;
            }
        }
    }

    return path;
}

/**
 * Find the source column in a source node that maps to the target column
 */
function findSourceColumn(
    targetColumn: ColumnInfo,
    sourceNode: FlowNode,
    targetNode: FlowNode
): ColumnInfo | null {
    // If target column has explicit source info, use it
    if (targetColumn.sourceColumn && targetColumn.sourceTable) {
        if (sourceNode.label.toLowerCase().includes(targetColumn.sourceTable.toLowerCase())) {
            return {
                name: targetColumn.sourceColumn,
                expression: targetColumn.sourceColumn,
                sourceTable: targetColumn.sourceTable
            };
        }
    }

    // For aggregate nodes, extract column from expression
    if (sourceNode.type === 'aggregate' && sourceNode.aggregateDetails) {
        for (const aggFunc of sourceNode.aggregateDetails.functions) {
            const outputName = aggFunc.alias || aggFunc.name;
            if (outputName.toLowerCase() === targetColumn.name.toLowerCase() ||
                targetColumn.expression?.toLowerCase().includes(outputName.toLowerCase())) {
                return {
                    name: outputName,
                    expression: aggFunc.expression,
                    isAggregate: true
                };
            }
        }
    }

    // For window nodes, check window functions
    if (sourceNode.type === 'window' && sourceNode.windowDetails) {
        for (const winFunc of sourceNode.windowDetails.functions) {
            if (winFunc.name.toLowerCase() === targetColumn.name.toLowerCase()) {
                return {
                    name: winFunc.name,
                    expression: `${winFunc.name}() OVER (...)`,
                    isWindowFunc: true
                };
            }
        }
    }

    // Check source node columns
    if (sourceNode.columns) {
        for (const sourceCol of sourceNode.columns) {
            // Direct name match
            if (sourceCol.name.toLowerCase() === targetColumn.name.toLowerCase()) {
                return sourceCol;
            }
            // Source column match
            if (sourceCol.name.toLowerCase() === targetColumn.sourceColumn?.toLowerCase()) {
                return sourceCol;
            }
            // Expression match
            if (targetColumn.expression?.toLowerCase().includes(sourceCol.name.toLowerCase())) {
                return sourceCol;
            }
        }
    }

    // For JOIN nodes, check if the column could pass through
    if (sourceNode.type === 'join') {
        return {
            name: targetColumn.sourceColumn || targetColumn.name,
            expression: targetColumn.sourceColumn || targetColumn.name,
            sourceTable: targetColumn.sourceTable
        };
    }

    // Default: assume passthrough with same name
    return {
        name: targetColumn.sourceColumn || targetColumn.name,
        expression: targetColumn.sourceColumn || targetColumn.name
    };
}

/**
 * Determine the transformation type at a node
 */
function getTransformationType(
    column: ColumnInfo,
    node: FlowNode
): ColumnFlow['lineagePath'][0]['transformation'] {
    // Source tables
    if (node.type === 'table') {
        return 'source';
    }

    // Aggregations
    if (column.isAggregate || node.type === 'aggregate') {
        return 'aggregated';
    }

    // Window functions
    if (column.isWindowFunc || node.type === 'window') {
        return 'calculated';
    }

    // JOINs
    if (node.type === 'join') {
        return 'joined';
    }

    // Renamed columns
    if (column.sourceColumn &&
        column.name.toLowerCase() !== column.sourceColumn.toLowerCase()) {
        return 'renamed';
    }

    // Calculated expressions
    if (column.expression &&
        column.expression !== column.name &&
        !column.expression.match(/^[\w.]+$/)) {
        return 'calculated';
    }

    return 'passthrough';
}

/**
 * Calculate column positions on nodes for visual rendering
 * Positions are stored as RELATIVE offsets from the node's origin (node.x, node.y)
 * The renderer will add node.x/node.y to get absolute coordinates
 */
function calculateColumnPositions(nodes: FlowNode[]): void {
    for (const node of nodes) {
        if (!node.columns || node.columns.length === 0) {
            continue;
        }

        const positions = new Map<string, { x: number; y: number }>();
        const visibleColumns: string[] = [];

        // Calculate positions based on node type (relative to node origin)
        switch (node.type) {
            case 'table':
                // Position columns vertically along the right edge
                const spacing = 18;

                node.columns.forEach((col, index) => {
                    if (index < 10) { // Limit visible columns
                        visibleColumns.push(col.name);
                        positions.set(col.name, {
                            x: node.width,  // Right edge (relative)
                            y: 20 + index * spacing  // Offset from top (relative)
                        });
                    }
                });
                break;

            case 'select':
                // Position columns horizontally at the bottom
                const hSpacing = 80;

                node.columns.forEach((col, index) => {
                    if (index < 8) { // Limit visible columns
                        visibleColumns.push(col.name);
                        positions.set(col.name, {
                            x: 10 + (index % 4) * hSpacing,  // Offset from left (relative)
                            y: node.height + Math.floor(index / 4) * 15  // Bottom edge (relative)
                        });
                    }
                });
                break;

            case 'aggregate':
                // Position at output point (center bottom)
                if (node.aggregateDetails) {
                    node.aggregateDetails.functions.forEach((func, index) => {
                        const colName = func.alias || func.name;
                        visibleColumns.push(colName);
                        positions.set(colName, {
                            x: node.width / 2,  // Center (relative)
                            y: node.height + (index * 15)  // Below node (relative)
                        });
                    });
                }
                break;

            case 'window':
                // Position at output point
                if (node.windowDetails) {
                    node.windowDetails.functions.forEach((func, index) => {
                        visibleColumns.push(func.name);
                        positions.set(func.name, {
                            x: node.width / 2,  // Center (relative)
                            y: node.height + (index * 15)  // Below node (relative)
                        });
                    });
                }
                break;

            default:
                // For other node types, position at center bottom
                node.columns.slice(0, 5).forEach((col, index) => {
                    visibleColumns.push(col.name);
                    positions.set(col.name, {
                        x: node.width / 2,  // Center (relative)
                        y: node.height + (index * 12)  // Below node (relative)
                    });
                });
                break;
        }

        node.columnPositions = positions;
        node.visibleColumns = visibleColumns;
    }
}
