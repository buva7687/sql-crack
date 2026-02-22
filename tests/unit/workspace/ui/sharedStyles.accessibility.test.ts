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
        expect(darkVars).toContain('--scrollbar-track: rgba(0, 0, 0, 0.35)');
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
        expect(css).toContain('.legend-shortcuts-panel');
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
        expect(darkVars).toContain('--lineage-coltype-numeric: #60a5fa');
        expect(darkVars).toContain('--lineage-minimap-viewport-fill: rgba(99, 102, 241, 0.15)');
        expect(lightVars).toContain('--column-edge-upstream: #16a34a');
        expect(lightVars).toContain('--column-edge-downstream: #2563eb');
        expect(lightVars).toContain('--lineage-coltype-numeric: #3b82f6');
        expect(lightVars).toContain('--lineage-minimap-viewport-fill: rgba(79, 70, 229, 0.15)');
    });

    it('defines a theme token for text rendered on accent surfaces', () => {
        const darkVars = getCssVariables(true);
        const lightVars = getCssVariables(false);

        expect(darkVars).toContain('--text-on-accent: #ffffff');
        expect(lightVars).toContain('--text-on-accent: #ffffff');
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

    it('includes search-count, typeahead-loading, and btn-disabled styles', () => {
        const css = getWebviewStyles(true);
        expect(css).toContain('.search-count');
        expect(css).toContain('.search-nav-btn');
        expect(css).toContain('.node-search-current .node-bg');
        expect(css).toContain('.graph-explain-panel');
        expect(css).toContain('.keyboard-hints.is-hidden');
        expect(css).toContain('.zoom-toolbar.is-hidden');
        expect(css).toContain('max-width: min(420px, 34vw);');
        expect(css).toContain('@media (max-width: 1600px)');
        expect(css).toContain('.search-nav-btn');
        expect(css).toContain('.typeahead-loading');
        expect(css).toContain('.loading-spinner-small');
        expect(css).toContain('.icon-btn.btn-disabled');
    });

    it('includes graph sidebar selection cross-link styles', () => {
        const css = getWebviewStyles(true);
        expect(css).toContain('.selection-cross-links');
        expect(css).toContain('.selection-divider');
        expect(css).toContain('.selection-actions-label');
    });

    it('keeps advanced export options aligned and same contrast as other options', () => {
        const css = getWebviewStyles(true);
        expect(css).toContain('.export-option-advanced { padding-left: 10px; color: var(--text-secondary); }');
        expect(css).not.toContain('.export-option-advanced { padding-left: 16px; color: var(--text-muted); }');
    });

    it('uses existing theme border tokens for edge-reference expand actions', () => {
        const css = getWebviewStyles(true);
        expect(css).toContain('.selection-edge-expand-btn');
        expect(css).toContain('border: 1px solid var(--border-color);');
        expect(css).not.toContain('var(--border-primary)');
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

    it('uses theme variables for lineage type colors and minimap viewport fill', () => {
        const css = getWebviewStyles(true);

        expect(css).toContain('.lineage-node .column-dot.type-numeric {\n            fill: var(--lineage-coltype-numeric);');
        expect(css).toContain('.lineage-legend .legend-numeric { background: var(--lineage-coltype-numeric); }');
        expect(css).toContain('.lineage-minimap .minimap-viewport {\n            fill: var(--lineage-minimap-viewport-fill);');
        expect(css).not.toContain('.lineage-legend .legend-numeric { background: #60a5fa; }');
    });

    it('uses text-on-accent token for lineage badges and connection pills', () => {
        const css = getWebviewStyles(true);

        expect(css).toContain('.badge-primary {\n            background: var(--accent); color: var(--text-on-accent);');
        expect(css).toContain('.badge-not-null {\n            background: var(--warning); color: var(--text-on-accent);');
        expect(css).toContain('.connection-count.has-connections { background: var(--accent); color: var(--text-on-accent); }');
        expect(css).not.toContain('.badge-primary {\n            background: var(--accent); color: white;');
        expect(css).not.toContain('.badge-not-null {\n            background: var(--warning); color: white;');
    });
});
