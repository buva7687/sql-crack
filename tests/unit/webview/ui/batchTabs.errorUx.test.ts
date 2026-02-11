import { readFileSync } from 'fs';
import { join } from 'path';

describe('batchTabs error UX', () => {
    const source = readFileSync(join(__dirname, '../../../../src/webview/ui/batchTabs.ts'), 'utf8');

    it('renders explicit error/success/partial icons with state tints', () => {
        expect(source).toContain("const stateIcon = hasError ? ICONS.warning : isPartial ? ICONS.bolt : ICONS.check;");
        expect(source).toContain("const statusIcon = errorCount > 0 ? ICONS.warning : ICONS.bolt;");
        expect(source).toContain('const errorBgTint =');
        expect(source).toContain('const warningBgTint =');
        expect(source).toContain('const successBgTint =');
        expect(source).not.toContain("const stateIcon = hasError ? '⚠' : isPartial ? '⚡' : '✓';");
    });

    it('uses detailed tooltips for errors and partial parse tabs', () => {
        expect(source).toContain('tab.title = hasError');
        expect(source).toContain('`Q${i + 1}: ${query.error}`');
        expect(source).toContain('Partial parse (regex fallback)');
    });

    it('provides clickable failed-count summary with dropdown navigation', () => {
        expect(source).toContain("id=\"batch-tabs-failed-trigger\"");
        expect(source).toContain('parseErrors.forEach(parseError => {');
        expect(source).toContain('callbacks.onQuerySelect(parseError.queryIndex);');
        expect(source).toContain("document.addEventListener('click', onDocumentClick, listenerOptions);");
        expect(source).toContain("document.removeEventListener('click', onDocumentClick);");
    });

    it('re-renders tabs on theme changes so state colors stay synced', () => {
        expect(source).toContain("document.addEventListener('theme-change'");
        expect(source).toContain('updateBatchTabsTheme(e.detail.dark);');
        expect(source).toContain('updateBatchTabs(currentBatchResult, currentQueryIdx, currentCallbacks);');
    });
});
