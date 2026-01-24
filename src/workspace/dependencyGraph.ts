// Dependency Graph Builder - Create visualization graph from index

import * as path from 'path';
import {
    WorkspaceIndex,
    WorkspaceDependencyGraph,
    WorkspaceNode,
    WorkspaceEdge,
    WorkspaceStats,
    GraphMode,
    TableReference,
    SchemaDefinition
} from './types';
import { getDisplayName, getQualifiedKey, normalizeIdentifier, parseQualifiedKey } from './identifiers';

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

function findDefinitionsByName(index: WorkspaceIndex, tableName: string): SchemaDefinition[] {
    const normalized = normalizeIdentifier(tableName);
    if (!normalized) {return [];}

    const matches: SchemaDefinition[] = [];
    for (const defs of index.definitionMap.values()) {
        for (const def of defs) {
            if (normalizeIdentifier(def.name) === normalized) {
                matches.push(def);
            }
        }
    }
    return matches;
}

function getDefinitionCandidates(index: WorkspaceIndex, ref: TableReference): SchemaDefinition[] {
    const key = getQualifiedKey(ref.tableName, ref.schema);
    const direct = index.definitionMap.get(key);
    if (direct && direct.length > 0) {
        return direct;
    }

    const byName = findDefinitionsByName(index, ref.tableName);
    if (ref.schema) {
        const unqualified = byName.filter(def => !def.schema);
        return unqualified;
    }

    return byName;
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
        if (!sourceId) {continue;}

        for (const ref of analysis.references) {
            const defs = getDefinitionCandidates(index, ref);
            for (const def of defs) {
                if (def.filePath === filePath) {continue;}
                const targetId = nodeIdMap.get(def.filePath);
                if (!targetId) {continue;}

                const edgeKey = `${sourceId}->${targetId}`;
                if (!edgeMap.has(edgeKey)) {
                    edgeMap.set(edgeKey, { count: 0, types: new Set(), tables: new Set() });
                }
                const edgeData = edgeMap.get(edgeKey)!;
                edgeData.count++;
                edgeData.types.add(ref.referenceType);
                edgeData.tables.add(getDisplayName(ref.tableName, ref.schema));
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
    const definedKeys = new Set(index.definitionMap.keys());
    const definedNames = new Set<string>();
    for (const defs of index.definitionMap.values()) {
        for (const def of defs) {
            const normalized = normalizeIdentifier(def.name);
            if (normalized) {definedNames.add(normalized);}
        }
    }

    for (const [key, defs] of index.definitionMap.entries()) {
        const def = defs[0];
        if (!def) {continue;}
        const nodeId = `table_${nodes.length}`;
        nodeIdMap.set(key, nodeId);

        nodes.push({
            id: nodeId,
            type: def.type,
            label: getDisplayName(def.name, def.schema),
            filePath: def.filePath,
            definitions: defs,
            x: 0,
            y: 0,
            width: 160,
            height: 60
        });
    }

    // Create nodes for external (undefined) tables
    for (const [key, refs] of index.referenceMap.entries()) {
        if (definedKeys.has(key)) {continue;}
        const parsed = parseQualifiedKey(key);
        const normalizedName = normalizeIdentifier(parsed.name);
        if (!parsed.schema && normalizedName && definedNames.has(normalizedName)) {
            continue;
        }

            const nodeId = `external_${nodes.length}`;
            nodeIdMap.set(key, nodeId);
            const displayName = refs[0]
                ? getDisplayName(refs[0].tableName, refs[0].schema)
                : getDisplayName(parsed.name, parsed.schema);

            nodes.push({
                id: nodeId,
                type: 'external',
                label: displayName,
                references: refs,
                referenceCount: refs.length,
                x: 0,
                y: 0,
                width: 160,
                height: 60
            });
    }

    // Create edges based on view/query dependencies
    // Views reference tables, so create edges from views to their source tables
    for (const [filePath, analysis] of index.files.entries()) {
        // Get tables defined in this file
        const definedHere = new Set(
            analysis.definitions.map(d => getQualifiedKey(d.name, d.schema))
        );

        for (const def of analysis.definitions) {
            if (def.type === 'view') {
                // Views reference other tables - find what this view references
                for (const ref of analysis.references) {
                    const refKey = getQualifiedKey(ref.tableName, ref.schema);
                    if (definedHere.has(refKey)) {
                        continue;
                    }

                    const sourceId = nodeIdMap.get(getQualifiedKey(def.name, def.schema));
                    if (!sourceId) {continue;}

                    const targets = getDefinitionCandidates(index, ref);
                    if (targets.length > 0) {
                        for (const targetDef of targets) {
                            const targetId = nodeIdMap.get(getQualifiedKey(targetDef.name, targetDef.schema));
                            if (sourceId && targetId && sourceId !== targetId) {
                                edges.push({
                                    id: `edge_${edges.length}`,
                                    source: sourceId,
                                    target: targetId,
                                    referenceType: ref.referenceType,
                                    count: 1,
                                    tables: [getDisplayName(ref.tableName, ref.schema)]
                                });
                            }
                        }
                    } else {
                        const externalId = nodeIdMap.get(refKey);
                        if (sourceId && externalId && sourceId !== externalId) {
                            edges.push({
                                id: `edge_${edges.length}`,
                                source: sourceId,
                                target: externalId,
                                referenceType: ref.referenceType,
                                count: 1,
                                tables: [getDisplayName(ref.tableName, ref.schema)]
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
            const key = getQualifiedKey(ref.tableName, ref.schema);
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
    for (const [key, count] of referenceCount.entries()) {
        if (count >= 3) {
            const def = index.definitionMap.get(key)?.[0];
            if (def) {
                prominentTables.add(key);
                const nodeId = `table_${nodes.length}`;
                nodeIdMap.set(`prominent:${key}`, nodeId);

                nodes.push({
                    id: nodeId,
                    type: def.type,
                    label: getDisplayName(def.name, def.schema),
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
        if (!sourceId) {continue;}

        for (const ref of analysis.references) {
            const defs = getDefinitionCandidates(index, ref);
            for (const def of defs) {
                if (def.filePath === filePath) {continue;}
                const targetId = nodeIdMap.get(def.filePath);
                if (targetId) {
                    const edgeKey = `${sourceId}->${targetId}`;
                    if (!edgeMap.has(edgeKey)) {
                        edgeMap.set(edgeKey, { count: 0, type: ref.referenceType, tables: new Set() });
                    }
                    edgeMap.get(edgeKey)!.count++;
                    edgeMap.get(edgeKey)!.tables.add(getDisplayName(ref.tableName, ref.schema));
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

    const definitionsByName = new Map<string, SchemaDefinition[]>();
    for (const defs of index.definitionMap.values()) {
        for (const def of defs) {
            const name = normalizeIdentifier(def.name);
            if (!name) {continue;}
            if (!definitionsByName.has(name)) {
                definitionsByName.set(name, []);
            }
            definitionsByName.get(name)!.push(def);
        }
    }

    const referencesByName = new Map<string, TableReference[]>();
    for (const refs of index.referenceMap.values()) {
        for (const ref of refs) {
            const name = normalizeIdentifier(ref.tableName);
            if (!name) {continue;}
            if (!referencesByName.has(name)) {
                referencesByName.set(name, []);
            }
            referencesByName.get(name)!.push(ref);
        }
    }

    // Count tables and views
    for (const [key, defs] of index.definitionMap.entries()) {
        for (const def of defs) {
            if (def.type === 'table') {totalTables++;}
            else if (def.type === 'view') {totalViews++;}
        }

        const refs = index.referenceMap.get(key);
        if (refs && refs.length > 0) {
            continue;
        }

        const nameKey = normalizeIdentifier(defs[0]?.name);
        const nameRefs = nameKey ? referencesByName.get(nameKey) : undefined;
        if (!nameRefs || nameRefs.length === 0) {
            orphanedDefinitions.push(key);
        }
    }

    // Count references and find missing definitions
    for (const [key, refs] of index.referenceMap.entries()) {
        totalReferences += refs.length;

        const hasSchema = refs.some(ref => !!ref.schema);
        if (hasSchema) {
            if (!index.definitionMap.has(key)) {
                const refName = normalizeIdentifier(refs[0]?.tableName);
                const defs = refName ? (definitionsByName.get(refName) || []) : [];
                const hasUnqualified = defs.some(def => !def.schema);
                if (!hasUnqualified) {
                    missingDefinitions.push(key);
                }
            }
            continue;
        }

        const refName = normalizeIdentifier(refs[0]?.tableName);
        if (refName && !definitionsByName.has(refName)) {
            missingDefinitions.push(key);
        }
    }

    // Detect circular dependencies (simplified: check for bidirectional file dependencies)
    const circularDependencies: string[] = [];
    const fileDeps = new Map<string, Set<string>>();

    for (const [filePath, analysis] of index.files.entries()) {
        const deps = new Set<string>();
        for (const ref of analysis.references) {
            const defs = getDefinitionCandidates(index, ref);
            for (const def of defs) {
                if (def.filePath !== filePath) {
                    deps.add(def.filePath);
                }
            }
        }
        fileDeps.set(filePath, deps);
    }

    // Check for bidirectional dependencies (A depends on B and B depends on A)
    const checkedPairs = new Set<string>();
    for (const [fileA, depsA] of fileDeps.entries()) {
        for (const fileB of depsA) {
            const pairKey = [fileA, fileB].sort().join('|');
            if (checkedPairs.has(pairKey)) {continue;}
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
    if (types.includes('insert')) {return 'insert';}
    if (types.includes('update')) {return 'update';}
    if (types.includes('delete')) {return 'delete';}
    if (types.includes('join')) {return 'join';}
    return 'select';
}

/**
 * Layout the graph using an improved hierarchical algorithm
 * Features:
 * - Longest path level assignment
 * - Barycenter heuristic for edge crossing minimization
 * - Better spacing for large graphs
 */
function layoutGraph(nodes: WorkspaceNode[], edges: WorkspaceEdge[]): void {
    if (nodes.length === 0) {return;}

    // Calculate canvas dimensions
    const canvasWidth = 3200;

    /**
     * Dynamic spacing based on node count to better utilize available screen space.
     * Increased vertical spacing (150-220px) helps spread out the graph vertically,
     * making better use of the viewport and reducing wasted empty space.
     */
    const nodeCount = nodes.length;
    const horizontalGap = nodeCount > 25 ? 40 : nodeCount > 15 ? 60 : 80;
    const verticalGap = nodeCount > 25 ? 150 : nodeCount > 15 ? 180 : 220;
    const padding = 60;

    // Build adjacency lists (both directions)
    const outEdges = new Map<string, string[]>();
    const inEdges = new Map<string, string[]>();
    const nodeMap = new Map<string, WorkspaceNode>();

    for (const node of nodes) {
        outEdges.set(node.id, []);
        inEdges.set(node.id, []);
        nodeMap.set(node.id, node);
    }

    for (const edge of edges) {
        outEdges.get(edge.source)?.push(edge.target);
        inEdges.get(edge.target)?.push(edge.source);
    }

    // ========== Level Assignment (Longest Path) ==========
    const levels = new Map<string, number>();

    // Find roots (nodes with no incoming edges)
    const roots: string[] = [];
    for (const node of nodes) {
        if ((inEdges.get(node.id)?.length || 0) === 0) {
            roots.push(node.id);
        }
    }

    // If no roots found (cyclic graph), use all nodes as potential starts
    if (roots.length === 0) {
        nodes.forEach(n => roots.push(n.id));
    }

    // Assign levels using longest path from roots
    function longestPathFrom(nodeId: string, currentLevel: number, visited: Set<string>): void {
        if (visited.has(nodeId)) {return;}

        const existingLevel = levels.get(nodeId) ?? -1;
        if (currentLevel <= existingLevel) {return;}

        levels.set(nodeId, currentLevel);
        visited.add(nodeId);

        for (const targetId of outEdges.get(nodeId) || []) {
            longestPathFrom(targetId, currentLevel + 1, new Set(visited));
        }
    }

    for (const rootId of roots) {
        longestPathFrom(rootId, 0, new Set());
    }

    // Handle any unassigned nodes
    for (const node of nodes) {
        if (!levels.has(node.id)) {
            levels.set(node.id, 0);
        }
    }

    // ========== Group Nodes by Level ==========
    const levelGroups = new Map<number, WorkspaceNode[]>();
    for (const node of nodes) {
        const level = levels.get(node.id) || 0;
        if (!levelGroups.has(level)) {
            levelGroups.set(level, []);
        }
        levelGroups.get(level)!.push(node);
    }

    const sortedLevels = [...levelGroups.keys()].sort((a, b) => a - b);

    // ========== Edge Crossing Minimization (Barycenter) ==========
    // Run multiple iterations to reduce edge crossings
    for (let iteration = 0; iteration < 4; iteration++) {
        // Sweep down (using positions of previous level)
        for (let i = 1; i < sortedLevels.length; i++) {
            const level = sortedLevels[i];
            const levelNodes = levelGroups.get(level)!;

            // Calculate barycenter for each node based on connected nodes in previous level
            const barycenters: { node: WorkspaceNode; value: number }[] = [];

            for (const node of levelNodes) {
                const prevLevelConnections = (inEdges.get(node.id) || [])
                    .map(id => nodeMap.get(id))
                    .filter(n => n && levels.get(n.id) === sortedLevels[i - 1]);

                if (prevLevelConnections.length > 0) {
                    const prevLevel = levelGroups.get(sortedLevels[i - 1])!;
                    const positions = prevLevelConnections.map(n => prevLevel.indexOf(n!));
                    const avgPos = positions.reduce((a, b) => a + b, 0) / positions.length;
                    barycenters.push({ node, value: avgPos });
                } else {
                    barycenters.push({ node, value: levelNodes.indexOf(node) });
                }
            }

            // Sort by barycenter
            barycenters.sort((a, b) => a.value - b.value);
            levelGroups.set(level, barycenters.map(b => b.node));
        }

        // Sweep up (using positions of next level)
        for (let i = sortedLevels.length - 2; i >= 0; i--) {
            const level = sortedLevels[i];
            const levelNodes = levelGroups.get(level)!;

            const barycenters: { node: WorkspaceNode; value: number }[] = [];

            for (const node of levelNodes) {
                const nextLevelConnections = (outEdges.get(node.id) || [])
                    .map(id => nodeMap.get(id))
                    .filter(n => n && levels.get(n.id) === sortedLevels[i + 1]);

                if (nextLevelConnections.length > 0) {
                    const nextLevel = levelGroups.get(sortedLevels[i + 1])!;
                    const positions = nextLevelConnections.map(n => nextLevel.indexOf(n!));
                    const avgPos = positions.reduce((a, b) => a + b, 0) / positions.length;
                    barycenters.push({ node, value: avgPos });
                } else {
                    barycenters.push({ node, value: levelNodes.indexOf(node) });
                }
            }

            barycenters.sort((a, b) => a.value - b.value);
            levelGroups.set(level, barycenters.map(b => b.node));
        }
    }

    // ========== Position Nodes ==========
    // Calculate max nodes per row
    const avgNodeWidth = nodes.reduce((sum, n) => sum + n.width, 0) / nodes.length;
    const maxNodesPerRow = Math.max(4, Math.floor((canvasWidth - padding * 2) / (avgNodeWidth + horizontalGap)));

    let currentY = padding;

    for (const level of sortedLevels) {
        const levelNodes = levelGroups.get(level)!;

        // Split level nodes into rows if too many
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

            // Find maximum height in this row
            const rowMaxHeight = Math.max(...rowNodes.map(n => n.height));

            for (const node of rowNodes) {
                // Vertically center nodes
                const yOffset = (rowMaxHeight - node.height) / 2;
                node.x = currentX;
                node.y = currentY + yOffset;
                currentX += node.width + horizontalGap;
            }

            currentY += rowMaxHeight + verticalGap;
        }
    }
}
