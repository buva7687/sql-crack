import React, { useEffect, useState } from 'react';
import ReactFlow, {
    Controls,
    Background,
    BackgroundVariant,
    Panel,
    useReactFlow,
    ReactFlowProvider,
    Node,
    Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
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

            // Auto-fit view after a short delay to ensure nodes are rendered
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

    const exportToPNG = async () => {
        if (!flowRef.current) return;

        setExporting(true);
        try {
            const dataUrl = await toPng(flowRef.current, {
                backgroundColor: '#1e1e1e',
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

    return (
        <div ref={flowRef} style={{ width: '100%', height: '100vh', background: '#0f172a' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
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
                            e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.95)';
                            e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
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
                            backdropFilter: 'blur(8px)',
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
                        {exporting ? 'Exporting...' : 'Export PNG'}
                    </button>
                </Panel>

                <Controls
                    style={{
                        background: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px',
                    }}
                />

                <Background
                    variant={BackgroundVariant.Dots}
                    gap={16}
                    size={1}
                    color="rgba(148, 163, 184, 0.2)"
                />
            </ReactFlow>
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
