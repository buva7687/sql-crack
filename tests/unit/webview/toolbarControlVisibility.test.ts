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
        expect(source).toContain("if (el.dataset.overflowKeepVisible === 'true') {continue;}");
        expect(source).toContain("if (el.tagName !== 'BUTTON') {continue;}");
    });

    it('does not render the redundant legend toolbar button', () => {
        expect(source).not.toContain("createButton('🎨', callbacks.onToggleLegend");
        expect(source).not.toContain("legendBtn.title = 'Show color legend (L)'");
    });
});
