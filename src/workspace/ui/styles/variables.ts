/**
 * CSS Variables - Design tokens shared across all views
 * 
 * Supports both dark and light themes, with high-contrast overrides.
 * These variables provide consistent theming across all workspace webviews.
 */

/**
 * Generate CSS custom properties for the specified theme
 * 
 * @param dark - Whether to use dark theme (default: true)
 * @param isHighContrast - Whether to apply high-contrast overrides (default: false)
 * @returns CSS string with :root variable definitions
 */
export function getCssVariables(dark: boolean = true, isHighContrast: boolean = false): string {
    let result: string;
    if (dark) {
        result = getDarkThemeVariables();
    } else {
        result = getLightThemeVariables();
    }

    if (isHighContrast) {
        return result + getHighContrastOverrides(dark);
    }
    return result;
}

/**
 * Dark theme CSS variables
 */
function getDarkThemeVariables(): string {
    return `
        :root {
            --bg-primary: #111111;
            --bg-secondary: #1a1a1a;
            --bg-tertiary: #222222;
            --bg-hover: #2a2a2a;
            --border-color: rgba(255, 255, 255, 0.12);
            --border-subtle: rgba(255, 255, 255, 0.08);
            --text-primary: #f1f5f9;
            --text-secondary: #e2e8f0;
            --text-muted: #71717a;
            --text-dim: #64748b;
            --text-on-accent: #ffffff;
            --accent: #6366f1;
            --accent-hover: #818cf8;
            --success: #10b981;
            --success-light: #34d399;
            --warning: #f59e0b;
            --warning-light: #fbbf24;
            --error: #ef4444;
            --error-light: #f87171;
            --node-file: #60a5fa;
            --node-file-border: #3b82f6;
            --node-table: #34d399;
            --node-table-border: #10b981;
            --node-view: #a78bfa;
            --node-view-border: #8b5cf6;
            --node-external: #94a3b8;
            --node-external-border: #64748b;
            --node-fill: #1a1a1a;
            --node-border: #2a2a2a;
            --node-text: #f1f5f9;
            --grid-color: rgba(255, 255, 255, 0.06);
            --canvas-bg: #111111;
            --bg-overlay: rgba(17, 17, 17, 0.9);
            --node-cte: #c084fc;
            --edge-default: #333333;
            --edge-hover: #6366f1;
            --edge-select: #94a3b8;
            --edge-join: #c4b5fd;
            --edge-insert: #34d399;
            --edge-update: #fcd34d;
            --edge-delete: #fca5a5;
            --edge-subquery: #a78bfa;
            --column-edge-upstream: #22c55e;
            --column-edge-downstream: #3b82f6;
            --lineage-coltype-numeric: #60a5fa;
            --lineage-coltype-text: #4ade80;
            --lineage-coltype-datetime: #c084fc;
            --lineage-coltype-boolean: #fb923c;
            --lineage-coltype-binary: #f87171;
            --lineage-coltype-json: #2dd4bf;
            --lineage-row-odd-bg: rgba(148, 163, 184, 0.08);
            --lineage-row-even-bg: rgba(248, 250, 252, 0.03);
            --lineage-row-hover-bg: rgba(99, 102, 241, 0.16);
            --lineage-row-focus-bg: rgba(99, 102, 241, 0.24);
            --lineage-minimap-viewport-fill: rgba(99, 102, 241, 0.15);
            --lineage-close-btn-bg: rgba(239, 68, 68, 0.6);
            --lineage-close-btn-bg-hover: rgba(239, 68, 68, 0.9);
            --lineage-close-btn-icon: #ffffff;
            --shadow-node: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
            --radius-sm: 4px;
            --radius-md: 6px;
            --radius-lg: 8px;
            --radius-xl: 12px;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
            --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
            --shadow-lg: 0 10px 40px rgba(0,0,0,0.5);
            --overlay-scrim: rgba(17, 17, 17, 0.7);
            --scrollbar-thumb: rgba(148, 163, 184, 0.42);
            --scrollbar-thumb-hover: rgba(148, 163, 184, 0.58);
            --scrollbar-track: rgba(0, 0, 0, 0.35);
            --font-mono: 'SF Mono', Monaco, 'Cascadia Code', Menlo, Consolas, monospace;
        }
    `;
}

/**
 * Light theme CSS variables
 */
function getLightThemeVariables(): string {
    return `
        :root {
            --bg-primary: #fafafa;
            --bg-secondary: #ffffff;
            --bg-tertiary: #f1f5f9;
            --bg-hover: #e2e8f0;
            --border-color: rgba(0, 0, 0, 0.12);
            --border-subtle: rgba(0, 0, 0, 0.08);
            --text-primary: #0f172a;
            --text-secondary: #1e293b;
            --text-muted: #64748b;
            --text-dim: #94a3b8;
            --text-on-accent: #ffffff;
            --accent: #4f46e5;
            --accent-hover: #6366f1;
            --success: #059669;
            --success-light: #10b981;
            --warning: #d97706;
            --warning-light: #f59e0b;
            --error: #dc2626;
            --error-light: #ef4444;
            --node-file: #3b82f6;
            --node-file-border: #2563eb;
            --node-table: #10b981;
            --node-table-border: #059669;
            --node-view: #8b5cf6;
            --node-view-border: #7c3aed;
            --node-external: #64748b;
            --node-external-border: #475569;
            --node-fill: #ffffff;
            --node-border: #e2e8f0;
            --node-text: #1e293b;
            --grid-color: rgba(0, 0, 0, 0.06);
            --canvas-bg: #fafafa;
            --bg-overlay: rgba(255, 255, 255, 0.9);
            --node-cte: #a855f7;
            --edge-default: #cbd5e1;
            --edge-hover: #6366f1;
            --edge-select: #64748b;
            --edge-join: #a78bfa;
            --edge-insert: #10b981;
            --edge-update: #fbbf24;
            --edge-delete: #f87171;
            --edge-subquery: #8b5cf6;
            --column-edge-upstream: #16a34a;
            --column-edge-downstream: #2563eb;
            --lineage-coltype-numeric: #3b82f6;
            --lineage-coltype-text: #16a34a;
            --lineage-coltype-datetime: #9333ea;
            --lineage-coltype-boolean: #ea580c;
            --lineage-coltype-binary: #dc2626;
            --lineage-coltype-json: #0d9488;
            --lineage-row-odd-bg: rgba(100, 116, 139, 0.08);
            --lineage-row-even-bg: rgba(148, 163, 184, 0.05);
            --lineage-row-hover-bg: rgba(79, 70, 229, 0.12);
            --lineage-row-focus-bg: rgba(79, 70, 229, 0.2);
            --lineage-minimap-viewport-fill: rgba(79, 70, 229, 0.15);
            --lineage-close-btn-bg: rgba(220, 38, 38, 0.55);
            --lineage-close-btn-bg-hover: rgba(220, 38, 38, 0.78);
            --lineage-close-btn-icon: #ffffff;
            --shadow-node: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
            --radius-sm: 4px;
            --radius-md: 6px;
            --radius-lg: 8px;
            --radius-xl: 12px;
            --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
            --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
            --shadow-lg: 0 10px 40px rgba(0,0,0,0.15);
            --overlay-scrim: rgba(250, 250, 250, 0.85);
            --scrollbar-thumb: rgba(100, 116, 139, 0.32);
            --scrollbar-thumb-hover: rgba(71, 85, 105, 0.42);
            --scrollbar-track: rgba(148, 163, 184, 0.12);
            --font-mono: 'SF Mono', Monaco, 'Cascadia Code', Menlo, Consolas, monospace;
        }
    `;
}

/**
 * High-contrast mode overrides
 */
function getHighContrastOverrides(dark: boolean): string {
    return `
        :root {
            --border-color: ${dark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)'};
            --border-subtle: ${dark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)'};
        }
        * { border-width: 2px; }
        .node { stroke-width: 2px; }
        .edge { stroke-width: 2px; }
        text, .node-label, .info-title { font-weight: 600; }
    `;
}
