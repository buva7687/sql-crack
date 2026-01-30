// Column flow generation with full lineage paths

import { FlowNode, FlowEdge, ColumnFlow, ColumnInfo, LineageTransformation } from '../../types';

export function generateColumnFlows(
    stmt: any,
    nodes: FlowNode[],
    edges: FlowEdge[]
): ColumnFlow[] {
    const columnFlows: ColumnFlow[] = [];
    if (!stmt || stmt.type?.toLowerCase() !== 'select') {
        return columnFlows;
    }

    // Build node map for quick lookup
    const nodeMap = new Map<string, FlowNode>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    // Build edge map: target -> sources (for tracing backwards)
    const incomingEdges = new Map<string, string[]>();
    edges.forEach(edge => {
        if (!incomingEdges.has(edge.target)) {
            incomingEdges.set(edge.target, []);
        }
        incomingEdges.get(edge.target)!.push(edge.source);
    });

    // Find SELECT nodes (output nodes)
    const selectNodes = nodes.filter(n => n.type === 'select');
    if (selectNodes.length === 0) {return columnFlows;}

    // Process each SELECT node's output columns
    for (const selectNode of selectNodes) {
        if (!selectNode.columns || selectNode.columns.length === 0) {continue;}

        for (const outputCol of selectNode.columns) {
            // Build full lineage path for this output column
            const lineagePath = buildColumnLineagePath(
                outputCol,
                selectNode,
                nodeMap,
                incomingEdges
            );

            if (lineagePath.length > 0) {
                const flowId = `lineage_${selectNode.id}_${outputCol.name}`;
                columnFlows.push({
                    id: flowId,
                    outputColumn: outputCol.name,
                    outputNodeId: selectNode.id,
                    lineagePath
                });
            }
        }
    }

    return columnFlows;
}

export function buildColumnLineagePath(
    column: ColumnInfo,
    currentNode: FlowNode,
    nodeMap: Map<string, FlowNode>,
    incomingEdges: Map<string, string[]>,
    visited: Set<string> = new Set()
): ColumnFlow['lineagePath'] {
    const path: ColumnFlow['lineagePath'] = [];

    // Prevent infinite loops
    if (visited.has(currentNode.id)) {return path;}
    visited.add(currentNode.id);

    // Determine transformation at current node
    const transformation = getTransformationType(column, currentNode);

    // Add current node to path
    path.push({
        nodeId: currentNode.id,
        nodeName: currentNode.label,
        nodeType: currentNode.type,
        columnName: column.name,
        transformation,
        expression: column.expression !== column.name ? column.expression : undefined
    });

    // If this is a table node, we've reached the source
    if (currentNode.type === 'table') {
        path[path.length - 1].transformation = 'source';
        return path;
    }

    // Trace back through incoming edges
    const incoming = incomingEdges.get(currentNode.id) || [];

    for (const sourceNodeId of incoming) {
        const sourceNode = nodeMap.get(sourceNodeId);
        if (!sourceNode) {continue;}

        // Find matching source column
        const sourceColumn = findSourceColumn(column, sourceNode, currentNode);

        if (sourceColumn) {
            // For aggregate columns, we need to trace the inner column (e.g., order_id from COUNT(order_id))
            // not the output alias (e.g., order_count)
            let columnToTrace = sourceColumn;
            if (sourceColumn.isAggregate && sourceColumn.sourceColumn && sourceColumn.sourceColumn !== sourceColumn.name) {
                // Create a new column info to trace the actual source column
                columnToTrace = {
                    name: sourceColumn.sourceColumn,
                    expression: sourceColumn.sourceColumn,
                    sourceColumn: sourceColumn.sourceColumn,
                    sourceTable: sourceColumn.sourceTable
                };
            }

            // Recursively trace this source
            const sourcePath = buildColumnLineagePath(
                columnToTrace,
                sourceNode,
                nodeMap,
                incomingEdges,
                new Set(visited)
            );

            if (sourcePath.length > 0) {
                // Prepend source path
                return [...sourcePath, ...path];
            }
        }
    }

    // If we couldn't trace further and column has explicit source info
    if (column.sourceTable && column.sourceColumn) {
        const sourceTableLower = column.sourceTable.toLowerCase();
        for (const node of nodeMap.values()) {
            if (node.type === 'table') {
                const nodeLabelLower = node.label.toLowerCase();
                // Check for exact match first
                if (nodeLabelLower === sourceTableLower) {
                    path.unshift({
                        nodeId: node.id,
                        nodeName: node.label,
                        nodeType: 'table',
                        columnName: column.sourceColumn,
                        transformation: 'source'
                    });
                    break;
                }
                // For aliases (short names), check if table name starts with alias
                if (sourceTableLower.length <= 2 && nodeLabelLower.startsWith(sourceTableLower)) {
                    path.unshift({
                        nodeId: node.id,
                        nodeName: node.label,
                        nodeType: 'table',
                        columnName: column.sourceColumn,
                        transformation: 'source'
                    });
                    break;
                }
                // For longer names, check if either contains the other
                if (sourceTableLower.length > 2 &&
                    (nodeLabelLower.includes(sourceTableLower) || sourceTableLower.includes(nodeLabelLower))) {
                    path.unshift({
                        nodeId: node.id,
                        nodeName: node.label,
                        nodeType: 'table',
                        columnName: column.sourceColumn,
                        transformation: 'source'
                    });
                    break;
                }
            }
        }
    }

    return path;
}

export function findSourceColumn(
    targetColumn: ColumnInfo,
    sourceNode: FlowNode,
    targetNode: FlowNode
): ColumnInfo | null {
    // If target column has explicit source info, use it
    if (targetColumn.sourceColumn && targetColumn.sourceTable) {
        if (sourceNode.label.toLowerCase().includes(targetColumn.sourceTable.toLowerCase())) {
            return {
                name: targetColumn.sourceColumn,
                expression: targetColumn.sourceColumn,
                sourceTable: targetColumn.sourceTable
            };
        }
    }

    // For aggregate nodes
    if (sourceNode.type === 'aggregate' && sourceNode.aggregateDetails) {
        for (const aggFunc of sourceNode.aggregateDetails.functions) {
            const outputName = aggFunc.alias || aggFunc.name;
            if (outputName.toLowerCase() === targetColumn.name.toLowerCase() ||
                targetColumn.expression?.toLowerCase().includes(outputName.toLowerCase())) {
                // Return the source column used in the aggregate function for proper lineage tracing
                // e.g., COUNT(order_id) -> we should trace order_id, not the output alias
                return {
                    name: outputName,
                    expression: aggFunc.expression,
                    isAggregate: true,
                    // Pass through source column info so lineage can continue tracing
                    sourceColumn: (aggFunc as any).sourceColumn || outputName,
                    sourceTable: (aggFunc as any).sourceTable
                };
            }
        }
    }

    // For window nodes
    if (sourceNode.type === 'window' && sourceNode.windowDetails) {
        for (const winFunc of sourceNode.windowDetails.functions) {
            if (winFunc.name.toLowerCase() === targetColumn.name.toLowerCase()) {
                return {
                    name: winFunc.name,
                    expression: `${winFunc.name}() OVER (...)`,
                    isWindowFunc: true
                };
            }
        }
    }

    // Check source node columns
    if (sourceNode.columns) {
        for (const sourceCol of sourceNode.columns) {
            if (sourceCol.name.toLowerCase() === targetColumn.name.toLowerCase()) {
                return sourceCol;
            }
            if (sourceCol.name.toLowerCase() === targetColumn.sourceColumn?.toLowerCase()) {
                return sourceCol;
            }
            if (targetColumn.expression?.toLowerCase().includes(sourceCol.name.toLowerCase())) {
                return sourceCol;
            }
        }
    }

    // For JOIN nodes
    if (sourceNode.type === 'join') {
        return {
            name: targetColumn.sourceColumn || targetColumn.name,
            expression: targetColumn.sourceColumn || targetColumn.name,
            sourceTable: targetColumn.sourceTable
        };
    }

    // Default: assume passthrough
    return {
        name: targetColumn.sourceColumn || targetColumn.name,
        expression: targetColumn.sourceColumn || targetColumn.name
    };
}

export function getTransformationType(
    column: ColumnInfo,
    node: FlowNode
): LineageTransformation {
    if (node.type === 'table') {
        return 'source';
    }

    // Only mark as aggregated if the column itself uses an aggregate function
    // GROUP BY columns that pass through an aggregate node should remain passthrough
    if (column.isAggregate) {
        return 'aggregated';
    }

    if (column.isWindowFunc || node.type === 'window') {
        return 'calculated';
    }

    if (node.type === 'join') {
        return 'joined';
    }

    if (column.sourceColumn &&
        column.name.toLowerCase() !== column.sourceColumn.toLowerCase()) {
        return 'renamed';
    }

    if (column.expression &&
        column.expression !== column.name &&
        !column.expression.match(/^[\w.]+$/)) {
        return 'calculated';
    }

    return 'passthrough';
}
