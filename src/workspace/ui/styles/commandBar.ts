export function getWorkspaceCommandBarStyles(): string {
    return `
        .workspace-command-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            padding: 0 12px;
            height: 34px;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            background: var(--bg-secondary);
            color: var(--text-secondary);
            cursor: pointer;
            transition: border-color 0.2s ease, background 0.2s ease;
        }
        .workspace-command-btn:hover {
            border-color: var(--accent);
            color: var(--text-primary);
        }
        .workspace-command-btn kbd {
            font: inherit;
            font-size: 11px;
            color: var(--text-dim);
        }
        .workspace-command-overlay {
            position: fixed;
            inset: 0;
            display: none;
            align-items: flex-start;
            justify-content: center;
            padding: 12vh 20px 20px;
            background: var(--overlay-scrim);
            backdrop-filter: blur(10px);
            z-index: 2000;
        }
        .workspace-command-overlay.is-visible {
            display: flex;
        }
        .workspace-command-dialog {
            width: min(640px, 100%);
            background: var(--bg-primary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
            overflow: hidden;
        }
        .workspace-command-input {
            width: 100%;
            padding: 16px 18px;
            border: none;
            border-bottom: 1px solid var(--border-subtle);
            background: transparent;
            color: var(--text-primary);
            font-size: 15px;
            outline: none;
        }
        .workspace-command-results {
            display: flex;
            flex-direction: column;
            padding: 8px;
            gap: 6px;
            max-height: 340px;
            overflow-y: auto;
        }
        .workspace-command-item {
            display: flex;
            align-items: center;
            width: 100%;
            padding: 12px 14px;
            border: none;
            border-radius: var(--radius-md);
            background: transparent;
            color: var(--text-primary);
            text-align: left;
            cursor: pointer;
        }
        .workspace-command-item:hover,
        .workspace-command-item.is-active {
            background: var(--bg-tertiary);
        }
        .workspace-command-label {
            font-size: 14px;
            font-weight: 500;
        }
        .workspace-alert-card {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 18px;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-subtle);
            background: var(--bg-secondary);
        }
        .workspace-alert-card h3 {
            margin: 0;
            color: var(--text-primary);
            font-size: 16px;
        }
        .workspace-alert-message,
        .workspace-alert-hint {
            margin: 0;
            color: var(--text-secondary);
            line-height: 1.5;
        }
        .workspace-alert-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        @media (max-width: 760px) {
            .workspace-command-btn kbd {
                display: none;
            }
            .workspace-command-overlay {
                padding-top: 8vh;
            }
        }
    `;
}
