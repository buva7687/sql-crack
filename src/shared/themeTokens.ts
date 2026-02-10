// Theme Tokens — Single source of truth for all theme colors
// Used by both query flow webview and workspace webview

// ============================================================
// Canvas & Grid
// ============================================================

export const CANVAS = {
    dark: {
        background: '#111111',
        gridColor: 'rgba(255, 255, 255, 0.06)',
    },
    light: {
        background: '#FAFAFA',
        gridColor: 'rgba(0, 0, 0, 0.06)',
    },
} as const;

export type GridStyle = 'dots' | 'lines' | 'none';
export type AccentPosition = 'left' | 'bottom';

export const GRID_CONFIG = {
    cellSize: 20,
    dots: {
        radius: 0.8,
        lightFill: '#D1D5DB',
        darkFill: '#2A2A2A',
    },
    lines: {
        strokeWidth: 0.5,
        lightStroke: '#E5E7EB',
        darkStroke: '#1E1E1E',
    },
} as const;

// ============================================================
// Node Colors — Accent-only (for left strip / bottom bar)
// 500-level for light (saturated), 400-level for dark (brighter)
// ============================================================

export const NODE_ACCENT_COLORS = {
    light: {
        table: '#3B82F6',     // Blue-500
        filter: '#8B5CF6',    // Violet-500
        join: '#EC4899',      // Pink-500
        aggregate: '#F59E0B', // Amber-500
        sort: '#22C55E',      // Green-500
        limit: '#06B6D4',     // Cyan-500
        select: '#6366F1',    // Indigo-500
        result: '#10B981',    // Emerald-500
        cte: '#A855F7',       // Purple-500
        union: '#F97316',     // Orange-500
        subquery: '#0EA5E9',  // Sky-500
        window: '#D946EF',    // Fuchsia-500
        case: '#EAB308',      // Yellow-500
        cluster: '#64748B',   // Slate-500
    },
    dark: {
        table: '#60A5FA',     // Blue-400
        filter: '#A78BFA',    // Violet-400
        join: '#F472B6',      // Pink-400
        aggregate: '#FBBF24', // Amber-400
        sort: '#4ADE80',      // Green-400
        limit: '#22D3EE',     // Cyan-400
        select: '#818CF8',    // Indigo-400
        result: '#34D399',    // Emerald-400
        cte: '#C084FC',       // Purple-400
        union: '#FB923C',     // Orange-400
        subquery: '#38BDF8',  // Sky-400
        window: '#E879F9',    // Fuchsia-400
        case: '#FACC15',      // Yellow-400
        cluster: '#94A3B8',   // Slate-400
    },
} as const;

export type NodeAccentType = keyof typeof NODE_ACCENT_COLORS.light;

/**
 * Get the accent color for a node type based on theme
 */
export function getNodeAccentColor(type: string, isDark: boolean): string {
    const palette = isDark ? NODE_ACCENT_COLORS.dark : NODE_ACCENT_COLORS.light;
    return (palette as Record<string, string>)[type] || palette.select;
}

// ============================================================
// Node Surface Colors — Neutral fill for both themes
// ============================================================

export const NODE_SURFACE = {
    light: {
        fill: '#FFFFFF',
        border: '#94A3B8',
        text: '#1E293B',
        textMuted: '#64748B',
        shadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
    },
    dark: {
        fill: '#1A1A1A',
        border: '#475569',
        text: '#F1F5F9',
        textMuted: '#94A3B8',
        shadow: '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
    },
} as const;

// ============================================================
// Edge Colors
// ============================================================

export const EDGE_THEME = {
    light: {
        default: '#CBD5E1',
        hover: '#6366F1',
        strokeWidth: 1.5,
        hoverStrokeWidth: 2,
    },
    dark: {
        default: '#333333',
        hover: '#6366F1',
        strokeWidth: 1.5,
        hoverStrokeWidth: 2,
    },
} as const;

// ============================================================
// UI Surface Colors (panels, toolbar, etc.)
// ============================================================

export const UI_SURFACE = {
    dark: {
        background: '#111111',
        backgroundSecondary: '#1A1A1A',
        backgroundPanel: 'rgba(17, 17, 17, 0.95)',
        backgroundOverlay: 'rgba(17, 17, 17, 0.9)',
        text: '#F1F5F9',
        textMuted: '#94A3B8',
        textDim: '#64748B',
        border: 'rgba(255, 255, 255, 0.08)',
        borderMedium: 'rgba(255, 255, 255, 0.12)',
    },
    light: {
        background: '#FAFAFA',
        backgroundSecondary: '#FFFFFF',
        backgroundPanel: 'rgba(255, 255, 255, 0.95)',
        backgroundOverlay: 'rgba(255, 255, 255, 0.9)',
        text: '#1E293B',
        textMuted: '#64748B',
        textDim: '#94A3B8',
        border: 'rgba(0, 0, 0, 0.08)',
        borderMedium: 'rgba(0, 0, 0, 0.12)',
    },
} as const;

// ============================================================
// Accent Strip Config
// ============================================================

export const ACCENT_STRIP = {
    left: {
        width: 3,
        borderRadius: '6px 0 0 6px',
    },
    bottom: {
        height: 3,
        borderRadius: '0 0 6px 6px',
    },
} as const;

// ============================================================
// Workspace Node Colors (accent-only for dependency graphs)
// ============================================================

export const WORKSPACE_ACCENT_COLORS = {
    light: {
        file: '#3B82F6',     // Blue-500
        table: '#10B981',    // Emerald-500
        view: '#8B5CF6',     // Violet-500
        external: '#64748B', // Slate-500
    },
    dark: {
        file: '#60A5FA',     // Blue-400
        table: '#34D399',    // Emerald-400
        view: '#A78BFA',     // Violet-400
        external: '#94A3B8', // Slate-400
    },
} as const;
