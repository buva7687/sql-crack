/**
 * Script fragment: shared workspace command/search overlay.
 */
export function getWorkspaceCommandBarScriptFragment(): string {
    return `
        const workspaceCommandBtn = document.getElementById('btn-workspace-command');
        const workspaceCommandOverlay = document.getElementById('workspace-command-overlay');
        const workspaceCommandInput = document.getElementById('workspace-command-input');
        const workspaceCommandResults = document.getElementById('workspace-command-results');

        function focusWorkspaceSearchTarget(preferredView) {
            const targetView = preferredView || currentViewMode;
            if (targetView === 'graph') {
                searchInput?.focus();
                searchInput?.select();
                return true;
            }
            if (targetView === 'lineage') {
                const input = document.getElementById('lineage-search-input');
                if (input) {
                    input.focus();
                    input.select?.();
                    return true;
                }
            }
            if (targetView === 'impact') {
                const input = document.getElementById('impact-table-input');
                if (input) {
                    input.focus();
                    input.select?.();
                    return true;
                }
            }
            return false;
        }

        function getWorkspaceCommandItems() {
            return [
                { id: 'focus-search', label: 'Focus current view search', keywords: 'search find focus', action: () => focusWorkspaceSearchTarget(currentViewMode) },
                { id: 'switch-graph', label: 'Switch to Graph view', keywords: 'graph dependencies files tables', action: () => switchToView('graph') },
                { id: 'switch-lineage', label: 'Switch to Lineage view', keywords: 'lineage trace dependencies upstream downstream', action: () => switchToView('lineage') },
                { id: 'switch-impact', label: 'Switch to Impact view', keywords: 'impact analysis schema change', action: () => switchToView('impact') },
                { id: 'refresh-index', label: 'Refresh workspace index', keywords: 'refresh reindex rebuild', action: () => refresh() },
                { id: 'focus-graph-search', label: 'Focus Graph search', keywords: 'graph search nodes', action: () => { switchToView('graph'); setTimeout(() => focusWorkspaceSearchTarget('graph'), 0); } },
                { id: 'focus-lineage-search', label: 'Focus Lineage search', keywords: 'lineage search table view', action: () => { switchToView('lineage'); setTimeout(() => focusWorkspaceSearchTarget('lineage'), 0); } },
                { id: 'focus-impact-target', label: 'Focus Impact target search', keywords: 'impact search table view', action: () => { switchToView('impact'); setTimeout(() => focusWorkspaceSearchTarget('impact'), 0); } },
            ];
        }

        function scoreWorkspaceCommand(item, query) {
            const trimmed = (query || '').trim().toLowerCase();
            if (!trimmed) {
                return 1;
            }
            const haystack = (item.label + ' ' + item.keywords).toLowerCase();
            if (haystack.startsWith(trimmed)) {
                return 1000 - haystack.length;
            }
            if (haystack.includes(trimmed)) {
                return 500 - haystack.indexOf(trimmed);
            }
            let score = 0;
            let cursor = 0;
            for (let i = 0; i < trimmed.length; i++) {
                const idx = haystack.indexOf(trimmed[i], cursor);
                if (idx < 0) {
                    return -1;
                }
                score += idx === cursor ? 25 : 8;
                if (idx === 0 || haystack[idx - 1] === ' ') {
                    score += 20;
                }
                cursor = idx + 1;
            }
            return score;
        }

        function renderWorkspaceCommandResults() {
            if (!workspaceCommandResults) {
                return;
            }
            const query = workspaceCommandInput ? workspaceCommandInput.value : '';
            const items = getWorkspaceCommandItems()
                .map((item) => ({ item, score: scoreWorkspaceCommand(item, query) }))
                .filter((entry) => entry.score >= 0)
                .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
                .slice(0, 8);

            workspaceCommandResults.innerHTML = items.map((entry, index) =>
                '<button type="button" class="workspace-command-item' + (index === 0 ? ' is-active' : '') + '" data-command-id="' + escapeHtmlAttr(entry.item.id) + '">' +
                    '<span class="workspace-command-label">' + escapeHtml(entry.item.label) + '</span>' +
                '</button>'
            ).join('');
        }

        function setWorkspaceCommandBarVisible(visible) {
            if (!workspaceCommandOverlay) {
                return;
            }
            workspaceCommandOverlay.classList.toggle('is-visible', visible);
            workspaceCommandOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
            if (visible) {
                renderWorkspaceCommandResults();
                workspaceCommandInput?.focus();
                workspaceCommandInput?.select();
            } else if (workspaceCommandInput) {
                workspaceCommandInput.value = '';
            }
        }

        function executeWorkspaceCommand(commandId) {
            const item = getWorkspaceCommandItems().find((entry) => entry.id === commandId);
            if (!item) {
                return;
            }
            setWorkspaceCommandBarVisible(false);
            item.action();
        }

        workspaceCommandBtn?.addEventListener('click', () => {
            setWorkspaceCommandBarVisible(true);
        });

        workspaceCommandInput?.addEventListener('input', () => {
            renderWorkspaceCommandResults();
        });

        workspaceCommandInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setWorkspaceCommandBarVisible(false);
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                const activeItem = workspaceCommandResults?.querySelector('.workspace-command-item');
                const commandId = activeItem?.getAttribute('data-command-id');
                if (commandId) {
                    executeWorkspaceCommand(commandId);
                }
            }
        });

        workspaceCommandResults?.addEventListener('click', (event) => {
            const button = event.target.closest('.workspace-command-item');
            const commandId = button?.getAttribute('data-command-id');
            if (commandId) {
                executeWorkspaceCommand(commandId);
            }
        });

        workspaceCommandOverlay?.addEventListener('click', (event) => {
            if (event.target === workspaceCommandOverlay) {
                setWorkspaceCommandBarVisible(false);
            }
        });

        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setWorkspaceCommandBarVisible(true);
            }
        });

        document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-workspace-command-action]');
            const commandId = trigger?.getAttribute('data-workspace-command-action');
            if (commandId) {
                executeWorkspaceCommand(commandId);
            }
        });
    `;
}
