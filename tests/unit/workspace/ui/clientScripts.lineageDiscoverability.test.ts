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
        expect(script).toContain('if (warning && typeof showCopyFeedback === \'function\')');
    });

    it('supports keyboard navigation through expanded column rows', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('moveColumnRowFocus');
        expect(script).toContain("event.key === 'ArrowDown'");
        expect(script).toContain("event.key === 'ArrowUp'");
        expect(script).toContain("event.key === 'Enter' || event.key === ' '");
        expect(script).toContain('Press Enter to trace lineage');
    });

    it('supports lineage bottom legend visibility controls with L shortcut and dismiss button', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('lineageLegendStorageKey');
        expect(script).toContain('toggleLineageLegendBar');
        expect(script).toContain('initializeLineageLegendBar');
        expect(script).toContain("if (e.key === 'l' || e.key === 'L')");
        expect(script).toContain("const dismissBtn = document.getElementById('legend-dismiss');");
        expect(script).toContain("const legendToggleBtn = document.getElementById('lineage-legend-toggle');");
    });

    it('debounces lineage table search input for smoother typing on large workspaces', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        expect(script).toContain('lineageFilterDebounceMs = 180');
        expect(script).toContain('function scheduleLineageFilter(immediate = false)');
        expect(script).toContain('scheduleLineageFilter();');
        expect(script).toContain('let lineageSearchState = {');
        expect(script).toContain('window.captureLineageSearchState = captureLineageSearchState;');
        expect(script).toContain('searchInput.value = lineageSearchState.query || \'\';');
    });

    it('avoids duplicate legend setup calls and releases queued lineage updates on paint', () => {
        const script = getWebviewScript({
            nonce: 'test',
            graphData: '{"nodes":[]}',
            searchFilterQuery: '',
            initialView: 'graph',
            currentGraphMode: 'tables',
        });

        const legendInitCalls = script.match(/initializeLineageLegendBar\(\);/g) || [];
        expect(legendInitCalls).toHaveLength(1);
        expect(script).toContain('function finishLineageSetup()');
        expect(script).toContain('requestAnimationFrame(() => requestAnimationFrame(finishLineageSetup));');
        expect(script).not.toContain('}, 200);');
        expect(script).toContain('const lineageBounds = lineageContent ? lineageContent.getBoundingClientRect() : null;');
        expect(script).toContain('left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));');
    });
});
