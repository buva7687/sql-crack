// UI Types - Interfaces for UI components

import { LineageGraph, LineageNode } from '../lineage/types';
import { ImpactReport } from '../lineage/impactAnalyzer';

/**
 * UI view mode
 */
export type ViewMode = 'graph' | 'lineage' | 'tableExplorer' | 'impact';

/**
 * Table explorer data
 */
export interface TableExplorerData {
    table: LineageNode;
    graph: LineageGraph;
    upstream?: LineageNode[];
    downstream?: LineageNode[];
}

/**
 * Lineage view options
 */
export interface LineageViewOptions {
    showColumns: boolean;
    showTransformations: boolean;
    highlightPath: string[];
    direction: 'horizontal' | 'vertical';
}

/**
 * Impact view data
 */
export interface ImpactViewData {
    report: ImpactReport;
    showDetails: boolean;
}

/**
 * UI action types
 */
export interface UIAction {
    type: 'showLineage' | 'showImpact' | 'showUpstream' | 'showDownstream' | 'expandNode';
    payload: any;
}

/**
 * UI state
 */
export interface UIState {
    currentView: ViewMode;
    selectedNode?: LineageNode;
    selectedColumn?: string;
    highlightPath?: string[];
}
