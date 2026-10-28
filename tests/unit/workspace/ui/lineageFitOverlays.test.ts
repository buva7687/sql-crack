import { getLineageGraphScriptFragment } from '../../../../src/workspace/ui/scripts/lineageGraph';

/** Pull one named function out of the generated client script. */
function extractFunctionSource(name: string): string {
    const script = getLineageGraphScriptFragment();
    const start = script.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = script.indexOf('{', start);
    for (; end < script.length; end++) {
        if (script[end] === '{') { depth++; }
        if (script[end] === '}' && --depth === 0) { break; }
    }
    return script.slice(start, end + 1);
}

function extractFunction(name: string): (container: unknown, rect: DOMRectLike) => number {
    const source = extractFunctionSource(name);
    const visible = () => ({ display: 'block', visibility: 'visible' });
    return new Function('getComputedStyle', `${source}; return ${name};`)(visible);
}

interface DOMRectLike { top: number; bottom: number; height: number; width: number }

const rect = (top: number, height: number, width = 200): DOMRectLike => ({ top, bottom: top + height, height, width });

function container(overlays: Record<string, DOMRectLike | null>) {
    return {
        querySelector: (selector: string) => {
            const r = overlays[selector];
            return r ? { getBoundingClientRect: () => r } : null;
        },
    };
}

describe('lineage fit area', () => {
    const fitHeight = extractFunction('getLineageFitHeight');
    const canvas = rect(100, 600, 1100); // top 100, bottom 700

    it('stops above the highest bottom overlay so the overview and controls never cover nodes', () => {
        const height = fitHeight(container({
            '.lineage-zoom-controls': rect(620, 40),
            '#lineage-minimap': rect(520, 150, 180),
            '#lineage-legend': rect(660, 40, 1100),
        }), canvas);
        expect(height).toBe(520 - 100);
    });

    it('uses the whole canvas when no overlay is shown', () => {
        expect(fitHeight(container({}), canvas)).toBe(600);
    });

    it('keeps a usable height in very short panels', () => {
        expect(fitHeight(container({ '#lineage-minimap': rect(110, 150, 180) }), canvas)).toBe(160);
    });

    it('fits and centres the graph within that area', () => {
        const script = getLineageGraphScriptFragment();
        expect(script).toContain('const fitHeight = getLineageFitHeight(currentContainer, containerRect);');
        expect(script).toContain('const availableHeight = Math.max(1, fitHeight - padding * 2);');
        expect(script).toContain('const containerCenterY = fitHeight / 2;');
    });

    it('fits a tall graph above the overlays even when it needs less than 30% zoom', () => {
        const canvas = rect(100, 400, 1100);
        const bbox = { x: 75, y: 125, width: 800, height: 1000 };
        const overlays = container({
            '.lineage-zoom-controls': rect(390, 40),
            '#lineage-minimap': rect(283, 147, 180),
            '#lineage-legend': rect(448, 52, 1100),
        });
        const graphContainer = {
            getBoundingClientRect: () => canvas,
            querySelector: (selector: string) => selector === '.lineage-graph-svg .lineage-graph-container'
                ? { getBBox: () => bbox }
                : overlays.querySelector(selector),
        };
        const script = getLineageGraphScriptFragment();
        const zoomButtons = script.slice(script.indexOf("zoomInBtn?.addEventListener('click'"), script.indexOf("zoomFitBtn?.addEventListener('click'"));
        const wheel = script.slice(script.indexOf("svg.addEventListener('wheel'"), script.indexOf("svg.addEventListener('mousedown'"));
        const handlers: Record<string, (event?: unknown) => void> = {};
        const target = (name: string) => ({
            addEventListener: (_event: string, handler: (event?: unknown) => void) => { handlers[name] = handler; },
        });
        const fit = new Function('document', 'getComputedStyle', 'zoomInBtn', 'zoomOutBtn', 'svg', `
            let lineageAutoFitNodeId = null, lineageCurrentNodeId = null;
            let lineageScale = 1, lineageOffsetX = 0, lineageOffsetY = 0;
            let lineageMinScale = 0.2;
            function updateLineageTransform() {}
            ${extractFunctionSource('getLineageFitHeight')}
            ${extractFunctionSource('fitToContainer')}
            fitToContainer();
            ${zoomButtons}
            ${wheel}
            return () => ({ scale: lineageScale, x: lineageOffsetX, y: lineageOffsetY });
        `);
        const getState = fit(
            { getElementById: () => graphContainer },
            () => ({ display: 'block', visibility: 'visible' }),
            target('zoomIn'), target('zoomOut'), target('wheel'),
        );
        const state = getState();
        const clearHeight = 283 - canvas.top;
        expect(state.scale).toBeGreaterThan(0);
        expect(state.scale).toBeLessThan(0.3);
        expect(bbox.y * state.scale + state.y).toBeGreaterThanOrEqual(18);
        expect((bbox.y + bbox.height) * state.scale + state.y).toBeLessThanOrEqual(clearHeight - 18);
        expect(bbox.x * state.scale + state.x).toBeGreaterThanOrEqual(18);
        expect((bbox.x + bbox.width) * state.scale + state.x).toBeLessThanOrEqual(canvas.width - 18);

        // Neither zoom-out control should increase the scale after fitting below 20%.
        handlers.zoomOut();
        expect(getState().scale).toBe(state.scale);
        handlers.wheel({ deltaY: 1, preventDefault: jest.fn() });
        expect(getState().scale).toBe(state.scale);
        handlers.zoomIn();
        expect(getState().scale).toBeGreaterThan(state.scale);
        handlers.zoomOut();
        expect(getState().scale).toBeCloseTo(state.scale);
    });
});
