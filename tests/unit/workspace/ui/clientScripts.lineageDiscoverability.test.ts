import { getWebviewScript } from '../../../../src/workspace/ui/clientScripts';

describe('workspace lineage discoverability script', () => {
    it('contains collapsed-node expand hint and first-time column trace onboarding logic', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('Double-click to expand columns');
        expect(script).toContain('column-trace-onboarding');
        expect(script).toContain('columnTraceHintStorageKey');
        expect(script).toContain('buildColumnFlowSummary');
        expect(script).toContain('Clear trace');
    });
});
