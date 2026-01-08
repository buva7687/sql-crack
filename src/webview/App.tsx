import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
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
import { calculateQueryStats, getComplexityColor } from './queryStats';
import { themes, Theme } from './themes';
import { analyzeQueryForHints, OptimizationHint, getHintColor, getHintIcon } from './optimizationHints';
import { saveQuery, getSavedQueries, deleteQuery, addToHistory, SavedQuery } from './queryStorage';
import { processBatchQueries, hasMultipleQueries, getQueryPreview, QueryBatch } from './batchProcessor';

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
    const [showStats, setShowStats] = useState<boolean>(true);
    const [themeName, setThemeName] = useState<string>('dark');
    const [optimizationHints, setOptimizationHints] = useState<OptimizationHint[]>([]);
    const [showHints, setShowHints] = useState<boolean>(true);
    const [showSavedQueries, setShowSavedQueries] = useState<boolean>(false);
    const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
    const [batchMode, setBatchMode] = useState<boolean>(false);
    const [batchQueries, setBatchQueries] = useState<QueryBatch[]>([]);
    const [currentQueryIndex, setCurrentQueryIndex] = useState<number>(0);
    const { getNodes, fitView } = useReactFlow();
    const flowRef = useRef<HTMLDivElement>(null);

    // Load saved queries on mount
    useEffect(() => {
        const queries = getSavedQueries();
        setSavedQueries(queries);
    }, []);

    // Get current theme
    const currentTheme = themes[themeName];

    // Calculate query statistics
    const stats = useMemo(() => calculateQueryStats(nodes, edges), [nodes, edges]);

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

            // Check if this is a batch of queries
            if (hasMultipleQueries(sql)) {
                const batchResult = processBatchQueries(sql, selectedDialect);
                setBatchQueries(batchResult.queries);
                setBatchMode(true);
                setCurrentQueryIndex(0);

                // Show the first query
                if (batchResult.queries.length > 0) {
                    const firstQuery = batchResult.queries[0];
                    if (firstQuery.error) {
                        setError(`Query 1: ${firstQuery.error}`);
                        setNodes([]);
                        setEdges([]);
                        setOptimizationHints([]);
                    } else {
                        setNodes(firstQuery.nodes);
                        setEdges(firstQuery.edges);

                        // Analyze for optimization hints
                        if (firstQuery.ast) {
                            const hints = analyzeQueryForHints(firstQuery.sql, firstQuery.ast);
                            setOptimizationHints(hints);
                        } else {
                            setOptimizationHints([]);
                        }
                    }
                }
            } else {
                // Single query mode
                setBatchMode(false);
                setBatchQueries([]);
                setCurrentQueryIndex(0);

                const { nodes: parsedNodes, edges: parsedEdges, ast } = parseSqlToGraph(sql, selectedDialect);
                setNodes(parsedNodes);
                setEdges(parsedEdges);

                // Analyze for optimization hints
                if (ast) {
                    const hints = analyzeQueryForHints(sql, ast);
                    setOptimizationHints(hints);
                } else {
                    setOptimizationHints([]);
                }
            }

            // Add to history
            if (sql.trim()) {
                addToHistory(sql, selectedDialect);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            console.error('Visualization error:', err);
            setOptimizationHints([]);
            setBatchMode(false);
            setBatchQueries([]);
        }
    };

    const handleSaveQuery = () => {
        if (!sqlCode.trim()) {
            setError('No SQL code to save');
            return;
        }

        const name = prompt('Enter a name for this query:');
        if (!name) return;

        const saved = saveQuery({
            name,
            sql: sqlCode,
            dialect
        });

        setSavedQueries([...savedQueries, saved]);
        alert(`Query "${name}" saved successfully!`);
    };

    const handleLoadQuery = (query: SavedQuery) => {
        setSqlCode(query.sql);
        setDialect(query.dialect as SqlDialect);
        visualizeSql(query.sql, query.dialect as SqlDialect);
        setShowSavedQueries(false);
    };

    const handleDeleteQuery = (id: string) => {
        if (confirm('Delete this saved query?')) {
            deleteQuery(id);
            setSavedQueries(savedQueries.filter(q => q.id !== id));
        }
    };

    const handleBatchQueryChange = (index: number) => {
        if (index < 0 || index >= batchQueries.length) return;

        setCurrentQueryIndex(index);
        const query = batchQueries[index];

        if (query.error) {
            setError(`Query ${index + 1}: ${query.error}`);
            setNodes([]);
            setEdges([]);
            setOptimizationHints([]);
        } else {
            setError('');
            setNodes(query.nodes);
            setEdges(query.edges);

            // Analyze for optimization hints
            if (query.ast) {
                const hints = analyzeQueryForHints(query.sql, query.ast);
                setOptimizationHints(hints);
            } else {
                setOptimizationHints([]);
            }
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
        <div ref={flowRef} style={{ width: '100%', height: '100vh', background: currentTheme.background }}>
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

                    <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                        <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '4px' }}>
                            Theme:
                        </label>
                        <select
                            value={themeName}
                            onChange={(e) => setThemeName(e.target.value)}
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
                            {Object.keys(themes).map(key => (
                                <option key={key} value={key}>{themes[key].name}</option>
                            ))}
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
                    <button
                        onClick={handleSaveQuery}
                        disabled={!sqlCode.trim()}
                        style={{
                            background: '#9f7aea',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: !sqlCode.trim() ? 'not-allowed' : 'pointer',
                            opacity: !sqlCode.trim() ? 0.5 : 1,
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (sqlCode.trim()) {
                                e.currentTarget.style.background = '#805ad5';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#9f7aea';
                        }}
                    >
                        💾 Save
                    </button>
                    <button
                        onClick={() => setShowSavedQueries(!showSavedQueries)}
                        style={{
                            background: '#ed8936',
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
                            e.currentTarget.style.background = '#dd6b20';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#ed8936';
                        }}
                    >
                        📂 Saved ({savedQueries.length})
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

                {showStats && nodes.length > 0 && (
                    <Panel position="bottom-right" style={{
                        background: 'rgba(30, 30, 30, 0.95)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #404040',
                        color: '#fff',
                        minWidth: '280px'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px'
                        }}>
                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
                                Query Statistics
                            </h4>
                            <button
                                onClick={() => setShowStats(false)}
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

                        <div style={{ fontSize: '12px' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '6px 0',
                                borderBottom: '1px solid #404040'
                            }}>
                                <span style={{ color: '#888' }}>Complexity:</span>
                                <span style={{
                                    fontWeight: 600,
                                    color: getComplexityColor(stats.complexityLevel)
                                }}>
                                    {stats.complexityLevel} ({stats.complexityScore})
                                </span>
                            </div>

                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '6px 0',
                                borderBottom: '1px solid #404040'
                            }}>
                                <span style={{ color: '#888' }}>Total Nodes:</span>
                                <span style={{ color: '#fff' }}>{stats.totalNodes}</span>
                            </div>

                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '6px 0',
                                borderBottom: '1px solid #404040'
                            }}>
                                <span style={{ color: '#888' }}>Tables:</span>
                                <span style={{ color: '#fff' }}>{stats.tableCount}</span>
                            </div>

                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '6px 0',
                                borderBottom: '1px solid #404040'
                            }}>
                                <span style={{ color: '#888' }}>JOINs:</span>
                                <span style={{ color: '#fff' }}>{stats.joinCount}</span>
                            </div>

                            {stats.cteCount > 0 && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '6px 0',
                                    borderBottom: '1px solid #404040'
                                }}>
                                    <span style={{ color: '#888' }}>CTEs:</span>
                                    <span style={{ color: '#805ad5' }}>{stats.cteCount}</span>
                                </div>
                            )}

                            {stats.windowFunctionCount > 0 && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '6px 0',
                                    borderBottom: '1px solid #404040'
                                }}>
                                    <span style={{ color: '#888' }}>Window Functions:</span>
                                    <span style={{ color: '#d53f8c' }}>{stats.windowFunctionCount}</span>
                                </div>
                            )}

                            {stats.subqueryCount > 0 && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '6px 0',
                                    borderBottom: '1px solid #404040'
                                }}>
                                    <span style={{ color: '#888' }}>Subqueries:</span>
                                    <span style={{ color: '#38b2ac' }}>{stats.subqueryCount}</span>
                                </div>
                            )}

                            {stats.setOperationCount > 0 && (
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '6px 0'
                                }}>
                                    <span style={{ color: '#888' }}>Set Operations:</span>
                                    <span style={{ color: '#f6ad55' }}>{stats.setOperationCount}</span>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setShowStats(false)}
                            style={{
                                marginTop: '12px',
                                width: '100%',
                                padding: '6px',
                                background: '#2d2d2d',
                                color: '#aaa',
                                border: '1px solid #404040',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            Hide Statistics
                        </button>
                    </Panel>
                )}

                {showHints && optimizationHints.length > 0 && (
                    <Panel position="top-center" style={{
                        background: 'rgba(30, 30, 30, 0.95)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #404040',
                        color: '#fff',
                        minWidth: '350px',
                        maxWidth: '500px',
                        maxHeight: '300px',
                        overflowY: 'auto'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px'
                        }}>
                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
                                ⚡ Optimization Hints ({optimizationHints.length})
                            </h4>
                            <button
                                onClick={() => setShowHints(false)}
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

                        <div style={{ fontSize: '12px' }}>
                            {optimizationHints.map((hint, index) => (
                                <div
                                    key={hint.id}
                                    style={{
                                        padding: '10px',
                                        marginBottom: '8px',
                                        background: 'rgba(0, 0, 0, 0.3)',
                                        borderLeft: `3px solid ${getHintColor(hint.severity)}`,
                                        borderRadius: '4px'
                                    }}
                                >
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        marginBottom: '6px'
                                    }}>
                                        <span style={{ marginRight: '6px' }}>{getHintIcon(hint.severity)}</span>
                                        <span style={{
                                            fontWeight: 600,
                                            color: getHintColor(hint.severity),
                                            fontSize: '12px'
                                        }}>
                                            {hint.title}
                                        </span>
                                        <span style={{
                                            marginLeft: 'auto',
                                            fontSize: '10px',
                                            color: '#888',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '3px'
                                        }}>
                                            {hint.category}
                                        </span>
                                    </div>
                                    <div style={{
                                        color: '#ccc',
                                        fontSize: '11px',
                                        lineHeight: '1.5'
                                    }}>
                                        {hint.description}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => setShowHints(false)}
                            style={{
                                marginTop: '8px',
                                width: '100%',
                                padding: '6px',
                                background: '#2d2d2d',
                                color: '#aaa',
                                border: '1px solid #404040',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                            }}
                        >
                            Hide Hints
                        </button>
                    </Panel>
                )}

                {showSavedQueries && (
                    <Panel position="bottom-center" style={{
                        background: 'rgba(30, 30, 30, 0.95)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #404040',
                        color: '#fff',
                        minWidth: '400px',
                        maxWidth: '600px',
                        maxHeight: '400px',
                        overflowY: 'auto'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px'
                        }}>
                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
                                📂 Saved Queries ({savedQueries.length})
                            </h4>
                            <button
                                onClick={() => setShowSavedQueries(false)}
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

                        {savedQueries.length === 0 ? (
                            <div style={{
                                padding: '20px',
                                textAlign: 'center',
                                color: '#888',
                                fontSize: '12px'
                            }}>
                                No saved queries yet. Click "💾 Save" to save your current query.
                            </div>
                        ) : (
                            <div style={{ fontSize: '12px' }}>
                                {savedQueries.map((query) => (
                                    <div
                                        key={query.id}
                                        style={{
                                            padding: '12px',
                                            marginBottom: '8px',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            borderRadius: '6px',
                                            border: '1px solid #404040'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            marginBottom: '8px'
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{
                                                    fontWeight: 600,
                                                    fontSize: '13px',
                                                    color: '#fff',
                                                    marginBottom: '4px'
                                                }}>
                                                    {query.name}
                                                </div>
                                                <div style={{
                                                    fontSize: '11px',
                                                    color: '#888',
                                                    marginBottom: '6px'
                                                }}>
                                                    <span style={{
                                                        background: 'rgba(102, 126, 234, 0.2)',
                                                        color: '#667eea',
                                                        padding: '2px 6px',
                                                        borderRadius: '3px',
                                                        marginRight: '6px'
                                                    }}>
                                                        {query.dialect}
                                                    </span>
                                                    <span>
                                                        {new Date(query.createdAt).toLocaleDateString()} {new Date(query.createdAt).toLocaleTimeString()}
                                                    </span>
                                                </div>
                                                <div style={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '10px',
                                                    color: '#aaa',
                                                    maxHeight: '60px',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {query.sql.substring(0, 100)}{query.sql.length > 100 ? '...' : ''}
                                                </div>
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                gap: '6px',
                                                marginLeft: '12px'
                                            }}>
                                                <button
                                                    onClick={() => handleLoadQuery(query)}
                                                    style={{
                                                        background: '#48bb78',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        padding: '6px 12px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = '#38a169';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = '#48bb78';
                                                    }}
                                                >
                                                    Load
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteQuery(query.id)}
                                                    style={{
                                                        background: '#f56565',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        padding: '6px 12px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = '#e53e3e';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = '#f56565';
                                                    }}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                )}

                {batchMode && batchQueries.length > 0 && (
                    <Panel position="top-center" style={{
                        background: 'rgba(30, 30, 30, 0.95)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #404040',
                        color: '#fff',
                        minWidth: '500px',
                        maxWidth: '700px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <div style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#667eea',
                                whiteSpace: 'nowrap'
                            }}>
                                Batch Mode: {batchQueries.length} {batchQueries.length === 1 ? 'Query' : 'Queries'}
                            </div>
                            <div style={{
                                display: 'flex',
                                gap: '6px',
                                flex: 1,
                                overflowX: 'auto',
                                paddingBottom: '4px'
                            }}>
                                {batchQueries.map((query, index) => (
                                    <button
                                        key={query.id}
                                        onClick={() => handleBatchQueryChange(index)}
                                        style={{
                                            background: currentQueryIndex === index ? '#667eea' : '#2d2d2d',
                                            color: currentQueryIndex === index ? 'white' : '#aaa',
                                            border: query.error ? '1px solid #f56565' : '1px solid #404040',
                                            borderRadius: '6px',
                                            padding: '8px 14px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.2s',
                                            minWidth: '80px'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (currentQueryIndex !== index) {
                                                e.currentTarget.style.background = '#404040';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (currentQueryIndex !== index) {
                                                e.currentTarget.style.background = '#2d2d2d';
                                            }
                                        }}
                                    >
                                        <div>Query {index + 1}</div>
                                        <div style={{
                                            fontSize: '9px',
                                            marginTop: '2px',
                                            color: currentQueryIndex === index ? '#e0e0e0' : '#666'
                                        }}>
                                            {query.error ? '❌ Error' : `${query.nodes.length} nodes`}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <div style={{
                                display: 'flex',
                                gap: '4px'
                            }}>
                                <button
                                    onClick={() => handleBatchQueryChange(currentQueryIndex - 1)}
                                    disabled={currentQueryIndex === 0}
                                    style={{
                                        background: '#2d2d2d',
                                        color: currentQueryIndex === 0 ? '#555' : '#aaa',
                                        border: '1px solid #404040',
                                        borderRadius: '4px',
                                        padding: '6px 10px',
                                        fontSize: '12px',
                                        cursor: currentQueryIndex === 0 ? 'not-allowed' : 'pointer',
                                        opacity: currentQueryIndex === 0 ? 0.5 : 1
                                    }}
                                >
                                    ←
                                </button>
                                <button
                                    onClick={() => handleBatchQueryChange(currentQueryIndex + 1)}
                                    disabled={currentQueryIndex === batchQueries.length - 1}
                                    style={{
                                        background: '#2d2d2d',
                                        color: currentQueryIndex === batchQueries.length - 1 ? '#555' : '#aaa',
                                        border: '1px solid #404040',
                                        borderRadius: '4px',
                                        padding: '6px 10px',
                                        fontSize: '12px',
                                        cursor: currentQueryIndex === batchQueries.length - 1 ? 'not-allowed' : 'pointer',
                                        opacity: currentQueryIndex === batchQueries.length - 1 ? 0.5 : 1
                                    }}
                                >
                                    →
                                </button>
                            </div>
                        </div>
                        {batchQueries[currentQueryIndex] && (
                            <div style={{
                                marginTop: '10px',
                                padding: '8px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                color: '#aaa',
                                maxHeight: '60px',
                                overflowY: 'auto'
                            }}>
                                {batchQueries[currentQueryIndex].sql}
                            </div>
                        )}
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
                    color={currentTheme.dotColor}
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
