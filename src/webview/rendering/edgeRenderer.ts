// Edge Renderer — Edge rendering, path calculation, highlighting
// Extracted from renderer.ts for modularity

import { FlowEdge, FlowNode, LayoutType } from '../types';
import { EDGE_COLORS, EDGE_DASH_PATTERNS, UI_COLORS, CONDITION_COLORS, getEdgeDashPattern } from '../constants/colors';
import { EDGE_THEME, MONO_FONT_STACK } from '../../shared/themeTokens';
import { Z_INDEX } from '../../shared/zIndex';
import { escapeHtml } from '../../shared/stringUtils';

/**
 * Return a legible text color for a badge given its background color.
 * Parses hex or rgb() backgrounds and applies the W3C relative luminance formula.
 */
function contrastTextForBadge(bg: string): string {
    let r = 0, g = 0, b = 0;
    if (bg.startsWith('#')) {
        const hex = bg.replace('#', '');
        const full = hex.length === 3
            ? hex.split('').map(c => c + c).join('')
            : hex;
        r = parseInt(full.substring(0, 2), 16);
        g = parseInt(full.substring(2, 4), 16);
        b = parseInt(full.substring(4, 6), 16);
    } else {
        const m = bg.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    }
    // Perceived brightness (YIQ)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 160 ? '#1e293b' : '#ffffff';
}

// ============================================================
// Edge Path Calculation
// ============================================================

/**
 * Calculate edge SVG path between two nodes based on layout type.
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
        // Vertical/compact
        const sx = sourceNode.x + sourceNode.width / 2;
        const sy = sourceNode.y + sourceNode.height;
        const tx = targetNode.x + targetNode.width / 2;
        const ty = targetNode.y;
        const midY = (sy + ty) / 2;
        return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
    }
}

// ============================================================
// Edge Rendering
// ============================================================

export interface RenderEdgeOptions {
    isDark: boolean;
    nodeMap: Map<string, FlowNode>;
    allNodes: FlowNode[];
    onEdgeClick?: (edge: FlowEdge) => void;
}

/**
 * Render a single edge with new neutral theme styling.
 * Default: light neutral stroke. Hover: indigo highlight.
 */
export function renderEdge(edge: FlowEdge, parent: SVGGElement, options: RenderEdgeOptions): void {
    const sourceNode = options.nodeMap.get(edge.source) || options.allNodes.find(n => n.id === edge.source);
    const targetNode = options.nodeMap.get(edge.target) || options.allNodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) { return; }

    // Use theme-aware edge colors
    const theme = options.isDark ? EDGE_THEME.dark : EDGE_THEME.light;
    const defaultStroke = theme.default;
    const defaultWidth = theme.strokeWidth;

    const x1 = sourceNode.x + sourceNode.width / 2;
    const y1 = sourceNode.y + sourceNode.height;
    const x2 = targetNode.x + targetNode.width / 2;
    const y2 = targetNode.y;

    const midY = (y1 + y2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', defaultStroke);
    path.setAttribute('stroke-width', String(defaultWidth));
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

    // SQ edges always get dashed pattern regardless of colorblind mode
    const dashPattern = edge.clauseType === 'subquery_flow'
        ? EDGE_DASH_PATTERNS.subquery_flow
        : getEdgeDashPattern(edge.clauseType);
    if (dashPattern) {
        path.setAttribute('stroke-dasharray', dashPattern);
    }

    path.style.cursor = 'pointer';
    path.style.transition = 'stroke 0.15s, stroke-width 0.15s';

    // Click handler
    path.addEventListener('click', (e) => {
        e.stopPropagation();
        if (options.onEdgeClick) {
            options.onEdgeClick(edge);
        }
    });

    // Hover: indigo highlight
    path.addEventListener('mouseenter', () => {
        if (!path.getAttribute('data-highlighted')) {
            path.setAttribute('stroke', theme.hover);
            path.setAttribute('stroke-width', String(theme.hoverStrokeWidth));
            path.setAttribute('marker-end', 'url(#arrowhead-hover)');
        }
    });

    path.addEventListener('mouseleave', () => {
        if (!path.getAttribute('data-highlighted')) {
            path.setAttribute('stroke', defaultStroke);
            path.setAttribute('stroke-width', String(defaultWidth));
            path.setAttribute('marker-end', 'url(#arrowhead)');
            if (dashPattern) {
                path.setAttribute('stroke-dasharray', dashPattern);
            } else {
                path.removeAttribute('stroke-dasharray');
            }
        }
    });

    parent.appendChild(path);
}

// ============================================================
// Edge Highlighting
// ============================================================

/**
 * Highlight or dim all edges connected to a node.
 */
export function highlightConnectedEdges(
    nodeId: string,
    highlight: boolean,
    mainGroup: SVGGElement | null,
    isDark: boolean
): void {
    const theme = isDark ? EDGE_THEME.dark : EDGE_THEME.light;
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
                edge.setAttribute('stroke', theme.default);
                edge.setAttribute('stroke-width', String(theme.strokeWidth));
                edge.setAttribute('marker-end', 'url(#arrowhead)');
            }
        }
    });
}

// ============================================================
// SQL Clause Panel
// ============================================================

function getClauseTypeColor(clauseType: string): string {
    return CONDITION_COLORS[clauseType] || CONDITION_COLORS.default;
}

/**
 * Show a panel with SQL clause details for a clicked edge.
 */
export function showSqlClausePanel(edge: FlowEdge, containerElement: HTMLElement | null): void {
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
            z-index: ${Z_INDEX.dropdown};
            box-shadow: ${UI_COLORS.shadowMedium};
            font-family: ${MONO_FONT_STACK};
        `;
        containerElement?.appendChild(clausePanel);
    }

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
        " class="clause-panel-close-btn">&#x2715;</button>
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
                ${escapeHtml(edge.label || 'Data Flow')}
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

// ============================================================
// Transformation Badges (for column lineage)
// ============================================================

/**
 * Create a transformation badge SVG group.
 */
export function createTransformationBadge(
    x: number,
    y: number,
    label: string,
    color: string,
    _icon: string
): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'lineage-badge');

    const textWidth = label.length * 6.5 + 12;
    const height = 18;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x - textWidth / 2));
    rect.setAttribute('y', String(y - height / 2));
    rect.setAttribute('width', String(textWidth));
    rect.setAttribute('height', String(height));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', color);
    g.appendChild(rect);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y + 5));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', contrastTextForBadge(color));
    text.setAttribute('font-size', '9');
    text.setAttribute('font-weight', '700');
    text.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    text.textContent = label;
    g.appendChild(text);

    return g;
}

/**
 * Clear all lineage badges from the SVG.
 */
export function clearLineageBadges(mainGroup: SVGGElement | null): void {
    const badges = mainGroup?.querySelectorAll('.lineage-badge');
    badges?.forEach(badge => badge.remove());
}
