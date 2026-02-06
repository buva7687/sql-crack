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
});
