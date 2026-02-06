import { getBaseStyles, getCssVariables, getIssuesStyles } from '../../../../src/workspace/ui/sharedStyles';

describe('workspace sharedStyles accessibility rules', () => {
    it('contains reduced-motion overrides for lineage flow animations and panel transitions', () => {
        const css = getBaseStyles();
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('.lineage-edge.highlighted');
        expect(css).toContain('.column-lineage-edge');
        expect(css).toContain('.lineage-panel');
    });

    it('contains high-contrast overrides for edge/node strokes and key chrome borders', () => {
        const css = getBaseStyles();
        expect(css).toContain('@media (prefers-contrast: more)');
        expect(css).toContain('.node .node-accent');
        expect(css).toContain('.edge, .edge path, .lineage-edge, .column-lineage-edge');
        expect(css).toContain('.workspace-breadcrumb');
    });

    it('defines theme-aware scrollbar tokens for both dark and light workspace themes', () => {
        const darkVars = getCssVariables(true);
        const lightVars = getCssVariables(false);

        expect(darkVars).toContain('--scrollbar-thumb: rgba(148, 163, 184, 0.42)');
        expect(darkVars).toContain('--scrollbar-track: rgba(15, 23, 42, 0.35)');
        expect(lightVars).toContain('--scrollbar-thumb: rgba(100, 116, 139, 0.32)');
        expect(lightVars).toContain('--scrollbar-track: rgba(148, 163, 184, 0.12)');
    });

    it('applies shared scrollbar styles to workspace scroll containers', () => {
        const css = getBaseStyles();
        expect(css).toContain('scrollbar-width: thin;');
        expect(css).toContain('scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);');
        expect(css).toContain('*::-webkit-scrollbar');
        expect(css).toContain('*::-webkit-scrollbar-thumb:hover');
    });

    it('applies theme-aware scrollbar styles to the issues workspace view as well', () => {
        const css = getIssuesStyles(true);
        expect(css).toContain('--scrollbar-thumb');
        expect(css).toContain('scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);');
        expect(css).toContain('*::-webkit-scrollbar-thumb:hover');
    });
});
