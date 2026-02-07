import { getBaseStyles, getCssVariables, getIssuesStyles, getWebviewStyles } from '../../../../src/workspace/ui/sharedStyles';

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

    it('includes bottom legend strip styles for workspace graph and lineage views', () => {
        const css = getWebviewStyles(false);
        expect(css).toContain('.lineage-legend.is-hidden');
        expect(css).toContain('--lineage-legend-height: 0px;');
        expect(css).toContain('bottom: calc(18px + clamp(0px, var(--lineage-legend-height), 96px));');
        expect(css).toContain('bottom: calc(22px + clamp(0px, var(--lineage-legend-height), 96px));');
        expect(css).toContain('.workspace-legend-bar');
        expect(css).toContain('.graph-area.graph-legend-visible .keyboard-hints');
        expect(css).not.toContain('.workspace-legend-bar,\n        .legend-inline');
    });

    it('includes view-specific skeleton styles for non-graph tabs', () => {
        const css = getWebviewStyles(true);
        expect(css).toContain('.view-skeleton-lineage');
        expect(css).toContain('.view-skeleton-impact');
        expect(css).not.toContain('.view-skeleton-tables');
        expect(css).toContain('@keyframes skeleton-pulse');
    });

    it('defines column-edge upstream/downstream CSS variables for both themes', () => {
        const darkVars = getCssVariables(true);
        const lightVars = getCssVariables(false);

        expect(darkVars).toContain('--column-edge-upstream: #22c55e');
        expect(darkVars).toContain('--column-edge-downstream: #3b82f6');
        expect(lightVars).toContain('--column-edge-upstream: #16a34a');
        expect(lightVars).toContain('--column-edge-downstream: #2563eb');
    });

    it('uses CSS variables for column edge strokes and arrowhead fills', () => {
        const css = getWebviewStyles(true);

        expect(css).toContain('.column-edge-upstream');
        expect(css).toContain('stroke: var(--column-edge-upstream)');
        expect(css).toContain('stroke: var(--column-edge-downstream)');
        expect(css).toContain('#column-arrowhead-upstream polygon { fill: var(--column-edge-upstream); }');
        expect(css).toContain('#column-arrowhead-downstream polygon { fill: var(--column-edge-downstream); }');
    });

    it('avoids stale danger token usage and uses theme variables for transform edges', () => {
        const css = getWebviewStyles(true);
        expect(css).not.toContain('var(--danger)');
        expect(css).toContain('.lineage-edge-transform { stroke: var(--warning); }');
    });

    it('includes graph sidebar selection cross-link styles', () => {
        const css = getWebviewStyles(true);
        expect(css).toContain('.selection-cross-links');
        expect(css).toContain('.selection-divider');
        expect(css).toContain('.selection-actions-label');
    });

    it('renders theme-aware borders for workspace view tabs', () => {
        const css = getBaseStyles();
        expect(css).toContain('.view-tabs');
        expect(css).toContain('border: 1px solid var(--border-color);');
        expect(css).toContain('.view-tab {');
        expect(css).toContain('border: 1px solid var(--border-subtle);');
        expect(css).toContain('.view-tab.active');
        expect(css).toContain('border-color: var(--accent);');
    });

    it('keeps lineage minimap and zoom controls above legend overlay', () => {
        const css = getWebviewStyles(true);
        expect(css).toContain('.lineage-zoom-controls');
        expect(css).toContain('.lineage-minimap');
        expect(css).toContain('.lineage-legend');
        expect(css).toContain('z-index: 130;');
        expect(css).toContain('.lineage-legend {\n            position: absolute;');
        expect(css).toContain('z-index: 100;');
    });
});
