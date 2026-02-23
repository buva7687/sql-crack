export interface KeyboardShortcut {
    key: string;
    description: string;
}

export function getKeyboardShortcutsFeature(): KeyboardShortcut[] {
    return [
        { key: 'Ctrl/Cmd + Shift + P', description: 'Command palette' },
        { key: 'Ctrl/Cmd + F', description: 'Search nodes' },
        { key: 'Ctrl/Cmd + Z', description: 'Undo layout change' },
        { key: 'Ctrl/Cmd + Shift + Z', description: 'Redo layout change' },
        { key: '/', description: 'Focus search' },
        { key: '+/-', description: 'Zoom in/out' },
        { key: 'R', description: 'Reset view' },
        { key: 'F', description: 'Toggle fullscreen' },
        { key: 'T', description: 'Toggle theme' },
        { key: 'H', description: 'Cycle layouts' },
        { key: '1-5', description: 'Quick layout switch (V/H/C/F/R)' },
        { key: 'S', description: 'Toggle SQL preview' },
        { key: 'C', description: 'Toggle column lineage' },
        { key: 'L', description: 'Toggle legend' },
        { key: 'Q', description: 'Toggle query stats' },
        { key: 'O', description: 'Toggle optimization hints' },
        { key: 'U', description: 'Focus upstream nodes' },
        { key: 'D', description: 'Focus downstream nodes' },
        { key: 'A', description: 'Focus all connected nodes' },
        { key: 'E', description: 'Expand/collapse all CTEs & subqueries' },
        { key: 'Esc', description: 'Close panels / Exit fullscreen' },
        { key: 'Enter', description: 'Next search result' },
        { key: '↑', description: 'Navigate to upstream node' },
        { key: '↓', description: 'Navigate to downstream node' },
        { key: '←/→', description: 'Cycle sibling nodes at same depth' },
        { key: '[', description: 'Previous query (Q2 → Q1)' },
        { key: ']', description: 'Next query (Q2 → Q3)' },
        { key: '?', description: 'Show all shortcuts' },
    ];
}

export function getJoinVennDiagramFeature(joinType: string, isDark: boolean = true): string {
    const type = joinType.toUpperCase();
    const strokeColor = isDark ? '#94a3b8' : '#475569';

    const diagrams: Record<string, string> = {
        'INNER JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
                <path d="M12 3.5 A6 6 0 0 1 12 12.5 A6 6 0 0 1 12 3.5" fill="#6366f1" opacity="0.7"/>
            </svg>`,
        'LEFT JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="#2563eb" opacity="0.6" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'LEFT OUTER JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="#2563eb" opacity="0.6" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'RIGHT JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="#d97706" opacity="0.6" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'RIGHT OUTER JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="none" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="#d97706" opacity="0.6" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'FULL JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="#7c3aed" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="#7c3aed" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'FULL OUTER JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <circle cx="8" cy="8" r="6" fill="#7c3aed" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
                <circle cx="16" cy="8" r="6" fill="#7c3aed" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
            </svg>`,
        'CROSS JOIN': `
            <svg width="24" height="16" viewBox="0 0 24 16">
                <rect x="2" y="2" width="8" height="12" fill="#dc2626" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
                <rect x="14" y="2" width="8" height="12" fill="#dc2626" opacity="0.5" stroke="${strokeColor}" stroke-width="1"/>
                <line x1="10" y1="8" x2="14" y2="8" stroke="${strokeColor}" stroke-width="1" stroke-dasharray="2"/>
            </svg>`,
    };

    for (const [key, svg] of Object.entries(diagrams)) {
        if (type.includes(key.replace(' JOIN', '')) || type === key) {
            return svg;
        }
    }

    return diagrams['INNER JOIN'];
}

export function getJoinColorFeature(joinType: string): string {
    const type = joinType.toUpperCase();

    if (type.includes('LEFT')) { return '#3b82f6'; }
    if (type.includes('RIGHT')) { return '#f59e0b'; }
    if (type.includes('FULL')) { return '#8b5cf6'; }
    if (type.includes('CROSS')) { return '#ef4444'; }
    if (type.includes('INNER')) { return '#22c55e'; }

    return '#6366f1';
}

export function getJoinDescriptionFeature(joinType: string): string {
    const type = joinType.toUpperCase();

    if (type.includes('LEFT')) { return 'Returns all rows from left table, matched rows from right'; }
    if (type.includes('RIGHT')) { return 'Returns all rows from right table, matched rows from left'; }
    if (type.includes('FULL')) { return 'Returns all rows from both tables'; }
    if (type.includes('CROSS')) { return 'Returns Cartesian product of both tables'; }
    if (type.includes('INNER')) { return 'Returns only matching rows from both tables'; }

    return 'Combines rows from two tables';
}
