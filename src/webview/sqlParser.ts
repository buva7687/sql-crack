import { Parser } from 'node-sql-parser';
import { Node, Edge } from 'reactflow';
import { parseSchemaToGraph } from './schemaParser';

const parser = new Parser();

export interface ParsedSqlData {
    nodes: Node[];
    edges: Edge[];
    isSchema?: boolean;
}

let nodeIdCounter = 0;

function generateId(prefix: string = 'node'): string {
    return `${prefix}_${nodeIdCounter++}`;
}

export function parseSqlToGraph(sqlCode: string): ParsedSqlData {
    nodeIdCounter = 0;
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    try {
        // Parse SQL
        const ast = parser.astify(sqlCode, { database: 'MySQL' });

        // Handle array of statements or single statement
        const statements = Array.isArray(ast) ? ast : [ast];

        // Check if this is a schema definition (CREATE TABLE statements)
        const hasCreateTable = statements.some((stmt: any) =>
            stmt.type?.toLowerCase() === 'create' && stmt.keyword === 'table'
        );

        if (hasCreateTable) {
            // Use schema parser for CREATE TABLE statements
            const schemaResult = parseSchemaToGraph(sqlCode);
            return {
                nodes: schemaResult.nodes,
                edges: schemaResult.edges,
                isSchema: true
            };
        }

        let yOffset = 0;

        statements.forEach((statement: any, stmtIndex: number) => {
            const result = processStatement(statement, stmtIndex, yOffset);
            nodes.push(...result.nodes);
            edges.push(...result.edges);

            // Offset for next statement
            yOffset += 400;
        });

        return { nodes, edges, isSchema: false };
    } catch (error) {
        console.error('SQL parsing error:', error);

        // Return error node
        return {
            nodes: [{
                id: 'error',
                type: 'default',
                data: {
                    label: `Parse Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                },
                position: { x: 250, y: 50 },
                style: {
                    background: '#ff6b6b',
                    color: 'white',
                    border: '2px solid #ff0000',
                    borderRadius: 8,
                    padding: 10,
                    minWidth: 200
                }
            }],
            edges: []
        };
    }
}

function processStatement(statement: any, stmtIndex: number, baseYOffset: number): ParsedSqlData {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    if (!statement || !statement.type) {
        return { nodes, edges };
    }

    const statementType = statement.type.toLowerCase();

    // Create root node for the statement
    const rootId = generateId('stmt');
    nodes.push({
        id: rootId,
        type: 'input',
        data: { label: `${statement.type} Query` },
        position: { x: 250, y: baseYOffset + 50 },
        style: {
            background: '#667eea',
            color: 'white',
            border: '2px solid #764ba2',
            borderRadius: 8,
            padding: 10,
            fontSize: 14,
            fontWeight: 'bold'
        }
    });

    let xOffset = 0;
    const yStep = 120;

    if (statementType === 'select') {
        // Process SELECT columns
        if (statement.columns && statement.columns.length > 0) {
            const selectId = generateId('select');
            const columnsLabel = statement.columns.map((col: any) => {
                if (col.expr && col.expr.column === '*') {
                    return '*';
                }
                return col.as || col.expr?.column || 'expression';
            }).join(', ');

            nodes.push({
                id: selectId,
                data: { label: `SELECT\n${columnsLabel}` },
                position: { x: xOffset, y: baseYOffset + 50 + yStep },
                style: {
                    background: '#48bb78',
                    color: 'white',
                    borderRadius: 8,
                    padding: 10,
                    minWidth: 150,
                    whiteSpace: 'pre-wrap'
                }
            });

            edges.push({
                id: `${rootId}-${selectId}`,
                source: rootId,
                target: selectId,
                animated: true
            });

            xOffset += 200;
        }

        // Process FROM tables
        if (statement.from && statement.from.length > 0) {
            statement.from.forEach((fromItem: any, idx: number) => {
                const fromId = generateId('from');
                const tableName = fromItem.as || fromItem.table || 'table';

                nodes.push({
                    id: fromId,
                    data: { label: `FROM\n${tableName}` },
                    position: { x: xOffset, y: baseYOffset + 50 + yStep },
                    style: {
                        background: '#4299e1',
                        color: 'white',
                        borderRadius: 8,
                        padding: 10,
                        minWidth: 120,
                        whiteSpace: 'pre-wrap'
                    }
                });

                edges.push({
                    id: `${rootId}-${fromId}`,
                    source: rootId,
                    target: fromId,
                    animated: true
                });

                // Process JOINs
                if (fromItem.join) {
                    const joinId = generateId('join');
                    const joinTable = fromItem.join.as || fromItem.join.table || 'joined_table';
                    const joinType = fromItem.join.join || 'JOIN';

                    nodes.push({
                        id: joinId,
                        data: { label: `${joinType}\n${joinTable}` },
                        position: { x: xOffset + 150, y: baseYOffset + 50 + yStep * 2 },
                        style: {
                            background: '#ed8936',
                            color: 'white',
                            borderRadius: 8,
                            padding: 10,
                            minWidth: 120,
                            whiteSpace: 'pre-wrap'
                        }
                    });

                    edges.push({
                        id: `${fromId}-${joinId}`,
                        source: fromId,
                        target: joinId,
                        label: 'joins with',
                        animated: true
                    });
                }

                xOffset += 250;
            });
        }

        // Process WHERE clause
        if (statement.where) {
            const whereId = generateId('where');
            const whereLabel = formatWhereClause(statement.where);

            nodes.push({
                id: whereId,
                data: { label: `WHERE\n${whereLabel}` },
                position: { x: 100, y: baseYOffset + 50 + yStep * 2 },
                style: {
                    background: '#9f7aea',
                    color: 'white',
                    borderRadius: 8,
                    padding: 10,
                    minWidth: 150,
                    whiteSpace: 'pre-wrap'
                }
            });

            edges.push({
                id: `${rootId}-${whereId}`,
                source: rootId,
                target: whereId,
                label: 'filter',
                animated: true
            });
        }

        // Process GROUP BY
        if (statement.groupby && statement.groupby.length > 0) {
            const groupId = generateId('group');
            const groupCols = statement.groupby.map((g: any) => g.column).join(', ');

            nodes.push({
                id: groupId,
                data: { label: `GROUP BY\n${groupCols}` },
                position: { x: 300, y: baseYOffset + 50 + yStep * 2 },
                style: {
                    background: '#ed64a6',
                    color: 'white',
                    borderRadius: 8,
                    padding: 10,
                    minWidth: 120,
                    whiteSpace: 'pre-wrap'
                }
            });

            edges.push({
                id: `${rootId}-${groupId}`,
                source: rootId,
                target: groupId,
                animated: true
            });
        }

        // Process ORDER BY
        if (statement.orderby && statement.orderby.length > 0) {
            const orderId = generateId('order');
            const orderCols = statement.orderby.map((o: any) =>
                `${o.expr.column} ${o.type || 'ASC'}`
            ).join(', ');

            nodes.push({
                id: orderId,
                data: { label: `ORDER BY\n${orderCols}` },
                position: { x: 500, y: baseYOffset + 50 + yStep * 2 },
                style: {
                    background: '#38b2ac',
                    color: 'white',
                    borderRadius: 8,
                    padding: 10,
                    minWidth: 120,
                    whiteSpace: 'pre-wrap'
                }
            });

            edges.push({
                id: `${rootId}-${orderId}`,
                source: rootId,
                target: orderId,
                animated: true
            });
        }

        // Process LIMIT
        if (statement.limit) {
            const limitId = generateId('limit');
            const limitValue = statement.limit.value?.[0]?.value || statement.limit;

            nodes.push({
                id: limitId,
                data: { label: `LIMIT\n${limitValue}` },
                position: { x: 650, y: baseYOffset + 50 + yStep * 2 },
                style: {
                    background: '#f6ad55',
                    color: 'white',
                    borderRadius: 8,
                    padding: 10,
                    minWidth: 100,
                    whiteSpace: 'pre-wrap'
                }
            });

            edges.push({
                id: `${rootId}-${limitId}`,
                source: rootId,
                target: limitId,
                animated: true
            });
        }
    } else if (statementType === 'insert') {
        // Process INSERT
        const tableId = generateId('table');
        nodes.push({
            id: tableId,
            data: { label: `INTO TABLE\n${statement.table?.[0]?.table || 'unknown'}` },
            position: { x: 100, y: baseYOffset + 50 + yStep },
            style: {
                background: '#4299e1',
                color: 'white',
                borderRadius: 8,
                padding: 10
            }
        });

        edges.push({
            id: `${rootId}-${tableId}`,
            source: rootId,
            target: tableId,
            animated: true
        });
    } else if (statementType === 'update') {
        // Process UPDATE
        const tableId = generateId('table');
        nodes.push({
            id: tableId,
            data: { label: `TABLE\n${statement.table?.[0]?.table || 'unknown'}` },
            position: { x: 100, y: baseYOffset + 50 + yStep },
            style: {
                background: '#4299e1',
                color: 'white',
                borderRadius: 8,
                padding: 10
            }
        });

        edges.push({
            id: `${rootId}-${tableId}`,
            source: rootId,
            target: tableId,
            animated: true
        });

        if (statement.where) {
            const whereId = generateId('where');
            nodes.push({
                id: whereId,
                data: { label: `WHERE\n${formatWhereClause(statement.where)}` },
                position: { x: 300, y: baseYOffset + 50 + yStep },
                style: {
                    background: '#9f7aea',
                    color: 'white',
                    borderRadius: 8,
                    padding: 10
                }
            });

            edges.push({
                id: `${rootId}-${whereId}`,
                source: rootId,
                target: whereId,
                animated: true
            });
        }
    } else if (statementType === 'delete') {
        // Process DELETE
        const tableId = generateId('table');
        nodes.push({
            id: tableId,
            data: { label: `FROM TABLE\n${statement.table?.[0]?.table || 'unknown'}` },
            position: { x: 100, y: baseYOffset + 50 + yStep },
            style: {
                background: '#4299e1',
                color: 'white',
                borderRadius: 8,
                padding: 10
            }
        });

        edges.push({
            id: `${rootId}-${tableId}`,
            source: rootId,
            target: tableId,
            animated: true
        });

        if (statement.where) {
            const whereId = generateId('where');
            nodes.push({
                id: whereId,
                data: { label: `WHERE\n${formatWhereClause(statement.where)}` },
                position: { x: 300, y: baseYOffset + 50 + yStep },
                style: {
                    background: '#9f7aea',
                    color: 'white',
                    borderRadius: 8,
                    padding: 10
                }
            });

            edges.push({
                id: `${rootId}-${whereId}`,
                source: rootId,
                target: whereId,
                animated: true
            });
        }
    }

    return { nodes, edges };
}

function formatWhereClause(where: any): string {
    if (!where) return '';

    if (where.type === 'binary_expr') {
        return `${where.left?.column || '?'} ${where.operator} ${where.right?.value || '?'}`;
    }

    return 'condition';
}
