import React, { useCallback, useEffect, useState } from 'react';
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
    Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import { parseSqlToGraph } from './sqlParser';

declare global {
    interface Window {
        initialSqlCode: string;
    }
}

const App: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [sqlCode, setSqlCode] = useState<string>('');
    const [error, setError] = useState<string>('');

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

    const handleReparse = () => {
        if (sqlCode) {
            visualizeSql(sqlCode);
        }
    };

    return (
        <div style={{ width: '100%', height: '100vh', background: '#1e1e1e' }}>
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

export default App;
