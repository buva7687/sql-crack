// Impact Analyzer - Analyze impact of changes

import { LineageGraph, LineageNode } from './types';
import { FlowAnalyzer } from './flowAnalyzer';
import { normalizeIdentifier, parseQualifiedKey } from '../identifiers';

/**
 * Type of change being analyzed
 */
export type ChangeType = 'modify' | 'rename' | 'drop' | 'addColumn';

/**
 * Impact analysis report
 */
export interface ImpactReport {
    changeType: ChangeType;
    target: {
        type: 'table' | 'view' | 'column';
        name: string;
        tableName?: string;
    };

    // Direct impacts (immediate dependents)
    directImpacts: ImpactItem[];

    // Transitive impacts (dependents of dependents)
    transitiveImpacts: ImpactItem[];

    // Summary
    summary: {
        totalAffected: number;
        tablesAffected: number;
        viewsAffected: number;
        queriesAffected: number;
        filesAffected: number;
    };

    severity: 'low' | 'medium' | 'high' | 'critical';

    // Suggestions
    suggestions: string[];
}

/**
 * Individual impact item
 */
export interface ImpactItem {
    node: LineageNode;
    impactType: 'direct' | 'transitive';
    reason: string;            // Why this is affected
    filePath: string;
    lineNumber: number;
    severity: 'low' | 'medium' | 'high';
}

/**
 * Analyzes impact of changes to tables and columns
 */
export class ImpactAnalyzer {
    constructor(
        private graph: LineageGraph,
        private flowAnalyzer: FlowAnalyzer
    ) {}

    /**
     * Analyze impact of changing a table
     */
    analyzeTableChange(tableName: string, changeType: ChangeType = 'modify'): ImpactReport {
        const nodeId = this.getTableNodeId(tableName);
        const node = this.graph.nodes.get(nodeId);

        if (!node) {
            return this.createNotFoundReport('table', tableName, changeType);
        }

        // Get all downstream nodes (dependents)
        const downstream = this.flowAnalyzer.getDownstream(nodeId, {
            excludeExternal: true
        });

        // Separate direct and transitive impacts
        // Filter out the table's own columns - they're structural, not downstream dependencies
        const ownColumnPrefix = `column:${tableName.toLowerCase()}.`;
        const directEdges = this.graph.edges.filter(e =>
            e.sourceId === nodeId && !e.targetId.startsWith(ownColumnPrefix)
        );
        const directImpacts: ImpactItem[] = [];
        const transitiveImpacts: ImpactItem[] = [];

        // Build set of columns that have actual data flow edges (not just structural "contains")
        // Check both regular edges and column-level lineage edges
        const columnsWithDataFlow = new Set<string>();
        const foreignKeyReasons = new Map<string, string>();
        const foreignKeyColumnsByTableId = new Map<string, Set<string>>();
        const normalizedTarget = normalizeIdentifier(tableName) || tableName.toLowerCase();

        // Check regular edges for non-structural relationships
        for (const edge of this.graph.edges) {
            if (edge.metadata?.relationship !== 'contains' && edge.targetId.startsWith('column:')) {
                columnsWithDataFlow.add(edge.targetId);
            }
        }

        // Check column lineage edges (column-to-column data flow)
        if (this.graph.columnEdges) {
            for (const colEdge of this.graph.columnEdges) {
                // Add both source and target columns as having data flow
                const sourceColId = `column:${colEdge.sourceTableId.replace(/^(table|view):/, '')}.${colEdge.sourceColumnName.toLowerCase()}`;
                const targetColId = `column:${colEdge.targetTableId.replace(/^(table|view):/, '')}.${colEdge.targetColumnName.toLowerCase()}`;
                columnsWithDataFlow.add(sourceColId);
                columnsWithDataFlow.add(targetColId);
            }
        }

        // Treat foreign key columns pointing to the target table as data flow impacts
        for (const node of this.graph.nodes.values()) {
            if (node.type !== 'column' || !node.columnInfo?.foreignKey) {continue;}
            const fk = node.columnInfo.foreignKey;
            if (!fk?.referencedTable) {continue;}
            if (!this.matchesForeignKeyTarget(fk.referencedTable, tableName, normalizedTarget)) {continue;}

            const sourceTableId = this.getTableNodeId(fk.referencedTable);
            const sourceTable = this.getTableDisplayName(sourceTableId);
            const targetTable = node.parentId ? this.getTableDisplayName(node.parentId) : this.getTableDisplayNameFromColumnId(node.id);
            const referencedColumn = fk.referencedColumn || 'unknown_column';
            const targetColumn = node.name || 'unknown_column';
            const reason = `${sourceTable}.${referencedColumn} → ${targetTable}.${targetColumn}`;

            columnsWithDataFlow.add(node.id);
            foreignKeyReasons.set(node.id, reason);
            if (node.parentId) {
                if (!foreignKeyColumnsByTableId.has(node.parentId)) {
                    foreignKeyColumnsByTableId.set(node.parentId, new Set());
                }
                foreignKeyColumnsByTableId.get(node.parentId)!.add(node.id);
            }
        }

        // Defense-in-depth: collect target's definition files and files with direct edges
        // to filter out cross-file false positives from shared node IDs
        const targetDefFiles = new Set<string>(node.metadata?.definitionFiles || []);
        if (node.filePath) {targetDefFiles.add(node.filePath);}

        // Collect files that have edges originating from the target node
        const targetEdgeFiles = new Set<string>();
        for (const edge of this.graph.edges) {
            if (edge.sourceId === nodeId && edge.metadata?.filePath) {
                targetEdgeFiles.add(edge.metadata.filePath);
            }
        }

        // Collect table/view node IDs that have a foreign key relationship with the target
        const fkRelatedNodeIds = new Set<string>();
        for (const [colId, reason] of foreignKeyReasons) {
            const colNode = this.graph.nodes.get(colId);
            if (colNode?.parentId) {
                fkRelatedNodeIds.add(colNode.parentId);
            }
        }

        const addedImpactNodes = new Set<string>();

        for (const depNode of downstream.nodes) {
            // Skip the table's own columns - they're part of the target, not impacts
            if (depNode.type === 'column' && depNode.id.startsWith(ownColumnPrefix)) {
                continue;
            }

            if ((depNode.type === 'table' || depNode.type === 'view') && foreignKeyColumnsByTableId.has(depNode.id)) {
                // Prefer column-level impact items when foreign keys are available
                continue;
            }

            const isDirect = directEdges.some(e => e.targetId === depNode.id);

            // For transitive column impacts, only include if there's actual data flow
            // (not just structural "contains" relationship from parent table)
            if (!isDirect && depNode.type === 'column' && !columnsWithDataFlow.has(depNode.id)) {
                continue;
            }

            // Cross-file false positive filter for transitive table/view impacts:
            // Skip if the impacted node's definition files have no overlap with
            // the target's files/edge files AND there's no FK relationship
            if (!isDirect && (depNode.type === 'table' || depNode.type === 'view')) {
                const depDefFiles = depNode.metadata?.definitionFiles as string[] | undefined;
                if (depDefFiles && depDefFiles.length > 0) {
                    const hasFileOverlap = depDefFiles.some(
                        f => targetDefFiles.has(f) || targetEdgeFiles.has(f)
                    );
                    // Also check if any edge connecting to this dep originated from a target-related file
                    const hasSharedFileEdge = this.graph.edges.some(e => {
                        if (e.targetId !== depNode.id) {return false;}
                        const edgeFile = e.metadata?.filePath as string | undefined;
                        return edgeFile ? (targetDefFiles.has(edgeFile) || targetEdgeFiles.has(edgeFile)) : false;
                    });
                    const hasFkRelation = fkRelatedNodeIds.has(depNode.id);

                    if (!hasFileOverlap && !hasSharedFileEdge && !hasFkRelation) {
                        continue;
                    }
                }
            }

            const resolved = this.resolveImpactLocation(depNode);

            // For column nodes, try to find source column info from column lineage
            let reason = this.generateImpactReason(depNode, tableName, 'table');
            if (depNode.type === 'column' && this.graph.columnEdges) {
                const colEdge = this.graph.columnEdges.find(e => {
                    const targetColId = `column:${e.targetTableId.replace(/^(table|view):/, '')}.${e.targetColumnName.toLowerCase()}`;
                    return targetColId === depNode.id;
                });
                if (colEdge) {
                    const sourceTable = this.getTableDisplayName(colEdge.sourceTableId);
                    const targetTable = this.getTableDisplayName(colEdge.targetTableId);
                    reason = `${sourceTable}.${colEdge.sourceColumnName} → ${targetTable}.${depNode.name}`;
                }
            }
            if (depNode.type === 'column' && foreignKeyReasons.has(depNode.id)) {
                reason = foreignKeyReasons.get(depNode.id) || reason;
            }

            const impactItem: ImpactItem = {
                node: depNode,
                impactType: isDirect ? 'direct' : 'transitive',
                reason,
                filePath: resolved.filePath || 'Unknown',
                lineNumber: resolved.lineNumber || 0,
                severity: this.calculateNodeSeverity(depNode, downstream.nodes.length)
            };

            if (isDirect) {
                directImpacts.push(impactItem);
            } else {
                transitiveImpacts.push(impactItem);
            }
            addedImpactNodes.add(depNode.id);
        }

        // Ensure foreign key columns are captured even if they weren't in downstream traversal
        for (const [columnId, reason] of foreignKeyReasons) {
            if (addedImpactNodes.has(columnId)) {continue;}
            const node = this.graph.nodes.get(columnId);
            if (!node) {continue;}
            const resolved = this.resolveImpactLocation(node);
            const impactItem: ImpactItem = {
                node,
                impactType: 'transitive',
                reason,
                filePath: resolved.filePath || 'Unknown',
                lineNumber: resolved.lineNumber || 0,
                severity: this.calculateNodeSeverity(node, downstream.nodes.length)
            };
            transitiveImpacts.push(impactItem);
            addedImpactNodes.add(columnId);
        }

        // Calculate summary
        const summary = this.calculateSummary(directImpacts, transitiveImpacts);

        // Calculate overall severity
        const severity = this.calculateSeverity({
            directImpacts,
            transitiveImpacts,
            summary
        });

        // Generate suggestions
        const actualType = node.type === 'view' ? 'view' : 'table';
        const suggestions = this.generateSuggestions(tableName, actualType, changeType, severity);

        return {
            changeType,
            target: {
                type: actualType,
                name: tableName
            },
            directImpacts,
            transitiveImpacts,
            summary,
            severity,
            suggestions
        };
    }

    /**
     * Analyze impact of changing a column
     */
    analyzeColumnChange(tableName: string, columnName: string, changeType: ChangeType = 'modify'): ImpactReport {
        const columnId = this.getColumnNodeId(tableName, columnName);
        const columnNode = this.graph.nodes.get(columnId);

        if (!columnNode) {
            // Fall back to table-level impact
            return this.analyzeTableChange(tableName, changeType);
        }

        // Get all downstream nodes
        const downstream = this.flowAnalyzer.getDownstream(columnId, {
            excludeExternal: true
        });

        const directImpacts: ImpactItem[] = [];
        const transitiveImpacts: ImpactItem[] = [];

        for (const depNode of downstream.nodes) {
            const isDirect = this.graph.edges.some(e =>
                e.sourceId === columnId && e.targetId === depNode.id
            );

            const resolved = this.resolveImpactLocation(depNode);
            const impactItem: ImpactItem = {
                node: depNode,
                impactType: isDirect ? 'direct' : 'transitive',
                reason: this.generateImpactReason(depNode, columnName, 'column'),
                filePath: resolved.filePath || 'Unknown',
                lineNumber: resolved.lineNumber || 0,
                severity: this.calculateNodeSeverity(depNode, downstream.nodes.length)
            };

            if (isDirect) {
                directImpacts.push(impactItem);
            } else {
                transitiveImpacts.push(impactItem);
            }
        }

        const summary = this.calculateSummary(directImpacts, transitiveImpacts);
        const severity = this.calculateSeverity({
            directImpacts,
            transitiveImpacts,
            summary
        });
        const suggestions = this.generateSuggestions(columnName, 'column', changeType, severity);

        return {
            changeType,
            target: {
                type: 'column',
                name: columnName,
                tableName
            },
            directImpacts,
            transitiveImpacts,
            summary,
            severity,
            suggestions
        };
    }

    /**
     * Analyze impact of renaming
     */
    analyzeRename(
        type: 'table' | 'column',
        oldName: string,
        newName: string,
        tableName?: string
    ): ImpactReport {
        if (type === 'table') {
            return this.analyzeTableChange(oldName, 'rename');
        } else {
            return this.analyzeColumnChange(tableName!, oldName, 'rename');
        }
    }

    /**
     * Analyze impact of dropping a table/column
     */
    analyzeDrop(
        type: 'table' | 'column',
        name: string,
        tableName?: string
    ): ImpactReport {
        if (type === 'table') {
            return this.analyzeTableChange(name, 'drop');
        } else {
            return this.analyzeColumnChange(tableName!, name, 'drop');
        }
    }

    /**
     * Get severity of impact
     */
    calculateSeverity(impact: ImpactReport | { summary: ImpactReport['summary'] }): 'low' | 'medium' | 'high' | 'critical' {
        const total = impact.summary.totalAffected;

        if (total >= 20) {return 'critical';}
        if (total >= 10) {return 'high';}
        if (total >= 3) {return 'medium';}
        return 'low';
    }

    /**
     * Calculate node-level severity
     */
    private calculateNodeSeverity(node: LineageNode, totalAffected: number): 'low' | 'medium' | 'high' {
        const ratio = totalAffected / 10; // Normalize against threshold

        if (node.type === 'view' || node.type === 'cte') {
            return ratio > 0.5 ? 'high' : 'medium';
        }

        if (ratio > 1) {return 'high';}
        if (ratio > 0.3) {return 'medium';}
        return 'low';
    }

    /**
     * Calculate summary statistics
     */
    private calculateSummary(
        directImpacts: ImpactItem[],
        transitiveImpacts: ImpactItem[]
    ): ImpactReport['summary'] {
        const allImpacts = [...directImpacts, ...transitiveImpacts];

        const tables = new Set<string>();
        const views = new Set<string>();
        const files = new Set<string>();

        for (const impact of allImpacts) {
            if (impact.node.type === 'table') {tables.add(impact.node.name);}
            if (impact.node.type === 'view') {views.add(impact.node.name);}
            if (impact.filePath) {files.add(impact.filePath);}
        }

        return {
            totalAffected: allImpacts.length,
            tablesAffected: tables.size,
            viewsAffected: views.size,
            queriesAffected: allImpacts.length,
            filesAffected: files.size
        };
    }

    /**
     * Generate impact reason
     */
    private generateImpactReason(
        node: LineageNode,
        name: string,
        type: 'table' | 'column'
    ): string {
        if (type === 'table') {
            return `Depends on table '${name}'`;
        } else {
            return `Uses column '${name}'`;
        }
    }

    /**
     * Generate suggestions based on impact
     */
    private generateSuggestions(
        name: string,
        type: 'table' | 'view' | 'column',
        changeType: ChangeType,
        severity: string
    ): string[] {
        const suggestions: string[] = [];

        if (changeType === 'drop') {
            suggestions.push(`Consider marking ${type} '${name}' as deprecated instead of dropping immediately`);
            suggestions.push(`Notify all ${severity === 'critical' ? 'users' : 'affected teams'} about this change`);
        }

        if (changeType === 'rename') {
            suggestions.push(`Update all references to ${type} '${name}' before renaming`);
            suggestions.push(`Consider creating a synonym or alias for backward compatibility`);
        }

        if (changeType === 'addColumn') {
            suggestions.push(`Consumers using SELECT * may break if they feed into fixed-schema targets (e.g., INSERT INTO)`);
            suggestions.push(`Replace SELECT * with explicit column lists in downstream queries to avoid schema drift`);
        }

        if (severity === 'critical' || severity === 'high') {
            suggestions.push(`High impact: Schedule this change during a maintenance window`);
            suggestions.push(`Create a rollback plan in case of issues`);
        }

        if (type === 'column') {
            suggestions.push(`Verify all queries using this column handle the change correctly`);
        }

        return suggestions;
    }

    private resolveImpactLocation(node: LineageNode): { filePath?: string; lineNumber?: number } {
        if (node.filePath || node.lineNumber) {
            return { filePath: node.filePath, lineNumber: node.lineNumber };
        }

        const metadataPath = node.metadata?.filePath;
        const metadataLine = node.metadata?.lineNumber;
        if (metadataPath || metadataLine) {
            return { filePath: metadataPath, lineNumber: metadataLine };
        }

        const definitionFiles = node.metadata?.definitionFiles;
        if (Array.isArray(definitionFiles) && definitionFiles.length === 1) {
            return { filePath: definitionFiles[0] };
        }

        if (node.parentId) {
            const parent = this.graph.nodes.get(node.parentId);
            if (parent?.filePath || parent?.lineNumber) {
                return { filePath: parent.filePath, lineNumber: parent.lineNumber };
            }
        }

        const edgeWithFile = this.graph.edges.find(edge =>
            (edge.sourceId === node.id || edge.targetId === node.id) &&
            edge.metadata?.filePath
        );
        if (edgeWithFile?.metadata?.filePath) {
            return { filePath: edgeWithFile.metadata.filePath, lineNumber: edgeWithFile.metadata.lineNumber };
        }

        return {};
    }

    /**
     * Create not-found report
     */
    private createNotFoundReport(
        type: 'table' | 'column',
        name: string,
        changeType: ChangeType
    ): ImpactReport {
        return {
            changeType,
            target: {
                type,
                name,
                tableName: type === 'column' ? name : undefined
            },
            directImpacts: [],
            transitiveImpacts: [],
            summary: {
                totalAffected: 0,
                tablesAffected: 0,
                viewsAffected: 0,
                queriesAffected: 0,
                filesAffected: 0
            },
            severity: 'low',
            suggestions: [
                `${type} '${name}' not found in lineage graph`,
                `It may be an external table or not indexed yet`
            ]
        };
    }

    /**
     * Generate table node ID
     */
    private getTableNodeId(tableName: string): string {
        return `table:${tableName.toLowerCase()}`;
    }

    /**
     * Generate column node ID
     */
    private getColumnNodeId(tableName: string, columnName: string): string {
        return `column:${tableName.toLowerCase()}.${columnName.toLowerCase()}`;
    }

    private getTableDisplayName(tableId: string | undefined): string {
        if (!tableId) {
            return 'unknown_table';
        }

        const node = this.graph.nodes.get(tableId);
        if (node?.name) {
            return node.name;
        }

        const normalized = tableId.replace(/^(table|view|external|cte):/, '');
        return normalized || 'unknown_table';
    }

    private matchesForeignKeyTarget(fkTable: string, targetTable: string, normalizedTarget: string): boolean {
        const fkParsed = parseQualifiedKey(fkTable);
        const targetParsed = parseQualifiedKey(targetTable);

        const fkName = normalizeIdentifier(fkParsed.name || '') || fkParsed.name?.toLowerCase();
        const targetName = normalizeIdentifier(targetParsed.name || '') || normalizedTarget;

        if (!fkName || !targetName || fkName !== targetName) {
            return false;
        }

        if (fkParsed.schema && targetParsed.schema) {
            const fkSchema = normalizeIdentifier(fkParsed.schema) || fkParsed.schema.toLowerCase();
            const targetSchema = normalizeIdentifier(targetParsed.schema) || targetParsed.schema.toLowerCase();
            return fkSchema === targetSchema;
        }

        return true;
    }

    private getTableDisplayNameFromColumnId(columnId: string): string {
        if (!columnId.startsWith('column:')) {
            return columnId || 'unknown_table';
        }
        const withoutPrefix = columnId.substring(7);
        const dotIndex = withoutPrefix.lastIndexOf('.');
        if (dotIndex <= 0) {
            return withoutPrefix || 'unknown_table';
        }
        const tableName = withoutPrefix.substring(0, dotIndex);
        return tableName || 'unknown_table';
    }
}
