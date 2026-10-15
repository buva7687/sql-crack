/**
 * Regression: the minimap sits at mid-height on the right edge and the hints
 * panel grows up the same edge. The minimap covered the hints header in short
 * panels (800x600), a minimap set to `always` disappeared in narrow panels, and
 * fit-to-view squeezed the graph into the strip beside the stacked hints panel.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { applyCompactPanelLayout, isCompactPanelLayout } from '../../../src/webview/ui/compactPanelLayout';
import {
    FLOATING_PANEL_GAP,
    HINTS_MIN_HEIGHT_BELOW_MINIMAP,
    computeMinimapPlacement,
} from '../../../src/webview/ui/panelLayout';
import { getMinimapMode, onMinimapModeChange, setMinimapMode } from '../../../src/webview/minimapVisibility';
import { fitViewFeature } from '../../../src/webview/navigation/nodeNavigation';
import type { FlowNode, ViewState } from '../../../src/webview/types';

const MINIMAP_HEIGHT = 102;
const BORDERS = 2;

interface MockElement {
    style: Record<string, string>;
    writes: string[];
}

/** A panel whose box grows with its content until its own max-height stops it. */
function panel(width: number, contentHeight: number, style: Record<string, string> = {}): HTMLElement & MockElement {
    const writes: string[] = [];
    const values: Record<string, string> = { width: `${width}px`, display: '', visibility: '', opacity: '', maxHeight: '', maxWidth: '', ...style };
    const boxHeight = () => Math.min(contentHeight, Number.parseFloat(values.maxHeight) || contentHeight);
    const element = {
        writes,
        style: new Proxy(values, {
            set(target, property: string, value: string) {
                writes.push(property);
                target[property] = value;
                return true;
            },
        }),
        getBoundingClientRect: () => ({ height: boxHeight(), width, left: 0, top: 0 }),
        get scrollHeight() { return contentHeight - BORDERS; },
        get offsetHeight() { return boxHeight(); },
        get clientHeight() { return boxHeight() - BORDERS; },
        querySelector: () => null,
    };
    return element as unknown as HTMLElement & MockElement;
}

function minimapElement(height = MINIMAP_HEIGHT): HTMLElement & MockElement {
    return panel(152, height, { top: '50%', transform: 'translateY(-50%)' });
}

/** Rectangles the layout produced, in container coordinates. */
function layoutOf(height: number, hints: HTMLElement, minimap: HTMLElement) {
    const hintsBottom = height - Number.parseFloat(hints.style.bottom);
    const hintsTop = hintsBottom - hints.getBoundingClientRect().height;
    const minimapTop = minimap.style.top === '50%' ? (height - MINIMAP_HEIGHT) / 2 : Number.parseFloat(minimap.style.top);
    return { hintsTop, hintsBottom, minimapTop, minimapBottom: minimapTop + MINIMAP_HEIGHT };
}

describe('minimap placement next to the hints panel', () => {
    const base = { containerHeight: 800, minimapHeight: MINIMAP_HEIGHT, minTop: 78 };

    it('keeps the default centred position while the hints panel stays below it', () => {
        // 1200x800 with basic-joins.sql: hints top 495, minimap 349..451.
        expect(computeMinimapPlacement({ ...base, pinned: false, hintsTop: 495 }))
            .toEqual({ visible: true, top: null, hintsTopLimit: null });
    });

    it('keeps the default position when there is no hints panel', () => {
        expect(computeMinimapPlacement({ ...base, pinned: false, hintsTop: null }))
            .toEqual({ visible: true, top: null, hintsTopLimit: null });
    });

    it('raises the minimap just above a hints panel that reaches the centre', () => {
        // 800x600: hints top 286 sat under a centred minimap (249..351).
        const placement = computeMinimapPlacement({
            pinned: false, containerHeight: 600, minimapHeight: MINIMAP_HEIGHT, minTop: 137, hintsTop: 286,
        });
        expect(placement).toEqual({ visible: true, top: 176, hintsTopLimit: null });
        expect(placement.top! + MINIMAP_HEIGHT + FLOATING_PANEL_GAP).toBeLessThanOrEqual(286);
    });

    it('hides an auto minimap when it cannot clear the toolbar and the hints panel', () => {
        expect(computeMinimapPlacement({
            pinned: false, containerHeight: 500, minimapHeight: MINIMAP_HEIGHT, minTop: 137, hintsTop: 200,
        })).toEqual({ visible: false, top: null, hintsTopLimit: null });
    });

    it('keeps a pinned minimap and bounds the hints panel below it instead', () => {
        expect(computeMinimapPlacement({
            pinned: true, containerHeight: 700, minimapHeight: MINIMAP_HEIGHT, minTop: 137, hintsTop: 198, hintsBottom: 459,
        })).toEqual({ visible: true, top: 137, hintsTopLimit: 247 });
    });

    it('hides even a pinned minimap when the hints panel would lose its header', () => {
        expect(HINTS_MIN_HEIGHT_BELOW_MINIMAP).toBe(48);
        expect(computeMinimapPlacement({
            pinned: true, containerHeight: 500, minimapHeight: MINIMAP_HEIGHT, minTop: 137, hintsTop: 98, hintsBottom: 259,
        })).toEqual({ visible: false, top: null, hintsTopLimit: null });
    });

    it('does not push a pinned minimap below its centred position', () => {
        const placement = computeMinimapPlacement({
            pinned: true, containerHeight: 300, minimapHeight: MINIMAP_HEIGHT, minTop: 137, hintsTop: 120,
        });
        expect(placement.top).toBe(99);
        expect(placement.hintsTopLimit).toBe(99 + MINIMAP_HEIGHT + FLOATING_PANEL_GAP);
    });
});

describe('minimap in the regular side-by-side layout', () => {
    it('moves above the hints panel at 800x600 instead of covering its header', () => {
        const stats = panel(300, 155);
        const hints = panel(350, 236);
        const minimap = minimapElement();

        applyCompactPanelLayout({ stats, hints, minimap, width: 800, height: 600, legendHeight: 62, minimapMinTop: 137 });

        expect(minimap.style.visibility).toBe('');
        expect(minimap.style.top).toBe('176px');
        expect(minimap.style.transform).toBe('none');
        expect(hints.style.maxHeight).toBe('430px');
        const layout = layoutOf(600, hints, minimap);
        expect(layout.hintsTop).toBe(286);
        expect(layout.minimapBottom + FLOATING_PANEL_GAP).toBeLessThanOrEqual(layout.hintsTop);
    });

    it('leaves the minimap centred at 1200x800', () => {
        const stats = panel(300, 155);
        const hints = panel(350, 236);
        const minimap = minimapElement();

        applyCompactPanelLayout({ stats, hints, minimap, width: 1200, height: 800, legendHeight: 53, minimapMinTop: 78 });

        expect(minimap.style.visibility).toBe('');
        expect(minimap.style.top).toBe('50%');
        expect(minimap.style.transform).toBe('translateY(-50%)');
        expect(minimap.writes).toEqual([]);
        expect(stats.style.bottom).toBe(hints.style.bottom);
    });

    it('returns to the centre when the hints panel is minimized or hidden', () => {
        const stats = panel(300, 155);
        const minimap = minimapElement();
        const tallHints = panel(350, 236);
        applyCompactPanelLayout({ stats, hints: tallHints, minimap, width: 800, height: 600, legendHeight: 62, minimapMinTop: 137 });
        expect(minimap.style.top).toBe('176px');

        const minimizedHints = panel(350, 40);
        applyCompactPanelLayout({ stats, hints: minimizedHints, minimap, width: 800, height: 600, legendHeight: 62, minimapMinTop: 137 });
        expect(minimap.style.top).toBe('50%');
        expect(minimap.style.transform).toBe('translateY(-50%)');

        applyCompactPanelLayout({ stats, hints: tallHints, minimap, width: 800, height: 600, legendHeight: 62, minimapMinTop: 137 });
        expect(minimap.style.top).toBe('176px');

        const hiddenHints = panel(350, 236, { visibility: 'hidden' });
        applyCompactPanelLayout({ stats, hints: hiddenHints, minimap, width: 800, height: 600, legendHeight: 62, minimapMinTop: 137 });
        expect(minimap.style.top).toBe('50%');
    });

    it('ignores a hints panel that fullscreen has removed from layout', () => {
        const fullscreenHints = panel(350, 0);
        const minimap = minimapElement();
        minimap.style.top = '176px';
        minimap.style.transform = 'none';

        applyCompactPanelLayout({ stats: panel(300, 0), hints: fullscreenHints, minimap, width: 800, height: 600, legendHeight: 0, minimapMinTop: 8 });

        expect(minimap.style.top).toBe('50%');
        expect(minimap.style.transform).toBe('translateY(-50%)');
    });

    it('does not touch a minimap the renderer is not displaying', () => {
        const minimap = minimapElement(0);
        applyCompactPanelLayout({ stats: panel(300, 155), hints: panel(350, 400), minimap, width: 800, height: 600, legendHeight: 62, minimapMinTop: 137 });
        expect(minimap.style.visibility).toBe('');
        expect(minimap.style.top).toBe('50%');
    });
});

describe('minimap in the compact stacked layout', () => {
    it('hides an auto minimap below 700px', () => {
        const hints = panel(272, 263);
        const minimap = minimapElement();
        applyCompactPanelLayout({ stats: panel(272, 155), hints, minimap, width: 545, height: 1000, legendHeight: 62, minimapMinTop: 137 });
        expect(minimap.style.visibility).toBe('hidden');
        expect(hints.style.maxHeight).toBe('411px');
    });

    it('keeps a minimap set to always, above the stacked hints panel', () => {
        const stats = panel(272, 155);
        const hints = panel(272, 263);
        const minimap = minimapElement();

        applyCompactPanelLayout({ stats, hints, minimap, width: 545, height: 1000, legendHeight: 62, minimapPinned: true, minimapMinTop: 137 });

        expect(minimap.style.visibility).toBe('');
        expect(minimap.style.top).toBe('386px');
        expect(hints.style.bottom).toBe('241px');
        expect(hints.style.maxHeight).toBe('411px');
        const layout = layoutOf(1000, hints, minimap);
        expect(layout.minimapBottom + FLOATING_PANEL_GAP).toBeLessThanOrEqual(layout.hintsTop);
    });

    it('bounds the hints panel below a pinned minimap when the minimap cannot go higher', () => {
        const stats = panel(272, 155);
        const hints = panel(272, 263);
        const minimap = minimapElement();

        applyCompactPanelLayout({ stats, hints, minimap, width: 545, height: 700, legendHeight: 62, minimapPinned: true, minimapMinTop: 137 });

        expect(minimap.style.visibility).toBe('');
        expect(minimap.style.top).toBe('137px');
        expect(hints.style.maxHeight).toBe('212px');
        const layout = layoutOf(700, hints, minimap);
        expect(layout.minimapBottom + FLOATING_PANEL_GAP).toBeLessThanOrEqual(layout.hintsTop);
        expect(layout.hintsBottom).toBe(700 - 241);
    });

    it('gives way in a panel too short for the minimap and the hints header', () => {
        const hints = panel(272, 263);
        const minimap = minimapElement();

        applyCompactPanelLayout({ stats: panel(272, 155), hints, minimap, width: 545, height: 500, legendHeight: 62, minimapPinned: true, minimapMinTop: 137 });

        expect(minimap.style.visibility).toBe('hidden');
        expect(hints.style.maxHeight).toBe('161px');
    });

    it('settles in one pass, so its own style writes cannot retrigger the layout forever', () => {
        // The layout re-runs on every style mutation of the panels and the minimap.
        for (const height of [1000, 700, 500]) {
            const stats = panel(272, 155);
            const hints = panel(272, 263);
            const minimap = minimapElement();
            const options = { stats, hints, minimap, width: 545, height, legendHeight: 62, minimapPinned: true, minimapMinTop: 137 };

            applyCompactPanelLayout(options);
            const snapshot = [stats, hints, minimap].map(element => ({ ...element.style }));
            stats.writes.length = 0;
            hints.writes.length = 0;
            minimap.writes.length = 0;
            applyCompactPanelLayout(options);

            expect([stats.writes, hints.writes, minimap.writes]).toEqual([[], [], []]);
            expect([stats, hints, minimap].map(element => ({ ...element.style }))).toEqual(snapshot);
        }
    });

    it('shares one compact rule with fit-to-view', () => {
        expect(isCompactPanelLayout(panel(300, 155), panel(350, 236), 699)).toBe(true);
        expect(isCompactPanelLayout(panel(300, 155), panel(350, 236), 700)).toBe(false);
        // Panels the user widened until they no longer fit side by side.
        expect(isCompactPanelLayout(panel(420, 155), panel(380, 236), 800)).toBe(true);
        expect(isCompactPanelLayout(panel(420, 155), panel(380, 236, { visibility: 'hidden' }), 800)).toBe(false);
    });
});

describe('fit to view around stacked panels', () => {
    function createNode(id: string, x: number, y: number): FlowNode {
        return { id, type: 'table', label: id, x, y, width: 180, height: 60 };
    }

    function createSvg(width: number, height: number, stats: [number, number], hints: [number, number]): SVGSVGElement {
        const mock = ([panelWidth, panelHeight]: [number, number]) => ({
            offsetWidth: panelWidth,
            offsetHeight: panelHeight,
            style: { width: `${panelWidth}px`, display: '', visibility: 'visible', opacity: '1', transform: '' },
            getBoundingClientRect: () => ({ width: panelWidth, height: panelHeight }),
        });
        const elements: Record<string, unknown> = { '.stats-panel': mock(stats), '.hints-panel': mock(hints), '.details-panel': null };
        return {
            getBoundingClientRect: () => ({ width, height }),
            parentElement: { querySelector: (selector: string) => elements[selector] ?? null },
        } as unknown as SVGSVGElement;
    }

    function fit(svg: SVGSVGElement, nodes: FlowNode[]): ViewState {
        const state = { scale: 1, offsetX: 0, offsetY: 0, selectedNodeId: null, zoomedNodeId: null, previousZoomState: null } as unknown as ViewState;
        fitViewFeature({
            svg,
            renderNodes: [],
            currentNodes: nodes,
            cloudOffsets: new Map(),
            state,
            onUpdateTransform: jest.fn(),
            onUpdateZoomIndicator: jest.fn(),
            onSetFitViewScale: jest.fn(),
        } as unknown as Parameters<typeof fitViewFeature>[0]);
        return state;
    }

    const wideGraph = [createNode('a', 0, 0), createNode('b', 200, 0), createNode('c', 100, 660)]; // 380 x 720
    const slimGraph = [createNode('a', 0, 0), createNode('c', 0, 660)]; // 180 x 720

    it('uses the full width above the stack instead of the strip beside the hints panel', () => {
        const state = fit(createSvg(545, 1000, [272, 155], [272, 263]), wideGraph);

        // Beside the hints panel only (545 - 304 - 160) / 380 = 0.21 was possible.
        const stackHeight = 155 + FLOATING_PANEL_GAP + 263;
        expect(state.scale).toBeCloseTo((1000 - 100 - stackHeight - 160) / 720, 5);
        expect(state.scale).toBeGreaterThan(0.4);
        // The fitted graph ends above the stacked panels.
        expect(state.offsetY + 720 * state.scale).toBeLessThanOrEqual(1000 - 78 - stackHeight);
    });

    it('keeps the column beside the hints panel when that fits the graph larger', () => {
        const state = fit(createSvg(545, 1000, [272, 248], [272, 365]), slimGraph);

        // Above the stack: (1000 - 100 - 580 - 160) / 720 = 0.22; beside the hints panel: 81 / 180.
        expect(state.scale).toBeCloseTo((545 - (272 + 32) - 160) / 180, 5);
        // The column ends above the stats panel underneath it.
        expect(state.offsetY + 720 * state.scale).toBeLessThanOrEqual(1000 - 78 - 248);
    });

    it('always leaves the graph a usable height in a short compact panel', () => {
        const state = fit(createSvg(545, 500, [272, 155], [272, 161]), wideGraph);
        expect(state.scale).toBeGreaterThanOrEqual(160 / 720 - 1e-9);
    });

    it('still reserves only the hints panel width in the regular layout', () => {
        const state = fit(createSvg(1200, 800, [300, 155], [350, 236]), wideGraph);
        const expectedScale = Math.min((1200 - 382 - 160) / 380, (800 - 100 - 160) / 720, 1.5);
        expect(state.scale).toBeCloseTo(expectedScale, 5);
    });
});

describe('minimap setting wiring', () => {
    const layoutSource = readFileSync(join(__dirname, '../../../src/webview/ui/compactPanelLayout.ts'), 'utf8');
    const indexSource = readFileSync(join(__dirname, '../../../src/webview/index.ts'), 'utf8');

    afterEach(() => {
        setMinimapMode('auto');
    });

    it('treats only an explicit always setting as pinned', () => {
        expect(layoutSource).toContain("minimapPinned: getMinimapMode() === 'always',");
        expect(getMinimapMode()).toBe('auto');
        setMinimapMode('always');
        expect(getMinimapMode()).toBe('always');
    });

    it('re-runs the layout when the mode changes, since auto and always differ only in placement', () => {
        expect(layoutSource).toContain('const stopWatchingMinimapMode = onMinimapModeChange(schedule);');
        expect(layoutSource).toMatch(/mutations\?\.disconnect\(\);\s+stopWatchingMinimapMode\(\);/);

        const listener = jest.fn();
        const unsubscribe = onMinimapModeChange(listener);
        setMinimapMode('always');
        setMinimapMode('always');
        expect(listener).toHaveBeenCalledTimes(1);
        setMinimapMode('auto');
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
        setMinimapMode('never');
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('re-runs the layout when the renderer shows or hides the minimap, without watching its viewport marker', () => {
        expect(layoutSource).toContain("mutations?.observe(minimap, { attributes: true, attributeFilter: ['style'] });");
    });

    it('refreshes the minimap when sqlCrack.showMinimap changes while the panel is open', () => {
        expect(indexSource).toContain("showMinimap: window.showMinimap || 'auto',");
        expect(indexSource).toMatch(
            /setMinimapMode\(config\.showMinimap as MinimapMode\);\s+if \(previous\.showMinimap !== config\.showMinimap\) \{\s+updateMinimap\(\);/
        );
    });

    it('keeps the renderer in charge of whether the minimap is displayed at all', () => {
        // The layout only sets visibility and position; `display` follows node count and the never/auto/always setting.
        expect(layoutSource).not.toContain("'display'");
        expect(layoutSource).not.toContain('localStorage');
    });
});
