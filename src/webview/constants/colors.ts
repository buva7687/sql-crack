// Color constants for SQL visualization

import { NodeType, Severity } from '../types';

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

export function getNodeColor(type: NodeType): string {
    return NODE_COLORS[type] || '#6366f1';
}

export function getWarningColor(severity: Severity): string {
    return WARNING_COLORS[severity] || WARNING_COLORS.low;
}
