// Color constants for SQL visualization

import { NodeType, Severity } from '../types';

export const NODE_COLORS: Record<NodeType, string> = {
    table: '#3b82f6',      // blue
    filter: '#8b5cf6',     // purple
    join: '#ec4899',       // pink
    aggregate: '#f59e0b',  // amber
    sort: '#10b981',       // green
    limit: '#06b6d4',      // cyan
    select: '#6366f1',     // indigo
    result: '#22c55e',     // green
    cte: '#a855f7',        // purple
    union: '#f97316',      // orange
    subquery: '#14b8a6',   // teal
    window: '#d946ef',     // fuchsia
    case: '#eab308',       // yellow
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
