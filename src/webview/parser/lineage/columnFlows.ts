// Column flow generation with full lineage paths

import { FlowNode, FlowEdge, ColumnFlow, ColumnInfo, LineageTransformation } from '../../types';
import { safeString } from '../../../shared';

function normalizeIdentifier(value: string | undefined): string {
    if (!value) {
        return '';
    }
    return value.trim().replace(/^[`"[]|[`"\]]$/g, '').toLowerCase();
}

function getUnqualifiedIdentifier(value: string | undefined): string {
    const normalized = normalizeIdentifier(value);
    if (!normalized) {
        return '';
    }
    const parts = normalized.split('.');
    return parts[parts.length - 1];
}

function getTableAlias(node: FlowNode): string {
    if (typeof node.alias === 'string' && node.alias.trim().length > 0) {
        return normalizeIdentifier(node.alias);
    }
    // Backward-compat fallback for historical nodes that only stored alias in details.
    const aliasDetail = node.details?.find(detail => /^alias:\s*/i.test(detail));
    if (!aliasDetail) {
        return '';
    }
    return normalizeIdentifier(aliasDetail.replace(/^alias:\s*/i, ''));
}

function matchesTableNodeBySource(node: FlowNode, sourceTable: string): boolean {
    const sourceFull = normalizeIdentifier(sourceTable);
    if (!sourceFull) {
        return false;
    }

    const sourceUnqualified = getUnqualifiedIdentifier(sourceTable);
    const labelFull = normalizeIdentifier(node.label);
    const labelUnqualified = getUnqualifiedIdentifier(node.label);
    const alias = getTableAlias(node);
    const aliasUnqualified = getUnqualifiedIdentifier(alias);

    return labelFull === sourceFull
        || (sourceUnqualified !== '' && labelUnqualified === sourceUnqualified)
        || alias === sourceFull
        || (sourceUnqualified !== '' && aliasUnqualified === sourceUnqualified);
}

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
        for (const node of nodeMap.values()) {
            if (node.type === 'table' && matchesTableNodeBySource(node, column.sourceTable)) {
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

    return path;
}

export function findSourceColumn(
    targetColumn: ColumnInfo,
    sourceNode: FlowNode,
    _targetNode: FlowNode
): ColumnInfo | null {
    // If target column has explicit source info, use it
    if (targetColumn.sourceColumn && targetColumn.sourceTable) {
        if (matchesTableNodeBySource(sourceNode, targetColumn.sourceTable)) {
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
            if (safeString(outputName).toLowerCase() === safeString(targetColumn.name).toLowerCase() ||
                safeString(targetColumn.expression).toLowerCase().includes(safeString(outputName).toLowerCase())) {
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
            if (safeString(winFunc.name).toLowerCase() === safeString(targetColumn.name).toLowerCase()) {
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
            if (safeString(sourceCol.name).toLowerCase() === safeString(targetColumn.name).toLowerCase()) {
                return sourceCol;
            }
            if (safeString(sourceCol.name).toLowerCase() === safeString(targetColumn.sourceColumn).toLowerCase()) {
                return sourceCol;
            }
            if (safeString(targetColumn.expression).toLowerCase().includes(safeString(sourceCol.name).toLowerCase())) {
                return sourceCol;
            }
        }
    }

    // For JOIN nodes
    if (sourceNode.type === 'join') {
        if (!targetColumn.sourceColumn && !targetColumn.sourceTable) {
            return null;
        }
        return {
            name: targetColumn.sourceColumn || targetColumn.name,
            expression: targetColumn.sourceColumn || targetColumn.name,
            sourceTable: targetColumn.sourceTable
        };
    }

    // Unresolvable source for this branch.
    return null;
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
        safeString(column.name).toLowerCase() !== safeString(column.sourceColumn).toLowerCase()) {
        return 'renamed';
    }

    if (column.expression &&
        column.expression !== column.name &&
        !column.expression.match(/^[\w.]+$/)) {
        return 'calculated';
    }

    return 'passthrough';
}
