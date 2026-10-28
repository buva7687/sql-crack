import { getLineageGraphScriptFragment } from '../../../../src/workspace/ui/scripts/lineageGraph';

/** Pull one named function out of the generated client script and compile it. */
function extractFunction(name: string): (container: unknown, rect: DOMRectLike) => number {
    const script = getLineageGraphScriptFragment();
    const start = script.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = script.indexOf('{', start);
    for (; end < script.length; end++) {
        if (script[end] === '{') { depth++; }
        if (script[end] === '}' && --depth === 0) { break; }
    }
    const source = script.slice(start, end + 1);
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
        expect(script).toContain('const availableHeight = fitHeight - padding * 2;');
        expect(script).toContain('const containerCenterY = fitHeight / 2;');
    });
});
