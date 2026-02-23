import { readFileSync } from 'fs';
import { join } from 'path';

describe('batch navigation scope wiring', () => {
    const webviewIndex = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');
    const uiIndex = readFileSync(join(__dirname, '../../../src/webview/ui/index.ts'), 'utf8');

    it('uses scoped adjacent helper for bracket key navigation', () => {
        expect(webviewIndex).toContain('getScopedAdjacentQueryIndex');
        expect(webviewIndex).toContain("const prevIndex = getScopedAdjacentQueryIndex(batchResult, currentQueryIndex, 'prev');");
        expect(webviewIndex).toContain("const nextIndex = getScopedAdjacentQueryIndex(batchResult, currentQueryIndex, 'next');");
        expect(webviewIndex).not.toContain('switchToQueryIndex(currentQueryIndex - 1);');
        expect(webviewIndex).not.toContain('switchToQueryIndex(currentQueryIndex + 1);');
    });

    it('re-exports scope helper from ui barrel', () => {
        expect(uiIndex).toContain('getScopedAdjacentQueryIndex');
        expect(uiIndex).toContain('BatchNavigationScope');
    });
});
