import React, { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
    Controls,
    Background,
    BackgroundVariant,
    Panel,
    useReactFlow,
    ReactFlowProvider,
    Node,
    Edge,
    MiniMap,
    NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import { parseSqlToGraph, SqlDialect } from './sqlParserClean';

declare global {
    interface Window {
        initialSqlCode: string;
        vscodeTheme?: string;
    }
}

const FlowComponent: React.FC = () => {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [dialect, setDialect] = useState<SqlDialect>('MySQL');
    const [error, setError] = useState<string>('');
    const [exporting, setExporting] = useState(false);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const { fitView } = useReactFlow();
    const flowRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const initialSql = window.initialSqlCode || '';
        if (initialSql) {
            visualizeSql(initialSql, dialect);
        }
    }, []);

    const visualizeSql = (sql: string, selectedDialect: SqlDialect = dialect) => {
        try {
            setError('');
            const result = parseSqlToGraph(sql, selectedDialect);
            setNodes(result.nodes);
            setEdges(result.edges);
            setSelectedNode(null);

            setTimeout(() => {
                fitView({ padding: 0.2, duration: 300 });
            }, 100);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            console.error('Visualization error:', err);
        }
    };

    const handleDialectChange = (newDialect: SqlDialect) => {
        setDialect(newDialect);
        const sql = window.initialSqlCode || '';
        if (sql) {
            visualizeSql(sql, newDialect);
        }
    };

    const handleFitView = () => {
        fitView({ padding: 0.2, duration: 300 });
    };

    const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
        setSelectedNode(node);
    }, []);

    const onNodeMouseEnter: NodeMouseHandler = useCallback((event, node) => {
        setHoveredNode(node.id);
    }, []);

    const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
        setHoveredNode(null);
    }, []);

    const exportToPNG = async () => {
        if (!flowRef.current) return;

        setExporting(true);
        try {
            const dataUrl = await toPng(flowRef.current, {
                backgroundColor: '#0f172a',
                width: 1920,
                height: 1080,
            });

            const a = document.createElement('a');
            a.setAttribute('download', `sql-visualization-${Date.now()}.png`);
            a.setAttribute('href', dataUrl);
            a.click();
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
                backgroundColor: '#0f172a',
            });

            const a = document.createElement('a');
            a.setAttribute('download', `sql-visualization-${Date.now()}.svg`);
            a.setAttribute('href', dataUrl);
            a.click();
        } catch (error) {
            console.error('Error exporting SVG:', error);
            setError('Failed to export SVG');
        } finally {
            setExporting(false);
        }
    };

    const exportToJSON = () => {
        const exportData = {
            nodes: nodes.map(n => ({
                id: n.id,
                type: n.data.nodeTitle,
                description: n.data.nodeDescription,
                metadata: n.data.metadata,
                position: n.position
            })),
            edges: edges.map(e => ({
                source: e.source,
                target: e.target
            })),
            dialect,
            sql: window.initialSqlCode
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.setAttribute('download', `sql-visualization-${Date.now()}.json`);
        a.setAttribute('href', url);
        a.click();
        URL.revokeObjectURL(url);
    };

    // Highlight connected edges when node is selected or hovered
    const highlightedEdges = edges.map(edge => ({
        ...edge,
        animated: selectedNode?.id === edge.source || selectedNode?.id === edge.target ||
                  hoveredNode === edge.source || hoveredNode === edge.target,
        style: {
            ...edge.style,
            strokeWidth: (selectedNode?.id === edge.source || selectedNode?.id === edge.target ||
                         hoveredNode === edge.source || hoveredNode === edge.target) ? 3 : 2,
        }
    }));

    // Enhanced node styling on hover/select
    const enhancedNodes = nodes.map(node => ({
        ...node,
        style: {
            ...node.style,
            transform: hoveredNode === node.id ? 'scale(1.05)' : 'scale(1)',
            boxShadow: selectedNode?.id === node.id ?
                '0 0 0 3px rgba(99, 102, 241, 0.5)' :
                hoveredNode === node.id ?
                    '0 8px 16px rgba(0, 0, 0, 0.2)' :
                    '0 4px 6px rgba(0, 0, 0, 0.1)',
        }
    }));

    return (
        <div ref={flowRef} style={{ width: '100%', height: '100vh', background: '#0f172a', display: 'flex' }}>
            <ReactFlow
                nodes={enhancedNodes}
                edges={highlightedEdges}
                onNodeClick={onNodeClick}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                fitView
                attributionPosition="bottom-right"
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={true}
            >
                {/* Top Control Panel */}
                <Panel position="top-left" style={{
                    background: 'rgba(15, 23, 42, 0.95)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    backdropFilter: 'blur(8px)',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                    }}>
                        <div style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#f1f5f9',
                            whiteSpace: 'nowrap'
                        }}>
                            SQL Visualization
                        </div>

                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <label style={{
                                fontSize: '12px',
                                color: '#94a3b8',
                                whiteSpace: 'nowrap'
                            }}>
                                Dialect:
                            </label>
                            <select
                                value={dialect}
                                onChange={(e) => handleDialectChange(e.target.value as SqlDialect)}
                                style={{
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    background: '#1e293b',
                                    color: '#f1f5f9',
                                    border: '1px solid rgba(148, 163, 184, 0.2)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    outline: 'none'
                                }}
                            >
                                <option value="MySQL">MySQL</option>
                                <option value="PostgreSQL">PostgreSQL</option>
                                <option value="Transact-SQL">SQL Server</option>
                                <option value="MariaDB">MariaDB</option>
                                <option value="SQLite">SQLite</option>
                            </select>
                        </div>
                    </div>

                    {error && (
                        <div style={{
                            marginTop: '8px',
                            padding: '8px 12px',
                            background: 'rgba(220, 38, 38, 0.1)',
                            border: '1px solid rgba(220, 38, 38, 0.3)',
                            borderRadius: '6px',
                            color: '#fca5a5',
                            fontSize: '12px'
                        }}>
                            {error}
                        </div>
                    )}
                </Panel>

                {/* Action Buttons */}
                <Panel position="top-right" style={{
                    display: 'flex',
                    gap: '8px'
                }}>
                    <button
                        onClick={handleFitView}
                        style={{
                            background: 'rgba(15, 23, 42, 0.95)',
                            color: '#f1f5f9',
                            border: '1px solid rgba(148, 163, 184, 0.2)',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            backdropFilter: 'blur(8px)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(30, 41, 59, 0.95)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.95)';
                        }}
                    >
                        Fit View
                    </button>
                    <button
                        onClick={exportToPNG}
                        disabled={exporting || nodes.length === 0}
                        style={{
                            background: exporting || nodes.length === 0 ?
                                'rgba(71, 85, 105, 0.5)' :
                                'rgba(99, 102, 241, 0.9)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: exporting || nodes.length === 0 ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (!exporting && nodes.length > 0) {
                                e.currentTarget.style.background = 'rgba(79, 70, 229, 1)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!exporting && nodes.length > 0) {
                                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.9)';
                            }
                        }}
                    >
                        PNG
                    </button>
                    <button
                        onClick={exportToSVG}
                        disabled={exporting || nodes.length === 0}
                        style={{
                            background: exporting || nodes.length === 0 ?
                                'rgba(71, 85, 105, 0.5)' :
                                'rgba(16, 185, 129, 0.9)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: exporting || nodes.length === 0 ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (!exporting && nodes.length > 0) {
                                e.currentTarget.style.background = 'rgba(5, 150, 105, 1)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!exporting && nodes.length > 0) {
                                e.currentTarget.style.background = 'rgba(16, 185, 129, 0.9)';
                            }
                        }}
                    >
                        SVG
                    </button>
                    <button
                        onClick={exportToJSON}
                        disabled={nodes.length === 0}
                        style={{
                            background: nodes.length === 0 ?
                                'rgba(71, 85, 105, 0.5)' :
                                'rgba(245, 158, 11, 0.9)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (nodes.length > 0) {
                                e.currentTarget.style.background = 'rgba(217, 119, 6, 1)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (nodes.length > 0) {
                                e.currentTarget.style.background = 'rgba(245, 158, 11, 0.9)';
                            }
                        }}
                    >
                        JSON
                    </button>
                </Panel>

                <Controls
                    style={{
                        background: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px',
                    }}
                />

                <MiniMap
                    style={{
                        background: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px',
                    }}
                    nodeColor={(node) => {
                        return (node.style?.background as string) || '#6366f1';
                    }}
                />

                <Background
                    variant={BackgroundVariant.Dots}
                    gap={16}
                    size={1}
                    color="rgba(148, 163, 184, 0.2)"
                />
            </ReactFlow>

            {/* Node Details Panel */}
            {selectedNode && (
                <div style={{
                    width: '320px',
                    height: '100vh',
                    background: 'rgba(15, 23, 42, 0.98)',
                    borderLeft: '1px solid rgba(148, 163, 184, 0.2)',
                    padding: '20px',
                    overflowY: 'auto',
                    backdropFilter: 'blur(8px)',
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '20px'
                    }}>
                        <h3 style={{
                            margin: 0,
                            fontSize: '16px',
                            fontWeight: 600,
                            color: '#f1f5f9'
                        }}>
                            Node Details
                        </h3>
                        <button
                            onClick={() => setSelectedNode(null)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                fontSize: '20px',
                                cursor: 'pointer',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)';
                                e.currentTarget.style.color = '#f1f5f9';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = '#94a3b8';
                            }}
                        >
                            ×
                        </button>
                    </div>

                    <div style={{
                        background: 'rgba(30, 41, 59, 0.5)',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        border: '1px solid rgba(148, 163, 184, 0.1)'
                    }}>
                        <div style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#f1f5f9',
                            marginBottom: '8px'
                        }}>
                            {selectedNode.data.nodeTitle}
                        </div>
                        <div style={{
                            fontSize: '12px',
                            color: '#94a3b8',
                            lineHeight: '1.6'
                        }}>
                            {selectedNode.data.nodeDescription}
                        </div>
                    </div>

                    {selectedNode.data.metadata && (
                        <div>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#cbd5e1',
                                marginBottom: '12px'
                            }}>
                                Operation Details
                            </div>

                            {selectedNode.data.metadata.details && selectedNode.data.metadata.details.length > 0 && (
                                <div style={{
                                    background: 'rgba(30, 41, 59, 0.5)',
                                    padding: '12px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    border: '1px solid rgba(148, 163, 184, 0.1)'
                                }}>
                                    {selectedNode.data.metadata.details.map((detail: string, idx: number) => (
                                        <div
                                            key={idx}
                                            style={{
                                                fontSize: '11px',
                                                color: '#94a3b8',
                                                padding: '4px 0',
                                                lineHeight: '1.5',
                                                fontFamily: 'monospace'
                                            }}
                                        >
                                            • {detail}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedNode.data.metadata.sqlFragment && (
                                <div>
                                    <div style={{
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        color: '#cbd5e1',
                                        marginBottom: '8px'
                                    }}>
                                        SQL Fragment
                                    </div>
                                    <div style={{
                                        background: 'rgba(0, 0, 0, 0.3)',
                                        padding: '12px',
                                        borderRadius: '6px',
                                        border: '1px solid rgba(148, 163, 184, 0.1)',
                                        fontFamily: 'monospace',
                                        fontSize: '11px',
                                        color: '#94a3b8',
                                        lineHeight: '1.6',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}>
                                        {selectedNode.data.metadata.sqlFragment}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{
                        marginTop: '20px',
                        padding: '12px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#a5b4fc',
                        lineHeight: '1.5'
                    }}>
                        💡 Tip: Click on different nodes to see their execution details
                    </div>
                </div>
            )}
        </div>
    );
};

const AppClean: React.FC = () => {
    return (
        <ReactFlowProvider>
            <FlowComponent />
        </ReactFlowProvider>
    );
};

export default AppClean;
