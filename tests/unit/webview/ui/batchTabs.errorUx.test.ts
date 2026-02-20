import { readFileSync } from 'fs';
import { join } from 'path';

describe('batchTabs error UX', () => {
    const source = readFileSync(join(__dirname, '../../../../src/webview/ui/batchTabs.ts'), 'utf8');

    it('renders explicit error/success/partial icons with state tints', () => {
        expect(source).toContain("const stateIcon = hasError ? ICONS.warning : isPartial ? ICONS.bolt : ICONS.check;");
        expect(source).toContain('const errorBgTint =');
        expect(source).toContain('const warningBgTint =');
        expect(source).toContain('const successBgTint =');
        expect(source).toContain('const summaryBorder =');
        expect(source).not.toContain("const stateIcon = hasError ? '⚠' : isPartial ? '⚡' : '✓';");
    });

    it('uses detailed tooltips for errors and partial parse tabs', () => {
        expect(source).toContain('tab.title = hasError');
        expect(source).toContain('`Q${i + 1}: ${query.error}`');
        expect(source).toContain('Partial parse (regex fallback)');
    });

    it('provides compact ok/failed/partial chips for scoped navigation', () => {
        expect(source).toContain("scope: 'ok'");
        expect(source).toContain("scope: 'failed'");
        expect(source).toContain("scope: 'partial'");
        expect(source).toContain("chip.textContent = `${count} ${scope}`;");
        expect(source).toContain("const nextScope: BatchNavigationScope = isActive ? 'all' : scope;");
        expect(source).toContain('currentNavigationScope = nextScope;');
        expect(source).toContain("Navigate ${scope} queries with [ and ]");
        expect(source).not.toContain("id=\"batch-tabs-failed-trigger\"");
    });

    it('re-renders tabs on theme changes so state colors stay synced', () => {
        expect(source).toContain("document.addEventListener('theme-change'");
        expect(source).toContain('updateBatchTabsTheme(e.detail.dark);');
        expect(source).toContain('updateBatchTabs(currentBatchResult, currentQueryIdx, currentCallbacks);');
    });

    it('routes previous and next navigation through scoped helpers', () => {
        expect(source).toContain("export function getScopedAdjacentQueryIndex(");
        expect(source).toContain("const prevScopedIndex = getScopedAdjacentQueryIndex(batchResult, currentQueryIndex, 'prev');");
        expect(source).toContain("const nextScopedIndex = getScopedAdjacentQueryIndex(batchResult, currentQueryIndex, 'next');");
    });
});
