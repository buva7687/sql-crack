// Color utility functions for the renderer

export const WARNING_ICONS: Record<string, string> = {
    'unused': '⚠',
    'dead-column': '⊗',
    'expensive': '⚠',
    'fan-out': '📊',
    'repeated-scan': '🔄',
    'complex': '🧮',
    'filter-pushdown': '⬆',
    'non-sargable': '🚫',
    'join-order': '⇄',
    'index-suggestion': '📇'
};

export const WARNING_COLORS: Record<string, string> = {
    'low': '#f59e0b',    // Amber
    'medium': '#f97316', // Orange
    'high': '#ef4444'    // Red
};

export const NODE_TYPE_INFO: Record<string, { color: string; icon: string; description: string }> = {
    table: { color: '#93c5fd', icon: '⊞', description: 'Source table' },
    filter: { color: '#c4b5fd', icon: '⧩', description: 'WHERE/HAVING filter' },
    join: { color: '#f9a8d4', icon: '⋈', description: 'JOIN operation' },
    aggregate: { color: '#fcd34d', icon: 'Σ', description: 'GROUP BY aggregation' },
    sort: { color: '#86efac', icon: '↕', description: 'ORDER BY sorting' },
    limit: { color: '#67e8f9', icon: '⊟', description: 'LIMIT clause' },
    select: { color: '#a5b4fc', icon: '▤', description: 'Column projection' },
    result: { color: '#86efac', icon: '◉', description: 'Query output' },
    cte: { color: '#c4b5fd', icon: '↻', description: 'Common Table Expression' },
    union: { color: '#fdba74', icon: '∪', description: 'Set operation' },
    subquery: { color: '#7dd3fc', icon: '⊂', description: 'Subquery/Derived table' },
    window: { color: '#f0abfc', icon: '▦', description: 'Window function' },
    case: { color: '#fde047', icon: '?:', description: 'CASE expression' }
};

export function getWarningIcon(warningType: string): string {
    return WARNING_ICONS[warningType] || '⚠';
}

export function getWarningColor(severity: string): string {
    return WARNING_COLORS[severity] || '#f59e0b';
}

export function lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

export function darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

export function getNodeIcon(type: string): string {
    const icons: Record<string, string> = {
        table: '⊞',
        filter: '⧩',
        join: '⋈',
        aggregate: 'Σ',
        sort: '↕',
        limit: '⊟',
        select: '▤',
        result: '◉',
        cte: '↻',
        union: '∪',
        subquery: '⊂',
        window: '▦',
        case: '⎇'
    };
    return icons[type] || '○';
}
