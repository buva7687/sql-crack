import { Parser } from 'node-sql-parser';
import { Node, Edge } from 'reactflow';

const parser = new Parser();

export interface SchemaTable {
    name: string;
    columns: Column[];
    primaryKeys: string[];
    foreignKeys: ForeignKey[];
    indexes: string[];
}

export interface Column {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue?: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
}

export interface ForeignKey {
    column: string;
    referencedTable: string;
    referencedColumn: string;
}

export interface SchemaData {
    nodes: Node[];
    edges: Edge[];
    tables: SchemaTable[];
}

let nodeIdCounter = 0;

function generateId(prefix: string = 'node'): string {
    return `${prefix}_${nodeIdCounter++}`;
}

export function parseSchemaToGraph(sqlCode: string): SchemaData {
    nodeIdCounter = 0;
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const tables: SchemaTable[] = [];

    try {
        const ast = parser.astify(sqlCode, { database: 'MySQL' });
        const statements = Array.isArray(ast) ? ast : [ast];

        // First pass: collect all tables
        statements.forEach((statement: any) => {
            if (statement.type?.toLowerCase() === 'create' && statement.keyword === 'table') {
                const table = parseCreateTable(statement);
                tables.push(table);
            }
        });

        // Second pass: create nodes and edges
        let xOffset = 50;
        const yOffset = 100;
        const tableSpacing = 350;

        tables.forEach((table, idx) => {
            const tableId = generateId('table');

            // Create table node
            const columnsList = table.columns.map(col => {
                let label = col.name;
                let icons = '';

                if (col.isPrimaryKey) icons += '🔑 ';
                if (col.isForeignKey) icons += '🔗 ';

                return `${icons}${label}: ${col.type}`;
            }).join('\\n');

            const nodeLabel = `📋 ${table.name}\\n${'─'.repeat(table.name.length + 3)}\\n${columnsList}`;

            nodes.push({
                id: tableId,
                type: 'default',
                data: {
                    label: nodeLabel,
                    tableName: table.name
                },
                position: { x: xOffset, y: yOffset },
                style: {
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: '2px solid #5a67d8',
                    borderRadius: '12px',
                    padding: '16px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    minWidth: 250,
                    whiteSpace: 'pre-wrap',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
                }
            });

            xOffset += tableSpacing;
            if ((idx + 1) % 3 === 0) {
                xOffset = 50;
            }
        });

        // Create edges for foreign keys
        tables.forEach((table) => {
            const sourceNode = nodes.find(n => n.data.tableName === table.name);
            if (!sourceNode) return;

            table.foreignKeys.forEach(fk => {
                const targetNode = nodes.find(n => n.data.tableName === fk.referencedTable);
                if (targetNode) {
                    const edgeId = generateId('fk');
                    edges.push({
                        id: edgeId,
                        source: sourceNode.id,
                        target: targetNode.id,
                        label: `${fk.column} → ${fk.referencedColumn}`,
                        type: 'smoothstep',
                        animated: true,
                        style: { stroke: '#f6ad55', strokeWidth: 2 },
                        labelStyle: {
                            fill: '#fff',
                            fontSize: 11,
                            background: 'rgba(30, 30, 30, 0.9)',
                            padding: '4px 8px',
                            borderRadius: '4px'
                        },
                        labelBgStyle: {
                            fill: 'rgba(30, 30, 30, 0.9)',
                            fillOpacity: 0.9
                        }
                    });
                }
            });
        });

        return { nodes, edges, tables };

    } catch (error) {
        console.error('Schema parsing error:', error);
        return {
            nodes: [{
                id: 'error',
                type: 'default',
                data: {
                    label: `Schema Parse Error: ${error instanceof Error ? error.message : 'Unknown error'}`
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
            edges: [],
            tables: []
        };
    }
}

function parseCreateTable(statement: any): SchemaTable {
    const tableName = statement.table?.[0]?.table || 'unknown';
    const columns: Column[] = [];
    const primaryKeys: string[] = [];
    const foreignKeys: ForeignKey[] = [];
    const indexes: string[] = [];

    if (statement.create_definitions) {
        statement.create_definitions.forEach((def: any) => {
            if (def.resource === 'column') {
                // Parse column definition
                const column: Column = {
                    name: def.column.column,
                    type: formatDataType(def.definition),
                    nullable: !def.nullable?.value || def.nullable.value !== 'not null',
                    isPrimaryKey: false,
                    isForeignKey: false
                };

                // Check for primary key in column definition
                if (def.primary_key) {
                    column.isPrimaryKey = true;
                    primaryKeys.push(column.name);
                }

                // Check for default value
                if (def.default_val) {
                    column.defaultValue = def.default_val.value?.value || String(def.default_val.value);
                }

                columns.push(column);

            } else if (def.resource === 'constraint') {
                // Handle constraint definitions
                if (def.constraint_type === 'primary key') {
                    const pkColumns = def.definition || [];
                    pkColumns.forEach((col: any) => {
                        const colName = col.column;
                        primaryKeys.push(colName);
                        const column = columns.find(c => c.name === colName);
                        if (column) column.isPrimaryKey = true;
                    });
                } else if (def.constraint_type === 'foreign key' || def.constraint_type === 'FOREIGN KEY') {
                    // Parse foreign key
                    const fkColumns = def.definition || [];
                    const refTable = def.reference_definition?.table?.[0]?.table;
                    const refColumns = def.reference_definition?.definition || [];

                    fkColumns.forEach((col: any, idx: number) => {
                        const fkColumn = col.column;
                        const refColumn = refColumns[idx]?.column || 'id';

                        foreignKeys.push({
                            column: fkColumn,
                            referencedTable: refTable,
                            referencedColumn: refColumn
                        });

                        const column = columns.find(c => c.name === fkColumn);
                        if (column) column.isForeignKey = true;
                    });
                }
            } else if (def.resource === 'index') {
                const indexColumns = def.definition?.map((d: any) => d.column).join(', ') || '';
                indexes.push(indexColumns);
            }
        });
    }

    return {
        name: tableName,
        columns,
        primaryKeys,
        foreignKeys,
        indexes
    };
}

function formatDataType(definition: any): string {
    if (!definition) return 'UNKNOWN';

    const datatype = definition.dataType || '';

    if (definition.length !== undefined) {
        return `${datatype}(${definition.length})`;
    }

    return datatype.toUpperCase();
}
