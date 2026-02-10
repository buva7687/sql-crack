import { readFileSync } from 'fs';
import { join } from 'path';

describe('compare mode wiring', () => {
    const toolbarSource = readFileSync(join(__dirname, '../../../src/webview/ui/toolbar.ts'), 'utf8');
    const indexSource = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');
    const uiIndexSource = readFileSync(join(__dirname, '../../../src/webview/ui/index.ts'), 'utf8');

    it('adds compare callbacks and compare button state sync in toolbar', () => {
        expect(toolbarSource).toContain('onToggleCompareMode: () => void;');
        expect(toolbarSource).toContain('isCompareMode: () => boolean;');
        expect(toolbarSource).toContain('getCompareBaselineLabel: () => string | null;');
        expect(toolbarSource).toContain("compareBtn.id = 'compare-mode-btn';");
        expect(toolbarSource).toContain("document.addEventListener('compare-mode-state', compareStateHandler);");
    });

    it('toggles compare mode from webview bootstrap with parsed baseline query', () => {
        expect(indexSource).toContain('async function toggleCompareMode(): Promise<void>');
        expect(indexSource).toContain('const baselineResult = await parseAsync(baseline.sql, baseline.dialect);');
        expect(indexSource).toContain('showCompareView({');
        expect(indexSource).toContain('hideCompareView();');
        expect(indexSource).toContain("new CustomEvent('compare-mode-state'");
        expect(indexSource).toContain('getCompareBaselineLabel: () => resolveCompareBaseline()?.label || null,');
    });

    it('re-exports compare view helpers from UI barrel', () => {
        expect(uiIndexSource).toContain('showCompareView');
        expect(uiIndexSource).toContain('hideCompareView');
        expect(uiIndexSource).toContain('computeCompareDiff');
    });
});
