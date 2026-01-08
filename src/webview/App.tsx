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
    getTransformForBounds
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng, toSvg } from 'html-to-image';
import { parseSqlToGraph } from './sqlParser';

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
    const { getNodes } = useReactFlow();
    const flowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Get initial SQL code from window
        const initialSql = window.initialSqlCode || '';
        setSqlCode(initialSql);

        if (initialSql) {
            visualizeSql(initialSql);
        }
    }, []);

    const visualizeSql = (sql: string) => {
        try {
            setError('');
            const { nodes: parsedNodes, edges: parsedEdges } = parseSqlToGraph(sql);
            setNodes(parsedNodes);
            setEdges(parsedEdges);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            console.error('Visualization error:', err);
        }
    };

    const onConnect = useCallback(
        (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    );

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
                fitView
                attributionPosition="bottom-right"
            >
                <Panel position="top-left" style={{
                    background: 'rgba(30, 30, 30, 0.95)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid #404040',
                    color: '#fff'
                }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>
                        SQL Crack - Query Visualization
                    </h3>
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
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
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
                </Panel>

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
