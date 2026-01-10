import { Parser } from 'node-sql-parser';
import dagre from 'dagre';

export type SqlDialect = 'MySQL' | 'PostgreSQL' | 'Transact-SQL' | 'MariaDB' | 'SQLite';

export interface FlowNode {
    id: string;
    type: 'table' | 'filter' | 'join' | 'aggregate' | 'sort' | 'limit' | 'select' | 'result' | 'cte' | 'union' | 'subquery' | 'window';
    label: string;
    description?: string;
    details?: string[];
    x: number;
    y: number;
    width: number;
    height: number;
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

export interface ParseResult {
    nodes: FlowNode[];
    edges: FlowEdge[];
    stats: QueryStats;
    hints: OptimizationHint[];
    sql: string;
    error?: string;
}

export interface BatchParseResult {
    queries: ParseResult[];
    totalStats: QueryStats;
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
            if (char === '(') {depth++;}
            if (char === ')') {depth--;}
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

    for (const stmt of statements) {
        queries.push(parseSql(stmt, dialect));
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

    return { queries, totalStats };
}

export function parseSql(sql: string, dialect: SqlDialect = 'MySQL'): ParseResult {
    nodeCounter = 0;
    resetStats();
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    if (!sql || !sql.trim()) {
        return { nodes, edges, stats, hints, sql, error: 'No SQL provided' };
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

        return { nodes, edges, stats, hints, sql };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Parse error';
        return { nodes: [], edges: [], stats, hints, sql, error: message };
    }
}

function generateHints(stmt: any): void {
    if (!stmt) {return;}

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
    if (!stmt || !stmt.type) {return null;}

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

function processSelect(stmt: any, nodes: FlowNode[], edges: FlowEdge[]): string {
    const nodeIds: string[] = [];

    // Process CTEs first
    if (stmt.with && Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
            stats.ctes++;
            const cteId = genId('cte');
            const cteName = cte.name?.value || cte.name || 'CTE';
            nodes.push({
                id: cteId,
                type: 'cte',
                label: `WITH ${cteName}`,
                description: 'Common Table Expression',
                x: 0, y: 0, width: 160, height: 60
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
                const tableId = processFromItem(fromItem, nodes, edges);
                if (tableId) {
                    tableIds.push(tableId);
                    const tableName = getTableName(fromItem);
                    joinTableMap.set(tableName, tableId);
                }
            } else {
                // Create table node for join tables too
                stats.tables++;
                const tableName = getTableName(fromItem);
                const tableId = genId('table');
                nodes.push({
                    id: tableId,
                    type: 'table',
                    label: tableName,
                    description: 'Joined table',
                    details: fromItem.as ? [`Alias: ${fromItem.as}`] : undefined,
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

    // Check for window functions in columns
    const windowFuncs = extractWindowFunctions(stmt.columns);
    if (windowFuncs.length > 0) {
        stats.windowFunctions += windowFuncs.length;
        const windowId = genId('window');
        nodes.push({
            id: windowId,
            type: 'window',
            label: 'WINDOW',
            description: 'Window functions',
            details: windowFuncs.slice(0, 3),
            x: 0, y: 0, width: 150, height: 60
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

function processFromItem(fromItem: any, nodes: FlowNode[], edges: FlowEdge[]): string | null {
    // Check for subquery
    if (fromItem.expr && fromItem.expr.ast) {
        stats.subqueries++;
        const subqueryId = genId('subquery');
        const alias = fromItem.as || 'subquery';
        nodes.push({
            id: subqueryId,
            type: 'subquery',
            label: `(${alias})`,
            description: 'Subquery',
            x: 0, y: 0, width: 140, height: 60
        });
        return subqueryId;
    }

    // Regular table
    const tableName = getTableName(fromItem);
    if (!tableName || fromItem.join) {return null;} // Skip join tables, handled separately

    stats.tables++;
    const tableId = genId('table');
    nodes.push({
        id: tableId,
        type: 'table',
        label: tableName,
        description: 'Source table',
        details: fromItem.as ? [`Alias: ${fromItem.as}`] : undefined,
        x: 0, y: 0, width: 140, height: 60
    });

    return tableId;
}

function getTableName(item: any): string {
    if (typeof item === 'string') {return item;}
    return item.table || item.as || item.name || 'table';
}

function extractColumns(columns: any): string[] {
    if (!columns || columns === '*') {
        hasSelectStar = true;
        return ['*'];
    }
    if (!Array.isArray(columns)) {return ['*'];}

    return columns.map((col: any) => {
        if (col === '*' || col.expr?.column === '*') {
            hasSelectStar = true;
            return '*';
        }
        if (col.as) {return col.as;}
        if (col.expr?.column) {return col.expr.column;}
        if (col.expr?.name) {return `${col.expr.name}()`;}
        return 'expr';
    }).slice(0, 10); // Limit to first 10
}

function extractWindowFunctions(columns: any): string[] {
    if (!columns || !Array.isArray(columns)) {return [];}

    const windowFuncs: string[] = [];
    for (const col of columns) {
        if (col.expr?.over) {
            const funcName = col.expr.name || 'WINDOW';
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

function extractConditions(where: any): string[] {
    const conditions: string[] = [];
    formatConditionRecursive(where, conditions);
    return conditions.slice(0, 5); // Limit to first 5
}

function formatConditionRecursive(expr: any, conditions: string[], depth = 0): void {
    if (!expr || depth > 3) {return;}

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
    if (!expr) {return '?';}

    if (expr.type === 'binary_expr') {
        const left = expr.left?.column || expr.left?.value || '?';
        const right = expr.right?.column || expr.right?.value || '?';
        return `${left} ${expr.operator} ${right}`;
    }

    return 'condition';
}

function extractTablesFromStatement(stmt: any): string[] {
    const tables: string[] = [];
    if (!stmt || !stmt.from) {return tables;}

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
    if (nodes.length === 0) {return;}

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
