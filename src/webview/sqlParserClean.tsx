import React from 'react';
import { Parser } from 'node-sql-parser';
import { Node, Edge } from 'reactflow';
import dagre from 'dagre';

const parser = new Parser();

export type SqlDialect = 'MySQL' | 'PostgreSQL' | 'Transact-SQL' | 'MariaDB' | 'SQLite';

let nodeIdCounter = 0;

function generateId(prefix: string = 'node'): string {
    return `${prefix}_${nodeIdCounter++}`;
}

// Professional color scheme
const COLORS = {
    source: '#3b82f6',      // Blue - Source tables
    filter: '#8b5cf6',      // Purple - Filters
    join: '#ec4899',        // Pink - Joins
    aggregate: '#f59e0b',   // Orange - Aggregations
    sort: '#10b981',        // Green - Sorting
    limit: '#06b6d4',       // Cyan - Limit
    result: '#6366f1',      // Indigo - Final result
};

// Layout nodes using dagre for clean top-to-bottom flow
function getLayoutedElements(nodes: Node[], edges: Edge[]) {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({
        rankdir: 'TB',
        nodesep: 100,
        ranksep: 120,
        marginx: 50,
        marginy: 50
    });

    nodes.forEach((node) => {
        const width = 280;
        const height = 80;
        dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.position = {
            x: nodeWithPosition.x - 140,
            y: nodeWithPosition.y - 40,
        };
    });

    return { nodes, edges };
}

interface NodeMetadata {
    type: string;
    details: string[];
    sqlFragment?: string;
}

function createNode(id: string, label: string, description: string, color: string, metadata?: NodeMetadata): Node {
    return {
        id,
        type: 'default',
        data: {
            label: (
                <div style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{
                        fontWeight: 600,
                        fontSize: '14px',
                        marginBottom: '4px',
                        color: '#fff'
                    }}>
                        {label}
                    </div>
                    <div style={{
                        fontSize: '11px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        lineHeight: '1.4'
                    }}>
                        {description}
                    </div>
                </div>
            ),
            nodeTitle: label,
            nodeDescription: description,
            metadata: metadata || { type: label, details: [description] }
        },
        position: { x: 0, y: 0 },
        style: {
            background: color,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: 0,
            width: 280,
            minHeight: 80,
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.2s',
        }
    };
}

function createEdge(source: string, target: string): Edge {
    return {
        id: `${source}-${target}`,
        source,
        target,
        type: 'smoothstep',
        animated: false,
        style: {
            stroke: '#94a3b8',
            strokeWidth: 2
        },
        markerEnd: {
            type: 'arrowclosed',
            color: '#94a3b8',
        }
    };
}

export function parseSqlToGraph(sqlCode: string, dialect: SqlDialect = 'MySQL'): { nodes: Node[], edges: Edge[], ast?: any } {
    nodeIdCounter = 0;
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    try {
        const ast = parser.astify(sqlCode, { database: dialect });
        const statement = Array.isArray(ast) ? ast[0] : ast;

        if (!statement || statement.type?.toLowerCase() !== 'select') {
            throw new Error('Only SELECT queries are supported for visualization');
        }

        let previousNodeId: string | null = null;

        // 1. SOURCE TABLES (FROM clause)
        if (statement.from && statement.from.length > 0) {
            const tables: string[] = [];
            statement.from.forEach((item: any) => {
                if (item.table) {
                    const tableName = item.as ? `${item.table} (${item.as})` : item.table;
                    tables.push(tableName);
                }
            });

            if (tables.length > 0) {
                const sourceId = generateId('source');
                nodes.push(createNode(
                    sourceId,
                    'Scan Table' + (tables.length > 1 ? 's' : ''),
                    tables.join(', '),
                    COLORS.source
                ));
                previousNodeId = sourceId;
            }
        }

        // 2. JOINS
        if (statement.from && statement.from.length > 0) {
            const joins: string[] = [];
            statement.from.forEach((item: any) => {
                if (item.join) {
                    const joinType = item.join.toUpperCase();
                    const rightTable = item.on ?
                        `${joinType} ${item.table || item.expr?.table || ''}` :
                        `${joinType}`;
                    joins.push(rightTable);
                }
            });

            if (joins.length > 0 && previousNodeId) {
                const joinId = generateId('join');
                nodes.push(createNode(
                    joinId,
                    'Join Tables',
                    joins.join(', '),
                    COLORS.join
                ));
                edges.push(createEdge(previousNodeId, joinId));
                previousNodeId = joinId;
            }
        }

        // 3. FILTER (WHERE clause)
        if (statement.where && previousNodeId) {
            const filterId = generateId('filter');
            const whereCondition = formatWhereClause(statement.where);
            nodes.push(createNode(
                filterId,
                'Filter Rows',
                whereCondition,
                COLORS.filter
            ));
            edges.push(createEdge(previousNodeId, filterId));
            previousNodeId = filterId;
        }

        // 4. GROUP BY / AGGREGATION
        if (statement.groupby && statement.groupby.length > 0) {
            const groupId = generateId('group');
            const groupCols = statement.groupby
                .map((col: any) => col.column || col.expr?.column || 'expr')
                .join(', ');

            // Check for aggregate functions
            const hasAggregates = statement.columns?.some((col: any) =>
                col.expr?.type === 'aggr_func'
            );

            const label = hasAggregates ? 'Group & Aggregate' : 'Group By';
            nodes.push(createNode(
                groupId,
                label,
                `Group by: ${groupCols}`,
                COLORS.aggregate
            ));
            if (previousNodeId) {
                edges.push(createEdge(previousNodeId, groupId));
            }
            previousNodeId = groupId;
        } else {
            // Check for aggregates without GROUP BY
            const hasAggregates = statement.columns?.some((col: any) =>
                col.expr?.type === 'aggr_func'
            );

            if (hasAggregates && previousNodeId) {
                const aggrId = generateId('aggr');
                const aggrFuncs = statement.columns
                    .filter((col: any) => col.expr?.type === 'aggr_func')
                    .map((col: any) => col.expr?.name?.toUpperCase() || 'AGG')
                    .join(', ');

                nodes.push(createNode(
                    aggrId,
                    'Aggregate',
                    aggrFuncs,
                    COLORS.aggregate
                ));
                edges.push(createEdge(previousNodeId, aggrId));
                previousNodeId = aggrId;
            }
        }

        // 5. HAVING clause
        if (statement.having && previousNodeId) {
            const havingId = generateId('having');
            nodes.push(createNode(
                havingId,
                'Filter Groups',
                'HAVING condition',
                COLORS.filter
            ));
            edges.push(createEdge(previousNodeId, havingId));
            previousNodeId = havingId;
        }

        // 6. ORDER BY
        if (statement.orderby && statement.orderby.length > 0 && previousNodeId) {
            const sortId = generateId('sort');
            const sortCols = statement.orderby
                .map((col: any) => {
                    const colName = col.expr?.column || col.column || 'expr';
                    const order = col.type?.toUpperCase() || 'ASC';
                    return `${colName} ${order}`;
                })
                .join(', ');

            nodes.push(createNode(
                sortId,
                'Sort Results',
                sortCols,
                COLORS.sort
            ));
            edges.push(createEdge(previousNodeId, sortId));
            previousNodeId = sortId;
        }

        // 7. LIMIT
        if (statement.limit && previousNodeId) {
            const limitId = generateId('limit');
            const limitValue = typeof statement.limit === 'object' ?
                statement.limit.value?.[0]?.value || statement.limit.value :
                statement.limit;

            nodes.push(createNode(
                limitId,
                'Limit Rows',
                `Top ${limitValue} rows`,
                COLORS.limit
            ));
            edges.push(createEdge(previousNodeId, limitId));
            previousNodeId = limitId;
        }

        // 8. SELECT / RESULT
        if (statement.columns && previousNodeId) {
            const resultId = generateId('result');
            const columnCount = statement.columns.length;
            const columnNames = statement.columns
                .slice(0, 3)
                .map((col: any) => col.as || col.expr?.column || '*')
                .join(', ');
            const extra = columnCount > 3 ? ` (+${columnCount - 3} more)` : '';

            nodes.push(createNode(
                resultId,
                'Return Result',
                `${columnNames}${extra}`,
                COLORS.result
            ));
            edges.push(createEdge(previousNodeId, resultId));
        }

        // If we have no nodes, create a simple result node
        if (nodes.length === 0) {
            nodes.push(createNode(
                generateId('result'),
                'Query Result',
                'Empty or invalid query',
                COLORS.result
            ));
        }

        console.log('Parsed SQL - Nodes before layout:', nodes.length, nodes.map(n => n.data.nodeTitle));
        console.log('Parsed SQL - Edges before layout:', edges.length, edges.map(e => `${e.source} -> ${e.target}`));

        const layouted = getLayoutedElements(nodes, edges);

        console.log('After layout - Nodes:', layouted.nodes.length, layouted.nodes.map(n => ({ id: n.id, pos: n.position })));

        return { ...layouted, ast };

    } catch (error) {
        console.error('SQL parsing error:', error);
        return {
            nodes: [{
                id: 'error',
                type: 'default',
                data: {
                    label: (
                        <div style={{ padding: '16px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
                                Parse Error
                            </div>
                            <div style={{ fontSize: '12px', color: '#fee' }}>
                                {error instanceof Error ? error.message : 'Unknown error'}
                            </div>
                        </div>
                    )
                },
                position: { x: 250, y: 50 },
                style: {
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: 0,
                    minWidth: 280,
                }
            }],
            edges: []
        };
    }
}

function formatWhereClause(where: any): string {
    if (!where) return '';

    // Simple formatting - just show it exists
    if (where.type === 'binary_expr') {
        const left = where.left?.column || where.left?.value || '';
        const op = where.operator || '';
        const right = where.right?.column || where.right?.value || '';
        return `${left} ${op} ${right}`;
    }

    return 'WHERE condition';
}
