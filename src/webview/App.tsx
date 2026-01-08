import React, { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    BackgroundVariant,
    Panel,
    useReactFlow,
    ReactFlowProvider,
    getRectOfNodes,
    getTransformForBounds,
    Node as FlowNode
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import { parseSqlToGraph, SqlDialect } from './sqlParser';

declare global {
    interface Window {
        initialSqlCode: string;
    }
}

const imageWidth = 1920;
const imageHeight = 1080;

const FlowComponent: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [sqlCode, setSqlCode] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [exporting, setExporting] = useState<boolean>(false);
    const [dialect, setDialect] = useState<SqlDialect>('MySQL');
    const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
    const { getNodes, fitView } = useReactFlow();
    const flowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Get initial SQL code from window
        const initialSql = window.initialSqlCode || '';
        setSqlCode(initialSql);

        if (initialSql) {
            visualizeSql(initialSql, dialect);
        }
    }, []);

    const visualizeSql = (sql: string, selectedDialect: SqlDialect = dialect) => {
        try {
            setError('');
            const { nodes: parsedNodes, edges: parsedEdges } = parseSqlToGraph(sql, selectedDialect);
            setNodes(parsedNodes);
            setEdges(parsedEdges);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            console.error('Visualization error:', err);
        }
    };

    const handleDialectChange = (newDialect: SqlDialect) => {
        setDialect(newDialect);
        if (sqlCode) {
            visualizeSql(sqlCode, newDialect);
        }
    };

    const onConnect = useCallback(
        (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    );

    const onNodeClick = useCallback(
        (event: React.MouseEvent, node: FlowNode) => {
            setSelectedNode(node);
        },
        []
    );

    const handleFitView = () => {
        fitView({ padding: 0.2, duration: 300 });
    };

    const downloadImage = (dataUrl: string, extension: string) => {
        const a = document.createElement('a');
        a.setAttribute('download', `sql-visualization-${Date.now()}.${extension}`);
        a.setAttribute('href', dataUrl);
        a.click();
    };

    const exportToPNG = async () => {
        if (!flowRef.current) return;

        setExporting(true);
        try {
            const dataUrl = await toPng(flowRef.current, {
                backgroundColor: '#1e1e1e',
                width: imageWidth,
                height: imageHeight,
                style: {
                    width: `${imageWidth}px`,
                    height: `${imageHeight}px`,
                }
            });
            downloadImage(dataUrl, 'png');
        } catch (error) {
            console.error('Error exporting PNG:', error);
            setError('Failed to export PNG');
        } finally {
            setExporting(false);
        }
    };

    const exportToSVG = async () => {
        if (!flowRef.current) return;

        setExporting(true);
        try {
            const dataUrl = await toSvg(flowRef.current, {
                backgroundColor: '#1e1e1e',
                width: imageWidth,
                height: imageHeight,
                style: {
                    width: `${imageWidth}px`,
                    height: `${imageHeight}px`,
                }
            });
            downloadImage(dataUrl, 'svg');
        } catch (error) {
            console.error('Error exporting SVG:', error);
            setError('Failed to export SVG');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div ref={flowRef} style={{ width: '100%', height: '100vh', background: '#1e1e1e' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                fitView
                attributionPosition="bottom-right"
            >
                <Panel position="top-left" style={{
                    background: 'rgba(30, 30, 30, 0.95)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid #404040',
                    color: '#fff',
                    minWidth: '280px'
                }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>
                        SQL Crack - Query Visualization
                    </h3>

                    <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                        <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '4px' }}>
                            SQL Dialect:
                        </label>
                        <select
                            value={dialect}
                            onChange={(e) => handleDialectChange(e.target.value as SqlDialect)}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                fontSize: '12px',
                                background: '#2d2d2d',
                                color: '#fff',
                                border: '1px solid #404040',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                        >
                            <option value="MySQL">MySQL</option>
                            <option value="PostgreSQL">PostgreSQL</option>
                            <option value="Transact-SQL">SQL Server (T-SQL)</option>
                            <option value="MariaDB">MariaDB</option>
                            <option value="SQLite">SQLite</option>
                        </select>
                    </div>

                    {error && (
                        <div style={{
                            color: '#ff6b6b',
                            fontSize: '12px',
                            marginTop: '8px',
                            padding: '8px',
                            background: 'rgba(255, 107, 107, 0.1)',
                            borderRadius: '4px'
                        }}>
                            Error: {error}
                        </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
                        Drag to pan • Scroll to zoom • Click nodes to select
                    </div>
                </Panel>

                <Panel position="top-right" style={{
                    background: 'rgba(30, 30, 30, 0.95)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #404040',
                    display: 'flex',
                    gap: '8px'
                }}>
                    <button
                        onClick={exportToPNG}
                        disabled={exporting || nodes.length === 0}
                        style={{
                            background: '#667eea',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: exporting || nodes.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: exporting || nodes.length === 0 ? 0.5 : 1,
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (!exporting && nodes.length > 0) {
                                e.currentTarget.style.background = '#5568d3';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#667eea';
                        }}
                    >
                        {exporting ? 'Exporting...' : 'Export PNG'}
                    </button>
                    <button
                        onClick={exportToSVG}
                        disabled={exporting || nodes.length === 0}
                        style={{
                            background: '#48bb78',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: exporting || nodes.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: exporting || nodes.length === 0 ? 0.5 : 1,
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (!exporting && nodes.length > 0) {
                                e.currentTarget.style.background = '#38a169';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#48bb78';
                        }}
                    >
                        {exporting ? 'Exporting...' : 'Export SVG'}
                    </button>
                    <button
                        onClick={handleFitView}
                        style={{
                            background: '#4299e1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#3182ce';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#4299e1';
                        }}
                    >
                        Fit View
                    </button>
                </Panel>

                {selectedNode && (
                    <Panel position="bottom-left" style={{
                        background: 'rgba(30, 30, 30, 0.95)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #404040',
                        color: '#fff',
                        minWidth: '300px',
                        maxWidth: '400px'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '8px'
                        }}>
                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#667eea' }}>
                                Node Details
                            </h4>
                            <button
                                onClick={() => setSelectedNode(null)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#888',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    padding: '0 4px'
                                }}
                            >
                                ×
                            </button>
                        </div>
                        <div style={{ fontSize: '12px', marginTop: '8px' }}>
                            <div style={{ marginBottom: '6px' }}>
                                <span style={{ color: '#888' }}>Type:</span>{' '}
                                <span style={{ color: '#fff' }}>{selectedNode.type || 'default'}</span>
                            </div>
                            <div style={{ marginBottom: '6px' }}>
                                <span style={{ color: '#888' }}>ID:</span>{' '}
                                <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: '11px' }}>
                                    {selectedNode.id}
                                </span>
                            </div>
                            <div style={{
                                marginTop: '10px',
                                padding: '8px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '4px',
                                fontFamily: 'monospace',
                                fontSize: '11px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: '150px',
                                overflowY: 'auto'
                            }}>
                                {typeof selectedNode.data.label === 'string'
                                    ? selectedNode.data.label
                                    : JSON.stringify(selectedNode.data, null, 2)}
                            </div>
                        </div>
                    </Panel>
                )}

                <Controls />

                <MiniMap
                    style={{
                        background: '#2d2d2d',
                        border: '1px solid #404040'
                    }}
                    nodeColor={(node) => {
                        if (node.style?.background) {
                            return node.style.background as string;
                        }
                        return '#667eea';
                    }}
                />

                <Background
                    variant={BackgroundVariant.Dots}
                    gap={12}
                    size={1}
                    color="#404040"
                />
            </ReactFlow>
        </div>
    );
};

const App: React.FC = () => {
    return (
        <ReactFlowProvider>
            <FlowComponent />
        </ReactFlowProvider>
    );
};

export default App;
