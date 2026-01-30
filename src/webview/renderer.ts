// Import types from centralized type definitions
import {
    FlowNode,
    FlowEdge,
    ColumnFlow,
    ParseResult,
    QueryStats,
    OptimizationHint,
    ColumnLineage,
    ViewState,
    CloudViewState,
    Severity,
    FocusMode,
    LayoutType,
} from './types';

// Import color utilities
import {
    getNodeColor,
    getTransformationColor,
    NODE_COLORS,
    WARNING_COLORS,
    UI_COLORS,
    EDGE_COLORS,
    BADGE_COLORS,
    CONDITION_COLORS,
    NODE_STROKE_COLORS,
    GLOW_COLORS,
    STATUS_COLORS,
    CLOSE_BUTTON_COLORS,
    COMPLEXITY_COLORS,
    TRANSFORMATION_COLORS,
    HINT_COLORS,
} from './constants';

import { formatSql, highlightSql } from './sqlFormatter';
import dagre from 'dagre';
import { layoutGraphHorizontal, layoutGraphCompact, layoutGraphForce, layoutGraphRadial } from './parser/forceLayout';
import { layoutGraph } from './parser/layout';

const state: ViewState = {
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
    focusMode: 'all' as FocusMode,
    layoutType: (window.defaultLayout === 'horizontal' ? 'horizontal' : 'vertical') as LayoutType
};

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
let containerElement: HTMLElement | null = null;
let searchBox: HTMLInputElement | null = null;
let currentNodes: FlowNode[] = [];
let currentEdges: FlowEdge[] = [];
let currentColumnFlows: ColumnFlow[] = [];
let currentStats: QueryStats | null = null;
let currentHints: OptimizationHint[] = [];
let currentSql: string = '';
let currentColumnLineage: ColumnLineage[] = [];
let currentTableUsage: Map<string, number> = new Map();
// Store custom offsets for draggable clouds (nodeId -> { offsetX, offsetY })
let cloudOffsets: Map<string, { offsetX: number; offsetY: number }> = new Map();
// Store references to cloud and arrow elements for dynamic updates
let cloudElements: Map<string, { cloud: SVGRectElement; title: SVGTextElement; arrow: SVGPathElement; subflowGroup: SVGGElement; nestedSvg?: SVGSVGElement; closeButton?: SVGGElement }> = new Map();
// Store per-cloud view state for independent pan/zoom (CloudViewState imported from types)
let cloudViewStates: Map<string, CloudViewState> = new Map();
// Store document event listeners for cleanup
let documentListeners: Array<{ type: string; handler: EventListener }> = [];

export function initRenderer(container: HTMLElement): void {
    // Create SVG element
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('tabindex', '-1'); // Make SVG focusable for keyboard events
    svg.style.background = UI_COLORS.background;
    svg.style.cursor = 'grab';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.zIndex = '1';
    svg.style.outline = 'none'; // Remove focus outline

    // Add defs for markers (arrows) and patterns
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="${EDGE_COLORS.default}" />
        </marker>
        <marker id="arrowhead-highlight" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="${EDGE_COLORS.highlight}" />
        </marker>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
        </filter>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
        <!-- Grid pattern for light theme -->
        <pattern id="grid-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect width="20" height="20" fill="${UI_COLORS.gridBackground}"/>
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${UI_COLORS.gridLine}" stroke-width="1"/>
        </pattern>
    `;
    svg.appendChild(defs);

    // Create background rectangle for pattern (light theme)
    backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    backgroundRect.setAttribute('width', '100%');
    backgroundRect.setAttribute('height', '100%');
    backgroundRect.setAttribute('fill', UI_COLORS.background);
    backgroundRect.style.pointerEvents = 'none';
    svg.appendChild(backgroundRect);

    // Create main group for pan/zoom
    mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(mainGroup);

    container.appendChild(svg);

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
        z-index: 200;
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
        z-index: 150;
        display: none;
        max-width: 80%;
        overflow-x: auto;
        white-space: nowrap;
    `;
    container.appendChild(breadcrumbPanel);

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
        padding: 12px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textMuted};
        z-index: 100;
        max-width: 300px;
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
        padding: 12px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: ${UI_COLORS.textMuted};
        z-index: 100;
        max-width: 350px;
        max-height: 200px;
        overflow-y: auto;
        display: none;
    `;
    container.appendChild(hintsPanel);

    // Create legend panel (color legend)
    legendPanel = document.createElement('div');
    legendPanel.className = 'legend-panel';
    legendPanel.style.cssText = `
        position: absolute;
        left: 16px;
        top: 60px;
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        padding: 12px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        color: ${UI_COLORS.textMuted};
        z-index: 100;
        display: none;
        max-width: 200px;
    `;
    updateLegendPanel();
    container.appendChild(legendPanel);

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
        font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        font-size: 12px;
        color: ${UI_COLORS.textBright};
        z-index: 150;
        display: none;
        overflow-y: auto;
    `;
    container.appendChild(sqlPreviewPanel);

    // Create minimap for large queries
    const minimapContainer = document.createElement('div');
    minimapContainer.id = 'minimap-container';
    minimapContainer.style.cssText = `
        position: absolute;
        right: 16px;
        top: 60px;
        width: 150px;
        height: 100px;
        background: ${UI_COLORS.backgroundPanel};
        border: 1px solid ${UI_COLORS.border};
        border-radius: 8px;
        overflow: hidden;
        z-index: 100;
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
        z-index: 1000;
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
        z-index: 2000;
        display: none;
        min-width: 180px;
        box-shadow: 0 4px 12px ${UI_COLORS.shadowDark};
    `;
    container.appendChild(contextMenuElement);

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

    // Apply initial theme
    applyTheme(state.isDarkTheme);

    // Setup event listeners
    setupEventListeners();

    // Setup ResizeObserver for auto-resize when panel changes
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
        // Debounce resize events
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
        }
        resizeTimeout = setTimeout(() => {
            if (currentNodes.length > 0) {
                fitView();
            }
        }, 150);
    });
    resizeObserver.observe(container);
}

function setupEventListeners(): void {
    if (!svg) { return; }

    // Pan (only if not dragging a node/cloud)
    svg.addEventListener('mousedown', (e) => {
        // Check if clicking on a draggable node or cloud
        const target = e.target as Element;
        const cloudGroup = target.closest('.cloud-container');
        const nodeGroup = target.closest('.node[data-id]');
        if (cloudGroup || nodeGroup) {
            // Node/cloud dragging will be handled by node-specific handlers
            return;
        }
        if (e.target === svg || target.tagName === 'svg') {
            state.isDragging = true;
            state.dragStartX = e.clientX - state.offsetX;
            state.dragStartY = e.clientY - state.offsetY;
            svg!.style.cursor = 'grabbing';
        }
    });

    /**
     * Handle mouse movement for dragging operations:
     * - Cloud dragging: Updates cloud offset independently, keeping node position fixed
     * - Node dragging: Moves node and updates cloud/arrow positions relative to node
     * - Panning: Moves the entire view when dragging on empty space
     */
    svg.addEventListener('mousemove', (e) => {
        if (state.isDraggingCloud && state.draggingCloudNodeId) {
            // Handle cloud container dragging - update cloud offset independently
            // The cloud can be moved anywhere while the node stays in place
            const rect = svg!.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - state.offsetX) / state.scale;
            const mouseY = (e.clientY - rect.top - state.offsetY) / state.scale;
            
            const node = currentNodes.find(n => n.id === state.draggingCloudNodeId);
            if (node) {
                // Calculate new cloud offset relative to node position
                const deltaX = mouseX - state.dragMouseStartX;
                const deltaY = mouseY - state.dragMouseStartY;
                
                const newOffsetX = state.dragCloudStartOffsetX + deltaX;
                const newOffsetY = state.dragCloudStartOffsetY + deltaY;
                
                // Update cloud offset (stored relative to node position)
                cloudOffsets.set(node.id, { offsetX: newOffsetX, offsetY: newOffsetY });
                
                // Update cloud and arrow positions (arrow will adjust based on cloud location)
                updateCloudAndArrow(node);
            }
        } else if (state.isDraggingNode && state.draggingNodeId) {
            // Handle node dragging - move node, cloud follows with relative offset
            // When dragging a CTE/subquery node, the cloud maintains its offset relative to the node
            const rect = svg!.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - state.offsetX) / state.scale;
            const mouseY = (e.clientY - rect.top - state.offsetY) / state.scale;
            
            const deltaX = mouseX - state.dragMouseStartX;
            const deltaY = mouseY - state.dragMouseStartY;
            
            const node = currentNodes.find(n => n.id === state.draggingNodeId);
            if (node) {
                // Update node position
                node.x = state.dragNodeStartX + deltaX;
                node.y = state.dragNodeStartY + deltaY;
                
                // Update cloud and arrow positions (maintains relative offset)
                updateCloudAndArrow(node);
                
                // Also update edges connected to this node
                updateNodeEdges(node);
            }
        } else if (state.isDragging) {
            // Handle panning - move the entire view when dragging on empty space
            state.offsetX = e.clientX - state.dragStartX;
            state.offsetY = e.clientY - state.dragStartY;
            updateTransform();
        }
    });

    svg.addEventListener('mouseup', () => {
        // Restore cloud opacity if dragging cloud
        if (state.isDraggingCloud && state.draggingCloudNodeId) {
            const cloudGroup = mainGroup?.querySelector(`.cloud-container[data-node-id="${state.draggingCloudNodeId}"]`) as SVGGElement;
            if (cloudGroup) {
                cloudGroup.style.opacity = '1';
            }
        }
        
        // Restore node opacity if dragging node
        if (state.isDraggingNode && state.draggingNodeId) {
            const nodeGroup = mainGroup?.querySelector(`.node[data-id="${state.draggingNodeId}"]`) as SVGGElement;
            if (nodeGroup) {
                nodeGroup.style.opacity = '1';
            }
        }
        
        state.isDragging = false;
        state.isDraggingNode = false;
        state.isDraggingCloud = false;
        state.draggingNodeId = null;
        state.draggingCloudNodeId = null;
        svg!.style.cursor = 'grab';
    });

    svg.addEventListener('mouseleave', () => {
        // Restore cloud opacity if dragging cloud
        if (state.isDraggingCloud && state.draggingCloudNodeId) {
            const cloudGroup = mainGroup?.querySelector(`.cloud-container[data-node-id="${state.draggingCloudNodeId}"]`) as SVGGElement;
            if (cloudGroup) {
                cloudGroup.style.opacity = '1';
            }
        }
        
        // Restore node opacity if dragging node
        if (state.isDraggingNode && state.draggingNodeId) {
            const nodeGroup = mainGroup?.querySelector(`.node[data-id="${state.draggingNodeId}"]`) as SVGGElement;
            if (nodeGroup) {
                nodeGroup.style.opacity = '1';
            }
        }
        
        state.isDragging = false;
        state.isDraggingNode = false;
        state.isDraggingCloud = false;
        state.draggingNodeId = null;
        state.draggingCloudNodeId = null;
        svg!.style.cursor = 'grab';
    });

    // Zoom
    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(state.scale * delta, 0.2), 3);

        // Zoom towards mouse position
        const rect = svg!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        state.offsetX = mouseX - (mouseX - state.offsetX) * (newScale / state.scale);
        state.offsetY = mouseY - (mouseY - state.offsetY) * (newScale / state.scale);
        state.scale = newScale;

        updateTransform();
        updateZoomIndicator();
    });

    // Click outside to deselect and reset focus
    svg.addEventListener('click', (e) => {
        if (e.target === svg) {
            selectNode(null);
            clearFocusMode();
        }
    });

    // SVG-specific keyboard handler (for when SVG has focus after clicking nodes)
    svg.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            selectNode(null);
            clearFocusMode();
            hideContextMenu();
            if (searchBox) {
                searchBox.value = '';
                clearSearch();
            }
            requestAnimationFrame(() => {
                resetView();
            });
        }
    });

    // Keyboard shortcuts
    const keydownHandler = (e: KeyboardEvent) => {
        // Don't trigger shortcuts when typing in input fields
        const isInputFocused = document.activeElement?.tagName === 'INPUT' ||
                               document.activeElement?.tagName === 'TEXTAREA';

        // Ctrl/Cmd + F for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            searchBox?.focus();
            return;
        }

        // Escape to close panels, exit fullscreen, and reset view
        if (e.key === 'Escape') {
            if (state.isFullscreen) {
                toggleFullscreen(false);
            }
            selectNode(null);
            clearFocusMode();
            hideContextMenu();
            if (searchBox) {
                searchBox.value = '';
                clearSearch();
            }
            // Use requestAnimationFrame to ensure DOM updates are applied before fitView
            requestAnimationFrame(() => {
                resetView();
            });
            return;
        }

        // Enter to go to next search result
        if (e.key === 'Enter' && document.activeElement === searchBox) {
            navigateSearch(1);
            return;
        }

        // Skip other shortcuts if input is focused
        if (isInputFocused) {return;}

        // Skip single-key shortcuts if modifier keys are pressed
        // This allows native browser shortcuts (Ctrl+C, Cmd+V, etc.) to work normally
        if (e.metaKey || e.ctrlKey || e.altKey) {return;}

        // + or = to zoom in
        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            zoomIn();
        }
        // - to zoom out
        if (e.key === '-') {
            e.preventDefault();
            zoomOut();
        }
        // R to reset view
        if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            resetView();
        }
        // F to toggle fullscreen
        if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            toggleFullscreen();
        }
        // T to toggle theme
        if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            toggleTheme();
        }
        // H to toggle layout
        if (e.key === 'h' || e.key === 'H') {
            e.preventDefault();
            toggleLayout();
        }
        // S to show SQL preview
        if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            toggleSqlPreview();
        }
        // C to toggle column flows
        if (e.key === 'c' || e.key === 'C') {
            e.preventDefault();
            toggleColumnFlows();
        }
        // Q to toggle query stats panel
        if (e.key === 'q' || e.key === 'Q') {
            e.preventDefault();
            toggleStats();
        }
        // O to toggle optimization hints panel
        if (e.key === 'o' || e.key === 'O') {
            e.preventDefault();
            toggleHints();
        }
        // U for upstream focus mode
        if (e.key === 'u' || e.key === 'U') {
            e.preventDefault();
            setFocusMode('upstream');
        }
        // D for downstream focus mode
        if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            setFocusMode('downstream');
        }
        // A for all connected focus mode
        if (e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            setFocusMode('all');
        }
        // E to toggle expand/collapse all CTEs and subqueries
        if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            toggleExpandAll();
        }
        // / to focus search (like vim)
        if (e.key === '/') {
            e.preventDefault();
            searchBox?.focus();
        }

        // Arrow keys to navigate between connected nodes (accessibility)
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            if (state.selectedNodeId) {
                e.preventDefault();
                navigateToConnectedNode('upstream');
            }
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            if (state.selectedNodeId) {
                e.preventDefault();
                navigateToConnectedNode('downstream');
            }
        }
    };
    document.addEventListener('keydown', keydownHandler);
    documentListeners.push({ type: 'keydown', handler: keydownHandler as EventListener });
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
}

function updateTransform(): void {
    if (mainGroup) {
        mainGroup.setAttribute('transform', `translate(${state.offsetX}, ${state.offsetY}) scale(${state.scale})`);
        // Update minimap viewport when panning/zooming
        const viewport = document.getElementById('minimap-viewport');
        if (viewport) {
            requestAnimationFrame(() => {
                const event = new CustomEvent('transform-update');
                document.dispatchEvent(event);
            });
        }
    }
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
    if (!cloudOffsets.has(node.id)) {
        cloudOffsets.set(node.id, { offsetX: -cloudWidth - cloudGap, offsetY: -(cloudHeight - nodeHeight) / 2 });
    }
    const offset = cloudOffsets.get(node.id)!;
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
        
        // Recalculate connection points (center bottom of source to center top of target)
        const x1 = sourceNode.x + sourceNode.width / 2;
        const y1 = sourceNode.y + sourceNode.height;
        const x2 = targetNode.x + targetNode.width / 2;
        const y2 = targetNode.y;
        
        // Update path with curved connection
        const midY = (y1 + y2) / 2;
        edgePath.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
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

export function render(result: ParseResult): void {
    if (!mainGroup) { return; }

    // Clear any selected node when rendering new query (fixes details panel staying open on tab switch)
    selectNode(null);

    currentNodes = result.nodes;
    currentEdges = result.edges;
    currentStats = result.stats;
    currentHints = result.hints;
    currentSql = result.sql;
    currentColumnLineage = result.columnLineage || [];
    currentTableUsage = result.tableUsage || new Map();

    // Reset highlight state
    state.highlightedColumnSources = [];

    // Reset zoom state when rendering new query
    state.zoomedNodeId = null;
    state.previousZoomState = null;

    // Clear previous content
    mainGroup.innerHTML = '';

    if (result.error) {
        renderError(result.error);
        updateStatsPanel();
        updateHintsPanel();
        return;
    }

    if (result.nodes.length === 0) {
        renderError('No visualization data');
        updateStatsPanel();
        updateHintsPanel();
        return;
    }

    // Store column flows
    currentColumnFlows = result.columnFlows || [];

    // Pre-calculate dimensions for expandable nodes (CTE/subquery) before rendering
    // This ensures edges are drawn correctly
    preCalculateExpandableDimensions(result.nodes);

    // Render edges first (behind nodes)
    const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgesGroup.setAttribute('class', 'edges');
    for (const edge of result.edges) {
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
    for (const node of result.nodes) {
        renderNode(node, nodesGroup);
    }
    mainGroup.appendChild(nodesGroup);

    // Update panels
    updateStatsPanel();
    updateHintsPanel();

    // Update SQL preview if visible
    if (sqlPreviewPanel && sqlPreviewPanel.style.display !== 'none') {
        updateSqlPreview();
    }

    // Fit view
    fitView();

    // Update minimap for complex queries
    updateMinimap();
}

function renderNode(node: FlowNode, parent: SVGGElement): void {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'node');
    group.setAttribute('data-id', node.id);
    group.setAttribute('data-label', node.label.toLowerCase());
    group.style.cursor = 'pointer';

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

    // Hover effect with tooltip
    const rect = group.querySelector('.node-rect') as SVGRectElement;
    if (rect) {
        // Get the correct color based on node type
        const getColor = () => {
            if (node.type === 'join') {
                const joinType = node.label || 'INNER JOIN';
                return getJoinColor(joinType);
            }
            return getNodeColor(node.type);
        };
        
        group.addEventListener('mouseenter', (e) => {
            rect.setAttribute('fill', lightenColor(getColor(), 20));
            highlightConnectedEdges(node.id, true);
            showTooltip(node, e as MouseEvent);
        });

        group.addEventListener('mousemove', (e) => {
            updateTooltipPosition(e as MouseEvent);
        });

        group.addEventListener('mouseleave', () => {
            rect.setAttribute('fill', getColor());
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

function renderStandardNode(node: FlowNode, group: SVGGElement): void {
    // Determine visual style based on table category
    const isTable = node.type === 'table';
    const tableCategory = node.tableCategory || 'physical';
    const isDark = state.isDarkTheme;
    
    // Text colors based on theme - standard nodes always have colored backgrounds, so white text is usually fine
    // But for light theme, we might need darker text on lighter backgrounds
    // Since standard nodes use colored backgrounds (blue, purple, etc.), white text should work
    // But let's be safe and use theme-aware colors for better contrast
    const textColor = isDark ? UI_COLORS.white : UI_COLORS.white; // Keep white for colored backgrounds
    const textColorMuted = isDark ? UI_COLORS.whiteMuted : UI_COLORS.whiteBright;
    const textColorDim = isDark ? UI_COLORS.whiteDim : UI_COLORS.whiteMuted;
    const strokeColor = isDark ? UI_COLORS.borderWhite : 'rgba(0, 0, 0, 0.2)';

    // Background rect
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', getNodeColor(node.type));
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');

    // Apply different styles based on table category and access mode
    if (isTable) {
        // Access mode coloring (read/write differentiation)
        if (node.accessMode === 'write') {
            // Write operations: Red border with "WRITE" emphasis
            rect.setAttribute('stroke', NODE_STROKE_COLORS.write);
            rect.setAttribute('stroke-width', '3');
        } else if (node.accessMode === 'read') {
            // Read operations: Blue border
            rect.setAttribute('stroke', NODE_STROKE_COLORS.read);
            rect.setAttribute('stroke-width', '3');
        } else if (tableCategory === 'cte_reference') {
            // CTE reference: double border effect with dashed inner
            rect.setAttribute('stroke', NODE_STROKE_COLORS.cte);
            rect.setAttribute('stroke-width', '3');
            rect.setAttribute('stroke-dasharray', '8,4');
        } else if (tableCategory === 'derived' || node.accessMode === 'derived') {
            // Derived table: dashed border
            rect.setAttribute('stroke', NODE_STROKE_COLORS.derived);
            rect.setAttribute('stroke-width', '2');
            rect.setAttribute('stroke-dasharray', '5,3');
        } else {
            // Physical table: solid border for emphasis
            rect.setAttribute('stroke', strokeColor);
            rect.setAttribute('stroke-width', '2');
        }
    }

    // Add complexity indicator (colored glow for medium/high complexity)
    if (node.complexityLevel && node.complexityLevel !== 'low') {
        const complexityColor = node.complexityLevel === 'high' ?
            GLOW_COLORS.high :
            GLOW_COLORS.medium;

        rect.setAttribute('stroke', complexityColor.replace('0.4', '0.8'));
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('stroke-dasharray', '4,2');
    }

    group.appendChild(rect);

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

    // Warning badges (top-left corner)
    if (node.warnings && node.warnings.length > 0) {
        const warningBadgeSize = 18;
        const warningX = node.x - 6;
        const warningY = node.y - 6;

        // Badge background circle
        const warningCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        warningCircle.setAttribute('cx', String(warningX + warningBadgeSize / 2));
        warningCircle.setAttribute('cy', String(warningY + warningBadgeSize / 2));
        warningCircle.setAttribute('r', String(warningBadgeSize / 2));
        warningCircle.setAttribute('fill', getWarningColor(node.warnings[0].severity));
        warningCircle.setAttribute('filter', 'url(#shadow)');
        group.appendChild(warningCircle);

        // Warning icon
        const warningIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        warningIcon.setAttribute('x', String(warningX + warningBadgeSize / 2));
        warningIcon.setAttribute('y', String(warningY + warningBadgeSize / 2 + 5));
        warningIcon.setAttribute('text-anchor', 'middle');
        warningIcon.setAttribute('fill', 'white');
        warningIcon.setAttribute('font-size', '12');
        warningIcon.setAttribute('font-weight', '700');
        warningIcon.textContent = getWarningIcon(node.warnings[0].type);
        group.appendChild(warningIcon);

        // If multiple warnings, show count
        if (node.warnings.length > 1) {
            const countBadge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            countBadge.setAttribute('x', String(warningX + warningBadgeSize + 2));
            countBadge.setAttribute('y', String(warningY + 10));
            countBadge.setAttribute('fill', getWarningColor(node.warnings[0].severity));
            countBadge.setAttribute('font-size', '9');
            countBadge.setAttribute('font-weight', '700');
            countBadge.textContent = `+${node.warnings.length - 1}`;
            group.appendChild(countBadge);
        }
    }

    // Icon based on type
    const icon = getNodeIcon(node.type);
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
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
    
    // Text colors based on theme - use white for dark theme, dark for light theme
    const textColor = isDark ? '#ffffff' : '#1e293b';
    const textColorMuted = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(30,41,59,0.8)';
    const textColorDim = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(30,41,59,0.7)';

    // Background rect with join-specific color
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', joinColor);
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

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
        condition.setAttribute('font-family', 'monospace');
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
        const defaultCloudX = node.x - cloudWidth - cloudGap;
        const defaultCloudY = node.y - (cloudHeight - nodeHeight) / 2;
        
        // Get custom offset or use default
        const offset = cloudOffsets.get(node.id) || { offsetX: -cloudWidth - cloudGap, offsetY: -(cloudHeight - nodeHeight) / 2 };
        const cloudX = node.x + offset.offsetX;
        const cloudY = node.y + offset.offsetY;

        // Create cloud container group for dragging
        const cloudGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        cloudGroup.setAttribute('class', 'cloud-container');
        cloudGroup.setAttribute('data-node-id', node.id);
        cloudGroup.style.cursor = 'move';

        // Cloud container with dashed border (matching subquery style)
        const cloud = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        cloud.setAttribute('x', String(cloudX));
        cloud.setAttribute('y', String(cloudY));
        cloud.setAttribute('width', String(cloudWidth));
        cloud.setAttribute('height', String(cloudHeight));
        cloud.setAttribute('rx', '16');
        cloud.setAttribute('fill', UI_COLORS.backgroundDark);
        cloud.setAttribute('stroke', getNodeColor(node.type));
        cloud.setAttribute('stroke-width', '2');
        cloud.setAttribute('stroke-dasharray', '6,3');
        cloud.setAttribute('filter', 'url(#shadow)');
        cloudGroup.appendChild(cloud);

        // Cloud title (subquery alias)
        const cloudTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        cloudTitle.setAttribute('x', String(cloudX + cloudWidth / 2));
        cloudTitle.setAttribute('y', String(cloudY + 20));
        cloudTitle.setAttribute('text-anchor', 'middle');
        cloudTitle.setAttribute('fill', UI_COLORS.whiteDim);
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
        const cloudState = cloudViewStates.get(node.id)!;

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
            const cloudState = cloudViewStates.get(node.id)!;
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
            const cloudState = cloudViewStates.get(node.id)!;
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
        arrowPath.setAttribute('stroke', getNodeColor(node.type));
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

    // Main subquery node (with dashed border)
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(nodeWidth));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', UI_COLORS.backgroundDark);
    rect.setAttribute('stroke', getNodeColor(node.type));
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '6,3');
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Subquery icon
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', String(node.x + 12));
    iconText.setAttribute('y', String(node.y + 26));
    iconText.setAttribute('fill', getNodeColor(node.type));
    iconText.setAttribute('font-size', '14');
    iconText.textContent = '⊂';
    group.appendChild(iconText);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 30));
    label.setAttribute('y', String(node.y + 26));
    label.setAttribute('fill', 'white');
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', 'monospace');
    label.textContent = truncate(node.label, 14);
    group.appendChild(label);

    // Description
    const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    descText.setAttribute('x', String(node.x + 12));
    descText.setAttribute('y', String(node.y + 45));
    descText.setAttribute('fill', UI_COLORS.whiteFaint);
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

        // Cloud container background
        const cloud = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        cloud.setAttribute('x', String(cloudX));
        cloud.setAttribute('y', String(cloudY));
        cloud.setAttribute('width', String(cloudWidth));
        cloud.setAttribute('height', String(cloudHeight));
        cloud.setAttribute('rx', '16');
        cloud.setAttribute('fill', UI_COLORS.backgroundDark);
        cloud.setAttribute('stroke', getNodeColor(node.type));
        cloud.setAttribute('stroke-width', '2');
        cloud.setAttribute('filter', 'url(#shadow)');
        cloudGroup.appendChild(cloud);

        // Cloud title (CTE name without "WITH ")
        const cteName = node.label.replace('WITH ', '');
        const cloudTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        cloudTitle.setAttribute('x', String(cloudX + cloudWidth / 2));
        cloudTitle.setAttribute('y', String(cloudY + 20));
        cloudTitle.setAttribute('text-anchor', 'middle');
        cloudTitle.setAttribute('fill', UI_COLORS.whiteDim);
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
        const cloudState = cloudViewStates.get(node.id)!;

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
            const cloudState = cloudViewStates.get(node.id)!;
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
            const cloudState = cloudViewStates.get(node.id)!;
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
        arrowPath.setAttribute('stroke', getNodeColor(node.type));
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

    // Main CTE node (simple reference box)
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(nodeWidth));
    rect.setAttribute('height', String(nodeHeight));
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', getNodeColor(node.type));
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Icon
    const icon = getNodeIcon(node.type);
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', String(node.x + 14));
    iconText.setAttribute('y', String(node.y + 26));
    iconText.setAttribute('fill', UI_COLORS.whiteBright);
    iconText.setAttribute('font-size', '14');
    iconText.textContent = icon;
    group.appendChild(iconText);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 34));
    label.setAttribute('y', String(node.y + 26));
    label.setAttribute('fill', 'white');
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = truncate(node.label, 16);
    group.appendChild(label);

    // Description or child count
    const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    descText.setAttribute('x', String(node.x + 14));
    descText.setAttribute('y', String(node.y + 45));
    descText.setAttribute('fill', UI_COLORS.whiteDim);
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
    if (children.length === 0) {
        return { width: 200, height: 100 };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: 'LR', // Left to right for horizontal flow inside container
        nodesep: 30,
        ranksep: 40,
        marginx: 20,
        marginy: 20
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Set default sizes for child nodes
    for (const child of children) {
        // Set appropriate width based on label length
        const labelWidth = Math.max(80, child.label.length * 7 + 30);
        child.width = labelWidth;
        child.height = 36;
        g.setNode(child.id, { width: child.width, height: child.height });
    }

    // Add edges
    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    // Run layout
    dagre.layout(g);

    // Apply positions (relative to container)
    let maxX = 0;
    let maxY = 0;
    for (const child of children) {
        const layoutNode = g.node(child.id);
        if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
            child.x = layoutNode.x - child.width / 2;
            child.y = layoutNode.y - child.height / 2;
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
        }
    }

    return {
        width: maxX + 20, // Add padding
        height: maxY + 20
    };
}

// Layout children nodes VERTICALLY (top to bottom) for cloud visualization
function layoutSubflowNodesVertical(children: FlowNode[], edges: FlowEdge[]): { width: number; height: number } {
    if (children.length === 0) {
        return { width: 120, height: 100 };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
        rankdir: 'TB', // Top to bottom for vertical flow
        nodesep: 20,   // Increased spacing for full-size nodes
        ranksep: 35,   // Increased spacing for full-size nodes
        marginx: 15,
        marginy: 15
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Set full-size dimensions for child nodes (matching main canvas nodes)
    for (const child of children) {
        child.width = 180;   // Full-size like main nodes
        child.height = 60;   // Full-size like main nodes
        g.setNode(child.id, { width: child.width, height: child.height });
    }

    // Add edges
    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    // Run layout
    dagre.layout(g);

    // Apply positions
    let maxX = 0;
    let maxY = 0;
    for (const child of children) {
        const layoutNode = g.node(child.id);
        if (layoutNode && layoutNode.x !== undefined && layoutNode.y !== undefined) {
            child.x = layoutNode.x - child.width / 2;
            child.y = layoutNode.y - child.height / 2;
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
        }
    }

    return {
        width: maxX + 10,
        height: maxY + 10
    };
}

// Render internal flow inside the floating cloud container
function renderCloudSubflow(
    parentNode: FlowNode,
    children: FlowNode[],
    childEdges: FlowEdge[],
    group: SVGGElement,
    offsetX: number,
    offsetY: number,
    containerWidth: number,
    containerHeight: number
): void {
    // Draw child edges first (behind nodes)
    for (const edge of childEdges) {
        const sourceNode = children.find(n => n.id === edge.source);
        const targetNode = children.find(n => n.id === edge.target);

        if (sourceNode && targetNode) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

            // Calculate connection points (bottom of source to top of target for vertical layout)
            // offsetX/offsetY are now 0 if using transform, or actual offsets if not
            const sourceX = offsetX + sourceNode.x + sourceNode.width / 2;
            const sourceY = offsetY + sourceNode.y + sourceNode.height;
            const targetX = offsetX + targetNode.x + targetNode.width / 2;
            const targetY = offsetY + targetNode.y;

            // Create curved path
            const midY = (sourceY + targetY) / 2;
            const d = `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;

            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', UI_COLORS.whiteSubtle);
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-linecap', 'round');

            group.appendChild(path);
        }
    }

    // Draw child nodes with full styling (like main flow nodes)
    for (const child of children) {
        const childGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        childGroup.setAttribute('class', 'cloud-subflow-node');
        childGroup.setAttribute('data-node-id', child.id);
        childGroup.style.cursor = 'pointer';

        const childX = offsetX + child.x;
        const childY = offsetY + child.y;
        const nodeColor = getNodeColor(child.type);

        // Node rectangle with full styling (matching main nodes)
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(childX));
        rect.setAttribute('y', String(childY));
        rect.setAttribute('width', String(child.width));
        rect.setAttribute('height', String(child.height));
        rect.setAttribute('rx', '10');  // Match main nodes
        rect.setAttribute('fill', nodeColor);
        rect.setAttribute('stroke', UI_COLORS.borderWhite);
        rect.setAttribute('stroke-width', '2');  // Match main nodes
        rect.setAttribute('filter', 'url(#shadow)');
        childGroup.appendChild(rect);

        // Node icon (positioned like main nodes)
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        icon.setAttribute('x', String(childX + 14));
        icon.setAttribute('y', String(childY + 26));
        icon.setAttribute('fill', UI_COLORS.whiteBright);
        icon.setAttribute('font-size', '14');
        icon.textContent = getNodeIcon(child.type);
        childGroup.appendChild(icon);

        // Node label (positioned like main nodes)
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(childX + 34));
        label.setAttribute('y', String(childY + 26));
        label.setAttribute('fill', 'white');
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', '600');
        label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        label.textContent = truncate(child.label, 18);  // Increased from 14 for full-size nodes
        childGroup.appendChild(label);

        // Description text (like main nodes)
        if (child.description) {
            const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            descText.setAttribute('x', String(childX + 14));
            descText.setAttribute('y', String(childY + 45));
            descText.setAttribute('fill', UI_COLORS.whiteDim);
            descText.setAttribute('font-size', '10');
            descText.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
            descText.textContent = truncate(child.description, 22);
            childGroup.appendChild(descText);
        }

        // Tooltip event handlers
        childGroup.addEventListener('mouseenter', (e) => {
            rect.setAttribute('fill', lightenColor(nodeColor, 15));
            showTooltip(child, e as MouseEvent);
        });
        childGroup.addEventListener('mousemove', (e) => {
            updateTooltipPosition(e as MouseEvent);
        });
        childGroup.addEventListener('mouseleave', () => {
            rect.setAttribute('fill', nodeColor);
            hideTooltip();
        });

        group.appendChild(childGroup);
    }
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
    // Create a clipping path for the subflow area
    const clipId = `clip-${parentNode.id}`;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', clipId);
    const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    clipRect.setAttribute('x', String(offsetX));
    clipRect.setAttribute('y', String(offsetY));
    clipRect.setAttribute('width', String(containerWidth));
    clipRect.setAttribute('height', String(containerHeight));
    clipRect.setAttribute('rx', '6');
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    group.appendChild(defs);

    // Create subflow group with clipping
    const subflowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    subflowGroup.setAttribute('class', 'subflow-group');
    subflowGroup.setAttribute('clip-path', `url(#${clipId})`);

    // Background for subflow area
    const subflowBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    subflowBg.setAttribute('x', String(offsetX));
    subflowBg.setAttribute('y', String(offsetY));
    subflowBg.setAttribute('width', String(containerWidth));
    subflowBg.setAttribute('height', String(containerHeight));
    subflowBg.setAttribute('rx', '6');
    subflowBg.setAttribute('fill', UI_COLORS.backgroundOverlay);
    subflowGroup.appendChild(subflowBg);

    // Draw child edges first (behind nodes)
    for (const edge of childEdges) {
        const sourceNode = children.find(n => n.id === edge.source);
        const targetNode = children.find(n => n.id === edge.target);

        if (sourceNode && targetNode) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

            // Calculate connection points
            const sourceX = offsetX + sourceNode.x + sourceNode.width;
            const sourceY = offsetY + sourceNode.y + sourceNode.height / 2;
            const targetX = offsetX + targetNode.x;
            const targetY = offsetY + targetNode.y + targetNode.height / 2;

            // Create curved path
            const midX = (sourceX + targetX) / 2;
            const d = `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;

            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', UI_COLORS.borderWhite);
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-linecap', 'round');

            subflowGroup.appendChild(path);
        }
    }

    // Draw child nodes
    for (const child of children) {
        const childGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        childGroup.setAttribute('class', 'subflow-node');

        const childX = offsetX + child.x;
        const childY = offsetY + child.y;

        // Node rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(childX));
        rect.setAttribute('y', String(childY));
        rect.setAttribute('width', String(child.width));
        rect.setAttribute('height', String(child.height));
        rect.setAttribute('rx', '6');
        rect.setAttribute('fill', getNodeColor(child.type));
        rect.setAttribute('stroke', UI_COLORS.borderWhiteLight);
        rect.setAttribute('stroke-width', '1');
        childGroup.appendChild(rect);

        // Node icon
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        icon.setAttribute('x', String(childX + 8));
        icon.setAttribute('y', String(childY + child.height / 2 + 4));
        icon.setAttribute('fill', UI_COLORS.whiteBright);
        icon.setAttribute('font-size', '11');
        icon.textContent = getNodeIcon(child.type);
        childGroup.appendChild(icon);

        // Node label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(childX + 22));
        label.setAttribute('y', String(childY + child.height / 2 + 4));
        label.setAttribute('fill', 'white');
        label.setAttribute('font-size', '10');
        label.setAttribute('font-weight', '500');
        label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        label.textContent = truncate(child.label, 14);
        childGroup.appendChild(label);

        subflowGroup.appendChild(childGroup);
    }

    group.appendChild(subflowGroup);
}

function renderWindowNode(node: FlowNode, group: SVGGElement): void {
    const windowDetails = node.windowDetails!;
    const padding = 10;
    const headerHeight = 32;
    const funcHeight = 24;

    // Main container
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', getNodeColor(node.type));
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Header
    const header = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    header.setAttribute('x', String(node.x));
    header.setAttribute('y', String(node.y));
    header.setAttribute('width', String(node.width));
    header.setAttribute('height', String(headerHeight));
    header.setAttribute('rx', '10');
    header.setAttribute('fill', UI_COLORS.backgroundOverlay);
    group.appendChild(header);

    const headerClip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    headerClip.setAttribute('x', String(node.x));
    headerClip.setAttribute('y', String(node.y + headerHeight - 10));
    headerClip.setAttribute('width', String(node.width));
    headerClip.setAttribute('height', '10');
    headerClip.setAttribute('fill', UI_COLORS.backgroundOverlay);
    group.appendChild(headerClip);

    // Icon and title
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', UI_COLORS.whiteBright);
    icon.setAttribute('font-size', '12');
    icon.textContent = '▦';
    group.appendChild(icon);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(node.x + 28));
    title.setAttribute('y', String(node.y + 22));
    title.setAttribute('fill', 'white');
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
        funcPill.setAttribute('fill', UI_COLORS.backgroundOverlay);
        group.appendChild(funcPill);

        // Function name
        const funcName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        funcName.setAttribute('x', String(node.x + padding + 6));
        funcName.setAttribute('y', String(yOffset + 15));
        funcName.setAttribute('fill', BADGE_COLORS.functionName);
        funcName.setAttribute('font-size', '10');
        funcName.setAttribute('font-weight', '600');
        funcName.setAttribute('font-family', 'monospace');
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
        moreText.setAttribute('fill', UI_COLORS.whiteFaint);
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

    // Main container
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', getNodeColor(node.type));
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Header
    const header = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    header.setAttribute('x', String(node.x));
    header.setAttribute('y', String(node.y));
    header.setAttribute('width', String(node.width));
    header.setAttribute('height', String(headerHeight));
    header.setAttribute('rx', '10');
    header.setAttribute('fill', UI_COLORS.backgroundOverlay);
    group.appendChild(header);

    // Icon and title
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', UI_COLORS.whiteBright);
    icon.setAttribute('font-size', '12');
    icon.textContent = 'Σ';
    group.appendChild(icon);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(node.x + 28));
    title.setAttribute('y', String(node.y + 22));
    title.setAttribute('fill', 'white');
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
        funcPill.setAttribute('fill', UI_COLORS.backgroundOverlay);
        group.appendChild(funcPill);

        // Function expression
        const funcText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        funcText.setAttribute('x', String(node.x + padding + 6));
        funcText.setAttribute('y', String(yOffset + 16));
        funcText.setAttribute('fill', BADGE_COLORS.functionName);
        funcText.setAttribute('font-size', '10');
        funcText.setAttribute('font-weight', '600');
        funcText.setAttribute('font-family', 'monospace');
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
        moreText.setAttribute('fill', UI_COLORS.whiteFaint);
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

    // Main container
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(node.height));
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', getNodeColor(node.type));
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Header
    const header = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    header.setAttribute('x', String(node.x));
    header.setAttribute('y', String(node.y));
    header.setAttribute('width', String(node.width));
    header.setAttribute('height', String(headerHeight));
    header.setAttribute('rx', '10');
    header.setAttribute('fill', UI_COLORS.backgroundOverlay);
    group.appendChild(header);

    // Icon and title
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', UI_COLORS.whiteBright);
    icon.setAttribute('font-size', '12');
    icon.textContent = '?';
    group.appendChild(icon);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(node.x + 28));
    title.setAttribute('y', String(node.y + 22));
    title.setAttribute('fill', 'white');
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
        casePill.setAttribute('fill', UI_COLORS.backgroundOverlay);
        group.appendChild(casePill);

        // CASE conditions count
        const caseText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        caseText.setAttribute('x', String(node.x + padding + 6));
        caseText.setAttribute('y', String(yOffset + 18));
        caseText.setAttribute('fill', BADGE_COLORS.functionName);
        caseText.setAttribute('font-size', '10');
        caseText.setAttribute('font-weight', '600');
        caseText.setAttribute('font-family', 'monospace');
        caseText.textContent = `${caseStmt.conditions.length} WHEN condition${caseStmt.conditions.length > 1 ? 's' : ''}`;
        group.appendChild(caseText);

        if (caseStmt.elseValue) {
            const elseText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            elseText.setAttribute('x', String(node.x + padding + 6));
            elseText.setAttribute('y', String(yOffset + 32));
            elseText.setAttribute('fill', UI_COLORS.whiteDim);
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
        moreText.setAttribute('fill', UI_COLORS.whiteFaint);
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
    const currentResult = { nodes: currentNodes, edges: currentEdges, stats: currentStats!, hints: currentHints, sql: '' };
    render(currentResult as ParseResult);
}

function renderEdge(edge: FlowEdge, parent: SVGGElement): void {
    const sourceNode = currentNodes.find(n => n.id === edge.source);
    const targetNode = currentNodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) { return; }

    // Calculate connection points (center bottom to center top)
    const x1 = sourceNode.x + sourceNode.width / 2;
    const y1 = sourceNode.y + sourceNode.height;
    const x2 = targetNode.x + targetNode.width / 2;
    const y2 = targetNode.y;

    // Create curved path
    const midY = (y1 + y2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', EDGE_COLORS.default);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.setAttribute('class', 'edge');
    path.setAttribute('data-source', edge.source);
    path.setAttribute('data-target', edge.target);
    path.setAttribute('data-edge-id', edge.id);

    // Store SQL clause information if available
    if (edge.sqlClause) {
        path.setAttribute('data-sql-clause', edge.sqlClause);
    }
    if (edge.clauseType) {
        path.setAttribute('data-clause-type', edge.clauseType);
    }
    if (edge.startLine) {
        path.setAttribute('data-start-line', String(edge.startLine));
    }

    // Make edge clickable with visual feedback
    path.style.cursor = 'pointer';

    // Click handler to show SQL clause and highlight
    path.addEventListener('click', (e) => {
        e.stopPropagation();
        handleEdgeClick(edge);
    });

    // Hover effect for edges
    path.addEventListener('mouseenter', () => {
        if (!path.getAttribute('data-highlighted')) {
            path.setAttribute('stroke', EDGE_COLORS.defaultLight);
            path.setAttribute('stroke-width', '3');
        }
    });

    path.addEventListener('mouseleave', () => {
        if (!path.getAttribute('data-highlighted')) {
            path.setAttribute('stroke', EDGE_COLORS.default);
            path.setAttribute('stroke-width', '2');
        }
    });

    parent.appendChild(path);
}

function handleEdgeClick(edge: FlowEdge): void {
    // Clear previous edge highlights
    const edges = mainGroup?.querySelectorAll('.edge');
    edges?.forEach(e => {
        e.removeAttribute('data-highlighted');
        const source = e.getAttribute('data-source');
        const target = e.getAttribute('data-target');
        const isConnected = state.selectedNodeId && (source === state.selectedNodeId || target === state.selectedNodeId);

        if (isConnected) {
            e.setAttribute('stroke', EDGE_COLORS.highlight);
            e.setAttribute('stroke-width', '3');
        } else {
            e.setAttribute('stroke', EDGE_COLORS.default);
            e.setAttribute('stroke-width', '2');
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

    if (!clausePanel) {
        clausePanel = document.createElement('div');
        clausePanel.id = 'sql-clause-panel';
        clausePanel.style.cssText = `
            position: fixed;
            bottom: 16px;
            left: 50%;
            transform: translateX(-50%);
            background: ${UI_COLORS.backgroundPanelSolid};
            border: 1px solid ${UI_COLORS.borderMedium};
            border-radius: 12px;
            padding: 16px 20px;
            max-width: 600px;
            z-index: 1000;
            box-shadow: ${UI_COLORS.shadowMedium};
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
        `;

        containerElement?.appendChild(clausePanel);
    }

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
            color: ${UI_COLORS.textMuted};
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
        " onclick="this.parentElement.style.display='none'">✕</button>
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
            <div style="color: ${UI_COLORS.textSubtle}; font-size: 13px; font-weight: 600;">
                ${edge.label || 'Data Flow'}
            </div>
        </div>
        <div style="
            background: ${UI_COLORS.backgroundSubtleDark};
            border: 1px solid ${UI_COLORS.border};
            border-radius: 8px;
            padding: 12px;
            color: ${UI_COLORS.textBright};
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 200px;
            overflow-y: auto;
        ">${escapeHtml(edge.sqlClause || 'No SQL clause information available')}</div>
        ${edge.startLine ? `
            <div style="color: ${UI_COLORS.textMuted}; font-size: 11px; margin-top: 8px;">
                📍 Line ${edge.startLine}${edge.endLine && edge.endLine !== edge.startLine ? `-${edge.endLine}` : ''}
            </div>
        ` : ''}
    `;

    clausePanel.style.display = 'block';
}

function getClauseTypeColor(clauseType: string): string {
    return CONDITION_COLORS[clauseType] || CONDITION_COLORS.default;
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateBreadcrumb(nodeId: string | null): void {
    if (!breadcrumbPanel) { return; }

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

    state.breadcrumbPath.forEach((node, index) => {
        // Create breadcrumb item
        const item = document.createElement('span');
        item.style.cssText = `
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background 0.2s;
            font-weight: ${index === state.breadcrumbPath.length - 1 ? '600' : '400'};
            color: ${index === state.breadcrumbPath.length - 1 ? '#f1f5f9' : '#94a3b8'};
        `;
        item.textContent = node.label;

        // Add hover effect
        item.addEventListener('mouseenter', () => {
            item.style.background = 'rgba(148, 163, 184, 0.2)';
        });

        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });

        // Click to focus on this node
        if (node.id !== 'main-query') {
            item.addEventListener('click', () => {
                selectNode(node.id, { skipNavigation: true });
                zoomToNode(node);
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
            separator.style.color = '#64748b';
            separator.style.fontSize = '10px';
            separator.textContent = '›';
            breadcrumbPanel!.appendChild(separator);
        }
    });
}

function highlightConnectedEdges(nodeId: string, highlight: boolean): void {
    const edges = mainGroup?.querySelectorAll('.edge');
    edges?.forEach(edge => {
        const source = edge.getAttribute('data-source');
        const target = edge.getAttribute('data-target');
        if (source === nodeId || target === nodeId) {
            if (highlight) {
                edge.setAttribute('stroke', EDGE_COLORS.highlight);
                edge.setAttribute('stroke-width', '3');
                edge.setAttribute('marker-end', 'url(#arrowhead-highlight)');
            } else {
                edge.setAttribute('stroke', EDGE_COLORS.default);
                edge.setAttribute('stroke-width', '2');
                edge.setAttribute('marker-end', 'url(#arrowhead)');
            }
        }
    });
}

/**
 * Renders error message in the visualization area
 * Enhanced to show helpful dialect suggestions when parse errors occur
 */
function renderError(message: string): void {
    if (!mainGroup) { return; }

    // Check if message contains a dialect suggestion (from improved error handling in sqlParser)
    const hasSuggestion = message.includes('Try ') && message.includes(' dialect');
    const parts = hasSuggestion ? message.split('. ') : [message];

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(0, -20)');

    // Error icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', '50%');
    icon.setAttribute('y', hasSuggestion ? '45%' : '48%');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('fill', STATUS_COLORS.error);
    icon.setAttribute('font-size', '24');
    icon.textContent = '⚠';
    g.appendChild(icon);

    // Main error message
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', hasSuggestion ? '52%' : '55%');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', STATUS_COLORS.error);
    text.setAttribute('font-size', '14');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    text.textContent = hasSuggestion ? parts[0] : `Error: ${message}`;
    g.appendChild(text);

    // Suggestion line (if present)
    if (hasSuggestion && parts[1]) {
        const suggestion = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        suggestion.setAttribute('x', '50%');
        suggestion.setAttribute('y', '58%');
        suggestion.setAttribute('text-anchor', 'middle');
        suggestion.setAttribute('fill', UI_COLORS.textMuted);
        suggestion.setAttribute('font-size', '12');
        suggestion.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        suggestion.textContent = `💡 ${parts[1]}`;
        g.appendChild(suggestion);

        // Hint about dialect selector
        const hint = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        hint.setAttribute('x', '50%');
        hint.setAttribute('y', '64%');
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
                    const sqlLines = currentSql.split('\n');
                    for (let i = 0; i < sqlLines.length; i++) {
                        const line = sqlLines[i].toLowerCase();
                        // Look for table name as a word boundary match to avoid partial matches
                        if (line.match(new RegExp(`\\b${tableName}\\b`))) {
                            lineNumber = i + 1;
                            break;
                        }
                    }
                }

                if (lineNumber) {
                    console.log('Navigating to line', lineNumber, 'for node:', node.label, node.type);
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

/**
 * Navigate to a connected node using arrow keys for accessibility
 * @param direction - 'upstream' (ArrowUp/Left) or 'downstream' (ArrowDown/Right)
 * @returns true if navigation occurred, false if no connected node found
 */
function navigateToConnectedNode(direction: 'upstream' | 'downstream'): boolean {
    if (!state.selectedNodeId) { return false; }

    const selectedNode = currentNodes.find(n => n.id === state.selectedNodeId);
    if (!selectedNode) { return false; }

    // Find connected nodes based on direction
    let connectedNodeIds: string[] = [];

    if (direction === 'upstream') {
        // Find nodes that are sources (edges where selected node is target)
        connectedNodeIds = currentEdges
            .filter(e => e.target === state.selectedNodeId)
            .map(e => e.source);
    } else {
        // Find nodes that are targets (edges where selected node is source)
        connectedNodeIds = currentEdges
            .filter(e => e.source === state.selectedNodeId)
            .map(e => e.target);
    }

    if (connectedNodeIds.length === 0) { return false; }

    // If there are multiple connected nodes, cycle through them
    // Track the last visited index for this direction
    const stateKey = `lastNav_${direction}_${state.selectedNodeId}`;
    const lastIndex = (state as any)[stateKey] || -1;
    const nextIndex = (lastIndex + 1) % connectedNodeIds.length;
    (state as any)[stateKey] = nextIndex;

    // Navigate to the connected node
    const targetNodeId = connectedNodeIds[nextIndex];
    const targetNode = currentNodes.find(n => n.id === targetNodeId);

    if (targetNode) {
        selectNode(targetNodeId, { skipNavigation: true });
        // Only pan if node is outside viewport (don't center, just ensure visibility)
        ensureNodeVisible(targetNode);
        return true;
    }

    return false;
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

    detailsPanel.style.transform = 'translate(0, -50%)';

    // Build details section based on node type
    let detailsSection = '';

    // Window function details
    if (node.windowDetails && node.windowDetails.functions.length > 0) {
        detailsSection = `
            <div style="margin-bottom: 10px;">
                <div style="color: ${UI_COLORS.textMuted}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Window Functions</div>
                ${node.windowDetails.functions.map(func => `
                    <div style="background: ${UI_COLORS.backgroundSubtle}; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                        <div style="color: ${BADGE_COLORS.functionName}; font-weight: 600; font-size: 11px; font-family: monospace; margin-bottom: 4px;">
                            ${escapeHtml(func.name)}()
                        </div>
                        ${func.partitionBy && func.partitionBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                <span style="background: ${BADGE_COLORS.partitionBy}; color: white; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">PARTITION BY</span>
                                <span style="color: ${UI_COLORS.textSubtle}; font-size: 10px; font-family: monospace;">${escapeHtml(func.partitionBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.orderBy && func.orderBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                                <span style="background: ${BADGE_COLORS.orderBy}; color: white; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">ORDER BY</span>
                                <span style="color: ${UI_COLORS.textSubtle}; font-size: 10px; font-family: monospace;">${escapeHtml(func.orderBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.frame ? `
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="background: ${BADGE_COLORS.frame}; color: white; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">FRAME</span>
                                <span style="color: ${UI_COLORS.textSubtle}; font-size: 10px; font-family: monospace;">${escapeHtml(func.frame)}</span>
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
                <div style="color: ${UI_COLORS.textMuted}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Aggregate Functions</div>
                ${node.aggregateDetails.functions.map(func => `
                    <div style="background: ${UI_COLORS.backgroundSubtle}; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                        <div style="color: ${BADGE_COLORS.frame}; font-weight: 600; font-size: 11px; font-family: monospace; margin-bottom: 2px;">
                            ${escapeHtml(func.expression)}
                        </div>
                        ${func.alias ? `
                            <div style="color: ${UI_COLORS.textMuted}; font-size: 10px; font-family: monospace;">
                                Alias: ${escapeHtml(func.alias)}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
                ${node.aggregateDetails.groupBy && node.aggregateDetails.groupBy.length > 0 ? `
                    <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid ${UI_COLORS.border};">
                        <div style="color: ${UI_COLORS.textMuted}; font-size: 10px; margin-bottom: 2px;">GROUP BY:</div>
                        <div style="color: ${UI_COLORS.textSubtle}; font-size: 10px; font-family: monospace;">${escapeHtml(node.aggregateDetails.groupBy.join(', '))}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // CASE statement details
    if (node.caseDetails && node.caseDetails.cases.length > 0) {
        detailsSection += `
            <div style="margin-bottom: 10px;">
                <div style="color: ${UI_COLORS.textMuted}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">CASE Statements</div>
                ${node.caseDetails.cases.map((caseStmt, idx) => `
                    <div style="background: ${UI_COLORS.backgroundSubtle}; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
                        ${caseStmt.alias ? `
                            <div style="color: ${COMPLEXITY_COLORS.Moderate}; font-weight: 600; font-size: 11px; margin-bottom: 4px;">
                                ${escapeHtml(caseStmt.alias)}
                            </div>
                        ` : ''}
                        ${caseStmt.conditions.map((cond, condIdx) => `
                            <div style="margin-bottom: 4px;">
                                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 1px;">
                                    <span style="background: ${BADGE_COLORS.partitionBy}; color: white; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">WHEN</span>
                                    <span style="color: ${UI_COLORS.textSubtle}; font-size: 10px; font-family: monospace;">${escapeHtml(cond.when)}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 4px; margin-left: 28px;">
                                    <span style="background: ${BADGE_COLORS.orderBy}; color: white; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">THEN</span>
                                    <span style="color: ${UI_COLORS.textSubtle}; font-size: 10px; font-family: monospace;">${escapeHtml(cond.then)}</span>
                                </div>
                            </div>
                        `).join('')}
                        ${caseStmt.elseValue ? `
                            <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                                <span style="background: ${BADGE_COLORS.frame}; color: white; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600;">ELSE</span>
                                <span style="color: ${UI_COLORS.textSubtle}; font-size: 10px; font-family: monospace;">${escapeHtml(caseStmt.elseValue)}</span>
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
                <div style="color: ${UI_COLORS.textMuted}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Internal Structure</div>
                <div style="background: ${UI_COLORS.backgroundSubtle}; border-radius: 4px; padding: 6px 8px;">
                    ${node.children.map(child => `
                        <div style="display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid ${UI_COLORS.borderLight};">
                            <span style="background: ${getNodeColor(child.type)}; padding: 2px 6px; border-radius: 3px; color: white; font-size: 9px; font-weight: 500;">
                                ${getNodeIcon(child.type)} ${escapeHtml(child.label)}
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
                <div style="color: ${UI_COLORS.textMuted}; font-size: 10px; text-transform: uppercase; margin-bottom: 6px;">Details</div>
                <div style="background: ${UI_COLORS.backgroundSubtle}; border-radius: 4px; padding: 8px;">
                    ${node.details.map(d => `
                        <div style="color: ${UI_COLORS.textSubtle}; font-size: 11px; padding: 2px 0; font-family: monospace;">
                            ${escapeHtml(d)}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    detailsPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0; color: ${UI_COLORS.text}; font-size: 12px;">Node Details</h3>
            <button id="close-details" style="background: none; border: none; color: ${UI_COLORS.textMuted}; cursor: pointer; font-size: 18px; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="background: ${getNodeColor(node.type)}; padding: 8px 10px; border-radius: 6px; margin-bottom: 10px;">
            <div style="color: white; font-weight: 600; font-size: 12px; margin-bottom: 2px;">
                ${getNodeIcon(node.type)} ${node.label}
            </div>
            <div style="color: ${UI_COLORS.whiteMuted}; font-size: 11px;">
                ${node.description || ''}
            </div>
        </div>
        ${detailsSection}
        <div style="color: ${UI_COLORS.textDim}; font-size: 10px; margin-top: 12px;">
            Type: ${node.type}<br>
            ID: ${node.id}
        </div>
    `;

    // Close button handler
    detailsPanel.querySelector('#close-details')?.addEventListener('click', () => {
        selectNode(null);
    });
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
                            onmouseover="this.style.background='${isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.15)'}'"
                            onmouseout="this.style.background='${isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)'}'"
                            title="Copy all table names to clipboard"
                            data-tables="${escapeHtml(allTableNames)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy
                    </button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto;">
                    ${displayTables.map(([tableName, count]) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
                            <span style="color: ${tableTextColor}; font-family: monospace;">${escapeHtml(tableName)}</span>
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

    statsPanel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-weight: 600; color: ${textColor};">Query Stats</span>
            <span style="
                background: ${COMPLEXITY_COLORS[currentStats.complexity]};
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
            ">${currentStats.complexity}</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px;">
            <div style="text-align: center;">
                <div style="color: ${textColor}; font-weight: 600;">${currentStats.tables}</div>
                <div style="font-size: 10px; color: ${textColorMuted};">Tables</div>
            </div>
            <div style="text-align: center;">
                <div style="color: ${textColor}; font-weight: 600;">${currentStats.joins}</div>
                <div style="font-size: 10px; color: ${textColorMuted};">Joins</div>
            </div>
            <div style="text-align: center;">
                <div style="color: ${textColor}; font-weight: 600;">${currentStats.conditions}</div>
                <div style="font-size: 10px; color: ${textColorMuted};">Filters</div>
            </div>
        </div>
        ${(currentStats.ctes > 0 || currentStats.subqueries > 0) ? `
            <div style="display: flex; gap: 12px; margin-bottom: 8px; padding-top: 8px; border-top: 1px solid ${borderColor}; justify-content: center;">
                ${currentStats.ctes > 0 ? `
                    <div style="text-align: center;">
                        <div style="color: ${textColor}; font-weight: 600; font-size: 12px;">${currentStats.ctes}</div>
                        <div style="font-size: 9px; color: ${textColorMuted};">CTE${currentStats.ctes !== 1 ? 's' : ''}</div>
                    </div>
                ` : ''}
                ${currentStats.subqueries > 0 ? `
                    <div style="text-align: center;">
                        <div style="color: ${textColor}; font-weight: 600; font-size: 12px;">${currentStats.subqueries}</div>
                        <div style="font-size: 9px; color: ${textColorMuted};">Subquer${currentStats.subqueries !== 1 ? 'ies' : 'y'}</div>
                    </div>
                ` : ''}
            </div>
        ` : ''}
        ${tableListHtml}
    `;

    // Add event listener for copy button
    const copyBtn = statsPanel.querySelector('#copy-tables-btn') as HTMLButtonElement | null;
    if (copyBtn) {
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
                    } catch (fallbackErr) {
                        console.error('Failed to copy:', fallbackErr);
                    }
                    document.body.removeChild(textarea);
                }
            }
        });
    }
}

function updateHintsPanel(): void {
    if (!hintsPanel) { return; }

    if (!currentHints || currentHints.length === 0) {
        hintsPanel.style.display = 'none';
        return;
    }

    hintsPanel.style.display = 'block';

    // Theme-aware colors
    const isDark = state.isDarkTheme;
    const textColor = isDark ? UI_COLORS.text : UI_COLORS.textLight;
    const textColorMuted = isDark ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;
    const borderColor = isDark ? UI_COLORS.border : UI_COLORS.borderMedium;

    // Theme-aware button/badge colors - darker versions for light theme
    const colors = {
        blue: isDark ? STATUS_COLORS.info : STATUS_COLORS.infoDark,
        amber: isDark ? STATUS_COLORS.warningLight : STATUS_COLORS.warningDark,
        green: isDark ? STATUS_COLORS.successLight : STATUS_COLORS.successDark,
        violet: isDark ? STATUS_COLORS.violetLight : STATUS_COLORS.violetDark,
        red: isDark ? STATUS_COLORS.error : STATUS_COLORS.errorDark,
        slate: isDark ? UI_COLORS.textSubtle : UI_COLORS.textDim
    };

    // Use centralized HINT_COLORS for consistent styling
    const hintColors = HINT_COLORS;

    // Group hints by category
    const hintsByCategory: Record<string, OptimizationHint[]> = {
        'performance': [],
        'quality': [],
        'best-practice': [],
        'complexity': [],
        'other': []
    };

    currentHints.forEach(hint => {
        const category = hint.category || 'other';
        if (hintsByCategory[category]) {
            hintsByCategory[category].push(hint);
        } else {
            hintsByCategory['other'].push(hint);
        }
    });

    // Count hints by category
    const perfCount = hintsByCategory['performance'].length;
    const qualityCount = hintsByCategory['quality'].length;
    const bestPracticeCount = hintsByCategory['best-practice'].length;
    const complexityCount = hintsByCategory['complexity'].length;
    const otherCount = hintsByCategory['other'].length;

    // Count by severity
    const highCount = currentHints.filter(h => h.severity === 'high').length;
    const mediumCount = currentHints.filter(h => h.severity === 'medium').length;
    const lowCount = currentHints.filter(h => h.severity === 'low').length;

    hintsPanel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="font-weight: 600; color: ${textColor};">Optimization Hints</span>
            <span style="
                background: rgba(245, 158, 11, 0.2);
                color: ${colors.amber};
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
            ">${currentHints.length}</span>
        </div>

        <!-- Category Filters -->
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid ${borderColor};">
            ${perfCount > 0 ? `
                <button class="hint-filter-btn" data-category="performance" style="
                    background: rgba(59, 130, 246, 0.2);
                    color: ${colors.blue};
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">Performance (${perfCount})</button>
            ` : ''}
            ${qualityCount > 0 ? `
                <button class="hint-filter-btn" data-category="quality" style="
                    background: rgba(245, 158, 11, 0.2);
                    color: ${colors.amber};
                    border: 1px solid rgba(245, 158, 11, 0.3);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">Quality (${qualityCount})</button>
            ` : ''}
            ${bestPracticeCount > 0 ? `
                <button class="hint-filter-btn" data-category="best-practice" style="
                    background: rgba(34, 197, 94, 0.2);
                    color: ${colors.green};
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">Best Practice (${bestPracticeCount})</button>
            ` : ''}
            ${complexityCount > 0 ? `
                <button class="hint-filter-btn" data-category="complexity" style="
                    background: rgba(139, 92, 246, 0.2);
                    color: ${colors.violet};
                    border: 1px solid rgba(139, 92, 246, 0.3);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    cursor: pointer;
                ">Complexity (${complexityCount})</button>
            ` : ''}
        </div>

        <!-- Severity Filters -->
        ${(highCount > 0 || mediumCount > 0 || lowCount > 0) ? `
            <div style="display: flex; gap: 6px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid ${borderColor};">
                ${highCount > 0 ? `
                    <button class="hint-severity-btn" data-severity="high" style="
                        background: rgba(239, 68, 68, 0.2);
                        color: ${colors.red};
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        cursor: pointer;
                    ">High (${highCount})</button>
                ` : ''}
                ${mediumCount > 0 ? `
                    <button class="hint-severity-btn" data-severity="medium" style="
                        background: rgba(245, 158, 11, 0.2);
                        color: ${colors.amber};
                        border: 1px solid rgba(245, 158, 11, 0.3);
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        cursor: pointer;
                    ">Medium (${mediumCount})</button>
                ` : ''}
                ${lowCount > 0 ? `
                    <button class="hint-severity-btn" data-severity="low" style="
                        background: rgba(148, 163, 184, 0.2);
                        color: ${colors.slate};
                        border: 1px solid rgba(148, 163, 184, 0.3);
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        cursor: pointer;
                    ">Low (${lowCount})</button>
                ` : ''}
            </div>
        ` : ''}

        <!-- Hints List -->
        <div class="hints-list" style="max-height: 300px; overflow-y: auto;">
            ${Object.entries(hintsByCategory).map(([category, hints]) => {
                if (hints.length === 0) {return '';}

                const categoryLabels: Record<string, string> = {
                    'performance': '⚡ Performance',
                    'quality': '🔍 Quality',
                    'best-practice': '✨ Best Practice',
                    'complexity': '📊 Complexity',
                    'other': '📝 Other'
                };

                return `
                    <div class="hint-category" data-category="${category}" style="margin-bottom: 12px;">
                        <div style="font-size: 10px; color: ${textColorMuted}; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${categoryLabels[category] || category} (${hints.length})
                        </div>
                        ${hints.map(hint => {
                            const style = hintColors[hint.type] || hintColors.info;
                            const severityBadge = hint.severity ? `
                                <span style="
                                    background: ${hint.severity === 'high' ? 'rgba(239, 68, 68, 0.2)' : hint.severity === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(148, 163, 184, 0.2)'};
                                    color: ${hint.severity === 'high' ? colors.red : hint.severity === 'medium' ? colors.amber : colors.slate};
                                    padding: 2px 6px;
                                    border-radius: 4px;
                                    font-size: 9px;
                                    margin-left: 6px;
                                    text-transform: uppercase;
                                ">${hint.severity}</span>
                            ` : '';

                            return `
                                <div class="hint-item" data-category="${hint.category || 'other'}" data-severity="${hint.severity || ''}" style="
                                    background: ${style.bg};
                                    border-left: 3px solid ${style.border};
                                    padding: 8px 12px;
                                    margin-bottom: 8px;
                                    border-radius: 0 4px 4px 0;
                                ">
                                    <div style="color: ${textColor}; font-size: 12px; margin-bottom: 4px; display: flex; align-items: center;">
                                        ${style.icon} ${hint.message}${severityBadge}
                                    </div>
                                    ${hint.suggestion ? `
                                        <div style="color: ${textColorMuted}; font-size: 11px;">
                                            ${hint.suggestion}
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Add filter button event listeners
    const filterButtons = hintsPanel.querySelectorAll('.hint-filter-btn');
    const severityButtons = hintsPanel.querySelectorAll('.hint-severity-btn');
    const hintItems = hintsPanel.querySelectorAll('.hint-item');
    const categoryGroups = hintsPanel.querySelectorAll('.hint-category');

    let activeCategory: string | null = null;
    let activeSeverity: string | null = null;

    filterButtons.forEach(btn => {
        const btnEl = btn as HTMLElement;
        btnEl.addEventListener('click', () => {
            const category = btnEl.getAttribute('data-category');
            if (activeCategory === category) {
                activeCategory = null;
                btnEl.style.opacity = '1';
            } else {
                activeCategory = category;
                filterButtons.forEach(b => {
                    (b as HTMLElement).style.opacity = '0.5';
                });
                btnEl.style.opacity = '1';
            }
            applyFilters();
        });
    });

    severityButtons.forEach(btn => {
        const btnEl = btn as HTMLElement;
        btnEl.addEventListener('click', () => {
            const severity = btnEl.getAttribute('data-severity');
            if (activeSeverity === severity) {
                activeSeverity = null;
                btnEl.style.opacity = '1';
            } else {
                activeSeverity = severity;
                severityButtons.forEach(b => {
                    (b as HTMLElement).style.opacity = '0.5';
                });
                btnEl.style.opacity = '1';
            }
            applyFilters();
        });
    });

    function applyFilters() {
        hintItems.forEach(item => {
            const itemEl = item as HTMLElement;
            const itemCategory = itemEl.getAttribute('data-category') || 'other';
            const itemSeverity = itemEl.getAttribute('data-severity') || '';
            
            const categoryMatch = !activeCategory || itemCategory === activeCategory;
            const severityMatch = !activeSeverity || itemSeverity === activeSeverity;
            
            if (categoryMatch && severityMatch) {
                itemEl.style.display = '';
            } else {
                itemEl.style.display = 'none';
            }
        });

        // Hide/show category groups
        categoryGroups.forEach(group => {
            const groupEl = group as HTMLElement;
            const category = groupEl.getAttribute('data-category');
            const visibleItems = Array.from(groupEl.querySelectorAll('.hint-item')).filter(item => {
                const itemEl = item as HTMLElement;
                return itemEl.style.display !== 'none';
            });
            
            if (visibleItems.length === 0) {
                groupEl.style.display = 'none';
            } else {
                groupEl.style.display = '';
            }
        });
    }
}

function fitView(): void {
    if (!svg || currentNodes.length === 0) { return; }

    const rect = svg.getBoundingClientRect();
    const padding = 80;

    // Calculate bounds including nodes and expanded cloud containers
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of currentNodes) {
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

    // Account for panels
    const availableWidth = rect.width - 320;
    const availableHeight = rect.height - 100;

    // Calculate scale to fit
    const scaleX = (availableWidth - padding * 2) / graphWidth;
    const scaleY = (availableHeight - padding * 2) / graphHeight;
    state.scale = Math.min(scaleX, scaleY, 1.5);

    // Center the graph
    state.offsetX = (availableWidth - graphWidth * state.scale) / 2 - minX * state.scale + 50;
    state.offsetY = (availableHeight - graphHeight * state.scale) / 2 - minY * state.scale + 50;

    // Reset zoom state tracking when fitting view
    state.zoomedNodeId = null;
    state.previousZoomState = null;

    updateTransform();
}

function zoomToNode(node: FlowNode): void {
    if (!svg || !mainGroup) { return; }

    // Simple toggle behavior: if already zoomed to any node, restore to fit view
    if (state.zoomedNodeId !== null) {
        // Show all nodes and edges again
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
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const visibleNodes = currentNodes.filter(n => immediateNeighbors.has(n.id));
    for (const n of visibleNodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
    }

    // If only one node, use its bounds with some padding
    if (visibleNodes.length === 1) {
        const padding = 100;
        minX = node.x - padding;
        minY = node.y - padding;
        maxX = node.x + node.width + padding;
        maxY = node.y + node.height + padding;
    }

    // Calculate zoom to fit the visible nodes in the viewport
    const rect = svg.getBoundingClientRect();
    const availableWidth = rect.width - 320; // Account for panels
    const availableHeight = rect.height - 100;
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    
    const scaleX = (availableWidth * 0.8) / graphWidth; // Use 80% of available space
    const scaleY = (availableHeight * 0.8) / graphHeight;
    const targetScale = Math.min(scaleX, scaleY, 5.0); // Cap at 5x zoom

    // Center the visible nodes
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    state.scale = targetScale;
    state.offsetX = availableWidth / 2 - centerX * state.scale + 50;
    state.offsetY = availableHeight / 2 - centerY * state.scale + 50;
    state.zoomedNodeId = node.id;

    updateTransform();
}

export function zoomIn(): void {
    state.scale = Math.min(state.scale * 1.2, 3);
    updateTransform();
    updateZoomIndicator();
}

export function zoomOut(): void {
    state.scale = Math.max(state.scale / 1.2, 0.2);
    updateTransform();
    updateZoomIndicator();
}

export function getZoomLevel(): number {
    return Math.round(state.scale * 100);
}

export function resetView(): void {
    fitView();
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

export function setSearchBox(input: HTMLInputElement): void {
    searchBox = input;
    input.addEventListener('input', () => {
        // Clear any existing debounce timer
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        // Immediately highlight matches without zooming (for visual feedback)
        highlightMatches(input.value);

        // Debounce the zoom/navigation to first result
        searchDebounceTimer = setTimeout(() => {
            navigateToFirstResult();
        }, SEARCH_DEBOUNCE_DELAY);
    });
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
}

function navigateSearch(delta: number): void {
    if (state.searchResults.length === 0) { return; }

    if (delta === 0) {
        state.currentSearchIndex = 0;
    } else {
        state.currentSearchIndex = (state.currentSearchIndex + delta + state.searchResults.length) % state.searchResults.length;
    }

    const nodeId = state.searchResults[state.currentSearchIndex];
    const node = currentNodes.find(n => n.id === nodeId);
    if (node) {
        zoomToNode(node);
        selectNode(nodeId, { skipNavigation: true });
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

/**
 * Prepares SVG clone for export by embedding inline styles and setting dimensions
 */
function prepareSvgForExport(svgElement: SVGSVGElement): { svgClone: SVGSVGElement; width: number; height: number } {
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;

    // Set explicit dimensions
    const bounds = calculateBounds();
    const padding = 40;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    svgClone.setAttribute('viewBox', `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Reset transform on main group
    const mainG = svgClone.querySelector('g');
    if (mainG) {
        mainG.removeAttribute('transform');
    }

    // Add background rect
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', String(bounds.minX - padding));
    bgRect.setAttribute('y', String(bounds.minY - padding));
    bgRect.setAttribute('width', String(width));
    bgRect.setAttribute('height', String(height));
    bgRect.setAttribute('fill', state.isDarkTheme ? UI_COLORS.background : UI_COLORS.backgroundLightGray);
    svgClone.insertBefore(bgRect, svgClone.firstChild);

    // Embed inline styles for all elements (needed for image export)
    embedInlineStyles(svgClone);

    return { svgClone, width, height };
}

/**
 * Recursively embeds computed styles as inline styles on SVG elements
 * Required for proper rendering when exporting SVG to PNG (canvas needs inline styles)
 * 
 * Handles SVGAnimatedString issue: SVG elements have className as object, not string
 * Uses classList instead which works reliably for both HTML and SVG elements
 */
function embedInlineStyles(element: Element): void {
    // Get SVG from DOM if local reference is missing (fallback for export functions)
    const svgElement = svg || (containerElement?.querySelector('svg') as SVGSVGElement | null);

    // Try to find original element by data-id first (most reliable)
    let originalElement: Element | null = null;
    const dataId = element.getAttribute('data-id');
    if (dataId && svgElement) {
        originalElement = svgElement.querySelector(`[data-id="${dataId}"]`);
    }

    // Fallback: try by class name using classList (handles SVGAnimatedString correctly)
    if (!originalElement && element.classList && element.classList.length > 0) {
        const firstClass = element.classList[0];
        if (firstClass) {
            try {
                // Escape special CSS selector characters to prevent invalid selectors
                const escapedClass = firstClass.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
                originalElement = svgElement?.querySelector(`.${escapedClass}`) || 
                                document.querySelector(`.${escapedClass}`);
            } catch {
                // Invalid selector, skip
            }
        }
    }

    // Style properties important for SVG rendering
    const styleProps = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor'];

    if (originalElement) {
        const origStyle = window.getComputedStyle(originalElement);
        styleProps.forEach(prop => {
            const value = origStyle.getPropertyValue(prop);
            if (value && value !== 'none' && value !== '') {
                (element as HTMLElement).style.setProperty(prop, value);
            }
        });
    }

    // Process children
    Array.from(element.children).forEach(child => embedInlineStyles(child));
}

/**
 * Exports the current visualization as PNG image
 * Converts SVG to PNG via canvas with fallback mechanisms for webview compatibility
 */
export function exportToPng(): void {
    // Get SVG from DOM if local reference is missing (fallback for reliability)
    const svgElement = svg || (containerElement?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        console.log('No visualization to export. Please render a query first.');
        return;
    }

    try {
        const { svgClone, width, height } = prepareSvgForExport(svgElement);
        const svgData = new XMLSerializer().serializeToString(svgClone);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.log('Failed to create canvas context');
            return;
        }

        // High DPI scaling for crisp exports
        const scale = 2;
        canvas.width = width * scale;
        canvas.height = height * scale;
        ctx.scale(scale, scale);

        // Use blob URL for loading SVG (more reliable in VS Code webviews)
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
            try {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(svgUrl);
                const pngDataUrl = canvas.toDataURL('image/png');

                // Send to VS Code extension for saving (webview downloads are blocked)
                const vscodeApi = (window as any).vscodeApi;
                if (vscodeApi && vscodeApi.postMessage) {
                    // Extract base64 data (remove data:image/png;base64, prefix)
                    const base64Data = pngDataUrl.split(',')[1];
                    vscodeApi.postMessage({
                        command: 'savePng',
                        data: base64Data,
                        filename: `sql-flow-${Date.now()}.png`
                    });
                } else {
                    console.log('VS Code API not available for PNG export');
                }
            } catch (e) {
                console.log('PNG export error:', e);
                URL.revokeObjectURL(svgUrl);
            }
        };

        img.onerror = (e) => {
            console.log('Failed to load SVG for PNG export:', e);
            URL.revokeObjectURL(svgUrl);
        };

        img.src = svgUrl;
    } catch (e) {
        console.log('PNG export failed: ' + e);
    }
}

export function exportToSvg(): void {
    // Get SVG from DOM if local reference is missing
    const svgElement = svg || (containerElement?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        console.error('No SVG element found - cannot export');
        return;
    }

    try {
        const { svgClone } = prepareSvgForExport(svgElement);
        const svgData = new XMLSerializer().serializeToString(svgClone);

        // Export pattern: create blob URL and trigger download
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `sql-flow-${Date.now()}.svg`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('SVG export failed:', e);
    }
}

function showExportNotification(type: 'success' | 'error', message: string): void {
    showClipboardNotification(type, message);
}

/**
 * Export the current visualization to Mermaid.js flowchart format
 * Exports as .md file with code block for VS Code Mermaid preview compatibility
 */
export function exportToMermaid(): void {
    if (currentNodes.length === 0) {
        console.warn('No nodes to export');
        return;
    }

    const mermaidCode = generateMermaidCode(currentNodes, currentEdges);

    // Wrap in markdown code block for VS Code Mermaid extension compatibility
    const markdownContent = `# SQL Flow Diagram

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;

    // Download as .md file
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.download = `sql-flow-${Date.now()}.md`;
    a.href = url;
    a.click();

    URL.revokeObjectURL(url);
}

/**
 * Generate Mermaid flowchart code from nodes and edges
 */
function generateMermaidCode(nodes: FlowNode[], edges: FlowEdge[]): string {
    const lines: string[] = ['flowchart TD'];

    // Group nodes by type for subgraph organization
    const tableNodes = nodes.filter(n => n.type === 'table');
    const resultNodes = nodes.filter(n => n.type === 'result');
    const otherNodes = nodes.filter(n => n.type !== 'table' && n.type !== 'result');

    // Add Sources subgraph for tables
    if (tableNodes.length > 0) {
        lines.push('    subgraph Sources');
        tableNodes.forEach(node => {
            lines.push(`        ${formatMermaidNode(node)}`);
        });
        lines.push('    end');
    }

    // Add intermediate nodes
    otherNodes.forEach(node => {
        lines.push(`    ${formatMermaidNode(node)}`);
    });

    // Add Results subgraph
    if (resultNodes.length > 0) {
        lines.push('    subgraph Results');
        resultNodes.forEach(node => {
            lines.push(`        ${formatMermaidNode(node)}`);
        });
        lines.push('    end');
    }

    // Add blank line before edges
    lines.push('');

    // Add edges
    edges.forEach(edge => {
        const edgeLine = formatMermaidEdge(edge);
        if (edgeLine) {
            lines.push(`    ${edgeLine}`);
        }
    });

    // Add styling section
    lines.push('');
    lines.push('    %% Node styling');
    lines.push('    classDef tableStyle fill:#3b82f6,stroke:#1e40af,color:#fff');
    lines.push('    classDef filterStyle fill:#f59e0b,stroke:#b45309,color:#fff');
    lines.push('    classDef joinStyle fill:#8b5cf6,stroke:#5b21b6,color:#fff');
    lines.push('    classDef aggregateStyle fill:#10b981,stroke:#047857,color:#fff');
    lines.push('    classDef sortStyle fill:#6366f1,stroke:#4338ca,color:#fff');
    lines.push('    classDef resultStyle fill:#22c55e,stroke:#15803d,color:#fff');
    lines.push('    classDef cteStyle fill:#ec4899,stroke:#be185d,color:#fff');
    lines.push('    classDef unionStyle fill:#14b8a6,stroke:#0f766e,color:#fff');
    lines.push('    classDef defaultStyle fill:#64748b,stroke:#475569,color:#fff');

    // Apply classes to nodes
    const styleAssignments = generateStyleAssignments(nodes);
    styleAssignments.forEach(assignment => {
        lines.push(`    ${assignment}`);
    });

    return lines.join('\n');
}

/**
 * Format a node for Mermaid syntax with appropriate shape based on type
 */
function formatMermaidNode(node: FlowNode): string {
    const id = sanitizeMermaidId(node.id);
    const label = escapeMermaidLabel(node.label);

    // Different shapes for different node types
    switch (node.type) {
        case 'table':
            // Cylinder shape for tables
            return `${id}[("${label}")]`;
        case 'filter':
            // Diamond/rhombus for filters
            return `${id}{{"${label}"}}`;
        case 'join':
            // Hexagon for joins
            return `${id}{{{"${label}"}}}`;
        case 'aggregate':
            // Subroutine box for aggregates
            return `${id}[["${label}"]]`;
        case 'sort':
            // Trapezoid for sort
            return `${id}[/"${label}"/]`;
        case 'result':
            // Stadium shape for results
            return `${id}(["${label}"])`;
        case 'cte':
            // Double circle for CTEs
            return `${id}((("${label}")))`;
        case 'union':
            // Parallelogram for unions
            return `${id}[/"${label}"\\]`;
        case 'subquery':
            // Subroutine for subqueries
            return `${id}[["${label}"]]`;
        case 'window':
            // Asymmetric shape for window functions
            return `${id}>"${label}"]`;
        default:
            // Default rounded rectangle
            return `${id}("${label}")`;
    }
}

/**
 * Format an edge for Mermaid syntax
 */
function formatMermaidEdge(edge: FlowEdge): string {
    const sourceId = sanitizeMermaidId(edge.source);
    const targetId = sanitizeMermaidId(edge.target);

    if (edge.label) {
        const label = escapeMermaidLabel(edge.label);
        return `${sourceId} -->|"${label}"| ${targetId}`;
    }

    return `${sourceId} --> ${targetId}`;
}

/**
 * Sanitize node ID for Mermaid (remove special characters)
 */
function sanitizeMermaidId(id: string): string {
    return id
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
}

/**
 * Escape label text for Mermaid
 */
function escapeMermaidLabel(label: string): string {
    return label
        .replace(/"/g, "'")
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, ' ')
        .substring(0, 50);
}

/**
 * Generate class assignments for node styling
 */
function generateStyleAssignments(nodes: FlowNode[]): string[] {
    const assignments: string[] = [];
    const typeToClass: Record<string, string> = {
        'table': 'tableStyle',
        'filter': 'filterStyle',
        'join': 'joinStyle',
        'aggregate': 'aggregateStyle',
        'sort': 'sortStyle',
        'result': 'resultStyle',
        'cte': 'cteStyle',
        'union': 'unionStyle'
    };

    // Group nodes by type
    const nodesByType = new Map<string, string[]>();

    nodes.forEach(node => {
        const className = typeToClass[node.type] || 'defaultStyle';
        if (!nodesByType.has(className)) {
            nodesByType.set(className, []);
        }
        nodesByType.get(className)!.push(sanitizeMermaidId(node.id));
    });

    // Generate class assignments
    nodesByType.forEach((nodeIds, className) => {
        if (nodeIds.length > 0) {
            assignments.push(`class ${nodeIds.join(',')} ${className}`);
        }
    });

    return assignments;
}

export function copyToClipboard(): void {
    // Get SVG from DOM if local reference is missing
    const svgElement = svg || (containerElement?.querySelector('svg') as SVGSVGElement | null);
    if (!svgElement) {
        console.log('No visualization to copy. Please render a query first.');
        return;
    }

    try {
        const { svgClone, width, height } = prepareSvgForExport(svgElement);
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.log('Failed to create canvas context');
            return;
        }

        const scale = 2;
        canvas.width = width * scale;
        canvas.height = height * scale;
        ctx.scale(scale, scale);

        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]).then(() => {
                        // Success - notification shown via UI
                    }).catch(() => {
                        // Fallback: download as PNG (same as Mermaid)
                        const a = document.createElement('a');
                        a.download = `sql-flow-${Date.now()}.png`;
                        a.href = canvas.toDataURL('image/png');
                        a.click();
                        console.log('Clipboard unavailable - downloaded as PNG');
                    });
                } else {
                    // Fallback: download as PNG (same as Mermaid)
                    const a = document.createElement('a');
                    a.download = `sql-flow-${Date.now()}.png`;
                    a.href = canvas.toDataURL('image/png');
                    a.click();
                    console.log('Downloaded as PNG');
                }
            }, 'image/png');
        };
        img.onerror = () => {
            // Try with blob URL
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const img2 = new Image();
            img2.onload = () => {
                ctx.drawImage(img2, 0, 0);
                const a = document.createElement('a');
                a.download = `sql-flow-${Date.now()}.png`;
                a.href = canvas.toDataURL('image/png');
                a.click();
                URL.revokeObjectURL(url);
                console.log('Downloaded as PNG');
            };
            img2.onerror = () => {
                console.log('Failed to copy. Try SVG export instead.');
            };
            img2.src = url;
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (e) {
        console.log('Copy failed: ' + e);
    }
}

function showClipboardNotification(type: 'success' | 'error', message: string): void {
    // Use the container element or fall back to body
    const parent = containerElement || document.body;

    // Remove existing notification if any
    const existing = document.getElementById('clipboard-notification');
    if (existing) {existing.remove();}

    const notification = document.createElement('div');
    notification.id = 'clipboard-notification';
    notification.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        ${type === 'success'
            ? 'background: rgba(34, 197, 94, 0.95); color: white;'
            : 'background: rgba(239, 68, 68, 0.95); color: white;'}
    `;
    notification.textContent = message;

    parent.appendChild(notification);

    // Animate in
    notification.animate([
        { transform: 'translateX(-50%) translateY(20px)', opacity: 0 },
        { transform: 'translateX(-50%) translateY(0)', opacity: 1 }
    ], { duration: 300, easing: 'ease-out' });

    // Remove after 3 seconds
    setTimeout(() => {
        notification.animate([
            { opacity: 1 },
            { opacity: 0 }
        ], { duration: 300, easing: 'ease-out' }).onfinish = () => {
            notification.remove();
        };
    }, 3000);
}

function calculateBounds(): { minX: number; minY: number; width: number; height: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const node of currentNodes) {
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
        case: '⎇'
    };
    return icons[type] || '○';
}

function getWarningIcon(warningType: string): string {
    const icons: Record<string, string> = {
        'unused': '⚠',
        'dead-column': '⊗',
        'expensive': '⚠',
        'fan-out': '📊',
        'repeated-scan': '🔄',
        'complex': '🧮',
        'filter-pushdown': '⬆',
        'non-sargable': '🚫',
        'join-order': '⇄',
        'index-suggestion': '📇'
    };
    return icons[warningType] || '⚠';
}

function getWarningColor(severity: string): string {
    const colors: Record<string, string> = WARNING_COLORS;
    return colors[severity] || colors.low;
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

function updateLegendPanel(): void {
    if (!legendPanel) {return;}

    legendPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; color: ${UI_COLORS.text}; font-size: 12px;">Node Types</span>
            <button id="close-legend" style="background: none; border: none; color: ${UI_COLORS.textDim}; cursor: pointer; font-size: 14px;">&times;</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
            ${Object.entries(NODE_TYPE_INFO).map(([type, info]) => `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                        background: ${info.color};
                        width: 24px;
                        height: 18px;
                        border-radius: 4px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        color: white;
                    ">${info.icon}</span>
                    <div style="flex: 1;">
                        <div style="color: ${UI_COLORS.textBright}; font-size: 11px; font-weight: 500;">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                        <div style="color: ${UI_COLORS.textDim}; font-size: 9px;">${info.description}</div>
                    </div>
                </div>
            `).join('')}
        </div>
        <div style="border-top: 1px solid ${UI_COLORS.border}; margin-top: 12px; padding-top: 10px;">
            <div style="font-weight: 600; color: ${UI_COLORS.text}; font-size: 11px; margin-bottom: 8px;">Table Categories</div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                        background: ${BADGE_COLORS.read};
                        width: 24px;
                        height: 16px;
                        border-radius: 3px;
                        border: 2px solid ${UI_COLORS.borderWhite};
                    "></span>
                    <div style="color: ${UI_COLORS.textBright}; font-size: 10px;">Physical Table</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                        background: ${BADGE_COLORS.read};
                        width: 24px;
                        height: 16px;
                        border-radius: 3px;
                        border: 3px dashed ${NODE_STROKE_COLORS.cte};
                    "></span>
                    <div style="color: ${UI_COLORS.textBright}; font-size: 10px;">CTE Reference</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                        background: ${BADGE_COLORS.derivedAlt};
                        width: 24px;
                        height: 16px;
                        border-radius: 3px;
                        border: 2px dashed rgba(20, 184, 166, 0.8);
                    "></span>
                    <div style="color: ${UI_COLORS.textBright}; font-size: 10px;">Derived Table</div>
                </div>
            </div>
        </div>
        ${state.showColumnFlows ? `
            <div style="border-top: 1px solid ${UI_COLORS.border}; margin-top: 12px; padding-top: 10px;">
                <div style="font-weight: 600; color: ${UI_COLORS.text}; font-size: 11px; margin-bottom: 8px;">Column Lineage</div>
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: ${BADGE_COLORS.orderBy}; color: white; font-size: 8px; font-weight: 600; padding: 2px 4px; border-radius: 3px;">SRC</span>
                        <div style="color: ${UI_COLORS.textBright}; font-size: 10px;">Source Table</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: ${BADGE_COLORS.read}; color: white; font-size: 8px; font-weight: 600; padding: 2px 4px; border-radius: 3px;">ALIAS</span>
                        <div style="color: ${UI_COLORS.textBright}; font-size: 10px;">Renamed/Alias</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: ${BADGE_COLORS.frame}; color: white; font-size: 8px; font-weight: 600; padding: 2px 4px; border-radius: 3px;">AGG</span>
                        <div style="color: ${UI_COLORS.textBright}; font-size: 10px;">Aggregated</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: ${BADGE_COLORS.merge}; color: white; font-size: 8px; font-weight: 600; padding: 2px 4px; border-radius: 3px;">CALC</span>
                        <div style="color: ${UI_COLORS.textBright}; font-size: 10px;">Calculated</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: ${CONDITION_COLORS.having}; color: white; font-size: 8px; font-weight: 600; padding: 2px 4px; border-radius: 3px;">JOIN</span>
                        <div style="color: ${UI_COLORS.textBright}; font-size: 10px;">Joined</div>
                    </div>
                </div>
            </div>
        ` : ''}
    `;

    legendPanel.querySelector('#close-legend')?.addEventListener('click', () => {
        toggleLegend(false);
    });
}

export function toggleLegend(show?: boolean): void {
    if (!legendPanel) {return;}
    state.legendVisible = show ?? !state.legendVisible;
    legendPanel.style.display = state.legendVisible ? 'block' : 'none';
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
    hintsPanel.style.display = hintsVisible ? 'block' : 'none';
}

// Layout order for cycling
const LAYOUT_ORDER: LayoutType[] = ['vertical', 'horizontal', 'compact', 'force', 'radial'];

export function toggleLayout(): void {
    const currentIndex = LAYOUT_ORDER.indexOf(state.layoutType || 'vertical');
    const nextIndex = (currentIndex + 1) % LAYOUT_ORDER.length;
    switchLayout(LAYOUT_ORDER[nextIndex]);
}

export function switchLayout(layoutType: LayoutType): void {
    if (!currentNodes || currentNodes.length === 0 || !svg || !mainGroup) {
        return;
    }

    state.layoutType = layoutType;

    // Re-run layout with selected algorithm
    switch (layoutType) {
        case 'horizontal':
            layoutGraphHorizontal(currentNodes, currentEdges);
            break;
        case 'compact':
            layoutGraphCompact(currentNodes, currentEdges);
            break;
        case 'force':
            layoutGraphForce(currentNodes, currentEdges);
            break;
        case 'radial':
            layoutGraphRadial(currentNodes, currentEdges);
            break;
        case 'vertical':
        default:
            layoutGraph(currentNodes, currentEdges);
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
}

export function getCurrentLayout(): LayoutType {
    return state.layoutType || 'vertical';
}

/**
 * Calculate edge path based on layout type and node positions
 */
function calculateEdgePath(sourceNode: FlowNode, targetNode: FlowNode, layoutType: LayoutType): string {
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
    } else {
        clearFocusMode();
    }
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
    const shouldShow = show ?? (sqlPreviewPanel.style.display === 'none');
    sqlPreviewPanel.style.display = shouldShow ? 'block' : 'none';

    if (shouldShow) {
        updateSqlPreview();
    }
}

function updateSqlPreview(): void {
    if (!sqlPreviewPanel || !currentSql) {return;}

    const formattedSql = formatSql(currentSql);
    const highlightedSql = highlightSql(formattedSql);

    sqlPreviewPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; color: ${UI_COLORS.text}; font-size: 12px;">SQL Query</span>
            <div style="display: flex; gap: 8px;">
                <button id="copy-sql" style="
                    background: rgba(99, 102, 241, 0.2);
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    border-radius: 4px;
                    color: ${UI_COLORS.focusText};
                    padding: 4px 10px;
                    font-size: 10px;
                    cursor: pointer;
                ">Copy</button>
                <button id="close-sql-preview" style="
                    background: none;
                    border: none;
                    color: ${UI_COLORS.textDim};
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

    // Find the tallest cloud for bottom alignment
    const maxCloudHeight = Math.max(...cloudInfos.map(c => c.height));

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
        tableUsage: currentTableUsage
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

export function updateMinimap(): void {
    const minimapContainer = document.getElementById('minimap-container');
    const minimapSvg = document.getElementById('minimap-svg') as unknown as SVGSVGElement;

    if (!minimapContainer || !minimapSvg || currentNodes.length < 8) {
        // Only show minimap for complex queries (8+ nodes)
        if (minimapContainer) {minimapContainer.style.display = 'none';}
        return;
    }

    minimapContainer.style.display = 'block';

    // Calculate bounds
    const bounds = calculateBounds();
    const padding = 10;
    const mapWidth = 150;
    const mapHeight = 100;

    // Calculate scale to fit all nodes
    const scaleX = (mapWidth - padding * 2) / bounds.width;
    const scaleY = (mapHeight - padding * 2) / bounds.height;
    const mapScale = Math.min(scaleX, scaleY, 0.15);

    // Render mini nodes
    minimapSvg.innerHTML = '';

    for (const node of currentNodes) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String((node.x - bounds.minX) * mapScale + padding));
        rect.setAttribute('y', String((node.y - bounds.minY) * mapScale + padding));
        rect.setAttribute('width', String(Math.max(4, node.width * mapScale)));
        rect.setAttribute('height', String(Math.max(3, node.height * mapScale)));
        rect.setAttribute('fill', getNodeColor(node.type));
        rect.setAttribute('rx', '1');
        minimapSvg.appendChild(rect);
    }

    // Update viewport indicator
    updateMinimapViewport();
}

function updateMinimapViewport(): void {
    const viewport = document.getElementById('minimap-viewport');
    const minimapContainer = document.getElementById('minimap-container');

    if (!viewport || !minimapContainer || !svg || currentNodes.length < 8) {return;}

    const bounds = calculateBounds();
    const svgRect = svg.getBoundingClientRect();
    const mapWidth = 150;
    const mapHeight = 100;
    const padding = 10;

    const scaleX = (mapWidth - padding * 2) / bounds.width;
    const scaleY = (mapHeight - padding * 2) / bounds.height;
    const mapScale = Math.min(scaleX, scaleY, 0.15);

    // Calculate visible area in graph coordinates
    const visibleLeft = -state.offsetX / state.scale;
    const visibleTop = -state.offsetY / state.scale;
    const visibleWidth = svgRect.width / state.scale;
    const visibleHeight = svgRect.height / state.scale;

    // Transform to minimap coordinates
    const vpLeft = (visibleLeft - bounds.minX) * mapScale + padding;
    const vpTop = (visibleTop - bounds.minY) * mapScale + padding;
    const vpWidth = visibleWidth * mapScale;
    const vpHeight = visibleHeight * mapScale;

    viewport.style.left = `${Math.max(0, vpLeft)}px`;
    viewport.style.top = `${Math.max(0, vpTop)}px`;
    viewport.style.width = `${Math.min(mapWidth, vpWidth)}px`;
    viewport.style.height = `${Math.min(mapHeight, vpHeight)}px`;
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

export function toggleFullscreen(enable?: boolean): void {
    state.isFullscreen = enable ?? !state.isFullscreen;

    const rootElement = document.getElementById('root');
    const body = document.body;
    const html = document.documentElement;
    const svgElement = svg;
    
    if (!rootElement) {
        console.error('Root element not found for fullscreen');
        return;
    }

    // Find all UI elements to hide/show using IDs and classes
    const toolbar = document.getElementById('sql-crack-toolbar') as HTMLElement;
    const actions = document.getElementById('sql-crack-actions') as HTMLElement;
    const batchTabs = document.getElementById('batch-tabs') as HTMLElement;
    const breadcrumb = document.querySelector('.breadcrumb-panel') as HTMLElement;
    const detailsPanel = document.querySelector('.details-panel') as HTMLElement;
    const statsPanel = document.querySelector('.stats-panel') as HTMLElement;
    const hintsPanel = document.querySelector('.hints-panel') as HTMLElement;
    const legendPanel = document.querySelector('.legend-panel') as HTMLElement;
    const sqlPreviewPanel = document.querySelector('.sql-preview-panel') as HTMLElement;

    if (state.isFullscreen) {
        // Save original styles and visibility (only save what we'll change)
        // Using individual properties instead of cssText to preserve fonts and other styles
        rootElement.dataset.originalPosition = rootElement.style.position || '';
        rootElement.dataset.originalTop = rootElement.style.top || '';
        rootElement.dataset.originalLeft = rootElement.style.left || '';
        rootElement.dataset.originalWidth = rootElement.style.width || '';
        rootElement.dataset.originalHeight = rootElement.style.height || '';
        rootElement.dataset.originalMargin = rootElement.style.margin || '';
        rootElement.dataset.originalPadding = rootElement.style.padding || '';
        rootElement.dataset.originalOverflow = rootElement.style.overflow || '';
        rootElement.dataset.originalZIndex = rootElement.style.zIndex || '';
        
        if (svgElement) {
            svgElement.dataset.originalWidth = svgElement.style.width || '';
            svgElement.dataset.originalHeight = svgElement.style.height || '';
            svgElement.dataset.originalPosition = svgElement.style.position || '';
            svgElement.dataset.originalTop = svgElement.style.top || '';
            svgElement.dataset.originalLeft = svgElement.style.left || '';
        }
        
        if (body) {
            body.dataset.originalMargin = body.style.margin || '';
            body.dataset.originalPadding = body.style.padding || '';
            body.dataset.originalOverflow = body.style.overflow || '';
            body.dataset.originalWidth = body.style.width || '';
            body.dataset.originalHeight = body.style.height || '';
        }
        
        if (html) {
            html.dataset.originalMargin = html.style.margin || '';
            html.dataset.originalPadding = html.style.padding || '';
            html.dataset.originalOverflow = html.style.overflow || '';
            html.dataset.originalWidth = html.style.width || '';
            html.dataset.originalHeight = html.style.height || '';
        }
        
        // Hide UI elements (toolbars, panels, breadcrumbs) to maximize visualization area
        const uiElements = [toolbar, actions, batchTabs, breadcrumb, detailsPanel, statsPanel, hintsPanel, legendPanel, sqlPreviewPanel];
        uiElements.forEach(el => {
            if (el) {
                el.dataset.originalDisplay = el.style.display || '';
                el.style.display = 'none';
            }
        });

        // Make root fill the entire viewport (only set necessary properties)
        // Using individual properties preserves fonts, colors, and other styles
        rootElement.style.position = 'fixed';
        rootElement.style.top = '0';
        rootElement.style.left = '0';
        rootElement.style.width = '100vw';
        rootElement.style.height = '100vh';
        rootElement.style.margin = '0';
        rootElement.style.padding = '0';
        rootElement.style.overflow = 'hidden';
        rootElement.style.zIndex = '99999';
        // Don't change background - let it inherit or use existing
        
        if (svgElement) {
            svgElement.style.width = '100vw';
            svgElement.style.height = '100vh';
            svgElement.style.position = 'absolute';
            svgElement.style.top = '0';
            svgElement.style.left = '0';
        }
        
        if (body) {
            body.style.margin = '0';
            body.style.padding = '0';
            body.style.overflow = 'hidden';
            body.style.width = '100vw';
            body.style.height = '100vh';
        }
        
        if (html) {
            html.style.margin = '0';
            html.style.padding = '0';
            html.style.overflow = 'hidden';
            html.style.width = '100vw';
            html.style.height = '100vh';
        }

        // Request fullscreen via VS Code API (for panel maximization)
        if (typeof window !== 'undefined' && (window as any).vscodeApi) {
            (window as any).vscodeApi.postMessage({
                command: 'requestFullscreen',
                enable: true
            });
        }
    } else {
        // Request exit fullscreen via VS Code API
        if (typeof window !== 'undefined' && (window as any).vscodeApi) {
            (window as any).vscodeApi.postMessage({
                command: 'requestFullscreen',
                enable: false
            });
        }

        // Restore UI elements
        const uiElements = [toolbar, actions, batchTabs, breadcrumb, detailsPanel, statsPanel, hintsPanel, legendPanel, sqlPreviewPanel];
        uiElements.forEach(el => {
            if (el && el.dataset.originalDisplay !== undefined) {
                el.style.display = el.dataset.originalDisplay;
                delete el.dataset.originalDisplay;
            }
        });

        // Restore original styles (only the properties we changed)
        rootElement.style.position = rootElement.dataset.originalPosition || '';
        rootElement.style.top = rootElement.dataset.originalTop || '';
        rootElement.style.left = rootElement.dataset.originalLeft || '';
        rootElement.style.width = rootElement.dataset.originalWidth || '';
        rootElement.style.height = rootElement.dataset.originalHeight || '';
        rootElement.style.margin = rootElement.dataset.originalMargin || '';
        rootElement.style.padding = rootElement.dataset.originalPadding || '';
        rootElement.style.overflow = rootElement.dataset.originalOverflow || '';
        rootElement.style.zIndex = rootElement.dataset.originalZIndex || '';
        
        if (svgElement) {
            svgElement.style.width = svgElement.dataset.originalWidth || '';
            svgElement.style.height = svgElement.dataset.originalHeight || '';
            svgElement.style.position = svgElement.dataset.originalPosition || '';
            svgElement.style.top = svgElement.dataset.originalTop || '';
            svgElement.style.left = svgElement.dataset.originalLeft || '';
        }
        
        if (body) {
            body.style.margin = body.dataset.originalMargin || '';
            body.style.padding = body.dataset.originalPadding || '';
            body.style.overflow = body.dataset.originalOverflow || '';
            body.style.width = body.dataset.originalWidth || '';
            body.style.height = body.dataset.originalHeight || '';
        }
        
        if (html) {
            html.style.margin = html.dataset.originalMargin || '';
            html.style.padding = html.dataset.originalPadding || '';
            html.style.overflow = html.dataset.originalOverflow || '';
            html.style.width = html.dataset.originalWidth || '';
            html.style.height = html.dataset.originalHeight || '';
        }

        // Exit browser fullscreen if active
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    }

    // Refit view after fullscreen toggle
    setTimeout(() => {
        fitView();
        updateMinimap();
    }, 100);
}

export function isFullscreen(): boolean {
    return state.isFullscreen;
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
        border: UI_COLORS.borderMedium,
        text: UI_COLORS.textLight,
        textMuted: '#475569',
        textDim: UI_COLORS.textLightDim
    };

    // Apply to SVG background - use pattern for light theme, solid color for dark
    if (backgroundRect) {
        if (dark) {
            backgroundRect.setAttribute('fill', colors.bg);
        } else {
            // Use grid pattern for light theme (JSON Crack style)
            backgroundRect.setAttribute('fill', 'url(#grid-pattern)');
        }
    }

    // Apply to all panels
    const panels = [detailsPanel, statsPanel, hintsPanel, legendPanel, sqlPreviewPanel, tooltipElement];
    panels.forEach(panel => {
        if (panel) {
            panel.style.background = colors.panelBg;
            panel.style.borderColor = colors.border;
            panel.style.color = colors.text;
        }
    });

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
    if (!tooltipElement) {return;}

    // Build tooltip content
    let content = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="
                background: ${getNodeColor(node.type)};
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
                color: white;
            ">${getNodeIcon(node.type)} ${node.type.toUpperCase()}</span>
        </div>
        <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">${escapeHtml(node.label)}</div>
    `;

    if (node.description) {
        content += `<div style="color: ${state.isDarkTheme ? '#94a3b8' : '#64748b'}; font-size: 11px; margin-bottom: 4px;">${escapeHtml(node.description)}</div>`;
    }

    // Show SQL fragment if we have line numbers
    if (node.startLine && currentSql) {
        const sqlLines = currentSql.split('\n');
        const startIdx = Math.max(0, node.startLine - 1);
        const endIdx = node.endLine ? Math.min(sqlLines.length, node.endLine) : startIdx + 1;
        const fragment = sqlLines.slice(startIdx, endIdx).join('\n').trim();

        if (fragment) {
            const displayFragment = fragment.length > 120 ? fragment.substring(0, 120) + '...' : fragment;
            content += `
                <div style="
                    margin-top: 8px;
                    padding: 8px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(148, 163, 184, 0.2);
                    border-radius: 4px;
                    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
                    font-size: 10px;
                    color: ${UI_COLORS.textBright};
                    line-height: 1.4;
                    white-space: pre-wrap;
                    word-break: break-all;
                    max-width: 300px;
                ">${escapeHtml(displayFragment)}</div>
            `;

            // Add line number reference
            content += `<div style="font-size: 9px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 4px;">
                📍 Line ${node.startLine}${node.endLine && node.endLine !== node.startLine ? `-${node.endLine}` : ''}
            </div>`;
        }
    }

    // Add details based on node type
    if (node.type === 'join' && node.details && node.details.length > 0) {
        content += `<div style="font-size: 10px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 6px; font-family: monospace;">
            <strong style="color: ${state.isDarkTheme ? '#cbd5e1' : '#475569'};">Condition:</strong> ${escapeHtml(node.details[0])}
        </div>`;
    }

    if (node.type === 'filter' && node.details && node.details.length > 0) {
        content += `<div style="font-size: 10px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 6px; font-family: monospace;">
            <strong style="color: ${state.isDarkTheme ? '#cbd5e1' : '#475569'};">Condition:</strong> ${escapeHtml(node.details[0])}
        </div>`;
    }

    if (node.type === 'aggregate' && node.aggregateDetails) {
        content += `<div style="font-size: 10px; margin-top: 6px; color: ${state.isDarkTheme ? '#fbbf24' : '#f59e0b'};">
            ${node.aggregateDetails.functions.length} aggregate function(s)
        </div>`;
        if (node.aggregateDetails.groupBy && node.aggregateDetails.groupBy.length > 0) {
            content += `<div style="font-size: 10px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 2px;">
                Group by: ${escapeHtml(node.aggregateDetails.groupBy.join(', '))}
            </div>`;
        }
    }

    if (node.type === 'window' && node.windowDetails) {
        content += `<div style="font-size: 10px; margin-top: 6px;">
            <span style="color: ${BADGE_COLORS.functionName};">${node.windowDetails.functions.length} window function(s)</span>
        </div>`;
        node.windowDetails.functions.forEach((fn, idx) => {
            if (idx < 3) { // Show first 3
                content += `<div style="font-size: 9px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 2px;">
                    ${escapeHtml(fn.name)}${fn.partitionBy ? ` (PARTITION BY ${fn.partitionBy.join(', ')})` : ''}
                </div>`;
            }
        });
    }

    if (node.type === 'select' && node.columns && node.columns.length > 0) {
        content += `<div style="font-size: 10px; margin-top: 6px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'};">
            <strong style="color: ${state.isDarkTheme ? '#cbd5e1' : '#475569'};">Columns:</strong> ${node.columns.length}
        </div>`;
    }

    if (node.children && node.children.length > 0) {
        content += `<div style="font-size: 10px; margin-top: 6px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'};">
            Contains ${node.children.length} operation(s)
        </div>`;
    }

    // Show warnings
    if (node.warnings && node.warnings.length > 0) {
        content += `<div style="margin-top: 8px; padding: 8px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px;">`;
        node.warnings.forEach((warning, idx) => {
            if (idx < 3) { // Show up to 3 warnings
                const iconStr = getWarningIcon(warning.type);
                const colorStr = getWarningColor(warning.severity);
                content += `<div style="font-size: 10px; color: ${colorStr}; margin-top: ${idx > 0 ? '4px' : '0'};">
                    ${iconStr} <strong>${warning.severity.toUpperCase()}:</strong> ${escapeHtml(warning.message)}
                </div>`;
            }
        });
        if (node.warnings.length > 3) {
            content += `<div style="font-size: 9px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'}; margin-top: 4px;">
                +${node.warnings.length - 3} more warning(s)
            </div>`;
        }
        content += `</div>`;
    }

    // Add keyboard hint
    content += `<div style="font-size: 9px; color: ${state.isDarkTheme ? '#475569' : '#94a3b8'}; margin-top: 8px; border-top: 1px solid ${state.isDarkTheme ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)'}; padding-top: 6px;">
        Click to select • Double-click to zoom
    </div>`;

    tooltipElement.innerHTML = content;
    tooltipElement.style.opacity = '1';
    updateTooltipPosition(e);
}

function updateTooltipPosition(e: MouseEvent): void {
    if (!tooltipElement) {return;}

    const padding = 12;
    const tooltipRect = tooltipElement.getBoundingClientRect();

    let left = e.clientX + padding;
    let top = e.clientY + padding;

    // Keep tooltip within viewport
    if (left + tooltipRect.width > window.innerWidth - padding) {
        left = e.clientX - tooltipRect.width - padding;
    }
    if (top + tooltipRect.height > window.innerHeight - padding) {
        top = e.clientY - tooltipRect.height - padding;
    }

    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
}

function hideTooltip(): void {
    if (tooltipElement) {
        tooltipElement.style.opacity = '0';
    }
}

// ============================================================
// Right-click Context Menu for Nodes
// ============================================================

function showContextMenu(node: FlowNode, e: MouseEvent): void {
    if (!contextMenuElement) { return; }

    e.preventDefault();
    e.stopPropagation();

    const isDark = state.isDarkTheme;
    const menuItemStyle = `
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.1s;
    `;
    const menuItemHoverBg = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)';
    const separatorStyle = `
        height: 1px;
        background: ${isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'};
        margin: 4px 0;
    `;

    // Build menu items based on node type
    let menuItems = `
        <div class="ctx-menu-item" data-action="zoom" style="${menuItemStyle}">
            <span style="width: 16px;">🔍</span>
            <span>Zoom to node</span>
        </div>
        <div class="ctx-menu-item" data-action="focus-upstream" style="${menuItemStyle}">
            <span style="width: 16px;">↑</span>
            <span>Focus upstream</span>
        </div>
        <div class="ctx-menu-item" data-action="focus-downstream" style="${menuItemStyle}">
            <span style="width: 16px;">↓</span>
            <span>Focus downstream</span>
        </div>
        <div class="ctx-menu-item" data-action="reset-view" style="${menuItemStyle}">
            <span style="width: 16px;">⊡</span>
            <span>Reset view (Esc)</span>
        </div>
        <div style="${separatorStyle}"></div>
    `;

    // Add collapse/expand for CTE/subquery nodes
    if ((node.type === 'cte' || node.type === 'subquery') && node.collapsible && node.children && node.children.length > 0) {
        const isExpanded = node.expanded !== false;
        menuItems += `
            <div class="ctx-menu-item" data-action="toggle-expand" style="${menuItemStyle}">
                <span style="width: 16px;">${isExpanded ? '📁' : '📂'}</span>
                <span>${isExpanded ? 'Collapse children' : 'Expand children'}</span>
            </div>
        `;
    }

    // Add copy options
    menuItems += `
        <div class="ctx-menu-item" data-action="copy-label" style="${menuItemStyle}">
            <span style="width: 16px;">📋</span>
            <span>Copy node name</span>
        </div>
    `;

    // Add copy details for certain node types
    if (node.details && node.details.length > 0) {
        menuItems += `
            <div class="ctx-menu-item" data-action="copy-details" style="${menuItemStyle}">
                <span style="width: 16px;">📄</span>
                <span>Copy details</span>
            </div>
        `;
    }

    contextMenuElement.innerHTML = menuItems;

    // Position the menu
    const menuWidth = 180;
    const menuHeight = contextMenuElement.offsetHeight || 200;
    let left = e.clientX;
    let top = e.clientY;

    // Ensure menu stays within viewport
    if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 10;
    }
    if (top + menuHeight > window.innerHeight) {
        top = window.innerHeight - menuHeight - 10;
    }

    contextMenuElement.style.left = `${left}px`;
    contextMenuElement.style.top = `${top}px`;
    contextMenuElement.style.display = 'block';

    // Update theme colors
    contextMenuElement.style.background = isDark ? UI_COLORS.backgroundPanelSolid : UI_COLORS.backgroundPanelLightSolid;
    contextMenuElement.style.color = isDark ? UI_COLORS.textBright : UI_COLORS.textLight;
    contextMenuElement.style.borderColor = isDark ? UI_COLORS.borderMedium : 'rgba(148, 163, 184, 0.4)';

    // Add hover effects and click handlers
    const items = contextMenuElement.querySelectorAll('.ctx-menu-item');
    items.forEach(item => {
        const itemEl = item as HTMLElement;
        itemEl.addEventListener('mouseenter', () => {
            itemEl.style.background = menuItemHoverBg;
        });
        itemEl.addEventListener('mouseleave', () => {
            itemEl.style.background = 'transparent';
        });
        itemEl.addEventListener('click', (clickE) => {
            clickE.stopPropagation();
            const action = itemEl.getAttribute('data-action');
            handleContextMenuAction(action, node);
            contextMenuElement!.style.display = 'none';
        });
    });
}

function handleContextMenuAction(action: string | null, node: FlowNode): void {
    switch (action) {
        case 'zoom':
            selectNode(node.id, { skipNavigation: true });
            zoomToNode(node);
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
    // Create a temporary feedback element
    const feedback = document.createElement('div');
    feedback.textContent = message;
    feedback.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(16, 185, 129, 0.9);
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 3000;
        animation: fadeInOut 1.5s ease forwards;
    `;

    // Add animation style if not exists
    if (!document.getElementById('copy-feedback-style')) {
        const style = document.createElement('style');
        style.id = 'copy-feedback-style';
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
                15% { opacity: 1; transform: translateX(-50%) translateY(0); }
                85% { opacity: 1; transform: translateX(-50%) translateY(0); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 1500);
}

function hideContextMenu(): void {
    if (contextMenuElement) {
        contextMenuElement.style.display = 'none';
    }
}

// ============================================================
// REDESIGNED: Column-Level Lineage Visualization
// Click-based approach with full lineage paths
// ============================================================

let selectedColumnLineage: ColumnFlow | null = null;
let columnLineagePanel: HTMLElement | null = null;

/**
 * Toggle column lineage mode
 */
export function toggleColumnFlows(show?: boolean): void {
    state.showColumnFlows = show !== undefined ? show : !state.showColumnFlows;

    if (state.showColumnFlows) {
        showColumnLineagePanel();
    } else {
        hideColumnLineagePanel();
        clearLineageHighlights();
    }

    // Update legend
    updateLegendPanel();
}

/**
 * Show the column lineage selection panel
 */
function showColumnLineagePanel(): void {
    if (!currentColumnFlows || currentColumnFlows.length === 0) {
        return;
    }

    // Remove existing panel
    hideColumnLineagePanel();

    // Create panel
    columnLineagePanel = document.createElement('div');
    columnLineagePanel.id = 'column-lineage-panel';
    columnLineagePanel.style.cssText = `
        position: fixed;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        background: ${state.isDarkTheme ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${state.isDarkTheme ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
        border-radius: 8px;
        padding: 12px;
        max-height: 70vh;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        min-width: 200px;
        max-width: 260px;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        font-weight: 600;
        font-size: 12px;
        color: ${state.isDarkTheme ? '#f1f5f9' : '#1e293b'};
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid ${state.isDarkTheme ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    header.innerHTML = `
        <span>Column Lineage</span>
        <span style="font-size: 9px; color: ${state.isDarkTheme ? '#64748b' : '#94a3b8'};">Click to trace</span>
    `;
    columnLineagePanel.appendChild(header);

    // List output columns
    const columnList = document.createElement('div');
    columnList.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    for (const flow of currentColumnFlows) {
        const columnItem = createColumnItem(flow);
        columnList.appendChild(columnItem);
    }

    columnLineagePanel.appendChild(columnList);
    document.body.appendChild(columnLineagePanel);
}

/**
 * Create a clickable column item
 */
function createColumnItem(flow: ColumnFlow): HTMLElement {
    const item = document.createElement('div');
    item.style.cssText = `
        padding: 8px 10px;
        background: ${state.isDarkTheme ? 'rgba(51, 65, 85, 0.5)' : 'rgba(241, 245, 249, 0.8)'};
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 2px solid transparent;
    `;

    // Get first and last step for summary
    const firstStep = flow.lineagePath[0];
    const lastStep = flow.lineagePath[flow.lineagePath.length - 1];

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
        item.style.background = state.isDarkTheme ? 'rgba(71, 85, 105, 0.7)' : 'rgba(226, 232, 240, 0.9)';
    });

    item.addEventListener('mouseleave', () => {
        if (selectedColumnLineage?.id !== flow.id) {
            item.style.background = state.isDarkTheme ? 'rgba(51, 65, 85, 0.5)' : 'rgba(241, 245, 249, 0.8)';
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
            (el as HTMLElement).style.background = state.isDarkTheme ? 'rgba(51, 65, 85, 0.5)' : 'rgba(241, 245, 249, 0.8)';
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
function showLineagePath(flow: ColumnFlow): void {
    if (!detailsPanel) {return;}

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
                        ${step.expression ? `<br><code style="font-size: 9px; color: ${state.isDarkTheme ? '#a5b4fc' : '#6366f1'};">${escapeHtml(step.expression)}</code>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    detailsPanel.innerHTML = `
        <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: ${state.isDarkTheme ? '#f1f5f9' : '#1e293b'};">
            Column Lineage
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
 * Highlight nodes in the lineage path
 */
function highlightLineageNodes(flow: ColumnFlow): void {
    if (!mainGroup) {return;}

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

    // Get node IDs in the lineage path
    const lineageNodeIds = new Set(flow.lineagePath.map(s => s.nodeId));

    // Highlight nodes in the path
    for (const step of flow.lineagePath) {
        const nodeGroup = mainGroup.querySelector(`[data-node-id="${step.nodeId}"]`);
        if (nodeGroup) {
            (nodeGroup as SVGElement).style.opacity = '1';

            // Add glow effect
            const rect = nodeGroup.querySelector('rect');
            if (rect) {
                rect.setAttribute('stroke', EDGE_COLORS.focus);
                rect.setAttribute('stroke-width', '3');
            }
        }
    }

    // Highlight edges between lineage nodes
    const allEdgePaths = mainGroup.querySelectorAll('.edge-path');
    allEdgePaths.forEach((edgePath) => {
        const edge = edgePath as SVGElement;
        const sourceId = edge.getAttribute('data-source');
        const targetId = edge.getAttribute('data-target');

        if (sourceId && targetId && lineageNodeIds.has(sourceId) && lineageNodeIds.has(targetId)) {
            edge.style.opacity = '1';
            edge.setAttribute('stroke', EDGE_COLORS.focus);
            edge.setAttribute('stroke-width', '3');

            // Also highlight the arrow
            const arrow = mainGroup?.querySelector(`.edge-arrow[data-source="${sourceId}"][data-target="${targetId}"]`);
            if (arrow) {
                (arrow as SVGElement).style.opacity = '1';
            }
        }
    });
}

/**
 * Clear all lineage highlights
 */
function clearLineageHighlights(): void {
    if (!mainGroup) {return;}

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
        { key: 'Ctrl/Cmd + F', description: 'Search nodes' },
        { key: '/', description: 'Focus search' },
        { key: '+/-', description: 'Zoom in/out' },
        { key: 'R', description: 'Reset view' },
        { key: 'F', description: 'Toggle fullscreen' },
        { key: 'T', description: 'Toggle theme' },
        { key: 'H', description: 'Cycle layouts' },
        { key: 'S', description: 'Toggle SQL preview' },
        { key: 'C', description: 'Toggle column lineage' },
        { key: 'Q', description: 'Toggle query stats' },
        { key: 'O', description: 'Toggle optimization hints' },
        { key: 'U', description: 'Focus upstream nodes' },
        { key: 'D', description: 'Focus downstream nodes' },
        { key: 'A', description: 'Focus all connected nodes' },
        { key: 'E', description: 'Expand/collapse all CTEs & subqueries' },
        { key: 'Esc', description: 'Close panels / Exit fullscreen' },
        { key: 'Enter', description: 'Next search result' },
        { key: '↑/←', description: 'Navigate to upstream node' },
        { key: '↓/→', description: 'Navigate to downstream node' },
        { key: '[', description: 'Previous query (Q1 → Q2)' },
        { key: ']', description: 'Next query (Q2 → Q3)' }
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
