import { getBaseStyles, getCssVariables, getIssuesStyles, getWebviewStyles } from '../../../../src/workspace/ui/sharedStyles';

function readCssVariable(css: string, name: string): string {
    const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
    if (!match) { throw new Error(`Missing CSS variable ${name}`); }
    return match[1];
}

function relativeLuminance(hex: string): number {
    const channels = hex.slice(1).match(/.{2}/g)!.map(channel => parseInt(channel, 16) / 255);
    const [r, g, b] = channels.map(channel => (
        channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
    ));
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function contrastRatio(first: string, second: string): number {
    const firstLuminance = relativeLuminance(first);
    const secondLuminance = relativeLuminance(second);
    return (Math.max(firstLuminance, secondLuminance) + 0.05)
        / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

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

    it('uses theme-appropriate borders in increased-contrast mode', () => {
        const lightMedia = /@media \(prefers-contrast: more\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(getBaseStyles(false))?.[1] ?? '';
        const darkMedia = /@media \(prefers-contrast: more\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(getBaseStyles(true))?.[1] ?? '';

        expect(lightMedia).toContain('--border-color: rgba(0, 0, 0, 0.4)');
        expect(lightMedia).not.toContain('255, 255, 255');
        expect(darkMedia).toContain('--border-color: rgba(255, 255, 255, 0.4)');
        expect(getWebviewStyles(false)).toContain('--border-color: rgba(0, 0, 0, 0.4)');
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

    it('defines a high-contrast foreground for warning surfaces in both themes', () => {
        const darkVars = getCssVariables(true);
        const lightVars = getCssVariables(false);

        expect(darkVars).toContain('--text-on-warning: #111827');
        expect(lightVars).toContain('--text-on-warning: #111827');
    });

    it('keeps table and view badge text above WCAG AA contrast in both themes', () => {
        for (const variables of [getCssVariables(true), getCssVariables(false)]) {
            const foreground = readCssVariable(variables, '--text-on-node');
            expect(contrastRatio(foreground, readCssVariable(variables, '--node-table'))).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(foreground, readCssVariable(variables, '--node-view'))).toBeGreaterThanOrEqual(4.5);
        }

        const graphCss = getWebviewStyles(true);
        const issuesCss = getIssuesStyles(true);
        expect(graphCss).toContain('.issue-type.table { background: var(--node-table); color: var(--text-on-node); }');
        expect(graphCss).toContain('.issue-type.view { background: var(--node-view); color: var(--text-on-node); }');
        expect(issuesCss).toContain('.item-type.table { background: var(--node-table); color: var(--text-on-node); }');
        expect(issuesCss).toContain('.item-type.view { background: var(--node-view); color: var(--text-on-node); }');
    });

    it('defines accessible filled-surface tokens in both themes', () => {
        const darkVars = getCssVariables(true);
        const lightVars = getCssVariables(false);

        for (const variables of [darkVars, lightVars]) {
            expect(variables).toContain('--accent-surface: #4f46e5');
            expect(variables).toContain('--accent-surface-hover: #4338ca');
            expect(variables).toContain('--error-surface: #b91c1c');
        }
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

    it('uses surface-appropriate foreground tokens for lineage badges and connection pills', () => {
        const css = getWebviewStyles(true);

        expect(css).toContain('.badge-primary {\n            background: var(--accent-surface); color: var(--text-on-accent);');
        expect(css).toContain('.badge-not-null {\n            background: var(--warning); color: var(--text-on-warning);');
        expect(css).toContain('.connection-count.has-connections { background: var(--accent-surface); color: var(--text-on-accent); }');
        expect(css).not.toContain('.badge-primary {\n            background: var(--accent); color: white;');
        expect(css).not.toContain('.badge-not-null {\n            background: var(--warning); color: white;');
        expect(css).toContain('.section-badge.warning { background: var(--warning); color: var(--text-on-warning); }');
        expect(css).toContain('.issue-type.missing { background: var(--error-surface); color: var(--text-on-accent); }');
    });

    it('uses the accessible accent surface for filled controls and highlighted text', () => {
        const css = getWebviewStyles(true);

        expect(contrastRatio(
            readCssVariable(css, '--text-on-accent'),
            readCssVariable(css, '--accent-surface')
        )).toBeGreaterThanOrEqual(4.5);
        expect(css).toContain('.icon-btn.active { background: var(--accent-surface); color: var(--text-on-accent); }');
        expect(css).toContain('.view-filter-chip.active {\n            background: var(--accent-surface);');
        expect(css).toContain('.filter-chip.active {\n            background: var(--accent-surface);');
        expect(css).not.toMatch(/background:\s*var\(--accent\);[^}]*color:\s*(?:white|#fff|var\(--text-on-accent\))/);
    });

    it('keeps the workspace command overlay above the lineage panel', () => {
        const css = getWebviewStyles(true);

        expect(css).toContain('.workspace-command-overlay');
        expect(css).toContain('background: var(--overlay-scrim);');
        expect(css).not.toContain('background: rgba(15, 23, 42, 0.42);');
        expect(css).toContain('z-index: 2000;');
        expect(css).toContain('.lineage-panel {\n            position: absolute;');
        expect(css).toContain('z-index: 50;');
    });
});
