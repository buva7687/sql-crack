import { readFileSync } from 'fs';
import { join } from 'path';

describe('webview renderer filter breadcrumb state reset', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
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
        expect(rendererSource).toContain('function isReducedMotionPreferred()');
        expect(rendererSource).toContain('if (isReducedMotionPreferred())');
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

    it('shows "Press S for full SQL" in tooltip when SQL preview is truncated', () => {
        expect(rendererSource).toContain('if (sqlSnippet.truncated)');
        expect(rendererSource).toContain('Press S for full SQL');
        expect(rendererSource).toContain("if (e.key === 's' || e.key === 'S')");
        expect(rendererSource).toContain('toggleSqlPreview();');
    });
});
