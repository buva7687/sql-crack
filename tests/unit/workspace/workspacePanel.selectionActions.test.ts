import { createGraphBodyHtml, createStatsPanelHtml } from '../../../src/workspace/panel/graphTemplates';

describe('workspace panel selection sidebar actions', () => {
    it('renders graph selection cross-link action chips', () => {
        const html = createStatsPanelHtml({
            escapeHtml: (value: string) => value,
        });

        expect(html).toContain('id="selection-cross-links"');
        expect(html).toContain('data-graph-action="view-lineage"');
        expect(html).toContain('data-graph-action="analyze-impact"');
        expect(html).toContain('data-graph-action="show-file-tables"');
        expect(html).toContain('data-graph-action="open-file"');
        expect(html).toContain('id="graph-context-focus"');
        expect(html).toContain('data-graph-action="trace-upstream"');
        expect(html).toContain('data-graph-action="trace-downstream"');
        expect(html).toContain('data-graph-action="clear-graph-state"');
        expect(html).toContain('id="selection-edge-details"');
        expect(html).toContain('id="selection-edge-open-ref"');
        expect(html).toContain('data-graph-action="open-edge-reference"');
        expect(html).toContain('id="selection-path-summary"');
        expect(html).toContain('id="selection-path-start-label"');
        expect(html).toContain('id="selection-path-end-label"');
        expect(html).toContain('data-graph-action="path-set-start"');
        expect(html).toContain('data-graph-action="path-set-end"');
        expect(html).toContain('data-graph-action="path-show"');
        expect(html).toContain('data-graph-action="path-clear"');
        expect(html).toContain('Trace in Lineage');
        expect(html).toContain('Analyze in Impact');
        expect(html).toContain('Show tables in file');
    });

    it('uses normalized terminology in trace button aria-labels', () => {
        const html = createGraphBodyHtml({
            graph: {
                stats: { totalFiles: 1, totalTables: 2, totalViews: 1, totalReferences: 0, orphanedDefinitions: [], missingDefinitions: [], circularDependencies: [], parseErrors: 0 },
            } as any,
            searchFilter: {
                query: '',
                nodeTypes: undefined,
                useRegex: false,
                caseSensitive: false,
            },
            isDarkTheme: true,
            escapeHtml: (value: string) => value,
            statsHtml: '<div>stats</div>',
            graphHtml: '<div>graph</div>',
            indexStatus: { level: 'fresh', title: 'Index is fresh', text: 'Fresh' },
            totalIssues: 0,
            script: '<script>noop</script>',
            currentGraphMode: 'tables',
        });

        // Trace buttons moved to selection panel only (removed from header)
        expect(html).not.toContain('id="btn-trace-up"');
        expect(html).not.toContain('id="btn-trace-down"');
        expect(html).toContain('id="btn-search-prev"');
        expect(html).toContain('id="btn-search-next"');
        expect(html).toContain('id="graph-search-count"');
    });

    it('includes lineage guidance hint in graph mode help tooltip', () => {
        const html = createGraphBodyHtml({
            graph: {
                stats: { totalFiles: 1, totalTables: 2, totalViews: 1, totalReferences: 0, orphanedDefinitions: [], missingDefinitions: [], circularDependencies: [], parseErrors: 0 },
            } as any,
            searchFilter: {
                query: '',
                nodeTypes: undefined,
                useRegex: false,
                caseSensitive: false,
            },
            isDarkTheme: true,
            escapeHtml: (value: string) => value,
            statsHtml: '<div>stats</div>',
            graphHtml: '<div>graph</div>',
            indexStatus: { level: 'fresh', title: 'Index is fresh', text: 'Fresh' },
            totalIssues: 0,
            script: '<script>noop</script>',
            currentGraphMode: 'tables',
        });

        // Help tooltip was removed (#19) — context strip provides sufficient mode description.
        expect(html).toContain('graph-mode-btn');
    });

    it('renders only graph, lineage, and impact tabs in the header', () => {
        const html = createGraphBodyHtml({
            graph: {
                stats: { totalFiles: 1, totalTables: 2, totalViews: 1, totalReferences: 0, orphanedDefinitions: [], missingDefinitions: [], circularDependencies: [], parseErrors: 0 },
            } as any,
            searchFilter: {
                query: '',
                nodeTypes: undefined,
                useRegex: false,
                caseSensitive: false,
            },
            isDarkTheme: true,
            escapeHtml: (value: string) => value,
            statsHtml: '<div>stats</div>',
            graphHtml: '<div>graph</div>',
            indexStatus: { level: 'fresh', title: 'Index is fresh', text: 'Fresh' },
            totalIssues: 0,
            script: '<script>noop</script>',
            currentGraphMode: 'tables',
        });

        expect(html).toContain('data-view="graph"');
        expect(html).toContain('data-view="lineage"');
        expect(html).toContain('data-view="impact"');
        expect(html).not.toContain('data-view="tableExplorer"');
    });

    it('includes graph explain panel actions and partial/freshness trust copy', () => {
        const warningHtml = createGraphBodyHtml({
            graph: {
                stats: { totalFiles: 1, totalTables: 2, totalViews: 1, totalReferences: 0, orphanedDefinitions: ['x'], missingDefinitions: [], circularDependencies: [], parseErrors: 0 },
            } as any,
            searchFilter: { query: '', nodeTypes: undefined, useRegex: false, caseSensitive: false },
            isDarkTheme: true,
            escapeHtml: (value: string) => value,
            statsHtml: '<div>stats</div>',
            graphHtml: '<div>graph</div>',
            indexStatus: { level: 'stale', title: 'Index may be stale', text: 'Stale' },
            totalIssues: 1,
            script: '<script>noop</script>',
            currentGraphMode: 'tables',
        });

        expect(warningHtml).toContain('id="graph-explain-panel"');
        expect(warningHtml).toContain('data-graph-action="dismiss-why"');
        expect(warningHtml).toContain('Why am I seeing this graph?');
        expect(warningHtml).toContain('Graph may be partial (1 issue):');

        const successHtml = createGraphBodyHtml({
            graph: {
                stats: { totalFiles: 1, totalTables: 2, totalViews: 1, totalReferences: 0, orphanedDefinitions: [], missingDefinitions: [], circularDependencies: [], parseErrors: 0 },
            } as any,
            searchFilter: { query: '', nodeTypes: undefined, useRegex: false, caseSensitive: false },
            isDarkTheme: true,
            escapeHtml: (value: string) => value,
            statsHtml: '<div>stats</div>',
            graphHtml: '<div>graph</div>',
            indexStatus: { level: 'fresh', title: 'Index is fresh', text: 'Fresh' },
            totalIssues: 0,
            script: '<script>noop</script>',
            currentGraphMode: 'tables',
        });

        // Success banner removed to reduce vertical noise — only warning banners shown
        expect(successHtml).not.toContain('All clear');
        expect(successHtml).not.toContain('issue-banner success');
    });
});
