import { FlowNode, FlowEdge, getNodeColor, ParseResult } from './sqlParser';

interface ViewState {
    scale: number;
    offsetX: number;
    offsetY: number;
    selectedNodeId: string | null;
    isDragging: boolean;
    dragStartX: number;
    dragStartY: number;
}

const state: ViewState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    selectedNodeId: null,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0
};

let svg: SVGSVGElement | null = null;
let mainGroup: SVGGElement | null = null;
let detailsPanel: HTMLDivElement | null = null;
let currentNodes: FlowNode[] = [];
let currentEdges: FlowEdge[] = [];

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
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
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
    `;
    container.appendChild(detailsPanel);

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

    // Clear previous content
    mainGroup.innerHTML = '';

    if (result.error) {
        renderError(result.error);
        return;
    }

    if (result.nodes.length === 0) {
        renderError('No visualization data');
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

    // Fit view
    fitView();
}

function renderNode(node: FlowNode, parent: SVGGElement): void {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'node');
    group.setAttribute('data-id', node.id);
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
    });

    group.addEventListener('mouseleave', () => {
        rect.setAttribute('fill', getNodeColor(node.type));
    });

    // Click to select
    group.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNode(node.id);
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

    parent.appendChild(path);
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
        const rect = g.querySelector('rect');
        const id = g.getAttribute('data-id');
        if (rect) {
            if (id === nodeId) {
                rect.setAttribute('stroke', '#fff');
                rect.setAttribute('stroke-width', '3');
            } else {
                rect.removeAttribute('stroke');
                rect.removeAttribute('stroke-width');
            }
        }
    });

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

function fitView(): void {
    if (!svg || currentNodes.length === 0) {return;}

    const rect = svg.getBoundingClientRect();
    const padding = 60;

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

    // Account for details panel width
    const availableWidth = rect.width - 300;
    const availableHeight = rect.height;

    // Calculate scale to fit
    const scaleX = (availableWidth - padding * 2) / graphWidth;
    const scaleY = (availableHeight - padding * 2) / graphHeight;
    state.scale = Math.min(scaleX, scaleY, 1.5);

    // Center the graph
    state.offsetX = (availableWidth - graphWidth * state.scale) / 2 - minX * state.scale;
    state.offsetY = (availableHeight - graphHeight * state.scale) / 2 - minY * state.scale;

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

export function exportToPng(): void {
    if (!svg) {return;}

    // Create a canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {return;}

    // Set size
    canvas.width = 1920;
    canvas.height = 1080;

    // Draw background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Serialize SVG
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();

    img.onload = () => {
        ctx.drawImage(img, 0, 0);

        // Download
        const a = document.createElement('a');
        a.download = `sql-visualization-${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
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
        subquery: '⊂'
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
