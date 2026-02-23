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
            font-family: var(--font-mono); font-size: 11px;
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
