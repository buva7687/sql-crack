// Color constants for SQL visualization
// Centralized color definitions to ensure consistency across the application

import { NodeType, Severity } from '../types';

// ============================================================
// UI Colors - General interface elements
// ============================================================

export const UI_COLORS = {
    // Backgrounds - Dark theme
    background: '#111111',
    backgroundDark: '#1a1a1a',       // Neutral dark for clouds/subflows
    backgroundPanel: 'rgba(17, 17, 17, 0.95)',
    backgroundPanelSolid: 'rgba(17, 17, 17, 0.98)',
    backgroundSubtle: 'rgba(26, 26, 26, 0.5)',
    backgroundSubtleDark: 'rgba(26, 26, 26, 0.6)',
    backgroundOverlay: 'rgba(0, 0, 0, 0.2)',

    // Backgrounds - Light theme
    backgroundLight: '#fafafa',
    backgroundLightGray: '#ffffff',
    backgroundPanelLight: 'rgba(255, 255, 255, 0.95)',
    backgroundPanelLightSolid: 'rgba(255, 255, 255, 0.98)',

    // Borders
    border: 'rgba(255, 255, 255, 0.08)',
    borderMedium: 'rgba(255, 255, 255, 0.12)',
    borderLight: 'rgba(255, 255, 255, 0.05)',
    borderWhite: 'rgba(255, 255, 255, 0.3)',
    borderWhiteLight: 'rgba(255, 255, 255, 0.2)',

    // Text colors - Dark theme
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    textSubtle: '#cbd5e1',
    textBright: '#e2e8f0',

    // Text colors - Light theme
    textLight: '#1e293b',
    textLightMuted: '#64748b',
    textLightDim: '#94a3b8',
    textLightSubtle: '#334155',

    // Focus/Selection
    focusBorder: 'rgba(99, 102, 241, 0.7)',
    focusBackground: 'rgba(99, 102, 241, 0.1)',
    focusBackgroundHover: 'rgba(99, 102, 241, 0.2)',
    focusBackgroundActive: 'rgba(99, 102, 241, 0.3)',
    focusText: '#a5b4fc',
    focusTextLight: '#6366f1',
    nodeFocusRingDark: '#fbbf24',
    nodeFocusRingLight: '#4f46e5',

    // Shadows
    shadow: 'rgba(0, 0, 0, 0.3)',
    shadowDark: 'rgba(0, 0, 0, 0.4)',
    shadowLight: '0 4px 12px rgba(0, 0, 0, 0.3)',
    shadowMedium: '0 8px 32px rgba(0, 0, 0, 0.4)',

    // Grid pattern
    gridBackground: '#fafafa',
    gridLine: '#e5e7eb',

    // White variants for node content
    white: '#ffffff',
    whiteMuted: 'rgba(255, 255, 255, 0.8)',
    whiteDim: 'rgba(255, 255, 255, 0.7)',
    whiteFaint: 'rgba(255, 255, 255, 0.6)',
    whiteSubtle: 'rgba(255, 255, 255, 0.4)',
    whiteBright: 'rgba(255, 255, 255, 0.9)',
} as const;

// ============================================================
// Edge/Arrow Colors
// ============================================================

export const EDGE_COLORS = {
    default: '#333333',
    defaultLight: '#cbd5e1',
    highlight: '#fbbf24',
    selected: '#10b981',
    columnFlow: 'rgba(255, 255, 255, 0.4)',
    columnLineage: '#22d3ee', // Cyan for column lineage path
    focus: '#6366f1',         // Indigo for focus mode highlights
    hover: '#6366f1',         // Indigo for edge hover
} as const;

// ============================================================
// Badge Colors - Access mode and operation badges
// ============================================================

export const BADGE_COLORS = {
    // Access modes
    read: '#3b82f6',       // Blue
    write: '#ef4444',      // Red
    derived: '#a855f7',    // Purple
    derivedAlt: '#14b8a6', // Teal
    cte: '#a855f7',        // Purple

    // DML operations
    insert: '#10b981',     // Green
    update: '#f59e0b',     // Amber
    delete: '#dc2626',     // Dark Red
    merge: '#8b5cf6',      // Violet
    createTableAs: '#06b6d4', // Cyan

    // Syntax highlighting badges
    partitionBy: '#6366f1', // Indigo
    orderBy: '#10b981',     // Green
    frame: '#f59e0b',       // Amber

    // Function names
    functionName: '#fbbf24', // Amber/Gold
} as const;

// ============================================================
// Condition Type Colors - For filter/join conditions
// ============================================================

export const CONDITION_COLORS: Record<string, string> = {
    join: '#3b82f6',    // Blue
    where: '#8b5cf6',   // Purple
    having: '#ec4899',  // Pink
    on: '#06b6d4',      // Cyan
    filter: '#f59e0b',  // Amber
    default: '#64748b', // Gray
};

// ============================================================
// Node Stroke Colors - For different node states
// ============================================================

export const NODE_STROKE_COLORS = {
    write: 'rgba(239, 68, 68, 0.9)',    // Red
    read: 'rgba(59, 130, 246, 0.8)',    // Blue
    cte: 'rgba(168, 85, 247, 0.8)',     // Purple
    derived: 'rgba(168, 85, 247, 0.7)', // Purple (lighter)
    default: 'rgba(255, 255, 255, 0.3)', // White
} as const;

// ============================================================
// Glow Colors - For complexity indicators
// ============================================================

export const GLOW_COLORS = {
    high: 'rgba(239, 68, 68, 0.4)',    // Red glow for high complexity
    medium: 'rgba(245, 158, 11, 0.4)', // Orange glow for medium complexity
} as const;

// ============================================================
// Status Colors - For success/error states
// ============================================================

export const STATUS_COLORS = {
    error: '#f87171',
    errorDark: '#ef4444',
    success: '#34d399',
    successDark: '#10b981',
    successLight: '#4ade80',
    info: '#60a5fa',
    infoDark: '#2563eb',
    warningLight: '#fbbf24',
    warningDark: '#d97706',
    violetLight: '#a78bfa',
    violetDark: '#7c3aed',
} as const;

// ============================================================
// Close Button Colors
// ============================================================

export const CLOSE_BUTTON_COLORS = {
    background: 'rgba(239, 68, 68, 0.6)',
    backgroundHover: 'rgba(239, 68, 68, 0.9)',
    border: 'rgba(255, 255, 255, 0.3)',
} as const;

export const SCROLLBAR_COLORS = {
    dark: {
        thumb: 'rgba(148, 163, 184, 0.42)',
        thumbHover: 'rgba(148, 163, 184, 0.58)',
        track: 'rgba(15, 23, 42, 0.35)',
    },
    light: {
        thumb: 'rgba(100, 116, 139, 0.32)',
        thumbHover: 'rgba(71, 85, 105, 0.42)',
        track: 'rgba(148, 163, 184, 0.12)',
    },
} as const;

export const COMPONENT_UI_COLORS = {
    dark: {
        surface: 'rgba(15, 23, 42, 0.95)',
        surfaceElevated: 'rgba(15, 23, 42, 0.98)',
        border: 'rgba(148, 163, 184, 0.2)',
        text: '#f1f5f9',
        textBright: '#e2e8f0',
        textMuted: '#94a3b8',
        textDim: '#64748b',
        hover: 'rgba(148, 163, 184, 0.1)',
        hoverStrong: 'rgba(148, 163, 184, 0.2)',
        accent: '#818cf8',
        accentSoft: '#a5b4fc',
        accentBg: 'rgba(99, 102, 241, 0.15)',
        accentBgSoft: 'rgba(99, 102, 241, 0.12)',
        accentBgStrong: 'rgba(99, 102, 241, 0.3)',
        subtleBg: 'rgba(255, 255, 255, 0.06)',
        subtleBgAlt: 'rgba(255, 255, 255, 0.04)',
        overlayBg: 'rgba(0, 0, 0, 0.7)',
        modalBg: 'rgba(17, 17, 17, 0.98)',
        modalBorder: 'rgba(255, 255, 255, 0.08)',
        rowBorder: 'rgba(148, 163, 184, 0.1)',
        selectBg: '#1e293b',
        shadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        shadowSoft: '0 4px 12px rgba(15, 23, 42, 0.12)',
        errorBg: 'rgba(239, 68, 68, 0.15)',
        errorBgHover: 'rgba(239, 68, 68, 0.25)',
        warningBg: 'rgba(234, 179, 8, 0.3)',
    },
    light: {
        surface: 'rgba(255, 255, 255, 0.95)',
        surfaceElevated: 'rgba(255, 255, 255, 0.98)',
        border: 'rgba(148, 163, 184, 0.3)',
        text: '#1e293b',
        textBright: '#1e293b',
        textMuted: '#64748b',
        textDim: '#94a3b8',
        hover: 'rgba(0, 0, 0, 0.04)',
        hoverStrong: 'rgba(15, 23, 42, 0.06)',
        accent: '#6366f1',
        accentSoft: '#6366f1',
        accentBg: 'rgba(99, 102, 241, 0.1)',
        accentBgSoft: 'rgba(99, 102, 241, 0.08)',
        accentBgStrong: 'rgba(99, 102, 241, 0.15)',
        subtleBg: 'rgba(0, 0, 0, 0.06)',
        subtleBgAlt: 'rgba(0, 0, 0, 0.03)',
        overlayBg: 'rgba(0, 0, 0, 0.4)',
        modalBg: 'rgba(255, 255, 255, 0.98)',
        modalBorder: 'rgba(0, 0, 0, 0.1)',
        rowBorder: 'rgba(0, 0, 0, 0.06)',
        selectBg: '#f1f5f9',
        shadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
        shadowSoft: '0 4px 12px rgba(15, 23, 42, 0.12)',
        errorBg: 'rgba(220, 38, 38, 0.1)',
        errorBgHover: 'rgba(220, 38, 38, 0.16)',
        warningBg: 'rgba(234, 179, 8, 0.2)',
    },
} as const;

export const NODE_COLORS: Record<NodeType, string> = {
    table: '#93c5fd',      // light blue (blue-300)
    filter: '#c4b5fd',     // light purple (purple-300)
    join: '#f9a8d4',       // light pink (pink-300)
    aggregate: '#fcd34d',  // light amber (amber-300)
    sort: '#86efac',       // light green (green-300)
    limit: '#67e8f9',      // light cyan (cyan-300)
    select: '#a5b4fc',     // light indigo (indigo-300)
    result: '#86efac',     // light green (green-300)
    cte: '#c4b5fd',        // light purple (purple-300)
    union: '#fdba74',      // light orange (orange-300)
    subquery: '#7dd3fc',   // light teal (sky-300)
    window: '#f0abfc',     // light fuchsia (fuchsia-300)
    case: '#fde047',       // light yellow (yellow-300)
    cluster: '#64748b',    // slate (cluster nodes)
};

export const WARNING_COLORS: Record<Severity, string> = {
    low: '#f59e0b',     // Amber
    medium: '#f97316',  // Orange
    high: '#ef4444',    // Red
};

export const HINT_COLORS = {
    error: { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', icon: '⚠' },
    warning: { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', icon: '⚡' },
    info: { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', icon: 'ℹ' },
} as const;

export const COMPLEXITY_COLORS: Record<string, string> = {
    'Simple': '#22c55e',
    'Moderate': '#eab308',
    'Complex': '#f97316',
    'Very Complex': '#ef4444',
};

// ============================================================
// Transformation Colors - For column lineage transformations
// ============================================================

export const TRANSFORMATION_COLORS: Record<string, string> = {
    source: '#10b981',      // Emerald - source column
    passthrough: '#64748b', // Slate - passed through unchanged
    renamed: '#3b82f6',     // Blue - renamed column
    aggregated: '#f59e0b',  // Amber - aggregated value
    calculated: '#8b5cf6',  // Violet - calculated/derived
    joined: '#ec4899',      // Pink - from join
    default: '#64748b',     // Slate - fallback
};

export function getTransformationColor(type: string): string {
    return TRANSFORMATION_COLORS[type] || TRANSFORMATION_COLORS.default;
}

// Re-export accent colors from shared tokens for convenience
export { NODE_ACCENT_COLORS, getNodeAccentColor } from '../../shared/themeTokens';

/** Node surface colors — neutral fill for accent-strip design */
export const NODE_SURFACE = {
    light: {
        fill: '#FFFFFF',
        border: '#E2E8F0',
        text: '#1E293B',
        textMuted: '#64748B',
    },
    dark: {
        fill: '#1A1A1A',
        border: '#2A2A2A',
        text: '#F1F5F9',
        textMuted: '#94A3B8',
    },
} as const;

export function getNodeColor(type: NodeType): string {
    return NODE_COLORS[type] || '#6366f1';
}

export function getWarningColor(severity: Severity): string {
    return WARNING_COLORS[severity] || WARNING_COLORS.low;
}

export function getScrollbarColors(isDarkTheme: boolean): { thumb: string; thumbHover: string; track: string } {
    return isDarkTheme ? SCROLLBAR_COLORS.dark : SCROLLBAR_COLORS.light;
}

export function getComponentUiColors(
    isDarkTheme: boolean
): {
    surface: string;
    surfaceElevated: string;
    border: string;
    text: string;
    textBright: string;
    textMuted: string;
    textDim: string;
    hover: string;
    hoverStrong: string;
    accent: string;
    accentSoft: string;
    accentBg: string;
    accentBgSoft: string;
    accentBgStrong: string;
    subtleBg: string;
    subtleBgAlt: string;
    overlayBg: string;
    modalBg: string;
    modalBorder: string;
    rowBorder: string;
    selectBg: string;
    shadow: string;
    shadowSoft: string;
    errorBg: string;
    errorBgHover: string;
    warningBg: string;
} {
    return isDarkTheme ? COMPONENT_UI_COLORS.dark : COMPONENT_UI_COLORS.light;
}
