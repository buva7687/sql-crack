import { Parser } from 'node-sql-parser';
import dagre from 'dagre';

export type SqlDialect = 'MySQL' | 'PostgreSQL' | 'Transact-SQL' | 'MariaDB' | 'SQLite';

export interface FlowNode {
    id: string;
    type: 'table' | 'filter' | 'join' | 'aggregate' | 'sort' | 'limit' | 'select' | 'result' | 'cte' | 'union' | 'subquery';
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

export interface ParseResult {
    nodes: FlowNode[];
    edges: FlowEdge[];
    error?: string;
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
};

export function getNodeColor(type: FlowNode['type']): string {
    return NODE_COLORS[type] || '#6366f1';
}

let nodeCounter = 0;

function genId(prefix: string): string {
    return `${prefix}_${nodeCounter++}`;
}

export function parseSql(sql: string, dialect: SqlDialect = 'MySQL'): ParseResult {
    nodeCounter = 0;
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    if (!sql || !sql.trim()) {
        return { nodes, edges, error: 'No SQL provided' };
    }

    const parser = new Parser();

    try {
        const ast = parser.astify(sql, { database: dialect });
        const statements = Array.isArray(ast) ? ast : [ast];

        for (const stmt of statements) {
            processStatement(stmt, nodes, edges);
        }

        // Use dagre for layout
        layoutGraph(nodes, edges);

        return { nodes, edges };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Parse error';
        return { nodes: [], edges: [], error: message };
    }
}

function processStatement(stmt: any, nodes: FlowNode[], edges: FlowEdge[]): string | null {
    if (!stmt || !stmt.type) {return null;}

    const stmtType = stmt.type.toLowerCase();

    if (stmtType === 'select') {
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

    return rootId;
}

function processSelect(stmt: any, nodes: FlowNode[], edges: FlowEdge[]): string {
    const nodeIds: string[] = [];

    // Process CTEs first
    if (stmt.with && Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
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

    // Process FROM tables (data sources)
    const tableIds: string[] = [];
    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            const tableId = processFromItem(fromItem, nodes, edges);
            if (tableId) {tableIds.push(tableId);}
        }
    }

    // Process JOINs - find the last table to connect to
    let lastTableId = tableIds[tableIds.length - 1];

    if (stmt.from && Array.isArray(stmt.from)) {
        for (const fromItem of stmt.from) {
            if (fromItem.join) {
                const joinId = genId('join');
                const joinType = fromItem.join || 'JOIN';
                const joinTable = getTableName(fromItem);

                nodes.push({
                    id: joinId,
                    type: 'join',
                    label: joinType.toUpperCase(),
                    description: `Join with ${joinTable}`,
                    details: fromItem.on ? [formatCondition(fromItem.on)] : undefined,
                    x: 0, y: 0, width: 140, height: 60
                });

                // Connect previous table to join
                if (lastTableId) {
                    edges.push({
                        id: genId('e'),
                        source: lastTableId,
                        target: joinId
                    });
                }
                lastTableId = joinId;
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

    // Process WHERE
    let previousId = lastTableId || tableIds[0];
    if (stmt.where) {
        const whereId = genId('filter');
        const conditions = extractConditions(stmt.where);
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
        const nextResultId = processStatement(stmt._next, nodes, edges);
        if (nextResultId) {
            const unionId = genId('union');
            const setOp = stmt.set_op || 'UNION';
            nodes.push({
                id: unionId,
                type: 'union',
                label: setOp.toUpperCase(),
                description: `${setOp} operation`,
                x: 0, y: 0, width: 120, height: 60
            });

            edges.push({
                id: genId('e'),
                source: resultId,
                target: unionId
            });
        }
    }

    return resultId;
}

function processFromItem(fromItem: any, nodes: FlowNode[], edges: FlowEdge[]): string | null {
    // Check for subquery
    if (fromItem.expr && fromItem.expr.ast) {
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
    if (!columns || columns === '*') {return ['*'];}
    if (!Array.isArray(columns)) {return ['*'];}

    return columns.map((col: any) => {
        if (col === '*' || col.expr?.column === '*') {return '*';}
        if (col.as) {return col.as;}
        if (col.expr?.column) {return col.expr.column;}
        if (col.expr?.name) {return `${col.expr.name}()`;}
        return 'expr';
    }).slice(0, 10); // Limit to first 10
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
