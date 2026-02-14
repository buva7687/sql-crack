import { readFileSync } from 'fs';
import { join } from 'path';

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
});
