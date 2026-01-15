// Dependency Graph Builder - Create visualization graph from index

import * as path from 'path';
import {
    WorkspaceIndex,
    WorkspaceDependencyGraph,
    WorkspaceNode,
    WorkspaceEdge,
    WorkspaceStats,
    GraphMode,
    TableReference
} from './types';

/**
 * Build a dependency graph from the workspace index
 */
export function buildDependencyGraph(
    index: WorkspaceIndex,
    mode: GraphMode = 'files'
): WorkspaceDependencyGraph {
    const nodes: WorkspaceNode[] = [];
    const edges: WorkspaceEdge[] = [];
    const nodeIdMap = new Map<string, string>();

    // Build graph based on mode
    if (mode === 'files') {
        buildFileGraph(index, nodes, edges, nodeIdMap);
    } else if (mode === 'tables') {
        buildTableGraph(index, nodes, edges, nodeIdMap);
    } else {
        buildHybridGraph(index, nodes, edges, nodeIdMap);
    }

    // Calculate statistics
    const stats = calculateStats(index);

    // Layout the graph
    layoutGraph(nodes, edges);

    return { nodes, edges, stats };
}

/**
 * Build file-centric graph (files as nodes)
 */
function buildFileGraph(
    index: WorkspaceIndex,
    nodes: WorkspaceNode[],
    edges: WorkspaceEdge[],
    nodeIdMap: Map<string, string>
): void {
    // Create file nodes
    for (const [filePath, analysis] of index.files.entries()) {
        const nodeId = `file_${nodes.length}`;
        nodeIdMap.set(filePath, nodeId);

        nodes.push({
            id: nodeId,
            type: 'file',
            label: path.basename(filePath),
            filePath,
            definitions: analysis.definitions,
            references: analysis.references,
            definitionCount: analysis.definitions.length,
            referenceCount: analysis.references.length,
            x: 0,
            y: 0,
            width: 200,
            height: 80 + Math.min(analysis.definitions.length * 15, 60)
        });
    }

    // Create edges between files
    const edgeMap = new Map<string, { count: number; types: Set<string>; tables: Set<string> }>();

    for (const [filePath, analysis] of index.files.entries()) {
        const sourceId = nodeIdMap.get(filePath);
        if (!sourceId) continue;

        for (const ref of analysis.references) {
            const def = index.definitionMap.get(ref.tableName.toLowerCase());
            if (def && def.filePath !== filePath) {
                const targetId = nodeIdMap.get(def.filePath);
                if (targetId) {
                    const edgeKey = `${sourceId}->${targetId}`;
                    if (!edgeMap.has(edgeKey)) {
                        edgeMap.set(edgeKey, { count: 0, types: new Set(), tables: new Set() });
                    }
                    const edgeData = edgeMap.get(edgeKey)!;
                    edgeData.count++;
                    edgeData.types.add(ref.referenceType);
                    edgeData.tables.add(ref.tableName);
                }
            }
        }
    }

    // Convert edge map to edges
    for (const [key, data] of edgeMap.entries()) {
        const [source, target] = key.split('->');
        edges.push({
            id: `edge_${edges.length}`,
            source,
            target,
            referenceType: getPrimaryReferenceType([...data.types] as TableReference['referenceType'][]),
            count: data.count,
            tables: [...data.tables]
        });
    }
}

/**
 * Build table-centric graph (tables as nodes)
 */
function buildTableGraph(
    index: WorkspaceIndex,
    nodes: WorkspaceNode[],
    edges: WorkspaceEdge[],
    nodeIdMap: Map<string, string>
): void {
    // Create nodes for defined tables/views
    for (const [name, def] of index.definitionMap.entries()) {
        const nodeId = `table_${nodes.length}`;
        nodeIdMap.set(name, nodeId);

        nodes.push({
            id: nodeId,
            type: def.type,
            label: def.name,
            filePath: def.filePath,
            definitions: [def],
            x: 0,
            y: 0,
            width: 160,
            height: 60
        });
    }

    // Create nodes for external (undefined) tables
    for (const [name, refs] of index.referenceMap.entries()) {
        if (!index.definitionMap.has(name)) {
            const nodeId = `external_${nodes.length}`;
            nodeIdMap.set(name, nodeId);

            nodes.push({
                id: nodeId,
                type: 'external',
                label: name,
                references: refs,
                referenceCount: refs.length,
                x: 0,
                y: 0,
                width: 160,
                height: 60
            });
        }
    }

    // Create edges based on view/query dependencies
    // Views reference tables, so create edges from views to their source tables
    for (const [filePath, analysis] of index.files.entries()) {
        // Get tables defined in this file
        const definedHere = new Set(
            analysis.definitions.map(d => d.name.toLowerCase())
        );

        for (const def of analysis.definitions) {
            if (def.type === 'view') {
                // Views reference other tables - find what this view references
                for (const ref of analysis.references) {
                    const refKey = ref.tableName.toLowerCase();
                    if (!definedHere.has(refKey)) {
                        const sourceId = nodeIdMap.get(def.name.toLowerCase());
                        const targetId = nodeIdMap.get(refKey);
                        if (sourceId && targetId && sourceId !== targetId) {
                            edges.push({
                                id: `edge_${edges.length}`,
                                source: sourceId,
                                target: targetId,
                                referenceType: ref.referenceType,
                                count: 1,
                                tables: [ref.tableName]
                            });
                        }
                    }
                }
            }
        }
    }
}

/**
 * Build hybrid graph (files + prominent tables)
 */
function buildHybridGraph(
    index: WorkspaceIndex,
    nodes: WorkspaceNode[],
    edges: WorkspaceEdge[],
    nodeIdMap: Map<string, string>
): void {
    // Count references per table
    const referenceCount = new Map<string, number>();
    for (const refs of index.referenceMap.values()) {
        for (const ref of refs) {
            const key = ref.tableName.toLowerCase();
            referenceCount.set(key, (referenceCount.get(key) || 0) + 1);
        }
    }

    // Create file nodes
    for (const [filePath, analysis] of index.files.entries()) {
        const nodeId = `file_${nodes.length}`;
        nodeIdMap.set(filePath, nodeId);

        const height = 80 + Math.min(analysis.definitions.length * 15, 60);

        nodes.push({
            id: nodeId,
            type: 'file',
            label: path.basename(filePath),
            filePath,
            definitions: analysis.definitions,
            references: analysis.references,
            definitionCount: analysis.definitions.length,
            referenceCount: analysis.references.length,
            x: 0,
            y: 0,
            width: 200,
            height
        });
    }

    // Create separate nodes for highly-referenced tables (referenced 3+ times from different files)
    const prominentTables = new Set<string>();
    for (const [name, count] of referenceCount.entries()) {
        if (count >= 3) {
            const def = index.definitionMap.get(name);
            if (def) {
                prominentTables.add(name);
                const nodeId = `table_${nodes.length}`;
                nodeIdMap.set(`prominent:${name}`, nodeId);

                nodes.push({
                    id: nodeId,
                    type: def.type,
                    label: def.name,
                    filePath: def.filePath,
                    definitions: [def],
                    referenceCount: count,
                    x: 0,
                    y: 0,
                    width: 160,
                    height: 60
                });
            }
        }
    }

    // Create file-to-file edges
    const edgeMap = new Map<string, { count: number; type: TableReference['referenceType']; tables: Set<string> }>();

    for (const [filePath, analysis] of index.files.entries()) {
        const sourceId = nodeIdMap.get(filePath);
        if (!sourceId) continue;

        for (const ref of analysis.references) {
            const def = index.definitionMap.get(ref.tableName.toLowerCase());
            if (def && def.filePath !== filePath) {
                const targetId = nodeIdMap.get(def.filePath);
                if (targetId) {
                    const edgeKey = `${sourceId}->${targetId}`;
                    if (!edgeMap.has(edgeKey)) {
                        edgeMap.set(edgeKey, { count: 0, type: ref.referenceType, tables: new Set() });
                    }
                    edgeMap.get(edgeKey)!.count++;
                    edgeMap.get(edgeKey)!.tables.add(ref.tableName);
                }
            }
        }
    }

    for (const [key, data] of edgeMap.entries()) {
        const [source, target] = key.split('->');
        edges.push({
            id: `edge_${edges.length}`,
            source,
            target,
            referenceType: data.type,
            count: data.count,
            tables: [...data.tables]
        });
    }
}

/**
 * Calculate workspace statistics
 */
function calculateStats(index: WorkspaceIndex): WorkspaceStats {
    let totalTables = 0;
    let totalViews = 0;
    let totalReferences = 0;
    const orphanedDefinitions: string[] = [];
    const missingDefinitions: string[] = [];

    // Count tables and views
    for (const def of index.definitionMap.values()) {
        if (def.type === 'table') totalTables++;
        else if (def.type === 'view') totalViews++;

        // Check if orphaned (defined but never referenced)
        const refs = index.referenceMap.get(def.name.toLowerCase());
        if (!refs || refs.length === 0) {
            orphanedDefinitions.push(def.name);
        }
    }

    // Count references and find missing definitions
    for (const [tableName, refs] of index.referenceMap.entries()) {
        totalReferences += refs.length;

        if (!index.definitionMap.has(tableName)) {
            missingDefinitions.push(tableName);
        }
    }

    // Detect circular dependencies (simplified: check for bidirectional file dependencies)
    const circularDependencies: string[] = [];
    const fileDeps = new Map<string, Set<string>>();

    for (const [filePath, analysis] of index.files.entries()) {
        const deps = new Set<string>();
        for (const ref of analysis.references) {
            const def = index.definitionMap.get(ref.tableName.toLowerCase());
            if (def && def.filePath !== filePath) {
                deps.add(def.filePath);
            }
        }
        fileDeps.set(filePath, deps);
    }

    // Check for bidirectional dependencies (A depends on B and B depends on A)
    const checkedPairs = new Set<string>();
    for (const [fileA, depsA] of fileDeps.entries()) {
        for (const fileB of depsA) {
            const pairKey = [fileA, fileB].sort().join('|');
            if (checkedPairs.has(pairKey)) continue;
            checkedPairs.add(pairKey);

            const depsB = fileDeps.get(fileB);
            if (depsB?.has(fileA)) {
                circularDependencies.push(`${path.basename(fileA)} <-> ${path.basename(fileB)}`);
            }
        }
    }

    return {
        totalFiles: index.fileCount,
        totalTables,
        totalViews,
        totalReferences,
        orphanedDefinitions,
        missingDefinitions,
        circularDependencies
    };
}

/**
 * Get primary reference type from a set of types
 */
function getPrimaryReferenceType(types: TableReference['referenceType'][]): TableReference['referenceType'] {
    // Priority: write operations > join > select
    if (types.includes('insert')) return 'insert';
    if (types.includes('update')) return 'update';
    if (types.includes('delete')) return 'delete';
    if (types.includes('join')) return 'join';
    return 'select';
}

/**
 * Layout the graph using an improved hierarchical algorithm
 * Features: dynamic spacing, centered rows, better edge flow visualization
 */
function layoutGraph(nodes: WorkspaceNode[], edges: WorkspaceEdge[]): void {
    if (nodes.length === 0) return;

    // Calculate canvas dimensions (assuming standard webview size)
    const canvasWidth = 2800;
    const canvasHeight = 2000;

    // Dynamic spacing based on node count
    const nodeCount = nodes.length;
    const horizontalGap = nodeCount > 20 ? 60 : 80;
    const verticalGap = nodeCount > 20 ? 80 : 100;
    const padding = 80;

    // Calculate max nodes per row based on canvas width and average node width
    const avgNodeWidth = nodes.reduce((sum, n) => sum + n.width, 0) / nodes.length;
    const maxNodesPerRow = Math.max(3, Math.floor((canvasWidth - padding * 2) / (avgNodeWidth + horizontalGap)));

    // Build adjacency list for topological sorting
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
        inDegree.set(node.id, 0);
        adjacency.set(node.id, []);
    }

    for (const edge of edges) {
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        adjacency.get(edge.source)!.push(edge.target);
    }

    // Assign levels using BFS with longest path
    const levels = new Map<string, number>();
    const visited = new Set<string>();

    function assignLevel(nodeId: string, level: number): void {
        if (visited.has(nodeId)) {
            levels.set(nodeId, Math.max(levels.get(nodeId) || 0, level));
            return;
        }
        visited.add(nodeId);
        levels.set(nodeId, level);

        for (const targetId of adjacency.get(nodeId) || []) {
            assignLevel(targetId, level + 1);
        }
    }

    // Start from nodes with in-degree 0
    for (const node of nodes) {
        if ((inDegree.get(node.id) || 0) === 0) {
            assignLevel(node.id, 0);
        }
    }

    // Handle remaining nodes (cycles)
    for (const node of nodes) {
        if (!visited.has(node.id)) {
            assignLevel(node.id, 0);
        }
    }

    // Group nodes by level
    const levelGroups = new Map<number, WorkspaceNode[]>();
    for (const node of nodes) {
        const level = levels.get(node.id) || 0;
        if (!levelGroups.has(level)) {
            levelGroups.set(level, []);
        }
        levelGroups.get(level)!.push(node);
    }

    // Position nodes with row wrapping and centering
    let currentY = padding;
    const sortedLevels = [...levelGroups.keys()].sort((a, b) => a - b);

    for (const level of sortedLevels) {
        const levelNodes = levelGroups.get(level)!;

        // Split level nodes into rows
        const rows: WorkspaceNode[][] = [];
        for (let i = 0; i < levelNodes.length; i += maxNodesPerRow) {
            rows.push(levelNodes.slice(i, i + maxNodesPerRow));
        }

        // Position each row
        for (const rowNodes of rows) {
            // Calculate row width for centering
            const rowWidth = rowNodes.reduce((sum, n) => sum + n.width, 0) + (rowNodes.length - 1) * horizontalGap;

            // Center the row horizontally
            let currentX = Math.max(padding, (canvasWidth - rowWidth) / 2);

            // Find maximum height in this row for vertical alignment
            const rowMaxHeight = Math.max(...rowNodes.map(n => n.height));

            for (const node of rowNodes) {
                // Vertically center nodes of different heights within the row
                const yOffset = (rowMaxHeight - node.height) / 2;
                node.x = currentX;
                node.y = currentY + yOffset;
                currentX += node.width + horizontalGap;
            }

            currentY += rowMaxHeight + verticalGap;
        }
    }
}
