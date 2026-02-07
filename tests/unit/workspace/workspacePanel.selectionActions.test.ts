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
});
