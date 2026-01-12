import { FlowNode, FlowEdge, ColumnFlow, getNodeColor, ParseResult, QueryStats, OptimizationHint, ColumnLineage } from './sqlParser';
import { formatSql, highlightSql } from './sqlFormatter';

interface ViewState {
    scale: number;
    offsetX: number;
    offsetY: number;
    selectedNodeId: string | null;
    isDragging: boolean;
    dragStartX: number;
    dragStartY: number;
    searchTerm: string;
    searchResults: string[];
    currentSearchIndex: number;
    focusModeEnabled: boolean;
    legendVisible: boolean;
    highlightedColumnSources: string[]; // Node IDs to highlight for column flow
    isFullscreen: boolean;
    isDarkTheme: boolean;
    breadcrumbPath: FlowNode[]; // Current CTE/Subquery breadcrumb path
    showColumnLineage: boolean; // Toggle column-level lineage view
    selectedColumn: string | null; // Currently selected column for highlighting
}

const state: ViewState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    selectedNodeId: null,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
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
    selectedColumn: null
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

export function initRenderer(container: HTMLElement): void {
    // Create SVG element
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.background = '#0f172a';
    svg.style.cursor = 'grab';

    // Add defs for markers (arrows) and patterns
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
        </marker>
        <marker id="arrowhead-highlight" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#fbbf24" />
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
            <rect width="20" height="20" fill="#ffffff"/>
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" stroke-width="1"/>
        </pattern>
    `;
    svg.appendChild(defs);

    // Create background rectangle for pattern (light theme)
    backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    backgroundRect.setAttribute('width', '100%');
    backgroundRect.setAttribute('height', '100%');
    backgroundRect.setAttribute('fill', '#0f172a');
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
        right: 16px;
        top: 50%;
        width: 320px;
        max-height: 70vh;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
        transform: translate(calc(100% + 16px), -50%);
        transition: transform 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 200;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
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
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 8px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: #cbd5e1;
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
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: #94a3b8;
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
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: #94a3b8;
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
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        color: #94a3b8;
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
        background: rgba(15, 23, 42, 0.98);
        border-top: 1px solid rgba(148, 163, 184, 0.2);
        padding: 12px 16px;
        box-sizing: border-box;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        font-size: 12px;
        color: #e2e8f0;
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
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.2);
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
        border: 2px solid rgba(99, 102, 241, 0.7);
        background: rgba(99, 102, 241, 0.1);
        pointer-events: none;
    `;
    minimapContainer.appendChild(viewportRect);
    container.appendChild(minimapContainer);

    // Create tooltip element
    tooltipElement = document.createElement('div');
    tooltipElement.id = 'node-tooltip';
    tooltipElement.style.cssText = `
        position: fixed;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 8px;
        padding: 10px 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: #e2e8f0;
        z-index: 1000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    container.appendChild(tooltipElement);

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

    // Pan
    svg.addEventListener('mousedown', (e) => {
        if (e.target === svg || (e.target as Element).tagName === 'svg') {
            state.isDragging = true;
            state.dragStartX = e.clientX - state.offsetX;
            state.dragStartY = e.clientY - state.offsetY;
            svg!.style.cursor = 'grabbing';
        }
    });

    svg.addEventListener('mousemove', (e) => {
        if (state.isDragging) {
            state.offsetX = e.clientX - state.dragStartX;
            state.offsetY = e.clientY - state.dragStartY;
            updateTransform();
        }
    });

    svg.addEventListener('mouseup', () => {
        state.isDragging = false;
        svg!.style.cursor = 'grab';
    });

    svg.addEventListener('mouseleave', () => {
        state.isDragging = false;
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
    });

    // Click outside to deselect
    svg.addEventListener('click', (e) => {
        if (e.target === svg) {
            selectNode(null);
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in input fields
        const isInputFocused = document.activeElement?.tagName === 'INPUT' ||
                               document.activeElement?.tagName === 'TEXTAREA';

        // Ctrl/Cmd + F for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            searchBox?.focus();
            return;
        }

        // Escape to close panels and exit fullscreen
        if (e.key === 'Escape') {
            if (state.isFullscreen) {
                toggleFullscreen(false);
            }
            selectNode(null);
            if (searchBox) {
                searchBox.value = '';
                clearSearch();
            }
            return;
        }

        // Enter to go to next search result
        if (e.key === 'Enter' && document.activeElement === searchBox) {
            navigateSearch(1);
            return;
        }

        // Skip other shortcuts if input is focused
        if (isInputFocused) return;

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
        // L to toggle legend
        if (e.key === 'l' || e.key === 'L') {
            e.preventDefault();
            toggleLegend();
        }
        // S to show SQL preview
        if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            toggleSqlPreview();
        }
        // / to focus search (like vim)
        if (e.key === '/') {
            e.preventDefault();
            searchBox?.focus();
        }
    });
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

export function render(result: ParseResult): void {
    if (!mainGroup) { return; }

    currentNodes = result.nodes;
    currentEdges = result.edges;
    currentStats = result.stats;
    currentHints = result.hints;
    currentSql = result.sql;
    currentColumnLineage = result.columnLineage || [];
    currentTableUsage = result.tableUsage || new Map();

    // Reset highlight state
    state.highlightedColumnSources = [];

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

    // Render edges first (behind nodes)
    const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgesGroup.setAttribute('class', 'edges');
    for (const edge of result.edges) {
        renderEdge(edge, edgesGroup);
    }
    mainGroup.appendChild(edgesGroup);

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

    // Click to select
    group.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNode(node.id);
        hideTooltip();
    });

    // Double click to zoom to node
    group.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        zoomToNode(node);
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
    const textColor = isDark ? '#ffffff' : '#ffffff'; // Keep white for colored backgrounds
    const textColorMuted = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.9)';
    const textColorDim = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.8)';
    const strokeColor = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)';

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
            rect.setAttribute('stroke', 'rgba(239, 68, 68, 0.9)'); // red for write
            rect.setAttribute('stroke-width', '3');
        } else if (node.accessMode === 'read') {
            // Read operations: Blue border
            rect.setAttribute('stroke', 'rgba(59, 130, 246, 0.8)'); // blue for read
            rect.setAttribute('stroke-width', '3');
        } else if (tableCategory === 'cte_reference') {
            // CTE reference: double border effect with dashed inner
            rect.setAttribute('stroke', 'rgba(168, 85, 247, 0.8)'); // purple for CTE
            rect.setAttribute('stroke-width', '3');
            rect.setAttribute('stroke-dasharray', '8,4');
        } else if (tableCategory === 'derived' || node.accessMode === 'derived') {
            // Derived table: dashed border
            rect.setAttribute('stroke', 'rgba(168, 85, 247, 0.7)'); // purple for derived
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
            'rgba(239, 68, 68, 0.4)' :    // Red glow for high complexity
            'rgba(245, 158, 11, 0.4)';     // Orange glow for medium complexity

        rect.setAttribute('stroke', complexityColor.replace('0.4', '0.8'));
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('stroke-dasharray', '4,2');
    }

    group.appendChild(rect);

    // Add badges for access mode and category
    const badges: Array<{ text: string; color: string }> = [];

    // Access mode badges (highest priority)
    if (node.accessMode === 'read') {
        badges.push({ text: 'READ', color: '#3b82f6' }); // Blue
    } else if (node.accessMode === 'write') {
        badges.push({ text: 'WRITE', color: '#ef4444' }); // Red
    } else if (node.accessMode === 'derived') {
        badges.push({ text: 'DERIVED', color: '#a855f7' }); // Purple
    }

    // Table category badges
    if (isTable && tableCategory === 'cte_reference' && !node.accessMode) {
        badges.push({ text: 'CTE', color: '#a855f7' }); // Purple
    } else if (isTable && tableCategory === 'derived' && !node.accessMode) {
        badges.push({ text: 'DERIVED', color: '#14b8a6' }); // Teal
    }

    // Operation type badges
    if (node.operationType && node.operationType !== 'SELECT') {
        const opColors: Record<string, string> = {
            'INSERT': '#10b981', // Green
            'UPDATE': '#f59e0b', // Amber
            'DELETE': '#dc2626', // Dark Red
            'MERGE': '#8b5cf6',  // Violet
            'CREATE_TABLE_AS': '#06b6d4' // Cyan
        };
        const opColor = opColors[node.operationType] || '#64748b';
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
    const padding = 6;
    const headerHeight = 28;

    // Outer container with dashed border effect
    const outerRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outerRect.setAttribute('x', String(node.x));
    outerRect.setAttribute('y', String(node.y));
    outerRect.setAttribute('width', String(node.width));
    outerRect.setAttribute('height', String(isExpanded && hasChildren ? node.height : 55));
    outerRect.setAttribute('rx', '8');
    outerRect.setAttribute('fill', '#1e293b');
    outerRect.setAttribute('stroke', getNodeColor(node.type));
    outerRect.setAttribute('stroke-width', '2');
    outerRect.setAttribute('stroke-dasharray', '6,3');
    outerRect.setAttribute('filter', 'url(#shadow)');
    outerRect.setAttribute('class', 'node-rect');
    group.appendChild(outerRect);

    // Header with solid background
    const header = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    header.setAttribute('x', String(node.x + 2));
    header.setAttribute('y', String(node.y + 2));
    header.setAttribute('width', String(node.width - 4));
    header.setAttribute('height', String(headerHeight));
    header.setAttribute('rx', '6');
    header.setAttribute('fill', getNodeColor(node.type));
    group.appendChild(header);

    // Subquery icon and label
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', String(node.x + 10));
    iconText.setAttribute('y', String(node.y + 20));
    iconText.setAttribute('fill', 'white');
    iconText.setAttribute('font-size', '11');
    iconText.textContent = '⊂';
    group.appendChild(iconText);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 24));
    label.setAttribute('y', String(node.y + 20));
    label.setAttribute('fill', 'white');
    label.setAttribute('font-size', '11');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', 'monospace');
    label.textContent = truncate(node.label, 20);
    group.appendChild(label);

    // Render children (internal operations)
    if (isExpanded && hasChildren && node.children) {
        let yOffset = node.y + headerHeight + 8;

        for (const child of node.children) {
            // Small operation badge
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            badge.setAttribute('x', String(node.x + padding + 4));
            badge.setAttribute('y', String(yOffset));
            badge.setAttribute('width', String(node.width - padding * 2 - 8));
            badge.setAttribute('height', '20');
            badge.setAttribute('rx', '4');
            badge.setAttribute('fill', getNodeColor(child.type));
            badge.setAttribute('opacity', '0.85');
            group.appendChild(badge);

            // Operation icon
            const opIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            opIcon.setAttribute('x', String(node.x + padding + 10));
            opIcon.setAttribute('y', String(yOffset + 14));
            opIcon.setAttribute('fill', 'white');
            opIcon.setAttribute('font-size', '9');
            opIcon.textContent = getNodeIcon(child.type);
            group.appendChild(opIcon);

            // Operation label
            const opLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            opLabel.setAttribute('x', String(node.x + padding + 24));
            opLabel.setAttribute('y', String(yOffset + 14));
            opLabel.setAttribute('fill', 'white');
            opLabel.setAttribute('font-size', '9');
            opLabel.setAttribute('font-weight', '500');
            opLabel.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
            opLabel.textContent = truncate(child.label, 18);
            group.appendChild(opLabel);

            yOffset += 24;
        }
    } else if (!hasChildren) {
        // Show "Derived Table" text when no internal details
        const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        descText.setAttribute('x', String(node.x + node.width / 2));
        descText.setAttribute('y', String(node.y + 44));
        descText.setAttribute('text-anchor', 'middle');
        descText.setAttribute('fill', '#64748b');
        descText.setAttribute('font-size', '10');
        descText.textContent = 'Derived Table';
        group.appendChild(descText);
    }
}

function renderCteNode(node: FlowNode, group: SVGGElement, isExpanded: boolean, hasChildren: boolean | undefined): void {
    const padding = 8;
    const headerHeight = 36;

    // Container background
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(node.x));
    rect.setAttribute('y', String(node.y));
    rect.setAttribute('width', String(node.width));
    rect.setAttribute('height', String(isExpanded && hasChildren ? node.height : 50));
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', getNodeColor(node.type));
    rect.setAttribute('filter', 'url(#shadow)');
    rect.setAttribute('class', 'node-rect');
    group.appendChild(rect);

    // Header bar
    const header = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    header.setAttribute('x', String(node.x));
    header.setAttribute('y', String(node.y));
    header.setAttribute('width', String(node.width));
    header.setAttribute('height', String(headerHeight));
    header.setAttribute('rx', '10');
    header.setAttribute('fill', 'rgba(0,0,0,0.2)');
    group.appendChild(header);

    const headerClip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    headerClip.setAttribute('x', String(node.x));
    headerClip.setAttribute('y', String(node.y + headerHeight - 10));
    headerClip.setAttribute('width', String(node.width));
    headerClip.setAttribute('height', '10');
    headerClip.setAttribute('fill', 'rgba(0,0,0,0.2)');
    group.appendChild(headerClip);

    // Icon
    const icon = getNodeIcon(node.type);
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', String(node.x + 12));
    iconText.setAttribute('y', String(node.y + 24));
    iconText.setAttribute('fill', 'rgba(255,255,255,0.9)');
    iconText.setAttribute('font-size', '14');
    iconText.textContent = icon;
    group.appendChild(iconText);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 32));
    label.setAttribute('y', String(node.y + 24));
    label.setAttribute('fill', 'white');
    label.setAttribute('font-size', '12');
    label.setAttribute('font-weight', '600');
    label.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    label.textContent = truncate(node.label, 18);
    group.appendChild(label);

    // Render children if expanded
    if (isExpanded && hasChildren && node.children) {
        const childrenGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        childrenGroup.setAttribute('class', 'children-group');

        // Inner content area
        const innerBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        innerBg.setAttribute('x', String(node.x + padding));
        innerBg.setAttribute('y', String(node.y + headerHeight + 4));
        innerBg.setAttribute('width', String(node.width - padding * 2));
        innerBg.setAttribute('height', String(node.height - headerHeight - padding - 4));
        innerBg.setAttribute('rx', '6');
        innerBg.setAttribute('fill', 'rgba(0,0,0,0.15)');
        childrenGroup.appendChild(innerBg);

        // Render child nodes as mini pills
        let yOffset = node.y + headerHeight + 12;
        for (const child of node.children) {
            const childPill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            childPill.setAttribute('x', String(node.x + padding + 6));
            childPill.setAttribute('y', String(yOffset));
            childPill.setAttribute('width', String(node.width - padding * 2 - 12));
            childPill.setAttribute('height', '24');
            childPill.setAttribute('rx', '4');
            childPill.setAttribute('fill', getNodeColor(child.type));
            childPill.setAttribute('opacity', '0.9');
            childrenGroup.appendChild(childPill);

            // Child icon
            const childIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            childIcon.setAttribute('x', String(node.x + padding + 12));
            childIcon.setAttribute('y', String(yOffset + 16));
            childIcon.setAttribute('fill', 'rgba(255,255,255,0.9)');
            childIcon.setAttribute('font-size', '10');
            childIcon.textContent = getNodeIcon(child.type);
            childrenGroup.appendChild(childIcon);

            // Child label
            const childLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            childLabel.setAttribute('x', String(node.x + padding + 26));
            childLabel.setAttribute('y', String(yOffset + 16));
            childLabel.setAttribute('fill', 'white');
            childLabel.setAttribute('font-size', '10');
            childLabel.setAttribute('font-weight', '500');
            childLabel.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
            childLabel.textContent = truncate(child.label, 16);
            childrenGroup.appendChild(childLabel);

            yOffset += 30;
        }

        group.appendChild(childrenGroup);
    }
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
    header.setAttribute('fill', 'rgba(0,0,0,0.2)');
    group.appendChild(header);

    const headerClip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    headerClip.setAttribute('x', String(node.x));
    headerClip.setAttribute('y', String(node.y + headerHeight - 10));
    headerClip.setAttribute('width', String(node.width));
    headerClip.setAttribute('height', '10');
    headerClip.setAttribute('fill', 'rgba(0,0,0,0.2)');
    group.appendChild(headerClip);

    // Icon and title
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', 'rgba(255,255,255,0.9)');
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
        funcPill.setAttribute('fill', 'rgba(0,0,0,0.2)');
        group.appendChild(funcPill);

        // Function name
        const funcName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        funcName.setAttribute('x', String(node.x + padding + 6));
        funcName.setAttribute('y', String(yOffset + 15));
        funcName.setAttribute('fill', '#fbbf24');
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
            partBadge.setAttribute('fill', '#6366f1');
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
            orderBadge.setAttribute('fill', '#10b981');
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
        moreText.setAttribute('fill', 'rgba(255,255,255,0.6)');
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
    header.setAttribute('fill', 'rgba(0,0,0,0.2)');
    group.appendChild(header);

    // Icon and title
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', 'rgba(255,255,255,0.9)');
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
        funcPill.setAttribute('fill', 'rgba(0,0,0,0.2)');
        group.appendChild(funcPill);

        // Function expression
        const funcText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        funcText.setAttribute('x', String(node.x + padding + 6));
        funcText.setAttribute('y', String(yOffset + 16));
        funcText.setAttribute('fill', '#fbbf24');
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
        moreText.setAttribute('fill', 'rgba(255,255,255,0.6)');
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
    header.setAttribute('fill', 'rgba(0,0,0,0.2)');
    group.appendChild(header);

    // Icon and title
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(node.x + 10));
    icon.setAttribute('y', String(node.y + 22));
    icon.setAttribute('fill', 'rgba(255,255,255,0.9)');
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
        casePill.setAttribute('fill', 'rgba(0,0,0,0.2)');
        group.appendChild(casePill);

        // CASE conditions count
        const caseText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        caseText.setAttribute('x', String(node.x + padding + 6));
        caseText.setAttribute('y', String(yOffset + 18));
        caseText.setAttribute('fill', '#fbbf24');
        caseText.setAttribute('font-size', '10');
        caseText.setAttribute('font-weight', '600');
        caseText.setAttribute('font-family', 'monospace');
        caseText.textContent = `${caseStmt.conditions.length} WHEN condition${caseStmt.conditions.length > 1 ? 's' : ''}`;
        group.appendChild(caseText);

        if (caseStmt.elseValue) {
            const elseText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            elseText.setAttribute('x', String(node.x + padding + 6));
            elseText.setAttribute('y', String(yOffset + 32));
            elseText.setAttribute('fill', 'rgba(255,255,255,0.7)');
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
        moreText.setAttribute('fill', 'rgba(255,255,255,0.6)');
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
    path.setAttribute('stroke', '#64748b');
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
            path.setAttribute('stroke', '#94a3b8');
            path.setAttribute('stroke-width', '3');
        }
    });

    path.addEventListener('mouseleave', () => {
        if (!path.getAttribute('data-highlighted')) {
            path.setAttribute('stroke', '#64748b');
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
            e.setAttribute('stroke', '#fbbf24');
            e.setAttribute('stroke-width', '3');
        } else {
            e.setAttribute('stroke', '#64748b');
            e.setAttribute('stroke-width', '2');
        }
    });

    // Highlight clicked edge
    const clickedEdge = mainGroup?.querySelector(`[data-edge-id="${edge.id}"]`);
    if (clickedEdge) {
        clickedEdge.setAttribute('data-highlighted', 'true');
        clickedEdge.setAttribute('stroke', '#10b981'); // Green for selected edge
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
            background: rgba(15, 23, 42, 0.98);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 12px;
            padding: 16px 20px;
            max-width: 600px;
            z-index: 1000;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
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
            color: #94a3b8;
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
            <div style="color: #cbd5e1; font-size: 13px; font-weight: 600;">
                ${edge.label || 'Data Flow'}
            </div>
        </div>
        <div style="
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px;
            padding: 12px;
            color: #e2e8f0;
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 200px;
            overflow-y: auto;
        ">${escapeHtml(edge.sqlClause || 'No SQL clause information available')}</div>
        ${edge.startLine ? `
            <div style="color: #94a3b8; font-size: 11px; margin-top: 8px;">
                📍 Line ${edge.startLine}${edge.endLine && edge.endLine !== edge.startLine ? `-${edge.endLine}` : ''}
            </div>
        ` : ''}
    `;

    clausePanel.style.display = 'block';
}

function getClauseTypeColor(clauseType: string): string {
    switch (clauseType) {
        case 'join': return '#3b82f6'; // Blue
        case 'where': return '#8b5cf6'; // Purple
        case 'having': return '#ec4899'; // Pink
        case 'on': return '#06b6d4'; // Cyan
        case 'filter': return '#f59e0b'; // Amber
        default: return '#64748b'; // Gray
    }
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
                selectNode(node.id);
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
                edge.setAttribute('stroke', '#fbbf24');
                edge.setAttribute('stroke-width', '3');
                edge.setAttribute('marker-end', 'url(#arrowhead-highlight)');
            } else {
                edge.setAttribute('stroke', '#64748b');
                edge.setAttribute('stroke-width', '2');
                edge.setAttribute('marker-end', 'url(#arrowhead)');
            }
        }
    });
}

function renderError(message: string): void {
    if (!mainGroup) { return; }

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', '50%');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#f87171');
    text.setAttribute('font-size', '14');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    text.textContent = `Error: ${message}`;
    mainGroup.appendChild(text);
}

function selectNode(nodeId: string | null): void {
    state.selectedNodeId = nodeId;

    // Update visual selection
    const nodeGroups = mainGroup?.querySelectorAll('.node');
    nodeGroups?.forEach(g => {
        const rect = g.querySelector('.node-rect');
        const id = g.getAttribute('data-id');
        if (rect && id) {
            if (id === nodeId) {
                rect.setAttribute('stroke', '#fff');
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
            edge.setAttribute('stroke', '#64748b');
            edge.setAttribute('stroke-width', '2');
            edge.setAttribute('marker-end', 'url(#arrowhead)');
        });
    }

    // Jump to SQL definition if node has a line number
    if (nodeId) {
        const node = currentNodes.find(n => n.id === nodeId);
        if (node?.startLine && typeof window !== 'undefined') {
            const vscodeApi = (window as any).vscodeApi;
            if (vscodeApi && vscodeApi.postMessage) {
                vscodeApi.postMessage({
                    command: 'goToLine',
                    line: node.startLine
                });
            }
        }
    }

    // Update details panel
    updateDetailsPanel(nodeId);

    // Update breadcrumb navigation
    updateBreadcrumb(nodeId);
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
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Window Functions</div>
                ${node.windowDetails.functions.map(func => `
                    <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                        <div style="color: #fbbf24; font-weight: 600; font-size: 13px; font-family: monospace; margin-bottom: 6px;">
                            ${escapeHtml(func.name)}()
                        </div>
                        ${func.partitionBy && func.partitionBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                <span style="background: #6366f1; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">PARTITION BY</span>
                                <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(func.partitionBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.orderBy && func.orderBy.length > 0 ? `
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                <span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">ORDER BY</span>
                                <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(func.orderBy.join(', '))}</span>
                            </div>
                        ` : ''}
                        ${func.frame ? `
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">FRAME</span>
                                <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(func.frame)}</span>
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
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Aggregate Functions</div>
                ${node.aggregateDetails.functions.map(func => `
                    <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                        <div style="color: #f59e0b; font-weight: 600; font-size: 13px; font-family: monospace; margin-bottom: 4px;">
                            ${escapeHtml(func.expression)}
                        </div>
                        ${func.alias ? `
                            <div style="color: #94a3b8; font-size: 11px; font-family: monospace;">
                                Alias: ${escapeHtml(func.alias)}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
                ${node.aggregateDetails.groupBy && node.aggregateDetails.groupBy.length > 0 ? `
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(148, 163, 184, 0.2);">
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;">GROUP BY:</div>
                        <div style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(node.aggregateDetails.groupBy.join(', '))}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // CASE statement details
    if (node.caseDetails && node.caseDetails.cases.length > 0) {
        detailsSection += `
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">CASE Statements</div>
                ${node.caseDetails.cases.map((caseStmt, idx) => `
                    <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
                        ${caseStmt.alias ? `
                            <div style="color: #eab308; font-weight: 600; font-size: 12px; margin-bottom: 8px;">
                                ${escapeHtml(caseStmt.alias)}
                            </div>
                        ` : ''}
                        ${caseStmt.conditions.map((cond, condIdx) => `
                            <div style="margin-bottom: 6px;">
                                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                                    <span style="background: #6366f1; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">WHEN</span>
                                    <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(cond.when)}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; margin-left: 40px;">
                                    <span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">THEN</span>
                                    <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(cond.then)}</span>
                                </div>
                            </div>
                        `).join('')}
                        ${caseStmt.elseValue ? `
                            <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                <span style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">ELSE</span>
                                <span style="color: #cbd5e1; font-size: 11px; font-family: monospace;">${escapeHtml(caseStmt.elseValue)}</span>
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
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Internal Structure</div>
                <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 10px;">
                    ${node.children.map(child => `
                        <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
                            <span style="background: ${getNodeColor(child.type)}; padding: 3px 8px; border-radius: 4px; color: white; font-size: 10px; font-weight: 500;">
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
            <div style="margin-bottom: 16px;">
                <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Details</div>
                <div style="background: rgba(30, 41, 59, 0.5); border-radius: 6px; padding: 12px;">
                    ${node.details.map(d => `
                        <div style="color: #cbd5e1; font-size: 12px; padding: 4px 0; font-family: monospace;">
                            ${escapeHtml(d)}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    detailsPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin: 0; color: #f1f5f9; font-size: 14px;">Node Details</h3>
            <button id="close-details" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 20px; padding: 4px;">&times;</button>
        </div>
        <div style="background: ${getNodeColor(node.type)}; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div style="color: white; font-weight: 600; font-size: 14px; margin-bottom: 4px;">
                ${getNodeIcon(node.type)} ${node.label}
            </div>
            <div style="color: rgba(255,255,255,0.8); font-size: 12px;">
                ${node.description || ''}
            </div>
        </div>
        ${detailsSection}
        <div style="color: #64748b; font-size: 11px; margin-top: 20px;">
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
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const textColorMuted = isDark ? '#94a3b8' : '#64748b';
    const textColorDim = isDark ? '#64748b' : '#94a3b8';
    const tableTextColor = isDark ? '#cbd5e1' : '#334155';
    const borderColor = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';

    const complexityColors: Record<string, string> = {
        'Simple': '#22c55e',
        'Moderate': '#eab308',
        'Complex': '#f97316',
        'Very Complex': '#ef4444'
    };

    // Build table list HTML
    let tableListHtml = '';
    if (currentTableUsage && currentTableUsage.size > 0) {
        const sortedTables = Array.from(currentTableUsage.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by usage count descending
            .slice(0, 8); // Show top 8 tables
        
        tableListHtml = `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
                <div style="font-size: 10px; color: ${textColorMuted}; margin-bottom: 6px; font-weight: 600;">Tables Used:</div>
                <div style="display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto;">
                    ${sortedTables.map(([tableName, count]) => `
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
                    ${currentTableUsage.size > 8 ? `
                        <div style="font-size: 9px; color: ${textColorDim}; font-style: italic;">
                            +${currentTableUsage.size - 8} more
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
                background: ${complexityColors[currentStats.complexity]};
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
            ">${currentStats.complexity}</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
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
            <div style="text-align: center;">
                <div style="color: ${textColor}; font-weight: 600;">${currentStats.complexityScore}</div>
                <div style="font-size: 10px; color: ${textColorMuted};">Score</div>
            </div>
        </div>
        ${currentStats.ctes > 0 || currentStats.subqueries > 0 || currentStats.windowFunctions > 0 ? `
            <div style="display: flex; gap: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor}; color: ${textColorMuted};">
                ${currentStats.ctes > 0 ? `<span>CTEs: ${currentStats.ctes}</span>` : ''}
                ${currentStats.subqueries > 0 ? `<span>Subqueries: ${currentStats.subqueries}</span>` : ''}
                ${currentStats.windowFunctions > 0 ? `<span>Window: ${currentStats.windowFunctions}</span>` : ''}
            </div>
        ` : ''}
        ${tableListHtml}
    `;
}

function updateHintsPanel(): void {
    if (!hintsPanel) { return; }

    if (!currentHints || currentHints.length === 0) {
        hintsPanel.style.display = 'none';
        return;
    }

    hintsPanel.style.display = 'block';

    const hintColors: Record<string, { bg: string; border: string; icon: string }> = {
        'error': { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', icon: '⚠' },
        'warning': { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', icon: '⚡' },
        'info': { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', icon: 'ℹ' }
    };

    hintsPanel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="font-weight: 600; color: #f1f5f9;">Optimization Hints</span>
            <span style="
                background: rgba(245, 158, 11, 0.2);
                color: #fbbf24;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
            ">${currentHints.length}</span>
        </div>
        ${currentHints.map(hint => {
        const style = hintColors[hint.type] || hintColors.info;
        return `
                <div style="
                    background: ${style.bg};
                    border-left: 3px solid ${style.border};
                    padding: 8px 12px;
                    margin-bottom: 8px;
                    border-radius: 0 4px 4px 0;
                ">
                    <div style="color: #f1f5f9; font-size: 12px; margin-bottom: 4px;">
                        ${style.icon} ${hint.message}
                    </div>
                    ${hint.suggestion ? `
                        <div style="color: #94a3b8; font-size: 11px;">
                            ${hint.suggestion}
                        </div>
                    ` : ''}
                </div>
            `;
    }).join('')}
    `;
}

function fitView(): void {
    if (!svg || currentNodes.length === 0) { return; }

    const rect = svg.getBoundingClientRect();
    const padding = 80;

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of currentNodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
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

    updateTransform();
}

function zoomToNode(node: FlowNode): void {
    if (!svg) { return; }

    const rect = svg.getBoundingClientRect();
    const targetScale = 1.5;

    // Center the node
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;

    state.scale = targetScale;
    state.offsetX = rect.width / 2 - centerX * state.scale - 140; // Offset for panels
    state.offsetY = rect.height / 2 - centerY * state.scale;

    updateTransform();
}

export function zoomIn(): void {
    state.scale = Math.min(state.scale * 1.2, 3);
    updateTransform();
}

export function zoomOut(): void {
    state.scale = Math.max(state.scale / 1.2, 0.2);
    updateTransform();
}

export function resetView(): void {
    fitView();
}

// Search functionality
export function setSearchBox(input: HTMLInputElement): void {
    searchBox = input;
    input.addEventListener('input', () => {
        performSearch(input.value);
    });
}

function performSearch(term: string): void {
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

    // Find matching nodes
    allNodes?.forEach(g => {
        const label = g.getAttribute('data-label') || '';
        const id = g.getAttribute('data-id') || '';
        if (label.includes(state.searchTerm) || id.includes(state.searchTerm)) {
            state.searchResults.push(id);
            g.classList.add('search-match');
            const rect = g.querySelector('.node-rect');
            if (rect) {
                rect.setAttribute('stroke', '#fbbf24');
                rect.setAttribute('stroke-width', '2');
            }
        }
    });

    // Navigate to first result
    if (state.searchResults.length > 0) {
        navigateSearch(0);
    }
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
        selectNode(nodeId);
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
export function exportToPng(): void {
    if (!svg) { return; }

    const svgClone = svg.cloneNode(true) as SVGSVGElement;

    // Set explicit dimensions
    const bounds = calculateBounds();
    const padding = 40;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    svgClone.setAttribute('viewBox', `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`);

    // Reset transform on main group
    const mainG = svgClone.querySelector('g');
    if (mainG) {
        mainG.removeAttribute('transform');
    }

    // Add background
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', String(bounds.minX - padding));
    bgRect.setAttribute('y', String(bounds.minY - padding));
    bgRect.setAttribute('width', String(width));
    bgRect.setAttribute('height', String(height));
    bgRect.setAttribute('fill', '#0f172a');
    svgClone.insertBefore(bgRect, svgClone.firstChild);

    // Convert to image
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }

    const scale = 2; // High DPI
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0);
        const a = document.createElement('a');
        a.download = `sql-flow-${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
}

export function exportToSvg(): void {
    if (!svg) { return; }

    const svgClone = svg.cloneNode(true) as SVGSVGElement;

    // Set explicit dimensions
    const bounds = calculateBounds();
    const padding = 40;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    svgClone.setAttribute('viewBox', `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Reset transform
    const mainG = svgClone.querySelector('g');
    if (mainG) {
        mainG.removeAttribute('transform');
    }

    // Add background
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', String(bounds.minX - padding));
    bgRect.setAttribute('y', String(bounds.minY - padding));
    bgRect.setAttribute('width', String(width));
    bgRect.setAttribute('height', String(height));
    bgRect.setAttribute('fill', '#0f172a');
    svgClone.insertBefore(bgRect, svgClone.firstChild);

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.download = `sql-flow-${Date.now()}.svg`;
    a.href = url;
    a.click();

    URL.revokeObjectURL(url);
}

export function copyToClipboard(): void {
    if (!svg) { return; }

    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    const bounds = calculateBounds();
    const padding = 40;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    svgClone.setAttribute('viewBox', `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`);

    const mainG = svgClone.querySelector('g');
    if (mainG) {
        mainG.removeAttribute('transform');
    }

    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', String(bounds.minX - padding));
    bgRect.setAttribute('y', String(bounds.minY - padding));
    bgRect.setAttribute('width', String(width));
    bgRect.setAttribute('height', String(height));
    bgRect.setAttribute('fill', '#0f172a');
    svgClone.insertBefore(bgRect, svgClone.firstChild);

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }

    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
            if (blob) {
                navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]).catch(console.error);
            }
        }, 'image/png');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
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
        'complex': '🧮'
    };
    return icons[warningType] || '⚠';
}

function getWarningColor(severity: string): string {
    const colors: Record<string, string> = {
        'low': '#f59e0b',    // Amber
        'medium': '#f97316', // Orange
        'high': '#ef4444'    // Red
    };
    return colors[severity] || '#f59e0b';
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
    table: { color: '#3b82f6', icon: '⊞', description: 'Source table' },
    filter: { color: '#8b5cf6', icon: '⧩', description: 'WHERE/HAVING filter' },
    join: { color: '#ec4899', icon: '⋈', description: 'JOIN operation' },
    aggregate: { color: '#f59e0b', icon: 'Σ', description: 'GROUP BY aggregation' },
    sort: { color: '#10b981', icon: '↕', description: 'ORDER BY sorting' },
    limit: { color: '#06b6d4', icon: '⊟', description: 'LIMIT clause' },
    select: { color: '#6366f1', icon: '▤', description: 'Column projection' },
    result: { color: '#22c55e', icon: '◉', description: 'Query output' },
    cte: { color: '#a855f7', icon: '↻', description: 'Common Table Expression' },
    union: { color: '#f97316', icon: '∪', description: 'Set operation' },
    subquery: { color: '#14b8a6', icon: '⊂', description: 'Subquery/Derived table' },
    window: { color: '#d946ef', icon: '▦', description: 'Window function' }
};

function updateLegendPanel(): void {
    if (!legendPanel) return;

    legendPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; color: #f1f5f9; font-size: 12px;">Node Types</span>
            <button id="close-legend" style="background: none; border: none; color: #64748b; cursor: pointer; font-size: 14px;">&times;</button>
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
                        <div style="color: #e2e8f0; font-size: 11px; font-weight: 500;">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                        <div style="color: #64748b; font-size: 9px;">${info.description}</div>
                    </div>
                </div>
            `).join('')}
        </div>
        <div style="border-top: 1px solid rgba(148, 163, 184, 0.2); margin-top: 12px; padding-top: 10px;">
            <div style="font-weight: 600; color: #f1f5f9; font-size: 11px; margin-bottom: 8px;">Table Categories</div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                        background: #3b82f6;
                        width: 24px;
                        height: 16px;
                        border-radius: 3px;
                        border: 2px solid rgba(255,255,255,0.3);
                    "></span>
                    <div style="color: #e2e8f0; font-size: 10px;">Physical Table</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                        background: #3b82f6;
                        width: 24px;
                        height: 16px;
                        border-radius: 3px;
                        border: 3px dashed rgba(168, 85, 247, 0.8);
                    "></span>
                    <div style="color: #e2e8f0; font-size: 10px;">CTE Reference</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                        background: #14b8a6;
                        width: 24px;
                        height: 16px;
                        border-radius: 3px;
                        border: 2px dashed rgba(20, 184, 166, 0.8);
                    "></span>
                    <div style="color: #e2e8f0; font-size: 10px;">Derived Table</div>
                </div>
            </div>
        </div>
    `;

    legendPanel.querySelector('#close-legend')?.addEventListener('click', () => {
        toggleLegend(false);
    });
}

export function toggleLegend(show?: boolean): void {
    if (!legendPanel) return;
    state.legendVisible = show ?? !state.legendVisible;
    legendPanel.style.display = state.legendVisible ? 'block' : 'none';
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
    if (!state.focusModeEnabled || !mainGroup) return;

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
    if (!mainGroup) return;

    const allNodes = mainGroup.querySelectorAll('.node');
    allNodes.forEach(nodeEl => {
        (nodeEl as SVGGElement).style.opacity = '1';
    });

    const allEdges = mainGroup.querySelectorAll('.edge');
    allEdges.forEach(edgeEl => {
        (edgeEl as SVGPathElement).style.opacity = '1';
    });
}

function getConnectedNodes(nodeId: string): Set<string> {
    const connected = new Set<string>();

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

    findUpstream(nodeId);
    findDownstream(nodeId);

    return connected;
}

// ============================================================
// FEATURE: Column Flow Highlighting
// ============================================================

export function highlightColumnSources(columnName: string): void {
    if (!mainGroup) return;

    // Find lineage for this column
    const lineage = currentColumnLineage.find(l =>
        l.outputColumn.toLowerCase() === columnName.toLowerCase()
    );

    // Clear previous highlights
    clearColumnHighlights();

    if (!lineage || lineage.sources.length === 0) return;

    // Store highlighted node IDs
    state.highlightedColumnSources = lineage.sources.map(s => s.nodeId).filter(Boolean);

    // Highlight source nodes with special glow
    for (const source of lineage.sources) {
        if (!source.nodeId) continue;

        const nodeEl = mainGroup.querySelector(`.node[data-id="${source.nodeId}"]`);
        if (nodeEl) {
            const rect = nodeEl.querySelector('.node-rect');
            if (rect) {
                rect.setAttribute('stroke', '#22d3ee');
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
    if (!mainGroup || state.highlightedColumnSources.length === 0) return;

    // Find SELECT node
    const selectNode = currentNodes.find(n => n.type === 'select');
    if (!selectNode) return;

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
            edgeEl.setAttribute('stroke', '#22d3ee');
            edgeEl.setAttribute('stroke-width', '3');
            edgeEl.setAttribute('stroke-dasharray', '5,3');
        }
    });
}

function findPath(fromId: string, toId: string, visited: Set<string>): boolean {
    if (fromId === toId) return true;

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
    if (!mainGroup) return;

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
        edgeEl.setAttribute('stroke', '#64748b');
        edgeEl.setAttribute('stroke-width', '2');
        edgeEl.removeAttribute('stroke-dasharray');
        edgeEl.setAttribute('marker-end', 'url(#arrowhead)');
    });
}

// ============================================================
// FEATURE: SQL Preview Panel
// ============================================================

export function toggleSqlPreview(show?: boolean): void {
    if (!sqlPreviewPanel) return;
    const shouldShow = show ?? (sqlPreviewPanel.style.display === 'none');
    sqlPreviewPanel.style.display = shouldShow ? 'block' : 'none';

    if (shouldShow) {
        updateSqlPreview();
    }
}

function updateSqlPreview(): void {
    if (!sqlPreviewPanel || !currentSql) return;

    const formattedSql = formatSql(currentSql);
    const highlightedSql = highlightSql(formattedSql);

    sqlPreviewPanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; color: #f1f5f9; font-size: 12px;">SQL Query</span>
            <div style="display: flex; gap: 8px;">
                <button id="copy-sql" style="
                    background: rgba(99, 102, 241, 0.2);
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    border-radius: 4px;
                    color: #a5b4fc;
                    padding: 4px 10px;
                    font-size: 10px;
                    cursor: pointer;
                ">Copy</button>
                <button id="close-sql-preview" style="
                    background: none;
                    border: none;
                    color: #64748b;
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
    if (!node || !node.collapsible) return;

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
        if (minimapContainer) minimapContainer.style.display = 'none';
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

    if (!viewport || !minimapContainer || !svg || currentNodes.length < 8) return;

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
    if (!resultNode) return 0;

    const visited = new Set<string>();
    let maxDepth = 0;

    function dfs(nodeId: string, depth: number) {
        if (visited.has(nodeId)) return;
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
// FEATURE: Fullscreen Mode
// ============================================================

export function toggleFullscreen(enable?: boolean): void {
    state.isFullscreen = enable ?? !state.isFullscreen;

    if (!containerElement) return;

    if (state.isFullscreen) {
        // Save original styles
        containerElement.dataset.originalStyles = containerElement.style.cssText;

        // Go fullscreen
        containerElement.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 9999 !important;
            background: ${state.isDarkTheme ? '#0f172a' : '#f8fafc'};
        `;

        // Try to use browser fullscreen API
        if (containerElement.requestFullscreen) {
            containerElement.requestFullscreen().catch(() => {
                // Fallscreen API failed, but CSS fullscreen still works
            });
        }
    } else {
        // Restore original styles
        containerElement.style.cssText = containerElement.dataset.originalStyles || '';

        // Exit browser fullscreen
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
    if (!svg) return;

    const colors = dark ? {
        bg: '#0f172a',
        panelBg: 'rgba(15, 23, 42, 0.95)',
        panelBgSolid: 'rgba(15, 23, 42, 0.98)',
        border: 'rgba(148, 163, 184, 0.2)',
        text: '#f1f5f9',
        textMuted: '#94a3b8',
        textDim: '#64748b'
    } : {
        bg: '#ffffff',
        panelBg: 'rgba(255, 255, 255, 0.95)',
        panelBgSolid: 'rgba(255, 255, 255, 0.98)',
        border: 'rgba(148, 163, 184, 0.3)',
        text: '#1e293b',
        textMuted: '#475569',
        textDim: '#94a3b8'
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
        render({ nodes: currentNodes, edges: currentEdges, stats: currentStats || {} as QueryStats, hints: currentHints, sql: currentSql, columnLineage: currentColumnLineage, tableUsage: currentTableUsage });
    }
}

// ============================================================
// FEATURE: Hover Tooltips
// ============================================================

function showTooltip(node: FlowNode, e: MouseEvent): void {
    if (!tooltipElement) return;

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
                    color: #e2e8f0;
                    line-height: 1.4;
                    white-space: pre-wrap;
                    word-break: break-all;
                    max-width: 300px;
                ">
                    ${escapeHtml(displayFragment)}
                </div>
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
            <span style="color: #fbbf24;">${node.windowDetails.functions.length} window function(s)</span>
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
    if (!tooltipElement) return;

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
        { key: 'L', description: 'Toggle legend' },
        { key: 'S', description: 'Toggle SQL preview' },
        { key: 'D', description: 'Compare queries (diff)' },
        { key: 'Esc', description: 'Close panels / Exit fullscreen' },
        { key: 'Enter', description: 'Next search result' }
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
    if (!node) return;

    // Highlight the node
    const group = document.querySelector(`g[data-id="${node.id}"]`);
    if (group) {
        group.classList.add('cursor-highlighted');
        const rect = group.querySelector('.node-rect') as SVGRectElement;
        if (rect) {
            rect.setAttribute('stroke', '#fbbf24');
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

    if (type.includes('LEFT')) return '#3b82f6';      // Blue
    if (type.includes('RIGHT')) return '#f59e0b';     // Amber
    if (type.includes('FULL')) return '#8b5cf6';      // Purple
    if (type.includes('CROSS')) return '#ef4444';     // Red
    if (type.includes('INNER')) return '#22c55e';     // Green

    return '#6366f1'; // Default indigo
}

export function getJoinDescription(joinType: string): string {
    const type = joinType.toUpperCase();

    if (type.includes('LEFT')) return 'Returns all rows from left table, matched rows from right';
    if (type.includes('RIGHT')) return 'Returns all rows from right table, matched rows from left';
    if (type.includes('FULL')) return 'Returns all rows from both tables';
    if (type.includes('CROSS')) return 'Returns Cartesian product of both tables';
    if (type.includes('INNER')) return 'Returns only matching rows from both tables';

    return 'Combines rows from two tables';
}
