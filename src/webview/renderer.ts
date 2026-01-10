import { FlowNode, FlowEdge, getNodeColor, ParseResult, QueryStats, OptimizationHint, ColumnLineage } from './sqlParser';
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
    highlightedColumnSources: []
};

let svg: SVGSVGElement | null = null;
let mainGroup: SVGGElement | null = null;
let detailsPanel: HTMLDivElement | null = null;
let statsPanel: HTMLDivElement | null = null;
let hintsPanel: HTMLDivElement | null = null;
let legendPanel: HTMLDivElement | null = null;
let sqlPreviewPanel: HTMLDivElement | null = null;
let searchBox: HTMLInputElement | null = null;
let currentNodes: FlowNode[] = [];
let currentEdges: FlowEdge[] = [];
let currentStats: QueryStats | null = null;
let currentHints: OptimizationHint[] = [];
let currentSql: string = '';
let currentColumnLineage: ColumnLineage[] = [];

export function initRenderer(container: HTMLElement): void {
    // Create SVG element
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.background = '#0f172a';
    svg.style.cursor = 'grab';

    // Add defs for markers (arrows)
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
    `;
    svg.appendChild(defs);

    // Create main group for pan/zoom
    mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(mainGroup);

    container.appendChild(svg);

    // Create details panel
    detailsPanel = document.createElement('div');
    detailsPanel.className = 'details-panel';
    detailsPanel.style.cssText = `
        position: absolute;
        right: 0;
        top: 0;
        width: 280px;
        height: 100%;
        background: rgba(15, 23, 42, 0.98);
        border-left: 1px solid rgba(148, 163, 184, 0.2);
        padding: 20px;
        box-sizing: border-box;
        overflow-y: auto;
        transform: translateX(100%);
        transition: transform 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 200;
    `;
    container.appendChild(detailsPanel);

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

    // Setup event listeners
    setupEventListeners();
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
        // Ctrl/Cmd + F for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            searchBox?.focus();
        }
        // Escape to close panels
        if (e.key === 'Escape') {
            selectNode(null);
            if (searchBox) {
                searchBox.value = '';
                clearSearch();
            }
        }
        // Enter to go to next search result
        if (e.key === 'Enter' && document.activeElement === searchBox) {
            navigateSearch(1);
        }
    });
}

function updateTransform(): void {
    if (mainGroup) {
        mainGroup.setAttribute('transform', `translate(${state.offsetX}, ${state.offsetY}) scale(${state.scale})`);
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

    if (isContainer) {
        renderContainerNode(node, group);
    } else if (isWindowNode) {
        renderWindowNode(node, group);
    } else {
        renderStandardNode(node, group);
    }

    // Hover effect
    const rect = group.querySelector('.node-rect') as SVGRectElement;
    if (rect) {
        group.addEventListener('mouseenter', () => {
            rect.setAttribute('fill', lightenColor(getNodeColor(node.type), 20));
            highlightConnectedEdges(node.id, true);
        });

        group.addEventListener('mouseleave', () => {
            rect.setAttribute('fill', getNodeColor(node.type));
            if (state.selectedNodeId !== node.id) {
                highlightConnectedEdges(node.id, false);
            }
        });
    }

    // Click to select
    group.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNode(node.id);
    });

    // Double click to zoom to node
    group.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        zoomToNode(node);
    });

    parent.appendChild(group);
}

function renderStandardNode(node: FlowNode, group: SVGGElement): void {
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
    group.appendChild(rect);

    // Icon based on type
    const icon = getNodeIcon(node.type);
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('x', String(node.x + 12));
    iconText.setAttribute('y', String(node.y + 24));
    iconText.setAttribute('fill', 'rgba(255,255,255,0.8)');
    iconText.setAttribute('font-size', '14');
    iconText.textContent = icon;
    group.appendChild(iconText);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(node.x + 32));
    label.setAttribute('y', String(node.y + 26));
    label.setAttribute('fill', 'white');
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
        desc.setAttribute('fill', 'rgba(255,255,255,0.7)');
        desc.setAttribute('font-size', '10');
        desc.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        desc.textContent = truncate(node.description, 20);
        group.appendChild(desc);
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

    parent.appendChild(path);
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

    // Update details panel
    updateDetailsPanel(nodeId);
}

function updateDetailsPanel(nodeId: string | null): void {
    if (!detailsPanel) { return; }

    if (!nodeId) {
        detailsPanel.style.transform = 'translateX(100%)';
        return;
    }

    const node = currentNodes.find(n => n.id === nodeId);
    if (!node) { return; }

    detailsPanel.style.transform = 'translateX(0)';

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

    const complexityColors: Record<string, string> = {
        'Simple': '#22c55e',
        'Moderate': '#eab308',
        'Complex': '#f97316',
        'Very Complex': '#ef4444'
    };

    statsPanel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-weight: 600; color: #f1f5f9;">Query Stats</span>
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
                <div style="color: #f1f5f9; font-weight: 600;">${currentStats.tables}</div>
                <div style="font-size: 10px;">Tables</div>
            </div>
            <div style="text-align: center;">
                <div style="color: #f1f5f9; font-weight: 600;">${currentStats.joins}</div>
                <div style="font-size: 10px;">Joins</div>
            </div>
            <div style="text-align: center;">
                <div style="color: #f1f5f9; font-weight: 600;">${currentStats.conditions}</div>
                <div style="font-size: 10px;">Filters</div>
            </div>
            <div style="text-align: center;">
                <div style="color: #f1f5f9; font-weight: 600;">${currentStats.complexityScore}</div>
                <div style="font-size: 10px;">Score</div>
            </div>
        </div>
        ${currentStats.ctes > 0 || currentStats.subqueries > 0 || currentStats.windowFunctions > 0 ? `
            <div style="display: flex; gap: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(148, 163, 184, 0.2);">
                ${currentStats.ctes > 0 ? `<span>CTEs: ${currentStats.ctes}</span>` : ''}
                ${currentStats.subqueries > 0 ? `<span>Subqueries: ${currentStats.subqueries}</span>` : ''}
                ${currentStats.windowFunctions > 0 ? `<span>Window: ${currentStats.windowFunctions}</span>` : ''}
            </div>
        ` : ''}
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
        window: '▦'
    };
    return icons[type] || '○';
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

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
        columnLineage: currentColumnLineage
    };
    render(result);
}

export function getFormattedSql(): string {
    return formatSql(currentSql);
}
