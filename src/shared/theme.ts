// Centralized Theme Configuration
// Single source of truth for all color definitions across the extension
// Used by both webview (browser) and extension (Node.js) code

// ============================================================
// Reference Type Colors - Used in dependency graphs
// ============================================================

export type ColorblindMode = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';

/**
 * Colors for different SQL reference types in dependency graphs
 * These indicate the relationship type between database objects
 */
export const REFERENCE_TYPE_COLORS: Record<string, string> = {
    select: '#64748b',   // Slate - read operations
    join: '#a78bfa',     // Violet - join relationships  
    insert: '#10b981',   // Emerald - insert operations
    update: '#fbbf24',   // Amber - update operations
    delete: '#f87171',   // Red - delete operations
    subquery: '#8b5cf6', // Purple - subquery references
    default: '#64748b',  // Slate - fallback
} as const;

// ============================================================
// Node Type Colors - Used for different node types in graphs
// ============================================================

/**
 * Colors for different node types in workspace dependency graphs
 */
export const WORKSPACE_NODE_COLORS: Record<string, string> = {
    file: '#3b82f6',     // Blue - SQL files
    table: '#10b981',    // Emerald - tables
    view: '#8b5cf6',     // Purple - views
    external: '#64748b', // Slate - external references
    default: '#64748b',  // Slate - fallback
} as const;

/** Dark theme accent variants (400-level, brighter) */
export const WORKSPACE_NODE_COLORS_DARK: Record<string, string> = {
    file: '#60a5fa',     // Blue-400
    table: '#34d399',    // Emerald-400
    view: '#a78bfa',     // Violet-400
    external: '#94a3b8', // Slate-400
    default: '#94a3b8',  // Slate-400
} as const;

/**
 * Colorblind-safe workspace palettes keyed by mode.
 * Uses high-contrast variants inspired by Wong/IBM safe palettes.
 */
export const COLORBLIND_WORKSPACE_NODE_COLORS: Record<Exclude<ColorblindMode, 'off'>, Record<string, string>> = {
    deuteranopia: {
        file: '#0072B2',
        table: '#009E73',
        view: '#CC79A7',
        external: '#7F7F7F',
        default: '#7F7F7F',
    },
    protanopia: {
        file: '#0072B2',
        table: '#009E73',
        view: '#CC79A7',
        external: '#7F7F7F',
        default: '#7F7F7F',
    },
    tritanopia: {
        file: '#2F6BFF',
        table: '#00A86B',
        view: '#C23B75',
        external: '#6B7280',
        default: '#6B7280',
    },
} as const;

// ============================================================
// UI Colors - Common interface colors
// ============================================================

export const UI_THEME = {
    // Dark theme
    dark: {
        background: '#111111',
        backgroundSecondary: '#1a1a1a',
        backgroundPanel: 'rgba(17, 17, 17, 0.95)',
        text: '#f1f5f9',
        textMuted: '#94a3b8',
        textDim: '#64748b',
        border: 'rgba(255, 255, 255, 0.08)',
    },
    // Light theme
    light: {
        background: '#fafafa',
        backgroundSecondary: '#ffffff',
        backgroundPanel: 'rgba(255, 255, 255, 0.95)',
        text: '#1e293b',
        textMuted: '#64748b',
        textDim: '#94a3b8',
        border: 'rgba(0, 0, 0, 0.08)',
    },
} as const;

// ============================================================
// Status Colors - For error/warning/success states
// ============================================================

export const STATUS_COLORS = {
    error: '#f87171',
    errorDark: '#ef4444',
    warning: '#fbbf24',
    warningDark: '#f59e0b',
    success: '#34d399',
    successDark: '#10b981',
    info: '#60a5fa',
    infoDark: '#3b82f6',
} as const;

// ============================================================
// Complexity Colors - For query complexity indicators
// ============================================================

export const COMPLEXITY_COLORS: Record<string, string> = {
    'Simple': '#22c55e',      // Green
    'Moderate': '#eab308',    // Yellow
    'Complex': '#f97316',     // Orange
    'Very Complex': '#ef4444', // Red
} as const;

// ============================================================
// Helper Functions
// ============================================================

/** Dark theme reference type variants (400-level, brighter for dark backgrounds) */
export const REFERENCE_TYPE_COLORS_DARK: Record<string, string> = {
    select: '#94a3b8',   // Slate-400
    join: '#c4b5fd',     // Violet-300
    insert: '#34d399',   // Emerald-400
    update: '#fcd34d',   // Amber-300
    delete: '#fca5a5',   // Red-300
    subquery: '#a78bfa', // Purple-400
    default: '#94a3b8',  // Slate-400
} as const;

/**
 * Get color for a reference type, theme-aware
 */
export function getReferenceTypeColor(type: string, isDark?: boolean): string {
    if (isDark) {
        return REFERENCE_TYPE_COLORS_DARK[type] || REFERENCE_TYPE_COLORS_DARK.default;
    }
    return REFERENCE_TYPE_COLORS[type] || REFERENCE_TYPE_COLORS.default;
}

/**
 * Get color for a workspace node type, theme-aware
 */
export function getWorkspaceNodeColor(type: string, isDark?: boolean): string {
    if (isDark) {
        return WORKSPACE_NODE_COLORS_DARK[type] || WORKSPACE_NODE_COLORS_DARK.default;
    }
    return WORKSPACE_NODE_COLORS[type] || WORKSPACE_NODE_COLORS.default;
}
