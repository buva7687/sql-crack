import { readFileSync } from 'fs';
import { join } from 'path';
import { computeClampedPanelWidth } from '../../../../src/webview/ui/resizablePanel';

describe('resizablePanel utilities', () => {
    it('clamps widths to minimum and max viewport ratio', () => {
        expect(computeClampedPanelWidth(120, 150, 0.5, 1000)).toBe(150);
        expect(computeClampedPanelWidth(800, 150, 0.5, 1000)).toBe(500);
        expect(computeClampedPanelWidth(323.4, 150, 0.5, 1000)).toBe(323);
    });

    it('keeps max width at least min width for narrow viewports', () => {
        expect(computeClampedPanelWidth(300, 200, 0.3, 500)).toBe(200);
    });
});

describe('attachResizablePanel source behavior', () => {
    const source = readFileSync(
        join(__dirname, '../../../../src/webview/ui/resizablePanel.ts'),
        'utf8'
    );

    it('uses stable storage keys for width and collapsed state', () => {
        expect(source).toContain("const WIDTH_PREFIX = 'sql-crack.panelWidth.';");
        expect(source).toContain("const COLLAPSED_PREFIX = 'sql-crack.panelCollapsed.';");
        expect(source).toContain('window.localStorage.setItem(widthKey, String(nextWidth));');
        expect(source).toContain('window.localStorage.setItem(collapsedKey, String(collapsed));');
    });

    it('adds resize handle and collapse toggle affordances', () => {
        expect(source).toContain("handle.className = 'sql-crack-resize-handle';");
        expect(source).toContain("toggleBtn.className = 'sql-crack-resize-toggle';");
        expect(source).toContain("cursor: ew-resize;");
        expect(source).toContain("panel.setAttribute('aria-expanded', 'false');");
        expect(source).toContain("panel.setAttribute('aria-expanded', 'true');");
    });

    it('registers and cleans up global drag and resize listeners', () => {
        expect(source).toContain("document.addEventListener('mousemove', onMouseMove, listenerOptions);");
        expect(source).toContain("document.addEventListener('mouseup', onMouseUp, listenerOptions);");
        expect(source).toContain("window.addEventListener('resize', onResize, listenerOptions);");
        expect(source).toContain('panelAbortController.abort();');
        expect(source).toContain('handle.remove();');
    });
});
