// Centralized Theme Configuration
// Single source of truth for all color definitions across the extension
// Used by both webview (browser) and extension (Node.js) code

import { UI_SURFACE, WORKSPACE_ACCENT_COLORS } from './themeTokens';

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
    ...WORKSPACE_ACCENT_COLORS.light,
    default: WORKSPACE_ACCENT_COLORS.light.external,
} as const;

/** Dark theme accent variants (400-level, brighter) */
export const WORKSPACE_NODE_COLORS_DARK: Record<string, string> = {
    ...WORKSPACE_ACCENT_COLORS.dark,
    default: WORKSPACE_ACCENT_COLORS.dark.external,
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
        background: UI_SURFACE.dark.background,
        backgroundSecondary: UI_SURFACE.dark.backgroundSecondary,
        backgroundPanel: UI_SURFACE.dark.backgroundPanel,
        text: UI_SURFACE.dark.text,
        textMuted: UI_SURFACE.dark.textMuted,
        textDim: '#64748b',
        border: UI_SURFACE.dark.border,
    },
    // Light theme
    light: {
        background: UI_SURFACE.light.background,
        backgroundSecondary: UI_SURFACE.light.backgroundSecondary,
        backgroundPanel: UI_SURFACE.light.backgroundPanel,
        text: UI_SURFACE.light.text,
        textMuted: UI_SURFACE.light.textMuted,
        textDim: '#94a3b8',
        border: UI_SURFACE.light.border,
    },
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

/** Text color to use on each complexity badge background for WCAG AA contrast. */
export const COMPLEXITY_TEXT_COLORS: Record<string, string> = {
    'Simple': 'white',
    'Moderate': '#713f12',   // Dark amber — white on #eab308 is only ~1.85:1; this is >7:1
    'Complex': 'white',
    'Very Complex': 'white',
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
