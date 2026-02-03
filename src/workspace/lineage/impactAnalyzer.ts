// Impact Analyzer - Analyze impact of changes

import { LineageGraph, LineageNode } from './types';
import { FlowAnalyzer } from './flowAnalyzer';

/**
 * Type of change being analyzed
 */
export type ChangeType = 'modify' | 'rename' | 'drop';

/**
 * Impact analysis report
 */
export interface ImpactReport {
    changeType: ChangeType;
    target: {
        type: 'table' | 'column';
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
        // A column is truly impacted only if there's a non-structural edge pointing to it
        const columnsWithDataFlow = new Set<string>();
        for (const edge of this.graph.edges) {
            if (edge.metadata?.relationship !== 'contains' && edge.targetId.startsWith('column:')) {
                columnsWithDataFlow.add(edge.targetId);
            }
        }

        for (const depNode of downstream.nodes) {
            // Skip the table's own columns - they're part of the target, not impacts
            if (depNode.type === 'column' && depNode.id.startsWith(ownColumnPrefix)) {
                continue;
            }

            const isDirect = directEdges.some(e => e.targetId === depNode.id);

            // For transitive column impacts, only include if there's actual data flow
            // (not just structural "contains" relationship from parent table)
            if (!isDirect && depNode.type === 'column' && !columnsWithDataFlow.has(depNode.id)) {
                continue;
            }

            const resolved = this.resolveImpactLocation(depNode);
            const impactItem: ImpactItem = {
                node: depNode,
                impactType: isDirect ? 'direct' : 'transitive',
                reason: this.generateImpactReason(depNode, tableName, 'table'),
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

        // Calculate summary
        const summary = this.calculateSummary(directImpacts, transitiveImpacts);

        // Calculate overall severity
        const severity = this.calculateSeverity({
            directImpacts,
            transitiveImpacts,
            summary
        });

        // Generate suggestions
        const suggestions = this.generateSuggestions(tableName, 'table', changeType, severity);

        return {
            changeType,
            target: {
                type: 'table',
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
        type: 'table' | 'column',
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
}
