import { FlowNode, FlowEdge, getNodeColor, ParseResult, QueryStats, OptimizationHint } from './sqlParser';

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
    currentSearchIndex: -1
};

let svg: SVGSVGElement | null = null;
let mainGroup: SVGGElement | null = null;
let detailsPanel: HTMLDivElement | null = null;
let statsPanel: HTMLDivElement | null = null;
let hintsPanel: HTMLDivElement | null = null;
let searchBox: HTMLInputElement | null = null;
let currentNodes: FlowNode[] = [];
let currentEdges: FlowEdge[] = [];
let currentStats: QueryStats | null = null;
let currentHints: OptimizationHint[] = [];

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

    // Setup event listeners
    setupEventListeners();
}

function setupEventListeners(): void {
    if (!svg) {return;}

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
    if (!mainGroup) {return;}

    currentNodes = result.nodes;
    currentEdges = result.edges;
    currentStats = result.stats;
    currentHints = result.hints;

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

    // Hover effect
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

function renderEdge(edge: FlowEdge, parent: SVGGElement): void {
    const sourceNode = currentNodes.find(n => n.id === edge.source);
    const targetNode = currentNodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) {return;}

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
    if (!mainGroup) {return;}

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
    if (!detailsPanel) {return;}

    if (!nodeId) {
        detailsPanel.style.transform = 'translateX(100%)';
        return;
    }

    const node = currentNodes.find(n => n.id === nodeId);
    if (!node) {return;}

    detailsPanel.style.transform = 'translateX(0)';
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
        ${node.details && node.details.length > 0 ? `
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
        ` : ''}
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
    if (!statsPanel || !currentStats) {return;}

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
    if (!hintsPanel) {return;}

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
    if (!svg || currentNodes.length === 0) {return;}

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
    if (!svg) {return;}

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

    if (!term) {return;}

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
    if (state.searchResults.length === 0) {return;}

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
    if (!svg) {return;}

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
    if (!ctx) {return;}

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
    if (!svg) {return;}

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
    if (!svg) {return;}

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
    if (!ctx) {return;}

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
    if (str.length <= maxLen) {return str;}
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
