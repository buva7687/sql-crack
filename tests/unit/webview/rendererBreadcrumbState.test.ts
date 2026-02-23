import { readFileSync } from 'fs';
import { join } from 'path';

describe('webview renderer filter breadcrumb state reset', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );
    const listenerSource = readFileSync(
        join(__dirname, '../../../src/webview/interaction/keyboardListeners.ts'),
        'utf8'
    );
    const tooltipSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/tooltip.ts'),
        'utf8'
    );
    const infoPanelSource = readFileSync(
        join(__dirname, '../../../src/webview/panels/infoPanel.ts'),
        'utf8'
    );
    const sqlPanelSource = readFileSync(
        join(__dirname, '../../../src/webview/panels/sqlPanels.ts'),
        'utf8'
    );
    const columnLineageSource = readFileSync(
        join(__dirname, '../../../src/webview/features/columnLineage.ts'),
        'utf8'
    );
    const bootstrapSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/rendererBootstrap.ts'),
        'utf8'
    );
    const breadcrumbSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/breadcrumbPopup.ts'),
        'utf8'
    );

    it('resets breadcrumb/filter UI state before rendering a new query result', () => {
        expect(rendererSource).toContain('clearSearch();');
        expect(rendererSource).toContain('clearBreadcrumbBar();');
        expect(rendererSource).toContain('hideColumnLineagePanel();');
        expect(rendererSource).toContain('setColumnLineageBannerVisible(false);');
        expect(rendererSource).toContain('state.focusModeEnabled = false;');
    });

    it('gates pulse animations behind reduced-motion preference checks', () => {
        expect(rendererSource).toContain("import { prefersReducedMotion } from './ui/motion';");
        expect(rendererSource).toContain('if (prefersReducedMotion())');
    });

    it('uses theme-aware breadcrumb colors instead of hardcoded dark-only values', () => {
        expect(breadcrumbSource).toContain('const crumbText = state.isDarkTheme');
        expect(breadcrumbSource).toContain('const crumbMuted = state.isDarkTheme');
        expect(breadcrumbSource).toContain('const separatorColor = state.isDarkTheme');
        expect(breadcrumbSource).toContain('breadcrumbPanel.style.background = state.isDarkTheme');
    });

    it('suppresses the legacy breadcrumb popup while column lineage mode is active', () => {
        expect(breadcrumbSource).toContain('if (state.showColumnFlows) {');
        expect(breadcrumbSource).toContain("breadcrumbPanel.style.display = 'none';");
        expect(rendererSource).toContain('if (state.selectedNodeId) {');
        expect(rendererSource).toContain('updateBreadcrumb(state.selectedNodeId);');
        expect(bootstrapSource).toContain('right: auto;');
        expect(bootstrapSource).toContain('pointer-events: none;');
    });

    it('adds panel close affordance and themed scrollbar styles for column lineage panel', () => {
        expect(columnLineageSource).toContain('column-lineage-panel-close');
        expect(columnLineageSource).toContain('Close column lineage panel');
        expect(rendererSource).toContain('ensureColumnLineagePanelScrollbarStyles');
        expect(columnLineageSource).toContain('#column-lineage-panel::-webkit-scrollbar');
        expect(columnLineageSource).toContain('scrollbar-color:');
    });

    it('applies theme-aware scrollbar styling for performance hints in light and dark modes', () => {
        expect(rendererSource).toContain('ensureHintsPanelScrollbarStyles');
        expect(rendererSource).toContain('getScrollbarColors(state.isDarkTheme)');
        expect(rendererSource).toContain('hints-panel-scroll-style');
        expect(rendererSource).toContain('.hints-panel::-webkit-scrollbar');
        expect(rendererSource).toContain('.hints-panel .hints-list::-webkit-scrollbar');
    });

    it('keeps performance hints panel above legend as legend height and viewport change', () => {
        expect(rendererSource).toContain('syncHintsPanelViewportBounds');
        expect(rendererSource).toContain("from './ui/panelLayout'");
        expect(rendererSource).toContain('applyHintsPanelBounds');
        expect(rendererSource).toContain('applyPanelBottomOffsets');
        expect(rendererSource).toContain('legendResizeObserver = new ResizeObserver');
        expect(rendererSource).toContain("window.addEventListener('resize', legendResizeHandler);");
        expect(rendererSource).toContain("documentListeners.push({ type: 'legend-bar-toggle', handler: handleLegendToggle });");
    });

    it('shows "Press S for full SQL" in tooltip when SQL preview is truncated', () => {
        expect(tooltipSource).toContain('if (sqlSnippet.truncated)');
        expect(tooltipSource).toContain('Press S for full SQL');
        expect(rendererSource).toContain('showTooltipUi({');
        expect(listenerSource).toContain("if (e.key === 's' || e.key === 'S')");
        expect(listenerSource).toContain('callbacks.toggleSqlPreview();');
    });

    it('uses theme-aware SQL preview heading and body text colors', () => {
        expect(sqlPanelSource).toContain('const sqlHeaderColor = isDarkTheme ? UI_COLORS.text : UI_COLORS.textLight;');
        expect(sqlPanelSource).toContain('const sqlBodyColor = isDarkTheme ? UI_COLORS.textBright : UI_COLORS.textLight;');
        expect(sqlPanelSource).toContain('color: ${sqlHeaderColor}');
        expect(sqlPanelSource).toContain('color: ${sqlBodyColor};');
    });

    it('uses theme-aware colors for details and SQL clause panels', () => {
        expect(infoPanelSource).toContain('const headingColor = isDarkTheme ? UI_COLORS.text : UI_COLORS.textLight;');
        expect(infoPanelSource).toContain('const closeButtonColor = isDarkTheme ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;');
        expect(infoPanelSource).toContain('const footerColor = isDarkTheme ? UI_COLORS.textDim : UI_COLORS.textLightDim;');
        expect(sqlPanelSource).toContain('panelBg: isDarkTheme ? UI_COLORS.backgroundPanelSolid : UI_COLORS.backgroundPanelLightSolid');
        expect(sqlPanelSource).toContain('clauseText: isDarkTheme ? UI_COLORS.textBright : UI_COLORS.textLight');
    });
});
