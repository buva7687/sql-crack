// Shared Styles - Centralized CSS for all workspace webviews
// Extracted from workspacePanel.ts for modularity

/**
 * CSS Variables - Design tokens shared across all views
 * Supports both dark and light themes
 */
export function getCssVariables(dark: boolean = true): string {
    if (dark) {
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
                --text-muted: #94a3b8;
                --text-dim: #64748b;
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
                --scrollbar-track: rgba(15, 23, 42, 0.35);
            }
        `;
    } else {
        // Light theme
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
            }
        `;
    }
}

/**
 * Base styles - Reset and body styles
 */
export function getBaseStyles(): string {
    return `
        /* ========== Base Styles ========== */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html {
            width: 100%; height: 100vh; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary); color: var(--text-secondary);
            font-size: 13px;
        }
        #app { width: 100%; height: 100%; display: flex; flex-direction: column; }
        * {
            scrollbar-width: thin;
            scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
        }
        *::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }
        *::-webkit-scrollbar-track {
            background: var(--scrollbar-track);
            border-radius: 8px;
        }
        *::-webkit-scrollbar-thumb {
            background: var(--scrollbar-thumb);
            border-radius: 8px;
            border: 2px solid transparent;
            background-clip: padding-box;
        }
        *::-webkit-scrollbar-thumb:hover {
            background: var(--scrollbar-thumb-hover);
            background-clip: padding-box;
        }

        /* ========== Header ========== */
        .header {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            padding: 12px 16px; background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
            position: relative;
            height: 48px; /* Fixed height to prevent vertical shift */
            box-sizing: border-box;
        }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .header-icon { font-size: 18px; display: inline-flex; align-items: center; justify-content: center; }
        .header-icon svg { width: 18px; height: 18px; display: block; }
        .header-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
        /* Header center: Contains view tabs and graph mode switcher.
         * Absolutely positioned and centered to keep tabs in fixed position.
         * Graph mode switcher uses visibility (not display) to always reserve space,
         * preventing tabs from shifting when switching between Graph and other tabs. */
        .header-center {
            position: absolute; left: 50%; transform: translateX(-50%);
            display: flex; align-items: center; gap: 12px;
            height: 100%; /* Match header height */
        }
        .header-right { display: flex; align-items: center; gap: 8px; }

        /* ========== Icon Button ========== */
        .icon-btn {
            display: flex; align-items: center; justify-content: center;
            width: 32px; height: 32px; background: var(--bg-tertiary);
            border: none; border-radius: var(--radius-md); color: var(--text-secondary);
            cursor: pointer; transition: all 0.15s;
        }
        .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .icon-btn.active { background: var(--accent); color: white; }
        .icon-btn svg { width: 16px; height: 16px; }

        /* ========== Search Box ========== */
        .search-box {
            display: flex; align-items: center; gap: 8px;
            background: var(--bg-primary); padding: 6px 12px;
            border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);
            transition: all 0.2s;
        }
        .search-box:focus-within { border-color: var(--accent); }
        .search-box svg { flex-shrink: 0; }
        .search-input {
            background: transparent; border: none; color: var(--text-secondary);
            font-size: 13px; width: 160px; outline: none;
        }
        .search-input::placeholder { color: var(--text-dim); }
        .search-input:focus { width: 200px; }
        .search-select {
            background: var(--bg-secondary); border: 1px solid var(--border-subtle);
            color: var(--text-secondary); font-size: 12px; padding: 4px 8px;
            border-radius: var(--radius-sm); outline: none; cursor: pointer;
        }
        .search-select:hover { border-color: var(--border-color); }
        .search-clear {
            background: transparent; border: none; color: var(--text-dim);
            cursor: pointer; padding: 4px; display: none; border-radius: var(--radius-sm);
        }
        .search-clear:hover { color: var(--error-light); background: rgba(239, 68, 68, 0.1); }
        .search-clear.visible { display: flex; }

        /* ========== View Mode Tabs ========== */
        .view-tabs {
            display: flex; align-items: center; gap: 2px;
            background: var(--bg-primary); padding: 3px; border-radius: var(--radius-lg);
        }
        .view-tab {
            padding: 6px 12px; border: none; background: transparent;
            color: var(--text-muted); font-size: 12px; font-weight: 500;
            border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s;
            white-space: nowrap;
        }
        .view-tab:hover { color: var(--text-secondary); background: var(--bg-tertiary); }
        .view-tab.active {
            background: var(--accent); color: white;
        }
        .view-tab svg { width: 14px; height: 14px; margin-right: 4px; vertical-align: middle; }

        /* ========== Graph Mode Switcher ========== */
        /* Segmented control for switching between Files/Tables/Hybrid graph modes */
        .graph-mode-switcher {
            display: flex; align-items: center; gap: 2px;
            background: var(--bg-primary); padding: 3px; border-radius: var(--radius-lg);
            flex-shrink: 0;
        }
        /* Graph mode switcher always in layout (uses visibility, not display).
         * When hidden, visibility: hidden + pointer-events: none keeps it in layout
         * but invisible/unclickable. This prevents main tabs from shifting position. */
        .graph-mode-btn {
            padding: 4px 10px; border: none; background: transparent;
            color: var(--text-muted); font-size: 11px; font-weight: 500;
            border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s;
        }
        .graph-mode-btn:hover { color: var(--text-secondary); background: var(--bg-tertiary); }
        .graph-mode-btn.active { background: var(--accent); color: white; }
        .graph-mode-help {
            display: inline-flex; align-items: center; justify-content: center;
            width: 18px; height: 18px; margin-left: 4px;
            border-radius: 50%; background: var(--bg-tertiary);
            color: var(--text-muted); font-size: 11px; font-weight: 600;
            cursor: pointer; border: 1px solid var(--border-subtle);
            position: relative;
        }
        .graph-mode-help:hover { color: var(--text-primary); border-color: var(--border-color); }
        .graph-mode-help:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
        .graph-mode-help-tooltip {
            display: none;
            position: fixed;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            padding: 12px;
            width: 240px;
            box-shadow: var(--shadow-lg);
            z-index: 1000;
            text-align: left;
        }
        .graph-mode-help-tooltip.visible { display: block; }
        .help-tooltip-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .help-tooltip-item {
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 4px;
            line-height: 1.4;
        }
        .help-tooltip-item:last-child { margin-bottom: 0; }
        .help-tooltip-item strong { color: var(--text-primary); }

        /* ========== Loading States ========== */
        .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            gap: 16px;
        }
        .loading-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--border-subtle);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .loading-text {
            color: var(--text-muted);
            font-size: 13px;
        }
        .skeleton {
            background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%);
            background-size: 200% 100%;
            animation: skeleton-shimmer 1.5s infinite;
            border-radius: var(--radius-md);
        }
        @keyframes skeleton-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
        .skeleton-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 16px;
            margin-bottom: 12px;
        }
        .skeleton-line {
            height: 12px;
            margin-bottom: 8px;
        }
        .skeleton-line:last-child { margin-bottom: 0; }
        .skeleton-line.short { width: 40%; }
        .skeleton-line.medium { width: 70%; }
        .skeleton-line.long { width: 90%; }
        .skeleton-circle {
            width: 40px;
            height: 40px;
            border-radius: 50%;
        }
        .skeleton-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }

        /* ========== Reduced Motion ========== */
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
            .lineage-edge,
            .lineage-edge.highlighted,
            .column-lineage-edge {
                stroke-dasharray: none !important;
                animation: none !important;
            }
            .lineage-panel,
            .lineage-legend,
            .lineage-tooltip,
            .column-lineage-info {
                transition: none !important;
            }
        }

        /* High Contrast Mode */
        @media (prefers-contrast: more) {
            :root {
                --border-color: rgba(255, 255, 255, 0.4);
                --border-subtle: rgba(255, 255, 255, 0.25);
            }
            .node .node-bg {
                stroke-width: 2 !important;
            }
            .lineage-node .node-bg {
                stroke-width: 2 !important;
            }
            .node .node-accent,
            .lineage-node .node-accent {
                width: 6px !important;
            }
            .edge, .edge path, .lineage-edge, .column-lineage-edge {
                stroke-width: 2 !important;
            }
            .node-label, .lineage-node .node-name {
                font-weight: 700 !important;
            }
            .lineage-tooltip,
            .lineage-legend,
            .column-lineage-info,
            .workspace-breadcrumb {
                border-width: 2px !important;
            }
        }
    `;
}

/**
 * Context menu styles
 */
export function getContextMenuStyles(): string {
    return `
        /* ========== Context Menu ========== */
        .context-menu {
            position: fixed; z-index: 1000;
            background: var(--bg-secondary); border: 1px solid var(--border-color);
            border-radius: var(--radius-md); padding: 4px 0;
            min-width: 180px; box-shadow: var(--shadow-lg);
            display: none;
        }
        .context-menu.visible { display: block; }
        .context-menu-item {
            display: flex; align-items: center; gap: 10px;
            padding: 8px 14px; cursor: pointer; font-size: 12px;
            color: var(--text-secondary); transition: all 0.1s;
        }
        .context-menu-item:hover {
            background: var(--accent); color: white;
        }
        .context-menu-item svg { width: 14px; height: 14px; flex-shrink: 0; }
        .context-menu-divider {
            height: 1px; background: var(--border-subtle); margin: 4px 0;
        }
        .context-menu-item.disabled {
            opacity: 0.5; pointer-events: none;
        }
    `;
}

/**
 * Lineage panel styles
 */
export function getLineagePanelStyles(): string {
    return `
        /* ========== Lineage Panel ========== */
        .lineage-panel {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--bg-primary);
            overflow: hidden;
            padding: 20px;
            padding-bottom: 0;
            display: none;
            z-index: 50;
            flex-direction: column;
        }
        .graph-area-container {
            position: relative;
            flex: 1;
            overflow: hidden;
            min-height: 0; /* Important for flex children to shrink */
        }
        .graph-area {
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
            min-height: 0; /* Important for flex children to shrink */
            background-color: var(--canvas-bg);
            background-image:
                radial-gradient(circle, var(--grid-color) 1px, transparent 1px),
                linear-gradient(to right, color-mix(in srgb, var(--grid-color) 35%, transparent) 1px, transparent 1px),
                linear-gradient(to bottom, color-mix(in srgb, var(--grid-color) 35%, transparent) 1px, transparent 1px);
            background-size: 24px 24px, 24px 24px, 24px 24px;
            background-position: 0 0, 0 0, 0 0;
        }
        .lineage-panel.visible { display: flex; }
        .lineage-panel h2 { color: var(--text-primary); margin-bottom: 16px; font-size: 18px; }
        .lineage-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-height: 0; /* Important for flex children to shrink */
        }
        /* Constrain width only for search/overview view, not graph view */
        .lineage-content > .lineage-visual-container { max-width: 1200px; margin: 0 auto; }
        .sidebar.collapsed ~ .lineage-panel { right: 0; }

        /* Lineage panel header with back button */
        .lineage-header {
            display: flex; align-items: center; gap: 16px; margin-bottom: 20px;
            padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle);
            flex-shrink: 0;
        }
        .workspace-breadcrumb {
            font-size: 12px;
            color: var(--text-muted);
            margin: -8px 0 12px;
            padding: 6px 10px;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            background: color-mix(in srgb, var(--accent) 8%, var(--bg-secondary));
            overflow-x: auto;
            white-space: nowrap;
        }
        .workspace-breadcrumb-segment {
            border: none;
            background: transparent;
            color: inherit;
            font: inherit;
            padding: 0;
            margin: 0;
            cursor: default;
        }
        .workspace-breadcrumb-segment.is-clickable {
            cursor: pointer;
            color: var(--text-secondary);
        }
        .workspace-breadcrumb-segment.is-clickable:hover {
            color: var(--text-primary);
            text-decoration: underline;
            text-underline-offset: 2px;
        }
        .workspace-breadcrumb-separator {
            color: var(--text-dim);
            margin: 0 6px;
        }
        .lineage-back-btn {
            display: flex; align-items: center; gap: 6px; padding: 8px 12px;
            background: var(--bg-tertiary); border: none; border-radius: var(--radius-md);
            color: var(--text-secondary); cursor: pointer; font-size: 13px;
        }
        .lineage-back-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .lineage-back-btn svg { width: 16px; height: 16px; }

        /* Lineage node cards */
        .lineage-node-card {
            background: var(--bg-secondary); padding: 12px 16px; border-radius: var(--radius-md);
            margin-bottom: 8px; cursor: pointer; transition: all 0.15s;
            border: 1px solid var(--border-subtle);
        }
        .lineage-node-card:hover { background: var(--bg-tertiary); border-color: var(--accent); }
        .lineage-node-card .node-name { font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
        .lineage-node-card .node-meta { font-size: 11px; color: var(--text-muted); }

        /* Empty state */
        .lineage-empty {
            text-align: center; padding: 60px 20px; color: var(--text-muted);
        }
        .lineage-empty svg { width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5; }
    `;
}

/**
 * Shared view container styles - consistent template for all tab views
 */
export function getSharedViewStyles(): string {
    return `
        /* ========== Shared View Container ========== */
        .view-container {
            width: 100%;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px 24px 24px;
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow-y: auto;
            gap: 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-top-width: 3px;
            border-radius: var(--radius-lg);
        }
        .view-container.view-lineage {
            border-top-color: var(--node-view-border);
        }
        .view-container.view-tables {
            border-top-color: var(--node-table-border);
        }
        .view-container.view-impact {
            border-top-color: var(--warning);
        }
        .view-compact-header {
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 40px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .view-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            color: var(--text-secondary);
        }
        .view-icon svg {
            width: 18px;
            height: 18px;
            display: block;
        }
        .view-compact-header h3 {
            margin: 0;
            font-size: 15px;
            font-weight: 600;
            color: var(--text-primary);
            letter-spacing: 0.2px;
        }
        .view-lineage .view-compact-header h3 { color: var(--node-view); }
        .view-tables .view-compact-header h3 { color: var(--node-table); }
        .view-impact .view-compact-header h3 { color: var(--warning); }
        .view-inline-stats {
            margin-left: auto;
            font-size: 12px;
            color: var(--text-muted);
            white-space: nowrap;
        }
        @media (max-width: 760px) {
            .view-compact-header {
                flex-wrap: wrap;
                align-items: flex-start;
                gap: 6px 10px;
            }
            .view-inline-stats {
                width: 100%;
                margin-left: 0;
                white-space: normal;
            }
        }

        /* View Header - consistent across all tabs */
        .view-header {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 24px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .view-header-icon {
            font-size: 32px;
            line-height: 1;
            flex-shrink: 0;
            color: var(--text-muted);
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .view-header-icon svg {
            width: 28px;
            height: 28px;
            display: block;
        }
        .view-header-content {
            flex: 1;
        }
        .view-title {
            color: var(--text-primary);
            font-size: 22px;
            font-weight: 600;
            margin: 0 0 6px 0;
        }
        .view-subtitle {
            color: var(--text-muted);
            font-size: 14px;
            margin: 0;
            line-height: 1.5;
        }

        /* View Stats - consistent stats display */
        .view-stats {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 24px;
        }
        .view-stat-badge {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 12px 16px;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
            min-width: 80px;
        }
        .view-stat-value {
            font-size: 20px;
            font-weight: 700;
            color: var(--accent);
            line-height: 1;
        }
        .view-stat-label {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* View Controls - search and filter section */
        .view-controls {
            background: var(--bg-secondary);
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
            padding: 20px;
            margin-bottom: 24px;
        }
        .view-controls-header {
            margin-bottom: 16px;
        }
        .view-controls-header h4 {
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 600;
            margin: 0 0 4px 0;
        }
        .view-controls-hint {
            color: var(--text-muted);
            font-size: 12px;
            margin: 0;
        }
        .view-controls-hint kbd {
            background: var(--bg-tertiary);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            border: 1px solid var(--border-subtle);
        }

        /* View Search Input */
        .view-search-box {
            display: flex;
            align-items: center;
            gap: 10px;
            background: var(--bg-primary);
            border: 2px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 12px 16px;
            margin-bottom: 16px;
            transition: all 0.2s;
        }
        .view-search-box:focus-within {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .view-search-box svg {
            width: 16px;
            height: 16px;
            color: var(--text-dim);
            flex-shrink: 0;
        }
        .view-search-input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--text-primary);
            font-size: 14px;
            outline: none;
        }
        .view-search-input::placeholder {
            color: var(--text-dim);
        }
        .view-search-clear {
            display: none;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            color: var(--text-dim);
            cursor: pointer;
            padding: 4px;
            border-radius: var(--radius-sm);
        }
        .view-search-clear.visible {
            display: flex;
        }
        .view-search-clear:hover {
            color: var(--error);
            background: rgba(239, 68, 68, 0.1);
        }

        /* View Filters */
        .view-filters {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
            align-items: center;
            margin-bottom: 12px;
        }
        .view-filter-clear {
            margin-left: auto;
            padding: 6px 10px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .view-filter-clear:hover {
            border-color: var(--accent);
            color: var(--accent);
        }
        .view-filter-label {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--text-muted);
            font-size: 12px;
            font-weight: 500;
        }
        .view-filter-label svg {
            width: 14px;
            height: 14px;
        }

        /* Quick Filter Chips */
        .view-quick-filters {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        .view-filter-chip {
            padding: 6px 12px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-subtle);
            border-radius: 20px;
            color: var(--text-secondary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s;
        }
        .view-filter-chip:hover {
            border-color: var(--accent);
            color: var(--accent);
        }
        .view-filter-chip.active {
            background: var(--accent);
            border-color: var(--accent);
            color: white;
        }

        /* View Content Grid */
        .view-content {
            flex: 1;
        }
        .view-grid {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        /* View Card Item */
        .view-card {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 20px;
            background: var(--bg-secondary);
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: var(--shadow-sm);
        }
        .view-card:hover {
            background: var(--bg-tertiary);
            border-color: var(--accent);
            transform: translateY(-2px);
            box-shadow: var(--shadow-md);
        }
        .view-card-icon {
            font-size: 24px;
            flex-shrink: 0;
        }
        .view-card-content {
            flex: 1;
            min-width: 0;
        }
        .view-card-title {
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 4px;
        }
        .view-card-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: var(--text-muted);
        }
        .view-card-badge {
            padding: 2px 8px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
        }
        .view-card-arrow {
            color: var(--text-dim);
            flex-shrink: 0;
        }
        .view-card-arrow svg {
            width: 16px;
            height: 16px;
        }

        /* Lineage Tables Grid */
        .lineage-tables-section {
            margin-top: 8px;
        }
        .lineage-tables-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 10px;
            max-height: 500px;
            overflow-y: auto;
            padding: 4px;
        }
        .lineage-table-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 14px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.15s ease;
            text-align: left;
            width: 100%;
        }
        .lineage-table-item:hover {
            background: var(--bg-tertiary);
            border-color: var(--accent);
            transform: translateY(-1px);
            box-shadow: var(--shadow-sm);
        }
        .table-item-icon {
            font-size: 18px;
            flex-shrink: 0;
        }
        .table-item-name {
            flex: 1;
            font-weight: 500;
            color: var(--text-primary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .table-item-name mark {
            background: var(--accent);
            color: white;
            padding: 0 2px;
            border-radius: 2px;
        }
        .table-item-type {
            font-size: 11px;
            padding: 2px 6px;
            background: var(--bg-tertiary);
            border-radius: 4px;
            color: var(--text-muted);
            text-transform: uppercase;
            flex-shrink: 0;
        }
        .table-item-connections {
            display: flex;
            gap: 4px;
            flex-shrink: 0;
            font-weight: 500;
        }
        .conn-badge {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .conn-badge:first-child {
            background: rgba(34, 197, 94, 0.15);
            color: var(--success-light);
        }
        .conn-badge:last-child {
            background: rgba(99, 102, 241, 0.15);
            color: var(--accent);
        }
        .lineage-empty-filter {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-muted);
        }
        .view-results-info {
            font-size: 12px;
            color: var(--text-muted);
            margin-left: auto;
        }

        /* View Empty State */
        .view-empty {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-muted);
        }
        .view-empty svg {
            width: 64px;
            height: 64px;
            margin-bottom: 16px;
            opacity: 0.5;
        }
        .view-empty h3 {
            color: var(--text-primary);
            font-size: 18px;
            margin: 0 0 8px 0;
        }
        .view-empty p {
            margin: 0 0 8px 0;
            max-width: 400px;
            margin-left: auto;
            margin-right: auto;
        }
        .view-empty .hint {
            font-size: 12px;
            color: var(--text-dim);
        }

        /* Form Card for Impact View */
        .view-form-card {
            background: var(--bg-secondary);
            border-radius: var(--radius-xl);
            border: 1px solid var(--border-subtle);
            padding: 32px;
            box-shadow: var(--shadow-md);
        }
        .view-form-fields {
            display: flex;
            flex-direction: column;
            gap: 24px;
        }
        .view-form-field {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .view-form-field label {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 500;
        }
        .view-form-field label svg {
            width: 16px;
            height: 16px;
            color: var(--text-muted);
        }
        .view-form-actions {
            margin-top: 8px;
            padding-top: 20px;
            border-top: 1px solid var(--border-subtle);
        }
    `;
}

/**
 * Table list view styles
 */
export function getTableListStyles(): string {
    return `
        /* ========== Table List View ========== */
        .table-list-view { padding: 10px; }
        .table-list-header {
            margin-bottom: 24px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .header-top {
            margin-bottom: 16px;
        }
        .table-list-header h3 {
            color: var(--text-primary); margin: 0 0 6px 0;
            font-size: 22px; font-weight: 600;
        }
        .header-subtitle {
            color: var(--text-muted); font-size: 14px;
            margin: 0; line-height: 1.5;
        }
        .header-info {
            display: flex; flex-direction: column; gap: 12px;
            margin-bottom: 16px; padding: 16px;
            background: rgba(99, 102, 241, 0.05);
            border-radius: var(--radius-md);
            border: 1px solid rgba(99, 102, 241, 0.1);
        }
        .info-card {
            display: flex; gap: 12px; align-items: flex-start;
        }
        .info-card svg {
            flex-shrink: 0; margin-top: 2px;
            color: var(--accent);
        }
        .info-card strong {
            display: block; color: var(--text-primary);
            font-size: 13px; font-weight: 600; margin-bottom: 4px;
        }
        .info-card p {
            margin: 0; color: var(--text-muted);
            font-size: 12px; line-height: 1.5;
        }
        .legend-item {
            display: inline-flex; align-items: center; gap: 6px;
            margin-right: 12px; font-size: 12px;
        }
        .legend-dot {
            width: 10px; height: 10px; border-radius: 50%;
            display: inline-block;
        }
        .legend-dot.high {
            background: var(--accent);
        }
        .legend-dot.medium {
            background: rgba(99, 102, 241, 0.7);
        }
        .legend-dot.low {
            background: rgba(99, 102, 241, 0.4);
        }
        .header-stats {
            display: flex; gap: 12px; flex-wrap: wrap;
        }
        .stat-badge {
            display: flex; flex-direction: column; align-items: center;
            padding: 12px 16px; background: var(--bg-secondary);
            border-radius: var(--radius-md); border: 1px solid var(--border-subtle);
            min-width: 80px;
        }
        .stat-value {
            font-size: 20px; font-weight: 700; color: var(--accent);
            line-height: 1;
        }
        .stat-label {
            font-size: 11px; color: var(--text-muted);
            margin-top: 4px; text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .table-list-grid { display: flex; flex-direction: column; gap: 12px; }
        .table-list-item {
            display: flex; align-items: center; gap: 16px; padding: 16px 20px;
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle); cursor: pointer;
            transition: all 0.2s; position: relative;
            box-shadow: var(--shadow-sm);
        }
        .table-list-item:hover {
            background: var(--bg-tertiary);
            border-color: var(--accent);
            transform: translateY(-2px);
            box-shadow: var(--shadow-md);
        }
        .table-list-item.connection-high {
            border-left: 4px solid var(--accent);
        }
        .table-list-item.connection-medium {
            border-left: 4px solid rgba(99, 102, 241, 0.6);
        }
        .table-list-item.connection-low {
            border-left: 4px solid rgba(99, 102, 241, 0.3);
        }

        .table-list-icon-wrapper {
            position: relative; flex-shrink: 0;
            width: 48px; height: 48px;
            display: flex; align-items: center; justify-content: center;
            background: var(--bg-primary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
        }
        .table-list-icon { font-size: 24px; }
        .connection-indicator {
            position: absolute; top: -2px; right: -2px;
            width: 12px; height: 12px;
            border-radius: 50%; border: 2px solid var(--bg-secondary);
        }
        .connection-indicator.connection-high {
            background: var(--accent); box-shadow: 0 0 0 2px var(--accent);
        }
        .connection-indicator.connection-medium {
            background: rgba(99, 102, 241, 0.7);
        }
        .connection-indicator.connection-low {
            background: rgba(99, 102, 241, 0.4);
        }

        .table-list-info { flex: 1; min-width: 0; }
        .table-list-header-row {
            display: flex; align-items: center; justify-content: space-between;
            gap: 12px; margin-bottom: 8px;
        }
        .table-list-name {
            font-weight: 600; color: var(--text-primary);
            font-size: 15px; line-height: 1.4;
        }
        .table-list-connections {
            display: flex; align-items: center; gap: 8px;
            flex-shrink: 0;
        }
        .connection-badge {
            display: flex; align-items: center; gap: 4px;
            padding: 4px 8px; border-radius: var(--radius-sm);
            font-size: 11px; font-weight: 600;
            background: var(--bg-tertiary);
        }
        .connection-badge.upstream {
            color: var(--success-light);
        }
        .connection-badge.downstream {
            color: var(--accent);
        }
        .connection-badge svg {
            width: 12px; height: 12px;
        }
        .no-connections-badge {
            font-size: 11px; color: var(--text-dim);
            font-style: italic;
        }

        .table-list-meta {
            display: flex; align-items: center; gap: 10px;
            font-size: 12px; color: var(--text-muted);
            flex-wrap: wrap;
        }
        .table-list-type-badge {
            padding: 4px 10px; border-radius: var(--radius-sm);
            font-size: 11px; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .table-list-type-badge.type-table {
            background: rgba(16, 185, 129, 0.15); color: var(--success-light);
        }
        .table-list-type-badge.type-view {
            background: rgba(139, 92, 246, 0.15); color: #a78bfa;
        }
        .table-list-type-badge.type-cte {
            background: rgba(99, 102, 241, 0.15); color: var(--accent);
        }
        .table-list-file {
            display: flex; align-items: center; gap: 4px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            max-width: 200px;
        }
        .table-list-file svg {
            width: 12px; height: 12px; flex-shrink: 0;
            opacity: 0.6;
        }
        .table-list-action {
            display: flex; align-items: center; justify-content: center;
            width: 32px; height: 32px;
            border-radius: var(--radius-sm);
            color: var(--text-dim);
            transition: all 0.2s;
            flex-shrink: 0;
        }
        .table-list-item:hover .table-list-action {
            color: var(--accent);
            background: rgba(99, 102, 241, 0.1);
        }
        .table-list-item.no-connections {
            opacity: 0.7;
        }
        .table-list-item.no-connections:hover {
            opacity: 1;
        }
        .table-list-empty {
            text-align: center; padding: 60px 20px; color: var(--text-muted);
        }
        .table-list-empty svg {
            width: 48px; height: 48px; margin: 0 auto 16px; opacity: 0.5;
        }
        .table-list-empty h3 {
            color: var(--text-primary); margin: 0 0 8px 0; font-size: 16px;
        }
        .table-list-empty .hint {
            color: var(--text-dim); font-size: 12px; margin-top: 8px;
        }

        /* Table List Controls */
        .table-list-controls {
            display: flex; flex-direction: column; gap: 16px;
            margin-bottom: 24px; padding: 20px;
            background: var(--bg-secondary); border-radius: var(--radius-xl);
            border: 1px solid var(--border-subtle);
            box-shadow: var(--shadow-sm);
        }
        .controls-header {
            margin-bottom: 4px;
        }
        .controls-header h4 {
            color: var(--text-primary); font-size: 14px; font-weight: 600;
            margin: 0 0 6px 0;
        }
        .controls-hint {
            color: var(--text-muted); font-size: 12px; margin: 0;
            line-height: 1.5;
        }
        .controls-hint kbd {
            background: var(--bg-tertiary); border: 1px solid var(--border-subtle);
            border-radius: 3px; padding: 2px 6px;
            font-family: monospace; font-size: 11px;
            color: var(--text-secondary);
        }
        .filter-group {
            display: flex; flex-direction: column; gap: 6px;
            flex: 1; min-width: 160px;
        }
        .filter-label {
            display: flex; align-items: center; gap: 6px;
            color: var(--text-secondary); font-size: 12px; font-weight: 500;
        }
        .filter-label svg {
            width: 14px; height: 14px; color: var(--text-muted);
        }
        .search-box-table {
            display: flex; align-items: center; gap: 10px;
            background: var(--bg-primary); padding: 12px 16px;
            border-radius: var(--radius-md); border: 2px solid var(--border-subtle);
            transition: all 0.2s;
        }
        .search-box-table:focus-within {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .search-box-table svg {
            flex-shrink: 0; color: var(--text-dim);
            width: 16px; height: 16px;
        }
        .search-input-table {
            flex: 1; background: transparent; border: none;
            color: var(--text-secondary); font-size: 14px; outline: none;
        }
        .search-input-table::placeholder { color: var(--text-dim); }
        .search-clear-table {
            background: transparent; border: none; color: var(--text-dim);
            cursor: pointer; padding: 6px; display: none;
            align-items: center; justify-content: center;
            border-radius: var(--radius-sm);
            transition: all 0.2s;
        }
        .search-clear-table:hover {
            color: var(--error-light);
            background: rgba(239, 68, 68, 0.1);
        }
        .filter-controls {
            display: flex; gap: 12px; flex-wrap: wrap;
        }
        .filter-select {
            flex: 1; min-width: 160px;
            background: var(--bg-primary); border: 2px solid var(--border-subtle);
            color: var(--text-secondary); font-size: 13px;
            padding: 10px 14px; border-radius: var(--radius-md);
            outline: none; cursor: pointer; transition: all 0.2s;
        }
        .filter-select:hover {
            border-color: var(--border-color);
            background: var(--bg-tertiary);
        }
        .filter-select:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        /* Responsive layout for narrow panels */
        @media (max-width: 600px) {
            .filter-controls {
                flex-direction: column;
            }
            .filter-select {
                min-width: 100%; width: 100%;
            }
            .table-list-controls {
                padding: 12px;
            }
        }
        .table-list-results-info {
            padding: 12px 16px; margin-bottom: 12px;
            background: var(--bg-secondary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
            font-size: 12px; color: var(--text-muted);
        }
        .table-list-empty-filter {
            text-align: center; padding: 60px 20px; color: var(--text-muted);
        }
        .table-list-empty-filter svg {
            width: 48px; height: 48px; margin: 0 auto 16px; opacity: 0.5;
        }
        .table-list-empty-filter h3 {
            color: var(--text-primary); margin: 0 0 8px 0; font-size: 16px;
        }
        .table-list-empty-filter .hint {
            color: var(--text-dim); font-size: 12px; margin-top: 8px;
        }
        mark {
            background: rgba(99, 102, 241, 0.3); color: var(--text-primary);
            padding: 2px 4px; border-radius: 3px;
        }
    `;
}

/**
 * Impact form styles
 */
export function getImpactFormStyles(): string {
    return `
        /* Impact Form Styles */
        .impact-form-container {
            width: 100%; max-width: 900px; margin: 0 auto;
        }
        .impact-form {
            background: var(--bg-secondary); border-radius: var(--radius-xl);
            border: 1px solid var(--border-subtle); padding: 32px;
            margin-bottom: 24px; box-shadow: var(--shadow-md);
            width: 100%;
        }
        .form-header {
            display: flex; align-items: flex-start; gap: 16px;
            margin-bottom: 28px; padding-bottom: 20px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .form-header-icon {
            font-size: 32px; line-height: 1;
        }
        .form-header h3 {
            color: var(--text-primary); font-size: 20px; font-weight: 600;
            margin: 0 0 6px 0;
        }
        .form-description {
            color: var(--text-muted); font-size: 14px; margin: 0;
            line-height: 1.5;
        }
        .form-fields {
            display: flex; flex-direction: column; gap: 24px;
        }
        .form-field {
            display: flex; flex-direction: column; gap: 10px;
        }
        .form-field label {
            display: flex; align-items: center; gap: 8px;
            color: var(--text-primary); font-size: 14px; font-weight: 500;
        }
        .form-field label svg {
            width: 16px; height: 16px; color: var(--text-muted);
        }
        .form-select {
            background: var(--bg-primary); border: 1px solid var(--border-subtle);
            color: var(--text-secondary); font-size: 14px; padding: 12px 16px;
            border-radius: var(--radius-md); outline: none; cursor: pointer;
            transition: all 0.2s; font-family: inherit;
        }
        .form-select:hover {
            border-color: var(--border-color);
            background: var(--bg-tertiary);
        }
        .form-select:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .impact-typeahead {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .impact-typeahead-input {
            width: 100%;
            background: var(--bg-primary);
            border: 1px solid var(--border-subtle);
            color: var(--text-secondary);
            font-size: 14px;
            padding: 12px 16px;
            border-radius: var(--radius-md);
            outline: none;
            transition: all 0.2s;
        }
        .impact-typeahead-input:hover {
            border-color: var(--border-color);
            background: var(--bg-tertiary);
        }
        .impact-typeahead-input:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .impact-typeahead-results {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-md);
            max-height: 220px;
            overflow-y: auto;
            z-index: 20;
            padding: 6px;
        }
        .impact-typeahead-item {
            width: 100%;
            border: none;
            background: transparent;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 8px 10px;
            border-radius: var(--radius-sm);
            cursor: pointer;
            text-align: left;
            transition: background 0.15s ease;
        }
        .impact-typeahead-item:hover {
            background: var(--bg-hover);
        }
        .impact-typeahead-name {
            color: var(--text-primary);
            font-size: 13px;
            font-weight: 500;
        }
        .impact-typeahead-type {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: var(--text-muted);
            background: var(--bg-tertiary);
            border: 1px solid var(--border-subtle);
            border-radius: 999px;
            padding: 2px 7px;
        }
        .impact-selected-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            width: fit-content;
            max-width: 100%;
            padding: 6px 10px;
            border-radius: 999px;
            border: 1px solid rgba(99, 102, 241, 0.35);
            background: rgba(99, 102, 241, 0.12);
            color: var(--text-secondary);
            font-size: 12px;
        }
        .impact-selected-badge span {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 260px;
        }
        .impact-selected-badge button {
            border: none;
            background: transparent;
            color: var(--accent);
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            padding: 0;
        }
        .impact-selected-badge button:hover {
            color: var(--accent-hover);
            text-decoration: underline;
        }

        /* Modern Button-Style Change Type Selector */
        .change-type-buttons {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
        }
        .change-type-btn {
            display: flex; flex-direction: column; align-items: center; gap: 8px;
            padding: 16px 12px; background: var(--bg-primary);
            border: 2px solid var(--border-subtle); border-radius: var(--radius-md);
            color: var(--text-secondary); font-size: 13px; font-weight: 500;
            cursor: pointer; transition: all 0.2s; position: relative;
            min-height: 90px;
        }
        .change-type-btn:hover {
            border-color: var(--accent); background: var(--bg-tertiary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-sm);
        }
        .change-type-btn.active {
            border-color: var(--accent); background: rgba(99, 102, 241, 0.1);
            color: var(--accent);
        }
        .change-type-btn.active::before {
            content: '';
            position: absolute; top: 8px; right: 8px;
            width: 8px; height: 8px;
            background: var(--accent); border-radius: 50%;
        }
        .change-type-btn svg {
            width: 24px; height: 24px; stroke-width: 2;
        }
        .change-type-btn span {
            font-size: 13px; font-weight: 500;
        }
        .change-type-btn.active svg {
            color: var(--accent);
        }

        .form-actions {
            margin-top: 8px; padding-top: 20px;
            border-top: 1px solid var(--border-subtle);
        }
        .btn-primary {
            display: flex; align-items: center; justify-content: center; gap: 10px;
            padding: 14px 28px; background: var(--accent); color: white;
            border: none; border-radius: var(--radius-md); font-size: 14px;
            font-weight: 600; cursor: pointer; transition: all 0.2s;
            width: 100%; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }
        .btn-primary:hover:not(:disabled) {
            background: var(--accent-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
        .btn-primary:active:not(:disabled) {
            transform: translateY(0);
        }
        .btn-primary:disabled {
            opacity: 0.5; cursor: not-allowed;
            transform: none; box-shadow: none;
        }
        .btn-primary svg {
            width: 18px; height: 18px;
        }
        .field-hint {
            margin-left: 8px;
            font-size: 11px;
            color: var(--text-dim);
            font-weight: 400;
        }
        .field-subtext {
            margin-top: 4px;
            font-size: 11px;
            color: var(--text-muted);
        }
        .impact-results {
            margin-top: 24px;
        }
        .impact-report {
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 20px;
        }
        .report-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 16px;
        }
        .severity-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.4px;
            color: #fff;
            text-transform: uppercase;
        }
        .severity-badge.severity-critical {
            background: var(--error);
        }
        .severity-badge.severity-high {
            background: var(--warning);
        }
        .severity-badge.severity-medium {
            background: var(--success);
        }
        .severity-badge.severity-low {
            background: var(--text-dim);
        }
        .report-target {
            margin-bottom: 16px;
            padding: 12px 14px;
            background: var(--bg-primary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
        }
        .impact-summary {
            margin-bottom: 20px;
        }
        .impact-summary h3 {
            margin-bottom: 10px;
        }
        .summary-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
        }
        .summary-stats.summary-stats-compact {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .summary-stats .stat-item {
            background: var(--bg-primary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 10px 12px;
            text-align: center;
            min-width: 120px;
            flex: 1 1 120px;
            cursor: pointer;
            transition: border-color 0.15s, transform 0.15s;
        }
        .summary-stats .stat-item:hover {
            border-color: var(--accent);
            transform: translateY(-1px);
        }
        .summary-stats .stat-item:focus {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
        }
        .summary-stats .stat-value {
            font-size: 18px;
            font-weight: 700;
            color: var(--accent);
        }
        .summary-stats .stat-label {
            font-size: 10px;
            color: var(--text-muted);
            margin-top: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .summary-details {
            margin-top: 12px;
            border: 1px solid var(--border-subtle);
            background: var(--bg-primary);
            border-radius: var(--radius-md);
            padding: 12px;
        }
        .summary-details-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            color: var(--text-primary);
            font-weight: 600;
        }
        .summary-details-close {
            background: transparent;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            color: var(--text-muted);
            font-size: 11px;
            padding: 4px 8px;
            cursor: pointer;
        }
        .summary-details-close:hover {
            color: var(--text-primary);
            border-color: var(--border-color);
        }
        .summary-details-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 8px;
        }
        .summary-item {
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 8px 10px;
            font-size: 12px;
            color: var(--text-secondary);
        }
        .impact-list {
            margin-top: 18px;
        }
        .impact-list-header {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .impact-count {
            font-size: 12px;
            color: var(--text-muted);
        }
        .items-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 12px;
        }
        .impact-item {
            background: var(--bg-primary);
            border: 1px solid var(--border-subtle);
            border-left: 4px solid transparent;
            border-radius: var(--radius-md);
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .impact-item.severity-high { border-left-color: var(--warning); }
        .impact-item.severity-medium { border-left-color: var(--success); }
        .impact-item.severity-low { border-left-color: var(--text-dim); }
        .item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }
        .item-type {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-subtle);
            border-radius: 999px;
            padding: 2px 8px;
            font-size: 10px;
            color: var(--text-secondary);
            text-transform: capitalize;
        }
        .item-severity {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-weight: 600;
            color: var(--warning-light);
        }
        .severity-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: currentColor;
        }
        .severity-icon svg {
            width: 12px;
            height: 12px;
            display: block;
        }
        .impact-item.severity-medium .item-severity { color: var(--success-light); }
        .impact-item.severity-low .item-severity { color: var(--text-dim); }
        .item-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
        }
        .item-reason {
            font-size: 12px;
            color: var(--text-secondary);
        }
        .item-location {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: var(--text-dim);
        }
        .file-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: currentColor;
        }
        .file-icon svg {
            width: 12px;
            height: 12px;
            display: block;
        }
        .impact-empty {
            text-align: center; padding: 80px 20px; color: var(--text-muted);
        }
        .impact-empty svg {
            width: 64px; height: 64px; margin: 0 auto 24px; opacity: 0.5;
        }
        .impact-empty h3 {
            color: var(--text-primary); margin: 0 0 12px 0; font-size: 18px;
        }
        .impact-empty p {
            margin: 8px 0; font-size: 14px;
        }
        .impact-empty .hint {
            color: var(--text-dim); font-size: 12px; margin-top: 12px;
        }

        /* Transitive Impacts - Grouped by Parent Table */
        .transitive-grouped .transitive-groups {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .transitive-group {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            border-left: 3px solid var(--text-dim);
            overflow: hidden;
        }
        .transitive-group.severity-high { border-left-color: var(--warning); }
        .transitive-group.severity-medium { border-left-color: var(--success); }
        .transitive-group.severity-critical { border-left-color: var(--danger); }
        .transitive-group-header {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 12px 14px;
            background: transparent;
            border: none;
            cursor: pointer;
            text-align: left;
            color: var(--text-primary);
            font-size: 13px;
        }
        .transitive-group-header:hover {
            background: var(--bg-hover);
        }
        .group-expand-icon {
            font-size: 10px;
            color: var(--text-dim);
            transition: transform 0.15s ease;
        }
        .transitive-group.expanded .group-expand-icon {
            transform: rotate(90deg);
        }
        .group-table-name {
            font-weight: 600;
            color: var(--text-primary);
        }
        .group-path {
            flex: 1;
            font-size: 11px;
            color: var(--text-dim);
            font-family: var(--font-mono);
        }
        .group-count {
            font-size: 11px;
            color: var(--text-secondary);
            background: var(--bg-tertiary);
            padding: 2px 8px;
            border-radius: 10px;
        }
        .group-severity {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--warning-light);
        }
        .transitive-group.severity-medium .group-severity { color: var(--success-light); }
        .transitive-group.severity-low .group-severity { color: var(--text-dim); }
        .transitive-group-preview {
            padding: 0 14px 10px 34px;
            font-size: 11px;
            color: var(--text-dim);
            font-family: var(--font-mono);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .transitive-group.expanded .transitive-group-preview {
            display: none;
        }
        .transitive-group-content {
            border-top: 1px solid var(--border-subtle);
            padding: 10px 14px;
            background: var(--bg-primary);
        }
        .column-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .column-item {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            font-size: 12px;
        }
        .column-name {
            font-family: var(--font-mono);
            color: var(--text-primary);
        }
        .column-location {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: var(--text-dim);
        }

        /* Skeleton Loader */
        .skeleton-loader {
            padding: 20px;
        }
        .skeleton-line {
            height: 16px; background: var(--bg-secondary);
            border-radius: var(--radius-sm); margin-bottom: 12px;
            animation: skeleton-pulse 1.5s ease-in-out infinite;
        }
        .skeleton-line:last-child {
            width: 60%; margin-bottom: 0;
        }
        @keyframes skeleton-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `;
}

/**
 * Lineage overview and visual styles
 */
export function getLineageVisualStyles(): string {
    return `
        /* Lineage Enhancements */
        .lineage-overview-empty {
            text-align: center; padding: 80px 20px; color: var(--text-muted);
        }
        .lineage-overview-empty svg {
            width: 64px; height: 64px; margin: 0 auto 24px; opacity: 0.5;
        }
        .lineage-overview-empty h3 {
            color: var(--text-primary); margin: 0 0 12px 0; font-size: 18px;
        }
        .lineage-overview-empty p {
            margin: 8px 0; font-size: 14px;
        }
        .lineage-overview-empty .hint {
            color: var(--text-dim); font-size: 12px; margin-top: 12px;
        }
        .section-header-with-action {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 16px; margin-bottom: 12px;
        }
        .view-all-btn {
            padding: 6px 12px; background: var(--bg-tertiary);
            border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
            color: var(--text-secondary); font-size: 12px; cursor: pointer;
            transition: all 0.2s; white-space: nowrap;
        }
        .view-all-btn:hover {
            background: var(--bg-hover); border-color: var(--accent);
            color: var(--text-primary);
        }

        /* ========== Table Explorer Detail View ========== */
        .table-explorer { padding: 16px; }
        .explorer-header {
            display: flex; align-items: center; gap: 12px;
            margin-bottom: 20px; padding-bottom: 12px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .explorer-header h2 {
            font-size: 20px; font-weight: 600; color: var(--text-primary); margin: 0;
        }
        .flow-panel {
            margin-top: 24px; padding: 16px;
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
        }
        .flow-panel h3 {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 16px; font-weight: 600; color: var(--text-primary);
            margin: 0 0 12px 0;
        }
        .flow-panel .flow-panel-icon {
            display: inline-flex;
            color: var(--text-muted);
        }
        .flow-panel .flow-panel-icon svg {
            width: 14px;
            height: 14px;
            display: block;
        }
        .flow-section {
            margin-bottom: 16px;
        }
        .flow-section:last-child { margin-bottom: 0; }
        .flow-section-header {
            margin-bottom: 12px;
        }
        .flow-section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px; font-weight: 600; color: var(--text-muted);
            text-transform: uppercase; letter-spacing: 0.5px;
            margin-bottom: 6px; padding-bottom: 4px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .flow-section-title svg {
            width: 14px;
            height: 14px;
            display: block;
            flex-shrink: 0;
        }
        .flow-section-title .info-icon {
            cursor: help;
            opacity: 0.6;
            transition: opacity 0.2s;
            flex-shrink: 0;
            stroke: var(--text-muted);
        }
        .flow-section-title .info-icon:hover {
            opacity: 1;
            stroke: var(--accent);
        }
        .flow-section-desc {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.5;
            margin-top: 4px;
            padding-left: 4px;
        }
        .flow-list {
            display: flex; flex-direction: column; gap: 6px;
        }
        .flow-item {
            display: flex; align-items: center; gap: 10px; padding: 8px 12px;
            background: var(--bg-tertiary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle); transition: all 0.15s;
        }
        .flow-item-internal {
            cursor: pointer;
        }
        .flow-item-internal:hover {
            background: var(--bg-hover); border-color: var(--accent);
        }
        .flow-item-external {
            opacity: 0.8;
        }
        .flow-node-icon { font-size: 16px; flex-shrink: 0; }
        .flow-node-icon svg { width: 16px; height: 16px; display: block; }
        .flow-node-name {
            flex: 1; font-weight: 500; color: var(--text-primary);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .flow-node-type {
            font-size: 11px; color: var(--text-muted);
            background: var(--bg-secondary); padding: 2px 6px;
            border-radius: var(--radius-sm); flex-shrink: 0;
        }
        .flow-node-type.external {
            background: rgba(71, 85, 105, 0.3); color: var(--text-dim);
        }
        .flow-node-file {
            font-size: 10px; color: var(--text-dim);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            max-width: 120px;
        }
        .column-list {
            margin-top: 20px; padding: 16px;
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
        }
        .column-list h3 {
            font-size: 16px; font-weight: 600; color: var(--text-primary);
            margin: 0 0 12px 0;
        }
        .columns-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 8px;
        }
        .column-item {
            display: flex; flex-direction: column; gap: 4px; padding: 8px 12px;
            background: var(--bg-tertiary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
        }
        .column-name {
            font-weight: 500; color: var(--text-primary); font-size: 13px;
        }
        .column-type {
            font-size: 11px; color: var(--text-muted); font-family: monospace;
        }
        .badge-primary, .badge-not-null {
            font-size: 9px; font-weight: 600; padding: 2px 4px;
            border-radius: var(--radius-sm); margin-top: 2px;
        }
        .badge-primary {
            background: var(--accent); color: white;
        }
        .badge-not-null {
            background: var(--warning); color: white;
        }

        /* ========== Lineage Overview ========== */
        .lineage-overview { padding: 10px; }
        .lineage-overview-empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
        .lineage-stats { margin-bottom: 24px; }
        .lineage-stats h3 { color: var(--text-primary); margin: 0 0 12px 0; font-size: 16px; }
        .stats-grid {
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
        }
        .stat-item {
            background: var(--bg-secondary); padding: 16px; border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle); text-align: center;
        }
        .stat-item .stat-value { display: block; font-size: 24px; font-weight: 700; color: var(--accent); }
        .stat-item .stat-label { display: block; font-size: 12px; color: var(--text-muted); margin-top: 4px; }
        .lineage-section { margin-bottom: 24px; }
        .lineage-section h3 { color: var(--text-primary); margin: 0 0 8px 0; font-size: 14px; }
        .section-hint { color: var(--text-muted); font-size: 12px; margin: 0 0 12px 0; }
        .node-list { display: flex; flex-direction: column; gap: 6px; }
        .node-item {
            display: flex; align-items: center; gap: 10px; padding: 10px 14px;
            background: var(--bg-secondary); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle); cursor: pointer; transition: all 0.15s;
        }
        .node-item:hover { background: var(--bg-tertiary); border-color: var(--accent); }
        .node-icon { font-size: 16px; display: inline-flex; align-items: center; color: var(--text-muted); }
        .node-icon svg { width: 16px; height: 16px; display: block; }
        .node-name { flex: 1; font-weight: 500; color: var(--text-primary); }
        .node-type { font-size: 11px; color: var(--text-muted); background: var(--bg-tertiary); padding: 2px 6px; border-radius: var(--radius-sm); text-transform: capitalize; }
        .connection-count {
            font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-sm);
            min-width: 28px; text-align: center;
        }
        .connection-count.has-connections { background: var(--accent); color: white; }
        .connection-count.no-connections { background: var(--bg-tertiary); color: var(--text-muted); }
        .node-item.no-connections { opacity: 0.6; }
        .node-item.no-connections:hover { opacity: 1; }
        .more-items { padding: 8px 14px; color: var(--text-muted); font-size: 12px; font-style: italic; }
        .lineage-tip {
            background: var(--bg-tertiary); padding: 12px 16px; border-radius: var(--radius-md);
            font-size: 12px; color: var(--text-muted);
        }
        .lineage-tip strong { color: var(--text-secondary); }
    `;
}

/**
 * Visual lineage graph styles
 */
export function getLineageGraphStyles(): string {
    return `
        /* ========== Visual Lineage Graph ========== */
        .lineage-visual-container {
            padding: 20px;
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            flex: 1;
            justify-content: center; /* Vertically center content */
            overflow-y: auto;
        }
        .lineage-search-panel {
            margin-bottom: 24px;
        }
        .search-header h3 {
            color: var(--text-primary);
            font-size: 18px;
            margin: 0 0 8px 0;
        }
        .search-hint {
            color: var(--text-muted);
            font-size: 13px;
            margin: 0 0 16px 0;
        }
        .search-form {
            position: relative;
            margin-bottom: 16px;
        }
        .search-input-wrapper {
            display: flex;
            align-items: center;
            gap: 10px;
            background: var(--bg-secondary);
            border: 2px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 12px 16px;
            transition: all 0.2s;
        }
        .search-input-wrapper:focus-within {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .search-input-wrapper .search-icon {
            width: 18px;
            height: 18px;
            color: var(--text-dim);
            flex-shrink: 0;
        }
        .lineage-search-input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--text-primary);
            font-size: 14px;
            outline: none;
        }
        .lineage-search-input::placeholder {
            color: var(--text-dim);
        }
        .search-clear-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            color: var(--text-dim);
            cursor: pointer;
            padding: 4px;
            border-radius: var(--radius-sm);
        }
        .search-clear-btn:hover {
            color: var(--error);
            background: rgba(239, 68, 68, 0.1);
        }
        .search-clear-btn svg {
            width: 16px;
            height: 16px;
        }
        .search-results {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            max-height: 300px;
            overflow-y: auto;
            z-index: 100;
            margin-top: 4px;
        }
        .search-result-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            cursor: pointer;
            border-bottom: 1px solid var(--border-subtle);
            transition: background 0.15s;
        }
        .search-result-item:last-child {
            border-bottom: none;
        }
        .search-result-item:hover {
            background: var(--bg-tertiary);
        }
        .search-result-item .result-icon {
            font-size: 16px;
        }
        .search-result-item .result-name {
            flex: 1;
            font-weight: 500;
            color: var(--text-primary);
        }
        .search-result-item .result-type {
            font-size: 11px;
            color: var(--text-muted);
            background: var(--bg-tertiary);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
        }
        .search-result-item .result-file {
            font-size: 11px;
            color: var(--text-dim);
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* Quick Filters */
        .quick-filters {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
        }
        .quick-filters .filter-label {
            font-size: 12px;
            color: var(--text-muted);
        }
        .filter-chip {
            padding: 6px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .filter-chip:hover {
            border-color: var(--accent);
            color: var(--text-primary);
        }
        .filter-chip.active {
            background: var(--accent);
            border-color: var(--accent);
            color: white;
        }

        /* File Filter */
        .file-filter-section {
            margin-bottom: 20px;
        }
        .file-filter-section .filter-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-muted);
            margin-bottom: 8px;
        }
        .file-filter-select {
            width: 100%;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 13px;
            padding: 8px 12px;
            min-height: 80px;
            outline: none;
        }
        .file-filter-select:focus {
            border-color: var(--accent);
        }

        /* Recent Selections */
        .recent-selections {
            margin-bottom: 20px;
        }
        .recent-selections h4 {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        .recent-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .recent-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.15s;
        }
        .recent-item:hover {
            border-color: var(--accent);
            background: var(--bg-tertiary);
        }
        .recent-icon { font-size: 14px; }
        .recent-name { font-size: 12px; color: var(--text-primary); }
        .recent-type { font-size: 10px; color: var(--text-dim); }

        /* Popular Tables */
        .popular-tables {
            margin-bottom: 24px;
        }
        .popular-tables h4 {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        .popular-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 8px;
        }
        .popular-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 14px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.2s;
        }
        .popular-item:hover {
            border-color: var(--accent);
            background: var(--bg-tertiary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-sm);
        }
        .popular-icon { font-size: 18px; }
        .popular-name { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        .popular-type-badge {
            font-size: 10px;
            color: var(--text-dim);
            background: var(--bg-tertiary);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
            text-transform: uppercase;
        }
        .popular-connections {
            display: flex;
            gap: 6px;
            font-size: 11px;
            font-weight: 500;
        }
        .popular-connections .conn-up {
            color: var(--success-light);
        }
        .popular-connections .conn-down {
            color: var(--accent);
        }
        .popular-item.filtered-out {
            display: none;
        }
        .no-popular {
            color: var(--text-dim);
            font-size: 12px;
            font-style: italic;
        }

        /* Stats Summary */
        .lineage-stats-summary {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            padding: 16px;
            background: var(--bg-secondary);
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
        }
        .stat-chip {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            background: var(--bg-tertiary);
            border-radius: var(--radius-md);
        }
        .stat-chip .stat-icon { font-size: 16px; }
        .stat-chip .stat-count { font-size: 16px; font-weight: 700; color: var(--accent); }
        .stat-chip .stat-label { font-size: 12px; color: var(--text-muted); }

        /* Graph View */
        .lineage-graph-view {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0; /* Critical for nested flex to work */
            overflow: hidden;
        }
        .graph-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
            flex-shrink: 0;
        }
        .graph-title {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .graph-title .graph-icon { font-size: 20px; display: inline-flex; color: var(--text-muted); }
        .graph-title .graph-icon svg { width: 20px; height: 20px; display: block; }
        .graph-title h3 { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
        .node-type-badge {
            font-size: 11px;
            color: var(--text-muted);
            background: var(--bg-tertiary);
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            text-transform: uppercase;
        }
        .graph-stats {
            display: flex;
            gap: 16px;
        }
        .graph-stats .stat {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-muted);
        }
        .graph-stats .stat.upstream { color: var(--success-light); }
        .graph-stats .stat.downstream { color: var(--accent); }

        /* Direction Controls */
        .direction-controls {
            display: flex;
            gap: 4px;
            padding: 8px 16px;
            background: var(--bg-primary);
            border-bottom: 1px solid var(--border-subtle);
            flex-shrink: 0;
        }
        .direction-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .direction-btn:hover {
            border-color: var(--accent);
            background: var(--bg-tertiary);
        }
        .direction-btn.active {
            background: var(--accent);
            border-color: var(--accent);
            color: white;
        }
        .direction-btn svg { width: 16px; height: 16px; }

        /* Graph Container */
        .lineage-graph-container {
            flex: 1;
            min-height: 0;
            overflow: hidden;
            background-color: var(--canvas-bg);
            background-image:
                radial-gradient(circle, var(--grid-color) 1px, transparent 1px),
                linear-gradient(to right, color-mix(in srgb, var(--grid-color) 35%, transparent) 1px, transparent 1px),
                linear-gradient(to bottom, color-mix(in srgb, var(--grid-color) 35%, transparent) 1px, transparent 1px);
            background-size: 24px 24px, 24px 24px, 24px 24px;
            position: relative;
        }
        .lineage-graph-svg {
            width: 100%;
            height: 100%;
            cursor: grab;
            user-select: none;
        }
        .lineage-graph-svg:active {
            cursor: grabbing;
        }

        /* Zoom Controls */
        .lineage-zoom-controls {
            position: absolute;
            bottom: 16px;
            left: 16px;
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 10px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-md);
            z-index: 10;
        }
        .lineage-zoom-controls .zoom-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            background: var(--bg-tertiary);
            border: none;
            border-radius: var(--radius-sm);
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.15s;
        }
        .lineage-zoom-controls .zoom-btn:hover {
            background: var(--bg-hover);
            color: var(--text-primary);
        }
        .lineage-zoom-controls .zoom-btn svg {
            width: 14px;
            height: 14px;
        }
        .lineage-zoom-controls .zoom-level {
            font-size: 11px;
            font-family: monospace;
            color: var(--text-muted);
            min-width: 40px;
            text-align: center;
        }
        .lineage-zoom-controls .zoom-divider {
            width: 1px;
            height: 20px;
            background: var(--border-subtle);
            margin: 0 4px;
        }
    `;
}

/**
 * Graph node styles for lineage
 */
export function getLineageNodeStyles(): string {
    return `
        /* Graph Node Styles */
        .lineage-node {
            cursor: pointer;
            transition: opacity 0.2s, filter 0.2s;
        }
        .lineage-node .node-bg {
            fill: var(--node-fill);
            stroke: var(--node-border);
            stroke-width: 1;
            transition: stroke 0.15s, stroke-width 0.15s;
        }
        .lineage-node .node-accent {
            transition: fill 0.15s;
        }
        .lineage-node-table .node-accent {
            fill: var(--node-table);
        }
        .lineage-node-view .node-accent {
            fill: var(--node-view);
        }
        .lineage-node-cte .node-accent {
            fill: var(--node-cte);
        }
        .lineage-node-external .node-accent {
            fill: var(--node-external);
        }
        .lineage-node-external .node-bg {
            stroke-dasharray: 5,3;
        }
        .lineage-node:hover .node-bg {
            stroke: var(--accent);
            stroke-width: 1.5;
        }
        .lineage-node.focused .node-bg {
            stroke-width: 3;
            stroke: var(--accent);
            filter: drop-shadow(0 0 8px var(--accent));
        }
        .lineage-node.center .node-bg {
            stroke-width: 3;
            stroke: var(--warning-light);
        }
        .lineage-node.dimmed {
            opacity: 0.3;
        }
        .lineage-node.highlighted .node-bg {
            stroke-width: 3;
            stroke: var(--accent);
        }
        .lineage-node .node-icon-svg {
            color: var(--node-text);
        }
        .lineage-node .node-icon-svg svg {
            width: 16px;
            height: 16px;
            display: block;
        }
        .lineage-node .node-name {
            font-size: 12px;
            font-weight: 600;
            fill: var(--node-text);
        }
        .lineage-node .node-type {
            font-size: 10px;
            fill: var(--text-muted);
        }
        .lineage-node .node-divider {
            stroke: var(--border-subtle);
            stroke-width: 1;
        }
        .lineage-node .column-dot {
            fill: var(--text-dim);
        }
        .lineage-node .column-dot.primary {
            fill: var(--warning-light);
        }
        /* Column type color coding */
        .lineage-node .column-dot.type-numeric {
            fill: #60a5fa;  /* Blue for numbers */
        }
        .lineage-node .column-dot.type-text {
            fill: #4ade80;  /* Green for text */
        }
        .lineage-node .column-dot.type-datetime {
            fill: #c084fc;  /* Purple for dates */
        }
        .lineage-node .column-dot.type-boolean {
            fill: #fb923c;  /* Orange for boolean */
        }
        .lineage-node .column-dot.type-binary {
            fill: #f87171;  /* Red for binary */
        }
        .lineage-node .column-dot.type-json {
            fill: #2dd4bf;  /* Teal for JSON */
        }
        .lineage-node .column-dot.type-other {
            fill: var(--text-dim);  /* Gray for unknown */
        }
        .lineage-node .column-name {
            font-size: 11px;
            fill: var(--node-text);
        }
        .lineage-node .column-type {
            font-size: 10px;
            fill: var(--text-muted);
            font-family: monospace;
        }
        .lineage-node .expand-btn rect {
            cursor: pointer;
        }
        .lineage-node .expand-text {
            font-size: 10px;
            fill: var(--text-muted);
            cursor: pointer;
        }
        .lineage-node .column-close-btn {
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.15s;
        }
        .lineage-node .column-close-btn:hover {
            opacity: 1;
        }
        .lineage-node .column-close-btn circle {
            transition: fill 0.15s;
        }
        .lineage-node .column-close-btn:hover circle {
            fill: rgba(239, 68, 68, 0.9);
        }
        .lineage-node .count-badge {
            font-size: 10px;
            fill: var(--text-muted);
        }

        /* Column Row States */
        .lineage-node .column-row {
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .lineage-node .column-row .column-row-bg {
            fill: transparent;
            transition: fill 0.15s;
        }
        .lineage-node .column-row .column-row-bg.odd {
            fill: rgba(148, 163, 184, 0.08);
        }
        .lineage-node .column-row .column-row-bg.even {
            fill: rgba(248, 250, 252, 0.03);
        }
        .lineage-node .column-row:hover {
            opacity: 1;
        }
        .lineage-node .column-row:hover .column-row-bg {
            fill: rgba(99, 102, 241, 0.16);
        }
        .lineage-node .column-row:focus-visible .column-row-bg {
            fill: rgba(99, 102, 241, 0.24);
            stroke: color-mix(in srgb, var(--accent) 55%, white);
            stroke-width: 1.5;
        }
        .lineage-node .column-row:focus-visible .column-name {
            fill: var(--text-primary);
        }
        .lineage-node .column-row:hover .column-name {
            fill: var(--text-primary);
        }
        .lineage-node .column-row.selected .column-name {
            fill: var(--text-primary);
            font-weight: 600;
        }
        .lineage-node .column-row.selected .column-state {
            fill: var(--accent);
        }
        .lineage-node .column-row.in-path .column-name {
            fill: var(--text-primary);
        }
        .lineage-node .column-row.in-path .column-state {
            fill: #22c55e;  /* Green for upstream */
        }
        .lineage-node.downstream .column-row.in-path .column-state {
            fill: #3b82f6;  /* Blue for downstream */
        }
        .lineage-node .column-row.dimmed {
            opacity: 0.3;
        }
        .lineage-node .column-state {
            font-size: 10px;
            fill: var(--text-muted);
        }

        /* Column Lineage Info Panel */
        .column-lineage-info {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 12px 16px;
            box-shadow: var(--shadow-lg);
            z-index: 100;
            min-width: 280px;
            display: none;
        }
        .column-lineage-info .info-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .column-lineage-info .info-title {
            font-weight: 600;
            color: var(--text-primary);
            flex: 1;
            font-family: monospace;
            font-size: 13px;
        }
        .column-lineage-info .info-source {
            font-size: 11px;
            color: var(--text-muted);
            margin-bottom: 8px;
        }
        .column-lineage-info .info-close {
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            padding: 0;
        }
        .column-lineage-info .info-close:hover {
            color: var(--text-primary);
        }
        .column-lineage-info .info-stats {
            display: flex;
            gap: 16px;
            margin-bottom: 8px;
        }
        .column-lineage-info .info-stats .stat {
            font-size: 12px;
            color: var(--text-secondary);
        }
        .column-lineage-info .info-stats .stat.upstream {
            color: #22c55e;
        }
        .column-lineage-info .info-stats .stat.downstream {
            color: #3b82f6;
        }
        .column-lineage-info .info-hint {
            font-size: 11px;
            color: var(--text-muted);
        }
        .column-lineage-info .info-flow-summary {
            font-size: 11px;
            color: var(--text-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            padding: 6px 8px;
            margin-bottom: 8px;
            background: var(--bg-tertiary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .column-lineage-info .info-actions {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 8px;
        }
        .column-lineage-info .info-clear-btn {
            border: 1px solid var(--border-subtle);
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            border-radius: var(--radius-sm);
            padding: 4px 8px;
            font-size: 11px;
            cursor: pointer;
        }
        .column-lineage-info .info-clear-btn:hover {
            border-color: var(--accent);
            color: var(--text-primary);
        }

        .column-trace-onboarding {
            position: absolute;
            z-index: 120;
            display: flex;
            align-items: center;
            gap: 8px;
            max-width: 320px;
            background: var(--bg-secondary);
            border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border-subtle));
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-md);
            padding: 6px 8px;
            font-size: 11px;
            color: var(--text-secondary);
        }
        .column-trace-onboarding .hint-title {
            color: var(--text-primary);
            font-weight: 600;
            flex-shrink: 0;
        }
        .column-trace-onboarding .hint-body {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .column-trace-onboarding .hint-close {
            border: none;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            padding: 0;
            margin-left: auto;
        }
        .column-trace-onboarding .hint-close:hover {
            color: var(--text-primary);
        }

        /* Graph Edge Styles */
        @keyframes flowAnimation {
            from { stroke-dashoffset: 24; }
            to { stroke-dashoffset: 0; }
        }
        .lineage-edge {
            fill: none;
            stroke: var(--edge-default);
            stroke-width: 1.5;
            transition: stroke 0.15s, stroke-width 0.15s;
        }
        .lineage-edge:hover {
            stroke: var(--edge-hover);
            stroke-width: 2;
        }
        .lineage-edge-direct { stroke: var(--edge-default); }
        .lineage-edge-join { stroke: var(--edge-join); }
        .lineage-edge-transform { stroke: #f59e0b; }
        .lineage-edge.highlighted {
            stroke: var(--accent);
            stroke-width: 3;
            stroke-dasharray: 12, 6;
            animation: flowAnimation 0.8s linear infinite;
        }

        /* Column Lineage Edge Styles */
        .column-lineage-edge {
            pointer-events: none;
            transition: stroke-opacity 0.2s;
        }
        .column-edge-upstream {
            stroke: #22c55e;
            stroke-dasharray: 4, 2;
        }
        .column-edge-downstream {
            stroke: #3b82f6;
            stroke-dasharray: 4, 2;
        }

        /* Tooltip */
        .lineage-tooltip {
            position: absolute;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 12px 16px;
            box-shadow: var(--shadow-lg);
            z-index: 1000;
            min-width: 220px;
            max-width: 300px;
            pointer-events: none;
        }
        .lineage-tooltip .tooltip-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .lineage-tooltip .tooltip-icon { font-size: 18px; display: inline-flex; color: var(--text-secondary); }
        .lineage-tooltip .tooltip-icon svg { width: 18px; height: 18px; display: block; }
        .lineage-tooltip .tooltip-name { font-weight: 600; color: var(--text-primary); }
        .lineage-tooltip .tooltip-divider {
            height: 1px;
            background: var(--border-subtle);
            margin: 8px 0;
        }
        .lineage-tooltip .tooltip-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin-bottom: 4px;
        }
        .lineage-tooltip .label { color: var(--text-muted); }
        .lineage-tooltip .value { color: var(--text-secondary); }
        .lineage-tooltip .tooltip-hint {
            font-size: 11px;
            color: var(--text-dim);
            text-align: center;
        }

        /* Context Menu */
        .lineage-context-menu {
            position: absolute;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            min-width: 180px;
            z-index: 1001;
            padding: 4px 0;
        }
        .lineage-context-menu .context-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 14px;
            font-size: 12px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.1s;
        }
        .lineage-context-menu .context-item:hover {
            background: var(--accent);
            color: white;
        }
        .lineage-context-menu .context-divider {
            height: 1px;
            background: var(--border-subtle);
            margin: 4px 0;
        }

        /* Bottom Legend Bar */
        .lineage-legend {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 100;
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 36px;
            padding: 8px 42px 8px 12px;
            border-top: 1px solid var(--border-subtle);
            background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            box-shadow: 0 -8px 20px rgba(0, 0, 0, 0.12);
            transition: transform 0.2s ease, opacity 0.2s ease;
        }
        .lineage-legend.is-hidden {
            transform: translateY(100%);
            opacity: 0;
            pointer-events: none;
        }
        .lineage-legend .legend-strip {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
            min-width: 0;
            overflow-x: auto;
            overflow-y: hidden;
            white-space: nowrap;
            scrollbar-width: thin;
            scrollbar-color: var(--scrollbar-thumb) transparent;
        }
        .lineage-legend .legend-inline-group {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
        .lineage-legend .legend-item {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--text-secondary);
        }
        .lineage-legend .legend-color {
            width: 10px;
            height: 10px;
            border-radius: 3px;
            flex-shrink: 0;
        }
        .lineage-legend .legend-table { background: var(--node-table); }
        .lineage-legend .legend-view { background: var(--node-view); }
        .lineage-legend .legend-cte { background: var(--accent); }
        .lineage-legend .legend-external { background: var(--node-external); }
        .lineage-legend .legend-label {
            color: var(--text-secondary);
        }
        .lineage-legend .legend-section-title {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: var(--text-dim);
            margin-right: 2px;
        }
        .lineage-legend .legend-divider {
            width: 1px;
            height: 18px;
            background: var(--border-subtle);
            flex-shrink: 0;
        }
        .lineage-legend .legend-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .lineage-legend .legend-primary { background: var(--warning-light); }
        .lineage-legend .legend-numeric { background: #60a5fa; }
        .lineage-legend .legend-text { background: #4ade80; }
        .lineage-legend .legend-datetime { background: #c084fc; }
        .lineage-legend .legend-json { background: #2dd4bf; }
        .lineage-legend .legend-keyboard-hints .hint-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: var(--text-muted);
        }
        .lineage-legend .legend-keyboard-hints .hint-divider {
            width: 1px;
            height: 12px;
            background: var(--border-subtle);
            flex-shrink: 0;
        }
        .lineage-legend .legend-keyboard-hints kbd {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 18px;
            height: 18px;
            padding: 0 4px;
            border-radius: var(--radius-sm);
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            font-size: 9px;
            font-weight: 600;
            font-family: inherit;
        }
        .lineage-legend .legend-dismiss {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            border: none;
            background: transparent;
            color: var(--text-muted);
            font-size: 16px;
            line-height: 1;
            width: 24px;
            height: 24px;
            border-radius: var(--radius-sm);
            cursor: pointer;
        }
        .lineage-legend .legend-dismiss:hover {
            color: var(--text-primary);
            background: var(--bg-tertiary);
        }
        .lineage-graph-container.lineage-legend-visible .lineage-zoom-controls {
            bottom: 68px;
        }
        .lineage-graph-container.lineage-legend-visible .lineage-minimap {
            bottom: 68px;
        }
        .lineage-graph-container.lineage-legend-visible .column-lineage-info {
            bottom: 74px;
        }

        /* Keyboard Shortcuts Hint */
        .keyboard-hints {
            position: absolute;
            bottom: 16px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 6px 12px;
            box-shadow: var(--shadow-md);
            z-index: 10;
            opacity: 0.85;
            transition: opacity 0.2s;
        }
        .keyboard-hints:hover {
            opacity: 1;
        }
        .keyboard-hints .hint-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--text-muted);
        }
        .keyboard-hints .hint-divider {
            width: 1px;
            height: 20px;
            background: var(--border-subtle);
        }
        .keyboard-hints kbd {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
            height: 24px;
            padding: 0 6px;
            background: var(--bg-tertiary);
            border: none;
            border-radius: var(--radius-sm);
            font-family: inherit;
            font-size: 10px;
            font-weight: 600;
            color: var(--text-secondary);
        }

        /* Mini-map */
        .lineage-minimap {
            position: absolute;
            bottom: 12px;
            right: 12px;
            width: 180px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-md);
            z-index: 100;
            overflow: hidden;
        }
        .lineage-minimap .minimap-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px;
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-subtle);
            font-size: 10px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .lineage-minimap .minimap-content {
            height: 120px;
            background: var(--bg-primary);
            cursor: pointer;
        }
        .lineage-minimap .minimap-svg {
            width: 100%;
            height: 100%;
        }
        .lineage-minimap .minimap-node {
            fill: var(--text-dim);
            opacity: 0.6;
        }
        .lineage-minimap .minimap-node-table { fill: var(--node-table); opacity: 0.8; }
        .lineage-minimap .minimap-node-view { fill: var(--node-view); opacity: 0.8; }
        .lineage-minimap .minimap-node-cte { fill: var(--accent); opacity: 0.8; }
        .lineage-minimap .minimap-node-external { fill: var(--node-external); opacity: 0.8; }
        .lineage-minimap .minimap-viewport {
            fill: rgba(99, 102, 241, 0.15);
            stroke: var(--accent);
            stroke-width: 2;
            cursor: move;
        }

        /* Graph Stats Divider */
        .graph-stats .stat-divider {
            color: var(--border-subtle);
            margin: 0 4px;
        }
        .graph-stats .stat.node-count {
            color: var(--text-secondary);
        }

        /* Empty States */
        .lineage-empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            text-align: center;
            color: var(--text-muted);
        }
        .lineage-empty-state .empty-illustration {
            margin-bottom: 24px;
            padding: 20px;
            background: var(--bg-secondary);
            border-radius: var(--radius-lg);
            border: 1px dashed var(--border-subtle);
        }
        .lineage-empty-state .empty-illustration svg {
            opacity: 1;
            margin-bottom: 0;
        }
        .lineage-empty-state svg {
            opacity: 0.5;
            margin-bottom: 20px;
        }
        .lineage-empty-state h3 {
            font-size: 20px;
            color: var(--text-primary);
            margin: 0 0 8px 0;
            font-weight: 600;
        }
        .lineage-empty-state p {
            margin: 4px 0;
            font-size: 14px;
            color: var(--text-secondary);
            max-width: 400px;
        }
        .lineage-empty-state .empty-steps {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin: 24px 0;
            text-align: left;
        }
        .lineage-empty-state .step {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
        }
        .lineage-empty-state .step-number {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            background: var(--accent);
            color: white;
            border-radius: 50%;
            font-size: 12px;
            font-weight: 600;
            flex-shrink: 0;
        }
        .lineage-empty-state .step-text {
            font-size: 13px;
            color: var(--text-secondary);
        }
        .lineage-empty-state .hint {
            font-size: 13px;
            color: var(--text-muted);
            margin-top: 16px;
            padding: 12px 16px;
            background: var(--bg-tertiary);
            border-radius: var(--radius-md);
            max-width: 420px;
        }

        .lineage-no-relations {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            text-align: center;
        }
        .lineage-no-relations .single-node {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 16px 24px;
            background: var(--bg-secondary);
            border: 2px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            margin-bottom: 20px;
        }
        .lineage-no-relations .node-icon { font-size: 24px; }
        .lineage-no-relations .node-name { font-size: 16px; font-weight: 600; color: var(--text-primary); }
        .lineage-no-relations .no-relations-msg {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }
        .lineage-no-relations .hint {
            font-size: 12px;
            color: var(--text-dim);
        }
        .lineage-no-relations .direction-suggestion {
            margin-top: 24px;
            text-align: center;
        }
        .lineage-no-relations .direction-suggestion p {
            font-size: 12px;
            color: var(--text-muted);
            margin-bottom: 12px;
        }
        .lineage-no-relations .suggestion-buttons {
            display: flex;
            justify-content: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .lineage-no-relations .node-type-badge {
            font-size: 11px;
            color: var(--text-muted);
            background: var(--bg-tertiary);
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            text-transform: uppercase;
        }
    `;
}

/**
 * Main layout and graph styles
 */
export function getGraphStyles(): string {
    return `
        /* ========== Stats Bar ========== */
        .stats-bar {
            display: flex; align-items: center; gap: 6px; padding: 8px 16px;
            background: var(--bg-secondary); border-bottom: 1px solid var(--border-subtle);
            font-size: 12px; color: var(--text-muted);
        }
        .stats-bar .stat { display: flex; align-items: center; gap: 4px; }
        .stats-bar .stat-value { font-weight: 600; color: var(--text-primary); }
        .stats-bar .separator { color: var(--text-dim); }
        .stats-spacer { flex: 1; }
        .index-status {
            display: inline-flex; align-items: center; gap: 6px;
            border: 1px solid var(--border-subtle);
            border-radius: 999px; padding: 4px 10px;
            background: var(--bg-primary); color: var(--text-secondary);
            font-size: 11px; cursor: pointer;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .index-status:hover {
            border-color: var(--border-color);
            color: var(--text-primary);
            background: var(--bg-tertiary);
        }
        .index-status .status-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: var(--text-dim);
        }
        .index-status-fresh .status-dot { background: var(--success); }
        .index-status-stale .status-dot { background: var(--warning); }
        .index-status-old .status-dot { background: var(--danger); }
        .index-status-missing .status-dot { background: var(--text-dim); }
        .workspace-legend-bar {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 20;
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 36px;
            padding: 8px 40px 8px 12px;
            background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
            border-top: 1px solid var(--border-subtle);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            box-shadow: 0 -8px 20px rgba(0, 0, 0, 0.12);
            font-size: 11px;
            color: var(--text-muted);
            transition: transform 0.2s ease, opacity 0.2s ease;
        }
        .workspace-legend-bar.is-hidden {
            transform: translateY(100%);
            opacity: 0;
            pointer-events: none;
        }
        .workspace-legend-bar .legend-scroll {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
            min-width: 0;
            overflow-x: auto;
            overflow-y: hidden;
            white-space: nowrap;
            scrollbar-width: thin;
            scrollbar-color: var(--scrollbar-thumb) transparent;
        }
        .legend-inline-group { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .legend-inline-item { display: inline-flex; align-items: center; gap: 6px; }
        .legend-inline-node {
            width: 12px; height: 12px; border-radius: 3px;
            border: 1px solid transparent; flex-shrink: 0;
        }
        .legend-inline-node.file { background: var(--node-file); border-color: var(--node-file-border); }
        .legend-inline-node.table { background: var(--node-table); border-color: var(--node-table-border); }
        .legend-inline-node.view { background: var(--node-view); border-color: var(--node-view-border); }
        .legend-inline-node.external { background: var(--node-external); border-color: var(--node-external-border); border-style: dashed; }
        .legend-inline-edge { width: 16px; height: 2px; border-radius: 2px; flex-shrink: 0; }
        .legend-inline-edge.select { background: var(--edge-select); }
        .legend-inline-edge.join { background: var(--edge-join); }
        .legend-inline-edge.insert { background: var(--edge-insert); }
        .legend-inline-edge.update { background: var(--edge-update); }
        .legend-inline-edge.delete { background: var(--edge-delete); }
        .workspace-legend-bar .legend-divider {
            width: 1px;
            height: 16px;
            background: var(--border-subtle);
            flex-shrink: 0;
        }
        .workspace-legend-bar .legend-dismiss {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            border: none;
            background: transparent;
            color: var(--text-muted);
            width: 24px;
            height: 24px;
            border-radius: var(--radius-sm);
            font-size: 16px;
            line-height: 1;
            cursor: pointer;
        }
        .workspace-legend-bar .legend-dismiss:hover {
            color: var(--text-primary);
            background: var(--bg-tertiary);
        }
        .workspace-legend-bar .hint-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            color: var(--text-muted);
            font-size: 10px;
        }
        .workspace-legend-bar kbd {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 18px;
            height: 18px;
            padding: 0 4px;
            border-radius: var(--radius-sm);
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            font-size: 9px;
            font-weight: 600;
            font-family: inherit;
        }
        .graph-area.graph-legend-visible .keyboard-hints {
            bottom: 70px;
        }

        /* ========== Issue Banner ========== */
        .issue-banner {
            display: flex; align-items: center; gap: 12px; padding: 10px 16px;
            border-bottom: 1px solid var(--border-subtle); font-size: 13px;
        }
        .issue-banner.warning { background: rgba(245, 158, 11, 0.1); }
        .issue-banner.success { background: rgba(16, 185, 129, 0.1); }
        .issue-banner-icon { flex-shrink: 0; }
        .issue-banner-text { flex: 1; }
        .issue-banner-text strong { color: var(--text-primary); }
        .issue-banner-btn {
            background: transparent; border: 1px solid var(--border-color);
            color: var(--text-secondary); padding: 5px 12px; border-radius: var(--radius-md);
            font-size: 12px; cursor: pointer; transition: all 0.15s;
        }
        .issue-banner-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }

        /* ========== Main Layout ========== */
        .main-layout { display: flex; flex: 1; overflow: hidden; position: relative; min-height: 0; }
        .graph-area { flex: 1; position: relative; overflow: hidden; min-height: 0; width: 100%; height: 100%; }
        #graph-container { position: relative; }
        .graph-empty-overlay {
            position: absolute; inset: 0;
            display: flex; align-items: center; justify-content: center;
            background: var(--overlay-scrim);
            backdrop-filter: blur(2px);
            z-index: 5;
        }
        .graph-empty-overlay.is-hidden { display: none; }
        .graph-empty-overlay .empty-state {
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 28px 24px;
            box-shadow: var(--shadow-lg);
            max-width: 560px;
            text-align: center;
        }
        .empty-state-desc { margin-top: 6px; max-width: 520px; }
        .empty-state-actions {
            display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px;
            justify-content: center;
        }
        .action-chip {
            background: var(--bg-tertiary); border: 1px solid var(--border-subtle);
            color: var(--text-secondary); padding: 6px 12px; border-radius: 999px;
            font-size: 12px; cursor: pointer; transition: all 0.15s;
        }
        .action-chip:hover { border-color: var(--accent); color: var(--text-primary); background: var(--bg-primary); }
        .action-chip-small { font-size: 11px; padding: 4px 10px; }

        /* ========== Sidebar ========== */
        .sidebar {
            width: 280px; background: var(--bg-secondary); border-left: 1px solid var(--border-subtle);
            display: flex; flex-direction: column; overflow: hidden;
            transition: width 0.2s, opacity 0.2s;
        }
        .sidebar.collapsed { width: 0; opacity: 0; pointer-events: none; }
        .sidebar-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; border-bottom: 1px solid var(--border-subtle);
        }
        .sidebar-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .sidebar-close {
            background: transparent; border: none; color: var(--text-muted);
            cursor: pointer; padding: 4px; border-radius: var(--radius-sm);
        }
        .sidebar-close:hover { color: var(--text-primary); background: var(--bg-tertiary); }
        .sidebar-content { flex: 1; overflow-y: auto; padding: 8px 0; }

        /* ========== Sidebar Sections ========== */
        .sidebar-section { margin-bottom: 8px; }
        .section-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 16px; cursor: pointer; user-select: none;
        }
        .section-header:hover { background: var(--bg-tertiary); }
        .section-title {
            display: flex; align-items: center; gap: 8px;
            font-size: 12px; font-weight: 600; color: var(--text-muted);
            text-transform: uppercase; letter-spacing: 0.5px;
        }
        .section-badge {
            background: var(--error); color: white; padding: 2px 6px;
            border-radius: 10px; font-size: 10px; font-weight: 600;
        }
        .section-badge.warning { background: var(--warning); }
        .section-toggle {
            color: var(--text-dim); font-size: 10px; transition: transform 0.2s;
        }
        .section-header.expanded .section-toggle { transform: rotate(180deg); }
        .section-content {
            max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out;
        }
        .section-header.expanded + .section-content { max-height: 400px; overflow-y: auto; }
        .selection-empty {
            color: var(--text-muted);
            font-size: 12px;
            padding: 6px 16px 10px;
        }
        .selection-details {
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 12px;
            padding: 0 16px 12px;
        }
        .selection-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
        }
        .selection-meta {
            color: var(--text-muted);
        }
        .selection-file {
            color: var(--text-secondary);
            font-size: 11px;
            word-break: break-all;
        }
        .selection-path {
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            background: var(--bg-secondary);
            padding: 8px 10px;
            display: grid;
            gap: 6px;
        }
        .selection-path-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: 11px;
        }
        .selection-path-row .path-label {
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }
        .selection-path-row .path-value {
            color: var(--text-secondary);
            text-align: right;
        }
        .selection-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        /* ========== Legend Items ========== */
        .legend-grid { padding: 8px 16px; }
        .legend-group { margin-bottom: 12px; }
        .legend-group:last-child { margin-bottom: 0; }
        .legend-group-title {
            font-size: 10px; font-weight: 600; color: var(--text-dim);
            text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
        }
        .legend-item {
            display: flex; align-items: center; gap: 10px;
            padding: 4px 0; font-size: 12px; color: var(--text-secondary);
        }
        .legend-node {
            width: 14px; height: 14px; border-radius: 3px; border: 2px solid;
            flex-shrink: 0;
        }
        .legend-node.file { background: var(--node-file); border-color: var(--node-file-border); }
        .legend-node.table { background: var(--node-table); border-color: var(--node-table-border); }
        .legend-node.view { background: var(--node-view); border-color: var(--node-view-border); }
        .legend-node.external { background: var(--node-external); border-color: var(--node-external-border); border-style: dashed; }
        .legend-edge { width: 20px; height: 3px; border-radius: 2px; flex-shrink: 0; }
        .legend-edge.select { background: var(--edge-select); }
        .legend-edge.join { background: var(--edge-join); }
        .legend-edge.insert { background: var(--edge-insert); }
        .legend-edge.update { background: var(--edge-update); }
        .legend-edge.delete { background: var(--edge-delete); }

        /* ========== Issue List ========== */
        .issue-list { padding: 0 12px 8px; }
        .issue-item {
            display: flex; align-items: center; gap: 10px; padding: 8px 10px;
            background: var(--bg-primary); border-radius: var(--radius-md);
            margin-bottom: 4px; cursor: pointer; transition: all 0.15s;
            border: 1px solid transparent;
        }
        .issue-item:hover { background: var(--bg-tertiary); border-color: var(--border-color); }
        .issue-item:last-child { margin-bottom: 0; }
        .issue-type {
            padding: 2px 6px; border-radius: 3px; font-size: 9px;
            font-weight: 700; text-transform: uppercase;
        }
        .issue-type.table { background: var(--node-table); color: white; }
        .issue-type.view { background: var(--node-view); color: white; }
        .issue-type.missing { background: var(--error); color: white; }
        .issue-info { flex: 1; min-width: 0; }
        .issue-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
        .issue-path { font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .issue-line { font-size: 10px; color: var(--text-dim); font-family: monospace; }
        .issue-more {
            text-align: center; padding: 8px; font-size: 11px; color: var(--text-dim);
        }

        /* ========== Export Dropdown ========== */
        .export-dropdown { padding: 8px 16px; position: relative; }
        .export-trigger {
            display: flex; align-items: center; gap: 10px; padding: 10px 12px;
            background: var(--bg-primary); border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md); color: var(--text-secondary);
            font-size: 12px; cursor: pointer; transition: all 0.15s; width: 100%;
        }
        .export-trigger:hover { background: var(--bg-tertiary); border-color: var(--border-color); color: var(--text-primary); }
        .export-trigger svg { width: 16px; height: 16px; flex-shrink: 0; }
        .export-menu {
            margin-top: 8px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-md);
            overflow: hidden;
        }
        .export-option {
            width: 100%;
            text-align: left;
            background: transparent;
            border: none;
            border-bottom: 1px solid var(--border-subtle);
            color: var(--text-secondary);
            font-size: 12px;
            padding: 8px 10px;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
        }
        .export-option:hover { background: var(--bg-hover); color: var(--text-primary); }
        .export-option:last-child { border-bottom: none; }
        .export-option-advanced { padding-left: 16px; color: var(--text-muted); }

        /* ========== Zoom Toolbar ========== */
        /* Positioned top-right to match common UI patterns and avoid content overlap */
        .zoom-toolbar {
            position: absolute; top: 16px; right: 16px;
            display: flex; align-items: center; gap: 4px;
            background: var(--bg-secondary); padding: 6px 10px;
            border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);
            box-shadow: var(--shadow-md); z-index: 10;
        }
        .zoom-btn {
            display: flex; align-items: center; justify-content: center;
            width: 28px; height: 28px; background: var(--bg-tertiary);
            border: none; border-radius: var(--radius-sm); color: var(--text-secondary);
            cursor: pointer; transition: all 0.15s; font-size: 14px;
        }
        .zoom-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .zoom-btn svg { width: 14px; height: 14px; }
        .zoom-divider { width: 1px; height: 20px; background: var(--border-subtle); margin: 0 4px; }
        .zoom-level {
            font-size: 11px; color: var(--text-muted); min-width: 40px;
            text-align: center; font-family: monospace;
        }

        /* ========== Graph Container ========== */
        /* Container for the graph SVG - matches Lineage view structure */
        #graph-container {
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
            background-color: var(--canvas-bg);
            background-image:
                radial-gradient(circle, var(--grid-color) 1px, transparent 1px),
                linear-gradient(to right, color-mix(in srgb, var(--grid-color) 35%, transparent) 1px, transparent 1px),
                linear-gradient(to bottom, color-mix(in srgb, var(--grid-color) 35%, transparent) 1px, transparent 1px);
            background-size: 24px 24px, 24px 24px, 24px 24px;
        }

        /* ========== SVG Container ========== */
        /* SVG without viewBox - uses manual transforms for zoom/pan (matches Lineage approach) */
        #graph-svg { width: 100%; height: 100%; cursor: grab; overflow: visible; }
        #graph-svg:active { cursor: grabbing; }

        /* ========== Node Styles ========== */
        .node { cursor: pointer; transition: opacity 0.2s; }
        .node .node-bg { fill: var(--node-fill); stroke: var(--node-border); stroke-width: 1; transition: stroke 0.15s; box-shadow: var(--shadow-node); }
        .node:hover .node-bg { stroke: var(--accent); stroke-width: 1.5; }
        .node.highlighted .node-bg { stroke: var(--warning-light); stroke-width: 3; }
        .node.dimmed { opacity: 0.25; }
        .node-search-match .node-bg { stroke: var(--accent); stroke-width: 3; }
        .node-search-match.node-focus-dim { opacity: 0.6; pointer-events: auto; }
        .node-search-dim { opacity: 0.18; }
        .node-selected .node-bg { stroke: var(--accent); stroke-width: 2; }
        .node-focus-dim { opacity: 0.12; pointer-events: none; }
        .node-trace-highlight .node-bg { stroke: var(--success); stroke-width: 3; }
        .node-trace-dim { opacity: 0.15; pointer-events: none; }
        .node .node-accent { transition: fill 0.15s; }
        .node-file .node-accent { fill: var(--node-file); }
        .node-table .node-accent { fill: var(--node-table); }
        .node-view .node-accent { fill: var(--node-view); }
        .node-external .node-accent { fill: var(--node-external); }
        .node-external .node-bg { stroke-dasharray: 5,3; }
        .node .node-icon-svg { color: var(--text-muted); }
        .node .node-icon-svg svg { width: 16px; height: 16px; display: block; }
        .node-label { fill: var(--node-text); font-size: 12px; font-weight: 600; }
        .node-sublabel { fill: var(--text-muted); font-size: 10px; }

        /* ========== Edge Styles ========== */
        .edge { fill: none; stroke-width: 1.5; cursor: pointer; transition: stroke 0.15s, stroke-width 0.15s; }
        .edge path { stroke: var(--edge-default); }
        .edge:hover path { stroke: var(--edge-hover); stroke-width: 2; }
        .edge-select path { stroke: var(--edge-select); }
        .edge-join path { stroke: var(--edge-join); }
        .edge-insert path { stroke: var(--edge-insert); }
        .edge-update path { stroke: var(--edge-update); }
        .edge-delete path { stroke: var(--edge-delete); }
        .edge-label { fill: var(--text-muted); font-size: 10px; }
        /* Arrow marker fills - CSS overrides inline fill for theme hot-swap */
        #arrowhead-select polygon { fill: var(--edge-select); }
        #arrowhead-join polygon { fill: var(--edge-join); }
        #arrowhead-insert polygon { fill: var(--edge-insert); }
        #arrowhead-update polygon { fill: var(--edge-update); }
        #arrowhead-delete polygon { fill: var(--edge-delete); }
        #arrowhead-subquery polygon { fill: var(--edge-subquery); }
        /* Edge highlight/dim styles for click-to-highlight feature */
        .edge.edge-highlighted path { opacity: 1; stroke-width: 3; stroke: var(--edge-hover); }
        .edge.edge-dimmed path { opacity: 0.2; }
        .edge-focus-dim path { opacity: 0.1; }
        .edge-trace-highlight path { stroke: var(--success); stroke-width: 3; opacity: 1; }
        .edge-trace-dim path { opacity: 0.1; }

        /* ========== Tooltip ========== */
        .tooltip {
            position: absolute; padding: 10px 14px; background: var(--bg-secondary);
            border: 1px solid var(--border-color); border-radius: var(--radius-lg);
            font-size: 12px; pointer-events: none; z-index: 1000; max-width: 320px;
            box-shadow: var(--shadow-lg);
        }
        .tooltip-title { font-weight: 600; margin-bottom: 6px; color: var(--text-primary); }
        .tooltip-content { color: var(--text-muted); line-height: 1.4; }
        .tooltip-list { margin-top: 8px; padding-left: 14px; }
        .tooltip-list li { margin: 3px 0; }

        /* ========== Empty State ========== */
        .empty-state {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 100%; gap: 16px; color: var(--text-muted);
        }
        .empty-state svg { width: 64px; height: 64px; opacity: 0.4; }
        .empty-state-title { font-size: 18px; font-weight: 600; color: var(--text-secondary); }

        /* ========== Keyboard Hints ========== */
        .kbd {
            background: var(--bg-primary); border: 1px solid var(--border-subtle);
            border-radius: 3px; padding: 2px 6px; font-family: monospace;
            font-size: 10px; color: var(--text-muted);
        }
        .shortcuts { padding: 8px 16px; }
        .shortcut-item {
            display: flex; align-items: center; gap: 10px;
            padding: 4px 0; font-size: 12px; color: var(--text-secondary);
        }
    `;
}

/**
 * Issues panel specific styles
 */
export function getIssuesPanelStyles(): string {
    return `
        /* Issues Panel Styles */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        * {
            scrollbar-width: thin;
            scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
        }
        *::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }
        *::-webkit-scrollbar-track {
            background: var(--scrollbar-track);
            border-radius: 8px;
        }
        *::-webkit-scrollbar-thumb {
            background: var(--scrollbar-thumb);
            border-radius: 8px;
            border: 2px solid transparent;
            background-clip: padding-box;
        }
        *::-webkit-scrollbar-thumb:hover {
            background: var(--scrollbar-thumb-hover);
            background-clip: padding-box;
        }
        body, html {
            width: 100%; height: 100vh; overflow: auto;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary); color: var(--text-secondary);
            font-size: 13px;
        }
        #app { width: 100%; min-height: 100%; display: flex; flex-direction: column; }

        /* Header */
        .header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 20px; background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
            position: sticky; top: 0; z-index: 100;
        }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .header-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
        .header-right { display: flex; align-items: center; gap: 12px; }

        .back-btn {
            display: flex; align-items: center; gap: 8px; padding: 8px 14px;
            background: var(--bg-tertiary); border: none; border-radius: var(--radius-md);
            color: var(--text-secondary); font-size: 13px; cursor: pointer;
            transition: all 0.15s;
        }
        .back-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .back-btn svg { width: 16px; height: 16px; }

        .issue-count {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
        }
        .issue-count.warning { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
        .issue-count.error { background: rgba(239, 68, 68, 0.15); color: var(--error); }
        .issue-count.success { background: rgba(16, 185, 129, 0.15); color: var(--success); }

        /* Summary Bar */
        .summary-bar {
            display: flex; gap: 16px; padding: 16px 20px;
            background: var(--bg-secondary); border-bottom: 1px solid var(--border-subtle);
        }
        .summary-card {
            flex: 1; padding: 16px 20px; background: var(--bg-primary);
            border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);
        }
        .summary-card-value { font-size: 28px; font-weight: 700; color: var(--text-primary); }
        .summary-card-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
        .summary-card.warning .summary-card-value { color: var(--warning); }
        .summary-card.error .summary-card-value { color: var(--error); }

        /* Content */
        .content { padding: 24px; max-width: 1000px; margin: 0 auto; width: 100%; }

        /* Section */
        .section { margin-bottom: 32px; }
        .section-header {
            display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
        }
        .section-icon {
            width: 36px; height: 36px; border-radius: var(--radius-md);
            display: flex; align-items: center; justify-content: center;
        }
        .section-icon.warning { background: rgba(245, 158, 11, 0.15); }
        .section-icon.error { background: rgba(239, 68, 68, 0.15); }
        .section-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
        .section-count {
            padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;
            background: var(--bg-tertiary); color: var(--text-muted);
        }
        .section-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

        /* List */
        .list { display: flex; flex-direction: column; gap: 8px; }
        .list-item {
            display: flex; align-items: center; gap: 14px; padding: 14px 18px;
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle); cursor: pointer;
            transition: all 0.15s;
        }
        .list-item:hover { background: var(--bg-tertiary); border-color: var(--border-color); transform: translateX(2px); }

        .item-type {
            padding: 4px 10px; border-radius: var(--radius-sm); font-size: 10px;
            font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .item-type.table { background: var(--node-table); color: #fff; }
        .item-type.view { background: var(--node-view); color: #fff; }

        .item-info { flex: 1; min-width: 0; }
        .item-name { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 3px; }
        .item-path {
            font-size: 12px; color: var(--text-muted); font-family: monospace;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .item-line {
            padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px;
            font-family: monospace; background: var(--bg-primary); color: var(--text-dim);
        }

        /* Missing Item Card */
        .missing-card {
            background: var(--bg-secondary); border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle); margin-bottom: 12px;
            overflow: hidden;
        }
        .missing-card-header {
            display: flex; align-items: center; gap: 12px;
            padding: 14px 18px; background: var(--bg-primary);
            border-bottom: 1px solid var(--border-subtle);
        }
        .missing-card-icon {
            width: 32px; height: 32px; border-radius: var(--radius-sm);
            background: rgba(239, 68, 68, 0.15); display: flex;
            align-items: center; justify-content: center;
        }
        .missing-card-name { font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1; }
        .missing-card-count {
            padding: 4px 10px; border-radius: 10px; font-size: 11px;
            background: var(--bg-tertiary); color: var(--text-muted);
        }
        .missing-card-refs { padding: 8px; }
        .missing-ref-item {
            display: flex; align-items: center; gap: 12px; padding: 10px 14px;
            border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s;
        }
        .missing-ref-item:hover { background: var(--bg-tertiary); }
        .missing-ref-path { flex: 1; font-size: 12px; color: var(--text-muted); font-family: monospace; }
        .missing-ref-line { font-size: 11px; color: var(--text-dim); font-family: monospace; }
        .missing-more { text-align: center; padding: 10px; font-size: 12px; color: var(--text-dim); }

        /* Empty State */
        .empty-state {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; padding: 80px 20px; text-align: center;
        }
        .empty-state-icon {
            width: 80px; height: 80px; border-radius: 50%;
            background: rgba(16, 185, 129, 0.1); display: flex;
            align-items: center; justify-content: center; margin-bottom: 24px;
        }
        .empty-state-icon svg { width: 40px; height: 40px; color: var(--success); }
        .empty-state-title { font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
        .empty-state-desc { font-size: 14px; color: var(--text-muted); max-width: 400px; }

        .list-more { text-align: center; padding: 16px; font-size: 13px; color: var(--text-dim); }
    `;
}

/**
 * State page styles (loading, empty, error, manual index)
 * @param dark - Whether to use dark theme (default: true)
 */
export function getStateStyles(dark: boolean = true): string {
    const colors = dark ? {
        bg: '#0f172a',
        text: '#e2e8f0',
        textMuted: '#94a3b8',
        border: '#334155',
        accent: '#6366f1',
        accentHover: '#818cf8',
        accentBg: 'rgba(99, 102, 241, 0.1)',
        mutedBg: 'rgba(100, 116, 139, 0.1)',
        muted: '#64748b',
        errorBg: 'rgba(239, 68, 68, 0.1)',
        error: '#ef4444',
        errorLight: '#f87171',
        secondary: '#334155',
        secondaryHover: '#475569'
    } : {
        bg: '#ffffff',
        text: '#1e293b',
        textMuted: '#64748b',
        border: '#e2e8f0',
        accent: '#4f46e5',
        accentHover: '#6366f1',
        accentBg: 'rgba(79, 70, 229, 0.1)',
        mutedBg: 'rgba(100, 116, 139, 0.08)',
        muted: '#94a3b8',
        errorBg: 'rgba(220, 38, 38, 0.1)',
        error: '#dc2626',
        errorLight: '#ef4444',
        secondary: '#f1f5f9',
        secondaryHover: '#e2e8f0'
    };

    return `
        /* State Page Styles - for loading, empty, error, manual index */
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            display: flex; justify-content: center; align-items: center;
            height: 100vh; background: ${colors.bg}; color: ${colors.text};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .loader-container { text-align: center; }
        .loader {
            width: 48px; height: 48px; border: 3px solid ${colors.border};
            border-top-color: ${colors.accent}; border-radius: 50%;
            animation: spin 1s linear infinite; margin: 0 auto 24px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loader-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
        .loader-subtitle { color: ${colors.textMuted}; font-size: 14px; }

        .container { text-align: center; max-width: 400px; padding: 20px; }
        .icon {
            width: 64px; height: 64px; margin: 0 auto 24px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
        }
        .icon svg { width: 32px; height: 32px; }
        .icon.accent { background: ${colors.accentBg}; }
        .icon.accent svg { color: ${colors.accent}; }
        .icon.muted { background: ${colors.mutedBg}; }
        .icon.muted svg { color: ${colors.muted}; }
        .icon.error { background: ${colors.errorBg}; }
        .icon.error svg { color: ${colors.error}; }
        .title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
        .title.error { color: ${colors.errorLight}; }
        .subtitle { color: ${colors.textMuted}; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
        .message { color: ${colors.textMuted}; font-size: 14px; margin-bottom: 24px; }
        .file-count { font-size: 32px; font-weight: 700; color: ${colors.accent}; margin-bottom: 8px; }
        .btn {
            padding: 12px 28px; background: ${colors.accent}; border: none;
            border-radius: 8px; color: white; font-size: 14px; font-weight: 500;
            cursor: pointer; transition: all 0.15s;
        }
        .btn:hover { background: ${colors.accentHover}; transform: translateY(-1px); }
        .btn.secondary {
            background: ${colors.secondary};
            color: ${dark ? 'white' : colors.text};
        }
        .btn.secondary:hover { background: ${colors.secondaryHover}; }
    `;
}

/**
 * Combined styles for main webview
 * @param dark - Whether to use dark theme (default: true)
 */
export function getWebviewStyles(dark: boolean = true): string {
    return [
        getCssVariables(dark),
        getBaseStyles(),
        getContextMenuStyles(),
        getLineagePanelStyles(),
        getSharedViewStyles(),
        getTableListStyles(),
        getImpactFormStyles(),
        getLineageVisualStyles(),
        getLineageGraphStyles(),
        getLineageNodeStyles(),
        getGraphStyles()
    ].join('\n');
}

/**
 * Combined styles for issues webview (with CSS variables)
 * @param dark - Whether to use dark theme (default: true)
 */
export function getIssuesStyles(dark: boolean = true): string {
    return [
        getCssVariables(dark),
        getIssuesPanelStyles()
    ].join('\n');
}
