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
    NODE_STROKE_COLORS,
    GLOW_COLORS,
    STATUS_COLORS,
    CLOSE_BUTTON_COLORS,
    COMPLEXITY_COLORS,
    HINT_COLORS,
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
    updateHintsSummaryBadge,
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
import {
    PANEL_LAYOUT_DEFAULTS,
    applyHintsPanelViewportBounds as applyHintsPanelBounds,
    applyPanelBottomOffsets,
    parsePixelValue as parsePanelPixelValue,
} from './ui/panelLayout';
import { initCanvas, updateCanvasTheme } from './rendering/canvasSetup';
import {
    layoutSubflowNodes as layoutSubflowNodesFeature,
    layoutSubflowNodesVertical as layoutSubflowNodesVerticalFeature,
    renderCloudSubflow as renderCloudSubflowFeature,
    renderSubflow as renderSubflowFeature,
} from './rendering/cloudRenderer';
import { getNodeAccentColor, NODE_SURFACE, getScrollbarColors, getComponentUiColors } from './constants/colors';
import type { ColorblindMode } from '../shared/theme';
import type { GridStyle } from '../shared/themeTokens';
import { MONO_FONT_STACK } from '../shared/themeTokens';
import {
    getViewportBounds,
    getVisibleElements,
    shouldVirtualize,
    throttle,
    VirtualizationResult
} from './virtualization';
import {
    createClusters,
    getClusterColor,
    getClusterForNode,
    shouldCluster,
    toggleCluster,
    NodeCluster,
} from './clustering';
import { layoutGraphHorizontal, layoutGraphCompact, layoutGraphForce, layoutGraphRadial } from './parser/forceLayout';
import { layoutGraph } from './parser/layout';
import { escapeRegex, ICONS, Z_INDEX } from '../shared';
import { getHintBadgeState, getTopHints, sortHintsByImpact } from './hintsHierarchy';
import { getWarningIndicatorState } from './warningIndicator';
import { COLUMN_LINEAGE_BANNER_TEXT, shouldEnableColumnLineage, shouldShowTraceColumnsAction } from './columnLineageUx';
import { extractSqlSnippet } from './sqlSnippet';
import { shouldShowMinimap } from './minimapVisibility';
import {
    getCycledNode,
    getKeyboardNavigableNodes,
    getSiblingCycleTarget,
} from './navigation/keyboardNavigation';
import {
    copyMermaidToClipboard as copyMermaidToClipboardFeature,
    copyToClipboard as copyToClipboardFeature,
    exportToMermaid as exportToMermaidFeature,
    exportToPng as exportToPngFeature,
    exportToSvg as exportToSvgFeature,
} from './features/export';
import { toggleFullscreen as toggleFullscreenFeature } from './features/fullscreen';
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
import type { RendererContext } from './types/rendererContext';

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
let cloudElements: Map<string, { cloud: SVGRectElement; title: SVGTextElement; arrow: SVGPathElement; subflowGroup: SVGGElement; nestedSvg?: SVGSVGElement; closeButton?: SVGGElement }> = new Map();
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

    // Create details panel
    detailsPanel = document.createElement('div');
    detailsPanel.className = 'details-panel';
    detailsPanel.style.cssText = `
        position: absolute;
        right: 12px;
        top: 50%;
        width: 260px;
        max-height: 50vh;
        background: ${UI_COLORS.backgroundPanelSolid};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        padding: 12px;
        box-sizing: border-box;
        overflow-y: auto;
        transform: translate(calc(100% + 12px), -50%);
        transition: transform 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: ${Z_INDEX.panelTop};
        box-shadow: ${UI_COLORS.shadowMedium};
    `;
    container.appendChild(detailsPanel);

    // Create breadcrumb panel
    breadcrumbPanel = document.createElement('div');
    breadcrumbPanel.className = 'breadcrumb-panel';
    breadcrumbPanel.style.cssText = `
        position: absolute;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        padding: 8px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: ${UI_COLORS.textSubtle};
        z-index: ${Z_INDEX.panel};
        display: none;
        max-width: 80%;
        overflow-x: auto;
        white-space: nowrap;
    `;
    container.appendChild(breadcrumbPanel);

    // Column lineage active banner
    columnLineageBanner = document.createElement('div');
    columnLineageBanner.id = 'column-lineage-banner';
    columnLineageBanner.style.cssText = `
        position: absolute;
        top: 62px;
        left: 16px;
        right: auto;
        z-index: ${Z_INDEX.floatingPanel};
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: min(70vw, 520px);
        pointer-events: none;
    `;
    columnLineageBanner.innerHTML = `
        <span style="pointer-events: none; display: inline-flex; align-items: center; gap: 6px;">
            <span style="display: inline-flex; width: 14px; height: 14px;">${ICONS.link}</span>
            <span>${COLUMN_LINEAGE_BANNER_TEXT}</span>
        </span>
        <button id="column-lineage-banner-close" style="
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            padding: 0 4px;
            pointer-events: auto;
        " aria-label="Close column lineage banner">×</button>
    `;
    container.appendChild(columnLineageBanner);
    const bannerClose = columnLineageBanner.querySelector('#column-lineage-banner-close');
    bannerClose?.addEventListener('click', () => toggleColumnFlows(false));

    // Create stats panel
    statsPanel = document.createElement('div');
    statsPanel.className = 'stats-panel';
    statsPanel.style.cssText = `
        position: absolute;
        left: 16px;
        bottom: 16px;
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        width: 300px;
        padding: 12px 16px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textMuted};
        z-index: ${Z_INDEX.toolbar};
    `;
    container.appendChild(statsPanel);

    // Create hints panel
    hintsPanel = document.createElement('div');
    hintsPanel.className = 'hints-panel';
    hintsPanel.style.cssText = `
        position: absolute;
        right: 16px;
        bottom: 16px;
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        width: 350px;
        padding: 12px 16px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textMuted};
        z-index: ${Z_INDEX.toolbar};
        max-height: 200px;
        overflow-y: auto;
        opacity: 0;
        visibility: hidden;
        transform: translateY(8px);
        transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
    `;
    container.appendChild(hintsPanel);
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

    // Create SQL preview panel
    sqlPreviewPanel = document.createElement('div');
    sqlPreviewPanel.className = 'sql-preview-panel';
    sqlPreviewPanel.style.cssText = `
        position: absolute;
        left: 0;
        bottom: 0;
        width: 100%;
        max-height: 200px;
        background: ${UI_COLORS.backgroundPanelSolid};
        border-top: 1px solid ${UI_COLORS.border};
        padding: 12px 16px;
        box-sizing: border-box;
        font-family: ${MONO_FONT_STACK};
        font-size: 12px;
        color: ${UI_COLORS.textBright};
        z-index: ${Z_INDEX.panel};
        opacity: 0;
        visibility: hidden;
        transform: translateY(16px);
        transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
        overflow-y: auto;
    `;
    container.appendChild(sqlPreviewPanel);

    // Create minimap for large queries
    const minimapContainer = document.createElement('div');
    minimapContainer.id = 'minimap-container';
    minimapContainer.style.cssText = `
        position: absolute;
        right: 16px;
        top: 50%;
        transform: translateY(-50%);
        width: 150px;
        height: 100px;
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        overflow: hidden;
        z-index: ${Z_INDEX.toolbar};
        display: none;
    `;

    const minimapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    minimapSvg.id = 'minimap-svg';
    minimapSvg.setAttribute('width', '100%');
    minimapSvg.setAttribute('height', '100%');
    minimapSvg.style.background = 'transparent';
    minimapContainer.appendChild(minimapSvg);

    // Viewport indicator
    const viewportRect = document.createElement('div');
    viewportRect.id = 'minimap-viewport';
    viewportRect.style.cssText = `
        position: absolute;
        border: 2px solid ${UI_COLORS.focusBorder};
        background: ${UI_COLORS.focusBackground};
        pointer-events: none;
    `;
    minimapContainer.appendChild(viewportRect);
    container.appendChild(minimapContainer);

    // Minimap drag-to-pan: click or drag inside minimap to move the main viewport
    setupMinimapDrag(minimapContainer);

    // Create tooltip element
    tooltipElement = document.createElement('div');
    tooltipElement.id = 'node-tooltip';
    tooltipElement.style.cssText = `
        position: fixed;
        background: ${UI_COLORS.backgroundPanelSolid};
        border: 1px solid ${UI_COLORS.borderMedium};
        border-radius: 8px;
        padding: 10px 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textBright};
        z-index: ${Z_INDEX.dropdown};
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
        max-width: 300px;
        box-shadow: ${UI_COLORS.shadowLight};
    `;
    container.appendChild(tooltipElement);

    // Create context menu element
    contextMenuElement = document.createElement('div');
    contextMenuElement.id = 'node-context-menu';
    contextMenuElement.style.cssText = `
        position: fixed;
        background: ${UI_COLORS.backgroundPanelSolid};
        border: 1px solid ${UI_COLORS.borderMedium};
        border-radius: 8px;
        padding: 4px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textBright};
        z-index: ${Z_INDEX.commandBar};
        display: none;
        min-width: 180px;
        box-shadow: 0 4px 12px ${UI_COLORS.shadowDark};
    `;
    container.appendChild(contextMenuElement);

    // Create loading overlay for layout switching
    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: ${Z_INDEX.panel};
        pointer-events: none;
    `;
    loadingOverlay.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 20px 32px;
            background: ${UI_COLORS.backgroundPanelSolid};
            border: 1px solid ${UI_COLORS.border};
            border-radius: 12px;
            box-shadow: ${UI_COLORS.shadowMedium};
        ">
            <div class="loading-spinner" style="
                width: 24px;
                height: 24px;
                border: 3px solid rgba(99, 102, 241, 0.2);
                border-top-color: #6366f1;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            "></div>
            <span style="color: ${UI_COLORS.textMuted}; font-size: 12px;">Calculating layout...</span>
        </div>
    `;

    // Add spinner animation
    spinnerStyleElement?.remove();
    spinnerStyleElement = document.createElement('style');
    spinnerStyleElement.textContent = `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(spinnerStyleElement);
    container.appendChild(loadingOverlay);

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
    if (!svg || !mainGroup || renderNodes.length === 0) {
        return;
    }

    const rect = svg.getBoundingClientRect();
    const bounds = getViewportBounds(
        rect.width,
        rect.height,
        state.scale,
        state.offsetX,
        state.offsetY
    );

    const result = getVisibleElements(renderNodes, renderEdges, bounds);
    lastVirtualizationResult = result;

    // Get the nodes and edges groups
    const nodesGroup = mainGroup.querySelector('.nodes') as SVGGElement;
    const edgesGroup = mainGroup.querySelector('.edges') as SVGGElement;

    if (!nodesGroup || !edgesGroup) {
        return;
    }

    // Find nodes that need to be added (visible but not rendered)
    const nodesToAdd = result.visibleNodes.filter(n => !renderedNodeIds.has(n.id));

    // Find nodes that need to be removed (rendered but no longer visible)
    const nodeIdsToRemove = [...renderedNodeIds].filter(id => !result.visibleNodeIds.has(id));

    // Remove nodes that are no longer visible
    for (const nodeId of nodeIdsToRemove) {
        const nodeElement = nodesGroup.querySelector(`[data-id="${nodeId}"]`);
        if (nodeElement) {
            nodeElement.remove();
        }
        renderedNodeIds.delete(nodeId);
    }

    // Add newly visible nodes
    for (const node of nodesToAdd) {
        renderNode(node, nodesGroup);
        renderedNodeIds.add(node.id);
    }

    // Update edges - remove edges connected to removed nodes, add edges for new nodes
    // For simplicity, we'll re-render all visible edges if there were changes
    if (nodesToAdd.length > 0 || nodeIdsToRemove.length > 0) {
        // Clear and re-render edges
        edgesGroup.innerHTML = '';
        for (const edge of result.visibleEdges) {
            renderEdge(edge, edgesGroup);
        }
    }

    // Update off-screen indicators
    updateOffscreenIndicators(result);
}

/**
 * Update off-screen node count indicators
 */
function updateOffscreenIndicators(result: VirtualizationResult): void {
    if (!svg) {
        return;
    }

    // Remove existing indicator
    if (offscreenIndicator) {
        offscreenIndicator.remove();
    }

    const { offscreenCounts, totalNodes } = result;
    const hasOffscreen = offscreenCounts.top + offscreenCounts.bottom +
                         offscreenCounts.left + offscreenCounts.right > 0;

    if (!hasOffscreen) {
        return;
    }

    // Create indicator group (positioned in screen space, not affected by transform)
    offscreenIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    offscreenIndicator.setAttribute('class', 'offscreen-indicators');
    offscreenIndicator.style.pointerEvents = 'none';

    const rect = svg.getBoundingClientRect();
    const indicatorStyle = `
        fill: ${UI_COLORS.backgroundDark};
        stroke: ${UI_COLORS.border};
        stroke-width: 1;
    `;
    const textStyle = `
        fill: ${UI_COLORS.textDim};
        font-size: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        text-anchor: middle;
        dominant-baseline: middle;
    `;

    // Top indicator
    if (offscreenCounts.top > 0) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${rect.width / 2}, 20)`);
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', '-30');
        bg.setAttribute('y', '-10');
        bg.setAttribute('width', '60');
        bg.setAttribute('height', '20');
        bg.setAttribute('rx', '10');
        bg.setAttribute('style', indicatorStyle);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('style', textStyle);
        text.textContent = `↑ ${offscreenCounts.top}`;
        g.appendChild(bg);
        g.appendChild(text);
        offscreenIndicator.appendChild(g);
    }

    // Bottom indicator
    if (offscreenCounts.bottom > 0) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${rect.width / 2}, ${rect.height - 20})`);
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', '-30');
        bg.setAttribute('y', '-10');
        bg.setAttribute('width', '60');
        bg.setAttribute('height', '20');
        bg.setAttribute('rx', '10');
        bg.setAttribute('style', indicatorStyle);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('style', textStyle);
        text.textContent = `↓ ${offscreenCounts.bottom}`;
        g.appendChild(bg);
        g.appendChild(text);
        offscreenIndicator.appendChild(g);
    }

    // Left indicator
    if (offscreenCounts.left > 0) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(20, ${rect.height / 2})`);
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', '-20');
        bg.setAttribute('y', '-10');
        bg.setAttribute('width', '40');
        bg.setAttribute('height', '20');
        bg.setAttribute('rx', '10');
        bg.setAttribute('style', indicatorStyle);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('style', textStyle);
        text.textContent = `← ${offscreenCounts.left}`;
        g.appendChild(bg);
        g.appendChild(text);
        offscreenIndicator.appendChild(g);
    }

    // Right indicator
    if (offscreenCounts.right > 0) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${rect.width - 20}, ${rect.height / 2})`);
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', '-20');
        bg.setAttribute('y', '-10');
        bg.setAttribute('width', '40');
        bg.setAttribute('height', '20');
        bg.setAttribute('rx', '10');
        bg.setAttribute('style', indicatorStyle);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('style', textStyle);
        text.textContent = `→ ${offscreenCounts.right}`;
        g.appendChild(bg);
        g.appendChild(text);
        offscreenIndicator.appendChild(g);
    }

    // Add to SVG (outside mainGroup so it's not affected by pan/zoom)
    svg.appendChild(offscreenIndicator);
}

/**
 * Enable or disable virtualization
 */
export function setVirtualizationEnabled(enabled: boolean): void {
    virtualizationEnabled = enabled;
    // Re-render if needed
    if (currentNodes.length > 0) {
        const nodesGroup = mainGroup?.querySelector('.nodes') as SVGGElement;
        const edgesGroup = mainGroup?.querySelector('.edges') as SVGGElement;
        if (nodesGroup && edgesGroup) {
            // If disabling virtualization, render all nodes
            if (!enabled) {
                for (const node of currentNodes) {
                    if (!renderedNodeIds.has(node.id)) {
                        renderNode(node, nodesGroup);
                        renderedNodeIds.add(node.id);
                    }
                }
                // Re-render all edges
                edgesGroup.innerHTML = '';
                for (const edge of currentEdges) {
                    renderEdge(edge, edgesGroup);
                }
                // Remove indicators
                if (offscreenIndicator) {
                    offscreenIndicator.remove();
                    offscreenIndicator = null;
                }
            } else {
                // If enabling, trigger update
                updateVisibleNodes();
            }
        }
    }
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
    const cloudData = cloudElements.get(node.id);
    if (!cloudData || !node.children || node.children.length === 0) {
        return;
    }

    const isExpanded = !node.collapsible || (node as any).expanded !== false;
    if (!isExpanded) {
        return;
    }

    const nodeWidth = 180;
    const nodeHeight = 60;
    const cloudGap = 30;
    const cloudPadding = 15;

    // Get or calculate cloud dimensions
    const childEdges = node.childEdges || [];
    const layoutSize = layoutSubflowNodesVertical(node.children, childEdges);
    const cloudWidth = layoutSize.width + cloudPadding * 2;
    const cloudHeight = layoutSize.height + cloudPadding * 2 + 30;

    // Get custom offset or use default (to the left)
    // If no offset exists, initialize it with default position
    const offset = ensureCloudOffset(node.id, cloudWidth, cloudHeight, nodeHeight, cloudGap);
    const cloudX = node.x + offset.offsetX;
    const cloudY = node.y + offset.offsetY;

    // Update cloud container position
    cloudData.cloud.setAttribute('x', String(cloudX));
    cloudData.cloud.setAttribute('y', String(cloudY));

    // Update cloud title position
    cloudData.title.setAttribute('x', String(cloudX + cloudWidth / 2));
    cloudData.title.setAttribute('y', String(cloudY + 20));

    // Determine the best connection points based on relative positions
    const cloudCenterX = cloudX + cloudWidth / 2;
    const cloudCenterY = cloudY + cloudHeight / 2;
    const nodeCenterX = node.x + nodeWidth / 2;
    const nodeCenterY = node.y + nodeHeight / 2;

    // Calculate angle to determine best connection direction
    const dx = nodeCenterX - cloudCenterX;
    const dy = nodeCenterY - cloudCenterY;
    const angle = Math.atan2(dy, dx);

    let arrowStartX: number;
    let arrowStartY: number;
    let arrowEndX: number;
    let arrowEndY: number;
    let pathD: string;

    // Determine connection points based on angle (in radians)
    // -π/4 to π/4: node is to the right
    // π/4 to 3π/4: node is below
    // 3π/4 to π or -π to -3π/4: node is to the left
    // -3π/4 to -π/4: node is above

    if (angle > -Math.PI/4 && angle <= Math.PI/4) {
        // Node is to the right of cloud
        arrowStartX = cloudX + cloudWidth;
        arrowStartY = cloudCenterY;
        arrowEndX = node.x;
        arrowEndY = nodeCenterY;
        const midX = (arrowStartX + arrowEndX) / 2;
        pathD = `M ${arrowStartX} ${arrowStartY} C ${midX} ${arrowStartY}, ${midX} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`;
    } else if (angle > Math.PI/4 && angle <= 3*Math.PI/4) {
        // Node is below cloud
        arrowStartX = cloudCenterX;
        arrowStartY = cloudY + cloudHeight;
        arrowEndX = nodeCenterX;
        arrowEndY = node.y;
        const midY = (arrowStartY + arrowEndY) / 2;
        pathD = `M ${arrowStartX} ${arrowStartY} C ${arrowStartX} ${midY}, ${arrowEndX} ${midY}, ${arrowEndX} ${arrowEndY}`;
    } else if (angle > -3*Math.PI/4 && angle <= -Math.PI/4) {
        // Node is above cloud
        arrowStartX = cloudCenterX;
        arrowStartY = cloudY;
        arrowEndX = nodeCenterX;
        arrowEndY = node.y + nodeHeight;
        const midY = (arrowStartY + arrowEndY) / 2;
        pathD = `M ${arrowStartX} ${arrowStartY} C ${arrowStartX} ${midY}, ${arrowEndX} ${midY}, ${arrowEndX} ${arrowEndY}`;
    } else {
        // Node is to the left of cloud
        arrowStartX = cloudX;
        arrowStartY = cloudCenterY;
        arrowEndX = node.x + nodeWidth;
        arrowEndY = nodeCenterY;
        const midX = (arrowStartX + arrowEndX) / 2;
        pathD = `M ${arrowStartX} ${arrowStartY} C ${midX} ${arrowStartY}, ${midX} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`;
    }

    cloudData.arrow.setAttribute('d', pathD);

    // Update nested SVG position (the subflowGroup inside uses internal pan/zoom transform)
    if (cloudData.nestedSvg) {
        cloudData.nestedSvg.setAttribute('x', String(cloudX + cloudPadding));
        cloudData.nestedSvg.setAttribute('y', String(cloudY + 30));
    } else {
        // Fallback for legacy: update subflow group transform directly
        cloudData.subflowGroup.setAttribute('transform', `translate(${cloudX + cloudPadding}, ${cloudY + 30})`);
    }

    // Update close button position
    if (cloudData.closeButton) {
        const buttonSize = 20;
        const buttonPadding = 8;
        const buttonX = cloudX + cloudWidth - buttonSize - buttonPadding;
        const buttonY = cloudY + buttonPadding;
        cloudData.closeButton.setAttribute('transform', `translate(${buttonX}, ${buttonY})`);
    }
}

/**
 * Update edges connected to a node when it's dragged.
 * Recalculates edge paths to maintain proper connections between nodes.
 */
function updateNodeEdges(node: FlowNode): void {
    if (!mainGroup) { return; }
    
    // Find all edges connected to this node (as source or target)
    const edges = mainGroup.querySelectorAll(`.edge[data-source="${node.id}"], .edge[data-target="${node.id}"]`);
    
    edges.forEach((edgeEl) => {
        const edgePath = edgeEl as SVGPathElement;
        const sourceId = edgePath.getAttribute('data-source');
        const targetId = edgePath.getAttribute('data-target');
        
        if (!sourceId || !targetId) { return; }
        
        const sourceNode = currentNodes.find(n => n.id === sourceId);
        const targetNode = currentNodes.find(n => n.id === targetId);
        
        if (!sourceNode || !targetNode) { return; }
        
        // Recalculate edge path using layout-aware function
        edgePath.setAttribute('d', calculateEdgePath(sourceNode, targetNode, state.layoutType || 'vertical'));
    });
}

// Pre-calculate dimensions for expandable nodes (CTE/subquery) before rendering edges
// With floating cloud design, CTE/subquery nodes stay fixed size - cloud is separate
function preCalculateExpandableDimensions(nodes: FlowNode[]): void {
    for (const node of nodes) {
        if (node.type === 'cte' && node.children && node.children.length > 0) {
            // CTE nodes stay fixed size - cloud is rendered separately
            node.width = 180;
            node.height = 60;
        } else if (node.type === 'subquery' && node.children && node.children.length > 0) {
            // Subquery nodes also use fixed size with floating cloud
            node.width = 180;
            node.height = 60;
        }
    }
}

function applyClustering(nodes: FlowNode[], edges: FlowEdge[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
    if (!shouldCluster(nodes.length)) {
        currentClusters = [];
        clusterNodeMap.clear();
        return { nodes, edges };
    }

    const baseClusters = createClusters(nodes);
    if (baseClusters.length === 0) {
        currentClusters = [];
        clusterNodeMap.clear();
        return { nodes, edges };
    }

    const previousById = new Map(currentClusters.map(cluster => [cluster.id, cluster]));
    currentClusters = baseClusters.map(cluster => {
        const previous = previousById.get(cluster.id);
        return previous ? { ...cluster, expanded: previous.expanded } : cluster;
    });
    clusterNodeMap = new Map(currentClusters.map(cluster => [cluster.id, cluster]));

    const collapsedClusters = currentClusters.filter(cluster => !cluster.expanded);
    if (collapsedClusters.length === 0) {
        return { nodes, edges };
    }

    const nodeToCluster = new Map<string, NodeCluster>();
    for (const cluster of collapsedClusters) {
        for (const nodeId of cluster.nodeIds) {
            nodeToCluster.set(nodeId, cluster);
        }
    }

    const visibleNodes = nodes.filter(node => !nodeToCluster.has(node.id));
    const clusterNodes: FlowNode[] = collapsedClusters.map(cluster => ({
        id: cluster.id,
        type: 'cluster',
        label: cluster.label,
        description: 'Click to expand',
        x: cluster.x,
        y: cluster.y,
        width: cluster.width,
        height: cluster.height,
    }));

    const edgeMap = new Map<string, FlowEdge>();
    for (const edge of edges) {
        const sourceCluster = nodeToCluster.get(edge.source);
        const targetCluster = nodeToCluster.get(edge.target);
        const source = sourceCluster ? sourceCluster.id : edge.source;
        const target = targetCluster ? targetCluster.id : edge.target;
        if (source === target) {
            continue;
        }
        const key = `${source}->${target}`;
        if (!edgeMap.has(key)) {
            edgeMap.set(key, {
                ...edge,
                id: `${edge.id}:${key}`,
                source,
                target,
            });
        }
    }

    return {
        nodes: [...visibleNodes, ...clusterNodes],
        edges: [...edgeMap.values()],
    };
}

export function render(result: ParseResult): void {
    if (!mainGroup) { return; }

    // Clear any selected node when rendering new query (fixes details panel staying open on tab switch)
    selectNode(null);
    clearFocusMode();
    state.focusModeEnabled = false;
    state.selectedColumn = null;
    selectedColumnLineage = null;
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
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'node');
    group.setAttribute('data-id', node.id);
    group.setAttribute('data-label', node.label.toLowerCase());
    group.setAttribute('data-node-type', node.type);
    if (node.accessMode) {
        group.setAttribute('data-access-mode', node.accessMode);
    }
    group.style.cursor = 'pointer';

    // Accessibility: make nodes focusable and provide context for screen readers
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    const nodeDescription = node.description ? `. ${node.description}` : '';
    group.setAttribute('aria-label', `${node.type} node: ${node.label}${nodeDescription}`);

    if (node.type === 'cluster') {
        renderClusterNode(node, group);
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            const cluster = clusterNodeMap.get(node.id);
            if (!cluster) {
                return;
            }
            currentClusters = toggleCluster(cluster, currentClusters);
            const currentResult = {
                nodes: currentNodes,
                edges: currentEdges,
                stats: currentStats || ({} as QueryStats),
                hints: currentHints,
                sql: currentSql,
                columnLineage: currentColumnLineage,
                columnFlows: currentColumnFlows,
                tableUsage: currentTableUsage
            };
            render(currentResult as ParseResult);
        });
        group.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                group.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
        });
        parent.appendChild(group);
        return;
    }

    // Check if this is a container node (CTE or Subquery with children)
    const isContainer = (node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0;
    const isWindowNode = node.type === 'window' && node.windowDetails;
    const isAggregateNode = node.type === 'aggregate' && node.aggregateDetails && node.label === 'AGGREGATE';
    const isCaseNode = node.type === 'case' && node.caseDetails;
    const isJoinNode = node.type === 'join';

    if (isContainer) {
        renderContainerNode(node, group);
    } else if (isWindowNode) {
        renderWindowNode(node, group);
    } else if (isAggregateNode) {
        renderAggregateNode(node, group);
    } else if (isCaseNode) {
        renderCaseNode(node, group);
    } else if (isJoinNode) {
        renderJoinNode(node, group);
    } else {
        renderStandardNode(node, group);
    }

    // Hover effect with tooltip — accent-strip design uses subtle surface highlight
    const rect = group.querySelector('.node-rect') as SVGRectElement;
    if (rect) {
        const isDark = state.isDarkTheme;
        const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
        const hoverFill = isDark ? '#222222' : '#F1F5F9';

        group.addEventListener('mouseenter', (e) => {
            rect.setAttribute('fill', hoverFill);
            highlightConnectedEdges(node.id, true);
            showTooltip(node, e as MouseEvent);
        });

        group.addEventListener('mousemove', (e) => {
            updateTooltipPosition(e as MouseEvent);
        });

        group.addEventListener('mouseleave', () => {
            rect.setAttribute('fill', surface.fill);
            if (state.selectedNodeId !== node.id) {
                highlightConnectedEdges(node.id, false);
            }
            hideTooltip();
        });
    }

    /**
     * Add drag handler for CTE/subquery nodes - makes all CTE/subquery nodes draggable.
     * When dragging a node, both the node and its cloud move together, maintaining their relative offset.
     * Connected edges are updated in real-time during the drag.
     */
    if (node.type === 'cte' || node.type === 'subquery') {
        group.style.cursor = 'move';
        group.addEventListener('mousedown', (e) => {
            // Don't start drag if clicking on collapse button
            const target = e.target as Element;
            if (target.closest('.collapse-button')) {
                return;
            }
            // Don't start drag if clicking on cloud container (cloud has its own drag handler)
            if (target.closest('.cloud-container')) {
                return;
            }
            e.stopPropagation();
            const rect = svg!.getBoundingClientRect();
            state.isDraggingNode = true;
            state.draggingNodeId = node.id;
            
            // Store initial node position
            state.dragNodeStartX = node.x;
            state.dragNodeStartY = node.y;
            
            // Store initial mouse position (in SVG coordinates, accounting for pan/zoom)
            state.dragMouseStartX = (e.clientX - rect.left - state.offsetX) / state.scale;
            state.dragMouseStartY = (e.clientY - rect.top - state.offsetY) / state.scale;
            
            // Add visual feedback during drag
            group.style.opacity = '0.8';
        });
    }

    // Click handler - toggle expand for CTE/subquery, select for others
    let dragStartX = 0;
    let dragStartY = 0;
    let hasDragged = false;
    
    group.addEventListener('mousedown', (e) => {
        const rect = svg!.getBoundingClientRect();
        dragStartX = (e.clientX - rect.left - state.offsetX) / state.scale;
        dragStartY = (e.clientY - rect.top - state.offsetY) / state.scale;
        hasDragged = false;
    });
    
    group.addEventListener('mousemove', (e) => {
        if (state.isDraggingNode || state.isDraggingCloud) {
            const rect = svg!.getBoundingClientRect();
            const currentX = (e.clientX - rect.left - state.offsetX) / state.scale;
            const currentY = (e.clientY - rect.top - state.offsetY) / state.scale;
            const distance = Math.sqrt(Math.pow(currentX - dragStartX, 2) + Math.pow(currentY - dragStartY, 2));
            if (distance > 5) { // 5px threshold
                hasDragged = true;
            }
        }
    });
    
    group.addEventListener('click', (e) => {
        e.stopPropagation();

        // Don't toggle if we just finished dragging (moved more than 5px)
        if (hasDragged || state.isDraggingNode || state.isDraggingCloud) {
            hasDragged = false;
            return;
        }

        // Single click selects the node
        // Ctrl/Cmd+Click navigates to SQL, regular click just selects (for keyboard nav)
        const skipNav = !(e.ctrlKey || e.metaKey);
        selectNode(node.id, { skipNavigation: skipNav });
        hideTooltip();

        // Focus SVG to ensure keyboard events work
        svg?.focus();
    });

    // Accessibility: keyboard navigation for nodes
    // Only handle node-specific keys; let global shortcuts (C, E, S, etc.) bubble up
    group.addEventListener('keydown', (e) => {
        const key = e.key;

        // Enter or Space to select/activate the node
        if (key === 'Enter' || key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            selectNode(node.id, { skipNavigation: true });
            hideTooltip();
            return;
        }

        if (key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            navigateToAdjacentNode(node, e.shiftKey ? 'prev' : 'next');
            return;
        }

        // Arrow keys to navigate between nodes (only when not using modifiers)
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            if (key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                navigateToConnectedNode('upstream', node.id);
                return;
            }
            if (key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                navigateToConnectedNode('downstream', node.id);
                return;
            }
            if (key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                navigateToSiblingNode(node, 'next');
                return;
            }
            if (key === 'ArrowLeft') {
                e.preventDefault();
                e.stopPropagation();
                navigateToSiblingNode(node, 'prev');
                return;
            }
        }

        // Escape to deselect and return focus to SVG
        if (key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            selectNode(null);
            svg?.focus();
            return;
        }

        // For all other keys (including global shortcuts like C, E, S, T, etc.),
        // do NOT prevent default or stop propagation - let them bubble to document handler
    });

    // Focus visual indicator
    group.addEventListener('focus', () => {
        const rect = group.querySelector('.node-rect') as SVGRectElement;
        if (rect) {
            const focusRingColor = state.isDarkTheme ? UI_COLORS.nodeFocusRingDark : UI_COLORS.nodeFocusRingLight;
            group.setAttribute('data-keyboard-focus', 'true');
            rect.setAttribute('stroke', focusRingColor);
            rect.setAttribute('stroke-width', '4');
            rect.setAttribute('filter', 'url(#glow)');
        }
        announceFocusedNode(node);
    });

    group.addEventListener('blur', () => {
        const rect = group.querySelector('.node-rect') as SVGRectElement;
        if (!rect) { return; }
        group.removeAttribute('data-keyboard-focus');
        if (state.selectedNodeId === node.id) {
            rect.setAttribute('stroke', UI_COLORS.white);
            rect.setAttribute('stroke-width', '3');
            rect.setAttribute('filter', 'url(#glow)');
            return;
        }
        rect.removeAttribute('stroke');
        rect.removeAttribute('stroke-width');
        rect.setAttribute('filter', 'url(#shadow)');
    });

    // Double click to zoom to node or open cloud
    group.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        // For CTE/subquery nodes, double-click opens the cloud (use X button to close)
        if ((node.type === 'cte' || node.type === 'subquery') && node.collapsible) {
            if (!node.expanded) {
                // Initialize cloud view state if not exists
                if (!cloudViewStates.has(node.id)) {
                    cloudViewStates.set(node.id, {
                        scale: 1,
                        offsetX: 0,
                        offsetY: 0,
                        isDragging: false,
                        dragStartX: 0,
                        dragStartY: 0
                    });
                }
                node.expanded = true;
                // Re-render to show cloud
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
                // Preserve current layout type
                const wasHorizontal = state.layoutType === 'horizontal';
                render(result);
                // Re-apply horizontal layout if it was active
                if (wasHorizontal) {
                    // Reset to vertical first (render uses vertical positions)
                    state.layoutType = 'vertical';
                    // Then toggle to horizontal
                    toggleLayout();
                }
            }
        } else {
            zoomToNode(node);
            pulseNode(node.id);
        }
        // Focus SVG to ensure keyboard events work
        svg?.focus();
    });

    // Right-click context menu
    group.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(node, e);
        // Focus SVG to ensure keyboard events work
        svg?.focus();
    });

    // Add collapse button for CTEs and subqueries with children
    if ((node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0) {
        addCollapseButton(node, group);
    }

    parent.appendChild(group);
}

function renderClusterNode(node: FlowNode, group: SVGGElement): void {
    const cluster = clusterNodeMap.get(node.id);
    const clusterColor = cluster ? getClusterColor(cluster.type) : getNodeAccentColor('cluster', state.isDarkTheme);
    const surface = state.isDarkTheme ? NODE_SURFACE.dark : NODE_SURFACE.light;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'node-rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', clusterColor);
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('stroke-dasharray', '6,3');
    rect.setAttribute('filter', 'url(#shadow)');
    group.appendChild(rect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + node.width / 2));
    label.setAttribute('y', String(node.y + node.height / 2));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('fill', surface.text);
    label.setAttribute('font-size', '12');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = node.label;
    group.appendChild(label);

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + node.width - 16));
    icon.setAttribute('y', String(node.y + 16));
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('dominant-baseline', 'middle');
    icon.setAttribute('fill', clusterColor);
    icon.setAttribute('font-size', '14');
    icon.setAttribute('font-weight', '700');
    icon.textContent = '+';
    group.appendChild(icon);
}

function renderStandardNode(node: FlowNode, group: SVGGElement): void {
    // Determine visual style based on table category
    const isTable = node.type === 'table';
    const tableCategory = node.tableCategory || 'physical';
    const isDark = state.isDarkTheme;
    const accentPosition = ((window as any).nodeAccentPosition || 'left') as string;

    // New accent-strip design: neutral fill + colored accent strip
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const accentColor = getNodeAccentColor(node.type, isDark);
    const textColor = surface.text;
    const textColorMuted = surface.textMuted;
    const textColorDim = isDark ? '#64748B' : '#94A3B8';

    // Background rect — neutral fill
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');

    // Apply different border styles based on table category and access mode
    if (isTable) {
        if (node.accessMode === 'write') {
            rect.setAttribute('stroke', NODE_STROKE_COLORS.write);
            rect.setAttribute('stroke-width', '2');
        } else if (node.accessMode === 'read') {
            rect.setAttribute('stroke', NODE_STROKE_COLORS.read);
            rect.setAttribute('stroke-width', '2');
        } else if (tableCategory === 'cte_reference') {
            rect.setAttribute('stroke', NODE_STROKE_COLORS.cte);
            rect.setAttribute('stroke-width', '2');
            rect.setAttribute('stroke-dasharray', '8,4');
        } else if (tableCategory === 'derived' || node.accessMode === 'derived') {
            rect.setAttribute('stroke', NODE_STROKE_COLORS.derived);
            rect.setAttribute('stroke-width', '1.5');
            rect.setAttribute('stroke-dasharray', '5,3');
        }
    }

    // Add complexity indicator
    if (node.complexityLevel && node.complexityLevel !== 'low') {
        const complexityColor = node.complexityLevel === 'high' ?
            GLOW_COLORS.high :
            GLOW_COLORS.medium;
        rect.setAttribute('stroke', complexityColor.replace('0.4', '0.8'));
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('stroke-dasharray', '4,2');
    }

    group.appendChild(rect);

    // Accent strip — colored bar indicating node type
    const accentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (accentPosition === 'bottom') {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y + node.height - 3));
        accentStrip.setAttribute('width', String(node.width));
        accentStrip.setAttribute('height', '3');
        accentStrip.setAttribute('rx', '0');
        // Clip to bottom corners only
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 0 0 6px 6px)`);
    } else {
        // Left accent strip (default)
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y));
        accentStrip.setAttribute('width', '3');
        accentStrip.setAttribute('height', String(node.height));
        accentStrip.setAttribute('rx', '0');
        // Clip to left corners only
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 6px 0 0 6px)`);
    }
    accentStrip.setAttribute('fill', accentColor);
    accentStrip.setAttribute('class', 'node-accent');
    group.appendChild(accentStrip);

    // Add badges for access mode and category
    const badges: Array<{ text: string; color: string }> = [];

    // Access mode badges (highest priority)
    if (node.accessMode === 'read') {
        badges.push({ text: 'READ', color: BADGE_COLORS.read });
    } else if (node.accessMode === 'write') {
        badges.push({ text: 'WRITE', color: BADGE_COLORS.write });
    } else if (node.accessMode === 'derived') {
        badges.push({ text: 'DERIVED', color: BADGE_COLORS.derived });
    }

    // Table category badges
    if (isTable && tableCategory === 'cte_reference' && !node.accessMode) {
        badges.push({ text: 'CTE', color: BADGE_COLORS.cte });
    } else if (isTable && tableCategory === 'derived' && !node.accessMode) {
        badges.push({ text: 'DERIVED', color: BADGE_COLORS.derivedAlt });
    }

    // Operation type badges
    if (node.operationType && node.operationType !== 'SELECT') {
        const opColors: Record<string, string> = {
            'INSERT': BADGE_COLORS.insert,
            'UPDATE': BADGE_COLORS.update,
            'DELETE': BADGE_COLORS.delete,
            'MERGE': BADGE_COLORS.merge,
            'CREATE_TABLE_AS': BADGE_COLORS.createTableAs,
        };
        const opColor = opColors[node.operationType] || EDGE_COLORS.default;
        badges.push({ text: node.operationType, color: opColor });
    }

    // Render all badges
    badges.forEach((badge, index) => {
        const badgeWidth = badge.text.length * 7 + 10;
        const badgeX = node.x + node.width - badgeWidth - (index * (badgeWidth + 4));

        // Badge background
        const badgeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        badgeRect.setAttribute('x', String(badgeX));
        badgeRect.setAttribute('y', String(node.y - 8));
        badgeRect.setAttribute('width', String(badgeWidth));
        badgeRect.setAttribute('height', '16');
        badgeRect.setAttribute('rx', '4');
        badgeRect.setAttribute('fill', badge.color);
        group.appendChild(badgeRect);

        // Badge text
        const badgeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badgeLabel.setAttribute('x', String(badgeX + badgeWidth / 2));
        badgeLabel.setAttribute('y', String(node.y + 4));
        badgeLabel.setAttribute('text-anchor', 'middle');
        badgeLabel.setAttribute('fill', 'white');
        badgeLabel.setAttribute('font-size', '9');
        badgeLabel.setAttribute('font-weight', '700');
        badgeLabel.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        badgeLabel.textContent = badge.text;
        group.appendChild(badgeLabel);
    });

    // Inline performance warning marker (top-right triangle)
    const warningIndicator = getWarningIndicatorState(node.warnings);
    if (warningIndicator) {
        const triangleSize = 14;
        const triangleLeft = node.x + node.width - triangleSize - 6;
        const triangleTop = node.y + 6;

        const warningTriangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        warningTriangle.setAttribute('class', 'node-warning-triangle');
        warningTriangle.setAttribute('d', `M ${triangleLeft} ${triangleTop + triangleSize} L ${triangleLeft + triangleSize / 2} ${triangleTop} L ${triangleLeft + triangleSize} ${triangleTop + triangleSize} Z`);
        warningTriangle.setAttribute('fill', getWarningColor(warningIndicator.severity));
        warningTriangle.setAttribute('opacity', '0.95');
        warningTriangle.setAttribute('filter', 'url(#shadow)');
        group.appendChild(warningTriangle);

        const exclamation = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        exclamation.setAttribute('class', 'node-warning-icon');
        exclamation.setAttribute('x', String(triangleLeft + triangleSize / 2));
        exclamation.setAttribute('y', String(triangleTop + triangleSize - 2));
        exclamation.setAttribute('text-anchor', 'middle');
        exclamation.setAttribute('fill', 'white');
        exclamation.setAttribute('font-size', '9');
        exclamation.setAttribute('font-weight', '700');
        exclamation.textContent = getSeverityIcon(warningIndicator.severity);
        group.appendChild(exclamation);

        if (warningIndicator.count > 1) {
            const countBadge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            countBadge.setAttribute('x', String(triangleLeft - 2));
            countBadge.setAttribute('y', String(triangleTop + 8));
            countBadge.setAttribute('text-anchor', 'end');
            countBadge.setAttribute('fill', getWarningColor(warningIndicator.severity));
            countBadge.setAttribute('font-size', '9');
            countBadge.setAttribute('font-weight', '700');
            countBadge.textContent = `+${warningIndicator.count - 1}`;
            group.appendChild(countBadge);
        }
    }

    // Icon based on type
    const icon = getNodeVisualIcon(node);
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('class', 'node-main-icon');
    iconText.setAttribute('x', String(node.x + 12));
    iconText.setAttribute('y', String(node.y + 24));
    iconText.setAttribute('fill', textColorMuted);
    iconText.setAttribute('font-size', '14');
    iconText.textContent = icon;
    group.appendChild(iconText);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 32));
    label.setAttribute('y', String(node.y + 26));
    label.setAttribute('fill', textColor);
    label.setAttribute('font-size', '13');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = truncate(node.label, 14);
    group.appendChild(label);

    // Description (smaller text)
    if (node.description) {
        const desc = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        desc.setAttribute('x', String(node.x + 12));
        desc.setAttribute('y', String(node.y + 44));
        desc.setAttribute('fill', textColorDim);
        desc.setAttribute('font-size', '10');
        desc.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        desc.textContent = truncate(node.description, 20);
        group.appendChild(desc);
    }
}

function renderJoinNode(node: FlowNode, group: SVGGElement): void {
    const joinType = node.label || 'INNER JOIN';
    const joinColor = getJoinColor(joinType);
    const isDark = state.isDarkTheme;
    const accentPosition = ((window as any).nodeAccentPosition || 'left') as string;

    // Neutral fill + accent strip design
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const textColor = surface.text;
    const textColorMuted = surface.textMuted;
    const textColorDim = isDark ? '#64748B' : '#94A3B8';

    // Background rect — neutral fill
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Accent strip for join type
    const accentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (accentPosition === 'bottom') {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y + node.height - 3));
        accentStrip.setAttribute('width', String(node.width));
        accentStrip.setAttribute('height', '3');
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 0 0 6px 6px)`);
    } else {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y));
        accentStrip.setAttribute('width', '3');
        accentStrip.setAttribute('height', String(node.height));
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 6px 0 0 6px)`);
    }
    accentStrip.setAttribute('fill', joinColor);
    group.appendChild(accentStrip);

    // Venn diagram visualization
    const vennContainer = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    vennContainer.setAttribute('x', String(node.x + 8));
    vennContainer.setAttribute('y', String(node.y + 6));
    vennContainer.setAttribute('width', '32');
    vennContainer.setAttribute('height', '20');
    const vennDiv = document.createElement('div');
    vennDiv.innerHTML = getJoinVennDiagram(joinType, isDark);
    vennDiv.style.cssText = 'display: flex; align-items: center; justify-content: center;';
    vennContainer.appendChild(vennDiv);
    group.appendChild(vennContainer);

    // Join type label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 44));
    label.setAttribute('y', String(node.y + 20));
    label.setAttribute('fill', textColor);
    label.setAttribute('font-size', '11');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = truncate(joinType, 12);
    group.appendChild(label);

    // Join condition (if available)
    if (node.details && node.details.length > 0) {
        const condition = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        condition.setAttribute('x', String(node.x + 8));
        condition.setAttribute('y', String(node.y + 38));
        condition.setAttribute('fill', textColorMuted);
        condition.setAttribute('font-size', '9');
        condition.setAttribute('font-family', MONO_FONT_STACK);
        condition.textContent = truncate(node.details[0], 18);
        group.appendChild(condition);

        // Table name if present
        if (node.details.length > 1) {
            const tableName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tableName.setAttribute('x', String(node.x + 8));
            tableName.setAttribute('y', String(node.y + 52));
            tableName.setAttribute('fill', textColorDim);
            tableName.setAttribute('font-size', '9');
            tableName.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
            tableName.textContent = truncate(node.details[1], 18);
            group.appendChild(tableName);
        }
    }
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
    const nodeWidth = 180;
    const nodeHeight = 60;
    const cloudGap = 30;
    const cloudPadding = 15;

    // Subquery node stays fixed size
    node.width = nodeWidth;
    node.height = nodeHeight;

    // Layout children for cloud if expanded
    let cloudWidth = 160;
    let cloudHeight = 150;
    const childEdges = node.childEdges || []; // Handle undefined childEdges
    if (isExpanded && hasChildren && node.children) {
        const layoutSize = layoutSubflowNodesVertical(node.children, childEdges);
        cloudWidth = layoutSize.width + cloudPadding * 2;
        cloudHeight = layoutSize.height + cloudPadding * 2 + 30;
    }

    // Render the floating cloud to the LEFT of the subquery node when expanded
    if (isExpanded && hasChildren && node.children) {
        // Get custom offset or use default
        const offset = cloudOffsets.get(node.id) || { offsetX: -cloudWidth - cloudGap, offsetY: -(cloudHeight - nodeHeight) / 2 };
        const cloudX = node.x + offset.offsetX;
        const cloudY = node.y + offset.offsetY;

        // Create cloud container group for dragging
        const cloudGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        cloudGroup.setAttribute('class', 'cloud-container');
        cloudGroup.setAttribute('data-node-id', node.id);
        cloudGroup.style.cursor = 'move';

        // Cloud container — theme-aware
        const sqCloudIsDark = state.isDarkTheme;
        const sqCloudSurface = sqCloudIsDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
        const sqCloudAccent = getNodeAccentColor('subquery', sqCloudIsDark);

        const cloud = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        cloud.setAttribute('x', String(cloudX));
        cloud.setAttribute('y', String(cloudY));
        cloud.setAttribute('width', String(cloudWidth));
        cloud.setAttribute('height', String(cloudHeight));
        cloud.setAttribute('rx', '16');
        cloud.setAttribute('fill', sqCloudSurface.fill);
        cloud.setAttribute('stroke', sqCloudAccent);
        cloud.setAttribute('stroke-width', '2');
        cloud.setAttribute('stroke-dasharray', '6,3');
        cloud.setAttribute('filter', 'url(#shadow)');
        cloudGroup.appendChild(cloud);

        // Cloud title (subquery alias)
        const cloudTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        cloudTitle.setAttribute('x', String(cloudX + cloudWidth / 2));
        cloudTitle.setAttribute('y', String(cloudY + 20));
        cloudTitle.setAttribute('text-anchor', 'middle');
        cloudTitle.setAttribute('fill', sqCloudSurface.textMuted);
        cloudTitle.setAttribute('font-size', '11');
        cloudTitle.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        cloudTitle.textContent = node.label;
        cloudGroup.appendChild(cloudTitle);

        // Add close button to cloud
        const closeButton = addCloudCloseButton(node, cloudGroup, cloudX, cloudY, cloudWidth);

        // Create nested SVG for independent pan/zoom within the cloud
        const nestedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        nestedSvg.setAttribute('x', String(cloudX + cloudPadding));
        nestedSvg.setAttribute('y', String(cloudY + 30));
        nestedSvg.setAttribute('width', String(cloudWidth - cloudPadding * 2));
        nestedSvg.setAttribute('height', String(cloudHeight - 30 - cloudPadding));
        nestedSvg.setAttribute('overflow', 'hidden');
        nestedSvg.style.cursor = 'grab';

        const cloudState = ensureCloudViewState(node.id);

        // Create content group with transform for pan/zoom
        const subflowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        subflowGroup.setAttribute('class', 'cloud-subflow-group cloud-content');
        subflowGroup.setAttribute('transform', `translate(${cloudState.offsetX}, ${cloudState.offsetY}) scale(${cloudState.scale})`);

        // Render internal flow inside cloud
        renderCloudSubflow(
            node,
            node.children,
            childEdges,
            subflowGroup,
            0,
            0,
            cloudWidth - cloudPadding * 2,
            cloudHeight - 30 - cloudPadding
        );
        nestedSvg.appendChild(subflowGroup);
        cloudGroup.appendChild(nestedSvg);

        // Pan/zoom handlers for nested SVG
        nestedSvg.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const cloudState = ensureCloudViewState(node.id);
            cloudState.isDragging = true;
            cloudState.dragStartX = e.clientX - cloudState.offsetX;
            cloudState.dragStartY = e.clientY - cloudState.offsetY;
            nestedSvg.style.cursor = 'grabbing';
        });

        nestedSvg.addEventListener('mousemove', (e) => {
            const cloudState = cloudViewStates.get(node.id);
            if (cloudState?.isDragging) {
                e.stopPropagation();
                cloudState.offsetX = e.clientX - cloudState.dragStartX;
                cloudState.offsetY = e.clientY - cloudState.dragStartY;
                subflowGroup.setAttribute('transform', `translate(${cloudState.offsetX}, ${cloudState.offsetY}) scale(${cloudState.scale})`);
            }
        });

        nestedSvg.addEventListener('mouseup', () => {
            const cloudState = cloudViewStates.get(node.id);
            if (cloudState) {
                cloudState.isDragging = false;
            }
            nestedSvg.style.cursor = 'grab';
        });

        nestedSvg.addEventListener('mouseleave', () => {
            const cloudState = cloudViewStates.get(node.id);
            if (cloudState) {
                cloudState.isDragging = false;
            }
            nestedSvg.style.cursor = 'grab';
        });

        nestedSvg.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cloudState = ensureCloudViewState(node.id);
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.min(Math.max(cloudState.scale * delta, 0.5), 2);

            // Zoom toward mouse position within the nested SVG
            const rect = nestedSvg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            cloudState.offsetX = mouseX - (mouseX - cloudState.offsetX) * (newScale / cloudState.scale);
            cloudState.offsetY = mouseY - (mouseY - cloudState.offsetY) * (newScale / cloudState.scale);
            cloudState.scale = newScale;

            subflowGroup.setAttribute('transform', `translate(${cloudState.offsetX}, ${cloudState.offsetY}) scale(${cloudState.scale})`);
        });

        // Arrow from cloud to subquery node - dynamically positioned based on cloud location
        // Determine which side of the node the cloud is on
        const cloudCenterX = cloudX + cloudWidth / 2;
        const nodeCenterX = node.x + nodeWidth / 2;
        const cloudIsOnRight = cloudCenterX > nodeCenterX;

        let arrowStartX: number;
        let arrowStartY: number;
        let arrowEndX: number;
        let arrowEndY: number;

        if (cloudIsOnRight) {
            // Cloud is to the right: arrow starts from left side of cloud, points to right side of node
            arrowStartX = cloudX;
            arrowStartY = cloudY + cloudHeight / 2;
            arrowEndX = node.x + nodeWidth;
            arrowEndY = node.y + nodeHeight / 2;
        } else {
            // Cloud is to the left: arrow starts from right side of cloud, points to left side of node
            arrowStartX = cloudX + cloudWidth;
            arrowStartY = cloudY + cloudHeight / 2;
            arrowEndX = node.x;
            arrowEndY = node.y + nodeHeight / 2;
        }

        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midX = (arrowStartX + arrowEndX) / 2;
        arrowPath.setAttribute('d', `M ${arrowStartX} ${arrowStartY} C ${midX} ${arrowStartY}, ${midX} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`);
        arrowPath.setAttribute('fill', 'none');
        arrowPath.setAttribute('stroke', sqCloudAccent);
        arrowPath.setAttribute('stroke-width', '2');
        arrowPath.setAttribute('stroke-dasharray', '5,3');
        arrowPath.setAttribute('marker-end', 'url(#arrowhead)');
        cloudGroup.appendChild(arrowPath);

        group.appendChild(cloudGroup);

        // Store references for dynamic updates (including nestedSvg for pan/zoom and closeButton)
        cloudElements.set(node.id, { cloud, title: cloudTitle, arrow: arrowPath, subflowGroup, nestedSvg, closeButton });

        /**
         * Drag handler for cloud container - allows independent positioning of cloud.
         * When dragging the cloud, only the cloud offset is updated, keeping the node position fixed.
         * The arrow will automatically adjust to point from the correct side of the cloud.
         */
        cloud.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const rect = svg!.getBoundingClientRect();
            state.isDraggingCloud = true;
            state.draggingCloudNodeId = node.id;

            // Get current cloud offset or default (stored relative to node position)
            const currentOffset = cloudOffsets.get(node.id) || { offsetX: -cloudWidth - cloudGap, offsetY: -(cloudHeight - nodeHeight) / 2 };
            state.dragCloudStartOffsetX = currentOffset.offsetX;
            state.dragCloudStartOffsetY = currentOffset.offsetY;

            // Store initial mouse position (in SVG coordinates, accounting for pan/zoom)
            state.dragMouseStartX = (e.clientX - rect.left - state.offsetX) / state.scale;
            state.dragMouseStartY = (e.clientY - rect.top - state.offsetY) / state.scale;

            // Add visual feedback during drag
            cloudGroup.style.opacity = '0.8';
        });
    }

    // Main subquery node — neutral fill + accent strip + dashed border
    const sqIsDark = state.isDarkTheme;
    const sqSurface = sqIsDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const sqAccent = getNodeAccentColor('subquery', sqIsDark);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(nodeWidth));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', sqSurface.fill);
    rect.setAttribute('stroke', sqAccent);
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '6,3');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Accent strip
    const sqAccentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    sqAccentStrip.setAttribute('x', String(node.x));
    sqAccentStrip.setAttribute('y', String(node.y));
    sqAccentStrip.setAttribute('width', '3');
    sqAccentStrip.setAttribute('height', String(nodeHeight));
    sqAccentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 6px 0 0 6px)`);
    sqAccentStrip.setAttribute('fill', sqAccent);
    group.appendChild(sqAccentStrip);

    // Subquery icon
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', String(node.x + 12));
    iconText.setAttribute('y', String(node.y + 26));
    iconText.setAttribute('fill', sqAccent);
    iconText.setAttribute('font-size', '14');
    iconText.textContent = '⊂';
    group.appendChild(iconText);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 30));
    label.setAttribute('y', String(node.y + 26));
    label.setAttribute('fill', sqSurface.text);
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', MONO_FONT_STACK);
    label.textContent = truncate(node.label, 14);
    group.appendChild(label);

    // Description
    const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    descText.setAttribute('x', String(node.x + 12));
    descText.setAttribute('y', String(node.y + 45));
    descText.setAttribute('fill', sqSurface.textMuted);
    descText.setAttribute('font-size', '10');
    descText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    if (hasChildren && node.children) {
        descText.textContent = isExpanded ? 'Click to collapse' : `${node.children.length} operations`;
    } else {
        descText.textContent = 'Derived Table';
    }
    group.appendChild(descText);
}

function renderCteNode(node: FlowNode, group: SVGGElement, isExpanded: boolean, hasChildren: boolean | undefined): void {
    const nodeWidth = 180;
    const nodeHeight = 60;
    const cloudGap = 30; // Gap between cloud and CTE node
    const cloudPadding = 15;

    // CTE node stays fixed size - it's just a reference/output node
    node.width = nodeWidth;
    node.height = nodeHeight;

    // Layout children for cloud if expanded
    let cloudWidth = 160;
    let cloudHeight = 150;
    const childEdges = node.childEdges || []; // Handle undefined childEdges
    if (isExpanded && hasChildren && node.children) {
        const layoutSize = layoutSubflowNodesVertical(node.children, childEdges);
        cloudWidth = layoutSize.width + cloudPadding * 2;
        cloudHeight = layoutSize.height + cloudPadding * 2 + 30; // +30 for title
    }

    // Render the floating cloud to the LEFT of the CTE node when expanded
    if (isExpanded && hasChildren && node.children) {
        // Get custom offset or use default
        const offset = cloudOffsets.get(node.id) || { offsetX: -cloudWidth - cloudGap, offsetY: -(cloudHeight - nodeHeight) / 2 };
        const cloudX = node.x + offset.offsetX;
        const cloudY = node.y + offset.offsetY;

        // Create cloud container group for dragging
        const cloudGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        cloudGroup.setAttribute('class', 'cloud-container');
        cloudGroup.setAttribute('data-node-id', node.id);
        cloudGroup.style.cursor = 'move';

        // Cloud container background — theme-aware
        const cteCloudIsDark = state.isDarkTheme;
        const cteCloudSurface = cteCloudIsDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
        const cteCloudAccent = getNodeAccentColor('cte', cteCloudIsDark);

        const cloud = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        cloud.setAttribute('x', String(cloudX));
        cloud.setAttribute('y', String(cloudY));
        cloud.setAttribute('width', String(cloudWidth));
        cloud.setAttribute('height', String(cloudHeight));
        cloud.setAttribute('rx', '16');
        cloud.setAttribute('fill', cteCloudSurface.fill);
        cloud.setAttribute('stroke', cteCloudAccent);
        cloud.setAttribute('stroke-width', '2');
        cloud.setAttribute('filter', 'url(#shadow)');
        cloudGroup.appendChild(cloud);

        // Cloud title (CTE name without "WITH ")
        const cteName = node.label.replace('WITH ', '');
        const cloudTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        cloudTitle.setAttribute('x', String(cloudX + cloudWidth / 2));
        cloudTitle.setAttribute('y', String(cloudY + 20));
        cloudTitle.setAttribute('text-anchor', 'middle');
        cloudTitle.setAttribute('fill', cteCloudSurface.textMuted);
        cloudTitle.setAttribute('font-size', '11');
        cloudTitle.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        cloudTitle.textContent = cteName;
        cloudGroup.appendChild(cloudTitle);

        // Add close button to cloud
        const closeButton = addCloudCloseButton(node, cloudGroup, cloudX, cloudY, cloudWidth);

        // Create nested SVG for independent pan/zoom within the cloud
        const nestedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        nestedSvg.setAttribute('x', String(cloudX + cloudPadding));
        nestedSvg.setAttribute('y', String(cloudY + 30));
        nestedSvg.setAttribute('width', String(cloudWidth - cloudPadding * 2));
        nestedSvg.setAttribute('height', String(cloudHeight - 30 - cloudPadding));
        nestedSvg.setAttribute('overflow', 'hidden');
        nestedSvg.style.cursor = 'grab';

        const cloudState = ensureCloudViewState(node.id);

        // Create content group with transform for pan/zoom
        const subflowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        subflowGroup.setAttribute('class', 'cloud-subflow-group cloud-content');
        subflowGroup.setAttribute('transform', `translate(${cloudState.offsetX}, ${cloudState.offsetY}) scale(${cloudState.scale})`);

        // Render internal flow inside cloud
        renderCloudSubflow(
            node,
            node.children,
            childEdges,
            subflowGroup,
            0,
            0,
            cloudWidth - cloudPadding * 2,
            cloudHeight - 30 - cloudPadding
        );
        nestedSvg.appendChild(subflowGroup);
        cloudGroup.appendChild(nestedSvg);

        // Pan/zoom handlers for nested SVG
        nestedSvg.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const cloudState = ensureCloudViewState(node.id);
            cloudState.isDragging = true;
            cloudState.dragStartX = e.clientX - cloudState.offsetX;
            cloudState.dragStartY = e.clientY - cloudState.offsetY;
            nestedSvg.style.cursor = 'grabbing';
        });

        nestedSvg.addEventListener('mousemove', (e) => {
            const cloudState = cloudViewStates.get(node.id);
            if (cloudState?.isDragging) {
                e.stopPropagation();
                cloudState.offsetX = e.clientX - cloudState.dragStartX;
                cloudState.offsetY = e.clientY - cloudState.dragStartY;
                subflowGroup.setAttribute('transform', `translate(${cloudState.offsetX}, ${cloudState.offsetY}) scale(${cloudState.scale})`);
            }
        });

        nestedSvg.addEventListener('mouseup', () => {
            const cloudState = cloudViewStates.get(node.id);
            if (cloudState) {
                cloudState.isDragging = false;
            }
            nestedSvg.style.cursor = 'grab';
        });

        nestedSvg.addEventListener('mouseleave', () => {
            const cloudState = cloudViewStates.get(node.id);
            if (cloudState) {
                cloudState.isDragging = false;
            }
            nestedSvg.style.cursor = 'grab';
        });

        nestedSvg.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cloudState = ensureCloudViewState(node.id);
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = Math.min(Math.max(cloudState.scale * delta, 0.5), 2);

            // Zoom toward mouse position within the nested SVG
            const rect = nestedSvg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            cloudState.offsetX = mouseX - (mouseX - cloudState.offsetX) * (newScale / cloudState.scale);
            cloudState.offsetY = mouseY - (mouseY - cloudState.offsetY) * (newScale / cloudState.scale);
            cloudState.scale = newScale;

            subflowGroup.setAttribute('transform', `translate(${cloudState.offsetX}, ${cloudState.offsetY}) scale(${cloudState.scale})`);
        });

        // Arrow from cloud to CTE node - dynamically positioned based on cloud location
        // Determine which side of the node the cloud is on
        const cloudCenterX = cloudX + cloudWidth / 2;
        const nodeCenterX = node.x + nodeWidth / 2;
        const cloudIsOnRight = cloudCenterX > nodeCenterX;

        let arrowStartX: number;
        let arrowStartY: number;
        let arrowEndX: number;
        let arrowEndY: number;

        if (cloudIsOnRight) {
            // Cloud is to the right: arrow starts from left side of cloud, points to right side of node
            arrowStartX = cloudX;
            arrowStartY = cloudY + cloudHeight / 2;
            arrowEndX = node.x + nodeWidth;
            arrowEndY = node.y + nodeHeight / 2;
        } else {
            // Cloud is to the left: arrow starts from right side of cloud, points to left side of node
            arrowStartX = cloudX + cloudWidth;
            arrowStartY = cloudY + cloudHeight / 2;
            arrowEndX = node.x;
            arrowEndY = node.y + nodeHeight / 2;
        }

        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midX = (arrowStartX + arrowEndX) / 2;
        arrowPath.setAttribute('d', `M ${arrowStartX} ${arrowStartY} C ${midX} ${arrowStartY}, ${midX} ${arrowEndY}, ${arrowEndX} ${arrowEndY}`);
        arrowPath.setAttribute('fill', 'none');
        arrowPath.setAttribute('stroke', cteCloudAccent);
        arrowPath.setAttribute('stroke-width', '2');
        arrowPath.setAttribute('stroke-dasharray', '5,3');
        arrowPath.setAttribute('marker-end', 'url(#arrowhead)');
        cloudGroup.appendChild(arrowPath);

        group.appendChild(cloudGroup);

        // Store references for dynamic updates (including nestedSvg for pan/zoom and closeButton)
        cloudElements.set(node.id, { cloud, title: cloudTitle, arrow: arrowPath, subflowGroup, nestedSvg, closeButton });

        /**
         * Drag handler for cloud container - allows independent positioning of cloud.
         * When dragging the cloud, only the cloud offset is updated, keeping the node position fixed.
         * The arrow will automatically adjust to point from the correct side of the cloud.
         */
        cloud.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const rect = svg!.getBoundingClientRect();
            state.isDraggingCloud = true;
            state.draggingCloudNodeId = node.id;

            // Get current cloud offset or default (stored relative to node position)
            const currentOffset = cloudOffsets.get(node.id) || { offsetX: -cloudWidth - cloudGap, offsetY: -(cloudHeight - nodeHeight) / 2 };
            state.dragCloudStartOffsetX = currentOffset.offsetX;
            state.dragCloudStartOffsetY = currentOffset.offsetY;

            // Store initial mouse position (in SVG coordinates, accounting for pan/zoom)
            state.dragMouseStartX = (e.clientX - rect.left - state.offsetX) / state.scale;
            state.dragMouseStartY = (e.clientY - rect.top - state.offsetY) / state.scale;

            // Add visual feedback during drag
            cloudGroup.style.opacity = '0.8';
        });
    }

    // Main CTE node — neutral fill + accent strip
    const isDark = state.isDarkTheme;
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const accentColor = getNodeAccentColor('cte', isDark);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(nodeWidth));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Accent strip
    const cteAccent = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    cteAccent.setAttribute('x', String(node.x));
    cteAccent.setAttribute('y', String(node.y));
    cteAccent.setAttribute('width', '3');
    cteAccent.setAttribute('height', String(nodeHeight));
    cteAccent.setAttribute('clip-path', `inset(0 0 0 0 round 6px 0 0 6px)`);
    cteAccent.setAttribute('fill', accentColor);
    group.appendChild(cteAccent);

    // Icon
    const icon = getNodeIcon(node.type);
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', String(node.x + 14));
    iconText.setAttribute('y', String(node.y + 26));
    iconText.setAttribute('fill', accentColor);
    iconText.setAttribute('font-size', '14');
    iconText.textContent = icon;
    group.appendChild(iconText);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 34));
    label.setAttribute('y', String(node.y + 26));
    label.setAttribute('fill', surface.text);
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = truncate(node.label, 16);
    group.appendChild(label);

    // Description or child count
    const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    descText.setAttribute('x', String(node.x + 14));
    descText.setAttribute('y', String(node.y + 45));
    descText.setAttribute('fill', surface.textMuted);
    descText.setAttribute('font-size', '10');
    descText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    if (hasChildren && node.children) {
        descText.textContent = isExpanded ? 'Click to collapse' : `${node.children.length} operations`;
    } else {
        descText.textContent = 'Common Table Expression';
    }
    group.appendChild(descText);
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

/**
 * Add a close (X) button to a cloud container.
 * When clicked, it collapses the cloud by setting node.expanded = false.
 * Uses transform for positioning so it can be easily updated when cloud is dragged.
 * Returns the button group for storage in cloudElements.
 */
function addCloudCloseButton(
    node: FlowNode,
    cloudGroup: SVGGElement,
    cloudX: number,
    cloudY: number,
    cloudWidth: number
): SVGGElement {
    const buttonSize = 20;
    const buttonPadding = 8;
    const buttonX = cloudX + cloudWidth - buttonSize - buttonPadding;
    const buttonY = cloudY + buttonPadding;

    // Button container group - use transform for easy repositioning
    const closeButtonGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    closeButtonGroup.setAttribute('class', 'cloud-close-btn');
    closeButtonGroup.setAttribute('transform', `translate(${buttonX}, ${buttonY})`);
    closeButtonGroup.style.cursor = 'pointer';

    // Background circle (positioned at 0,0 relative to group)
    const buttonBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    buttonBg.setAttribute('cx', String(buttonSize / 2));
    buttonBg.setAttribute('cy', String(buttonSize / 2));
    buttonBg.setAttribute('r', String(buttonSize / 2));
    buttonBg.setAttribute('fill', CLOSE_BUTTON_COLORS.background); // Red with transparency
    buttonBg.setAttribute('stroke', UI_COLORS.borderWhite);
    buttonBg.setAttribute('stroke-width', '1');
    closeButtonGroup.appendChild(buttonBg);

    // X icon using path (positioned relative to group)
    const xIcon = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const centerX = buttonSize / 2;
    const centerY = buttonSize / 2;
    const offset = 5;
    xIcon.setAttribute('d', `
        M ${centerX - offset} ${centerY - offset} L ${centerX + offset} ${centerY + offset}
        M ${centerX + offset} ${centerY - offset} L ${centerX - offset} ${centerY + offset}
    `);
    xIcon.setAttribute('stroke', 'white');
    xIcon.setAttribute('stroke-width', '2');
    xIcon.setAttribute('stroke-linecap', 'round');
    xIcon.style.pointerEvents = 'none';
    closeButtonGroup.appendChild(xIcon);

    // Click handler - collapse the node (hide cloud)
    closeButtonGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        node.expanded = false;
        // Re-render to hide cloud
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
    });

    // Hover effects
    closeButtonGroup.addEventListener('mouseenter', () => {
        buttonBg.setAttribute('fill', CLOSE_BUTTON_COLORS.backgroundHover);
    });
    closeButtonGroup.addEventListener('mouseleave', () => {
        buttonBg.setAttribute('fill', CLOSE_BUTTON_COLORS.background);
    });

    cloudGroup.appendChild(closeButtonGroup);
    return closeButtonGroup;
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
    const windowDetails = node.windowDetails!;
    const padding = 10;
    const headerHeight = 32;
    const funcHeight = 24;
    const isDark = state.isDarkTheme;
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const accentColor = getNodeAccentColor('window', isDark);
    const accentPosition = ((window as any).nodeAccentPosition || 'left') as string;
    const pillBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)';

    // Main container — neutral fill
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Accent strip
    const accentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (accentPosition === 'bottom') {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y + node.height - 3));
        accentStrip.setAttribute('width', String(node.width));
        accentStrip.setAttribute('height', '3');
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 0 0 6px 6px)`);
    } else {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y));
        accentStrip.setAttribute('width', '3');
        accentStrip.setAttribute('height', String(node.height));
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 6px 0 0 6px)`);
    }
    accentStrip.setAttribute('fill', accentColor);
    group.appendChild(accentStrip);

    // Header separator
    const headerSep = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    headerSep.setAttribute('x1', String(node.x + 8));
    headerSep.setAttribute('y1', String(node.y + headerHeight));
    headerSep.setAttribute('x2', String(node.x + node.width - 8));
    headerSep.setAttribute('y2', String(node.y + headerHeight));
    headerSep.setAttribute('stroke', surface.border);
    headerSep.setAttribute('stroke-width', '1');
    group.appendChild(headerSep);

    // Icon and title
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', accentColor);
    icon.setAttribute('font-size', '12');
    icon.textContent = '▦';
    group.appendChild(icon);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(node.x + 28));
    title.setAttribute('y', String(node.y + 22));
    title.setAttribute('fill', surface.text);
    title.setAttribute('font-size', '12');
    title.setAttribute('font-weight', '600');
    title.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    title.textContent = `WINDOW (${windowDetails.functions.length})`;
    group.appendChild(title);

    // Render each window function
    let yOffset = node.y + headerHeight + 8;
    for (const func of windowDetails.functions.slice(0, 4)) { // Max 4 visible
        // Function pill
        const funcPill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        funcPill.setAttribute('x', String(node.x + padding));
        funcPill.setAttribute('y', String(yOffset));
        funcPill.setAttribute('width', String(node.width - padding * 2));
        funcPill.setAttribute('height', String(funcHeight));
        funcPill.setAttribute('rx', '4');
        funcPill.setAttribute('fill', pillBg);
        group.appendChild(funcPill);

        // Function name
        const funcName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        funcName.setAttribute('x', String(node.x + padding + 6));
        funcName.setAttribute('y', String(yOffset + 15));
        funcName.setAttribute('fill', accentColor);
        funcName.setAttribute('font-size', '10');
        funcName.setAttribute('font-weight', '600');
        funcName.setAttribute('font-family', MONO_FONT_STACK);
        funcName.textContent = func.name;
        group.appendChild(funcName);

        // Partition/Order info as badges
        let badgeX = node.x + padding + 6 + func.name.length * 6.5 + 8;

        if (func.partitionBy && func.partitionBy.length > 0) {
            const partBadge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            partBadge.setAttribute('x', String(badgeX));
            partBadge.setAttribute('y', String(yOffset + 4));
            partBadge.setAttribute('width', '16');
            partBadge.setAttribute('height', '14');
            partBadge.setAttribute('rx', '3');
            partBadge.setAttribute('fill', BADGE_COLORS.partitionBy);
            group.appendChild(partBadge);

            const partText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            partText.setAttribute('x', String(badgeX + 4));
            partText.setAttribute('y', String(yOffset + 14));
            partText.setAttribute('fill', 'white');
            partText.setAttribute('font-size', '8');
            partText.setAttribute('font-weight', '600');
            partText.textContent = 'P';
            group.appendChild(partText);

            badgeX += 20;
        }

        if (func.orderBy && func.orderBy.length > 0) {
            const orderBadge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            orderBadge.setAttribute('x', String(badgeX));
            orderBadge.setAttribute('y', String(yOffset + 4));
            orderBadge.setAttribute('width', '16');
            orderBadge.setAttribute('height', '14');
            orderBadge.setAttribute('rx', '3');
            orderBadge.setAttribute('fill', BADGE_COLORS.orderBy);
            group.appendChild(orderBadge);

            const orderText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            orderText.setAttribute('x', String(badgeX + 4));
            orderText.setAttribute('y', String(yOffset + 14));
            orderText.setAttribute('fill', 'white');
            orderText.setAttribute('font-size', '8');
            orderText.setAttribute('font-weight', '600');
            orderText.textContent = 'O';
            group.appendChild(orderText);
        }

        yOffset += funcHeight + 4;
    }

    // Show "more" indicator if there are more functions
    if (windowDetails.functions.length > 4) {
        const moreText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        moreText.setAttribute('x', String(node.x + node.width / 2));
        moreText.setAttribute('y', String(node.y + node.height - 8));
        moreText.setAttribute('text-anchor', 'middle');
        moreText.setAttribute('fill', surface.textMuted);
        moreText.setAttribute('font-size', '9');
        moreText.textContent = `+${windowDetails.functions.length - 4} more`;
        group.appendChild(moreText);
    }
}

function renderAggregateNode(node: FlowNode, group: SVGGElement): void {
    const aggregateDetails = node.aggregateDetails!;
    const padding = 10;
    const headerHeight = 32;
    const funcHeight = 24;
    const isDark = state.isDarkTheme;
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const accentColor = getNodeAccentColor('aggregate', isDark);
    const accentPosition = ((window as any).nodeAccentPosition || 'left') as string;
    const pillBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)';

    // Main container — neutral fill
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Accent strip
    const accentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (accentPosition === 'bottom') {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y + node.height - 3));
        accentStrip.setAttribute('width', String(node.width));
        accentStrip.setAttribute('height', '3');
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 0 0 6px 6px)`);
    } else {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y));
        accentStrip.setAttribute('width', '3');
        accentStrip.setAttribute('height', String(node.height));
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 6px 0 0 6px)`);
    }
    accentStrip.setAttribute('fill', accentColor);
    group.appendChild(accentStrip);

    // Header separator
    const headerSep = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    headerSep.setAttribute('x1', String(node.x + 8));
    headerSep.setAttribute('y1', String(node.y + headerHeight));
    headerSep.setAttribute('x2', String(node.x + node.width - 8));
    headerSep.setAttribute('y2', String(node.y + headerHeight));
    headerSep.setAttribute('stroke', surface.border);
    headerSep.setAttribute('stroke-width', '1');
    group.appendChild(headerSep);

    // Icon and title
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', accentColor);
    icon.setAttribute('font-size', '12');
    icon.textContent = 'Σ';
    group.appendChild(icon);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(node.x + 28));
    title.setAttribute('y', String(node.y + 22));
    title.setAttribute('fill', surface.text);
    title.setAttribute('font-size', '12');
    title.setAttribute('font-weight', '600');
    title.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    title.textContent = `AGGREGATE (${aggregateDetails.functions.length})`;
    group.appendChild(title);

    // Render each aggregate function
    let yOffset = node.y + headerHeight + 8;
    for (const func of aggregateDetails.functions.slice(0, 4)) { // Max 4 visible
        // Function pill
        const funcPill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        funcPill.setAttribute('x', String(node.x + padding));
        funcPill.setAttribute('y', String(yOffset));
        funcPill.setAttribute('width', String(node.width - padding * 2));
        funcPill.setAttribute('height', String(funcHeight));
        funcPill.setAttribute('rx', '4');
        funcPill.setAttribute('fill', pillBg);
        group.appendChild(funcPill);

        // Function expression
        const funcText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        funcText.setAttribute('x', String(node.x + padding + 6));
        funcText.setAttribute('y', String(yOffset + 16));
        funcText.setAttribute('fill', accentColor);
        funcText.setAttribute('font-size', '10');
        funcText.setAttribute('font-weight', '600');
        funcText.setAttribute('font-family', MONO_FONT_STACK);
        const truncatedExpr = func.expression.length > 25 ? func.expression.substring(0, 22) + '...' : func.expression;
        funcText.textContent = truncatedExpr;
        group.appendChild(funcText);

        yOffset += funcHeight + 4;
    }

    // Show "more" indicator if there are more functions
    if (aggregateDetails.functions.length > 4) {
        const moreText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        moreText.setAttribute('x', String(node.x + node.width / 2));
        moreText.setAttribute('y', String(node.y + node.height - 8));
        moreText.setAttribute('text-anchor', 'middle');
        moreText.setAttribute('fill', surface.textMuted);
        moreText.setAttribute('font-size', '9');
        moreText.textContent = `+${aggregateDetails.functions.length - 4} more`;
        group.appendChild(moreText);
    }
}

function renderCaseNode(node: FlowNode, group: SVGGElement): void {
    const caseDetails = node.caseDetails!;
    const padding = 10;
    const headerHeight = 32;
    const caseHeight = 40;
    const isDark = state.isDarkTheme;
    const surface = isDark ? NODE_SURFACE.dark : NODE_SURFACE.light;
    const accentColor = getNodeAccentColor('case', isDark);
    const accentPosition = ((window as any).nodeAccentPosition || 'left') as string;
    const pillBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)';

    // Main container — neutral fill
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', surface.fill);
    rect.setAttribute('stroke', surface.border);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Accent strip
    const accentStrip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    if (accentPosition === 'bottom') {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y + node.height - 3));
        accentStrip.setAttribute('width', String(node.width));
        accentStrip.setAttribute('height', '3');
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 0 0 6px 6px)`);
    } else {
        accentStrip.setAttribute('x', String(node.x));
        accentStrip.setAttribute('y', String(node.y));
        accentStrip.setAttribute('width', '3');
        accentStrip.setAttribute('height', String(node.height));
        accentStrip.setAttribute('clip-path', `inset(0 0 0 0 round 6px 0 0 6px)`);
    }
    accentStrip.setAttribute('fill', accentColor);
    group.appendChild(accentStrip);

    // Header separator
    const headerSep = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    headerSep.setAttribute('x1', String(node.x + 8));
    headerSep.setAttribute('y1', String(node.y + headerHeight));
    headerSep.setAttribute('x2', String(node.x + node.width - 8));
    headerSep.setAttribute('y2', String(node.y + headerHeight));
    headerSep.setAttribute('stroke', surface.border);
    headerSep.setAttribute('stroke-width', '1');
    group.appendChild(headerSep);

    // Icon and title
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', accentColor);
    icon.setAttribute('font-size', '12');
    icon.textContent = '?';
    group.appendChild(icon);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(node.x + 28));
    title.setAttribute('y', String(node.y + 22));
    title.setAttribute('fill', surface.text);
    title.setAttribute('font-size', '12');
    title.setAttribute('font-weight', '600');
    title.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    title.textContent = `CASE (${caseDetails.cases.length})`;
    group.appendChild(title);

    // Render each CASE statement
    let yOffset = node.y + headerHeight + 8;
    for (const caseStmt of caseDetails.cases.slice(0, 3)) { // Max 3 visible
        // CASE pill
        const casePill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        casePill.setAttribute('x', String(node.x + padding));
        casePill.setAttribute('y', String(yOffset));
        casePill.setAttribute('width', String(node.width - padding * 2));
        casePill.setAttribute('height', String(caseHeight));
        casePill.setAttribute('rx', '4');
        casePill.setAttribute('fill', pillBg);
        group.appendChild(casePill);

        // CASE conditions count
        const caseText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        caseText.setAttribute('x', String(node.x + padding + 6));
        caseText.setAttribute('y', String(yOffset + 18));
        caseText.setAttribute('fill', accentColor);
        caseText.setAttribute('font-size', '10');
        caseText.setAttribute('font-weight', '600');
        caseText.setAttribute('font-family', MONO_FONT_STACK);
        caseText.textContent = `${caseStmt.conditions.length} WHEN condition${caseStmt.conditions.length > 1 ? 's' : ''}`;
        group.appendChild(caseText);

        if (caseStmt.elseValue) {
            const elseText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            elseText.setAttribute('x', String(node.x + padding + 6));
            elseText.setAttribute('y', String(yOffset + 32));
            elseText.setAttribute('fill', surface.textMuted);
            elseText.setAttribute('font-size', '9');
            const truncatedElse = caseStmt.elseValue.length > 20 ? caseStmt.elseValue.substring(0, 17) + '...' : caseStmt.elseValue;
            elseText.textContent = 'ELSE: ' + truncatedElse;
            group.appendChild(elseText);
        }

        yOffset += caseHeight + 4;
    }

    // Show "more" indicator if there are more CASE statements
    if (caseDetails.cases.length > 3) {
        const moreText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        moreText.setAttribute('x', String(node.x + node.width / 2));
        moreText.setAttribute('y', String(node.y + node.height - 8));
        moreText.setAttribute('text-anchor', 'middle');
        moreText.setAttribute('fill', surface.textMuted);
        moreText.setAttribute('font-size', '9');
        moreText.textContent = `+${caseDetails.cases.length - 3} more`;
        group.appendChild(moreText);
    }
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
    const sourceNode = renderNodeMap.get(edge.source) || currentNodes.find(n => n.id === edge.source);
    const targetNode = renderNodeMap.get(edge.target) || currentNodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) { return; }

    // Theme-aware edge colors
    const isDark = state.isDarkTheme;
    const defaultStroke = isDark ? '#333333' : '#CBD5E1';
    const hoverStroke = '#6366F1'; // indigo

    const x1 = sourceNode.x + sourceNode.width / 2;
    const y1 = sourceNode.y + sourceNode.height;
    const x2 = targetNode.x + targetNode.width / 2;
    const y2 = targetNode.y;

    const midY = (y1 + y2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', defaultStroke);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.setAttribute('class', 'edge');
    path.setAttribute('data-source', edge.source);
    path.setAttribute('data-target', edge.target);
    path.setAttribute('data-edge-id', edge.id);

    if (edge.sqlClause) {
        path.setAttribute('data-sql-clause', edge.sqlClause);
    }
    if (edge.clauseType) {
        path.setAttribute('data-clause-type', edge.clauseType);
    }
    if (edge.startLine) {
        path.setAttribute('data-start-line', String(edge.startLine));
    }

    path.style.cursor = 'pointer';
    path.style.transition = 'stroke 0.15s, stroke-width 0.15s';

    path.addEventListener('click', (e) => {
        e.stopPropagation();
        handleEdgeClick(edge);
    });

    // Hover: indigo highlight, 2px
    path.addEventListener('mouseenter', () => {
        if (!path.getAttribute('data-highlighted')) {
            path.setAttribute('stroke', hoverStroke);
            path.setAttribute('stroke-width', '2');
        }
    });

    path.addEventListener('mouseleave', () => {
        if (!path.getAttribute('data-highlighted')) {
            path.setAttribute('stroke', defaultStroke);
            path.setAttribute('stroke-width', '1.5');
        }
    });

    parent.appendChild(path);
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
    // Reuse or create a panel for showing SQL clause details
    let clausePanel = document.getElementById('sql-clause-panel') as HTMLDivElement;
    const isDark = state.isDarkTheme;
    const panelBg = isDark ? UI_COLORS.backgroundPanelSolid : UI_COLORS.backgroundPanelLightSolid;
    const panelBorder = isDark ? UI_COLORS.borderMedium : 'rgba(15, 23, 42, 0.14)';
    const panelShadow = isDark ? UI_COLORS.shadowMedium : '0 8px 24px rgba(15, 23, 42, 0.12)';
    const mutedText = isDark ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const headingText = isDark ? UI_COLORS.textSubtle : UI_COLORS.textLightSubtle;
    const clauseBg = isDark ? UI_COLORS.backgroundSubtleDark : 'rgba(15, 23, 42, 0.04)';
    const clauseBorder = isDark ? UI_COLORS.border : 'rgba(15, 23, 42, 0.1)';
    const clauseText = isDark ? UI_COLORS.textBright : UI_COLORS.textLight;

    if (!clausePanel) {
        clausePanel = document.createElement('div');
        clausePanel.id = 'sql-clause-panel';
        containerElement?.appendChild(clausePanel);
    }
    clausePanel.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: ${panelBg};
        border: 1px solid ${panelBorder};
        border-radius: 12px;
        padding: 16px 20px;
        max-width: 600px;
        z-index: ${Z_INDEX.dropdown};
        box-shadow: ${panelShadow};
        font-family: ${MONO_FONT_STACK};
    `;

    // Build content
    const clauseType = edge.clauseType || 'flow';
    const clauseTypeLabel = clauseType.toUpperCase();
    const clauseColor = getClauseTypeColor(clauseType);

    clausePanel.innerHTML = `
        <button style="
            position: absolute;
            top: 8px;
            right: 8px;
            background: transparent;
            border: none;
            color: ${mutedText};
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
        " class="clause-panel-close-btn">✕</button>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="
                background: ${clauseColor};
                color: white;
                padding: 4px 12px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.5px;
            ">${clauseTypeLabel}</div>
            <div style="color: ${headingText}; font-size: 13px; font-weight: 600;">
                ${escapeHtml(edge.label || 'Data Flow')}
            </div>
        </div>
        <div style="
            background: ${clauseBg};
            border: 1px solid ${clauseBorder};
            border-radius: 8px;
            padding: 12px;
            color: ${clauseText};
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 200px;
            overflow-y: auto;
        ">${escapeHtml(edge.sqlClause || 'No SQL clause information available')}</div>
        ${edge.startLine ? `
            <div style="color: ${mutedText}; font-size: 11px; margin-top: 8px;">
                <span style="display: inline-flex; width: 12px; height: 12px; vertical-align: text-bottom;">${ICONS.pin}</span>
                Line ${edge.startLine}${edge.endLine && edge.endLine !== edge.startLine ? `-${edge.endLine}` : ''}
            </div>
        ` : ''}
    `;

    const closeBtn = clausePanel.querySelector<HTMLButtonElement>('.clause-panel-close-btn');
    closeBtn?.addEventListener('click', () => {
        if (clausePanel) {
            clausePanel.style.display = 'none';
        }
    });

    clausePanel.style.display = 'block';
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
    if (!breadcrumbPanel) { return; }
    if (state.showColumnFlows) {
        breadcrumbPanel.style.display = 'none';
        return;
    }

    if (!nodeId) {
        // Hide breadcrumb if no node selected
        breadcrumbPanel.style.display = 'none';
        state.breadcrumbPath = [];
        return;
    }

    const node = currentNodes.find(n => n.id === nodeId);
    if (!node) {
        breadcrumbPanel.style.display = 'none';
        return;
    }

    // Only show breadcrumb for CTEs, subqueries, or nested structures
    if (node.type !== 'cte' && node.type !== 'subquery' && !node.parentId && !node.depth) {
        breadcrumbPanel.style.display = 'none';
        state.breadcrumbPath = [];
        return;
    }

    // Build breadcrumb path from root to current node
    const path: FlowNode[] = [];
    let current: FlowNode | undefined = node;

    while (current) {
        path.unshift(current);
        if (current.parentId) {
            current = currentNodes.find(n => n.id === current!.parentId);
        } else {
            break;
        }
    }

    // Always include "Main Query" at the beginning if we have CTEs
    if (path.length > 0 && path[0].type === 'cte') {
        path.unshift({
            id: 'main-query',
            label: 'Main Query',
            type: 'select',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            depth: 0
        });
    }

    state.breadcrumbPath = path;
    renderBreadcrumb();
}

function renderBreadcrumb(): void {
    if (!breadcrumbPanel || state.breadcrumbPath.length === 0) {
        if (breadcrumbPanel) {
            breadcrumbPanel.style.display = 'none';
        }
        return;
    }

    breadcrumbPanel.innerHTML = '';
    breadcrumbPanel.style.display = 'flex';
    breadcrumbPanel.style.alignItems = 'center';
    breadcrumbPanel.style.gap = '8px';
    breadcrumbPanel.style.background = state.isDarkTheme ? UI_COLORS.backgroundPanel : UI_COLORS.backgroundPanelLight;
    breadcrumbPanel.style.borderColor = state.isDarkTheme ? UI_COLORS.border : 'rgba(0, 0, 0, 0.1)';
    breadcrumbPanel.style.color = state.isDarkTheme ? UI_COLORS.textSubtle : '#475569';

    const crumbText = state.isDarkTheme ? '#f1f5f9' : '#0f172a';
    const crumbMuted = state.isDarkTheme ? '#94a3b8' : '#475569';
    const crumbHover = state.isDarkTheme ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.08)';
    const separatorColor = state.isDarkTheme ? '#64748b' : '#94a3b8';

    state.breadcrumbPath.forEach((node, index) => {
        // Create breadcrumb item
        const item = document.createElement('span');
        item.style.cssText = `
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.2s;
            font-weight: ${index === state.breadcrumbPath.length - 1 ? '600' : '400'};
            color: ${index === state.breadcrumbPath.length - 1 ? crumbText : crumbMuted};
        `;
        item.textContent = node.label;

        // Add hover effect
        item.addEventListener('mouseenter', () => {
            item.style.background = crumbHover;
        });

        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });

        // Click to focus on this node
        if (node.id !== 'main-query') {
            item.addEventListener('click', () => {
                selectNode(node.id, { skipNavigation: true });
                zoomToNode(node);
                pulseNode(node.id);
            });
        } else {
            // For main query, reset to full view
            item.addEventListener('click', () => {
                selectNode(null);
                resetView();
            });
        }

        breadcrumbPanel!.appendChild(item);

        // Add separator
        if (index < state.breadcrumbPath.length - 1) {
            const separator = document.createElement('span');
            separator.style.color = separatorColor;
            separator.style.fontSize = '10px';
            separator.textContent = '›';
            breadcrumbPanel!.appendChild(separator);
        }
    });
}

function highlightConnectedEdges(nodeId: string, highlight: boolean): void {
    const isDark = state.isDarkTheme;
    const defaultStroke = isDark ? '#333333' : '#CBD5E1';
    const edges = mainGroup?.querySelectorAll('.edge');
    edges?.forEach(edge => {
        const source = edge.getAttribute('data-source');
        const target = edge.getAttribute('data-target');
        if (source === nodeId || target === nodeId) {
            if (highlight) {
                edge.setAttribute('stroke', EDGE_COLORS.highlight);
                edge.setAttribute('stroke-width', '2.5');
                edge.setAttribute('marker-end', 'url(#arrowhead-highlight)');
            } else {
                edge.setAttribute('stroke', defaultStroke);
                edge.setAttribute('stroke-width', '1.5');
                edge.setAttribute('marker-end', 'url(#arrowhead)');
            }
        }
    });
}

/**
 * Renders error message in the visualization area
 * Enhanced to show helpful dialect suggestions when parse errors occur
 */
function renderError(message: string, sourceLine?: string): void {
    if (!mainGroup) { return; }

    // Check if message contains a dialect suggestion (from improved error handling in sqlParser)
    const hasSuggestion = message.includes('Try ') && message.includes(' dialect');
    const hasSourceLine = Boolean(sourceLine);
    const parts = hasSuggestion ? message.split('. ') : [message];

    // Shift everything up when we have more lines to show
    const extraLines = (hasSourceLine ? 1 : 0) + (hasSuggestion ? 2 : 0);
    const baseOffset = extraLines > 0 ? -3 * extraLines : 0;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(0, -20)');

    // Error icon (shape-based so it renders consistently across editors)
    const iconY = hasSuggestion ? '45%' : hasSourceLine ? '46%' : '48%';
    const iconCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    iconCircle.setAttribute('cx', '50%');
    iconCircle.setAttribute('cy', `${parseFloat(iconY) + baseOffset}%`);
    iconCircle.setAttribute('r', '11');
    iconCircle.setAttribute('fill', state.isDarkTheme ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.12)');
    iconCircle.setAttribute('stroke', STATUS_COLORS.error);
    iconCircle.setAttribute('stroke-width', '1.5');
    g.appendChild(iconCircle);

    const iconMark = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconMark.setAttribute('x', '50%');
    iconMark.setAttribute('y', `${parseFloat(iconY) + 0.6 + baseOffset}%`);
    iconMark.setAttribute('text-anchor', 'middle');
    iconMark.setAttribute('fill', STATUS_COLORS.error);
    iconMark.setAttribute('font-size', '15');
    iconMark.setAttribute('font-weight', '700');
    iconMark.textContent = '!';
    g.appendChild(iconMark);

    // Main error message
    const errorMsgY = hasSuggestion ? 52 : hasSourceLine ? 53 : 55;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', `${errorMsgY + baseOffset}%`);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', STATUS_COLORS.error);
    text.setAttribute('font-size', '14');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    text.textContent = hasSuggestion ? parts[0] : `Error: ${message}`;
    g.appendChild(text);

    // Source line (monospace, shown below the error message)
    let nextY = errorMsgY + baseOffset + 6;
    if (hasSourceLine) {
        const sourceText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        sourceText.setAttribute('x', '50%');
        sourceText.setAttribute('y', `${nextY}%`);
        sourceText.setAttribute('text-anchor', 'middle');
        sourceText.setAttribute('fill', UI_COLORS.textMuted);
        sourceText.setAttribute('font-size', '11');
        sourceText.setAttribute('font-family', 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace');
        sourceText.textContent = `→ ${sourceLine}`;
        g.appendChild(sourceText);
        nextY += 6;
    }

    // Suggestion line (if present)
    if (hasSuggestion && parts[1]) {
        const suggestion = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        suggestion.setAttribute('x', '50%');
        suggestion.setAttribute('y', `${nextY}%`);
        suggestion.setAttribute('text-anchor', 'middle');
        suggestion.setAttribute('fill', UI_COLORS.textMuted);
        suggestion.setAttribute('font-size', '12');
        suggestion.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        suggestion.textContent = `Tip: ${parts[1]}`;
        g.appendChild(suggestion);

        // Hint about dialect selector
        const hint = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        hint.setAttribute('x', '50%');
        hint.setAttribute('y', `${nextY + 6}%`);
        hint.setAttribute('text-anchor', 'middle');
        hint.setAttribute('fill', UI_COLORS.textDim);
        hint.setAttribute('font-size', '11');
        hint.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        hint.textContent = 'Change dialect using the dropdown in the top-left toolbar';
        g.appendChild(hint);
    }

    mainGroup.appendChild(g);
}

function selectNode(nodeId: string | null, options?: { skipNavigation?: boolean }): void {
    state.selectedNodeId = nodeId;

    // Update visual selection
    const nodeGroups = mainGroup?.querySelectorAll('.node');
    nodeGroups?.forEach(g => {
        const rect = g.querySelector('.node-rect');
        const id = g.getAttribute('data-id');
        if (rect && id) {
            if (id === nodeId) {
                rect.setAttribute('stroke', UI_COLORS.white);
                rect.setAttribute('stroke-width', '3');
                rect.setAttribute('filter', 'url(#glow)');
                highlightConnectedEdges(id, true);
            } else {
                rect.removeAttribute('stroke');
                rect.removeAttribute('stroke-width');
                rect.setAttribute('filter', 'url(#shadow)');
            }
        }
    });

    // Clear edge highlights if nothing selected
    if (!nodeId) {
        const edges = mainGroup?.querySelectorAll('.edge');
        edges?.forEach(edge => {
            edge.setAttribute('stroke', EDGE_COLORS.default);
            edge.setAttribute('stroke-width', '2');
            edge.setAttribute('marker-end', 'url(#arrowhead)');
        });
    }

    // Phase 1 Feature: Click Node → Jump to SQL
    // Navigate to the SQL definition when a node is clicked
    // Skip navigation when zooming/focusing to keep keyboard focus in webview
    if (nodeId && !options?.skipNavigation) {
        const node = currentNodes.find(n => n.id === nodeId);
        if (node && typeof window !== 'undefined') {
            const vscodeApi = (window as any).vscodeApi;
            if (vscodeApi && vscodeApi.postMessage) {
                // Try to find line number from node or search in SQL
                let lineNumber = node.startLine;

                // Fallback: If no line number assigned, search for table name in SQL
                // This handles cases where line number assignment might have failed
                if (!lineNumber && node.type === 'table' && currentSql) {
                    const tableName = node.label.toLowerCase();
                    const escapedTableName = escapeRegex(tableName);
                    const tableRegex = new RegExp(`\\b${escapedTableName}\\b`);
                    const sqlLines = currentSql.split('\n');
                    for (let i = 0; i < sqlLines.length; i++) {
                        const line = sqlLines[i].toLowerCase();
                        // Look for table name as a word boundary match to avoid partial matches
                        if (tableRegex.test(line)) {
                            lineNumber = i + 1;
                            break;
                        }
                    }
                }

                if (lineNumber) {
                    vscodeApi.postMessage({
                        command: 'goToLine',
                        line: lineNumber
                    });
                }
            }
        }
    }

    // Update details panel
    updateDetailsPanel(nodeId);

    // Update breadcrumb navigation
    updateBreadcrumb(nodeId);
}

/** Apply pulse animation to a rect element (shared by pulseNode and pulseNodeInCloud) */
function applyPulseToRect(rect: SVGRectElement, restoreStroke: () => void): void {
    if (prefersReducedMotion()) {
        restoreStroke();
        return;
    }
    rect.style.animation = 'node-pulse 0.6s ease-out';
    if (!document.getElementById('pulse-animation-style')) {
        const style = document.createElement('style');
        style.id = 'pulse-animation-style';
        style.textContent = `
            @keyframes node-pulse {
                0% {
                    stroke: #818cf8;
                    stroke-width: 6px;
                    filter: url(#glow) brightness(1.3);
                }
                50% {
                    stroke: #6366f1;
                    stroke-width: 4px;
                    filter: url(#glow) brightness(1.1);
                }
                100% {
                    stroke: inherit;
                    stroke-width: inherit;
                    filter: url(#shadow);
                }
            }
        `;
        document.head.appendChild(style);
    }
    setTimeout(() => {
        rect.style.animation = '';
        restoreStroke();
    }, 600);
}

/**
 * Add a pulse animation to a node to draw user attention
 * Called when jumping to a node from search, explore, or table clicks
 */
function pulseNode(nodeId: string): void {
    const nodeGroup = mainGroup?.querySelector(`.node[data-id="${nodeId}"]`) as SVGGElement;
    if (!nodeGroup) { return; }

    const rect = nodeGroup.querySelector('.node-rect') as SVGRectElement;
    if (!rect) { return; }

    const origStroke = rect.getAttribute('stroke') || '';
    const origStrokeWidth = rect.getAttribute('stroke-width') || '';

    applyPulseToRect(rect, () => {
        if (state.selectedNodeId === nodeId) {
            rect.setAttribute('stroke', UI_COLORS.white);
            rect.setAttribute('stroke-width', '3');
            rect.setAttribute('filter', 'url(#glow)');
        } else {
            if (origStroke) {
                rect.setAttribute('stroke', origStroke);
            } else {
                rect.removeAttribute('stroke');
            }
            if (origStrokeWidth) {
                rect.setAttribute('stroke-width', origStrokeWidth);
            } else {
                rect.removeAttribute('stroke-width');
            }
            rect.setAttribute('filter', 'url(#shadow)');
        }
    });
}

/**
 * Pulse a sub-node inside a CTE/subquery cloud (cloud-subflow-node with data-node-id).
 * Used when navigating to a table from Query Stats so we highlight the table/join node inside the cloud, not the CTE.
 * Uses a more prominent multi-pulse animation with persistent highlight since sub-nodes are smaller.
 */
function pulseNodeInCloud(subNodeId: string, parentNodeId: string): void {
    if (prefersReducedMotion()) { return; }
    const cloudContainer = mainGroup?.querySelector(`.cloud-container[data-node-id="${parentNodeId}"]`) as SVGGElement;
    if (!cloudContainer) { return; }

    const subGroup = cloudContainer.querySelector(`.cloud-subflow-node[data-node-id="${subNodeId}"]`) as SVGGElement;
    if (!subGroup) { return; }

    const rect = subGroup.querySelector('rect') as SVGRectElement;
    if (!rect) { return; }

    const origStroke = rect.getAttribute('stroke') || '';
    const origStrokeWidth = rect.getAttribute('stroke-width') || '';
    const origFilter = rect.getAttribute('filter') || '';

    // Add enhanced pulse animation style for cloud sub-nodes (multi-pulse, more prominent)
    if (!document.getElementById('cloud-pulse-animation-style')) {
        const style = document.createElement('style');
        style.id = 'cloud-pulse-animation-style';
        style.textContent = `
            @keyframes cloud-node-pulse {
                0%, 100% {
                    stroke: #fbbf24;
                    stroke-width: 4px;
                    filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.8));
                }
                25% {
                    stroke: #f59e0b;
                    stroke-width: 5px;
                    filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.9));
                }
                50% {
                    stroke: #fbbf24;
                    stroke-width: 4px;
                    filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.8));
                }
                75% {
                    stroke: #f59e0b;
                    stroke-width: 5px;
                    filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.9));
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Apply multi-pulse animation (1.5s = ~3 pulses)
    rect.style.animation = 'cloud-node-pulse 1.5s ease-in-out';

    // After animation, keep a subtle highlight for 2 more seconds
    setTimeout(() => {
        rect.style.animation = '';
        // Keep highlight glow
        rect.setAttribute('stroke', '#fbbf24');
        rect.setAttribute('stroke-width', '3');
        rect.setAttribute('filter', 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.6))');

        // Fade back to original after 2 seconds
        setTimeout(() => {
            rect.style.transition = 'stroke 0.5s ease, stroke-width 0.5s ease, filter 0.5s ease';
            if (origStroke) {
                rect.setAttribute('stroke', origStroke);
            } else {
                rect.setAttribute('stroke', UI_COLORS.borderWhite);
            }
            if (origStrokeWidth) {
                rect.setAttribute('stroke-width', origStrokeWidth);
            } else {
                rect.setAttribute('stroke-width', '2');
            }
            rect.setAttribute('filter', origFilter || 'url(#shadow)');

            // Clean up transition after fade
            setTimeout(() => {
                rect.style.transition = '';
            }, 500);
        }, 2000);
    }, 1500);
}

/**
 * Navigate to a connected node using arrow keys for accessibility
 * @param direction - 'upstream' (ArrowUp) or 'downstream' (ArrowDown)
 * @returns true if navigation occurred, false if no connected node found
 */
function getKeyboardNavigationNodes(): FlowNode[] {
    return getKeyboardNavigableNodes({
        nodes: currentNodes,
        edges: currentEdges,
        focusModeEnabled: state.focusModeEnabled,
        focusMode: state.focusMode,
        selectedNodeId: state.selectedNodeId,
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
    const sourceNodeId = fromNodeId || state.selectedNodeId;
    if (!sourceNodeId) { return false; }

    const selectedNode = currentNodes.find(n => n.id === sourceNodeId);
    if (!selectedNode) { return false; }

    // Find connected nodes based on direction
    let connectedNodeIds: string[] = [];

    if (direction === 'upstream') {
        // Find nodes that are sources (edges where selected node is target)
        connectedNodeIds = currentEdges
            .filter(e => e.target === sourceNodeId)
            .map(e => e.source);
    } else {
        // Find nodes that are targets (edges where selected node is source)
        connectedNodeIds = currentEdges
            .filter(e => e.source === sourceNodeId)
            .map(e => e.target);
    }

    if (state.focusModeEnabled) {
        const visibleIds = new Set(getKeyboardNavigationNodes().map(node => node.id));
        connectedNodeIds = connectedNodeIds.filter(id => visibleIds.has(id));
    }

    if (connectedNodeIds.length === 0) { return false; }

    // If there are multiple connected nodes, cycle through them
    // Track the last visited index for this direction
    const stateKey = `lastNav_${direction}_${sourceNodeId}`;
    const lastIndex = (state as any)[stateKey] || -1;
    const nextIndex = (lastIndex + 1) % connectedNodeIds.length;
    (state as any)[stateKey] = nextIndex;

    // Navigate to the connected node
    const targetNodeId = connectedNodeIds[nextIndex];
    const targetNode = currentNodes.find(n => n.id === targetNodeId);

    if (targetNode) {
        moveKeyboardFocusToNode(targetNode);
        return true;
    }

    return false;
}

/**
 * Navigate to adjacent node in the visual order (for accessibility)
 * Uses Y position primarily, then X position for nodes at same level
 */
function navigateToAdjacentNode(currentNode: FlowNode, direction: 'next' | 'prev'): void {
    const sortedNodes = getKeyboardNavigationNodes();
    const targetNode = getCycledNode(sortedNodes, currentNode.id, direction);
    if (!targetNode) { return; }

    moveKeyboardFocusToNode(targetNode);
}

function navigateToSiblingNode(currentNode: FlowNode, direction: 'next' | 'prev'): boolean {
    const navigableNodes = getKeyboardNavigationNodes();
    const layoutType = state.layoutType || 'vertical';
    const targetNode = getSiblingCycleTarget({
        nodes: navigableNodes,
        currentNode,
        direction,
        layoutType,
    });

    if (!targetNode || targetNode.id === currentNode.id) {
        return false;
    }

    moveKeyboardFocusToNode(targetNode);
    return true;
}

/**
 * Check if a node is visible within the current viewport
 */
function isNodeInViewport(node: FlowNode, margin: number = 50): boolean {
    if (!svg) { return true; }

    const rect = svg.getBoundingClientRect();

    // Calculate node's screen position
    const nodeLeft = node.x * state.scale + state.offsetX;
    const nodeRight = (node.x + node.width) * state.scale + state.offsetX;
    const nodeTop = node.y * state.scale + state.offsetY;
    const nodeBottom = (node.y + node.height) * state.scale + state.offsetY;

    // Check if node is within viewport bounds (with margin)
    return nodeLeft >= -margin &&
           nodeRight <= rect.width + margin &&
           nodeTop >= -margin &&
           nodeBottom <= rect.height + margin;
}

/**
 * Ensure a node is visible, panning minimally if needed
 * Only pans if the node is outside the viewport
 */
function ensureNodeVisible(node: FlowNode): void {
    if (!svg || isNodeInViewport(node)) { return; }

    const rect = svg.getBoundingClientRect();
    const margin = 100; // Padding from viewport edge

    // Calculate node's screen position
    const nodeLeft = node.x * state.scale + state.offsetX;
    const nodeRight = (node.x + node.width) * state.scale + state.offsetX;
    const nodeTop = node.y * state.scale + state.offsetY;
    const nodeBottom = (node.y + node.height) * state.scale + state.offsetY;

    // Calculate minimal pan needed to bring node into view
    let deltaX = 0;
    let deltaY = 0;

    if (nodeRight > rect.width - margin) {
        deltaX = rect.width - margin - nodeRight;
    } else if (nodeLeft < margin) {
        deltaX = margin - nodeLeft;
    }

    if (nodeBottom > rect.height - margin) {
        deltaY = rect.height - margin - nodeBottom;
    } else if (nodeTop < margin) {
        deltaY = margin - nodeTop;
    }

    if (deltaX !== 0 || deltaY !== 0) {
        state.offsetX += deltaX;
        state.offsetY += deltaY;
        updateTransform();
    }
}

/**
 * Center the view on a node without hiding other nodes
 * Used for keyboard navigation where we want to keep all nodes visible
 */
function centerOnNode(node: FlowNode): void {
    if (!svg) { return; }

    const rect = svg.getBoundingClientRect();
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;

    // Center the node in the viewport
    state.offsetX = rect.width / 2 - centerX * state.scale;
    state.offsetY = rect.height / 2 - centerY * state.scale;

    updateTransform();
}

function updateDetailsPanel(nodeId: string | null): void {
    if (!detailsPanel) { return; }

    if (!nodeId) {
        detailsPanel.style.transform = 'translate(calc(100% + 16px), -50%)';
        return;
    }

    const node = currentNodes.find(n => n.id === nodeId);
    if (!node) { return; }
    ensureDetailsPanelExpanded();
    const isDark = state.isDarkTheme;
    const sectionLabelColor = isDark ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const detailTextColor = isDark ? UI_COLORS.textSubtle : UI_COLORS.textLightSubtle;
    const detailCardBg = isDark ? UI_COLORS.backgroundSubtle : 'rgba(15, 23, 42, 0.04)';
    const detailDividerColor = isDark ? UI_COLORS.borderLight : 'rgba(15, 23, 42, 0.08)';
    const sectionBorderColor = isDark ? UI_COLORS.border : 'rgba(15, 23, 42, 0.12)';
    const headingColor = isDark ? UI_COLORS.text : UI_COLORS.textLight;
    const closeButtonColor = isDark ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const footerColor = isDark ? UI_COLORS.textDim : UI_COLORS.textLightDim;
    const badgeTextColor = isDark ? '#ffffff' : UI_COLORS.textLight;
    const nodeBadgeTitleColor = isDark ? '#ffffff' : UI_COLORS.textLight;
    const nodeBadgeSubtitleColor = isDark ? UI_COLORS.whiteMuted : UI_COLORS.textLightMuted;

    detailsPanel.style.transform = 'translate(0, -50%)';

    // Build details section based on node type
    let detailsSection = '';

    // Window function details
    if (node.windowDetails && node.windowDetails.functions.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Window Functions</div>
                ${node.windowDetails.functions.map(func => `
                    <div style="background: ${detailCardBg}; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                        <div style="color: ${BADGE_COLORS.functionName}; font-weight: 600; font-size: 11px; font-family: ${MONO_FONT_STACK}; margin-bottom: 4px;">
                            ${escapeHtml(func.name)}()
                        </div>
                        ${func.partitionBy && func.partitionBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                <span style="background: ${BADGE_COLORS.partitionBy}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">PARTITION BY</span>
                                <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(func.partitionBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.orderBy && func.orderBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                <span style="background: ${BADGE_COLORS.orderBy}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">ORDER BY</span>
                                <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(func.orderBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.frame ? `
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="background: ${BADGE_COLORS.frame}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">FRAME</span>
                                <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(func.frame)}</span>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Aggregate function details
    if (node.aggregateDetails && node.aggregateDetails.functions.length > 0) {
        detailsSection += `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Aggregate Functions</div>
                ${node.aggregateDetails.functions.map(func => `
                    <div style="background: ${detailCardBg}; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                        <div style="color: ${BADGE_COLORS.frame}; font-weight: 600; font-size: 11px; font-family: ${MONO_FONT_STACK}; margin-bottom: 2px;">
                            ${escapeHtml(func.expression)}
                        </div>
                        ${func.alias ? `
                            <div style="color: ${sectionLabelColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">
                                Alias: ${escapeHtml(func.alias)}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
                ${node.aggregateDetails.groupBy && node.aggregateDetails.groupBy.length > 0 ? `
                    <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid ${sectionBorderColor};">
                        <div style="color: ${sectionLabelColor}; font-size: 10px; margin-bottom: 2px;">GROUP BY:</div>
                        <div style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(node.aggregateDetails.groupBy.join(', '))}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // CASE statement details
    if (node.caseDetails && node.caseDetails.cases.length > 0) {
        detailsSection += `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">CASE Statements</div>
                ${node.caseDetails.cases.map((caseStmt) => `
                    <div style="background: ${detailCardBg}; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                        ${caseStmt.alias ? `
                            <div style="color: ${COMPLEXITY_COLORS.Moderate}; font-weight: 600; font-size: 11px; margin-bottom: 4px;">
                                ${escapeHtml(caseStmt.alias)}
                            </div>
                        ` : ''}
                        ${caseStmt.conditions.map((cond) => `
                            <div style="margin-bottom: 4px;">
                                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 1px;">
                                    <span style="background: ${BADGE_COLORS.partitionBy}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">WHEN</span>
                                    <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(cond.when)}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 4px; margin-left: 28px;">
                                    <span style="background: ${BADGE_COLORS.orderBy}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">THEN</span>
                                    <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(cond.then)}</span>
                                </div>
                            </div>
                        `).join('')}
                        ${caseStmt.elseValue ? `
                            <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                                <span style="background: ${BADGE_COLORS.frame}; color: ${badgeTextColor}; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">ELSE</span>
                                <span style="color: ${detailTextColor}; font-size: 10px; font-family: ${MONO_FONT_STACK};">${escapeHtml(caseStmt.elseValue)}</span>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
    // Children details for CTEs and subqueries
    else if (node.children && node.children.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Internal Structure</div>
                <div style="background: ${detailCardBg}; border-radius: 4px; padding: 6px 8px;">
                    ${node.children.map(child => `
                        <div style="display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid ${detailDividerColor};">
                            <span style="background: ${getNodeColor(child.type)}; padding: 2px 6px; border-radius: 3px; color: ${badgeTextColor}; font-size: 9px; font-weight: 500;">
                                ${getNodeVisualIcon(child)} ${escapeHtml(child.label)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    // Standard details
    else if (node.details && node.details.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 10px;">
                <div style="color: ${sectionLabelColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Details</div>
                <div style="background: ${detailCardBg}; border-radius: 4px; padding: 8px;">
                    ${node.details.map(d => `
                        <div style="color: ${detailTextColor}; font-size: 11px; padding: 2px 0; font-family: ${MONO_FONT_STACK};">
                            ${escapeHtml(d)}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const traceColumnsAction = shouldShowTraceColumnsAction(currentColumnFlows?.length || 0) ? `
        <button id="trace-columns-btn" style="
            width: 100%;
            margin-bottom: 10px;
            background: ${state.isDarkTheme ? 'rgba(129, 140, 248, 0.22)' : 'rgba(99, 102, 241, 0.12)'};
            color: ${state.isDarkTheme ? '#c7d2fe' : '#4338ca'};
            border: 1px solid ${state.isDarkTheme ? 'rgba(129, 140, 248, 0.35)' : 'rgba(99, 102, 241, 0.35)'};
            border-radius: 6px;
            padding: 7px 10px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        "><span style="display: inline-flex; width: 12px; height: 12px;">${ICONS.search}</span><span>Trace Column Lineage</span></button>
    ` : '';

    detailsPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0; color: ${headingColor}; font-size: 12px;">Node Details</h3>
            <button id="close-details" style="background: none; border: none; color: ${closeButtonColor}; cursor: pointer; font-size: 18px; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="background: ${getNodeColor(node.type)}; padding: 8px 10px; border-radius: 6px; margin-bottom: 10px;">
            <div style="color: ${nodeBadgeTitleColor}; font-weight: 600; font-size: 12px; margin-bottom: 2px;">
                ${getNodeVisualIcon(node)} ${escapeHtml(node.label)}
            </div>
            <div style="color: ${nodeBadgeSubtitleColor}; font-size: 11px;">
                ${escapeHtml(node.description || '')}
            </div>
        </div>
        ${detailsSection}
        ${traceColumnsAction}
        <div style="color: ${footerColor}; font-size: 10px; margin-top: 12px;">
            Type: ${node.type}<br>
            ID: ${escapeHtml(node.id)}
        </div>
    `;

    // Close button handler
    detailsPanel.querySelector('#close-details')?.addEventListener('click', () => {
        selectNode(null);
    });
    detailsPanel.querySelector('#trace-columns-btn')?.addEventListener('click', () => {
        toggleColumnFlows(true);
    });
}

/**
 * Creates consistent empty state HTML for panels
 */
function createEmptyStateHtml(options: {
    icon: string;
    title: string;
    subtitle?: string;
    actionText?: string;
    actionId?: string;
}): string {
    const isDark = state.isDarkTheme;
    const textColor = isDark ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const subtitleColor = isDark ? UI_COLORS.textDim : UI_COLORS.textLightDim;
    const actionColor = isDark ? '#818cf8' : '#6366f1';

    return `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px 16px;
            text-align: center;
        ">
            <span style="font-size: 24px; margin-bottom: 8px; opacity: 0.6;">${options.icon}</span>
            <span style="color: ${textColor}; font-size: 12px; font-weight: 500;">${options.title}</span>
            ${options.subtitle ? `<span style="color: ${subtitleColor}; font-size: 11px; margin-top: 4px;">${options.subtitle}</span>` : ''}
            ${options.actionText && options.actionId ? `
                <button id="${options.actionId}" style="
                    margin-top: 12px;
                    background: rgba(99, 102, 241, 0.15);
                    color: ${actionColor};
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.15s;
                ">${options.actionText}</button>
            ` : ''}
        </div>
    `;
}

function updateStatsPanel(): void {
    if (!statsPanel || !currentStats) { return; }

    const isDark = state.isDarkTheme;
    const textColor = isDark ? UI_COLORS.text : UI_COLORS.textLight;
    const textColorMuted = isDark ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const textColorDim = isDark ? UI_COLORS.textDim : UI_COLORS.textLightDim;
    const tableTextColor = isDark ? UI_COLORS.textSubtle : UI_COLORS.textLightSubtle;
    const borderColor = isDark ? UI_COLORS.border : UI_COLORS.borderMedium;

    // Build table list HTML
    let tableListHtml = '';
    if (currentTableUsage && currentTableUsage.size > 0) {
        const sortedTables = Array.from(currentTableUsage.entries())
            .sort((a, b) => b[1] - a[1]); // Sort by usage count descending
        
        const allTableNames = sortedTables.map(([name]) => name).join(', ');
        const displayTables = sortedTables.slice(0, 10); // Show top 10 tables

        tableListHtml = `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-size: 10px; color: ${textColorMuted}; font-weight: 600;">Tables Used (${currentTableUsage.size}):</div>
                    <button id="copy-tables-btn" 
                            style="
                                background: ${isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'};
                                border: 1px solid ${isDark ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.3)'};
                                color: ${isDark ? '#a5b4fc' : '#6366f1'};
                                padding: 2px 8px;
                                border-radius: 4px;
                                font-size: 9px;
                                font-weight: 600;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                gap: 4px;
                                transition: all 0.2s;
                            "
                            title="Copy all table names to clipboard"
                            data-tables="${escapeHtml(allTableNames)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy
                    </button>
                </div>
                <div id="table-list" role="listbox" aria-label="Tables used in query" style="display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto;">
                    ${displayTables.map(([tableName, count], index) => `
                        <div class="table-list-item"
                             role="option"
                             tabindex="${index === 0 ? '0' : '-1'}"
                             data-table="${escapeHtml(tableName)}"
                             style="
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                font-size: 10px;
                                padding: 4px 6px;
                                border-radius: 4px;
                                cursor: pointer;
                                transition: background 0.15s;
                             "
                             title="Click to find ${escapeHtml(tableName)} in graph">
                            <span style="color: ${tableTextColor}; font-family: ${MONO_FONT_STACK};">${escapeHtml(tableName)}</span>
                            <span style="
                                background: ${count > 1 ? 'rgba(245, 158, 11, 0.2)' : (isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)')};
                                color: ${count > 1 ? '#f59e0b' : textColorMuted};
                                padding: 2px 6px;
                                border-radius: 4px;
                                font-weight: 600;
                                min-width: 20px;
                                text-align: center;
                            ">${count}</span>
                        </div>
                    `).join('')}
                    ${currentTableUsage.size > 10 ? `
                        <div style="font-size: 9px; color: ${textColorDim}; font-style: italic; text-align: center; padding: 4px;">
                            +${currentTableUsage.size - 10} more (use Copy button for all)
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    const summaryMetrics: Array<{ value: number; label: string }> = [
        { value: currentStats.tables, label: currentStats.tables === 1 ? 'Table' : 'Tables' },
        { value: currentStats.joins, label: currentStats.joins === 1 ? 'Join' : 'Joins' },
        { value: currentStats.conditions, label: currentStats.conditions === 1 ? 'Filter' : 'Filters' },
        { value: currentStats.ctes, label: currentStats.ctes === 1 ? 'CTE' : 'CTEs' },
    ];
    if (currentStats.subqueries > 0) {
        summaryMetrics.push({
            value: currentStats.subqueries,
            label: currentStats.subqueries === 1 ? 'Subquery' : 'Subqueries',
        });
    }
    const summaryRowHtml = summaryMetrics
        .map((metric, index) => `
            <span style="display: inline-flex; align-items: baseline; gap: 4px;">
                <span style="color: ${textColor}; font-weight: 700; font-size: 12px;">${metric.value}</span>
                <span style="color: ${textColorMuted}; font-size: 10px; font-weight: 500;">${metric.label}</span>
            </span>
            ${index < summaryMetrics.length - 1 ? `<span aria-hidden="true" style="color: ${textColorDim}; font-size: 11px;">&middot;</span>` : ''}
        `)
        .join('');

    statsPanel.innerHTML = `
        <div id="stats-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;${statsMinimized ? '' : ' margin-bottom: 8px;'} cursor: pointer; user-select: none;" title="${statsMinimized ? 'Expand' : 'Minimize'}">
            <span style="display: inline-flex; align-items: center; gap: 8px;">
                <span style="font-weight: 600; color: ${textColor};">Query Stats</span>
                <span style="
                    background: ${COMPLEXITY_COLORS[currentStats.complexity]};
                    color: white;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                ">${currentStats.complexity}</span>
            </span>
            <span style="display: inline-flex; width: 14px; height: 14px; color: ${textColorMuted}; transform: rotate(${statsMinimized ? '-90deg' : '0deg'}); transition: transform 0.2s ease;">${ICONS.chevronDown}</span>
        </div>
        <div id="stats-body" style="display: ${statsMinimized ? 'none' : 'block'};">
        <div id="query-stats-summary-row" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 8px;">
            ${summaryRowHtml}
        </div>
        ${currentStats.functionsUsed && currentStats.functionsUsed.length > 0 ? (() => {
            const funcs = currentStats.functionsUsed!;
            const categoryOrder = ['aggregate', 'window', 'tvf', 'scalar', 'unknown'] as const;
            const categoryLabels: Record<string, string> = { aggregate: 'Aggregate', window: 'Window', tvf: 'Table-Valued', scalar: 'Scalar', unknown: 'Other' };
            const categoryColors: Record<string, string> = {
                aggregate: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                window: isDark ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.15)',
                tvf: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                scalar: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                unknown: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'
            };
            const categoryTextColors: Record<string, string> = {
                aggregate: '#f59e0b', window: isDark ? '#a78bfa' : '#7c3aed',
                tvf: isDark ? '#34d399' : '#059669', scalar: textColorMuted, unknown: textColorMuted
            };
            const grouped = new Map<string, string[]>();
            for (const f of funcs) {
                const cat = f.category || 'unknown';
                if (!grouped.has(cat)) {grouped.set(cat, []);}
                grouped.get(cat)!.push(f.name);
            }
            return `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
                <div style="font-size: 10px; color: ${textColorMuted}; font-weight: 600; margin-bottom: 6px;">Functions Used (${funcs.length}):</div>
                ${categoryOrder.filter(c => grouped.has(c)).map(cat => `
                    <div style="margin-bottom: 4px;">
                        <div style="font-size: 9px; color: ${textColorDim}; margin-bottom: 2px;">${categoryLabels[cat]}</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                            ${grouped.get(cat)!.map(name => `
                                <span style="
                                    background: ${categoryColors[cat]};
                                    color: ${categoryTextColors[cat]};
                                    padding: 1px 6px;
                                    border-radius: 3px;
                                    font-size: 9px;
                                    font-family: ${MONO_FONT_STACK};
                                    font-weight: 500;
                                ">${escapeHtml(name)}</span>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>`;
        })() : ''}
        ${tableListHtml}
        </div>
    `;

    // Add event listener for stats header toggle
    const statsHeader = statsPanel.querySelector('#stats-header') as HTMLElement | null;
    statsHeader?.addEventListener('click', () => {
        statsMinimized = !statsMinimized;
        updateStatsPanel();
    });

    // Add event listener for copy button
    const copyBtn = statsPanel.querySelector('#copy-tables-btn') as HTMLButtonElement | null;
    if (copyBtn) {
        const baseBg = isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)';
        const hoverBg = isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.15)';
        copyBtn.addEventListener('mouseenter', () => {
            copyBtn.style.background = hoverBg;
        });
        copyBtn.addEventListener('mouseleave', () => {
            copyBtn.style.background = baseBg;
        });

        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const tables = copyBtn.getAttribute('data-tables');
            if (tables) {
                try {
                    await navigator.clipboard.writeText(tables);
                    const originalText = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
                    copyBtn.style.color = isDark ? '#34d399' : '#10b981';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalText;
                        copyBtn.style.color = isDark ? '#a5b4fc' : '#6366f1';
                    }, 2000);
                } catch (err) {
                    // Fallback for browsers that don't support clipboard API
                    const textarea = document.createElement('textarea');
                    textarea.value = tables;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                        document.execCommand('copy');
                        const originalText = copyBtn.innerHTML;
                        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
                        copyBtn.style.color = isDark ? '#34d399' : '#10b981';
                        setTimeout(() => {
                            copyBtn.innerHTML = originalText;
                            copyBtn.style.color = isDark ? '#a5b4fc' : '#6366f1';
                        }, 2000);
                    } catch (e) {
                        window.debugLogging && console.debug('[renderer] Fallback copy failed:', e);
                    }
                    document.body.removeChild(textarea);
                }
            }
        });
    }

    // Add keyboard navigation and click handlers for table list
    const tableList = statsPanel.querySelector('#table-list');
    const tableItems = statsPanel.querySelectorAll('.table-list-item');

    if (tableList && tableItems.length > 0) {
        const hoverBg = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)';
        const focusBg = isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)';

        tableItems.forEach((item, index) => {
            const itemEl = item as HTMLElement;

            // Hover effects
            itemEl.addEventListener('mouseenter', () => {
                if (document.activeElement !== itemEl) {
                    itemEl.style.background = hoverBg;
                }
            });
            itemEl.addEventListener('mouseleave', () => {
                if (document.activeElement !== itemEl) {
                    itemEl.style.background = '';
                }
            });

            // Focus effects
            itemEl.addEventListener('focus', () => {
                itemEl.style.background = focusBg;
                itemEl.style.outline = 'none';
            });
            itemEl.addEventListener('blur', () => {
                itemEl.style.background = '';
            });

            // Click to navigate to table
            itemEl.addEventListener('click', () => {
                navigateToTable(itemEl.getAttribute('data-table') || '');
            });

            // Keyboard navigation
            itemEl.addEventListener('keydown', (e) => {
                const key = e.key;
                let nextIndex = index;

                if (key === 'ArrowDown' || key === 'ArrowRight') {
                    e.preventDefault();
                    nextIndex = Math.min(index + 1, tableItems.length - 1);
                } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
                    e.preventDefault();
                    nextIndex = Math.max(index - 1, 0);
                } else if (key === 'Home') {
                    e.preventDefault();
                    nextIndex = 0;
                } else if (key === 'End') {
                    e.preventDefault();
                    nextIndex = tableItems.length - 1;
                } else if (key === 'Enter' || key === ' ') {
                    e.preventDefault();
                    navigateToTable(itemEl.getAttribute('data-table') || '');
                    return;
                }

                if (nextIndex !== index) {
                    // Update tabindex for roving tabindex pattern
                    itemEl.setAttribute('tabindex', '-1');
                    const nextItem = tableItems[nextIndex] as HTMLElement;
                    nextItem.setAttribute('tabindex', '0');
                    nextItem.focus();
                }
            });
        });
    }

    // Match table name: exact match for type 'table', or join label ending with " <name>" (e.g. "LEFT brands")
    function tableLabelMatches(node: FlowNode, lowerName: string): boolean {
        const label = node.label.toLowerCase();
        if (node.type === 'table') {
            return label === lowerName;
        }
        if (node.type === 'join') {
            return label === lowerName || label.endsWith(' ' + lowerName);
        }
        return false;
    }

    // Recursively find a table by label inside children of a CTE/subquery (handles nested subqueries).
    // JOIN tables in CTEs are emitted as type 'join' with label e.g. "LEFT brands", not type 'table'.
    function findTableInChildren(children: FlowNode[], container: FlowNode, lowerName: string): { table: FlowNode; parent: FlowNode } | null {
        for (const child of children) {
            if (tableLabelMatches(child, lowerName)) {
                return { table: child, parent: container };
            }
            if ((child.type === 'cte' || child.type === 'subquery') && child.children && child.children.length > 0) {
                const found = findTableInChildren(child.children, child, lowerName);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    // Helper to navigate to a table node in the graph
    function navigateToTable(tableName: string) {
        if (!tableName) {
            return;
        }
        const lowerName = tableName.toLowerCase();

        let tableNode: FlowNode | undefined;
        let parentNode: FlowNode | undefined;

        // Search inside CTE/subquery children FIRST so we prefer expanding the cloud when the table exists there.
        // Otherwise we might find a top-level table with the same name and never expand the CTE (e.g. after closing the cloud and clicking another table in the same CTE).
        for (const node of currentNodes) {
            if ((node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0) {
                const found = findTableInChildren(node.children, node, lowerName);
                if (found) {
                    tableNode = found.table;
                    parentNode = found.parent;
                    break;
                }
            }
        }

        // If not found in children, search in top-level nodes
        if (!tableNode) {
            tableNode = currentNodes.find(n =>
                n.type === 'table' && n.label.toLowerCase() === lowerName
            );
        }

        // If table is inside a CTE/subquery (found via parentId, e.g. from flat list with parentId)
        if (!parentNode && tableNode && tableNode.parentId) {
            parentNode = currentNodes.find(n => n.id === tableNode!.parentId);
        }

        if (!tableNode) {
            return;
        }

        // Clear zoom state so zoomToNode actually zooms to the target (don't treat as "toggle off" from previous query)
        state.zoomedNodeId = null;

        // After expanding a cloud, zoom to the parent so the cloud is visible, then highlight the sub-node inside the cloud (e.g. "orders") instead of the CTE.
        const doExpandAndNavigate = (zoomToParent: boolean, subNodeIdToHighlight?: string): void => {
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
            requestAnimationFrame(() => {
                const targetNode = zoomToParent && parentNode ? parentNode : tableNode!;
                selectNode(targetNode.id, { skipNavigation: true });
                zoomToNode(targetNode);
                if (zoomToParent && parentNode && subNodeIdToHighlight) {
                    pulseNodeInCloud(subNodeIdToHighlight, parentNode.id);
                } else {
                    pulseNode(targetNode.id);
                }
            });
        };

        // If target node (table or its parent) is inside a collapsed cluster, expand cluster first so the node is in the DOM
        const nodeToShow = parentNode || tableNode;
        const cluster = getClusterForNode(nodeToShow.id, currentClusters);
        if (cluster && !cluster.expanded) {
            currentClusters = toggleCluster(cluster, currentClusters);
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
            requestAnimationFrame(() => {
                if (parentNode && (parentNode.type === 'cte' || parentNode.type === 'subquery') && !parentNode.expanded) {
                    parentNode.expanded = true;
                    if (parentNode.children) {
                        parentNode.height = 70 + parentNode.children.length * 30;
                    }
                    doExpandAndNavigate(true, tableNode!.id);
                } else {
                    selectNode(tableNode.id, { skipNavigation: true });
                    zoomToNode(tableNode);
                    pulseNode(tableNode.id);
                }
            });
            return;
        }

        // When table is inside a CTE/subquery, always expand the cloud (so it opens even if user had closed it), zoom to it, and highlight the sub-node inside the cloud
        if (parentNode && (parentNode.type === 'cte' || parentNode.type === 'subquery')) {
            // If parent is inside a collapsed cluster (e.g. "CTEs" cluster), expand cluster first so the CTE node is visible
            const cluster = getClusterForNode(parentNode.id, currentClusters);
            if (cluster && !cluster.expanded) {
                currentClusters = toggleCluster(cluster, currentClusters);
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
                requestAnimationFrame(() => {
                    parentNode!.expanded = true;
                    if (parentNode!.children) {
                        parentNode!.height = 70 + parentNode!.children!.length * 30;
                    }
                    doExpandAndNavigate(true, tableNode!.id);
                });
                return;
            }
            // Always expand the parent cloud (opens it if it was collapsed), zoom to it, and highlight the sub-node (e.g. orders) inside the cloud
            parentNode.expanded = true;
            if (parentNode.children) {
                parentNode.height = 70 + parentNode.children.length * 30;
            }
            doExpandAndNavigate(true, tableNode.id);
            return;
        }

        selectNode(tableNode.id, { skipNavigation: true });
        zoomToNode(tableNode);
        pulseNode(tableNode.id);
    }
}

function updateHintsPanel(): void {
    if (!hintsPanel) { return; }
    const panelBottom = parsePixelValue(hintsPanel.style.bottom, PANEL_BASE_BOTTOM);

    const badgeState = getHintBadgeState(currentHints || []);
    updateHintsSummaryBadge(badgeState);

    if (!currentHints || currentHints.length === 0) {
        hintsPanel.style.opacity = '0';
        hintsPanel.style.visibility = 'hidden';
        hintsPanel.style.transform = 'translateY(8px)';
        hintsShowAll = false;
        syncHintsPanelViewportBounds(panelBottom);
        return;
    }

    hintsPanel.style.opacity = '1';
    hintsPanel.style.visibility = 'visible';
    hintsPanel.style.transform = 'translateY(0)';

    const isDark = state.isDarkTheme;
    const textColor = isDark ? UI_COLORS.text : UI_COLORS.textLight;
    const textColorMuted = isDark ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const hintColors = HINT_COLORS;
    const sortedHints = sortHintsByImpact(currentHints);
    const visibleHints = hintsShowAll ? sortedHints : getTopHints(sortedHints, 3);
    const remainingCount = Math.max(0, sortedHints.length - visibleHints.length);

    hintsPanel.innerHTML = `
        <div id="hints-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;${hintsMinimized ? '' : ' margin-bottom: 10px;'} cursor: pointer; user-select: none;" title="${hintsMinimized ? 'Expand' : 'Minimize'}">
            <span style="font-weight: 600; color: ${textColor}; display: inline-flex; align-items: center; gap: 6px;">
                <span style="display: inline-flex; width: 14px; height: 14px;">${ICONS.bolt}</span>
                <span>Performance Hints</span>
            </span>
            <span style="display: inline-flex; align-items: center; gap: 6px;">
                <span style="font-size: 10px; color: ${textColorMuted};">${currentHints.length} total</span>
                <span style="display: inline-flex; width: 14px; height: 14px; color: ${textColorMuted}; transform: rotate(${hintsMinimized ? '-90deg' : '0deg'}); transition: transform 0.2s ease;">${ICONS.chevronDown}</span>
            </span>
        </div>
        <div class="hints-list" style="display: ${hintsMinimized ? 'none' : 'flex'}; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto;">
            ${visibleHints.map(hint => {
                const style = hintColors[hint.type] || hintColors.info;
                const severity = hint.severity || 'low';
                const severityColor = severity === 'high' ? STATUS_COLORS.errorDark : severity === 'medium' ? STATUS_COLORS.warningDark : UI_COLORS.textDim;
                return `
                    <div role="button" tabindex="0" class="hint-item" data-node-id="${hint.nodeId || ''}" style="
                        text-align: left;
                        border: 1px solid ${style.border};
                        border-left-width: 3px;
                        background: ${style.bg};
                        border-radius: 6px;
                        padding: 8px 10px;
                        cursor: ${hint.nodeId ? 'pointer' : 'default'};
                        user-select: text;
                    ">
                        <div style="font-size: 12px; color: ${textColor}; display: flex; align-items: center; gap: 6px;">
                            <span style="display: inline-flex; width: 12px; height: 12px;">${style.icon}</span>
                            <span>${escapeHtml(hint.message)}</span>
                            <span style="margin-left: auto; color: ${severityColor}; font-size: 9px; text-transform: uppercase;">${severity}</span>
                        </div>
                        ${hint.suggestion ? `<div style="font-size: 11px; color: ${textColorMuted}; margin-top: 4px;">${escapeHtml(hint.suggestion)}</div>` : ''}
                    </div>
                `;
            }).join('')}
            ${!hintsShowAll && remainingCount > 0 ? `
                <button id="show-all-hints" style="
                    border: 1px dashed ${isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)'};
                    background: transparent;
                    color: ${isDark ? '#a5b4fc' : '#6366f1'};
                    border-radius: 6px;
                    padding: 6px 10px;
                    font-size: 11px;
                    cursor: pointer;
                ">Show all ${sortedHints.length} hints...</button>
            ` : ''}
            ${hintsShowAll && sortedHints.length > 3 ? `
                <button id="show-top-hints" style="
                    border: 1px dashed ${isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)'};
                    background: transparent;
                    color: ${isDark ? '#a5b4fc' : '#6366f1'};
                    border-radius: 6px;
                    padding: 6px 10px;
                    font-size: 11px;
                    cursor: pointer;
                ">Show top 3 only</button>
            ` : ''}
        </div>
    `;

    hintsPanel.querySelectorAll('.hint-item').forEach((item) => {
        const el = item as HTMLElement;
        const nodeId = el.getAttribute('data-node-id');
        if (!nodeId) {
            el.style.cursor = 'default';
            return;
        }
        el.addEventListener('click', () => {
            const node = currentNodes.find(n => n.id === nodeId);
            if (!node) { return; }
            selectNode(node.id, { skipNavigation: true });
            zoomToNode(node);
            pulseNode(node.id);
        });
    });

    const showAllBtn = hintsPanel.querySelector('#show-all-hints') as HTMLButtonElement | null;
    showAllBtn?.addEventListener('click', () => {
        hintsShowAll = true;
        updateHintsPanel();
    });

    const showTopBtn = hintsPanel.querySelector('#show-top-hints') as HTMLButtonElement | null;
    showTopBtn?.addEventListener('click', () => {
        hintsShowAll = false;
        updateHintsPanel();
    });

    const hintsHeader = hintsPanel.querySelector('#hints-header') as HTMLElement | null;
    hintsHeader?.addEventListener('click', () => {
        hintsMinimized = !hintsMinimized;
        updateHintsPanel();
    });

    syncHintsPanelViewportBounds(panelBottom);
}

function fitView(): void {
    const nodesForFit = renderNodes.length > 0 ? renderNodes : currentNodes;
    if (!svg || nodesForFit.length === 0) { return; }

    const rect = svg.getBoundingClientRect();
    const padding = 80;

    // Calculate bounds including nodes and expanded cloud containers
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodesForFit) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);

        // Account for expanded cloud containers (CTE/subquery)
        if (node.expanded && (node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0) {
            const cloudPadding = 15;
            const cloudGap = 30;
            const nodeHeight = 60;

            // Calculate cloud dimensions based on children layout
            const childEdges = node.childEdges || [];
            const layoutSize = layoutSubflowNodesVertical(node.children, childEdges);
            const cloudWidth = layoutSize.width + cloudPadding * 2;
            const cloudHeight = layoutSize.height + cloudPadding * 2 + 30;

            // Get cloud offset (custom or default)
            const offset = cloudOffsets.get(node.id) || {
                offsetX: -cloudWidth - cloudGap,
                offsetY: -(cloudHeight - nodeHeight) / 2
            };

            const cloudX = node.x + offset.offsetX;
            const cloudY = node.y + offset.offsetY;

            // Include cloud bounds
            minX = Math.min(minX, cloudX);
            minY = Math.min(minY, cloudY);
            maxX = Math.max(maxX, cloudX + cloudWidth);
            maxY = Math.max(maxY, cloudY + cloudHeight);
        }
    }

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    // Account for panels (clamp to minimum to prevent negative scale)
    const availableWidth = Math.max(100, rect.width - 320);
    const availableHeight = Math.max(100, rect.height - 100);

    // Calculate scale to fit
    const scaleX = (availableWidth - padding * 2) / graphWidth;
    const scaleY = (availableHeight - padding * 2) / graphHeight;
    state.scale = Math.max(0.05, Math.min(scaleX, scaleY, 1.5));
    fitViewScale = state.scale; // Treat this as 100% for the zoom indicator

    // Center the graph
    state.offsetX = (availableWidth - graphWidth * state.scale) / 2 - minX * state.scale + 50;
    state.offsetY = (availableHeight - graphHeight * state.scale) / 2 - minY * state.scale + 50;

    // Reset zoom state tracking when fitting view
    state.zoomedNodeId = null;
    state.previousZoomState = null;

    updateTransform();
    updateZoomIndicator();
}

function zoomToNode(node: FlowNode): void {
    if (!svg || !mainGroup) { return; }

    // Simple toggle behavior: if already zoomed to any node, restore to fit view
    if (state.zoomedNodeId !== null) {
        // Show all nodes, edges, and cloud containers again
        const allNodes = mainGroup.querySelectorAll('.node');
        allNodes.forEach(nodeEl => {
            (nodeEl as SVGGElement).style.display = '';
            (nodeEl as SVGGElement).style.opacity = '1';
        });
        const allEdges = mainGroup.querySelectorAll('.edge');
        allEdges.forEach(edgeEl => {
            (edgeEl as SVGPathElement).style.display = '';
            (edgeEl as SVGPathElement).style.opacity = '1';
        });
        const allClouds = mainGroup.querySelectorAll('.cloud-container');
        allClouds.forEach(cloudEl => {
            (cloudEl as SVGGElement).style.display = '';
            (cloudEl as SVGGElement).style.opacity = '1';
        });

        // Clear focus mode and restore to fit view (default state)
        clearFocusMode();
        state.focusModeEnabled = false;
        fitView();
        return;
    }

    // Save current state before zooming (only if not already saved)
    // This preserves the original fit view state so we can restore to it later
    if (!state.previousZoomState) {
        state.previousZoomState = {
            scale: state.scale,
            offsetX: state.offsetX,
            offsetY: state.offsetY
        };
    }

    // Select the node first (skip navigation to keep focus in webview for keyboard shortcuts)
    selectNode(node.id, { skipNavigation: true });

    // Get only immediate neighbors (1 hop away) for context, not all connected nodes
    const immediateNeighbors = new Set<string>();
    immediateNeighbors.add(node.id);
    
    // Find immediate upstream and downstream nodes (direct connections only)
    for (const edge of currentEdges) {
        if (edge.target === node.id) {
            immediateNeighbors.add(edge.source);
        }
        if (edge.source === node.id) {
            immediateNeighbors.add(edge.target);
        }
    }

    // Hide all nodes and edges that are not the clicked node or its immediate neighbors
    const allNodes = mainGroup.querySelectorAll('.node');
    allNodes.forEach(nodeEl => {
        const id = nodeEl.getAttribute('data-id');
        if (id && !immediateNeighbors.has(id)) {
            (nodeEl as SVGGElement).style.display = 'none';
        } else {
            (nodeEl as SVGGElement).style.display = '';
            (nodeEl as SVGGElement).style.opacity = '1';
        }
    });

    // Show/hide cloud containers based on whether their parent node is visible
    const allClouds = mainGroup.querySelectorAll('.cloud-container');
    allClouds.forEach(cloudEl => {
        const nodeId = cloudEl.getAttribute('data-node-id');
        if (nodeId && immediateNeighbors.has(nodeId)) {
            (cloudEl as SVGGElement).style.display = '';
            (cloudEl as SVGGElement).style.opacity = '1';
        } else {
            (cloudEl as SVGGElement).style.display = 'none';
        }
    });

    const allEdges = mainGroup.querySelectorAll('.edge');
    allEdges.forEach(edgeEl => {
        const source = edgeEl.getAttribute('data-source');
        const target = edgeEl.getAttribute('data-target');
        if (source && target && immediateNeighbors.has(source) && immediateNeighbors.has(target)) {
            (edgeEl as SVGPathElement).style.display = '';
            (edgeEl as SVGPathElement).style.opacity = '1';
        } else {
            (edgeEl as SVGPathElement).style.display = 'none';
        }
    });

    // Calculate bounds of visible nodes (the clicked node and its immediate neighbors)
    // Also include expanded cloud containers for CTE/subquery nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const visibleNodes = currentNodes.filter(n => immediateNeighbors.has(n.id));
    for (const n of visibleNodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);

        // If this node is an expanded CTE/subquery, include cloud bounds
        if (n.expanded && (n.type === 'cte' || n.type === 'subquery') && n.children && n.children.length > 0) {
            const cloudPadding = 15;
            const cloudGap = 30;
            // Estimate cloud dimensions (same logic as render)
            const nodeHeight = n.type === 'subquery' ? 60 : 60;
            let cloudWidth = 160;
            let cloudHeight = 150;
            if (n.children.length > 0) {
                // Rough estimate: each child adds to height
                cloudWidth = Math.max(200, n.children.length * 80);
                cloudHeight = Math.max(150, n.children.length * 50 + 50);
            }
            const offset = cloudOffsets.get(n.id) || {
                offsetX: -cloudWidth - cloudGap,
                offsetY: -(cloudHeight - nodeHeight) / 2
            };
            const cloudX = n.x + offset.offsetX;
            const cloudY = n.y + offset.offsetY;
            minX = Math.min(minX, cloudX);
            minY = Math.min(minY, cloudY);
            maxX = Math.max(maxX, cloudX + cloudWidth);
            maxY = Math.max(maxY, cloudY + cloudHeight);
        }
    }

    // If only one node (without expanded cloud), use its bounds with generous padding
    const hasExpandedCloud = node.expanded && (node.type === 'cte' || node.type === 'subquery') && node.children && node.children.length > 0;
    if (visibleNodes.length === 1 && !hasExpandedCloud) {
        const padding = 220;
        minX = node.x - padding;
        minY = node.y - padding;
        maxX = node.x + node.width + padding;
        maxY = node.y + node.height + padding;
    }

    // Calculate zoom to fit the visible nodes in the viewport (cap scale to avoid zooming too much)
    const rect = svg.getBoundingClientRect();
    const availableWidth = rect.width - 320; // Account for panels
    const availableHeight = rect.height - 100;
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    const scaleX = (availableWidth * 0.8) / graphWidth; // Use 80% of available space
    const scaleY = (availableHeight * 0.8) / graphHeight;
    // Cap at 2.5x raw scale OR 180% of fit view scale (whichever is smaller)
    const maxScaleAbsolute = 2.5;
    const maxScaleRelative = fitViewScale > 0 ? fitViewScale * 1.8 : maxScaleAbsolute;
    const targetScale = Math.min(scaleX, scaleY, maxScaleAbsolute, maxScaleRelative);

    // Center the visible nodes
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    state.scale = targetScale;
    state.offsetX = availableWidth / 2 - centerX * state.scale + 50;
    state.offsetY = availableHeight / 2 - centerY * state.scale + 50;
    state.zoomedNodeId = node.id;

    updateTransform();
    updateZoomIndicator();
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
// Debounce timer for search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SEARCH_DEBOUNCE_DELAY = 600; // ms - wait for user to stop typing

let searchCountIndicator: HTMLSpanElement | null = null;

export function setSearchBox(input: HTMLInputElement, countIndicator: HTMLSpanElement): void {
    searchBox = input;
    searchCountIndicator = countIndicator;

    // Expandable search box: expand on focus, collapse on blur if empty
    input.style.transition = 'width 200ms ease';
    input.addEventListener('focus', () => {
        input.style.width = '280px';
    });
    input.addEventListener('blur', () => {
        if (!input.value) {
            input.style.width = '140px';
        }
    });

    input.addEventListener('input', () => {
        // Clear any existing debounce timer
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        // Immediately highlight matches without zooming (for visual feedback)
        highlightMatches(input.value);

        // Update search count indicator
        updateSearchCountDisplay();

        // Debounce the zoom/navigation to first result
        searchDebounceTimer = setTimeout(() => {
            navigateToFirstResult();
        }, SEARCH_DEBOUNCE_DELAY);
    });
}

function updateSearchCountDisplay(): void {
    if (!searchCountIndicator) { return; }

    const term = state.searchTerm;
    const total = state.searchResults.length;
    const hasNodes = currentNodes.length > 0;

    if (!term) {
        searchCountIndicator.style.display = 'none';
        searchCountIndicator.textContent = '';
        return;
    }

    searchCountIndicator.style.display = 'block';

    if (total === 0) {
        // Differentiate: no nodes in graph vs no matching results
        if (!hasNodes) {
            searchCountIndicator.textContent = 'No data';
            searchCountIndicator.style.color = '#94a3b8';
        } else {
            searchCountIndicator.textContent = 'No matches';
            searchCountIndicator.style.color = '#f87171';
        }
    } else {
        const current = state.currentSearchIndex + 1;
        searchCountIndicator.textContent = `${current > 0 ? current : 1}/${total}`;
        searchCountIndicator.style.color = '#64748b';
    }
}

// Highlight matching nodes without navigating (immediate feedback)
function highlightMatches(term: string): void {
    state.searchTerm = term.toLowerCase();
    state.searchResults = [];
    state.currentSearchIndex = -1;

    // Clear previous highlights
    const allNodes = mainGroup?.querySelectorAll('.node');
    allNodes?.forEach(g => {
        g.classList.remove('search-match');
        const rect = g.querySelector('.node-rect');
        if (rect && state.selectedNodeId !== g.getAttribute('data-id')) {
            rect.removeAttribute('stroke');
            rect.removeAttribute('stroke-width');
        }
    });

    if (!term) { return; }

    // Find and highlight matching nodes
    allNodes?.forEach(g => {
        const label = g.getAttribute('data-label') || '';
        const id = g.getAttribute('data-id') || '';
        if (label.includes(state.searchTerm) || id.includes(state.searchTerm)) {
            state.searchResults.push(id);
            g.classList.add('search-match');
            const rect = g.querySelector('.node-rect');
            if (rect) {
                rect.setAttribute('stroke', EDGE_COLORS.highlight);
                rect.setAttribute('stroke-width', '2');
            }
        }
    });
}

// Navigate to first result after debounce delay
function navigateToFirstResult(): void {
    if (state.searchResults.length > 0) {
        navigateSearch(0);
    }
}

function performSearch(term: string): void {
    highlightMatches(term);
    navigateToFirstResult();
    if (term && state.searchResults.length > 0) {
        addBreadcrumbSegment({
            id: 'search',
            label: `Search: "${term}"`,
            onClear: () => {
                if (searchBox) { searchBox.value = ''; }
                clearSearch();
            },
        });
    } else {
        removeBreadcrumbSegment('search');
    }
}

function navigateSearch(delta: number): void {
    if (state.searchResults.length === 0) { return; }

    if (delta === 0) {
        state.currentSearchIndex = 0;
    } else {
        state.currentSearchIndex = (state.currentSearchIndex + delta + state.searchResults.length) % state.searchResults.length;
    }

    // Update count display with new position
    updateSearchCountDisplay();

    const nodeId = state.searchResults[state.currentSearchIndex];
    const node = currentNodes.find(n => n.id === nodeId);
    if (node) {
        zoomToNode(node);
        selectNode(nodeId, { skipNavigation: true });
        // Add pulse animation to draw attention
        pulseNode(nodeId);
    }
}

function clearSearch(): void {
    state.searchTerm = '';
    state.searchResults = [];
    state.currentSearchIndex = -1;

    const allNodes = mainGroup?.querySelectorAll('.node');
    allNodes?.forEach(g => {
        g.classList.remove('search-match');
        const rect = g.querySelector('.node-rect');
        if (rect && state.selectedNodeId !== g.getAttribute('data-id')) {
            rect.removeAttribute('stroke');
            rect.removeAttribute('stroke-width');
        }
    });

    // Reset count display
    updateSearchCountDisplay();
    removeBreadcrumbSegment('search');
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

    return {
        minX: minX || 0,
        minY: minY || 0,
        width: (maxX - minX) || 400,
        height: (maxY - minY) || 300
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
    if (layoutType === 'horizontal') {
        const sx = sourceNode.x + sourceNode.width;
        const sy = sourceNode.y + sourceNode.height / 2;
        const tx = targetNode.x;
        const ty = targetNode.y + targetNode.height / 2;
        const midX = (sx + tx) / 2;
        return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
    } else if (layoutType === 'force' || layoutType === 'radial') {
        // Smart edge routing based on relative positions
        const sourceCenterX = sourceNode.x + sourceNode.width / 2;
        const sourceCenterY = sourceNode.y + sourceNode.height / 2;
        const targetCenterX = targetNode.x + targetNode.width / 2;
        const targetCenterY = targetNode.y + targetNode.height / 2;

        const angle = Math.atan2(targetCenterY - sourceCenterY, targetCenterX - sourceCenterX);

        let sx: number, sy: number, tx: number, ty: number;

        if (Math.abs(angle) < Math.PI / 4) {
            sx = sourceNode.x + sourceNode.width;
            sy = sourceCenterY;
            tx = targetNode.x;
            ty = targetCenterY;
        } else if (Math.abs(angle) > 3 * Math.PI / 4) {
            sx = sourceNode.x;
            sy = sourceCenterY;
            tx = targetNode.x + targetNode.width;
            ty = targetCenterY;
        } else if (angle > 0) {
            sx = sourceCenterX;
            sy = sourceNode.y + sourceNode.height;
            tx = targetCenterX;
            ty = targetNode.y;
        } else {
            sx = sourceCenterX;
            sy = sourceNode.y;
            tx = targetCenterX;
            ty = targetNode.y + targetNode.height;
        }

        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const curvature = Math.min(dist * 0.3, 50);

        const midX = (sx + tx) / 2;
        const midY = (sy + ty) / 2;
        const perpX = -dy / dist * curvature;
        const perpY = dx / dist * curvature;

        return `M ${sx} ${sy} Q ${midX + perpX} ${midY + perpY}, ${tx} ${ty}`;
    } else {
        // Vertical/compact: curved lines from bottom to top
        const sx = sourceNode.x + sourceNode.width / 2;
        const sy = sourceNode.y + sourceNode.height;
        const tx = targetNode.x + targetNode.width / 2;
        const ty = targetNode.y;
        const midY = (sy + ty) / 2;
        return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
    }
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
    if (!state.focusModeEnabled || !mainGroup) {return;}

    const connectedIds = getConnectedNodes(nodeId);
    connectedIds.add(nodeId);

    // Dim unconnected nodes
    const allNodes = mainGroup.querySelectorAll('.node');
    allNodes.forEach(nodeEl => {
        const id = nodeEl.getAttribute('data-id');
        if (id && !connectedIds.has(id)) {
            (nodeEl as SVGGElement).style.opacity = '0.25';
        } else {
            (nodeEl as SVGGElement).style.opacity = '1';
        }
    });

    // Dim unconnected edges
    const allEdges = mainGroup.querySelectorAll('.edge');
    allEdges.forEach(edgeEl => {
        const source = edgeEl.getAttribute('data-source');
        const target = edgeEl.getAttribute('data-target');
        if (source && target && connectedIds.has(source) && connectedIds.has(target)) {
            (edgeEl as SVGPathElement).style.opacity = '1';
        } else {
            (edgeEl as SVGPathElement).style.opacity = '0.15';
        }
    });
}

function clearFocusMode(): void {
    if (!mainGroup) {return;}

    // Clear zoom state
    state.zoomedNodeId = null;
    state.previousZoomState = null;
    state.focusModeEnabled = false;

    // Restore all nodes - both display and opacity
    const allNodes = mainGroup.querySelectorAll('.node');
    allNodes.forEach(nodeEl => {
        (nodeEl as SVGGElement).style.display = '';
        (nodeEl as SVGGElement).style.opacity = '1';
    });

    // Restore all edges - both display and opacity
    const allEdges = mainGroup.querySelectorAll('.edge');
    allEdges.forEach(edgeEl => {
        (edgeEl as SVGPathElement).style.display = '';
        (edgeEl as SVGPathElement).style.opacity = '1';
    });
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
    const connected = new Set<string>();
    const mode = state.focusMode;

    // Find upstream nodes (sources that flow into this node)
    function findUpstream(id: string) {
        for (const edge of currentEdges) {
            if (edge.target === id && !connected.has(edge.source)) {
                connected.add(edge.source);
                findUpstream(edge.source);
            }
        }
    }

    // Find downstream nodes (nodes this flows into)
    function findDownstream(id: string) {
        for (const edge of currentEdges) {
            if (edge.source === id && !connected.has(edge.target)) {
                connected.add(edge.target);
                findDownstream(edge.target);
            }
        }
    }

    // Apply based on focus mode
    if (mode === 'upstream' || mode === 'all') {
        findUpstream(nodeId);
    }
    if (mode === 'downstream' || mode === 'all') {
        findDownstream(nodeId);
    }

    return connected;
}

// ============================================================
// FEATURE: Column Flow Highlighting
// ============================================================

export function highlightColumnSources(columnName: string): void {
    if (!mainGroup) {return;}

    // Find lineage for this column
    const lineage = currentColumnLineage.find(l =>
        l.outputColumn.toLowerCase() === columnName.toLowerCase()
    );

    // Clear previous highlights
    clearColumnHighlights();

    if (!lineage || lineage.sources.length === 0) {return;}

    // Store highlighted node IDs
    state.highlightedColumnSources = lineage.sources.map(s => s.nodeId).filter(Boolean);

    // Highlight source nodes with special glow
    for (const source of lineage.sources) {
        if (!source.nodeId) {continue;}

        const nodeEl = mainGroup.querySelector(`.node[data-id="${source.nodeId}"]`);
        if (nodeEl) {
            const rect = nodeEl.querySelector('.node-rect');
            if (rect) {
                rect.setAttribute('stroke', EDGE_COLORS.columnLineage);
                rect.setAttribute('stroke-width', '3');
                rect.setAttribute('stroke-dasharray', '5,3');
            }
            nodeEl.classList.add('column-source-highlight');
        }
    }

    // Highlight path from sources to SELECT node
    highlightPathToSelect();
}

function highlightPathToSelect(): void {
    if (!mainGroup || state.highlightedColumnSources.length === 0) {return;}

    // Find SELECT node
    const selectNode = currentNodes.find(n => n.type === 'select');
    if (!selectNode) {return;}

    // Highlight edges between sources and select
    const pathNodeIds = new Set<string>(state.highlightedColumnSources);

    // Find all nodes on paths from sources to select
    for (const sourceId of state.highlightedColumnSources) {
        findPath(sourceId, selectNode.id, pathNodeIds);
    }

    // Highlight edges on the path
    const allEdges = mainGroup.querySelectorAll('.edge');
    allEdges.forEach(edgeEl => {
        const source = edgeEl.getAttribute('data-source');
        const target = edgeEl.getAttribute('data-target');
        if (source && target && pathNodeIds.has(source) && pathNodeIds.has(target)) {
            edgeEl.setAttribute('stroke', EDGE_COLORS.columnLineage);
            edgeEl.setAttribute('stroke-width', '3');
            edgeEl.setAttribute('stroke-dasharray', '5,3');
        }
    });
}

function findPath(fromId: string, toId: string, visited: Set<string>): boolean {
    if (fromId === toId) {return true;}

    for (const edge of currentEdges) {
        if (edge.source === fromId && !visited.has(edge.target)) {
            visited.add(edge.target);
            if (findPath(edge.target, toId, visited)) {
                return true;
            }
        }
    }
    return false;
}

function clearColumnHighlights(): void {
    if (!mainGroup) {return;}

    state.highlightedColumnSources = [];

    // Clear node highlights
    const highlightedNodes = mainGroup.querySelectorAll('.column-source-highlight');
    highlightedNodes.forEach(nodeEl => {
        nodeEl.classList.remove('column-source-highlight');
        const rect = nodeEl.querySelector('.node-rect');
        if (rect) {
            rect.removeAttribute('stroke-dasharray');
            if (state.selectedNodeId !== nodeEl.getAttribute('data-id')) {
                rect.removeAttribute('stroke');
                rect.removeAttribute('stroke-width');
            }
        }
    });

    // Restore edges
    const allEdges = mainGroup.querySelectorAll('.edge');
    allEdges.forEach(edgeEl => {
        edgeEl.setAttribute('stroke', EDGE_COLORS.default);
        edgeEl.setAttribute('stroke-width', '2');
        edgeEl.removeAttribute('stroke-dasharray');
        edgeEl.setAttribute('marker-end', 'url(#arrowhead)');
    });
}

// ============================================================
// FEATURE: SQL Preview Panel
// ============================================================

export function toggleSqlPreview(show?: boolean): void {
    if (!sqlPreviewPanel) {return;}
    const isHidden = sqlPreviewPanel.style.visibility === 'hidden' || sqlPreviewPanel.style.opacity === '0';
    const shouldShow = show ?? isHidden;

    if (shouldShow) {
        updateSqlPreview();
        sqlPreviewPanel.style.opacity = '1';
        sqlPreviewPanel.style.visibility = 'visible';
        sqlPreviewPanel.style.transform = 'translateY(0)';
    } else {
        sqlPreviewPanel.style.opacity = '0';
        sqlPreviewPanel.style.visibility = 'hidden';
        sqlPreviewPanel.style.transform = 'translateY(16px)';
    }
}

function updateSqlPreview(): void {
    if (!sqlPreviewPanel || !currentSql) {return;}

    const formattedSql = formatSql(currentSql);
    const highlightedSql = highlightSql(formattedSql);
    const sqlHeaderColor = state.isDarkTheme ? UI_COLORS.text : UI_COLORS.textLight;
    const sqlBodyColor = state.isDarkTheme ? UI_COLORS.textBright : UI_COLORS.textLight;
    const sqlCopyButtonBg = state.isDarkTheme ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.12)';
    const sqlCopyButtonBorder = state.isDarkTheme ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.22)';
    const sqlCopyButtonText = state.isDarkTheme ? UI_COLORS.focusText : UI_COLORS.focusTextLight;
    const sqlCloseButtonText = state.isDarkTheme ? UI_COLORS.textDim : UI_COLORS.textLightMuted;

    sqlPreviewPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; color: ${sqlHeaderColor}; font-size: 12px;">SQL Query</span>
            <div style="display: flex; gap: 8px;">
                <button id="copy-sql" style="
                    background: ${sqlCopyButtonBg};
                    border: 1px solid ${sqlCopyButtonBorder};
                    border-radius: 4px;
                    color: ${sqlCopyButtonText};
                    padding: 4px 10px;
                    font-size: 10px;
                    cursor: pointer;
                ">Copy</button>
                <button id="close-sql-preview" style="
                    background: none;
                    border: none;
                    color: ${sqlCloseButtonText};
                    cursor: pointer;
                    font-size: 16px;
                ">&times;</button>
            </div>
        </div>
        <pre style="
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            line-height: 1.5;
            max-height: 150px;
            overflow-y: auto;
            color: ${sqlBodyColor};
        ">${highlightedSql}</pre>
    `;

    sqlPreviewPanel.querySelector('#copy-sql')?.addEventListener('click', () => {
        navigator.clipboard.writeText(formattedSql).then(() => {
            const btn = sqlPreviewPanel?.querySelector('#copy-sql');
            if (btn) {
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
            }
        });
    });

    sqlPreviewPanel.querySelector('#close-sql-preview')?.addEventListener('click', () => {
        toggleSqlPreview(false);
    });
}

// ============================================================
// FEATURE: Collapsible CTEs/Subqueries
// ============================================================

export function toggleNodeCollapse(nodeId: string): void {
    const node = currentNodes.find(n => n.id === nodeId);
    if (!node || !node.collapsible) {return;}

    node.expanded = !node.expanded;

    // Re-render to show collapsed/expanded state
    // This triggers a full re-render which handles the layout Change
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

/**
 * Calculate stacked cloud offsets to prevent overlap when expanding all.
 * Positions each cloud directly above its parent CTE/subquery node.
 * Detects and resolves horizontal overlaps between adjacent clouds.
 */
function calculateStackedCloudOffsets(expandableNodes: FlowNode[]): void {
    const cloudPadding = 15;
    const verticalGap = 80;       // Gap between cloud bottom and node top
    const horizontalGap = 30;     // Minimum gap between clouds horizontally

    // Calculate dimensions for all clouds
    interface CloudInfo {
        node: FlowNode;
        width: number;
        height: number;
        x: number;  // Calculated X position
    }

    const cloudInfos: CloudInfo[] = [];
    for (const node of expandableNodes) {
        const childEdges = currentEdges.filter(e =>
            node.children?.some(c => c.id === e.source || c.id === e.target)
        );
        const layoutSize = layoutSubflowNodesVertical(node.children!, childEdges);
        const width = layoutSize.width + cloudPadding * 2;
        const height = layoutSize.height + cloudPadding * 2 + 30;

        // Initial X: center cloud above its parent node
        const cloudCenterX = node.x + node.width / 2;
        const x = cloudCenterX - width / 2;

        cloudInfos.push({ node, width, height, x });
    }

    // Sort clouds by X position (left to right)
    cloudInfos.sort((a, b) => a.x - b.x);

    // Resolve horizontal overlaps - push clouds apart if they overlap
    for (let i = 1; i < cloudInfos.length; i++) {
        const prev = cloudInfos[i - 1];
        const curr = cloudInfos[i];
        const prevRight = prev.x + prev.width;
        const minX = prevRight + horizontalGap;

        if (curr.x < minX) {
            // Overlap detected - shift current cloud to the right
            curr.x = minX;
        }
    }

    // Find the topmost CTE node Y position
    const minNodeY = Math.min(...expandableNodes.map(n => n.y));

    // Calculate where the bottom of all clouds should be
    const cloudBottomY = minNodeY - verticalGap;

    // Set offsets for each cloud
    for (const cloud of cloudInfos) {
        // Position cloud so its bottom aligns with cloudBottomY
        const cloudY = cloudBottomY - cloud.height;

        // Calculate offset relative to the node's position
        const offsetX = cloud.x - cloud.node.x;
        const offsetY = cloudY - cloud.node.y;

        cloudOffsets.set(cloud.node.id, { offsetX, offsetY });
    }
}

/**
 * Toggle expand/collapse all CTE and subquery nodes.
 * When expanding, clouds are stacked vertically to prevent overlap.
 */
export function toggleExpandAll(): void {
    // Find all expandable nodes (CTE/subquery with children)
    const expandableNodes = currentNodes.filter(
        n => (n.type === 'cte' || n.type === 'subquery') && n.collapsible && n.children && n.children.length > 0
    );

    if (expandableNodes.length === 0) {return;}

    // Determine if we should expand or collapse (toggle based on majority state)
    const expandedCount = expandableNodes.filter(n => n.expanded).length;
    const shouldExpand = expandedCount < expandableNodes.length / 2;

    // Set all expandable nodes to the target state
    for (const node of expandableNodes) {
        node.expanded = shouldExpand;
        // Initialize cloud view state if expanding
        if (shouldExpand && !cloudViewStates.has(node.id)) {
            cloudViewStates.set(node.id, {
                scale: 1,
                offsetX: 0,
                offsetY: 0,
                isDragging: false,
                dragStartX: 0,
                dragStartY: 0
            });
        }
    }

    // Calculate stacked cloud offsets to prevent overlap
    if (shouldExpand) {
        calculateStackedCloudOffsets(expandableNodes);
    } else {
        // Clear cloud offsets on collapse
        for (const node of expandableNodes) {
            cloudOffsets.delete(node.id);
        }
    }

    // Re-render and fit view
    const result: ParseResult = {
        nodes: currentNodes,
        edges: currentEdges,
        stats: currentStats!,
        hints: currentHints,
        sql: currentSql,
        columnLineage: currentColumnLineage,
        tableUsage: currentTableUsage,
        columnFlows: currentColumnFlows  // Preserve column flows for 'C' shortcut to work
    };

    const wasHorizontal = state.layoutType === 'horizontal';
    render(result);
    if (wasHorizontal) {
        state.layoutType = 'vertical';
        toggleLayout();
    }

    // Fit view to show all clouds after a brief delay for render to complete
    setTimeout(() => fitView(), 100);
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
    const tableCount = currentNodes.filter(n => n.type === 'table').length;
    const depth = calculateQueryDepth();

    return {
        nodeCount: currentNodes.length,
        tableCount,
        depth,
        isComplex: currentNodes.length >= 8 || tableCount >= 5 || depth >= 3
    };
}

function calculateQueryDepth(): number {
    // Calculate max depth (longest path from any table to result)
    const resultNode = currentNodes.find(n => n.type === 'result');
    if (!resultNode) {return 0;}

    const visited = new Set<string>();
    let maxDepth = 0;

    function dfs(nodeId: string, depth: number) {
        if (visited.has(nodeId)) {return;}
        visited.add(nodeId);
        maxDepth = Math.max(maxDepth, depth);

        for (const edge of currentEdges) {
            if (edge.target === nodeId) {
                dfs(edge.source, depth + 1);
            }
        }
    }

    dfs(resultNode.id, 0);
    return maxDepth;
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
    if (columnLineagePanel) {
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

let selectedColumnLineage: ColumnFlow | null = null;
let columnLineagePanel: HTMLElement | null = null;

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
    const styleId = 'column-lineage-panel-scroll-style';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }
    const { thumb, thumbHover, track } = getScrollbarColors(state.isDarkTheme);
    style.textContent = `
        #column-lineage-panel {
            scrollbar-width: thin;
            scrollbar-color: ${thumb} ${track};
        }
        #column-lineage-panel::-webkit-scrollbar {
            width: 10px;
        }
        #column-lineage-panel::-webkit-scrollbar-track {
            background: ${track};
            border-radius: 8px;
        }
        #column-lineage-panel::-webkit-scrollbar-thumb {
            background: ${thumb};
            border-radius: 8px;
            border: 2px solid transparent;
            background-clip: padding-box;
        }
        #column-lineage-panel::-webkit-scrollbar-thumb:hover {
            background: ${thumbHover};
            background-clip: padding-box;
        }
    `;
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
    // Always remove existing panel first (fixes stale panel when switching queries)
    hideColumnLineagePanel();
    ensureColumnLineagePanelScrollbarStyles();

    if (!currentColumnFlows || currentColumnFlows.length === 0) {
        // No column flows for this query type (e.g., UPDATE, DELETE, INSERT)
        return;
    }

    // Create panel
    columnLineagePanel = document.createElement('div');
    columnLineagePanel.id = 'column-lineage-panel';
    columnLineagePanel.style.cssText = `
        position: fixed;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        background: ${state.isDarkTheme ? 'rgba(17, 17, 17, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${state.isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)'};
        border-radius: 8px;
        padding: 12px;
        max-height: 70vh;
        overflow-y: auto;
        z-index: ${Z_INDEX.dropdown};
        box-shadow: ${state.isDarkTheme ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)'};
        min-width: 200px;
        max-width: 260px;
        backdrop-filter: blur(8px);
        scrollbar-width: thin;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        font-weight: 600;
        font-size: 12px;
        color: ${state.isDarkTheme ? '#f1f5f9' : '#1e293b'};
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid ${state.isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    header.innerHTML = `
        <span>Column Lineage</span>
        <span style="display: inline-flex; align-items: center; gap: 8px;">
            <span style="font-size: 9px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'};">Click to trace</span>
            <button id="column-lineage-panel-close" type="button" style="
                border: none;
                background: transparent;
                color: ${state.isDarkTheme ? '#94a3b8' : '#64748b'};
                cursor: pointer;
                font-size: 14px;
                line-height: 1;
                padding: 0 2px;
            " aria-label="Close column lineage panel">×</button>
        </span>
    `;
    columnLineagePanel.appendChild(header);
    const panelCloseBtn = header.querySelector('#column-lineage-panel-close') as HTMLButtonElement | null;
    panelCloseBtn?.addEventListener('click', () => toggleColumnFlows(false));

    // Allow Escape to dismiss column lineage when the panel itself has focus
    columnLineagePanel.setAttribute('tabindex', '-1');
    columnLineagePanel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            toggleColumnFlows(false);
        }
    });

    // Column search input
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `
        margin-bottom: 8px;
        position: relative;
    `;
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search columns...';
    searchInput.style.cssText = `
        width: 100%;
        padding: 6px 8px 6px 28px;
        border: 1px solid ${state.isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)'};
        border-radius: 4px;
        background: ${state.isDarkTheme ? 'rgba(26, 26, 26, 0.8)' : 'rgba(250, 250, 250, 0.9)'};
        color: ${state.isDarkTheme ? '#f1f5f9' : '#1e293b'};
        font-size: 11px;
        outline: none;
        box-sizing: border-box;
    `;
    const searchIcon = document.createElement('span');
    searchIcon.innerHTML = ICONS.search;
    searchIcon.style.cssText = `
        position: absolute;
        left: 8px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 10px;
        opacity: 0.6;
    `;
    searchContainer.appendChild(searchIcon);
    searchContainer.appendChild(searchInput);
    columnLineagePanel.appendChild(searchContainer);

    // List output columns
    const columnList = document.createElement('div');
    columnList.id = 'column-lineage-list';
    columnList.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    for (const flow of currentColumnFlows) {
        const columnItem = createColumnItem(flow);
        columnItem.setAttribute('data-column-name', flow.outputColumn.toLowerCase());
        columnList.appendChild(columnItem);
    }

    columnLineagePanel.appendChild(columnList);

    // Search filter functionality
    searchInput.addEventListener('input', (e) => {
        const query = (e.target as HTMLInputElement).value.toLowerCase();
        const items = columnList.querySelectorAll('[data-column-name]');
        items.forEach((item) => {
            const columnName = item.getAttribute('data-column-name') || '';
            const flow = currentColumnFlows.find(f => f.outputColumn.toLowerCase() === columnName);
            // Search in column name and source columns
            const matchesQuery = columnName.includes(query) ||
                (flow && flow.lineagePath.some(step =>
                    step.columnName.toLowerCase().includes(query) ||
                    step.nodeName.toLowerCase().includes(query)
                ));
            (item as HTMLElement).style.display = matchesQuery ? 'block' : 'none';
        });
    });

    document.body.appendChild(columnLineagePanel);
}

/**
 * Create a clickable column item
 */
function createColumnItem(flow: ColumnFlow): HTMLElement {
    const item = document.createElement('div');
    item.style.cssText = `
        padding: 8px 10px;
        background: ${state.isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'};
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 2px solid transparent;
    `;

    // Get first step for summary
    const firstStep = flow.lineagePath[0];

    // Determine overall transformation type
    const hasAggregation = flow.lineagePath.some(s => s.transformation === 'aggregated');
    const hasCalculation = flow.lineagePath.some(s => s.transformation === 'calculated');
    const hasRename = flow.lineagePath.some(s => s.transformation === 'renamed');

    let badge = '';
    let badgeColor = '#10b981';
    if (hasAggregation) {
        badge = 'AGG';
        badgeColor = '#f59e0b';
    } else if (hasCalculation) {
        badge = 'CALC';
        badgeColor = '#8b5cf6';
    } else if (hasRename) {
        badge = 'ALIAS';
        badgeColor = '#3b82f6';
    }

    item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px;">
            <span style="font-weight: 600; font-size: 11px; color: ${state.isDarkTheme ? '#e2e8f0' : '#1e293b'};">
                ${escapeHtml(flow.outputColumn)}
            </span>
            ${badge ? `<span style="
                background: ${badgeColor};
                color: white;
                font-size: 8px;
                font-weight: 600;
                padding: 2px 4px;
                border-radius: 3px;
            ">${badge}</span>` : ''}
        </div>
        <div style="font-size: 9px; color: ${state.isDarkTheme ? '#94a3b8' : '#64748b'};">
            ${firstStep ? escapeHtml(firstStep.nodeName) + '.' + escapeHtml(firstStep.columnName) : 'Unknown source'}
        </div>
    `;

    // Hover effect
    item.addEventListener('mouseenter', () => {
        item.style.background = state.isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    });

    item.addEventListener('mouseleave', () => {
        if (selectedColumnLineage?.id !== flow.id) {
            item.style.background = state.isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)';
            item.style.borderColor = 'transparent';
        }
    });

    // Click to show lineage
    item.addEventListener('click', () => {
        // Update selection state
        selectedColumnLineage = flow;

        // Update all items styling
        const allItems = columnLineagePanel?.querySelectorAll('div[style*="cursor: pointer"]');
        allItems?.forEach((el) => {
            (el as HTMLElement).style.borderColor = 'transparent';
            (el as HTMLElement).style.background = state.isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)';
        });

        // Highlight selected
        item.style.borderColor = '#6366f1';
        item.style.background = state.isDarkTheme ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)';

        // Show lineage path and highlight nodes
        showLineagePath(flow);
        highlightLineageNodes(flow);
    });

    return item;
}

/**
 * Hide the column lineage panel
 */
function hideColumnLineagePanel(): void {
    if (columnLineagePanel) {
        columnLineagePanel.remove();
        columnLineagePanel = null;
    }
    selectedColumnLineage = null;
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
    if (!detailsPanel) {return;}
    ensureDetailsPanelExpanded();

    // Use centralized transformation colors from constants
    const transformationLabels: Record<string, string> = {
        source: 'Source',
        passthrough: 'Pass',
        renamed: 'Renamed',
        aggregated: 'Aggregated',
        calculated: 'Calculated',
        joined: 'Joined'
    };

    // Build path visualization
    let pathHtml = '';
    for (let i = 0; i < flow.lineagePath.length; i++) {
        const step = flow.lineagePath[i];
        const isFirst = i === 0;
        const isLast = i === flow.lineagePath.length - 1;

        pathHtml += `
            <div style="display: flex; align-items: flex-start; gap: 10px; ${!isLast ? 'margin-bottom: 4px;' : ''}">
                <div style="
                    width: 8px;
                    min-width: 8px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                ">
                    <div style="
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: ${getTransformationColor(step.transformation)};
                        ${isFirst ? 'box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);' : ''}
                        ${isLast ? 'box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);' : ''}
                    "></div>
                    ${!isLast ? `<div style="width: 2px; height: 28px; background: ${state.isDarkTheme ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.1)'};"></div>` : ''}
                </div>
                <div style="flex: 1; padding-bottom: ${!isLast ? '8px' : '0'};">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                        <span style="
                            font-weight: 600;
                            font-size: 11px;
                            color: ${state.isDarkTheme ? '#e2e8f0' : '#1e293b'};
                        ">${escapeHtml(step.columnName)}</span>
                        <span style="
                            font-size: 9px;
                            padding: 1px 4px;
                            border-radius: 3px;
                            background: ${getTransformationColor(step.transformation)};
                            color: white;
                        ">${transformationLabels[step.transformation] || step.transformation}</span>
                    </div>
                    <div style="font-size: 10px; color: ${state.isDarkTheme ? '#94a3b8' : '#64748b'};">
                        ${escapeHtml(step.nodeName)}
                        ${step.expression ? `<br><code style="font-size: 9px; color: ${state.isDarkTheme ? '#a5b4fc' : '#6366f1'}; background: ${state.isDarkTheme ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)'}; padding: 1px 4px; border-radius: 3px;">${escapeHtml(step.expression)}</code>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    detailsPanel.innerHTML = `
        <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: ${state.isDarkTheme ? '#f1f5f9' : '#1e293b'};">
            Lineage Path
        </div>
        <div style="
            background: ${state.isDarkTheme ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)'};
            border-radius: 6px;
            padding: 6px 8px;
            margin-bottom: 10px;
        ">
            <div style="font-size: 9px; color: ${state.isDarkTheme ? '#94a3b8' : '#64748b'}; margin-bottom: 2px;">Output Column</div>
            <div style="font-weight: 600; font-size: 12px; color: ${state.isDarkTheme ? '#a5b4fc' : '#6366f1'};">
                ${escapeHtml(flow.outputColumn)}
            </div>
        </div>
        <div style="font-size: 10px; color: ${state.isDarkTheme ? '#94a3b8' : '#64748b'}; margin-bottom: 6px;">
            Transformation Path (${flow.lineagePath.length} steps)
        </div>
        <div style="padding-left: 2px;">
            ${pathHtml}
        </div>
    `;

    detailsPanel.style.transform = 'translate(0, -50%)';
}

/**
 * Highlight nodes in the lineage path with transformation badges
 */
function highlightLineageNodes(flow: ColumnFlow): void {
    if (!mainGroup) {return;}

    // First, clear any existing lineage badges
    clearLineageBadges();

    // Reset all nodes to dimmed state
    const allNodes = mainGroup.querySelectorAll('.node-group');
    allNodes.forEach((node) => {
        (node as SVGElement).style.opacity = '0.3';
    });

    // Reset all edges to dimmed state
    const allEdges = mainGroup.querySelectorAll('.edge-path, .edge-arrow');
    allEdges.forEach((edge) => {
        (edge as SVGElement).style.opacity = '0.15';
    });

    // Get node IDs in the lineage path with their transformations
    const lineageNodeIds = new Set(flow.lineagePath.map(s => s.nodeId));
    const nodeTransformations = new Map<string, LineagePathStep>();
    flow.lineagePath.forEach(step => {
        nodeTransformations.set(step.nodeId, step);
    });

    // Transformation badge config
    const transformationBadges: Record<string, { label: string; color: string; icon: string }> = {
        source: { label: 'SRC', color: '#10b981', icon: '◉' },
        passthrough: { label: 'PASS', color: '#64748b', icon: '→' },
        renamed: { label: 'ALIAS', color: '#3b82f6', icon: '✎' },
        aggregated: { label: 'AGG', color: '#f59e0b', icon: 'Σ' },
        calculated: { label: 'CALC', color: '#8b5cf6', icon: 'ƒ' },
        joined: { label: 'JOIN', color: '#ec4899', icon: '⋈' }
    };

    // Highlight nodes in the path and add transformation badges
    for (const step of flow.lineagePath) {
        const nodeGroup = mainGroup.querySelector(`[data-node-id="${step.nodeId}"]`);
        if (nodeGroup) {
            (nodeGroup as SVGElement).style.opacity = '1';

            // Add glow effect
            const rect = nodeGroup.querySelector('rect');
            if (rect) {
                rect.setAttribute('stroke', EDGE_COLORS.focus);
                rect.setAttribute('stroke-width', '3');

                // Add transformation badge to the node
                const badgeConfig = transformationBadges[step.transformation] || transformationBadges.passthrough;
                const rectBBox = rect.getBBox();
                const badge = createTransformationBadge(
                    rectBBox.x + rectBBox.width - 8,
                    rectBBox.y - 8,
                    badgeConfig.label,
                    badgeConfig.color,
                    badgeConfig.icon
                );
                badge.classList.add('lineage-badge');
                nodeGroup.appendChild(badge);
            }
        }
    }

    // Highlight edges between lineage nodes and add transformation badges
    const allEdgePaths = mainGroup.querySelectorAll('.edge-path');
    allEdgePaths.forEach((edgePath) => {
        const edge = edgePath as SVGElement;
        const sourceId = edge.getAttribute('data-source');
        const targetId = edge.getAttribute('data-target');

        if (sourceId && targetId && lineageNodeIds.has(sourceId) && lineageNodeIds.has(targetId)) {
            edge.style.opacity = '1';
            edge.setAttribute('stroke', EDGE_COLORS.focus);
            edge.setAttribute('stroke-width', '3');

            // Get transformation for target node (what happens to the column at this step)
            const targetStep = nodeTransformations.get(targetId);
            if (targetStep && targetStep.transformation !== 'passthrough' && targetStep.transformation !== 'source') {
                // Add transformation badge on the edge
                const edgeBadgeConfig = transformationBadges[targetStep.transformation];
                if (edgeBadgeConfig) {
                    addEdgeTransformationBadge(edge, edgeBadgeConfig);
                }
            }

            // Also highlight the arrow
            const arrow = mainGroup?.querySelector(`.edge-arrow[data-source="${sourceId}"][data-target="${targetId}"]`);
            if (arrow) {
                (arrow as SVGElement).style.opacity = '1';
            }
        }
    });
}

/**
 * Create a transformation badge SVG element
 */
function createTransformationBadge(x: number, y: number, label: string, color: string, _icon: string): SVGGElement {
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('transform', `translate(${x}, ${y})`);

    // Badge background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '-12');
    bg.setAttribute('y', '-8');
    bg.setAttribute('width', '24');
    bg.setAttribute('height', '16');
    bg.setAttribute('rx', '4');
    bg.setAttribute('fill', color);
    badge.appendChild(bg);

    // Badge text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', '4');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-size', '8');
    text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
    text.textContent = label;
    badge.appendChild(text);

    return badge;
}

/**
 * Add transformation badge on an edge (at midpoint)
 */
function addEdgeTransformationBadge(edge: SVGElement, config: { label: string; color: string; icon: string }): void {
    if (!mainGroup) { return; }

    // Get edge path data to find midpoint
    const pathData = edge.getAttribute('d');
    if (!pathData) { return; }

    // Parse the path to find midpoint (for bezier curves: M x1 y1 C cx1 cy1, cx2 cy2, x2 y2)
    const pathMatch = pathData.match(/M\s*([\d.-]+)\s*([\d.-]+).*?([\d.-]+)\s*([\d.-]+)\s*$/);
    if (!pathMatch) { return; }

    const x1 = parseFloat(pathMatch[1]);
    const y1 = parseFloat(pathMatch[2]);
    const x2 = parseFloat(pathMatch[3]);
    const y2 = parseFloat(pathMatch[4]);

    // Calculate midpoint
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    // Create badge group
    const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badgeGroup.classList.add('lineage-edge-badge');
    badgeGroup.setAttribute('transform', `translate(${midX}, ${midY})`);

    // Badge background with icon
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('r', '10');
    bg.setAttribute('fill', config.color);
    bg.setAttribute('stroke', 'white');
    bg.setAttribute('stroke-width', '1.5');
    badgeGroup.appendChild(bg);

    // Icon/label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', '4');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-size', '10');
    text.setAttribute('font-weight', '700');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
    text.textContent = config.icon;
    badgeGroup.appendChild(text);

    mainGroup.appendChild(badgeGroup);
}

/**
 * Clear lineage badges from nodes and edges
 */
function clearLineageBadges(): void {
    if (!mainGroup) { return; }

    // Remove node badges
    const nodeBadges = mainGroup.querySelectorAll('.lineage-badge');
    nodeBadges.forEach(badge => badge.remove());

    // Remove edge badges
    const edgeBadges = mainGroup.querySelectorAll('.lineage-edge-badge');
    edgeBadges.forEach(badge => badge.remove());
}

/**
 * Clear all lineage highlights
 */
function clearLineageHighlights(): void {
    if (!mainGroup) {return;}

    // Clear transformation badges first
    clearLineageBadges();

    // Reset all nodes
    const allNodes = mainGroup.querySelectorAll('.node-group');
    allNodes.forEach((node) => {
        (node as SVGElement).style.opacity = '1';

        const rect = node.querySelector('rect');
        if (rect) {
            rect.removeAttribute('stroke');
            rect.removeAttribute('stroke-width');
        }
    });

    // Reset all edges
    const allEdges = mainGroup.querySelectorAll('.edge-path');
    allEdges.forEach((edge) => {
        const edgeEl = edge as SVGElement;
        edgeEl.style.opacity = '1';
        edgeEl.setAttribute('stroke', state.isDarkTheme ? EDGE_COLORS.default : EDGE_COLORS.defaultLight);
        edgeEl.setAttribute('stroke-width', '1.5');
    });

    const allArrows = mainGroup.querySelectorAll('.edge-arrow');
    allArrows.forEach((arrow) => {
        (arrow as SVGElement).style.opacity = '1';
    });

    // Hide details panel
    if (detailsPanel) {
        detailsPanel.style.transform = 'translate(100%, -50%)';
    }
}

// ============================================================
// FEATURE: Collapsible Nodes
// ============================================================

function addCollapseButton(node: FlowNode, group: SVGGElement): void {
    const isExpanded = node.expanded !== false;
    const buttonSize = 16;
    const buttonX = node.x + node.width - buttonSize - 6;
    const buttonY = node.y + 6;

    // Button background
    const buttonBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    buttonBg.setAttribute('x', String(buttonX));
    buttonBg.setAttribute('y', String(buttonY));
    buttonBg.setAttribute('width', String(buttonSize));
    buttonBg.setAttribute('height', String(buttonSize));
    buttonBg.setAttribute('rx', '3');
    buttonBg.setAttribute('fill', 'rgba(0, 0, 0, 0.3)');
    buttonBg.setAttribute('class', 'collapse-btn');
    buttonBg.style.cursor = 'pointer';
    group.appendChild(buttonBg);

    // Button icon (+ or -)
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(buttonX + buttonSize / 2));
    icon.setAttribute('y', String(buttonY + buttonSize / 2 + 4));
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('fill', 'white');
    icon.setAttribute('font-size', '12');
    icon.setAttribute('font-weight', '600');
    icon.setAttribute('class', 'collapse-icon');
    icon.style.pointerEvents = 'none';
    icon.textContent = isExpanded ? '−' : '+';
    group.appendChild(icon);

    // Click handler
    buttonBg.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNodeCollapse(node.id);
    });

    // Hover effect
    buttonBg.addEventListener('mouseenter', () => {
        buttonBg.setAttribute('fill', 'rgba(99, 102, 241, 0.5)');
    });
    buttonBg.addEventListener('mouseleave', () => {
        buttonBg.setAttribute('fill', 'rgba(0, 0, 0, 0.3)');
    });
}

// ============================================================
// FEATURE: Keyboard Shortcuts Help
// ============================================================

export function getKeyboardShortcuts(): Array<{ key: string; description: string }> {
    return [
        { key: 'Ctrl/Cmd + Shift + P', description: 'Command palette' },
        { key: 'Ctrl/Cmd + F', description: 'Search nodes' },
        { key: 'Ctrl/Cmd + Z', description: 'Undo layout change' },
        { key: 'Ctrl/Cmd + Shift + Z', description: 'Redo layout change' },
        { key: '/', description: 'Focus search' },
        { key: '+/-', description: 'Zoom in/out' },
        { key: 'R', description: 'Reset view' },
        { key: 'F', description: 'Toggle fullscreen' },
        { key: 'T', description: 'Toggle theme' },
        { key: 'H', description: 'Cycle layouts' },
        { key: '1-5', description: 'Quick layout switch (V/H/C/F/R)' },
        { key: 'S', description: 'Toggle SQL preview' },
        { key: 'C', description: 'Toggle column lineage' },
        { key: 'L', description: 'Toggle legend' },
        { key: 'Q', description: 'Toggle query stats' },
        { key: 'O', description: 'Toggle optimization hints' },
        { key: 'U', description: 'Focus upstream nodes' },
        { key: 'D', description: 'Focus downstream nodes' },
        { key: 'A', description: 'Focus all connected nodes' },
        { key: 'E', description: 'Expand/collapse all CTEs & subqueries' },
        { key: 'Esc', description: 'Close panels / Exit fullscreen' },
        { key: 'Enter', description: 'Next search result' },
        { key: '↑', description: 'Navigate to upstream node' },
        { key: '↓', description: 'Navigate to downstream node' },
        { key: '←/→', description: 'Cycle sibling nodes at same depth' },
        { key: '[', description: 'Previous query (Q2 → Q1)' },
        { key: ']', description: 'Next query (Q2 → Q3)' },
        { key: '?', description: 'Show all shortcuts' }
    ];
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
    const type = joinType.toUpperCase();
    const strokeColor = isDark ? '#94a3b8' : '#475569';

    // SVG Venn diagram icons for different join types
    // Using different colors from node backgrounds for better contrast
    const diagrams: Record<string, string> = {
        'INNER JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
                <path d="M12 3.5 A6 6 0 0 1 12 12.5 A6 6 0 0 1 12 3.5" fill="#6366f1" opacity="0.7"/>
            </svg>`,
        'LEFT JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="#2563eb" opacity="0.6" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'LEFT OUTER JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="#2563eb" opacity="0.6" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'RIGHT JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="#d97706" opacity="0.6" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'RIGHT OUTER JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="#d97706" opacity="0.6" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'FULL JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="#7c3aed" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="#7c3aed" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'FULL OUTER JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="#7c3aed" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="#7c3aed" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'CROSS JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <rect x="2" y="2" width="8" height="12" fill="#dc2626" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
                <rect x="14" y="2" width="8" height="12" fill="#dc2626" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
                <line x1="10" y1="8" x2="14" y2="8" stroke="${strokeColor}" stroke-width="1" stroke-dasharray="2"/>
            </svg>`
    };

    // Find matching diagram
    for (const [key, svg] of Object.entries(diagrams)) {
        if (type.includes(key.replace(' JOIN', '')) || type === key) {
            return svg;
        }
    }

    // Default to inner join
    return diagrams['INNER JOIN'];
}

export function getJoinColor(joinType: string): string {
    const type = joinType.toUpperCase();

    if (type.includes('LEFT')) {return '#3b82f6';}      // Blue
    if (type.includes('RIGHT')) {return '#f59e0b';}     // Amber
    if (type.includes('FULL')) {return '#8b5cf6';}      // Purple
    if (type.includes('CROSS')) {return '#ef4444';}     // Red
    if (type.includes('INNER')) {return '#22c55e';}     // Green

    return '#6366f1'; // Default indigo
}

export function getJoinDescription(joinType: string): string {
    const type = joinType.toUpperCase();

    if (type.includes('LEFT')) {return 'Returns all rows from left table, matched rows from right';}
    if (type.includes('RIGHT')) {return 'Returns all rows from right table, matched rows from left';}
    if (type.includes('FULL')) {return 'Returns all rows from both tables';}
    if (type.includes('CROSS')) {return 'Returns Cartesian product of both tables';}
    if (type.includes('INNER')) {return 'Returns only matching rows from both tables';}

    return 'Combines rows from two tables';
}
