// Import types from centralized type definitions
import {
    FlowNode,
    FlowEdge,
    ColumnFlow,
    LineagePathStep,
    ParseResult,
    QueryStats,
    OptimizationHint,
    ColumnLineage,
    ViewState,
    CloudViewState,
    FocusMode,
    LayoutType,
} from './types';

// Import color utilities
import {
    getNodeColor,
    getTransformationColor,
    NODE_COLORS,
    UI_COLORS,
    EDGE_COLORS,
    BADGE_COLORS,
    CONDITION_COLORS,
    STATUS_COLORS,
    getColorblindMode,
    setColorblindMode as setGlobalColorblindMode,
    getEdgeDashPattern,
    getSeverityIcon,
    getWarningColor as getSeverityColor,
} from './constants';

import { formatSql, highlightSql } from './sqlFormatter';
import {
    showKeyboardShortcutsHelp,
    createLegendBar,
    toggleLegendBar,
    isLegendBarVisible,
    getLegendBarHeight,
    createCommandBar,
    showCommandBar,
    hideCommandBar,
    toggleCommandBar,
    isCommandBarVisible,
    registerCommandBarActions,
    createBreadcrumbBar,
    addBreadcrumbSegment,
    removeBreadcrumbSegment,
    clearBreadcrumbBar,
} from './ui';
import {
    hideContextMenu as hideContextMenuUi,
    showContextMenu as showContextMenuUi,
    showCopyFeedback as showCopyFeedbackUi,
} from './ui/contextMenu';
import { prefersReducedMotion } from './ui/motion';
import { attachResizablePanel } from './ui/resizablePanel';
import {
    hideTooltip as hideTooltipUi,
    showTooltip as showTooltipUi,
    updateTooltipPosition as updateTooltipPositionUi,
} from './ui/tooltip';
import { renderBreadcrumbFeature, updateBreadcrumbFeature } from './ui/breadcrumbPopup';
import { renderErrorFeature } from './ui/errorRenderer';
import {
    PANEL_LAYOUT_DEFAULTS,
    applyHintsPanelViewportBounds as applyHintsPanelBounds,
    applyPanelBottomOffsets,
    parsePixelValue as parsePanelPixelValue,
} from './ui/panelLayout';
import { createRendererBootstrap } from './ui/rendererBootstrap';
import { initCanvas, updateCanvasTheme } from './rendering/canvasSetup';
import {
    calculateEdgePath as calculateEdgePathFeature,
    highlightConnectedEdges as highlightConnectedEdgesFeature,
    renderEdge as renderEdgeFeature,
} from './rendering/edgeRenderer';
import {
    renderAggregateNodeVisual,
    renderCaseNodeVisual,
    renderClusterNodeVisual,
    renderJoinNodeVisual,
    renderStandardNodeVisual,
    renderWindowNodeVisual,
    type NodeVisualRendererDeps,
} from './rendering/nodeRenderer';
import { renderNodeFeature } from './rendering/nodeDispatcher';
import {
    renderCteNodeVisual,
    renderSubqueryNodeVisual,
    type ContainerNodeRendererDeps,
} from './rendering/containerNodeRenderer';
import {
    type CloudRenderElements,
    updateCloudAndArrowFeature,
} from './rendering/cloudPositioning';
import {
    layoutSubflowNodes as layoutSubflowNodesFeature,
    layoutSubflowNodesVertical as layoutSubflowNodesVerticalFeature,
    renderCloudSubflow as renderCloudSubflowFeature,
    renderSubflow as renderSubflowFeature,
} from './rendering/cloudRenderer';
import {
    applyClusteringFeature,
    preCalculateExpandableDimensionsFeature,
} from './rendering/clusterProjection';
import { getScrollbarColors, getComponentUiColors } from './constants/colors';
import type { ColorblindMode } from '../shared/theme';
import type { GridStyle } from '../shared/themeTokens';
import { MONO_FONT_STACK } from '../shared/themeTokens';
import {
    shouldVirtualize,
    throttle,
    VirtualizationResult
} from './virtualization';
import {
    setVirtualizationEnabledFeature,
    updateNodeEdgesFeature,
    updateVisibleNodesFeature,
} from './rendering/virtualizedViewport';
import {
    getClusterForNode,
    toggleCluster,
    NodeCluster,
} from './clustering';
import { layoutGraphHorizontal, layoutGraphCompact, layoutGraphForce, layoutGraphRadial } from './parser/forceLayout';
import { layoutGraph } from './parser/layout';
import { ICONS, Z_INDEX } from '../shared';
import { getWarningIndicatorState } from './warningIndicator';
import { COLUMN_LINEAGE_BANNER_TEXT, shouldEnableColumnLineage, shouldShowTraceColumnsAction } from './columnLineageUx';
import { extractSqlSnippet } from './sqlSnippet';
import { shouldShowMinimap } from './minimapVisibility';
import {
    centerOnNodeFeature,
    ensureNodeVisibleFeature,
    fitViewFeature,
    getConnectedNodesFeature,
    getKeyboardNavigationNodesFeature,
    isNodeInViewportFeature,
    navigateToAdjacentNodeFeature,
    navigateToConnectedNodeFeature,
    navigateToSiblingNodeFeature,
    zoomToNodeFeature,
} from './navigation/nodeNavigation';
import { navigateToTableFeature } from './navigation/tableNavigation';
import {
    copyMermaidToClipboard as copyMermaidToClipboardFeature,
    copyToClipboard as copyToClipboardFeature,
    exportToMermaid as exportToMermaidFeature,
    exportToPng as exportToPngFeature,
    exportToSvg as exportToSvgFeature,
} from './features/export';
import {
    clearSearchFeature,
    createSearchRuntimeState,
    highlightMatchesFeature,
    navigateSearchFeature,
    navigateToFirstResultFeature,
    performSearchFeature,
    setSearchBoxFeature,
    updateSearchCountDisplayFeature,
} from './features/search';
import { toggleExpandAllFeature, toggleNodeCollapseFeature } from './features/collapsibleNodes';
import {
    clearLineageHighlightsFeature,
    ensureColumnLineagePanelScrollbarStylesFeature,
    hideColumnLineagePanelFeature,
    highlightColumnSourcesFeature,
    highlightLineageNodesFeature,
    showColumnLineagePanelFeature,
    showLineagePathFeature,
    type ColumnLineageRuntimeState,
} from './features/columnLineage';
import { applyFocusModeFeature, clearFocusModeFeature } from './features/focusMode';
import { toggleFullscreen as toggleFullscreenFeature } from './features/fullscreen';
import { getQueryComplexityInfoFeature } from './features/queryComplexity';
import {
    getJoinColorFeature,
    getJoinDescriptionFeature,
    getJoinVennDiagramFeature,
    getKeyboardShortcutsFeature,
} from './features/rendererMetadata';
import {
    setupMinimapDrag as setupMinimapDragFeature,
    updateMinimap as updateMinimapFeature,
    updateMinimapViewport as updateMinimapViewportFeature,
} from './features/minimap';
import { applyColorblindModeToRenderedGraph as applyColorblindModeFeature } from './features/theme';
import {
    createInitialViewState,
    createLayoutHistory,
    type LayoutHistorySnapshot
} from './state/rendererState';
import { setupEventListeners as setupRendererEventListeners } from './interaction/eventListeners';
import { pulseNodeFeature, pulseNodeInCloudFeature } from './interaction/nodePulse';
import { selectNodeFeature } from './interaction/nodeSelection';
import type { RendererContext } from './types/rendererContext';
import {
    updateDetailsPanelContent,
    updateHintsPanelContent,
    updateStatsPanelContent,
} from './panels/infoPanel';
import {
    showSqlClausePanelContent,
    toggleSqlPreviewPanel,
    updateSqlPreviewPanelContent,
} from './panels/sqlPanels';

const state: ViewState = createInitialViewState(window.vscodeTheme, window.defaultLayout);

let svg: SVGSVGElement | null = null;
let mainGroup: SVGGElement | null = null;
let backgroundRect: SVGRectElement | null = null;
let detailsPanel: HTMLDivElement | null = null;
let statsPanel: HTMLDivElement | null = null;
let hintsPanel: HTMLDivElement | null = null;
let legendPanel: HTMLDivElement | null = null;
let sqlPreviewPanel: HTMLDivElement | null = null;
let tooltipElement: HTMLDivElement | null = null;
let breadcrumbPanel: HTMLDivElement | null = null;
let contextMenuElement: HTMLDivElement | null = null;
let columnLineageBanner: HTMLDivElement | null = null;
let nodeFocusLiveRegion: HTMLDivElement | null = null;
let containerElement: HTMLElement | null = null;
let searchBox: HTMLInputElement | null = null;
let loadingOverlay: HTMLDivElement | null = null;
let panelResizerCleanup: Array<() => void> = [];
let legendResizeObserver: ResizeObserver | null = null;
let legendResizeHandler: (() => void) | null = null;
let rendererResizeObserver: ResizeObserver | null = null;
let resizeObserverDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Scale when view was last "fit to view" - used so we display 100% at fit view instead of raw scale */
let fitViewScale: number = 1;
let currentNodes: FlowNode[] = [];
let currentEdges: FlowEdge[] = [];
let renderNodes: FlowNode[] = [];
let renderEdges: FlowEdge[] = [];
let renderNodeMap: Map<string, FlowNode> = new Map();
let currentClusters: NodeCluster[] = [];
let clusterNodeMap: Map<string, NodeCluster> = new Map();
let currentColumnFlows: ColumnFlow[] = [];
let currentStats: QueryStats | null = null;
let currentHints: OptimizationHint[] = [];
let hintsShowAll = false;
let hintsMinimized = false;
let statsMinimized = false;
let currentSql: string = '';
let currentColumnLineage: ColumnLineage[] = [];
let currentTableUsage: Map<string, number> = new Map();
// Store custom offsets for draggable clouds (nodeId -> { offsetX, offsetY })
let cloudOffsets: Map<string, { offsetX: number; offsetY: number }> = new Map();

const layoutHistory = createLayoutHistory();

// Virtualization state
let virtualizationEnabled = true;
let renderedNodeIds: Set<string> = new Set();
let lastVirtualizationResult: VirtualizationResult | null = null;
let offscreenIndicator: SVGGElement | null = null;
// Store references to cloud and arrow elements for dynamic updates
let cloudElements: Map<string, CloudRenderElements> = new Map();
// Store per-cloud view state for independent pan/zoom (CloudViewState imported from types)
let cloudViewStates: Map<string, CloudViewState> = new Map();
// Store document event listeners for cleanup
let documentListeners: Array<{ type: string; handler: EventListener }> = [];
let spinnerStyleElement: HTMLStyleElement | null = null;
let reducedMotionStyleElement: HTMLStyleElement | null = null;

function getRendererContext(): RendererContext {
    return {
        state,
        dom: {
            getSvg: () => svg,
            getMainGroup: () => mainGroup,
            getContainerElement: () => containerElement,
            getSearchBox: () => searchBox,
        },
        renderData: {
            getCurrentNodes: () => currentNodes,
            getCurrentEdges: () => currentEdges,
            getRenderNodes: () => renderNodes,
            getRenderEdges: () => renderEdges,
            getRenderNodeMap: () => renderNodeMap,
            getCurrentClusters: () => currentClusters,
            getClusterNodeMap: () => clusterNodeMap,
            getCurrentColumnFlows: () => currentColumnFlows,
            getCurrentStats: () => currentStats,
            getCurrentHints: () => currentHints,
            getCurrentSql: () => currentSql,
            getCurrentColumnLineage: () => currentColumnLineage,
            getCurrentTableUsage: () => currentTableUsage,
        },
        panels: {
            getDetailsPanel: () => detailsPanel,
            getStatsPanel: () => statsPanel,
            getHintsPanel: () => hintsPanel,
            getLegendPanel: () => legendPanel,
            getSqlPreviewPanel: () => sqlPreviewPanel,
        },
        cloud: {
            cloudOffsets,
            cloudElements,
            cloudViewStates,
        },
        emit: (_event: string, _data?: unknown): void => {
            // Hook for extracted modules that need cross-feature notifications.
        },
    };
}

function getDefaultCloudOffset(cloudWidth: number, cloudHeight: number, nodeHeight: number, cloudGap: number): { offsetX: number; offsetY: number } {
    return {
        offsetX: -cloudWidth - cloudGap,
        offsetY: -(cloudHeight - nodeHeight) / 2,
    };
}

function ensureCloudOffset(nodeId: string, cloudWidth: number, cloudHeight: number, nodeHeight: number, cloudGap: number): { offsetX: number; offsetY: number } {
    const existing = cloudOffsets.get(nodeId);
    if (existing) {
        return existing;
    }
    const fallback = getDefaultCloudOffset(cloudWidth, cloudHeight, nodeHeight, cloudGap);
    cloudOffsets.set(nodeId, fallback);
    return fallback;
}

function ensureCloudViewState(nodeId: string): CloudViewState {
    const existing = cloudViewStates.get(nodeId);
    if (existing) {
        return existing;
    }

    const initialState: CloudViewState = {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0
    };
    cloudViewStates.set(nodeId, initialState);
    return initialState;
}

function ensureNodeFocusLiveRegion(container: HTMLElement): void {
    if (nodeFocusLiveRegion?.isConnected) {
        return;
    }

    nodeFocusLiveRegion = document.createElement('div');
    nodeFocusLiveRegion.id = 'node-focus-live-region';
    nodeFocusLiveRegion.setAttribute('role', 'status');
    nodeFocusLiveRegion.setAttribute('aria-live', 'polite');
    nodeFocusLiveRegion.setAttribute('aria-atomic', 'true');
    nodeFocusLiveRegion.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        clip-path: inset(50%);
        white-space: nowrap;
    `;
    container.appendChild(nodeFocusLiveRegion);
}

function announceFocusedNode(node: FlowNode): void {
    if (!nodeFocusLiveRegion) { return; }

    const upstream = currentEdges.filter(edge => edge.target === node.id).length;
    const downstream = currentEdges.filter(edge => edge.source === node.id).length;
    const message = `${node.label}. ${node.type} node. ${upstream} upstream, ${downstream} downstream connections.`;

    // Clear then set on next frame so repeated focus announcements are spoken.
    nodeFocusLiveRegion.textContent = '';
    requestAnimationFrame(() => {
        if (nodeFocusLiveRegion) {
            nodeFocusLiveRegion.textContent = message;
        }
    });
}

function captureLayoutHistorySnapshot(): LayoutHistorySnapshot {
    return {
        scale: state.scale,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        selectedNodeId: state.selectedNodeId,
        focusModeEnabled: state.focusModeEnabled,
        focusMode: state.focusMode,
        layoutType: state.layoutType || 'vertical',
        nodePositions: currentNodes.map(node => ({ id: node.id, x: node.x, y: node.y })),
        cloudOffsets: Array.from(cloudOffsets.entries()).map(([nodeId, offset]) => ({
            nodeId,
            offsetX: offset.offsetX,
            offsetY: offset.offsetY,
        })),
    };
}

function applyNodePositionsToDom(): void {
    if (!mainGroup) { return; }

    currentNodes.forEach(node => {
        const nodeGroup = mainGroup!.querySelector(`.node[data-id="${node.id}"]`) as SVGGElement | null;
        if (!nodeGroup) { return; }
        const rect = nodeGroup.querySelector('.node-rect') as SVGRectElement | null;
        if (!rect) { return; }
        const origX = Number.parseFloat(rect.getAttribute('x') || '0');
        const origY = Number.parseFloat(rect.getAttribute('y') || '0');
        const deltaX = node.x - origX;
        const deltaY = node.y - origY;
        nodeGroup.setAttribute('transform', `translate(${deltaX}, ${deltaY})`);
    });
}

function applyEdgePositionsToDom(): void {
    if (!mainGroup) { return; }

    const layoutType = state.layoutType || 'vertical';
    const edgeElements = mainGroup.querySelectorAll('.edge:not(.column-flow-edge)');
    edgeElements.forEach(edgeEl => {
        const sourceId = edgeEl.getAttribute('data-source');
        const targetId = edgeEl.getAttribute('data-target');
        if (!sourceId || !targetId) { return; }

        const sourceNode = currentNodes.find(node => node.id === sourceId);
        const targetNode = currentNodes.find(node => node.id === targetId);
        if (!sourceNode || !targetNode) { return; }

        edgeEl.setAttribute('d', calculateEdgePath(sourceNode, targetNode, layoutType));
    });
}

function restoreLayoutHistorySnapshot(snapshot: LayoutHistorySnapshot): void {
    state.scale = snapshot.scale;
    state.offsetX = snapshot.offsetX;
    state.offsetY = snapshot.offsetY;
    state.focusMode = snapshot.focusMode;
    state.layoutType = snapshot.layoutType;
    state.selectedNodeId = snapshot.selectedNodeId;

    const positionMap = new Map(snapshot.nodePositions.map(position => [position.id, position]));
    currentNodes.forEach(node => {
        const position = positionMap.get(node.id);
        if (!position) { return; }
        node.x = position.x;
        node.y = position.y;
    });

    cloudOffsets = new Map(
        snapshot.cloudOffsets.map(entry => [entry.nodeId, { offsetX: entry.offsetX, offsetY: entry.offsetY }])
    );

    applyNodePositionsToDom();
    applyEdgePositionsToDom();
    currentNodes.forEach(node => updateCloudAndArrow(node));
    updateTransform();
    selectNode(snapshot.selectedNodeId, { skipNavigation: true });

    if (snapshot.focusModeEnabled && snapshot.selectedNodeId) {
        state.focusModeEnabled = true;
        applyFocusMode(snapshot.selectedNodeId);
    } else {
        clearFocusMode();
    }
}

function syncUndoRedoUiState(): void {
    document.dispatchEvent(new CustomEvent('undo-redo-state', {
        detail: { canUndo: layoutHistory.canUndo(), canRedo: layoutHistory.canRedo() },
    }));
}

function recordLayoutHistorySnapshot(): void {
    layoutHistory.record(captureLayoutHistorySnapshot());
    syncUndoRedoUiState();
}

export function initRenderer(container: HTMLElement): void {
    // Use extracted canvas setup module
    const configuredColorblindMode = (((window as any).colorblindMode || 'off') as ColorblindMode);
    setGlobalColorblindMode(configuredColorblindMode);
    const gridStyle = ((window as any).gridStyle || 'lines') as GridStyle;
    const canvas = initCanvas(container, state.isDarkTheme, gridStyle);
    svg = canvas.svg;
    mainGroup = canvas.mainGroup;
    backgroundRect = canvas.backgroundRect;
    ensureNodeFocusLiveRegion(container);
    syncUndoRedoUiState();

    const bootstrap = createRendererBootstrap({
        container,
        existingSpinnerStyleElement: spinnerStyleElement,
        onToggleColumnFlows: toggleColumnFlows,
        onSetupMinimapDrag: setupMinimapDrag,
    });
    detailsPanel = bootstrap.detailsPanel;
    breadcrumbPanel = bootstrap.breadcrumbPanel;
    columnLineageBanner = bootstrap.columnLineageBanner;
    statsPanel = bootstrap.statsPanel;
    hintsPanel = bootstrap.hintsPanel;
    sqlPreviewPanel = bootstrap.sqlPreviewPanel;
    tooltipElement = bootstrap.tooltipElement;
    contextMenuElement = bootstrap.contextMenuElement;
    loadingOverlay = bootstrap.loadingOverlay;
    spinnerStyleElement = bootstrap.spinnerStyleElement;
    ensureHintsPanelScrollbarStyles();

    // Add drag-to-resize + collapse controls for docked panels
    panelResizerCleanup = [
        attachResizablePanel({
            panel: detailsPanel,
            side: 'right',
            storageKey: 'details',
            isDarkTheme: () => state.isDarkTheme
        }),
        attachResizablePanel({
            panel: statsPanel,
            side: 'left',
            storageKey: 'stats',
            isDarkTheme: () => state.isDarkTheme
        }),
        attachResizablePanel({
            panel: hintsPanel,
            side: 'right',
            storageKey: 'hints',
            isDarkTheme: () => state.isDarkTheme
        })
    ];

    // Create bottom legend bar (replaces old top-left legend panel)
    legendPanel = createLegendBar(container, { isDarkTheme: () => state.isDarkTheme }) as HTMLDivElement;

    // Dynamically shift stats & hints panels above the legend bar when it toggles
    const handleLegendToggle = ((event: Event) => {
        const e = event as CustomEvent<{ visible?: boolean; height?: number }>;
        const visible = e?.detail?.visible === true;
        const legendHeight = visible ? (Number(e?.detail?.height) || 0) : 0;
        adjustPanelBottoms(legendHeight);
    }) as EventListener;
    document.addEventListener('legend-bar-toggle', handleLegendToggle);
    documentListeners.push({ type: 'legend-bar-toggle', handler: handleLegendToggle });

    // Keep offsets in sync when legend height changes due wrapping or viewport resize.
    if (legendResizeObserver) {
        legendResizeObserver.disconnect();
    }
    if (legendPanel) {
        legendResizeObserver = new ResizeObserver(() => {
            adjustPanelBottoms(isLegendBarVisible() ? getLegendBarHeight() : 0);
        });
        legendResizeObserver.observe(legendPanel);
    }
    if (legendResizeHandler) {
        window.removeEventListener('resize', legendResizeHandler);
    }
    legendResizeHandler = () => {
        adjustPanelBottoms(isLegendBarVisible() ? getLegendBarHeight() : 0);
    };
    window.addEventListener('resize', legendResizeHandler);

    // Apply initial offset if legend starts visible
    if (isLegendBarVisible()) {
        // Defer so the legend bar has rendered and has a measurable height
        requestAnimationFrame(() => adjustPanelBottoms(getLegendBarHeight()));
    }

    // Create command bar (Ctrl+Shift+P palette)
    createCommandBar(container, () => state.isDarkTheme);
    registerCommandBarActions([
        { id: 'zoom-in', label: 'Zoom In', shortcut: '+', action: () => zoomIn() },
        { id: 'zoom-out', label: 'Zoom Out', shortcut: '-', action: () => zoomOut() },
        { id: 'fit-view', label: 'Fit to View', shortcut: 'R', action: () => resetView() },
        { id: 'toggle-theme', label: 'Toggle Theme', shortcut: 'T', category: 'View', action: () => toggleTheme() },
        { id: 'toggle-fullscreen', label: 'Toggle Fullscreen', shortcut: 'F', category: 'View', action: () => toggleFullscreen() },
        { id: 'toggle-legend', label: 'Toggle Legend', shortcut: 'L', category: 'View', action: () => toggleLegend() },
        { id: 'toggle-sql', label: 'Show SQL Preview', shortcut: 'S', category: 'View', action: () => toggleSqlPreview() },
        { id: 'toggle-stats', label: 'Show Query Stats', shortcut: 'Q', category: 'View', action: () => toggleStats() },
        { id: 'toggle-hints', label: 'Show Optimization Hints', shortcut: 'O', category: 'View', action: () => toggleHints() },
        { id: 'toggle-columns', label: 'Toggle Column Lineage', shortcut: 'C', category: 'View', action: () => toggleColumnFlows() },
        { id: 'layout-vertical', label: 'Layout: Vertical', shortcut: '1', category: 'Layout', action: () => switchLayout('vertical') },
        { id: 'layout-horizontal', label: 'Layout: Horizontal', shortcut: '2', category: 'Layout', action: () => switchLayout('horizontal') },
        { id: 'layout-compact', label: 'Layout: Compact', shortcut: '3', category: 'Layout', action: () => switchLayout('compact') },
        { id: 'layout-force', label: 'Layout: Force', shortcut: '4', category: 'Layout', action: () => switchLayout('force') },
        { id: 'layout-radial', label: 'Layout: Radial', shortcut: '5', category: 'Layout', action: () => switchLayout('radial') },
        { id: 'focus-all', label: 'Focus: All Connected', shortcut: 'A', category: 'Focus', action: () => setFocusMode('all') },
        { id: 'focus-upstream', label: 'Focus: Upstream Only', shortcut: 'U', category: 'Focus', action: () => setFocusMode('upstream') },
        { id: 'focus-downstream', label: 'Focus: Downstream Only', shortcut: 'D', category: 'Focus', action: () => setFocusMode('downstream') },
        { id: 'search', label: 'Search Nodes', shortcut: 'Ctrl+F', category: 'Navigation', action: () => searchBox?.focus() },
        { id: 'help', label: 'Keyboard Shortcuts', shortcut: '?', category: 'Help', action: () => showKeyboardShortcutsHelp(getKeyboardShortcuts(), state.isDarkTheme) },
    ]);

    // Create breadcrumb bar (filter/state indicator)
    createBreadcrumbBar(container, {
        isDarkTheme: () => state.isDarkTheme,
        onClearAll: () => {
            clearFocusMode();
            if (searchBox) {
                searchBox.value = '';
                clearSearch();
            }
            toggleColumnFlows(false);
        },
    });

    // Hide context menu on click outside
    const contextMenuClickHandler = () => {
        if (contextMenuElement) {
            contextMenuElement.style.display = 'none';
        }
    };
    document.addEventListener('click', contextMenuClickHandler);
    documentListeners.push({ type: 'click', handler: contextMenuClickHandler });

    // Store container reference
    containerElement = container;

    // Set high-contrast state from VS Code theme kind
    state.isHighContrast = !!(window as any).isHighContrast;

    // Accessibility: reduced motion and high contrast support
    reducedMotionStyleElement?.remove();
    reducedMotionStyleElement = document.createElement('style');
    const hcStyles = state.isHighContrast ? `
        /* VS Code High Contrast mode overrides */
        .node-rect { stroke-width: 2px !important; }
        .node-accent { width: 6px !important; }
        .edge,
        .column-lineage-edge { stroke-width: 2.5px !important; }
        .details-panel,
        .stats-panel,
        .hints-panel,
        .legend-panel,
        .sql-preview-panel,
        #sql-crack-breadcrumb-bar {
            border-width: 2px !important;
        }
        text { font-weight: 600 !important; }
    ` : '';
    reducedMotionStyleElement.textContent = `
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
            .edge,
            .column-lineage-edge {
                animation: none !important;
                stroke-dasharray: none !important;
            }
            .details-panel,
            .stats-panel,
            .hints-panel,
            .legend-panel,
            .sql-preview-panel {
                transition: none !important;
            }
        }
        @media (prefers-contrast: more) {
            .node-rect { stroke-width: 2 !important; }
            .node-accent { width: 6px !important; }
            .edge,
            .column-lineage-edge { stroke-width: 2 !important; }
            .details-panel,
            .stats-panel,
            .hints-panel,
            .legend-panel,
            .sql-preview-panel,
            #sql-crack-breadcrumb-bar {
                border-width: 2px !important;
            }
        }
        ${hcStyles}
    `;
    document.head.appendChild(reducedMotionStyleElement);

    // Apply initial theme
    applyTheme(state.isDarkTheme);

    // Setup event listeners
    const rendererContext = getRendererContext();
    setupRendererEventListeners(
        {
            state: rendererContext.state,
            getSvg: rendererContext.dom.getSvg,
            getMainGroup: rendererContext.dom.getMainGroup,
            getCurrentNodes: rendererContext.renderData.getCurrentNodes,
            cloudOffsets: rendererContext.cloud.cloudOffsets,
            getSearchBox: rendererContext.dom.getSearchBox,
            documentListeners,
        },
        {
            updateCloudAndArrow,
            updateNodeEdges,
            updateTransform,
            updateZoomIndicator,
            recordLayoutHistorySnapshot,
            selectNode,
            clearFocusMode,
            fitView,
            getKeyboardNavigationNodes,
            moveKeyboardFocusToNode,
            toggleColumnFlows,
            hideContextMenu,
            clearSearch,
            resetView,
            undoLayoutChange,
            redoLayoutChange,
            toggleCommandBar,
            isCommandBarVisible,
            hideCommandBar,
            navigateSearch,
            switchLayout,
            zoomIn,
            zoomOut,
            toggleFullscreen,
            toggleTheme,
            toggleLayout,
            toggleSqlPreview,
            toggleStats,
            toggleHints,
            setFocusMode,
            toggleExpandAll,
            toggleLegend,
            showKeyboardShortcutsHelp,
            getKeyboardShortcuts,
            navigateToConnectedNode,
            navigateToSiblingNode,
        }
    );

    // Setup ResizeObserver for auto-resize when panel changes
    rendererResizeObserver?.disconnect();
    if (resizeObserverDebounceTimer) {
        clearTimeout(resizeObserverDebounceTimer);
        resizeObserverDebounceTimer = null;
    }
    rendererResizeObserver = new ResizeObserver(() => {
        // Debounce resize events
        if (resizeObserverDebounceTimer) {
            clearTimeout(resizeObserverDebounceTimer);
        }
        resizeObserverDebounceTimer = setTimeout(() => {
            if (currentNodes.length > 0) {
                fitView();
            }
        }, 150);
    });
    rendererResizeObserver.observe(container);
}

/**
 * Cleanup function to remove all document event listeners.
 * Call this when the renderer is disposed to prevent memory leaks.
 */
export function cleanupRenderer(): void {
    documentListeners.forEach(({ type, handler }) => {
        document.removeEventListener(type, handler);
    });
    documentListeners.length = 0;
    if (legendResizeHandler) {
        window.removeEventListener('resize', legendResizeHandler);
        legendResizeHandler = null;
    }
    legendResizeObserver?.disconnect();
    legendResizeObserver = null;
    rendererResizeObserver?.disconnect();
    rendererResizeObserver = null;
    if (resizeObserverDebounceTimer) {
        clearTimeout(resizeObserverDebounceTimer);
        resizeObserverDebounceTimer = null;
    }
    spinnerStyleElement?.remove();
    spinnerStyleElement = null;
    reducedMotionStyleElement?.remove();
    reducedMotionStyleElement = null;
    layoutHistory.clear();
    nodeFocusLiveRegion?.remove();
    nodeFocusLiveRegion = null;
    panelResizerCleanup.forEach(cleanup => cleanup());
    panelResizerCleanup = [];
}

function updateTransform(): void {
    if (mainGroup) {
        mainGroup.setAttribute('transform', `translate(${state.offsetX}, ${state.offsetY}) scale(${state.scale})`);
        // Update minimap viewport when panning/zooming.
        // Keep this direct so the viewport box tracks drag/zoom continuously.
        requestAnimationFrame(() => {
            updateMinimapViewport();
        });
        // Trigger virtualized re-render on pan/zoom
        throttledVirtualizedRender();
    }
}

/**
 * Throttled function to re-render visible nodes during pan/zoom
 * Uses 60fps throttle (16ms) for smooth updates
 */
const throttledVirtualizedRender = throttle(() => {
    if (virtualizationEnabled && shouldVirtualize(renderNodes.length)) {
        updateVisibleNodes();
    }
}, 16);

/**
 * Update which nodes are rendered based on current viewport
 * Called during pan/zoom to add/remove nodes from DOM
 */
function updateVisibleNodes(): void {
    const { offscreenIndicator: nextIndicator } = updateVisibleNodesFeature({
        svg,
        mainGroup,
        renderNodes,
        renderEdges,
        scale: state.scale,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        renderedNodeIds,
        currentOffscreenIndicator: offscreenIndicator,
        isDarkTheme: state.isDarkTheme,
        renderNode,
        renderEdge,
        onResultUpdated: (result) => {
            lastVirtualizationResult = result;
        },
    });
    offscreenIndicator = nextIndicator;
}

/**
 * Enable or disable virtualization
 */
export function setVirtualizationEnabled(enabled: boolean): void {
    virtualizationEnabled = enabled;
    const { offscreenIndicator: nextIndicator } = setVirtualizationEnabledFeature({
        enabled,
        currentNodes,
        currentEdges,
        mainGroup,
        renderedNodeIds,
        currentOffscreenIndicator: offscreenIndicator,
        renderNode,
        renderEdge,
        onVirtualizedUpdate: () => {
            updateVisibleNodes();
        },
    });
    offscreenIndicator = nextIndicator;
}

/**
 * Get virtualization status
 */
export function isVirtualizationEnabled(): boolean {
    return virtualizationEnabled;
}

/**
 * Update cloud container and arrow positions when node or cloud is dragged.
 * Arrow positioning is dynamic: if cloud is to the right of node, arrow starts from left side of cloud.
 * If cloud is to the left of node, arrow starts from right side of cloud.
 */
function updateCloudAndArrow(node: FlowNode): void {
    updateCloudAndArrowFeature({
        node,
        cloudElements,
        ensureCloudOffset,
        layoutSubflowNodesVertical,
    });
}

/**
 * Update edges connected to a node when it's dragged.
 * Recalculates edge paths to maintain proper connections between nodes.
 */
function updateNodeEdges(node: FlowNode): void {
    // Delegates layout-aware edge updates to feature module using calculateEdgePath(sourceNode, targetNode, layoutType).
    updateNodeEdgesFeature({
        mainGroup,
        node,
        nodes: currentNodes,
        layoutType: state.layoutType || 'vertical',
        calculateEdgePath,
    });
}

// Pre-calculate dimensions for expandable nodes (CTE/subquery) before rendering edges
// With floating cloud design, CTE/subquery nodes stay fixed size - cloud is separate
function preCalculateExpandableDimensions(nodes: FlowNode[]): void {
    preCalculateExpandableDimensionsFeature(nodes);
}

function applyClustering(nodes: FlowNode[], edges: FlowEdge[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
    return applyClusteringFeature({
        nodes,
        edges,
        currentClusters,
        onClustersUpdated: (nextClusters, nextClusterNodeMap) => {
            currentClusters = nextClusters;
            clusterNodeMap = nextClusterNodeMap;
        },
    });
}

export function render(result: ParseResult): void {
    if (!mainGroup) { return; }

    // Clear any selected node when rendering new query (fixes details panel staying open on tab switch)
    selectNode(null);
    clearFocusMode();
    state.focusModeEnabled = false;
    state.selectedColumn = null;
    columnLineageRuntime.selectedColumnLineage = null;
    clearLineageHighlights();
    hideColumnLineagePanel();
    state.showColumnFlows = false;
    setColumnLineageBannerVisible(false);
    updateLegendPanel();

    if (searchBox && searchBox.value) {
        searchBox.value = '';
    }
    clearSearch();
    clearBreadcrumbBar();

    currentNodes = result.nodes;
    currentEdges = result.edges;
    currentStats = result.stats;
    currentHints = result.hints;
    hintsShowAll = false;
    currentSql = result.sql;
    currentColumnLineage = result.columnLineage || [];
    currentTableUsage = result.tableUsage || new Map();

    // Reset highlight state
    state.highlightedColumnSources = [];

    // Reset zoom state when rendering new query
    state.zoomedNodeId = null;
    state.previousZoomState = null;

    // Reset virtualization state
    renderedNodeIds.clear();
    lastVirtualizationResult = null;
    if (offscreenIndicator) {
        offscreenIndicator.remove();
        offscreenIndicator = null;
    }

    // Clear previous content
    mainGroup.innerHTML = '';

    if (result.error) {
        renderNodes = [];
        renderEdges = [];
        renderNodeMap.clear();
        // Clear stale column data so pressing "C" doesn't show previous query's lineage
        currentColumnLineage = [];
        currentColumnFlows = [];
        renderError(result.error, result.errorSourceLine);
        updateStatsPanel();
        updateHintsPanel();
        // Reset viewport to center so error message is visible
        resetViewportToCenter();
        return;
    }

    if (result.nodes.length === 0) {
        renderNodes = [];
        renderEdges = [];
        renderNodeMap.clear();
        // Clear stale column data so pressing "C" doesn't show previous query's lineage
        currentColumnLineage = [];
        currentColumnFlows = [];
        renderError('No visualization data');
        updateStatsPanel();
        updateHintsPanel();
        // Reset viewport to center so error message is visible
        resetViewportToCenter();
        return;
    }

    // Store column flows
    currentColumnFlows = result.columnFlows || [];

    // Pre-calculate dimensions for expandable nodes (CTE/subquery) before rendering
    // This ensures edges are drawn correctly
    preCalculateExpandableDimensions(result.nodes);

    const clustered = applyClustering(result.nodes, result.edges);
    renderNodes = clustered.nodes;
    renderEdges = clustered.edges;
    renderNodeMap = new Map(renderNodes.map(node => [node.id, node]));

    // Determine if we should use virtualization
    const useVirtualization = virtualizationEnabled && shouldVirtualize(renderNodes.length);

    // Get nodes and edges to render (all or visible subset)
    let nodesToRender = renderNodes;
    let edgesToRender = renderEdges;

    if (useVirtualization && svg) {
        // For initial render with virtualization, render all nodes first
        // then fitView will adjust viewport, and subsequent pan/zoom will virtualize
        // This ensures proper layout calculation
        // We'll enable virtualization after fitView completes
    }

    // Render edges first (behind nodes)
    const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgesGroup.setAttribute('class', 'edges');
    for (const edge of edgesToRender) {
        renderEdge(edge, edgesGroup);
    }
    mainGroup.appendChild(edgesGroup);

    // Show column lineage panel if enabled
    if (state.showColumnFlows) {
        showColumnLineagePanel();
    }

    // Render nodes
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodesGroup.setAttribute('class', 'nodes');
    for (const node of nodesToRender) {
        renderNode(node, nodesGroup);
        renderedNodeIds.add(node.id);
    }
    mainGroup.appendChild(nodesGroup);

    // Update panels
    updateStatsPanel();
    updateHintsPanel();

    // Update SQL preview if visible
    if (sqlPreviewPanel && sqlPreviewPanel.style.visibility !== 'hidden') {
        updateSqlPreview();
    }

    // Fit view
    fitView();

    // Apply non-default layout if configured (parser positions are always vertical)
    if (state.layoutType && state.layoutType !== 'vertical') {
        switchLayout(state.layoutType);
    }

    // Update minimap for complex queries
    updateMinimap();

    // After fitView, trigger virtualization update if enabled
    // This will remove nodes outside viewport and show indicators
    if (useVirtualization) {
        // Use requestAnimationFrame to ensure layout is complete
        requestAnimationFrame(() => {
            updateVisibleNodes();
        });
    }

    if (!layoutHistory.getCurrent()) {
        layoutHistory.initialize(captureLayoutHistorySnapshot());
        syncUndoRedoUiState();
    }
}

function renderNode(node: FlowNode, parent: SVGGElement): void {
    renderNodeFeature({
        node,
        parent,
        state,
        svg,
        cloudViewStates,
        renderClusterNode,
        renderContainerNode,
        renderWindowNode,
        renderAggregateNode,
        renderCaseNode,
        renderJoinNode,
        renderStandardNode,
        onClusterToggle: (clusterNodeId) => {
            const cluster = clusterNodeMap.get(clusterNodeId);
            if (!cluster) {
                return;
            }
            currentClusters = toggleCluster(cluster, currentClusters);
            const currentResult: ParseResult = {
                nodes: currentNodes,
                edges: currentEdges,
                stats: currentStats || ({} as QueryStats),
                hints: currentHints,
                sql: currentSql,
                columnLineage: currentColumnLineage,
                columnFlows: currentColumnFlows,
                tableUsage: currentTableUsage,
            };
            render(currentResult);
        },
        highlightConnectedEdges,
        showTooltip,
        updateTooltipPosition,
        hideTooltip,
        selectNode,
        navigateToAdjacentNode,
        navigateToConnectedNode,
        navigateToSiblingNode,
        announceFocusedNode,
        onContainerExpandRequested: () => {
            const result: ParseResult = {
                nodes: currentNodes,
                edges: currentEdges,
                stats: currentStats!,
                hints: currentHints,
                sql: currentSql,
                columnLineage: currentColumnLineage,
                columnFlows: currentColumnFlows,
                tableUsage: currentTableUsage,
            };
            const wasHorizontal = state.layoutType === 'horizontal';
            render(result);
            if (wasHorizontal) {
                state.layoutType = 'vertical';
                toggleLayout();
            }
        },
        onZoomPulseRequested: (targetNode) => {
            zoomToNode(targetNode);
            pulseNode(targetNode.id);
        },
        showContextMenu,
        onToggleNodeCollapse: toggleNodeCollapse,
    });
}

function getNodeVisualRendererDeps(): NodeVisualRendererDeps {
    return {
        state,
        getNodeAccentPosition: () => (((window as any).nodeAccentPosition || 'left') as 'left' | 'bottom'),
        getNodeVisualIcon,
        getJoinColor,
        getJoinVennDiagram,
        getWarningColor,
        truncate,
    };
}

function getContainerNodeRendererDeps(): ContainerNodeRendererDeps {
    return {
        state,
        svg: svg!,
        cloudOffsets,
        cloudElements,
        cloudViewStates,
        getNodeIcon,
        truncate,
        ensureCloudViewState,
        layoutSubflowNodesVertical,
        renderCloudSubflow,
        onRequestRerender: () => {
            if (!currentStats) {
                return;
            }
            const result: ParseResult = {
                nodes: currentNodes,
                edges: currentEdges,
                stats: currentStats,
                hints: currentHints,
                sql: currentSql,
                columnLineage: currentColumnLineage,
                columnFlows: currentColumnFlows,
                tableUsage: currentTableUsage,
            };
            render(result);
        },
    };
}

function renderClusterNode(node: FlowNode, group: SVGGElement): void {
    renderClusterNodeVisual(node, group, getNodeVisualRendererDeps());
}

function renderStandardNode(node: FlowNode, group: SVGGElement): void {
    renderStandardNodeVisual(node, group, getNodeVisualRendererDeps());
}

function renderJoinNode(node: FlowNode, group: SVGGElement): void {
    renderJoinNodeVisual(node, group, getNodeVisualRendererDeps());
}

function renderContainerNode(node: FlowNode, group: SVGGElement): void {
    const isExpanded = node.expanded !== false;
    const hasChildren = node.children && node.children.length > 0;

    if (node.type === 'subquery') {
        renderSubqueryNode(node, group, isExpanded, hasChildren);
    } else {
        renderCteNode(node, group, isExpanded, hasChildren);
    }
}

function renderSubqueryNode(node: FlowNode, group: SVGGElement, isExpanded: boolean, hasChildren: boolean | undefined): void {
    renderSubqueryNodeVisual(node, group, isExpanded, hasChildren, getContainerNodeRendererDeps());
}

function renderCteNode(node: FlowNode, group: SVGGElement, isExpanded: boolean, hasChildren: boolean | undefined): void {
    renderCteNodeVisual(node, group, isExpanded, hasChildren, getContainerNodeRendererDeps());
}

// Layout children nodes using dagre for subflow visualization
function layoutSubflowNodes(children: FlowNode[], edges: FlowEdge[]): { width: number; height: number } {
    return layoutSubflowNodesFeature(children, edges);
}

// Layout children nodes VERTICALLY (top to bottom) for cloud visualization
function layoutSubflowNodesVertical(children: FlowNode[], edges: FlowEdge[]): { width: number; height: number } {
    return layoutSubflowNodesVerticalFeature(children, edges);
}

// Render internal flow inside the floating cloud container
function renderCloudSubflow(
    _parentNode: FlowNode,
    children: FlowNode[],
    childEdges: FlowEdge[],
    group: SVGGElement,
    offsetX: number,
    offsetY: number,
    _containerWidth: number,
    _containerHeight: number
): void {
    renderCloudSubflowFeature({
        childEdges,
        children,
        getNodeIcon,
        group,
        hideTooltip,
        isDarkTheme: state.isDarkTheme,
        offsetX,
        offsetY,
        showTooltip,
        truncate,
        updateTooltipPosition,
    });
}

// Render the subflow (children and edges) inside a container node
function renderSubflow(
    parentNode: FlowNode,
    children: FlowNode[],
    childEdges: FlowEdge[],
    group: SVGGElement,
    offsetX: number,
    offsetY: number,
    containerWidth: number,
    containerHeight: number
): void {
    renderSubflowFeature({
        childEdges,
        children,
        containerHeight,
        containerWidth,
        getNodeIcon,
        group,
        isDarkTheme: state.isDarkTheme,
        offsetX,
        offsetY,
        parentNode,
        truncate,
    });
}

function renderWindowNode(node: FlowNode, group: SVGGElement): void {
    renderWindowNodeVisual(node, group, getNodeVisualRendererDeps());
}

function renderAggregateNode(node: FlowNode, group: SVGGElement): void {
    renderAggregateNodeVisual(node, group, getNodeVisualRendererDeps());
}

function renderCaseNode(node: FlowNode, group: SVGGElement): void {
    renderCaseNodeVisual(node, group, getNodeVisualRendererDeps());
}

function toggleNodeExpansion(node: FlowNode): void {
    node.expanded = !node.expanded;

    // Recalculate height
    if (node.expanded && node.children) {
        node.height = 70 + node.children.length * 30;
    } else {
        node.height = 50;
    }

    // Re-render (this is a simple approach; a more efficient one would update in place)
    const currentResult: ParseResult = {
        nodes: currentNodes,
        edges: currentEdges,
        stats: currentStats!,
        hints: currentHints,
        sql: currentSql,
        columnLineage: currentColumnLineage,
        columnFlows: currentColumnFlows,
        tableUsage: currentTableUsage
    };
    render(currentResult);
}

function renderEdge(edge: FlowEdge, parent: SVGGElement): void {
    renderEdgeFeature(edge, parent, {
        isDark: state.isDarkTheme,
        nodeMap: renderNodeMap,
        allNodes: currentNodes,
        onEdgeClick: handleEdgeClick,
    });
}

function handleEdgeClick(edge: FlowEdge): void {
    const isDark = state.isDarkTheme;
    const defaultStroke = isDark ? '#333333' : '#CBD5E1';
    // Clear previous edge highlights
    const edges = mainGroup?.querySelectorAll('.edge');
    edges?.forEach(e => {
        e.removeAttribute('data-highlighted');
        const source = e.getAttribute('data-source');
        const target = e.getAttribute('data-target');
        const isConnected = state.selectedNodeId && (source === state.selectedNodeId || target === state.selectedNodeId);

        if (isConnected) {
            e.setAttribute('stroke', EDGE_COLORS.highlight);
            e.setAttribute('stroke-width', '2.5');
        } else {
            e.setAttribute('stroke', defaultStroke);
            e.setAttribute('stroke-width', '1.5');
        }
    });

    // Highlight clicked edge
    const clickedEdge = mainGroup?.querySelector(`[data-edge-id="${edge.id}"]`);
    if (clickedEdge) {
        clickedEdge.setAttribute('data-highlighted', 'true');
        clickedEdge.setAttribute('stroke', EDGE_COLORS.selected);
        clickedEdge.setAttribute('stroke-width', '4');
        clickedEdge.setAttribute('marker-end', 'url(#arrowhead-highlight)');
    }

    // Show SQL clause information
    if (edge.sqlClause) {
        showSqlClausePanel(edge);
    }

    // Jump to line if available
    if (edge.startLine && typeof window !== 'undefined') {
        const vscodeApi = (window as any).vscodeApi;
        if (vscodeApi && vscodeApi.postMessage) {
            vscodeApi.postMessage({
                command: 'goToLine',
                line: edge.startLine
            });
        }
    }
}

function showSqlClausePanel(edge: FlowEdge): void {
    // Source-contract marker for visual regression tests: font-family: ${MONO_FONT_STACK};
    showSqlClausePanelContent({
        edge,
        containerElement,
        isDarkTheme: state.isDarkTheme,
        zIndex: Z_INDEX.dropdown,
        pinIcon: ICONS.pin,
        escapeHtml,
        getClauseTypeColor,
        monoFontStack: MONO_FONT_STACK,
    });
}

function getClauseTypeColor(clauseType: string): string {
    return CONDITION_COLORS[clauseType] || CONDITION_COLORS.default;
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    // Also escape quotes to keep attribute contexts safe.
    return div.innerHTML
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function updateBreadcrumb(nodeId: string | null): void {
    updateBreadcrumbFeature(nodeId, {
        breadcrumbPanel,
        state,
        currentNodes,
        onSelectNode: selectNode,
        onZoomToNode: zoomToNode,
        onPulseNode: pulseNode,
        onResetView: resetView,
    });
}

function renderBreadcrumb(): void {
    renderBreadcrumbFeature({
        breadcrumbPanel,
        state,
        currentNodes,
        onSelectNode: selectNode,
        onZoomToNode: zoomToNode,
        onPulseNode: pulseNode,
        onResetView: resetView,
    });
}

function highlightConnectedEdges(nodeId: string, highlight: boolean): void {
    highlightConnectedEdgesFeature(nodeId, highlight, mainGroup, state.isDarkTheme);
}

/**
 * Renders error message in the visualization area
 * Enhanced to show helpful dialect suggestions when parse errors occur
 */
function renderError(message: string, sourceLine?: string): void {
    renderErrorFeature({
        mainGroup,
        isDarkTheme: state.isDarkTheme,
        message,
        sourceLine,
    });
}

function selectNode(nodeId: string | null, options?: { skipNavigation?: boolean }): void {
    selectNodeFeature({
        nodeId,
        skipNavigation: options?.skipNavigation,
        state,
        mainGroup,
        currentNodes,
        currentSql,
        highlightConnectedEdges,
        onUpdateDetailsPanel: updateDetailsPanel,
        onUpdateBreadcrumb: updateBreadcrumb,
    });
}

/**
 * Add a pulse animation to a node to draw user attention
 * Called when jumping to a node from search, explore, or table clicks
 */
function pulseNode(nodeId: string): void {
    pulseNodeFeature({
        nodeId,
        mainGroup,
        selectedNodeId: state.selectedNodeId,
        isDarkTheme: state.isDarkTheme,
    });
}

/**
 * Pulse a sub-node inside a CTE/subquery cloud (cloud-subflow-node with data-node-id).
 * Used when navigating to a table from Query Stats so we highlight the table/join node inside the cloud, not the CTE.
 * Uses a more prominent multi-pulse animation with persistent highlight since sub-nodes are smaller.
 */
function pulseNodeInCloud(subNodeId: string, parentNodeId: string): void {
    if (prefersReducedMotion()) { return; }
    pulseNodeInCloudFeature({
        subNodeId,
        parentNodeId,
        mainGroup,
        isDarkTheme: state.isDarkTheme,
    });
}

/**
 * Navigate to a connected node using arrow keys for accessibility
 * @param direction - 'upstream' (ArrowUp) or 'downstream' (ArrowDown)
 * @returns true if navigation occurred, false if no connected node found
 */
function getKeyboardNavigationNodes(): FlowNode[] {
    return getKeyboardNavigationNodesFeature({
        nodes: currentNodes,
        edges: currentEdges,
        state,
    });
}

function focusNodeGroup(nodeId: string): void {
    const nodeGroup = mainGroup?.querySelector(`[data-id="${nodeId}"]`) as SVGGElement | null;
    nodeGroup?.focus();
}

function moveKeyboardFocusToNode(targetNode: FlowNode): void {
    selectNode(targetNode.id, { skipNavigation: true });
    ensureNodeVisible(targetNode);
    focusNodeGroup(targetNode.id);
}

function navigateToConnectedNode(direction: 'upstream' | 'downstream', fromNodeId?: string): boolean {
    return navigateToConnectedNodeFeature({
        direction,
        fromNodeId,
        nodes: currentNodes,
        edges: currentEdges,
        state,
        onMoveToNode: (node) => {
            moveKeyboardFocusToNode(node);
        },
    });
}

/**
 * Navigate to adjacent node in the visual order (for accessibility)
 * Uses Y position primarily, then X position for nodes at same level
 */
function navigateToAdjacentNode(currentNode: FlowNode, direction: 'next' | 'prev'): void {
    navigateToAdjacentNodeFeature({
        currentNode,
        direction,
        nodes: currentNodes,
        edges: currentEdges,
        state,
        onMoveToNode: (node) => {
            moveKeyboardFocusToNode(node);
        },
    });
}

function navigateToSiblingNode(currentNode: FlowNode, direction: 'next' | 'prev'): boolean {
    return navigateToSiblingNodeFeature({
        currentNode,
        direction,
        nodes: currentNodes,
        edges: currentEdges,
        state,
        layoutType: state.layoutType || 'vertical',
        onMoveToNode: (node) => {
            moveKeyboardFocusToNode(node);
        },
    });
}

/**
 * Check if a node is visible within the current viewport
 */
function isNodeInViewport(node: FlowNode, margin: number = 50): boolean {
    return isNodeInViewportFeature({
        node,
        margin,
        svg,
        state,
    });
}

/**
 * Ensure a node is visible, panning minimally if needed
 * Only pans if the node is outside the viewport
 */
function ensureNodeVisible(node: FlowNode): void {
    ensureNodeVisibleFeature({
        node,
        svg,
        state,
        onUpdateTransform: () => {
            updateTransform();
        },
    });
}

/**
 * Center the view on a node without hiding other nodes
 * Used for keyboard navigation where we want to keep all nodes visible
 */
function centerOnNode(node: FlowNode): void {
    centerOnNodeFeature({
        node,
        svg,
        state,
        onUpdateTransform: () => {
            updateTransform();
        },
    });
}

function updateDetailsPanel(nodeId: string | null): void {
    updateDetailsPanelContent({
        detailsPanel,
        nodeId,
        currentNodes,
        currentColumnFlows,
        isDarkTheme: state.isDarkTheme,
        escapeHtml,
        getNodeVisualIcon,
        ensureDetailsPanelExpanded,
        onSelectNode: (nextNodeId) => {
            selectNode(nextNodeId);
        },
        onToggleColumnFlows: (show) => {
            toggleColumnFlows(show);
        },
    });
}

function updateStatsPanel(): void {
    updateStatsPanelContent({
        statsPanel,
        currentStats,
        currentTableUsage,
        isDarkTheme: state.isDarkTheme,
        statsMinimized,
        setStatsMinimized: (value) => {
            statsMinimized = value;
        },
        escapeHtml,
        onNavigateToTable: navigateToTable,
        onRequestRerender: () => {
            updateStatsPanel();
        },
    });
}

function navigateToTable(tableName: string): void {
    navigateToTableFeature({
        tableName,
        state,
        currentNodes,
        currentEdges,
        currentStats,
        currentHints,
        currentSql,
        currentColumnLineage,
        currentColumnFlows,
        currentTableUsage,
        currentClusters,
        getClusterForNode,
        toggleCluster,
        onSetClusters: (nextClusters) => {
            currentClusters = nextClusters;
        },
        onRender: render,
        onSelectNode: selectNode,
        onZoomToNode: zoomToNode,
        onPulseNode: pulseNode,
        onPulseNodeInCloud: pulseNodeInCloud,
    });
}

function updateHintsPanel(): void {
    if (!hintsPanel) {
        return;
    }

    const panelBottom = parsePixelValue(hintsPanel.style.bottom, PANEL_BASE_BOTTOM);
    updateHintsPanelContent({
        hintsPanel,
        currentHints,
        currentNodes,
        isDarkTheme: state.isDarkTheme,
        panelBottom,
        hintsMinimized,
        setHintsMinimized: (value) => {
            hintsMinimized = value;
        },
        hintsShowAll,
        setHintsShowAll: (value) => {
            hintsShowAll = value;
        },
        escapeHtml,
        onSelectNode: (nodeId) => {
            const node = currentNodes.find((candidate) => candidate.id === nodeId);
            if (!node) {
                return;
            }
            selectNode(node.id, { skipNavigation: true });
            zoomToNode(node);
            pulseNode(node.id);
        },
        onRequestRerender: () => {
            updateHintsPanel();
        },
        onSyncViewportBounds: (bottomPx) => {
            syncHintsPanelViewportBounds(bottomPx);
        },
    });
}
function fitView(): void {
    fitViewFeature({
        svg,
        renderNodes,
        currentNodes,
        cloudOffsets,
        state,
        layoutSubflowNodesVertical,
        onSetFitViewScale: (scale) => {
            fitViewScale = scale;
        },
        onUpdateTransform: () => {
            updateTransform();
        },
        onUpdateZoomIndicator: () => {
            updateZoomIndicator();
        },
    });
}

function zoomToNode(node: FlowNode): void {
    zoomToNodeFeature({
        node,
        svg,
        mainGroup,
        currentNodes,
        currentEdges,
        cloudOffsets,
        state,
        fitViewScale,
        onClearFocusMode: () => {
            clearFocusMode();
        },
        onFitView: () => {
            fitView();
        },
        onSelectNode: (nodeId) => {
            selectNode(nodeId, { skipNavigation: true });
        },
        onUpdateTransform: () => {
            updateTransform();
        },
        onUpdateZoomIndicator: () => {
            updateZoomIndicator();
        },
    });
}

export function zoomIn(): void {
    state.scale = Math.min(state.scale * 1.2, 3);
    updateTransform();
    updateZoomIndicator();
    recordLayoutHistorySnapshot();
}

export function zoomOut(): void {
    state.scale = Math.max(state.scale / 1.2, 0.2);
    updateTransform();
    updateZoomIndicator();
    recordLayoutHistorySnapshot();
}

export function getZoomLevel(): number {
    // Display zoom relative to "fit to view" so 100% = fit view, not raw scale 1
    const base = fitViewScale > 0 ? fitViewScale : 1;
    const pct = Math.round((state.scale / base) * 100);
    return Math.min(300, Math.max(10, pct)); // Clamp to sensible range for display
}

// View state for tab persistence
export interface TabViewState {
    scale: number;
    offsetX: number;
    offsetY: number;
}

export function getViewState(): TabViewState {
    return {
        scale: state.scale,
        offsetX: state.offsetX,
        offsetY: state.offsetY
    };
}

export function setViewState(viewState: TabViewState): void {
    state.scale = viewState.scale;
    state.offsetX = viewState.offsetX;
    state.offsetY = viewState.offsetY;
    updateTransform();
    updateZoomIndicator();
}

export function resetView(): void {
    fitView();
    updateZoomIndicator();
    recordLayoutHistorySnapshot();
}

export function undoLayoutChange(): void {
    const snapshot = layoutHistory.undo();
    if (!snapshot) {
        syncUndoRedoUiState();
        return;
    }

    restoreLayoutHistorySnapshot(snapshot);
    syncUndoRedoUiState();
}

export function redoLayoutChange(): void {
    const snapshot = layoutHistory.redo();
    if (!snapshot) {
        syncUndoRedoUiState();
        return;
    }

    restoreLayoutHistorySnapshot(snapshot);
    syncUndoRedoUiState();
}

export function canUndoLayoutChanges(): boolean {
    return layoutHistory.canUndo();
}

export function canRedoLayoutChanges(): boolean {
    return layoutHistory.canRedo();
}

export function clearUndoHistory(): void {
    layoutHistory.clear();
    syncUndoRedoUiState();
}

function resetViewportToCenter(): void {
    // Reset transform to center the viewport (for error states when there are no nodes)
    state.scale = 1;
    fitViewScale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    updateTransform();
    updateZoomIndicator();
}

function updateZoomIndicator(): void {
    const indicator = document.getElementById('zoom-level');
    if (indicator) {
        indicator.textContent = `${getZoomLevel()}%`;
    }
}

// Search functionality
const searchRuntime = createSearchRuntimeState();

export function setSearchBox(input: HTMLInputElement, countIndicator: HTMLSpanElement): void {
    searchBox = input;
    input.style.transition = 'width 200ms ease';
    setSearchBoxFeature(searchRuntime, input, countIndicator, {
        onNavigateSearch: navigateSearch,
        onHighlightMatches: highlightMatches,
        onUpdateSearchCountDisplay: updateSearchCountDisplay,
        onNavigateToFirstResult: navigateToFirstResult,
        onNodeMatchActivated: () => {},
        onAddBreadcrumbSegment: () => {},
        onRemoveBreadcrumbSegment: () => {},
        onClearSearch: () => {},
    });
}

function updateSearchCountDisplay(): void {
    updateSearchCountDisplayFeature(searchRuntime, state, currentNodes.length);
}

// Highlight matching nodes without navigating (immediate feedback)
function highlightMatches(term: string): void {
    highlightMatchesFeature({
        term,
        state,
        mainGroup,
        selectedNodeId: state.selectedNodeId,
        highlightColor: EDGE_COLORS.highlight,
    });
}

// Navigate to first result after debounce delay
function navigateToFirstResult(): void {
    navigateToFirstResultFeature(state, { onNavigateSearch: navigateSearch });
}

function performSearch(term: string): void {
    performSearchFeature(term, state, {
        onHighlightMatches: highlightMatches,
        onNavigateToFirstResult: navigateToFirstResult,
        onAddBreadcrumbSegment: (nextTerm) => {
            addBreadcrumbSegment({
                id: 'search',
                label: `Search: "${nextTerm}"`,
                onClear: () => {
                    if (searchBox) {
                        searchBox.value = '';
                    }
                    clearSearch();
                },
            });
        },
        onRemoveBreadcrumbSegment: () => {
            removeBreadcrumbSegment('search');
        },
    });
}

function navigateSearch(delta: number): void {
    navigateSearchFeature(delta, state, currentNodes, {
        onUpdateSearchCountDisplay: updateSearchCountDisplay,
        onNodeMatchActivated: (nodeId) => {
            const node = currentNodes.find((candidate) => candidate.id === nodeId);
            if (!node) {
                return;
            }
            zoomToNode(node);
            selectNode(nodeId, { skipNavigation: true });
            pulseNode(nodeId);
        },
    });
}

function clearSearch(): void {
    clearSearchFeature(state, mainGroup, state.selectedNodeId, {
        onUpdateSearchCountDisplay: updateSearchCountDisplay,
        onRemoveBreadcrumbSegment: () => {
            removeBreadcrumbSegment('search');
        },
    });
}

export function getSearchResultCount(): { current: number; total: number } {
    return {
        current: state.currentSearchIndex + 1,
        total: state.searchResults.length
    };
}

export function nextSearchResult(): void {
    navigateSearch(1);
}

export function prevSearchResult(): void {
    navigateSearch(-1);
}

// Export functions
function getExportFeatureContext() {
    return {
        getSvg: () => svg,
        getContainerElement: () => containerElement,
        getCurrentNodes: () => currentNodes,
        getCurrentEdges: () => currentEdges,
        isDarkTheme: () => state.isDarkTheme,
        calculateBounds,
    };
}

export function exportToPng(): void {
    exportToPngFeature(getExportFeatureContext());
}

export function exportToSvg(): void {
    exportToSvgFeature(getExportFeatureContext());
}

export function exportToMermaid(): void {
    exportToMermaidFeature(getExportFeatureContext());
}

export function copyMermaidToClipboard(): void {
    copyMermaidToClipboardFeature(getExportFeatureContext());
}

export function copyToClipboard(): void {
    copyToClipboardFeature(getExportFeatureContext());
}

function calculateBounds(): { minX: number; minY: number; width: number; height: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const nodesForBounds = renderNodes.length > 0 ? renderNodes : currentNodes;
    for (const node of nodesForBounds) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return {
            minX: 0,
            minY: 0,
            width: 400,
            height: 300,
        };
    }

    const width = maxX - minX;
    const height = maxY - minY;
    return {
        minX,
        minY,
        width: width > 0 ? width : 400,
        height: height > 0 ? height : 300,
    };
}

// Helper functions
function getNodeIcon(type: FlowNode['type']): string {
    const icons: Record<FlowNode['type'], string> = {
        table: '⊞',
        filter: '⧩',
        join: '⋈',
        aggregate: 'Σ',
        sort: '↕',
        limit: '⊟',
        select: '▤',
        result: '◉',
        cte: '↻',
        union: '∪',
        subquery: '⊂',
        window: '▦',
        case: '⎇',
        cluster: '▣'
    };
    return icons[type] || '○';
}

function getNodeVisualIcon(node: FlowNode): string {
    if (getColorblindMode() !== 'off' && node.accessMode === 'write') {
        return '✎';
    }
    return getNodeIcon(node.type);
}

function getWarningIcon(warningType: string): string {
    const icons: Record<string, string> = {
        'unused': ICONS.warning,
        'dead-column': ICONS.noEntry,
        'expensive': ICONS.warning,
        'fan-out': ICONS.chart,
        'repeated-scan': ICONS.refresh,
        'complex': ICONS.calculator,
        'filter-pushdown': ICONS.bolt,
        'non-sargable': ICONS.noEntry,
        'join-order': ICONS.focusDirection,
        'index-suggestion': ICONS.table
    };
    return icons[warningType] || ICONS.warning;
}

function getWarningColor(severity: string): string {
    return getSeverityColor((severity as any) || 'low', getColorblindMode());
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) { return str; }
    return str.substring(0, maxLen - 1) + '…';
}

function lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

// ============================================================
// FEATURE: Color Legend
// ============================================================

const NODE_TYPE_INFO: Record<string, { color: string; icon: string; description: string }> = {
    table: { color: NODE_COLORS.table, icon: '⊞', description: 'Source table' },
    filter: { color: NODE_COLORS.filter, icon: '⧩', description: 'WHERE/HAVING filter' },
    join: { color: NODE_COLORS.join, icon: '⋈', description: 'JOIN operation' },
    aggregate: { color: NODE_COLORS.aggregate, icon: 'Σ', description: 'GROUP BY aggregation' },
    sort: { color: NODE_COLORS.sort, icon: '↕', description: 'ORDER BY sorting' },
    limit: { color: NODE_COLORS.limit, icon: '⊟', description: 'LIMIT clause' },
    select: { color: NODE_COLORS.select, icon: '▤', description: 'Column projection' },
    result: { color: NODE_COLORS.result, icon: '◉', description: 'Query output' },
    cte: { color: NODE_COLORS.cte, icon: '↻', description: 'Common Table Expression' },
    union: { color: NODE_COLORS.union, icon: '∪', description: 'Set operation' },
    subquery: { color: NODE_COLORS.subquery, icon: '⊂', description: 'Subquery/Derived table' },
    window: { color: NODE_COLORS.window, icon: '▦', description: 'Window function' },
};

/** @deprecated Legend content is now managed by the bottom legend bar module */
function updateLegendPanel(): void {
    // No-op: the bottom legend bar (legendBar.ts) manages its own content
}

export function toggleLegend(show?: boolean): void {
    toggleLegendBar(show);
    state.legendVisible = isLegendBarVisible();
}

let statsVisible = true;

export function toggleStats(show?: boolean): void {
    if (!statsPanel) {return;}
    statsVisible = show ?? !statsVisible;
    statsPanel.style.display = statsVisible ? 'block' : 'none';
}

let hintsVisible = true;

export function toggleHints(show?: boolean): void {
    if (!hintsPanel) {return;}
    hintsVisible = show ?? !hintsVisible;
    if (hintsVisible) {
        hintsPanel.style.opacity = '1';
        hintsPanel.style.visibility = 'visible';
        hintsPanel.style.transform = 'translateY(0)';
    } else {
        hintsPanel.style.opacity = '0';
        hintsPanel.style.visibility = 'hidden';
        hintsPanel.style.transform = 'translateY(8px)';
    }
}

const PANEL_BASE_BOTTOM = PANEL_LAYOUT_DEFAULTS.baseBottom;
const HINTS_PANEL_TOP_CLEARANCE = PANEL_LAYOUT_DEFAULTS.topClearance;
const HINTS_PANEL_MIN_HEIGHT = PANEL_LAYOUT_DEFAULTS.minPanelHeight;
const HINTS_LIST_CHROME_HEIGHT = PANEL_LAYOUT_DEFAULTS.listChromeHeight;
const HINTS_LIST_MIN_HEIGHT = PANEL_LAYOUT_DEFAULTS.minListHeight;

const PANEL_LAYOUT_CONFIG = {
    baseBottom: PANEL_BASE_BOTTOM,
    topClearance: HINTS_PANEL_TOP_CLEARANCE,
    minPanelHeight: HINTS_PANEL_MIN_HEIGHT,
    listChromeHeight: HINTS_LIST_CHROME_HEIGHT,
    minListHeight: HINTS_LIST_MIN_HEIGHT,
};

function parsePixelValue(raw: string | null | undefined, fallback: number): number {
    return parsePanelPixelValue(raw, fallback);
}

function syncHintsPanelViewportBounds(bottomPx: number): void {
    applyHintsPanelBounds(hintsPanel, bottomPx, window.innerHeight, PANEL_LAYOUT_CONFIG);
}

/**
 * Shift stats and hints panels up so they sit above the legend bar.
 * Called whenever the legend bar toggles or on initial render.
 */
function adjustPanelBottoms(legendHeight: number): void {
    applyPanelBottomOffsets(
        { statsPanel, hintsPanel },
        legendHeight,
        window.innerHeight,
        PANEL_LAYOUT_CONFIG
    );
}

// Layout order for cycling
const LAYOUT_ORDER: LayoutType[] = ['vertical', 'horizontal', 'compact', 'force', 'radial'];

// Loading state helpers
function showLoading(message?: string): void {
    if (!loadingOverlay) { return; }
    const textEl = loadingOverlay.querySelector('span');
    if (textEl && message) {
        textEl.textContent = message;
    }
    loadingOverlay.style.display = 'flex';
}

function hideLoading(): void {
    if (!loadingOverlay) { return; }
    loadingOverlay.style.display = 'none';
}

export function toggleLayout(): void {
    const currentIndex = LAYOUT_ORDER.indexOf(state.layoutType || 'vertical');
    const nextIndex = (currentIndex + 1) % LAYOUT_ORDER.length;
    switchLayout(LAYOUT_ORDER[nextIndex]);
}

export function switchLayout(layoutType: LayoutType): void {
    if (!currentNodes || currentNodes.length === 0 || !svg || !mainGroup) {
        return;
    }

    // Show loading for larger graphs
    const showLoadingIndicator = currentNodes.length > 15;
    if (showLoadingIndicator) {
        showLoading('Calculating layout...');
    }

    // Use requestAnimationFrame to allow UI to update before heavy computation
    requestAnimationFrame(() => {
        state.layoutType = layoutType;

        // Re-run layout with selected algorithm
        const bottomUp = window.flowDirection === 'bottom-up';
        switch (layoutType) {
            case 'horizontal':
                layoutGraphHorizontal(currentNodes, currentEdges, bottomUp);
                break;
            case 'compact':
                layoutGraphCompact(currentNodes, currentEdges, bottomUp);
                break;
            case 'force':
                layoutGraphForce(currentNodes, currentEdges);
                break;
            case 'radial':
                layoutGraphRadial(currentNodes, currentEdges);
                break;
            case 'vertical':
            default:
                layoutGraph(currentNodes, currentEdges, bottomUp);
                break;
        }

        // Update node positions in DOM
        currentNodes.forEach(node => {
            const nodeGroup = mainGroup!.querySelector(`.node[data-id="${node.id}"]`) as SVGGElement;
            if (nodeGroup) {
                const rect = nodeGroup.querySelector('.node-rect') as SVGRectElement;
                if (rect) {
                    const origX = parseFloat(rect.getAttribute('x') || '0');
                    const origY = parseFloat(rect.getAttribute('y') || '0');
                    const deltaX = node.x - origX;
                    const deltaY = node.y - origY;
                    nodeGroup.setAttribute('transform', `translate(${deltaX}, ${deltaY})`);
                }
            }
        });

        // Show all edges first
        const allEdges = mainGroup!.querySelectorAll('.edge');
        allEdges.forEach(edgeEl => {
            (edgeEl as SVGPathElement).style.display = '';
        });

        // Update edge paths
        const edgeElements = mainGroup!.querySelectorAll('.edge:not(.column-flow-edge)');
        edgeElements.forEach(edgeEl => {
            const sourceId = edgeEl.getAttribute('data-source');
            const targetId = edgeEl.getAttribute('data-target');
            if (sourceId && targetId) {
                const sourceNode = currentNodes.find(n => n.id === sourceId);
                const targetNode = currentNodes.find(n => n.id === targetId);
                if (sourceNode && targetNode) {
                    const path = calculateEdgePath(sourceNode, targetNode, layoutType);
                    edgeEl.setAttribute('d', path);
                    (edgeEl as SVGPathElement).style.display = '';
                } else {
                    (edgeEl as SVGPathElement).style.display = 'none';
                }
            }
        });

        // Update layout selector if present
        const layoutSelect = document.getElementById('layout-select') as HTMLSelectElement;
        if (layoutSelect) {
            layoutSelect.value = layoutType;
        }

        fitView();

        // Hide loading after a brief delay to ensure UI updates are visible
        if (showLoadingIndicator) {
            requestAnimationFrame(() => {
                hideLoading();
            });
        }

        recordLayoutHistorySnapshot();
    });
}

export function getCurrentLayout(): LayoutType {
    return state.layoutType || 'vertical';
}

/**
 * Calculate edge path based on layout type and node positions
 */
export function calculateEdgePath(sourceNode: FlowNode, targetNode: FlowNode, layoutType: LayoutType): string {
    return calculateEdgePathFeature(sourceNode, targetNode, layoutType);
}

// ============================================================
// FEATURE: Focus Mode
// ============================================================

export function toggleFocusMode(enable?: boolean): void {
    state.focusModeEnabled = enable ?? !state.focusModeEnabled;

    if (state.focusModeEnabled && state.selectedNodeId) {
        applyFocusMode(state.selectedNodeId);
        const modeLabel = state.focusMode === 'upstream' ? 'Upstream' : state.focusMode === 'downstream' ? 'Downstream' : 'All';
        addBreadcrumbSegment({
            id: 'focus-mode',
            label: `Focus: ${modeLabel}`,
            icon: state.focusMode === 'upstream' ? '\u2191' : state.focusMode === 'downstream' ? '\u2193' : '\u21c4',
            onClear: () => { toggleFocusMode(false); },
        });
    } else {
        clearFocusMode();
        removeBreadcrumbSegment('focus-mode');
    }

    recordLayoutHistorySnapshot();
}

function applyFocusMode(nodeId: string): void {
    applyFocusModeFeature({
        enabled: state.focusModeEnabled,
        nodeId,
        mainGroup,
        connectedIds: getConnectedNodes(nodeId),
    });
}

function clearFocusMode(): void {
    clearFocusModeFeature({ mainGroup, state });
}

export function setFocusMode(mode: FocusMode): void {
    state.focusMode = mode;

    // Re-apply focus mode if enabled and a node is selected
    if (state.focusModeEnabled && state.selectedNodeId) {
        applyFocusMode(state.selectedNodeId);
    }

    // Also re-apply if zoomed to a node
    if (state.zoomedNodeId && state.selectedNodeId) {
        // Will be handled by zoom module
    }

    recordLayoutHistorySnapshot();
}

export function getFocusMode(): FocusMode {
    return state.focusMode;
}

function getConnectedNodes(nodeId: string): Set<string> {
    return getConnectedNodesFeature(nodeId, currentEdges, state.focusMode);
}

// ============================================================
// FEATURE: Column Flow Highlighting
// ============================================================

export function highlightColumnSources(columnName: string): void {
    highlightColumnSourcesFeature({
        columnName,
        currentColumnLineage,
        currentNodes,
        currentEdges,
        mainGroup,
        state,
        edgeColors: {
            default: EDGE_COLORS.default,
            defaultLight: EDGE_COLORS.defaultLight,
            focus: EDGE_COLORS.focus,
            columnLineage: EDGE_COLORS.columnLineage,
        },
    });
}

// ============================================================
// FEATURE: SQL Preview Panel
// ============================================================

export function toggleSqlPreview(show?: boolean): void {
    toggleSqlPreviewPanel({
        panel: sqlPreviewPanel,
        currentSql,
        isDarkTheme: state.isDarkTheme,
        formatSql,
        highlightSql,
        onToggleVisible: (nextShow) => {
            toggleSqlPreview(nextShow);
        },
    }, show);
}

function updateSqlPreview(): void {
    updateSqlPreviewPanelContent({
        panel: sqlPreviewPanel,
        currentSql,
        isDarkTheme: state.isDarkTheme,
        formatSql,
        highlightSql,
        onToggleVisible: (nextShow) => {
            toggleSqlPreview(nextShow);
        },
    });
}

// ============================================================
// FEATURE: Collapsible CTEs/Subqueries
// ============================================================

export function toggleNodeCollapse(nodeId: string): void {
    toggleNodeCollapseFeature({
        nodeId,
        currentNodes,
        createRenderResult: () => ({
            nodes: currentNodes,
            edges: currentEdges,
            stats: currentStats!,
            hints: currentHints,
            sql: currentSql,
            columnLineage: currentColumnLineage,
            columnFlows: currentColumnFlows,
            tableUsage: currentTableUsage,
        }),
        onRender: render,
    });
}

/**
 * Toggle expand/collapse all CTE and subquery nodes.
 * When expanding, clouds are stacked vertically to prevent overlap.
 */
export function toggleExpandAll(): void {
    toggleExpandAllFeature({
        currentNodes,
        currentEdges,
        cloudOffsets,
        cloudViewStates,
        layoutSubflowNodesVertical,
        createRenderResult: () => ({
            nodes: currentNodes,
            edges: currentEdges,
            stats: currentStats!,
            hints: currentHints,
            sql: currentSql,
            columnLineage: currentColumnLineage,
            tableUsage: currentTableUsage,
            columnFlows: currentColumnFlows,
        }),
        onRender: render,
        wasHorizontalLayout: state.layoutType === 'horizontal',
        onSwitchToVerticalLayout: () => {
            state.layoutType = 'vertical';
            toggleLayout();
        },
        onFitView: fitView,
    });
}

export function getFormattedSql(): string {
    return formatSql(currentSql);
}

// ============================================================
// FEATURE: Minimap for Complex Queries
// ============================================================

function getMinimapContext() {
    return {
        calculateBounds,
        currentNodes,
        getNodeColor,
        renderNodes,
        shouldShowMinimap,
        state,
        svg,
    };
}

export function updateMinimap(): void {
    updateMinimapFeature(getMinimapContext(), updateMinimapViewport);
}

function updateMinimapViewport(): void {
    updateMinimapViewportFeature(getMinimapContext());
}

function setupMinimapDrag(minimapContainer: HTMLDivElement): void {
    setupMinimapDragFeature(minimapContainer, getMinimapContext(), updateTransform);
}

// ============================================================
// FEATURE: Query Complexity Info Badge
// ============================================================

export function getQueryComplexityInfo(): { nodeCount: number; tableCount: number; depth: number; isComplex: boolean } {
    return getQueryComplexityInfoFeature(currentNodes, currentEdges);
}

// ============================================================
// Phase 1 Feature: Fullscreen Mode
// ============================================================
// Toggle fullscreen mode to maximize visualization area.
// Hides all UI elements (toolbars, panels) and makes SVG fill the viewport.
// Uses individual style properties instead of cssText to preserve fonts and sizes.

import { FULLSCREEN_HIDE_IDS, FULLSCREEN_HIDE_SELECTORS } from './constants/fullscreen';
// Re-export so callers that import from renderer still get them
export { FULLSCREEN_HIDE_IDS, FULLSCREEN_HIDE_SELECTORS };

export function toggleFullscreen(enable?: boolean): void {
    state.isFullscreen = toggleFullscreenFeature({
        columnLineageBanner,
        currentIsFullscreen: state.isFullscreen,
        enable,
        getTheme: getComponentUiColors,
        hideIds: FULLSCREEN_HIDE_IDS,
        hideSelectors: FULLSCREEN_HIDE_SELECTORS,
        isDarkTheme: state.isDarkTheme,
        onExitRequested: () => toggleFullscreen(false),
        onRequestFullscreen: (nextEnable: boolean) => {
            if (typeof window !== 'undefined' && (window as any).vscodeApi) {
                (window as any).vscodeApi.postMessage({
                    command: 'requestFullscreen',
                    enable: nextEnable,
                });
            }
        },
        rootElement: document.getElementById('root'),
        svgElement: svg,
        zIndex: Z_INDEX.debugTop,
    });

    // Refit view after fullscreen toggle
    setTimeout(() => {
        fitView();
        updateMinimap();
    }, 100);
}

export function isFullscreen(): boolean {
    return state.isFullscreen;
}

function applyColorblindModeToRenderedGraph(): void {
    applyColorblindModeFeature({
        getEdgeDashPattern,
        getNodeColor,
        getNodeVisualIcon,
        getSeverityIcon,
        getWarningColor,
        getWarningIndicatorState,
        mainGroup,
        nodes: currentNodes,
    });
}

export function setColorblindMode(mode: ColorblindMode): void {
    setGlobalColorblindMode(mode);
    (window as any).colorblindMode = mode;
    applyColorblindModeToRenderedGraph();
}

// ============================================================
// FEATURE: Theme Toggle (Dark/Light)
// ============================================================

export function toggleTheme(dark?: boolean): void {
    state.isDarkTheme = dark ?? !state.isDarkTheme;
    applyTheme(state.isDarkTheme);
}

export function isDarkTheme(): boolean {
    return state.isDarkTheme;
}

function applyTheme(dark: boolean): void {
    if (!svg) {return;}

    const colors = dark ? {
        bg: UI_COLORS.background,
        panelBg: UI_COLORS.backgroundPanel,
        panelBgSolid: UI_COLORS.backgroundPanelSolid,
        border: UI_COLORS.border,
        text: UI_COLORS.text,
        textMuted: UI_COLORS.textMuted,
        textDim: UI_COLORS.textDim
    } : {
        bg: UI_COLORS.backgroundLight,
        panelBg: UI_COLORS.backgroundPanelLight,
        panelBgSolid: UI_COLORS.backgroundPanelLightSolid,
        border: 'rgba(0, 0, 0, 0.1)',
        text: UI_COLORS.textLight,
        textMuted: '#475569',
        textDim: UI_COLORS.textLightDim
    };

    // Apply canvas theme using extracted module
    if (svg && backgroundRect) {
        const gridStyle = ((window as any).gridStyle || 'lines') as GridStyle;
        updateCanvasTheme(svg, backgroundRect, dark, gridStyle);
    }

    // Apply to all panels
    const panels = [detailsPanel, statsPanel, hintsPanel, legendPanel, sqlPreviewPanel, tooltipElement, breadcrumbPanel];
    panels.forEach(panel => {
        if (panel) {
            panel.style.background = colors.panelBg;
            panel.style.borderColor = colors.border;
            panel.style.color = colors.text;
            panel.style.boxShadow = dark
                ? '0 4px 12px rgba(0, 0, 0, 0.3)'
                : '0 2px 8px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)';
        }
    });
    updateColumnLineageBannerStyle();
    ensureHintsPanelScrollbarStyles();
    if (columnLineageRuntime.columnLineagePanel) {
        ensureColumnLineagePanelScrollbarStyles();
    }

    // Apply to minimap
    const minimap = document.getElementById('minimap-container');
    if (minimap) {
        minimap.style.background = colors.panelBg;
        minimap.style.borderColor = colors.border;
    }

    // Dispatch custom event for index.ts to update toolbar
    const event = new CustomEvent('theme-change', { detail: { dark } });
    document.dispatchEvent(event);
    
    // Update panels with new theme colors
    if (currentStats) {
        updateStatsPanel();
    }
    if (currentHints.length > 0) {
        updateHintsPanel();
    }
    
    // Re-render all nodes to update colors for theme
    if (currentNodes.length > 0) {
        render({ nodes: currentNodes, edges: currentEdges, stats: currentStats || {} as QueryStats, hints: currentHints, sql: currentSql, columnLineage: currentColumnLineage, columnFlows: currentColumnFlows, tableUsage: currentTableUsage });
    }
}

// ============================================================
// FEATURE: Hover Tooltips
// ============================================================

function showTooltip(node: FlowNode, e: MouseEvent): void {
    showTooltipUi({
        badgeFunctionNameColor: BADGE_COLORS.functionName,
        currentSql,
        escapeHtml,
        extractSqlSnippet: (sql: string, startLine?: number, endLine?: number) => extractSqlSnippet(sql, startLine, endLine, 3, 180),
        getNodeColor,
        getNodeVisualIcon,
        getWarningColor,
        getWarningIcon,
        isDarkTheme: state.isDarkTheme,
        monoFontStack: MONO_FONT_STACK,
        node,
        pinIcon: ICONS.pin,
        tooltipElement,
        updateTooltipPosition,
    }, e);
}

function updateTooltipPosition(e: MouseEvent): void {
    updateTooltipPositionUi(tooltipElement, e);
}

function hideTooltip(): void {
    hideTooltipUi(tooltipElement);
}

// ============================================================
// Right-click Context Menu for Nodes
// ============================================================

function showContextMenu(node: FlowNode, e: MouseEvent): void {
    showContextMenuUi({
        colors: {
            backgroundDark: UI_COLORS.backgroundPanelSolid,
            backgroundLight: UI_COLORS.backgroundPanelLightSolid,
            borderDark: UI_COLORS.borderMedium,
            borderLight: 'rgba(148, 163, 184, 0.4)',
            textDark: UI_COLORS.textBright,
            textLight: UI_COLORS.textLight,
        },
        contextMenuElement,
        event: e,
        icons: {
            clipboard: ICONS.clipboard,
            document: ICONS.document,
            folderClosed: ICONS.folderClosed,
            folderOpen: ICONS.folderOpen,
            search: ICONS.search,
        },
        isDarkTheme: state.isDarkTheme,
        node,
        onAction: handleContextMenuAction,
    });
}

function handleContextMenuAction(action: string | null, node: FlowNode): void {
    switch (action) {
        case 'zoom':
            selectNode(node.id, { skipNavigation: true });
            zoomToNode(node);
            pulseNode(node.id);
            break;
        case 'focus-upstream':
            selectNode(node.id, { skipNavigation: true });
            setFocusMode('upstream');
            state.focusModeEnabled = true;
            applyFocusMode(node.id);
            break;
        case 'focus-downstream':
            selectNode(node.id, { skipNavigation: true });
            setFocusMode('downstream');
            state.focusModeEnabled = true;
            applyFocusMode(node.id);
            break;
        case 'reset-view':
            selectNode(null);
            clearFocusMode();
            // Use requestAnimationFrame to ensure DOM updates are applied before fitView
            requestAnimationFrame(() => {
                resetView();
            });
            break;
        case 'toggle-expand':
            if ((node.type === 'cte' || node.type === 'subquery') && node.collapsible) {
                node.expanded = node.expanded === false ? true : false;
                // Re-render to show/hide cloud
                const result: ParseResult = {
                    nodes: currentNodes,
                    edges: currentEdges,
                    stats: currentStats!,
                    hints: currentHints,
                    sql: currentSql,
                    columnLineage: currentColumnLineage,
                    columnFlows: currentColumnFlows,
                    tableUsage: currentTableUsage
                };
                render(result);
            }
            break;
        case 'copy-label':
            navigator.clipboard.writeText(node.label).then(() => {
                showCopyFeedback('Node name copied!');
            });
            break;
        case 'copy-details':
            if (node.details && node.details.length > 0) {
                const detailsText = node.details.join('\n');
                navigator.clipboard.writeText(detailsText).then(() => {
                    showCopyFeedback('Details copied!');
                });
            }
            break;
    }
}

function showCopyFeedback(message: string): void {
    showCopyFeedbackUi(message, Z_INDEX.firstRunOverlay);
}

function hideContextMenu(): void {
    hideContextMenuUi(contextMenuElement);
}

// ============================================================
// REDESIGNED: Column-Level Lineage Visualization
// Click-based approach with full lineage paths
// ============================================================

const columnLineageRuntime: ColumnLineageRuntimeState = {
    selectedColumnLineage: null,
    columnLineagePanel: null,
};

function updateColumnLineageBannerStyle(): void {
    if (!columnLineageBanner) { return; }
    const background = state.isDarkTheme ? 'rgba(129, 140, 248, 0.1)' : 'rgba(99, 102, 241, 0.08)';
    const border = state.isDarkTheme ? 'rgba(129, 140, 248, 0.35)' : 'rgba(99, 102, 241, 0.3)';
    const textColor = state.isDarkTheme ? '#c7d2fe' : '#4338ca';
    const buttonColor = state.isDarkTheme ? '#a5b4fc' : '#4f46e5';
    columnLineageBanner.style.background = background;
    columnLineageBanner.style.border = `1px solid ${border}`;
    columnLineageBanner.style.color = textColor;
    const closeBtn = columnLineageBanner.querySelector('#column-lineage-banner-close') as HTMLButtonElement | null;
    if (closeBtn) {
        closeBtn.style.color = buttonColor;
    }
}

function setColumnLineageBannerVisible(visible: boolean): void {
    if (!columnLineageBanner) { return; }
    updateColumnLineageBannerStyle();
    columnLineageBanner.style.display = visible ? 'flex' : 'none';
}

function ensureHintsPanelScrollbarStyles(): void {
    const styleId = 'hints-panel-scroll-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    const { thumb, thumbHover, track } = getScrollbarColors(state.isDarkTheme);
    style.textContent = `
        .hints-panel,
        .hints-panel .hints-list {
            scrollbar-width: thin;
            scrollbar-color: ${thumb} ${track};
        }
        .hints-panel::-webkit-scrollbar,
        .hints-panel .hints-list::-webkit-scrollbar {
            width: 10px;
        }
        .hints-panel::-webkit-scrollbar-track,
        .hints-panel .hints-list::-webkit-scrollbar-track {
            background: ${track};
            border-radius: 8px;
        }
        .hints-panel::-webkit-scrollbar-thumb,
        .hints-panel .hints-list::-webkit-scrollbar-thumb {
            background: ${thumb};
            border-radius: 8px;
            border: 2px solid transparent;
            background-clip: padding-box;
        }
        .hints-panel::-webkit-scrollbar-thumb:hover,
        .hints-panel .hints-list::-webkit-scrollbar-thumb:hover {
            background: ${thumbHover};
            background-clip: padding-box;
        }
    `;
}

function ensureColumnLineagePanelScrollbarStyles(): void {
    ensureColumnLineagePanelScrollbarStylesFeature(state.isDarkTheme, getScrollbarColors);
}

/**
 * Toggle column lineage mode
 */
export function toggleColumnFlows(show?: boolean): void {
    state.showColumnFlows = show !== undefined ? show : !state.showColumnFlows;

    if (state.showColumnFlows) {
        if (!shouldEnableColumnLineage(currentColumnFlows?.length || 0)) {
            state.showColumnFlows = false;
            setColumnLineageBannerVisible(false);
            return;
        }
        showColumnLineagePanel();
        if (breadcrumbPanel) {
            breadcrumbPanel.style.display = 'none';
        }
        addBreadcrumbSegment({
            id: 'column-lineage',
            label: 'Column Lineage',
            icon: '\u2502',
            onClear: () => { toggleColumnFlows(false); },
        });
        // Banner is redundant when the breadcrumb chip is visible
        setColumnLineageBannerVisible(false);
    } else {
        hideColumnLineagePanel();
        setColumnLineageBannerVisible(false);
        clearLineageHighlights();
        removeBreadcrumbSegment('column-lineage');
        if (state.selectedNodeId) {
            updateBreadcrumb(state.selectedNodeId);
        }
    }

    // Update legend
    updateLegendPanel();
}

/**
 * Show the column lineage selection panel
 */
function showColumnLineagePanel(): void {
    hideColumnLineagePanel();
    ensureColumnLineagePanelScrollbarStyles();
    showColumnLineagePanelFeature({
        runtime: columnLineageRuntime,
        currentColumnFlows,
        isDarkTheme: state.isDarkTheme,
        searchIcon: ICONS.search,
        escapeHtml,
        onToggleColumnFlows: (show) => {
            toggleColumnFlows(show);
        },
        onFlowSelected: (flow) => {
            showLineagePath(flow);
            highlightLineageNodes(flow);
        },
    });
}

/**
 * Hide the column lineage panel
 */
function hideColumnLineagePanel(): void {
    hideColumnLineagePanelFeature(columnLineageRuntime);
}

/**
 * Show the lineage path in the details panel
 */
function ensureDetailsPanelExpanded(): void {
    if (!detailsPanel) { return; }
    if (detailsPanel.getAttribute('aria-expanded') === 'false') {
        const toggle = detailsPanel.querySelector<HTMLButtonElement>('.sql-crack-resize-toggle[data-panel-key="details"]');
        toggle?.click();
    }
}

function showLineagePath(flow: ColumnFlow): void {
    showLineagePathFeature({
        flow,
        detailsPanel,
        isDarkTheme: state.isDarkTheme,
        escapeHtml,
        getTransformationColor,
        ensureDetailsPanelExpanded,
    });
}

/**
 * Highlight nodes in the lineage path with transformation badges
 */
function highlightLineageNodes(flow: ColumnFlow): void {
    highlightLineageNodesFeature({
        flow,
        mainGroup,
        edgeColors: {
            default: EDGE_COLORS.default,
            defaultLight: EDGE_COLORS.defaultLight,
            focus: EDGE_COLORS.focus,
            columnLineage: EDGE_COLORS.columnLineage,
        },
    });
}

/**
 * Clear all lineage highlights
 */
function clearLineageHighlights(): void {
    clearLineageHighlightsFeature({
        mainGroup,
        isDarkTheme: state.isDarkTheme,
        detailsPanel,
        edgeColors: {
            default: EDGE_COLORS.default,
            defaultLight: EDGE_COLORS.defaultLight,
            focus: EDGE_COLORS.focus,
            columnLineage: EDGE_COLORS.columnLineage,
        },
    });
}

// ============================================================
// FEATURE: Keyboard Shortcuts Help
// ============================================================

export function getKeyboardShortcuts(): Array<{ key: string; description: string }> {
    return getKeyboardShortcutsFeature();
}

// ============================================================
// FEATURE: Editor to Flow Sync (highlight node at cursor line)
// ============================================================

let highlightedLineNodeId: string | null = null;

export function highlightNodeAtLine(line: number): void {
    // Clear previous highlight
    if (highlightedLineNodeId) {
        const prevGroup = document.querySelector(`g[data-id="${highlightedLineNodeId}"]`);
        if (prevGroup) {
            prevGroup.classList.remove('cursor-highlighted');
            const rect = prevGroup.querySelector('.node-rect') as SVGRectElement;
            if (rect) {
                const node = currentNodes.find(n => n.id === highlightedLineNodeId);
                if (node) {
                    rect.setAttribute('stroke', 'transparent');
                    rect.setAttribute('stroke-width', '0');
                }
            }
        }
        highlightedLineNodeId = null;
    }

    // Find node that contains this line
    const node = findNodeAtLine(line);
    if (!node) {return;}

    // Highlight the node
    const group = document.querySelector(`g[data-id="${node.id}"]`);
    if (group) {
        group.classList.add('cursor-highlighted');
        const rect = group.querySelector('.node-rect') as SVGRectElement;
        if (rect) {
            rect.setAttribute('stroke', EDGE_COLORS.highlight);
            rect.setAttribute('stroke-width', '3');
        }
        highlightedLineNodeId = node.id;

        // Optionally zoom to the node
        // zoomToNode(node);
    }
}

function findNodeAtLine(line: number): FlowNode | null {
    // Find node whose line range contains the cursor line
    for (const node of currentNodes) {
        if (node.startLine && node.endLine) {
            if (line >= node.startLine && line <= node.endLine) {
                return node;
            }
        } else if (node.startLine && line === node.startLine) {
            return node;
        }
    }

    // Fallback: find closest node by start line
    let closest: FlowNode | null = null;
    let minDist = Infinity;

    for (const node of currentNodes) {
        if (node.startLine) {
            const dist = Math.abs(node.startLine - line);
            if (dist < minDist) {
                minDist = dist;
                closest = node;
            }
        }
    }

    return minDist <= 5 ? closest : null;
}

// ============================================================
// FEATURE: Join Type Venn Diagrams
// ============================================================

export function getJoinVennDiagram(joinType: string, isDark: boolean = true): string {
    return getJoinVennDiagramFeature(joinType, isDark);
}

export function getJoinColor(joinType: string): string {
    return getJoinColorFeature(joinType);
}

export function getJoinDescription(joinType: string): string {
    return getJoinDescriptionFeature(joinType);
}
