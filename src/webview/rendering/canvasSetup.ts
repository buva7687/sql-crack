// Canvas Setup — SVG defs, grid patterns, background, markers
// Extracted from renderer.ts for modularity

import { CANVAS, GRID_CONFIG, EDGE_THEME } from '../../shared/themeTokens';
import type { GridStyle } from '../../shared/themeTokens';
import { EDGE_COLORS } from '../constants/colors';

export interface CanvasElements {
    svg: SVGSVGElement;
    mainGroup: SVGGElement;
    backgroundRect: SVGRectElement;
}

/**
 * Build the innerHTML for SVG <defs> (markers, filters, grid patterns)
 */
function buildDefsHTML(isDark: boolean, gridStyle: GridStyle): string {
    const edgeColor = isDark ? EDGE_THEME.dark.default : EDGE_THEME.light.default;

    // Grid pattern markup
    let gridPatternHTML = '';
    if (gridStyle === 'dots') {
        const dotFill = isDark ? GRID_CONFIG.dots.darkFill : GRID_CONFIG.dots.lightFill;
        gridPatternHTML = `
        <pattern id="grid-pattern" x="0" y="0" width="${GRID_CONFIG.cellSize}" height="${GRID_CONFIG.cellSize}" patternUnits="userSpaceOnUse">
            <rect width="${GRID_CONFIG.cellSize}" height="${GRID_CONFIG.cellSize}" fill="transparent"/>
            <circle cx="${GRID_CONFIG.cellSize / 2}" cy="${GRID_CONFIG.cellSize / 2}" r="${GRID_CONFIG.dots.radius}" fill="${dotFill}"/>
        </pattern>`;
    } else if (gridStyle === 'lines') {
        const lineStroke = isDark ? GRID_CONFIG.lines.darkStroke : GRID_CONFIG.lines.lightStroke;
        gridPatternHTML = `
        <pattern id="grid-pattern" x="0" y="0" width="${GRID_CONFIG.cellSize}" height="${GRID_CONFIG.cellSize}" patternUnits="userSpaceOnUse">
            <rect width="${GRID_CONFIG.cellSize}" height="${GRID_CONFIG.cellSize}" fill="transparent"/>
            <path d="M ${GRID_CONFIG.cellSize} 0 L 0 0 0 ${GRID_CONFIG.cellSize}" fill="none" stroke="${lineStroke}" stroke-width="${GRID_CONFIG.lines.strokeWidth}"/>
        </pattern>`;
    }

    return `
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="${edgeColor}" />
        </marker>
        <marker id="arrowhead-highlight" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="${EDGE_COLORS.highlight}" />
        </marker>
        <marker id="arrowhead-hover" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="${EDGE_THEME.dark.hover}" />
        </marker>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="${isDark ? '0.3' : '0.08'}"/>
        </filter>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
        ${gridPatternHTML}
    `;
}

/**
 * Initialize the SVG canvas with defs, background, and main group.
 */
export function initCanvas(
    container: HTMLElement,
    isDark: boolean,
    gridStyle: GridStyle
): CanvasElements {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('tabindex', '-1');
    svg.style.background = isDark ? CANVAS.dark.background : CANVAS.light.background;
    svg.style.cursor = 'grab';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.zIndex = '1';
    svg.style.outline = 'none';

    // Defs
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = buildDefsHTML(isDark, gridStyle);
    svg.appendChild(defs);

    // Background rect
    const backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    backgroundRect.setAttribute('width', '100%');
    backgroundRect.setAttribute('height', '100%');
    applyBackgroundFill(backgroundRect, isDark, gridStyle);
    backgroundRect.style.pointerEvents = 'none';
    svg.appendChild(backgroundRect);

    // Main group for pan/zoom transforms
    const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(mainGroup);

    container.appendChild(svg);

    return { svg, mainGroup, backgroundRect };
}

/**
 * Update canvas theme (background, grid pattern, markers) without recreating SVG.
 */
export function updateCanvasTheme(
    svg: SVGSVGElement,
    backgroundRect: SVGRectElement,
    isDark: boolean,
    gridStyle: GridStyle
): void {
    svg.style.background = isDark ? CANVAS.dark.background : CANVAS.light.background;

    // Rebuild defs
    const defs = svg.querySelector('defs');
    if (defs) {
        defs.innerHTML = buildDefsHTML(isDark, gridStyle);
    }

    applyBackgroundFill(backgroundRect, isDark, gridStyle);
}

/**
 * Apply the correct fill to the background rect based on theme and grid style.
 */
function applyBackgroundFill(
    backgroundRect: SVGRectElement,
    isDark: boolean,
    gridStyle: GridStyle
): void {
    if (gridStyle === 'none') {
        backgroundRect.setAttribute('fill', isDark ? CANVAS.dark.background : CANVAS.light.background);
    } else {
        // Use the grid pattern for both themes when a grid style is set
        backgroundRect.setAttribute('fill', 'url(#grid-pattern)');
    }
}
