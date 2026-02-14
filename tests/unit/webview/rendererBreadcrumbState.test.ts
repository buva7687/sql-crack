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
        expect(rendererSource).toContain('const crumbText = state.isDarkTheme');
        expect(rendererSource).toContain('const crumbMuted = state.isDarkTheme');
        expect(rendererSource).toContain('const separatorColor = state.isDarkTheme');
        expect(rendererSource).toContain('breadcrumbPanel.style.background = state.isDarkTheme');
    });

    it('suppresses the legacy breadcrumb popup while column lineage mode is active', () => {
        expect(rendererSource).toContain('if (state.showColumnFlows) {');
        expect(rendererSource).toContain("breadcrumbPanel.style.display = 'none';");
        expect(rendererSource).toContain('if (state.selectedNodeId) {');
        expect(rendererSource).toContain('updateBreadcrumb(state.selectedNodeId);');
        expect(rendererSource).toContain('right: auto;');
        expect(rendererSource).toContain('pointer-events: none;');
    });

    it('adds panel close affordance and themed scrollbar styles for column lineage panel', () => {
        expect(rendererSource).toContain('column-lineage-panel-close');
        expect(rendererSource).toContain('Close column lineage panel');
        expect(rendererSource).toContain('ensureColumnLineagePanelScrollbarStyles');
        expect(rendererSource).toContain('#column-lineage-panel::-webkit-scrollbar');
        expect(rendererSource).toContain('scrollbar-color:');
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
        expect(rendererSource).toContain('if (sqlSnippet.truncated)');
        expect(rendererSource).toContain('Press S for full SQL');
        expect(listenerSource).toContain("if (e.key === 's' || e.key === 'S')");
        expect(listenerSource).toContain('callbacks.toggleSqlPreview();');
    });

    it('uses theme-aware SQL preview heading and body text colors', () => {
        expect(rendererSource).toContain('const sqlHeaderColor = state.isDarkTheme ? UI_COLORS.text : UI_COLORS.textLight;');
        expect(rendererSource).toContain('const sqlBodyColor = state.isDarkTheme ? UI_COLORS.textBright : UI_COLORS.textLight;');
        expect(rendererSource).toContain('color: ${sqlHeaderColor}');
        expect(rendererSource).toContain('color: ${sqlBodyColor};');
    });

    it('uses theme-aware colors for details and SQL clause panels', () => {
        expect(rendererSource).toContain('const headingColor = isDark ? UI_COLORS.text : UI_COLORS.textLight;');
        expect(rendererSource).toContain('const closeButtonColor = isDark ? UI_COLORS.textMuted : UI_COLORS.textLightMuted;');
        expect(rendererSource).toContain('const footerColor = isDark ? UI_COLORS.textDim : UI_COLORS.textLightDim;');
        expect(rendererSource).toContain('const panelBg = isDark ? UI_COLORS.backgroundPanelSolid : UI_COLORS.backgroundPanelLightSolid;');
        expect(rendererSource).toContain('const clauseText = isDark ? UI_COLORS.textBright : UI_COLORS.textLight;');
    });
});
