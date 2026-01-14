// Renderer state management

import {
    FlowNode,
    FlowEdge,
    ColumnFlow,
    QueryStats,
    OptimizationHint,
    ColumnLineage,
    ViewState,
    CloudViewState,
    FocusMode,
} from '../types';

// View state
export const state: ViewState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    selectedNodeId: null,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    isDraggingNode: false,
    isDraggingCloud: false,
    draggingNodeId: null,
    draggingCloudNodeId: null,
    dragNodeStartX: 0,
    dragNodeStartY: 0,
    dragCloudStartOffsetX: 0,
    dragCloudStartOffsetY: 0,
    dragMouseStartX: 0,
    dragMouseStartY: 0,
    searchTerm: '',
    searchResults: [],
    currentSearchIndex: -1,
    focusModeEnabled: false,
    legendVisible: false,
    highlightedColumnSources: [],
    isFullscreen: false,
    isDarkTheme: true,
    breadcrumbPath: [],
    showColumnLineage: false,
    showColumnFlows: false,
    selectedColumn: null,
    zoomedNodeId: null,
    previousZoomState: null,
    layoutType: 'vertical',
    focusMode: 'all'
};

// DOM element references
export let svg: SVGSVGElement | null = null;
export let mainGroup: SVGGElement | null = null;
export let backgroundRect: SVGRectElement | null = null;
export let detailsPanel: HTMLDivElement | null = null;
export let statsPanel: HTMLDivElement | null = null;
export let hintsPanel: HTMLDivElement | null = null;
export let legendPanel: HTMLDivElement | null = null;
export let sqlPreviewPanel: HTMLDivElement | null = null;
export let tooltipElement: HTMLDivElement | null = null;
export let breadcrumbPanel: HTMLDivElement | null = null;
export let containerElement: HTMLElement | null = null;
export let searchBox: HTMLInputElement | null = null;

// Current data
export let currentNodes: FlowNode[] = [];
export let currentEdges: FlowEdge[] = [];
export let currentColumnFlows: ColumnFlow[] = [];
export let currentStats: QueryStats | null = null;
export let currentHints: OptimizationHint[] = [];
export let currentSql: string = '';
export let currentColumnLineage: ColumnLineage[] = [];
export let currentTableUsage: Map<string, number> = new Map();

// Cloud state
export let cloudOffsets: Map<string, { offsetX: number; offsetY: number }> = new Map();
export let cloudElements: Map<string, {
    cloud: SVGRectElement;
    title: SVGTextElement;
    arrow: SVGPathElement;
    subflowGroup: SVGGElement;
    nestedSvg?: SVGSVGElement;
    closeButton?: SVGGElement;
}> = new Map();
export let cloudViewStates: Map<string, CloudViewState> = new Map();

// Setters for DOM elements
export function setSvg(element: SVGSVGElement | null): void {
    svg = element;
}

export function setMainGroup(element: SVGGElement | null): void {
    mainGroup = element;
}

export function setBackgroundRect(element: SVGRectElement | null): void {
    backgroundRect = element;
}

export function setDetailsPanel(element: HTMLDivElement | null): void {
    detailsPanel = element;
}

export function setStatsPanel(element: HTMLDivElement | null): void {
    statsPanel = element;
}

export function setHintsPanel(element: HTMLDivElement | null): void {
    hintsPanel = element;
}

export function setLegendPanel(element: HTMLDivElement | null): void {
    legendPanel = element;
}

export function setSqlPreviewPanel(element: HTMLDivElement | null): void {
    sqlPreviewPanel = element;
}

export function setTooltipElement(element: HTMLDivElement | null): void {
    tooltipElement = element;
}

export function setBreadcrumbPanel(element: HTMLDivElement | null): void {
    breadcrumbPanel = element;
}

export function setContainerElement(element: HTMLElement | null): void {
    containerElement = element;
}

export function setSearchBox(element: HTMLInputElement | null): void {
    searchBox = element;
}

// Setters for data
export function setCurrentNodes(nodes: FlowNode[]): void {
    currentNodes = nodes;
}

export function setCurrentEdges(edges: FlowEdge[]): void {
    currentEdges = edges;
}

export function setCurrentColumnFlows(flows: ColumnFlow[]): void {
    currentColumnFlows = flows;
}

export function setCurrentStats(stats: QueryStats | null): void {
    currentStats = stats;
}

export function setCurrentHints(hints: OptimizationHint[]): void {
    currentHints = hints;
}

export function setCurrentSql(sql: string): void {
    currentSql = sql;
}

export function setCurrentColumnLineage(lineage: ColumnLineage[]): void {
    currentColumnLineage = lineage;
}

export function setCurrentTableUsage(usage: Map<string, number>): void {
    currentTableUsage = usage;
}

// Reset all state
export function resetState(): void {
    currentNodes = [];
    currentEdges = [];
    currentColumnFlows = [];
    currentStats = null;
    currentHints = [];
    currentSql = '';
    currentColumnLineage = [];
    currentTableUsage = new Map();
    cloudOffsets = new Map();
    cloudElements = new Map();
    cloudViewStates = new Map();

    state.selectedNodeId = null;
    state.breadcrumbPath = [];
    state.searchResults = [];
    state.currentSearchIndex = -1;
    state.zoomedNodeId = null;
    state.previousZoomState = null;
    state.focusMode = 'all';
}

// Find node by ID
export function findNodeById(nodeId: string): FlowNode | undefined {
    return currentNodes.find(n => n.id === nodeId);
}

// Find edge by ID
export function findEdgeById(edgeId: string): FlowEdge | undefined {
    return currentEdges.find(e => e.id === edgeId);
}
