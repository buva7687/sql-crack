// Edge Renderer — Edge rendering, path calculation, highlighting
// Extracted from renderer.ts for modularity

import { FlowEdge, FlowNode, LayoutType } from '../types';
import { EDGE_COLORS, EDGE_DASH_PATTERNS, CONDITION_COLORS, getEdgeDashPattern } from '../constants/colors';
import { EDGE_THEME, MONO_FONT_STACK } from '../../shared/themeTokens';
import { Z_INDEX } from '../../shared/zIndex';
import { escapeHtml } from '../../shared/stringUtils';
import { ICONS } from '../../shared/icons';
import { showSqlClausePanelContent } from '../panels/sqlPanels';
import {
    calculateEdgePath as calculateEdgePathPure,
    contrastTextForBadge,
} from './computations';

// ============================================================
// Edge Path Calculation  (delegates to pure computations module)
// ============================================================

/**
 * Calculate edge SVG path between two nodes based on layout type.
 */
export function calculateEdgePath(sourceNode: FlowNode, targetNode: FlowNode, layoutType: LayoutType): string {
    return calculateEdgePathPure(sourceNode, targetNode, layoutType);
}

// ============================================================
// Edge Rendering
// ============================================================

export interface RenderEdgeOptions {
    isDark: boolean;
    nodeMap: Map<string, FlowNode>;
    allNodes: FlowNode[];
    layoutType: LayoutType;
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

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', calculateEdgePath(sourceNode, targetNode, options.layoutType));
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
    isDark: boolean,
    edgeElementsById?: Map<string, SVGPathElement>,
    edgeIdsByNodeId?: Map<string, Set<string>>
): void {
    const theme = isDark ? EDGE_THEME.dark : EDGE_THEME.light;
    const applyDefaultState = (edge: Element): void => {
        edge.setAttribute('stroke', theme.default);
        edge.setAttribute('stroke-width', String(theme.strokeWidth));
        edge.setAttribute('marker-end', 'url(#arrowhead)');
        const clauseType = edge.getAttribute('data-clause-type') || undefined;
        const dashPattern = clauseType === 'subquery_flow'
            ? EDGE_DASH_PATTERNS.subquery_flow
            : getEdgeDashPattern(clauseType);
        if (dashPattern) {
            edge.setAttribute('stroke-dasharray', dashPattern);
        } else {
            edge.removeAttribute('stroke-dasharray');
        }
    };

    const cachedEdgeIds = edgeIdsByNodeId?.get(nodeId);
    const edges = cachedEdgeIds
        ? Array.from(cachedEdgeIds, (edgeId) => edgeElementsById?.get(edgeId)).filter((edge): edge is SVGPathElement => Boolean(edge))
        : Array.from(mainGroup?.querySelectorAll('.edge') || []);

    edges.forEach(edge => {
        if (!cachedEdgeIds) {
            const source = edge.getAttribute('data-source');
            const target = edge.getAttribute('data-target');
            if (source !== nodeId && target !== nodeId) {
                return;
            }
        }

        if (highlight) {
            edge.setAttribute('stroke', EDGE_COLORS.highlight);
            edge.setAttribute('stroke-width', '3');
            edge.setAttribute('marker-end', 'url(#arrowhead-highlight)');
            return;
        }

        applyDefaultState(edge);
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
export function showSqlClausePanel(edge: FlowEdge, containerElement: HTMLElement | null, isDarkTheme = true): void {
    showSqlClausePanelContent({
        edge,
        containerElement,
        isDarkTheme,
        zIndex: Z_INDEX.dropdown,
        pinIcon: ICONS.pin,
        escapeHtml,
        getClauseTypeColor,
        monoFontStack: MONO_FONT_STACK,
    });
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
