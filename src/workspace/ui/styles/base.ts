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
        .icon-btn.btn-disabled { opacity: 0.35; cursor: default; pointer-events: none; }

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
        .search-count { font-size: 11px; color: var(--text-dim); white-space: nowrap; }

        /* ========== View Mode Tabs ========== */
        .view-tabs {
            display: flex; align-items: center; gap: 2px;
            background: var(--bg-primary); padding: 3px; border-radius: var(--radius-lg);
            border: 1px solid var(--border-color);
        }
        .view-tab {
            padding: 6px 12px; border: 1px solid var(--border-subtle); background: var(--bg-secondary);
            color: var(--text-muted); font-size: 12px; font-weight: 500;
            border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s;
            white-space: nowrap;
        }
        .view-tab:hover { color: var(--text-secondary); background: var(--bg-tertiary); border-color: var(--border-color); }
        .view-tab.active {
            background: var(--accent); color: white; border-color: var(--accent);
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
        .help-tooltip-hint {
            font-size: 10px;
            color: var(--text-dim);
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px solid var(--border-subtle);
            font-style: italic;
        }

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
