/**
 * Script fragment: client-side request tracking for async workspace flows.
 */
export function getWorkspaceRequestStateScriptFragment(): string {
    return `
        const workspaceRequestScopes = {
            switchToLineageView: 'lineage-overview',
            switchToImpactView: ['impact-form', 'impact-result'],
            getLineage: 'flow-result',
            analyzeImpact: 'impact-result',
            exploreTable: 'table-detail',
            getColumnLineage: 'column-lineage',
            getUpstream: 'flow-result',
            getDownstream: 'flow-result',
            searchLineageTables: 'lineage-search',
            getLineageGraph: 'lineage-graph',
            selectColumn: 'column-lineage'
        };
        const workspaceResponseScopes = {
            lineageOverviewResult: 'lineage-overview',
            lineageResult: 'flow-result',
            impactFormResult: 'impact-form',
            impactResult: 'impact-result',
            tableDetailResult: 'table-detail',
            columnLineageResult: 'column-lineage',
            upstreamResult: 'flow-result',
            downstreamResult: 'flow-result',
            lineageSearchResults: 'lineage-search',
            lineageGraphResult: 'lineage-graph'
        };
        let workspaceRequestSequence = 0;
        const latestWorkspaceRequestIds = {};

        function registerWorkspaceRequest(command) {
            const scopes = workspaceRequestScopes[command];
            if (!scopes) {
                return undefined;
            }
            const requestId = ++workspaceRequestSequence;
            const scopeList = Array.isArray(scopes) ? scopes : [scopes];
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
