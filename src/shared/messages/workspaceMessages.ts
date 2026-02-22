// Typed message protocol for Workspace Dependencies webview panel
// Discriminated unions on the `command` field for compile-time safety.

import type { GraphMode, SearchFilter } from '../../workspace/types';
import type { ViewMode } from '../../workspace/ui/types';

// ─── Shared data shapes sent in host→webview payloads ───

export interface LineageNodeResult {
    id: string;
    name: string;
    type: string;
    filePath?: string;
    lineNumber?: number;
}

export interface ImpactEntry {
    name: string;
    type: string;
    reason: string;
    severity: string;
    filePath?: string;
    lineNumber?: number;
}

export interface ImpactReportResult {
    changeType: string;
    target: { type: 'table' | 'view' | 'column'; name: string; tableName?: string };
    severity: string;
    summary: { totalAffected: number; tablesAffected: number; viewsAffected: number; queriesAffected: number; filesAffected: number };
    directImpacts: ImpactEntry[];
    transitiveImpacts: ImpactEntry[];
    suggestions: string[];
}

export interface SearchResultEntry {
    id: string;
    name: string;
    type: string;
    filePath?: string;
}

export type WorkspaceUxMetricValue = string | number | boolean | null;
export type WorkspaceUxMetricMetadata = Record<string, WorkspaceUxMetricValue>;

// ─── Webview → Host messages ───

export type WorkspaceWebviewMessage =
    // Basic view commands
    | { command: 'switchView'; view: ViewMode | 'graph' | 'issues' }
    | { command: 'refresh' }
    | { command: 'switchGraphMode'; mode: string }
    | { command: 'search'; filter: SearchFilter }
    | { command: 'clearSearch' }
    | { command: 'trackUxEvent'; event: string; metadata?: WorkspaceUxMetricMetadata }
    | { command: 'toggleHelp' }
    | { command: 'toggleTheme' }
    | { command: 'export'; format: string }
    // File operations
    | { command: 'openFile'; filePath: string }
    | { command: 'openFileAtLine'; filePath: string; line: number }
    | { command: 'showInGraph'; query: string; nodeType?: 'table' | 'view' | 'external' | 'file' }
    | { command: 'visualizeFile'; filePath: string }
    // Lineage view switching
    | { command: 'switchToLineageView' }
    | { command: 'switchToImpactView' }
    // Lineage analysis
    | { command: 'getLineage'; nodeId: string; direction: 'upstream' | 'downstream' | 'both'; depth?: number }
    | { command: 'analyzeImpact'; type: 'table' | 'view' | 'column'; name: string; tableName?: string; changeType?: 'modify' | 'rename' | 'drop' | 'addColumn' }
    | { command: 'exploreTable'; tableName: string; nodeId?: string }
    | { command: 'getColumnLineage'; tableName?: string; tableId?: string; columnName: string }
    | { command: 'selectLineageNode'; nodeId: string }
    | { command: 'getUpstream'; nodeId?: string; depth?: number; nodeType?: string; filePath?: string }
    | { command: 'getDownstream'; nodeId?: string; depth?: number; nodeType?: string; filePath?: string }
    // Visual lineage graph
    | { command: 'searchLineageTables'; query: string; typeFilter?: string }
    | { command: 'getLineageGraph'; nodeId: string; nodeLabel?: string; nodeType?: string; depth?: number; direction?: 'both' | 'upstream' | 'downstream'; expandedNodes?: string[] }
    | { command: 'expandNodeColumns'; nodeId: string }
    | { command: 'setLineageDirection'; nodeId: string; direction: 'both' | 'upstream' | 'downstream' }
    | { command: 'collapseNodeColumns'; nodeId: string }
    | { command: 'setLineageLegendVisibility'; visible: boolean }
    | { command: 'selectColumn'; tableId: string; columnName: string }
    | { command: 'clearColumnSelection' }
    | { command: 'savePng'; data: string; filename: string }
    | { command: 'exportPngError'; error: string }
    // Node-specific export
    | { command: 'exportNodeLineage'; nodeId: string; nodeLabel: string; nodeType: string };

// ─── Host → Webview messages ───

export type WorkspaceHostMessage =
    // Theme & settings
    | { command: 'themeChanged'; css: string; isDark: boolean }
    | { command: 'workspaceLineageDepthUpdated'; depth: number }
    // Lineage results
    | { command: 'lineageOverviewResult'; data: { html: string } }
    | { command: 'lineageResult'; data: { nodeId: string; direction: string; result: { nodes: LineageNodeResult[]; depth: number; pathCount: number } | null } }
    | { command: 'impactFormResult'; data: { html: string } }
    | { command: 'impactResult'; data: { report: ImpactReportResult; html: string } | { error: string } }
    | { command: 'tableDetailResult'; data: { table?: LineageNodeResult; html?: string; error?: string } }
    | { command: 'columnLineageResult'; data: { tableName?: string; tableId?: string; columnName: string; upstream: unknown[]; downstream: unknown[]; html?: string; warning?: string } }
    | { command: 'upstreamResult'; data: { nodeId: string | undefined; nodes: LineageNodeResult[]; depth: number } }
    | { command: 'downstreamResult'; data: { nodeId: string | undefined; nodes: LineageNodeResult[]; depth: number } }
    // Visual lineage graph
    | { command: 'lineageSearchResults'; data: { results: SearchResultEntry[] } }
    | { command: 'lineageGraphResult'; data: { html?: string; nodeId?: string; direction?: string; expandedNodes?: string[]; error?: string } }
    | { command: 'nodeColumnsResult'; data: { nodeId: string } }
    | { command: 'nodeCollapsedResult'; data: { nodeId: string } }
    | { command: 'columnSelectionCleared' }
    // Export triggers
    | { command: 'exportPng' }
    | { command: 'exportPngClipboard' };
