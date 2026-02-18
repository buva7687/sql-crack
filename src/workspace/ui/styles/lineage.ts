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
            flex-wrap: wrap;
            margin-bottom: 20px; padding-bottom: 12px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .explorer-header .cross-link-actions {
            margin-left: auto;
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
            font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);
        }
        .badge-primary, .badge-not-null {
            font-size: 9px; font-weight: 600; padding: 2px 4px;
            border-radius: var(--radius-sm); margin-top: 2px;
        }
        .badge-primary {
            background: var(--accent); color: var(--text-on-accent);
        }
        .badge-not-null {
            background: var(--warning); color: var(--text-on-accent);
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
        .connection-count.has-connections { background: var(--accent); color: var(--text-on-accent); }
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
