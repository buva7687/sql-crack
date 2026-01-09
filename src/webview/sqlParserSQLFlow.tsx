import { Parser } from 'node-sql-parser';
import { Node, Edge } from 'reactflow';
import dagre from 'dagre';

const parser = new Parser();

export type SqlDialect = 'MySQL' | 'PostgreSQL' | 'Transact-SQL' | 'MariaDB' | 'SQLite';

export interface TableNode {
    name: string;
    alias?: string;
    columns: string[];
    type: 'source' | 'target' | 'intermediate';
}

export interface ParsedSqlData {
    nodes: Node[];
    edges: Edge[];
}

let nodeIdCounter = 0;

function generateId(prefix: string = 'node'): string {
    return `${prefix}_${nodeIdCounter++}`;
}

// Layout nodes using dagre for hierarchical layout
function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'TB') {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const nodeWidth = 250;
    const nodeHeight = 150;

    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 80,
        ranksep: 150,
        marginx: 50,
        marginy: 50
    });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };
    });

    return { nodes, edges };
}

export function parseSqlToGraph(sqlCode: string, dialect: SqlDialect = 'MySQL'): ParsedSqlData {
    nodeIdCounter = 0;
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    try {
        const ast = parser.astify(sqlCode, { database: dialect });
        const statements = Array.isArray(ast) ? ast : [ast];

        statements.forEach((statement: any) => {
            const result = processStatement(statement);
            nodes.push(...result.nodes);
            edges.push(...result.edges);
        });

        // Apply hierarchical layout
        return getLayoutedElements(nodes, edges, 'TB');
    } catch (error) {
        console.error('SQL parsing error:', error);
        return {
            nodes: [{
                id: 'error',
                type: 'default',
                data: {
                    label: `Parse Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                },
                position: { x: 250, y: 50 },
                style: {
                    background: '#fee',
                    color: '#c00',
                    border: '2px solid #c00',
                    borderRadius: 4,
                    padding: 16,
                    minWidth: 250
                }
            }],
            edges: []
        };
    }
}

function processStatement(statement: any): ParsedSqlData {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    if (!statement || !statement.type) {
        return { nodes, edges };
    }

    const statementType = statement.type.toLowerCase();

    if (statementType === 'select') {
        return processSelectStatement(statement);
    } else if (statementType === 'insert') {
        return processInsertStatement(statement);
    } else if (statementType === 'update') {
        return processUpdateStatement(statement);
    } else if (statementType === 'delete') {
        return processDeleteStatement(statement);
    }

    return { nodes, edges };
}

function processSelectStatement(statement: any): ParsedSqlData {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const tableMap = new Map<string, TableNode>();

    // Extract source tables from FROM clause
    if (statement.from) {
        extractTablesFromClause(statement.from, tableMap, 'source');
    }

    // Extract columns for each table
    if (statement.columns && statement.columns.length > 0) {
        statement.columns.forEach((col: any) => {
            if (col.expr && col.expr.table) {
                const tableName = col.expr.table;
                const columnName = col.expr.column || col.as || '*';

                if (tableMap.has(tableName)) {
                    const table = tableMap.get(tableName)!;
                    if (!table.columns.includes(columnName)) {
                        table.columns.push(columnName);
                    }
                }
            } else if (col.as) {
                // Derived column
                const derivedTable = 'RESULT';
                if (!tableMap.has(derivedTable)) {
                    tableMap.set(derivedTable, {
                        name: derivedTable,
                        columns: [],
                        type: 'target'
                    });
                }
                tableMap.get(derivedTable)!.columns.push(col.as);
            }
        });
    }

    // Create result node
    const resultId = generateId('result');
    const resultColumns: string[] = [];

    if (statement.columns) {
        statement.columns.forEach((col: any) => {
            if (col.as) {
                resultColumns.push(col.as);
            } else if (col.expr && col.expr.column) {
                resultColumns.push(col.expr.column);
            }
        });
    }

    nodes.push(createTableNode(resultId, 'RESULT', resultColumns, 'target'));

    // Create nodes for source tables
    tableMap.forEach((table, tableName) => {
        if (tableName !== 'RESULT') {
            const tableId = generateId('table');
            nodes.push(createTableNode(tableId, tableName, table.columns, table.type));

            // Create edge from source to result
            edges.push({
                id: `${tableId}-${resultId}`,
                source: tableId,
                target: resultId,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#3b82f6', strokeWidth: 2 },
                markerEnd: {
                    type: 'arrowclosed',
                    color: '#3b82f6',
                }
            });
        }
    });

    // Handle JOINs
    if (statement.from) {
        processJoins(statement.from, nodes, edges, resultId);
    }

    return { nodes, edges };
}

function processInsertStatement(statement: any): ParsedSqlData {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Target table
    const targetTable = statement.table?.[0]?.table || 'Unknown';
    const targetId = generateId('target');

    const columns = statement.columns?.map((col: any) => col.column || col) || [];
    nodes.push(createTableNode(targetId, targetTable, columns, 'target'));

    // Source (if FROM clause exists in INSERT...SELECT)
    if (statement.from) {
        const sourceId = generateId('source');
        const sourceTable = statement.from[0]?.table || 'Source';
        nodes.push(createTableNode(sourceId, sourceTable, columns, 'source'));

        edges.push({
            id: `${sourceId}-${targetId}`,
            source: sourceId,
            target: targetId,
            type: 'smoothstep',
            label: 'INSERT',
            animated: true,
            style: { stroke: '#10b981', strokeWidth: 2 },
            markerEnd: {
                type: 'arrowclosed',
                color: '#10b981',
            }
        });
    }

    return { nodes, edges };
}

function processUpdateStatement(statement: any): ParsedSqlData {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const targetTable = statement.table?.[0]?.table || 'Unknown';
    const targetId = generateId('target');

    const columns = statement.set?.map((s: any) => s.column) || [];
    nodes.push(createTableNode(targetId, targetTable, columns, 'target'));

    return { nodes, edges };
}

function processDeleteStatement(statement: any): ParsedSqlData {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const targetTable = statement.from?.[0]?.table || 'Unknown';
    const targetId = generateId('target');

    nodes.push(createTableNode(targetId, targetTable, [], 'target'));

    return { nodes, edges };
}

function extractTablesFromClause(fromClause: any[], tableMap: Map<string, TableNode>, type: 'source' | 'target' | 'intermediate') {
    fromClause.forEach((item: any) => {
        if (item.table) {
            const tableName = item.as || item.table;
            if (!tableMap.has(tableName)) {
                tableMap.set(tableName, {
                    name: item.table,
                    alias: item.as,
                    columns: [],
                    type: type
                });
            }
        }

        // Handle JOINs
        if (item.join) {
            extractTablesFromClause([item], tableMap, type);
        }
    });
}

function processJoins(fromClause: any[], nodes: Node[], edges: Edge[], resultId: string) {
    // Create edges for JOINs
    fromClause.forEach((item: any) => {
        if (item.join) {
            const leftTable = item.table || item.as;
            const rightTable = item.join.table || item.join.as;

            const leftNode = nodes.find(n => n.data.tableName === leftTable);
            const rightNode = nodes.find(n => n.data.tableName === rightTable);

            if (leftNode && rightNode) {
                edges.push({
                    id: `${leftNode.id}-${rightNode.id}`,
                    source: leftNode.id,
                    target: rightNode.id,
                    type: 'smoothstep',
                    label: item.join.type || 'JOIN',
                    style: { stroke: '#8b5cf6', strokeWidth: 2, strokeDasharray: '5,5' },
                    markerEnd: {
                        type: 'arrowclosed',
                        color: '#8b5cf6',
                    }
                });
            }
        }
    });
}

function createTableNode(id: string, tableName: string, columns: string[], type: 'source' | 'target' | 'intermediate'): Node {
    const bgColor = type === 'source' ? '#eff6ff' : type === 'target' ? '#f0fdf4' : '#fefce8';
    const borderColor = type === 'source' ? '#3b82f6' : type === 'target' ? '#10b981' : '#eab308';
    const headerBg = type === 'source' ? '#dbeafe' : type === 'target' ? '#d1fae5' : '#fef08a';

    return {
        id,
        type: 'default',
        data: {
            label: (
                <div style={{ width: '100%' }}>
                    <div style={{
                        background: headerBg,
                        padding: '8px 12px',
                        borderBottom: `2px solid ${borderColor}`,
                        fontWeight: 600,
                        fontSize: '14px',
                        color: '#1f2937',
                        marginBottom: '8px',
                        borderRadius: '4px 4px 0 0'
                    }}>
                        {type === 'source' && '📊 '}{type === 'target' && '🎯 '}{tableName}
                    </div>
                    {columns.length > 0 && (
                        <div style={{
                            padding: '0 12px 8px',
                            fontSize: '12px',
                            color: '#6b7280'
                        }}>
                            {columns.slice(0, 8).map((col, idx) => (
                                <div key={idx} style={{ padding: '3px 0', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ marginRight: '6px', color: borderColor }}>▸</span>
                                    <span style={{ fontFamily: 'monospace' }}>{col}</span>
                                </div>
                            ))}
                            {columns.length > 8 && (
                                <div style={{ padding: '3px 0', color: '#9ca3af', fontStyle: 'italic' }}>
                                    +{columns.length - 8} more...
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ),
            tableName,
            columns
        },
        position: { x: 0, y: 0 }, // Will be set by layout algorithm
        style: {
            background: bgColor,
            border: `2px solid ${borderColor}`,
            borderRadius: 6,
            width: 250,
            padding: 0,
            minHeight: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }
    };
}
