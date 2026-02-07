import { WorkspacePanel } from '../../../src/workspace/workspacePanel';

describe('workspace panel selection sidebar actions', () => {
    it('renders graph selection cross-link action chips', () => {
        const html = (WorkspacePanel.prototype as any).generateStatsHtml.call({
            escapeHtml: (value: string) => value,
        });

        expect(html).toContain('id="selection-cross-links"');
        expect(html).toContain('data-graph-action="view-lineage"');
        expect(html).toContain('data-graph-action="analyze-impact"');
        expect(html).toContain('data-graph-action="open-file"');
    });

    it('includes lineage guidance hint in graph mode help tooltip', () => {
        const html = (WorkspacePanel.prototype as any).generateGraphBody.call({
            _isDarkTheme: true,
            escapeHtml: (value: string) => value,
            generateStatsHtml: () => '<div>stats</div>',
            generateGraphAreaHtml: () => '<div>graph</div>',
            getIndexStatus: () => ({ level: 'fresh', title: 'Index is fresh', label: 'Fresh' }),
        }, {
            stats: { totalFiles: 1, totalTables: 2, totalViews: 1 },
        }, {
            query: '',
            nodeTypes: undefined,
            useRegex: false,
            caseSensitive: false,
        }, {
            selectCount: 0,
            joinCount: 0,
            aggregateCount: 0,
            distinctCount: 0,
            whereCount: 0,
            cteCount: 0,
            unionsCount: 0,
            subqueryCount: 0,
            windowCount: 0,
        }, 0, '<script>noop</script>', 'tables');

        expect(html).toContain('help-tooltip-hint');
        expect(html).toContain('use the Lineage tab');
    });

    it('renders only graph, lineage, and impact tabs in the header', () => {
        const html = (WorkspacePanel.prototype as any).generateGraphBody.call({
            _isDarkTheme: true,
            escapeHtml: (value: string) => value,
            generateStatsHtml: () => '<div>stats</div>',
            generateGraphAreaHtml: () => '<div>graph</div>',
            getIndexStatus: () => ({ level: 'fresh', title: 'Index is fresh', label: 'Fresh' }),
        }, {
            stats: { totalFiles: 1, totalTables: 2, totalViews: 1 },
        }, {
            query: '',
            nodeTypes: undefined,
            useRegex: false,
            caseSensitive: false,
        }, {
            selectCount: 0,
            joinCount: 0,
            aggregateCount: 0,
            distinctCount: 0,
            whereCount: 0,
            cteCount: 0,
            unionsCount: 0,
            subqueryCount: 0,
            windowCount: 0,
        }, 0, '<script>noop</script>', 'tables');

        expect(html).toContain('data-view="graph"');
        expect(html).toContain('data-view="lineage"');
        expect(html).toContain('data-view="impact"');
        expect(html).not.toContain('data-view="tableExplorer"');
    });
});
