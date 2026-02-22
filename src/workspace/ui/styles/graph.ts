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
            flex-wrap: wrap;
            gap: 10px;
            padding: 12px 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-subtle);
            flex-shrink: 0;
        }
        .graph-header .cross-link-actions {
            margin-left: auto;
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

        /* Direction Controls (inline in header) */
        .direction-controls {
            display: flex;
            gap: 3px;
        }
        .direction-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            background: var(--bg-primary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 11px;
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
        .direction-btn svg { width: 14px; height: 14px; }

        /* Graph Container */
        .lineage-graph-container {
            flex: 1;
            min-height: 0;
            overflow: hidden;
            --lineage-legend-height: 0px;
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
            bottom: calc(18px + clamp(0px, var(--lineage-legend-height), 96px));
            left: 16px;
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 10px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-md);
            z-index: 130;
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
            font-family: var(--font-mono);
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
            fill: var(--lineage-coltype-numeric);
        }
        .lineage-node .column-dot.type-text {
            fill: var(--lineage-coltype-text);
        }
        .lineage-node .column-dot.type-datetime {
            fill: var(--lineage-coltype-datetime);
        }
        .lineage-node .column-dot.type-boolean {
            fill: var(--lineage-coltype-boolean);
        }
        .lineage-node .column-dot.type-binary {
            fill: var(--lineage-coltype-binary);
        }
        .lineage-node .column-dot.type-json {
            fill: var(--lineage-coltype-json);
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
            font-family: var(--font-mono);
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
        .lineage-node .column-close-btn .column-close-btn-circle {
            fill: var(--lineage-close-btn-bg);
            transition: fill 0.15s;
        }
        .lineage-node .column-close-btn .column-close-btn-icon {
            stroke: var(--lineage-close-btn-icon);
        }
        .lineage-node .column-close-btn:hover .column-close-btn-circle {
            fill: var(--lineage-close-btn-bg-hover);
        }
        .lineage-node .count-badge {
            font-size: 10px;
            fill: var(--text-muted);
        }
        .lineage-node .column-limit-note {
            font-size: 10px;
            fill: var(--text-muted);
            pointer-events: none;
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
            fill: var(--lineage-row-odd-bg);
        }
        .lineage-node .column-row .column-row-bg.even {
            fill: var(--lineage-row-even-bg);
        }
        .lineage-node .column-row:hover {
            opacity: 1;
        }
        .lineage-node .column-row:hover .column-row-bg {
            fill: var(--lineage-row-hover-bg);
        }
        .lineage-node .column-row:focus-visible .column-row-bg {
            fill: var(--lineage-row-focus-bg);
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
            fill: var(--column-edge-upstream);
        }
        .lineage-node.downstream .column-row.in-path .column-state {
            fill: var(--column-edge-downstream);
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
            bottom: calc(22px + clamp(0px, var(--lineage-legend-height), 96px));
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 12px 16px;
            box-shadow: var(--shadow-lg);
            z-index: 130;
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
            font-family: var(--font-mono);
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
            color: var(--column-edge-upstream);
        }
        .column-lineage-info .info-stats .stat.downstream {
            color: var(--column-edge-downstream);
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
        .lineage-edge-transform { stroke: var(--warning); }
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
            stroke: var(--column-edge-upstream);
            stroke-dasharray: 4, 2;
        }
        .column-edge-downstream {
            stroke: var(--column-edge-downstream);
            stroke-dasharray: 4, 2;
        }
        #column-arrowhead-upstream polygon { fill: var(--column-edge-upstream); }
        #column-arrowhead-downstream polygon { fill: var(--column-edge-downstream); }

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
        .lineage-legend .legend-numeric { background: var(--lineage-coltype-numeric); }
        .lineage-legend .legend-text { background: var(--lineage-coltype-text); }
        .lineage-legend .legend-datetime { background: var(--lineage-coltype-datetime); }
        .lineage-legend .legend-json { background: var(--lineage-coltype-json); }
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
        .keyboard-hints.is-hidden {
            display: none;
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
            bottom: calc(18px + clamp(0px, var(--lineage-legend-height), 96px));
            right: 12px;
            width: 180px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-md);
            z-index: 130;
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
            fill: var(--lineage-minimap-viewport-fill);
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
        .graph-stats .stat.depth-indicator {
            color: var(--text-muted);
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
        .index-status-old .status-dot { background: var(--error); }
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
        .legend-shortcuts-group {
            position: relative;
        }
        .legend-shortcuts-toggle {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            border: 1px solid var(--border-subtle);
            background: var(--bg-tertiary);
            color: var(--text-muted);
            font-size: 10px;
            font-weight: 500;
            padding: 3px 8px;
            border-radius: var(--radius-sm);
            cursor: pointer;
            white-space: nowrap;
        }
        .legend-shortcuts-toggle:hover {
            color: var(--text-primary);
            border-color: var(--border-color);
        }
        .legend-shortcuts-panel {
            position: fixed;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 8px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            white-space: nowrap;
            z-index: 1000;
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
        .action-chip.active { border-color: var(--accent); color: var(--accent); background: var(--bg-primary); }
        .action-chip.btn-disabled { opacity: 0.45; pointer-events: none; }
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
        .sidebar-section[data-sidebar-section="selection"] + .sidebar-section[data-sidebar-section="export"] { margin-top: 12px; }
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
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }
        .section-header.expanded + .section-content {
            max-height: 1400px;
            overflow: visible;
        }
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
        .expand-more-btn {
            background: none;
            border: none;
            color: var(--accent);
            cursor: pointer;
            font-size: inherit;
            font-family: inherit;
            padding: 0;
            text-decoration: underline;
            text-decoration-style: dotted;
            text-underline-offset: 2px;
        }
        .expand-more-btn:hover {
            color: var(--accent-hover, var(--accent));
            text-decoration-style: solid;
        }
        .selection-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .selection-path-summary {
            font-size: 11px;
            color: var(--text-secondary);
            padding: 2px 0;
        }
        .selection-path-targets {
            display: grid;
            gap: 4px;
        }
        .selection-path-target {
            font-size: 11px;
            color: var(--text-muted);
            font-family: var(--font-mono);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .selection-cross-links {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .selection-divider {
            border-top: 1px solid var(--border-subtle);
            margin-top: 2px;
            padding-top: 8px;
        }
        .selection-actions-label {
            font-size: 10px;
            font-weight: 600;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .selection-edge-ref {
            display: flex;
            flex-direction: column;
            gap: 3px;
            padding: 6px 4px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .selection-edge-ref:last-child {
            border-bottom: none;
        }
        .selection-edge-ref-path {
            color: var(--text-secondary);
            font-family: var(--font-mono);
            font-size: 11px;
            word-break: break-all;
        }
        .selection-edge-ref-meta {
            color: var(--text-muted);
            font-size: 10px;
        }
        .selection-edge-empty {
            color: var(--text-dim);
            font-size: 11px;
            padding: 4px 2px;
        }
        .selection-edge-expand-btn {
            background: none;
            border: 1px solid var(--border-color);
            color: var(--accent);
            font-size: 11px;
            padding: 4px 8px;
            margin-top: 4px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            text-align: center;
        }
        .selection-edge-expand-btn:hover {
            background: var(--bg-hover);
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
        .issue-line { font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); }
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
        .export-option-advanced { padding-left: 10px; color: var(--text-secondary); }

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
        .zoom-toolbar.is-hidden {
            display: none;
        }
        .zoom-divider { width: 1px; height: 20px; background: var(--border-subtle); margin: 0 4px; }
        .zoom-level {
            font-size: 11px; color: var(--text-muted); min-width: 40px;
            text-align: center; font-family: var(--font-mono);
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
        .node-search-current .node-bg { stroke: var(--warning-light); stroke-width: 3.5; }
        .node-search-current.node-focus-dim { opacity: 0.7; pointer-events: auto; }
        .node-search-dim { opacity: 0.18; }
        .node-selected .node-bg { stroke: var(--accent); stroke-width: 2; }
        .node-focus-dim { opacity: 0.12; pointer-events: none; }
        .node-trace-highlight .node-bg { stroke: var(--success); stroke-width: 3; }
        .node-trace-origin .node-bg { stroke: var(--accent); stroke-width: 3.5; }
        .node-trace-near .node-bg { stroke: var(--success); stroke-width: 2.5; opacity: 1; }
        .node-trace-far .node-bg { stroke: var(--success); stroke-width: 2; }
        .node-trace-far { opacity: 0.6; }
        .node-trace-dim { opacity: 0.15; pointer-events: none; }
        .node-path-highlight .node-bg { stroke: color-mix(in srgb, var(--warning-light) 70%, var(--accent)); stroke-width: 3; }
        .node-path-origin .node-bg { stroke: var(--accent); stroke-width: 3.5; }
        .node-path-target .node-bg { stroke: var(--warning-light); stroke-width: 3.5; }
        .node-path-dim { opacity: 0.14; }
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
        .edge-path-highlight path { stroke: color-mix(in srgb, var(--warning-light) 65%, var(--accent)); stroke-width: 3.2; opacity: 1; }
        .edge-path-dim path { opacity: 0.12; }

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
            border-radius: 3px; padding: 2px 6px; font-family: var(--font-mono);
            font-size: 10px; color: var(--text-muted);
        }
        .shortcuts { padding: 8px 16px; }
        .shortcut-item {
            display: flex; align-items: center; gap: 10px;
            padding: 4px 0; font-size: 12px; color: var(--text-secondary);
        }
    `;
}
