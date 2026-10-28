import { readFileSync } from 'fs';
import { join } from 'path';
import { setupMinimapDrag } from '../../../src/webview/features/minimap';
import { setMinimapMode, shouldShowMinimap } from '../../../src/webview/minimapVisibility';
import { createFakeElement, installFakeDocument, uninstallFakeDocument } from '../../helpers/fakeDom';

describe('minimap drag-to-pan', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );
    const minimapFeatureSource = readFileSync(
        join(__dirname, '../../../src/webview/features/minimap.ts'),
        'utf8'
    );
    const bootstrapSource = readFileSync(
        join(__dirname, '../../../src/webview/ui/rendererBootstrap.ts'),
        'utf8'
    );

    it('defines setupMinimapDrag function', () => {
        expect(rendererSource).toContain('function setupMinimapDrag(minimapContainer: HTMLDivElement): void');
    });

    it('calls setupMinimapDrag during initialization', () => {
        expect(bootstrapSource).toContain('onSetupMinimapDrag(minimapContainer);');
    });

    it('registers mousedown listener on minimap container', () => {
        expect(minimapFeatureSource).toMatch(/minimapContainer\.addEventListener\('mousedown'/);
    });

    it('registers document-level mousemove and mouseup for continuous drag', () => {
        expect(minimapFeatureSource).toMatch(/document\.addEventListener\('mousemove', onMouseMove\)/);
        expect(minimapFeatureSource).toMatch(/document\.addEventListener\('mouseup', onMouseUp\)/);
    });

    it('cleans up document listeners on mouseup', () => {
        expect(minimapFeatureSource).toMatch(/document\.removeEventListener\('mousemove', onMouseMove\)/);
        expect(minimapFeatureSource).toMatch(/document\.removeEventListener\('mouseup', onMouseUp\)/);
    });

    it('converts minimap coordinates to graph coordinates for panning', () => {
        // Verifies the reverse-mapping math: minimap click → graph position → viewport offset
        expect(minimapFeatureSource).toMatch(/const graphX = \(clickX - padding\) \/ mapScale \+ bounds\.minX/);
        expect(minimapFeatureSource).toMatch(/const graphY = \(clickY - padding\) \/ mapScale \+ bounds\.minY/);
    });

    it('centers viewport on clicked position', () => {
        expect(minimapFeatureSource).toMatch(/context\.state\.offsetX = -\(graphX - visibleWidth \/ 2\) \* context\.state\.scale/);
        expect(minimapFeatureSource).toMatch(/context\.state\.offsetY = -\(graphY - visibleHeight \/ 2\) \* context\.state\.scale/);
    });

    it('calls updateTransform after panning', () => {
        const fnMatch = minimapFeatureSource.match(/function panToMinimapPosition[\s\S]*?updateTransform\(\)/);
        expect(fnMatch).not.toBeNull();
    });

    it('stops event propagation to prevent main SVG pan', () => {
        expect(minimapFeatureSource).toMatch(/event\.stopPropagation\(\)/);
    });

    it('delegates setupMinimapDrag from renderer to minimap feature module', () => {
        expect(rendererSource).toContain('setupMinimapDragFeature(minimapContainer, getMinimapContext(), updateTransform)');
    });

    it('uses the current query after drag listeners were installed before the first render', () => {
        installFakeDocument();
        Object.assign(document, { addEventListener: jest.fn(), removeEventListener: jest.fn() });
        setMinimapMode('auto');
        try {
            const contextSource = rendererSource.slice(
                rendererSource.indexOf('function getMinimapContext()'),
                rendererSource.indexOf('export function updateMinimap()'),
            );
            const runtime = new Function('shouldShowMinimap', `
                let currentNodes = [], renderNodes = [];
                const state = { scale: 1, offsetX: 0, offsetY: 0 };
                const svg = { getBoundingClientRect: () => ({ width: 1000, height: 700 }) };
                const calculateBounds = () => ({ minX: 0, minY: 0, width: 500, height: 200 });
                const getNodeColor = () => '#fff';
                ${contextSource}
                return {
                    context: getMinimapContext(),
                    load: (count) => { currentNodes = Array.from({ length: count }, (_, i) => ({ id: 'n' + i })); renderNodes = currentNodes; }
                };
            `)(shouldShowMinimap);
            const minimap = createFakeElement('div');
            minimap.getBoundingClientRect.mockReturnValue({ left: 0, top: 0, width: 150, height: 100 });
            const updateTransform = jest.fn();
            setupMinimapDrag(minimap as unknown as HTMLDivElement, runtime.context, updateTransform);
            const click = () => minimap.dispatchEvent({ type: 'mousedown', clientX: 30, clientY: 30, preventDefault: jest.fn(), stopPropagation: jest.fn() });

            runtime.load(2);
            click();
            expect(updateTransform).toHaveBeenCalledTimes(1);
            expect(runtime.context.state.offsetX).not.toBe(0);

            runtime.load(0);
            click();
            expect(updateTransform).toHaveBeenCalledTimes(1);
            runtime.load(3);
            click();
            expect(updateTransform).toHaveBeenCalledTimes(2);
        } finally {
            uninstallFakeDocument();
            setMinimapMode('auto');
        }
    });
});
