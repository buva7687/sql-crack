/**
 * Script fragment: client-side request tracking for async workspace flows.
 */
export function getWorkspaceRequestStateScriptFragment(): string {
    return `
        const workspaceRequestScopes = {
            switchToLineageView: 'view-content',
            switchToImpactView: ['impact-form', 'impact-result'],
            getLineage: 'view-content',
            analyzeImpact: 'impact-result',
            exploreTable: 'view-content',
            getColumnLineage: 'column-lineage',
            getUpstream: 'view-content',
            getDownstream: 'view-content',
            searchLineageTables: 'lineage-search',
            getLineageGraph: 'view-content',
            selectColumn: 'column-lineage'
        };
        const workspaceResponseScopes = {
            lineageOverviewResult: 'view-content',
            lineageResult: 'view-content',
            impactFormResult: 'impact-form',
            impactResult: 'impact-result',
            tableDetailResult: 'view-content',
            columnLineageResult: 'column-lineage',
            upstreamResult: 'view-content',
            downstreamResult: 'view-content',
            lineageSearchResults: 'lineage-search',
            lineageGraphResult: 'view-content'
        };
        let workspaceRequestSequence = 0;
        const latestWorkspaceRequestIds = {};

        function invalidateWorkspaceRequests() {
            Object.keys(latestWorkspaceRequestIds).forEach(scope => delete latestWorkspaceRequestIds[scope]);
        }

        function registerWorkspaceRequest(command) {
            const scopes = workspaceRequestScopes[command];
            if (!scopes) {
                return undefined;
            }
            const requestId = ++workspaceRequestSequence;
            const scopeList = Array.isArray(scopes) ? scopes : [scopes];
            // Starting a view or replacing Lineage content invalidates the old DOM's
            // requests. Impact analysis updates a nested result, so it must leave
            // an in-flight Impact form request valid.
            if (scopeList.includes('view-content') || command === 'switchToImpactView') {
                invalidateWorkspaceRequests();
            }
            scopeList.forEach((scope) => {
                latestWorkspaceRequestIds[scope] = requestId;
            });
            return requestId;
        }

        function postWorkspaceMessage(message) {
            if (!message || typeof message !== 'object') {
                return;
            }
            const command = message.command;
            // A delayed callback from a view we left must not invalidate the
            // active view's request before its response has arrived.
            const requestView = command === 'switchToImpactView' || command === 'analyzeImpact'
                ? 'impact' : workspaceRequestScopes[command] ? 'lineage' : null;
            if (requestView && typeof currentViewMode === 'string' && currentViewMode !== requestView) {
                return undefined;
            }
            const requestId = registerWorkspaceRequest(command);
            if (typeof requestId === 'number') {
                vscode.postMessage(Object.assign({}, message, { requestId }));
                return requestId;
            }
            vscode.postMessage(message);
            return undefined;
        }

        function isLatestWorkspaceResponse(message) {
            if (!message || typeof message !== 'object') {
                return true;
            }
            const scope = workspaceResponseScopes[message.command];
            if (!scope) {
                return true;
            }
            const requestId = message.data && typeof message.data.requestId === 'number'
                ? message.data.requestId
                : undefined;
            if (typeof requestId !== 'number') {
                return true;
            }
            return latestWorkspaceRequestIds[scope] === requestId;
        }
    `;
}
