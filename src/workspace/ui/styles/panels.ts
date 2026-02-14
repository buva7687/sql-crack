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
        .view-filter-select {
            min-width: 150px;
            padding: 6px 10px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 12px;
            outline: none;
            cursor: pointer;
        }
        .view-filter-select:hover {
            border-color: var(--accent);
        }
        .view-filter-select:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        /* Quick Filter Chips */
        .view-quick-filters {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        .view-sort-group {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
        }
        .view-sort-group .view-filter-label {
            margin: 0;
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
        @media (max-width: 760px) {
            .view-sort-group {
                margin-left: 0;
                width: 100%;
                justify-content: flex-start;
            }
            .view-filter-select {
                min-width: 0;
                flex: 1;
            }
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
        .lineage-popular-section {
            margin-bottom: 10px;
        }
        .lineage-popular-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
        }
        .lineage-popular-header h4 {
            margin: 0;
            font-size: 12px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .lineage-popular-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 10px;
        }
        .lineage-show-all-btn {
            border: 1px solid var(--border-subtle);
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            border-radius: var(--radius-md);
            font-size: 12px;
            font-weight: 500;
            padding: 6px 10px;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .lineage-show-all-btn:hover {
            border-color: var(--accent);
            color: var(--accent);
            background: var(--bg-hover);
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
        .lineage-table-item.connection-high,
        .popular-item.connection-high {
            border-left: 3px solid var(--accent);
        }
        .lineage-table-item.connection-medium,
        .popular-item.connection-medium {
            border-left: 3px solid var(--warning);
        }
        .lineage-table-item.connection-low,
        .popular-item.connection-low {
            border-left: 3px solid var(--success);
        }
        .lineage-table-item.connection-none,
        .popular-item.connection-none {
            border-left: 3px solid var(--border-subtle);
            opacity: 0.9;
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
        .cross-link-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .cross-link-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle);
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .cross-link-btn svg {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
        .cross-link-btn:hover {
            border-color: var(--accent);
            color: var(--accent);
            background: var(--bg-hover);
        }
        .cross-link-btn.icon-only {
            width: 30px;
            height: 30px;
            padding: 0;
            border-radius: var(--radius-sm);
        }
        .cross-link-btn.icon-only span {
            display: none;
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
        .form-hint {
            margin: 6px 0 0;
            font-size: 11px;
            color: var(--text-dim);
        }
        .form-hint.hidden { display: none; }
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
            font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .item-line {
            padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px;
            font-family: var(--font-mono); background: var(--bg-primary); color: var(--text-dim);
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
        .missing-ref-path { flex: 1; font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
        .missing-ref-line { font-size: 11px; color: var(--text-dim); font-family: var(--font-mono); }
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
        textMuted: '#71717a',
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
