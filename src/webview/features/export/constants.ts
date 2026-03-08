export const MAX_EXPORT_DIMENSION = 4096;
export const MAX_RASTER_DIMENSION = 4096;
export const EXPORT_SVG_PADDING = 40;

export const EXPORT_INLINE_STYLE_PROPERTIES = [
    'fill',
    'stroke',
    'stroke-width',
    'opacity',
    'font-family',
    'font-size',
    'font-weight',
    'text-anchor',
] as const;

export const EXPORT_BASE_SVG_STYLE = `
        text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .node { opacity: 1 !important; }
        .edge { opacity: 1 !important; fill: none !important; stroke-width: 2 !important; }
        path.edge { fill: none !important; stroke-width: 2 !important; opacity: 1 !important; }
        .node-rect { stroke-width: 1 !important; }
        .node-accent { opacity: 1 !important; }
    `;
