import { createGraphBodyHtml, createStatsPanelHtml } from '../../../src/workspace/panel/graphTemplates';

describe('workspace panel selection sidebar actions', () => {
    it('renders graph selection cross-link action chips', () => {
        const html = createStatsPanelHtml({
            escapeHtml: (value: string) => value,
        });

        expect(html).toContain('id="selection-cross-links"');
        expect(html).toContain('data-graph-action="view-lineage"');
        expect(html).toContain('data-graph-action="analyze-impact"');
        expect(html).toContain('data-graph-action="open-file"');
    });

    it('uses normalized terminology in trace button aria-labels', () => {
        const html = createGraphBodyHtml({
            graph: {
                stats: { totalFiles: 1, totalTables: 2, totalViews: 1, totalReferences: 0, orphanedDefinitions: [], missingDefinitions: [], circularDependencies: [] },
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

        expect(html).toContain('aria-label="Trace all upstream sources"');
        expect(html).toContain('aria-label="Trace all downstream consumers"');
        expect(html).not.toContain('aria-label="Trace all upstream dependencies"');
        expect(html).not.toContain('aria-label="Trace all downstream dependents"');
        expect(html).toContain('id="graph-search-count"');
    });

    it('includes lineage guidance hint in graph mode help tooltip', () => {
        const html = createGraphBodyHtml({
            graph: {
                stats: { totalFiles: 1, totalTables: 2, totalViews: 1, totalReferences: 0, orphanedDefinitions: [], missingDefinitions: [], circularDependencies: [] },
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

        expect(html).toContain('help-tooltip-hint');
        expect(html).toContain('use the Lineage tab');
    });

    it('renders only graph, lineage, and impact tabs in the header', () => {
        const html = createGraphBodyHtml({
            graph: {
                stats: { totalFiles: 1, totalTables: 2, totalViews: 1, totalReferences: 0, orphanedDefinitions: [], missingDefinitions: [], circularDependencies: [] },
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
});
