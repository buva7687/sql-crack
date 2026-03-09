/**
 * Script fragment: persisted workspace webview state helpers.
 */
export function getPersistedWorkspaceStateScriptFragment(): string {
    return `
        function getWorkspacePersistedState() {
            return vscode.getState() || {};
        }

        function updateWorkspacePersistedState(patch) {
            const previous = getWorkspacePersistedState();
            const next = Object.assign({}, previous, patch || {});
            vscode.setState(next);
            return next;
        }

        function getPersistedGraphSelectionId() {
            const state = getWorkspacePersistedState();
            return typeof state.workspaceGraphSelectionId === 'string' && state.workspaceGraphSelectionId
                ? state.workspaceGraphSelectionId
                : null;
        }

        function persistGraphSelectionId(nodeId) {
            updateWorkspacePersistedState({
                workspaceGraphSelectionId: typeof nodeId === 'string' && nodeId ? nodeId : null
            });
        }

        function getPersistedGraphUiState() {
            const state = getWorkspacePersistedState();
            const saved = state.workspaceGraphUiState;
            if (!saved || typeof saved !== 'object') {
                return null;
            }
            return saved;
        }

        function persistGraphUiState(nextState) {
            updateWorkspacePersistedState({
                workspaceGraphUiState: nextState && typeof nextState === 'object' ? nextState : null
            });
        }

        function getPersistedViewStates() {
            const state = getWorkspacePersistedState();
            const saved = state.workspaceViewStates;
            if (!saved || typeof saved !== 'object') {
                return null;
            }
            return saved;
        }

        function persistViewStates(nextState) {
            updateWorkspacePersistedState({
                workspaceViewStates: nextState && typeof nextState === 'object' ? nextState : null
            });
        }

        function getPersistedLineageSearchState() {
            const state = getWorkspacePersistedState();
            const saved = state.workspaceLineageSearchState;
            if (!saved || typeof saved !== 'object') {
                return null;
            }
            return saved;
        }

        function persistLineageSearchState(nextState) {
            if (!nextState || typeof nextState !== 'object') {
                return;
            }
            updateWorkspacePersistedState({ workspaceLineageSearchState: nextState });
        }

        function getPersistedImpactDraft() {
            const state = getWorkspacePersistedState();
            const saved = state.workspaceImpactDraft;
            if (!saved || typeof saved !== 'object') {
                return null;
            }
            return saved;
        }

        function persistImpactDraft(nextDraft) {
            updateWorkspacePersistedState({ workspaceImpactDraft: nextDraft || null });
        }

        function clearPersistedImpactResult() {
            updateWorkspacePersistedState({
                workspaceImpactResultHtml: null,
                workspaceImpactResultMeta: null
            });
        }

        function persistImpactResult(html, meta) {
            updateWorkspacePersistedState({
                workspaceImpactResultHtml: typeof html === 'string' ? html : null,
                workspaceImpactResultMeta: meta && typeof meta === 'object' ? meta : null
            });
        }

        function getPersistedImpactResult() {
            const state = getWorkspacePersistedState();
            return {
                html: typeof state.workspaceImpactResultHtml === 'string' && state.workspaceImpactResultHtml
                    ? state.workspaceImpactResultHtml
                    : (initialWorkspaceRestoreState && initialWorkspaceRestoreState.impact && initialWorkspaceRestoreState.impact.html)
                        || '',
                meta: state.workspaceImpactResultMeta && typeof state.workspaceImpactResultMeta === 'object'
                    ? state.workspaceImpactResultMeta
                    : null
            };
        }
    `;
}
