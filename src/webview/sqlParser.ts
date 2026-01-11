import { Parser } from 'node-sql-parser';
import dagre from 'dagre';

export type SqlDialect = 'MySQL' | 'PostgreSQL' | 'TransactSQL' | 'MariaDB' | 'SQLite' | 'Snowflake' | 'BigQuery' | 'Hive' | 'Redshift' | 'Athena' | 'Trino';

export interface FlowNode {
    id: string;
    type: 'table' | 'filter' | 'join' | 'aggregate' | 'sort' | 'limit' | 'select' | 'result' | 'cte' | 'union' | 'subquery' | 'window' | 'case';
    label: string;
    description?: string;
    details?: string[];
    x: number;
    y: number;
    width: number;
    height: number;
    // Line numbers in SQL for editor sync
    startLine?: number;
    endLine?: number;
    // Join type for differentiated styling
    joinType?: string;
    // Table category for visual distinction
    tableCategory?: 'physical' | 'derived' | 'cte_reference';
    // For nested visualizations (CTEs, subqueries)
    children?: FlowNode[];
    childEdges?: FlowEdge[];
    expanded?: boolean;
    collapsible?: boolean; // Can this node be collapsed?
    // For window functions - detailed breakdown
    windowDetails?: {
        functions: Array<{
            name: string;
            partitionBy?: string[];
            orderBy?: string[];
            frame?: string;
        }>;
    };
    // For aggregate nodes - function details
    aggregateDetails?: {
        functions: Array<{
            name: string;
            expression: string;
            alias?: string;
        }>;
        groupBy?: string[];
        having?: string;
    };
    // For CASE nodes - case details
    caseDetails?: {
        cases: Array<{
            conditions: Array<{
                when: string;
                then: string;
            }>;
            elseValue?: string;
            alias?: string;
        }>;
    };
    // For SELECT nodes - column details with source tracking
    columns?: ColumnInfo[];
}

export interface FlowEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
}

export interface QueryStats {
    tables: number;
    joins: number;
    subqueries: number;
    ctes: number;
    aggregations: number;
    windowFunctions: number;
    unions: number;
    conditions: number;
    complexity: 'Simple' | 'Moderate' | 'Complex' | 'Very Complex';
    complexityScore: number;
}

export interface OptimizationHint {
    type: 'warning' | 'info' | 'error';
    message: string;
    suggestion?: string;
}

// Column lineage tracking
export interface ColumnInfo {
    name: string;           // Column name or alias
    expression: string;     // Full expression
    sourceTable?: string;   // Source table name if direct column
    sourceColumn?: string;  // Source column name if direct column  
    isAggregate?: boolean;  // Is this an aggregate function?
    isWindowFunc?: boolean; // Is this a window function?
}

export interface ColumnLineage {
    outputColumn: string;
    sources: Array<{
        table: string;
        column: string;
        nodeId: string;
    }>;
}

export interface ParseResult {
    nodes: FlowNode[];
    edges: FlowEdge[];
    stats: QueryStats;
    hints: OptimizationHint[];
    sql: string;
    columnLineage: ColumnLineage[];
    tableUsage: Map<string, number>; // Table name -> usage count
    error?: string;
}

export interface BatchParseResult {
    queries: ParseResult[];
    totalStats: QueryStats;
    queryLineRanges?: Array<{ startLine: number; endLine: number }>; // Line ranges for each query (1-indexed)
}

const NODE_COLORS: Record<FlowNode['type'], string> = {
    table: '#3b82f6',      // blue
    filter: '#8b5cf6',     // purple
    join: '#ec4899',       // pink
    aggregate: '#f59e0b',  // amber
    sort: '#10b981',       // green
    limit: '#06b6d4',      // cyan
    select: '#6366f1',     // indigo
    result: '#22c55e',     // green
    cte: '#a855f7',        // purple
    union: '#f97316',      // orange
    subquery: '#14b8a6',   // teal
    window: '#d946ef',     // fuchsia
    case: '#eab308',       // yellow
};

export function getNodeColor(type: FlowNode['type']): string {
    return NODE_COLORS[type] || '#6366f1';
}

// Stats tracking during parsing
let stats: QueryStats;
let hints: OptimizationHint[];
let nodeCounter = 0;
let hasSelectStar = false;
let hasNoLimit = false;
let statementType = '';
let tableUsageMap: Map<string, number> = new Map();

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
                // Tables appear in FROM or JOIN clauses
                const fromLines = keywordLines.get('FROM') || [];
                if (fromLines.length > 0) {
                    node.startLine = fromLines[0];
                }
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
                        if (node.startLine) break;
                    }
                }
                break;
            }
            case 'filter': {
                if (node.label === 'WHERE') {
                    const whereLines = keywordLines.get('WHERE') || [];
                    if (whereLines.length > 0) node.startLine = whereLines[0];
                } else if (node.label === 'HAVING') {
                    const havingLines = keywordLines.get('HAVING') || [];
                    if (havingLines.length > 0) node.startLine = havingLines[0];
                }
                break;
            }
            case 'aggregate': {
                const groupLines = keywordLines.get('GROUP BY') || [];
                if (groupLines.length > 0) node.startLine = groupLines[0];
                break;
            }
            case 'sort': {
                const orderLines = keywordLines.get('ORDER BY') || [];
                if (orderLines.length > 0) node.startLine = orderLines[0];
                break;
            }
            case 'limit': {
                const limitLines = keywordLines.get('LIMIT') || [];
                if (limitLines.length > 0) node.startLine = limitLines[0];
                break;
            }
            case 'select': {
                const selectLines = keywordLines.get('SELECT') || [];
                if (selectLines.length > 0) node.startLine = selectLines[0];
                break;
            }
            case 'cte': {
                const withLines = keywordLines.get('WITH') || [];
                if (withLines.length > 0) node.startLine = withLines[0];
                break;
            }
            case 'union': {
                const unionLines = keywordLines.get('UNION') || keywordLines.get('INTERSECT') || keywordLines.get('EXCEPT') || [];
                if (unionLines.length > 0) node.startLine = unionLines[0];
                break;
            }
            case 'result': {
                // Result is at the end - use last SELECT line
                const selectLines = keywordLines.get('SELECT') || [];
                if (selectLines.length > 0) node.startLine = selectLines[0];
                break;
            }
        }
    }
}

export function parseSql(sql: string, dialect: SqlDialect = 'MySQL'): ParseResult {
    nodeCounter = 0;
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

        // Use dagre for layout
        layoutGraph(nodes, edges);

        // Assign line numbers to nodes for editor sync
        assignLineNumbers(nodes, sql);

        // Extract column lineage
        const columnLineage = extractColumnLineage(statements[0], nodes);

        return { nodes, edges, stats, hints, sql, columnLineage, tableUsage: tableUsageMap };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Parse error';
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
            suggestion: 'Multiple tables without JOIN conditions will produce all row combinations'
        });
    }
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
    if (stmt.table) {
        const tables = Array.isArray(stmt.table) ? stmt.table : [stmt.table];
        for (const t of tables) {
            stats.tables++;
            const tableId = genId('table');
            const tableName = t.table || t.name || t;
            nodes.push({
                id: tableId,
                type: 'table',
                label: String(tableName),
                description: 'Target table',
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

            if (cte.stmt) {
                // Recursively parse the CTE's SELECT statement
                parseCteOrSubqueryInternals(cte.stmt, cteChildren, cteChildEdges);
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
                childEdges: cteChildEdges.length > 0 ? cteChildEdges : undefined,
                expanded: true,
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

                // Connect left side to join (previous join result or first table)
                if (leftTableId) {
                    edges.push({
                        id: genId('e'),
                        source: leftTableId,
                        target: joinId
                    });
                }

                // Connect right side (join table) to join
                if (rightTableId && rightTableId !== leftTableId) {
                    edges.push({
                        id: genId('e'),
                        source: rightTableId,
                        target: joinId
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

        if (previousId) {
            edges.push({
                id: genId('e'),
                source: previousId,
                target: whereId
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
    nodes.push({
        id: selectId,
        type: 'select',
        label: 'SELECT',
        description: 'Project columns',
        details: columns.length <= 5 ? columns : [`${columns.length} columns`],
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
        parseCteOrSubqueryInternals(fromItem.expr.ast, subChildren, subChildEdges);

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
            expanded: true, // Always expanded for data source subqueries
            tableCategory: 'derived',
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
    return item.table || item.as || item.name || 'table';
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

    for (const col of columns) {
        if (col.expr?.over) {
            // Safely extract function name - could be in various formats
            let funcName = 'WINDOW';
            const expr = col.expr;

            // Common window functions to check for
            const WINDOW_FUNCS = ['LAG', 'LEAD', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE',
                'FIRST_VALUE', 'LAST_VALUE', 'NTH_VALUE', 'SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];

            // Helper to safely get string value
            const getStringName = (obj: any): string | null => {
                if (typeof obj === 'string') return obj;
                if (obj && typeof obj.name === 'string') return obj.name;
                if (obj && typeof obj.value === 'string') return obj.value;
                return null;
            };

            // Try multiple paths to find the function name
            const nameFromExpr = getStringName(expr.name);
            if (nameFromExpr) {
                funcName = nameFromExpr;
            } else if (expr.type === 'aggr_func' || expr.type === 'function') {
                const aggName = getStringName(expr.name);
                if (aggName) funcName = aggName;
            } else if (expr.args?.expr) {
                const argsName = getStringName(expr.args.expr.name) || getStringName(expr.args.expr);
                if (argsName) funcName = argsName;
            }

            // Check for window function in alias patterns
            if (funcName === 'WINDOW' && col.as) {
                const alias = String(col.as).toLowerCase();
                if (alias.includes('prev') || alias.includes('lag')) funcName = 'LAG';
                else if (alias.includes('next') || alias.includes('lead')) funcName = 'LEAD';
                else if (alias.includes('rank')) funcName = 'RANK';
                else if (alias.includes('row_num')) funcName = 'ROW_NUMBER';
                else if (alias.includes('running') || alias.includes('total')) funcName = 'SUM';
                else if (alias.includes('avg') || alias.includes('average')) funcName = 'AVG';
            }

            // Final fallback - search JSON for known function names
            if (funcName === 'WINDOW') {
                try {
                    const exprStr = JSON.stringify(expr).toUpperCase();
                    for (const wf of WINDOW_FUNCS) {
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

    const aggregateFuncs = ['SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'GROUP_CONCAT', 'STRING_AGG', 'ARRAY_AGG'];
    const details: Array<{ name: string; expression: string; alias?: string }> = [];

    function extractAggregatesFromExpr(expr: any): void {
        if (!expr) return;

        // Check if this is an aggregate function
        if (expr.type === 'aggr_func' || (expr.name && aggregateFuncs.includes(String(expr.name).toUpperCase()))) {
            const funcName = String(expr.name || 'AGG').toUpperCase();
            
            // Extract arguments/expression
            let expression = funcName + '()';
            if (expr.args) {
                const args = expr.args.value || expr.args;
                if (Array.isArray(args)) {
                    const argStrs = args.map((arg: any) => {
                        if (arg.column) return arg.column;
                        if (arg.value) return String(arg.value);
                        if (arg.expr?.column) return arg.expr.column;
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
        if (expr.left) extractAggregatesFromExpr(expr.left);
        if (expr.right) extractAggregatesFromExpr(expr.right);
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
        if (!expr) return '?';
        if (expr.column) return expr.column;
        if (expr.value) return String(expr.value);
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
function parseCteOrSubqueryInternals(stmt: any, nodes: FlowNode[], edges: FlowEdge[]): void {
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
            x: 0, y: 0, width: 80, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: whereId });
        }
        previousId = whereId;
    }

    // Add GROUP BY if present
    if (stmt.groupby && Array.isArray(stmt.groupby) && stmt.groupby.length > 0) {
        const groupId = genId('child_group');
        nodes.push({
            id: groupId,
            type: 'aggregate',
            label: 'GROUP BY',
            description: 'Aggregate',
            x: 0, y: 0, width: 90, height: 32
        });
        if (previousId) {
            edges.push({ id: genId('ce'), source: previousId, target: groupId });
        }
        previousId = groupId;
    }

    // Add ORDER BY if present
    if (stmt.orderby && Array.isArray(stmt.orderby) && stmt.orderby.length > 0) {
        const sortId = genId('child_sort');
        nodes.push({
            id: sortId,
            type: 'sort',
            label: 'ORDER BY',
            description: 'Sort',
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
    if (!expr) return;

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
