import { readFileSync } from 'fs';
import { join } from 'path';

describe('toolbar control visibility and overflow behavior', () => {
    const source = readFileSync(
        join(__dirname, '../../../src/webview/ui/toolbar.ts'),
        'utf8'
    );

    it('keeps view-location and focus-direction controls out of overflow hiding', () => {
        expect(source).toContain("viewLocBtn.dataset.overflowKeepVisible = 'true';");
        expect(source).toContain("container.dataset.overflowKeepVisible = 'true';");
        expect(source).toContain("pinsBtn.dataset.overflowKeepVisible = 'true';");
        expect(source).toContain("if (el.dataset.overflowKeepVisible === 'true') {continue;}");
        expect(source).toContain("if (el.tagName !== 'BUTTON') {continue;}");
        expect(source).toContain('Children of actions: [zoomGroup, featureGroup, exportGroup, overflowContainer]');
    });

    it('prevents toolbar group shrink-clipping before overflow handling runs', () => {
        expect(source).toContain('function createZoomGroup');
        expect(source).toContain('function createFeatureGroup');
        expect(source).toContain('function createExportGroup');
        expect(source).toMatch(/function createZoomGroup[\s\S]*?display:\s*flex;[\s\S]*?flex-shrink:\s*0;/);
        expect(source).toMatch(/function createFeatureGroup[\s\S]*?display:\s*flex;[\s\S]*?flex-shrink:\s*0;/);
        expect(source).toMatch(/function createExportGroup[\s\S]*?display:\s*flex;[\s\S]*?flex-shrink:\s*0;/);
    });

    it('renders focus/view-location/pinned menus as fixed body-mounted overlays', () => {
        expect(source).toContain("dropdown.id = 'focus-mode-dropdown';");
        expect(source).toContain("dropdown.id = 'view-location-dropdown';");
        expect(source).toContain("dropdown.id = 'pinned-tabs-dropdown';");
        expect(source).toMatch(/function createFocusModeSelector[\s\S]*?position:\s*fixed;/);
        expect(source).toMatch(/function createViewLocationDropdown[\s\S]*?position:\s*fixed;/);
        expect(source).toMatch(/function createPinnedTabsDropdown[\s\S]*?position:\s*fixed;/);
        expect(source).toMatch(/function createFocusModeSelector[\s\S]*?document\.body\.appendChild\(dropdown\);/);
        expect(source).toMatch(/function createViewLocationButton[\s\S]*?document\.body\.appendChild\(dropdown\);/);
        expect(source).toMatch(/function createPinnedTabsButton[\s\S]*?document\.body\.appendChild\(dropdown\);/);
    });

    it('does not render the redundant legend toolbar button', () => {
        expect(source).not.toContain("createButton('🎨', callbacks.onToggleLegend");
        expect(source).not.toContain("legendBtn.title = 'Show color legend (L)'");
    });

    it('uses distinct compare and focus-direction icons in the toolbar', () => {
        expect(source).toContain('createButton(ICONS.compareMode');
        expect(source).toContain('btn.innerHTML = ICONS.focusDirection;');
        expect(source).toContain('Compare with Baseline Query');
    });
});
