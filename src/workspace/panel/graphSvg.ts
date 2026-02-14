import { getReferenceTypeColor } from '../../shared';
import { WorkspaceDependencyGraph, WorkspaceNode } from '../types';

export interface RenderWorkspaceGraphSvgOptions {
    graph: WorkspaceDependencyGraph;
    isDarkTheme: boolean;
    escapeHtml: (value: string) => string;
}

export function renderWorkspaceGraphSvg(options: RenderWorkspaceGraphSvgOptions): string {
    const { graph, isDarkTheme, escapeHtml } = options;

    // Calculate bounds (used for export, not for main SVG rendering)
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of graph.nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
    }

    // These dimensions are only used for export, not for the interactive SVG
    const width = Math.max(1200, maxX + 150);
    const height = Math.max(800, maxY + 150);

    // Prevent unused-variable lint while preserving bound computation side effects.
    void minX;
    void minY;
    void width;
    void height;

    // Pre-build node lookup map for O(1) access (avoids O(n) per edge)
    const nodeMap = new Map<string, WorkspaceNode>();
    for (const node of graph.nodes) {
        nodeMap.set(node.id, node);
    }

    const edgesHtml = graph.edges.map(edge => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) {
            return '';
        }

        const x1 = source.x + source.width / 2;
        const y1 = source.y + source.height;
        const x2 = target.x + target.width / 2;
        const y2 = target.y;

        const verticalDistance = y2 - y1;
        const curveIntensity = Math.max(verticalDistance * 0.3, 50);
        const path = `M ${x1} ${y1} C ${x1} ${y1 + curveIntensity}, ${x2} ${y2 - curveIntensity}, ${x2} ${y2}`;

        const edgeColor = getReferenceTypeColor(edge.referenceType, isDarkTheme);
        const edgeId = edge.id || `edge_${edge.source}_${edge.target}`;
        const tooltipContent = `<div class="tooltip-title">${edge.count} reference${edge.count > 1 ? 's' : ''}</div><div class="tooltip-content">Tables: ${edge.tables.map(table => escapeHtml(table)).join(', ')}</div>`;
        const tooltipBase64 = Buffer.from(tooltipContent).toString('base64');

        return `
                <g class="edge edge-${edge.referenceType}" data-edge-id="${escapeHtml(edgeId)}"
                   data-source="${escapeHtml(edge.source)}"
                   data-target="${escapeHtml(edge.target)}"
                   data-reference-type="${edge.referenceType}"
                   data-tooltip="${tooltipBase64}">
                    <path d="${path}"
                          fill="none"
                          stroke="${edgeColor}"
                          stroke-width="2"
                          marker-end="url(#arrowhead-${edge.referenceType})"
                          opacity="0.7"/>
                    ${edge.count > 1 ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2}" class="edge-label" text-anchor="middle" fill="var(--text-muted)" font-size="10">${edge.count}</text>` : ''}
                </g>
            `;
    }).join('');

    const nodesHtml = graph.nodes.map(node => {
        const typeClass = `node-${node.type}`;
        const defInfo = node.definitions ? `${node.definitions.length} definition${node.definitions.length !== 1 ? 's' : ''}` : '';
        const refInfo = node.referenceCount ? `${node.referenceCount} reference${node.referenceCount !== 1 ? 's' : ''}` : '';
        const sublabel = [defInfo, refInfo].filter(Boolean).join(', ');

        const tooltipContent = getNodeTooltipContent(node, escapeHtml);

        return `
                <g class="node ${typeClass}"
                   transform="translate(${node.x}, ${node.y})"
                   data-id="${escapeHtml(node.id)}"
                   data-label="${escapeHtml(node.label)}"
                   data-type="${node.type}"
                   data-filepath="${node.filePath ? escapeHtml(node.filePath) : ''}"
                   data-tooltip="${Buffer.from(tooltipContent).toString('base64')}">
                    <rect class="node-bg" width="${node.width}" height="${node.height}" rx="8" filter="url(#shadow)"/>
                    <rect class="node-accent" x="0" y="0" width="4" height="${node.height}" rx="4" ry="4" clip-path="inset(0 0 0 0 round 8px 0 0 8px)"/>
                    <text x="${node.width / 2}" y="28" class="node-label" text-anchor="middle">${escapeHtml(node.label)}</text>
                    ${sublabel ? `<text x="${node.width / 2}" y="46" class="node-sublabel" text-anchor="middle">${sublabel}</text>` : ''}
                </g>
            `;
    }).join('');

    const edgeTypes = ['select', 'join', 'insert', 'update', 'delete', 'subquery'];
    const arrowMarkers = edgeTypes.map(type => {
        const markerColor = getReferenceTypeColor(type, isDarkTheme);
        return `
                <marker id="arrowhead-${type}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="${markerColor}"/>
                </marker>
            `;
    }).join('');

    return `
            <svg id="graph-svg" style="width: 100%; height: 100%; overflow: visible;" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    ${arrowMarkers}
                    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
                    </filter>
                </defs>
                <g id="main-group">
                    ${edgesHtml}
                    ${nodesHtml}
                </g>
            </svg>
        `;
}

function getNodeTooltipContent(node: WorkspaceNode, escapeHtml: (value: string) => string): string {
    let content = `<div class="tooltip-title">${escapeHtml(node.label)}</div>`;

    if (node.type === 'file' && node.filePath) {
        content += `<div class="tooltip-content">${escapeHtml(node.filePath)}</div>`;
    }

    if (node.definitions && node.definitions.length > 0) {
        content += '<div class="tooltip-content">Defines:</div><ul class="tooltip-list">';
        for (const def of node.definitions.slice(0, 5)) {
            content += `<li>${def.type}: ${escapeHtml(def.name)}</li>`;
        }
        if (node.definitions.length > 5) {
            content += `<li>...and ${node.definitions.length - 5} more</li>`;
        }
        content += '</ul>';
    }

    if (node.references && node.references.length > 0) {
        content += '<div class="tooltip-content" style="margin-top:8px;">References:</div><ul class="tooltip-list">';

        for (const ref of node.references.slice(0, 5)) {
            content += `<li><strong>${escapeHtml(ref.tableName)}</strong> (${ref.referenceType})`;

            if (ref.columns && ref.columns.length > 0) {
                const columnList = ref.columns.slice(0, 8).map(column => column.columnName).join(', ');
                const moreCount = ref.columns.length - 8;
                content += `<br><span style="font-size:9px;color:var(--text-muted);">Columns: ${escapeHtml(columnList)}${moreCount > 0 ? ` +${moreCount} more` : ''}</span>`;
            }

            content += '</li>';
        }

        if (node.references.length > 5) {
            content += `<li>...and ${node.references.length - 5} more tables</li>`;
        }

        content += '</ul>';
    }

    if (node.type === 'external') {
        content += '<div class="tooltip-content" style="color:var(--warning-light);">Not defined in workspace</div>';
    }

    content += '<div class="tooltip-content" style="margin-top:8px;font-size:10px;">Click to open, double-click to visualize</div>';

    return content;
}
