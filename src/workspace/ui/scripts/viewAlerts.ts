/**
 * Script fragment: actionable workspace error and guidance cards.
 */
export function getWorkspaceViewAlertsScriptFragment(): string {
    return `
        function getWorkspaceReasonMeta(reason) {
            switch (reason) {
                case 'stale_index':
                    return {
                        title: 'Index may be stale',
                        description: 'Files changed after the last workspace index build. Refresh the index and retry.',
                        actions: ['refresh-index', 'focus-current-search']
                    };
                case 'parse_error':
                    return {
                        title: 'Some SQL files could not be parsed',
                        description: 'The workspace graph may be incomplete. Refresh the index or review issues for parser failures.',
                        actions: ['refresh-index', 'view-issues', 'focus-current-search']
                    };
                case 'excluded_file':
                    return {
                        title: 'Object is outside the current workspace scope',
                        description: 'Expand the workspace scope or analyze the parent folder to include this object.',
                        actions: ['show-graph', 'focus-current-search']
                    };
                case 'external_unresolved':
                    return {
                        title: 'External object is not defined in this workspace',
                        description: 'Only relationships visible inside the indexed workspace can be traced for external references.',
                        actions: ['show-graph', 'focus-current-search']
                    };
                default:
                    return {
                        title: 'Object is not available yet',
                        description: 'Refresh the index or try a different object from search.',
                        actions: ['refresh-index', 'focus-current-search']
                    };
            }
        }

        function renderWorkspaceActionButtons(actions) {
            return (actions || []).map((action) => {
                if (action === 'refresh-index') {
                    return '<button type="button" class="action-chip" data-workspace-alert-action="refresh-index">Refresh Index</button>';
                }
                if (action === 'view-issues') {
                    return '<button type="button" class="action-chip" data-workspace-alert-action="view-issues">View Issues</button>';
                }
                if (action === 'show-graph') {
                    return '<button type="button" class="action-chip" data-workspace-alert-action="show-graph">Go to Graph</button>';
                }
                if (action === 'focus-current-search') {
                    return '<button type="button" class="action-chip" data-workspace-alert-action="focus-current-search">Try Another Search</button>';
                }
                return '';
            }).join('');
        }

        function createWorkspaceAlertHtml(message, reason, fallbackTitle) {
            const meta = getWorkspaceReasonMeta(reason);
            const title = meta.title || fallbackTitle || 'Unable to load this view';
            const description = meta.description || '';
            const safeMessage = escapeHtml(message || '');
            return '<div class="workspace-alert-card">' +
                '<div class="workspace-alert-header">' +
                    '<h3>' + escapeHtml(title) + '</h3>' +
                '</div>' +
                '<p class="workspace-alert-message">' + safeMessage + '</p>' +
                (description ? '<p class="workspace-alert-hint">' + escapeHtml(description) + '</p>' : '') +
                '<div class="workspace-alert-actions">' + renderWorkspaceActionButtons(meta.actions) + '</div>' +
            '</div>';
        }

        function showWorkspaceAlert(container, message, reason, fallbackTitle) {
            if (!container) {
                return;
            }
            container.innerHTML = createWorkspaceAlertHtml(message, reason, fallbackTitle);
        }

        document.addEventListener('click', (event) => {
            if (!(event.target instanceof Element)) {
                return;
            }
            const actionEl = event.target.closest('[data-workspace-alert-action]');
            if (!actionEl) {
                return;
            }
            const action = actionEl.getAttribute('data-workspace-alert-action') || '';
            if (action === 'refresh-index') {
                refresh();
                return;
            }
            if (action === 'view-issues') {
                vscode.postMessage({ command: 'switchView', view: 'issues' });
                return;
            }
            if (action === 'show-graph') {
                switchToView('graph');
                return;
            }
            if (action === 'focus-current-search') {
                if (typeof focusWorkspaceSearchTarget === 'function') {
                    focusWorkspaceSearchTarget(currentViewMode);
                }
            }
        });
    `;
}
