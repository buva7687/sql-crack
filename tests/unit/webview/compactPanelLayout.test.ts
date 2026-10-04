import { applyCompactPanelLayout } from '../../../src/webview/ui/compactPanelLayout';

function panel(width: number, height: number) {
    const element = {
        style: { width: `${width}px`, display: '', visibility: '', opacity: '', maxHeight: '', maxWidth: '' } as Record<string, string>,
        getBoundingClientRect: () => ({ height: Math.min(height, Number.parseFloat(element.style.maxHeight) || height), width }),
        querySelector: () => null,
    };
    return element as unknown as HTMLElement;
}

describe('compact SQL Flow panels', () => {
    it.each([240, 400, 600])('stacks panels within a %s px viewport without covering the toolbar or legend', width => {
        const stats = panel(300, 240);
        const hints = panel(350, 220);
        const minimap = panel(150, 100);
        applyCompactPanelLayout({ stats, hints, minimap, width, height: 500, legendHeight: 64 });
        const statsBottom = Number.parseFloat(stats.style.bottom);
        const hintsBottom = Number.parseFloat(hints.style.bottom);
        expect(hintsBottom).toBeGreaterThanOrEqual(statsBottom + stats.getBoundingClientRect().height + 8);
        expect(hintsBottom + hints.getBoundingClientRect().height).toBeLessThanOrEqual(500 - 92);
        expect(statsBottom).toBe(80);
        expect(stats.style.maxWidth).toBe(`${width - 32}px`);
        expect(minimap.style.visibility).toBe('hidden');
    });

    it('restores the normal row when the viewport widens without changing preferred widths', () => {
        const stats = panel(300, 240);
        const hints = panel(350, 220);
        const minimap = panel(150, 100);
        applyCompactPanelLayout({ stats, hints, minimap, width: 400, height: 700, legendHeight: 40 });
        applyCompactPanelLayout({ stats, hints, minimap, width: 1200, height: 700, legendHeight: 40 });
        expect(stats.style.bottom).toBe(hints.style.bottom);
        expect(stats.style.width).toBe('300px');
        expect(hints.style.width).toBe('350px');
        expect(stats.style.maxWidth).toBe('none');
        expect(minimap.style.visibility).toBe('');
    });

    it('gives a single visible panel the available height without reserving space for a hidden panel', () => {
        const stats = panel(300, 200);
        const hints = panel(350, 300);
        stats.style.display = 'none';
        applyCompactPanelLayout({ stats, hints, minimap: null, width: 400, height: 500, legendHeight: 64 });
        expect(hints.style.bottom).toBe('80px');
        expect(hints.style.maxHeight).toBe('328px');
    });
});
