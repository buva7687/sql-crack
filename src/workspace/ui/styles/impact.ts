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
        .typeahead-loading {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 12px; font-size: 12px; color: var(--text-muted);
        }
        .loading-spinner-small {
            width: 14px; height: 14px;
            border: 2px solid var(--border-subtle);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
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
        .report-target .cross-link-actions {
            margin-top: 10px;
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
        .transitive-group.severity-critical { border-left-color: var(--error); }
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
        .view-skeleton {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
        }
        .view-skeleton-header,
        .view-skeleton-search,
        .view-skeleton-card,
        .view-skeleton-field,
        .view-skeleton-button {
            background: var(--bg-secondary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            animation: skeleton-pulse 1.4s ease-in-out infinite;
        }
        .view-skeleton-header {
            height: 36px;
            width: 52%;
        }
        .view-skeleton-lineage .view-skeleton-header {
            width: 44%;
        }
        .view-skeleton-impact .view-skeleton-header {
            width: 30%;
        }
        .view-skeleton-search {
            height: 42px;
            width: 100%;
        }
        .view-skeleton-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 10px;
        }
        .view-skeleton-card {
            height: 76px;
        }
        .view-skeleton-form {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 10px;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            background: var(--bg-primary);
        }
        .view-skeleton-field {
            height: 44px;
        }
        .view-skeleton-actions {
            display: flex;
            gap: 10px;
            padding-top: 4px;
        }
        .view-skeleton-button {
            height: 36px;
            flex: 1;
        }
        .view-skeleton-button.secondary {
            flex: 0.55;
        }
        @keyframes skeleton-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `;
}
