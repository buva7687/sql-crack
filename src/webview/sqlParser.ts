import { Parser } from 'node-sql-parser';
import { Node, Edge } from 'reactflow';
import { parseSchemaToGraph } from './schemaParser';

const parser = new Parser();

export type SqlDialect = 'MySQL' | 'PostgreSQL' | 'Transact-SQL' | 'MariaDB' | 'SQLite';

export interface ParsedSqlData {
    nodes: Node[];
    edges: Edge[];
    isSchema?: boolean;
    ast?: any;
}

let nodeIdCounter = 0;

function generateId(prefix: string = 'node'): string {
    return `${prefix}_${nodeIdCounter++}`;
}

export function parseSqlToGraph(sqlCode: string, dialect: SqlDialect = 'MySQL'): ParsedSqlData {
    nodeIdCounter = 0;
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    try {
        // Parse SQL with selected dialect
        const ast = parser.astify(sqlCode, { database: dialect });

        // Handle array of statements or single statement
        const statements = Array.isArray(ast) ? ast : [ast];

        // Check if this is a schema definition (CREATE TABLE statements)
        const hasCreateTable = statements.some((stmt: any) =>
            stmt.type?.toLowerCase() === 'create' && stmt.keyword === 'table'
        );

        if (hasCreateTable) {
            // Use schema parser for CREATE TABLE statements
            const schemaResult = parseSchemaToGraph(sqlCode, dialect);
            return {
                nodes: schemaResult.nodes,
                edges: schemaResult.edges,
                isSchema: true,
                ast: ast
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

        return { nodes, edges, isSchema: false, ast: ast };
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

    // Process CTEs (WITH clause)
    if (statement.with && statement.with.length > 0) {
        statement.with.forEach((cte: any, idx: number) => {
            const cteId = generateId('cte');
            const cteName = cte.name || `CTE_${idx + 1}`;

            nodes.push({
                id: cteId,
                data: { label: `WITH\n${cteName}` },
                position: { x: idx * 200, y: baseYOffset },
                style: {
                    background: '#805ad5',
                    color: 'white',
                    borderRadius: 8,
                    padding: 10,
                    minWidth: 120,
                    whiteSpace: 'pre-wrap',
                    border: '2px dashed #6b46c1'
                }
            });

            edges.push({
                id: `${cteId}-${rootId}`,
                source: cteId,
                target: rootId,
                label: 'CTE',
                animated: true,
                style: { strokeDasharray: '5 5', stroke: '#805ad5' }
            });
        });
    }

    // Check for UNION/INTERSECT/EXCEPT operations
    if (statement._next) {
        const setOpType = statement.set_op || 'UNION';
        const setOpId = generateId('setop');

        nodes.push({
            id: setOpId,
            data: { label: setOpType },
            position: { x: 500, y: baseYOffset + 50 + yStep },
            style: {
                background: '#f6ad55',
                color: 'white',
                borderRadius: 8,
                padding: 10,
                minWidth: 100,
                fontWeight: 'bold',
                border: '2px solid #dd6b20'
            }
        });

        edges.push({
            id: `${rootId}-${setOpId}`,
            source: rootId,
            target: setOpId,
            label: 'combines with',
            animated: true
        });

        // Process the next query in the set operation
        const nextResult = processStatement(statement._next, stmtIndex + 1, baseYOffset + 300);
        nodes.push(...nextResult.nodes);
        edges.push(...nextResult.edges);

        if (nextResult.nodes.length > 0) {
            edges.push({
                id: `${setOpId}-${nextResult.nodes[0].id}`,
                source: setOpId,
                target: nextResult.nodes[0].id,
                animated: true
            });
        }
    }

    if (statementType === 'select') {
        // Process SELECT columns
        if (statement.columns && statement.columns.length > 0) {
            const selectId = generateId('select');
            const windowFunctions: string[] = [];
            const regularColumns: string[] = [];

            statement.columns.forEach((col: any) => {
                if (col.expr && col.expr.column === '*') {
                    regularColumns.push('*');
                } else if (col.expr && col.expr.type === 'aggr_func' && col.expr.over) {
                    // Window function detected
                    const funcName = col.expr.name || 'WINDOW_FUNC';
                    const partitionBy = col.expr.over?.partitionby?.map((p: any) => p.column).join(', ') || '';
                    const orderBy = col.expr.over?.orderby?.map((o: any) => o.expr.column).join(', ') || '';
                    windowFunctions.push(`${funcName}() OVER${partitionBy ? ` (PARTITION BY ${partitionBy})` : ''}`);
                } else {
                    regularColumns.push(col.as || col.expr?.column || 'expression');
                }
            });

            const columnsLabel = regularColumns.join(', ');

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

            // Add window function nodes if present
            if (windowFunctions.length > 0) {
                const windowId = generateId('window');
                nodes.push({
                    id: windowId,
                    data: { label: `WINDOW\n${windowFunctions.join('\\n')}` },
                    position: { x: xOffset, y: baseYOffset + 50 + yStep * 2 },
                    style: {
                        background: '#d53f8c',
                        color: 'white',
                        borderRadius: 8,
                        padding: 10,
                        minWidth: 180,
                        whiteSpace: 'pre-wrap',
                        border: '2px solid #b83280'
                    }
                });

                edges.push({
                    id: `${selectId}-${windowId}`,
                    source: selectId,
                    target: windowId,
                    label: 'uses',
                    animated: true
                });
            }

            xOffset += 200;
        }

        // Process FROM tables
        if (statement.from && statement.from.length > 0) {
            statement.from.forEach((fromItem: any, idx: number) => {
                const fromId = generateId('from');

                // Check if this is a subquery
                if (fromItem.expr && fromItem.expr.type === 'select') {
                    // This is a subquery
                    const subqueryName = fromItem.as || 'subquery';

                    nodes.push({
                        id: fromId,
                        data: { label: `FROM\n(${subqueryName})` },
                        position: { x: xOffset, y: baseYOffset + 50 + yStep },
                        style: {
                            background: '#38b2ac',
                            color: 'white',
                            borderRadius: 8,
                            padding: 10,
                            minWidth: 120,
                            whiteSpace: 'pre-wrap',
                            border: '2px dashed #319795'
                        }
                    });

                    edges.push({
                        id: `${rootId}-${fromId}`,
                        source: rootId,
                        target: fromId,
                        label: 'subquery',
                        animated: true,
                        style: { strokeDasharray: '5 5' }
                    });
                } else {
                    // Regular table
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
                }

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
