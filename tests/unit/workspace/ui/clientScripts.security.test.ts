import { getWebviewScript } from '../../../../src/workspace/ui/clientScripts';

function readAssignment(script: string, variableName: string): unknown {
    const match = script.match(new RegExp(`(?:const|let) ${variableName} = (.*?);`));
    if (!match) {
        throw new Error(`Missing assignment for ${variableName}`);
    }
    return new Function(`return (${match[1]});`)();
}

describe('workspace client bootstrap serialization', () => {
    it('keeps hostile graph, query, lineage, and restore values inside the nonce script', () => {
        const payload = '</script><style id="workspace-bootstrap-injection">body{display:none}</style><!-- -->]]>';
        const script = getWebviewScript({
            nonce: 'test-nonce',
            graphData: JSON.stringify({ nodes: [{ id: 'node-1', label: payload }] }),
            searchFilterQuery: payload,
            initialView: 'graph',
            currentGraphMode: 'tables',
            lineageDetailNodeId: payload,
            lineageDetailExpandedNodes: [payload],
            initialRestoreState: {
                impact: {
                    hasReport: true,
                    html: `<div>${payload}</div>`,
                },
            },
        });

        // The only literal closing tag must be the generator's own final tag.
        expect(script.match(/<\/script>/gi)).toHaveLength(1);
        expect(script).not.toContain('<style id="workspace-bootstrap-injection">');

        // Escaping must preserve the runtime data shape rather than HTML-encoding
        // or dropping values that the workspace restore paths need.
        expect(readAssignment(script, 'graphData')).toEqual({
            nodes: [{ id: 'node-1', label: payload }],
        });
        expect(readAssignment(script, 'initialSearchQuery')).toBe(payload);
        expect(readAssignment(script, 'initialLineageDetailNodeId')).toBe(payload);
        expect(readAssignment(script, 'initialLineageDetailExpandedNodes')).toEqual([payload]);
        expect(readAssignment(script, 'initialWorkspaceRestoreState')).toEqual({
            impact: {
                hasReport: true,
                html: `<div>${payload}</div>`,
            },
        });
    });
});
