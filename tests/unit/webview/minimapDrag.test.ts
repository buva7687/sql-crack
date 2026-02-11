import { readFileSync } from 'fs';
import { join } from 'path';

describe('minimap drag-to-pan', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    it('defines setupMinimapDrag function', () => {
        expect(rendererSource).toContain('function setupMinimapDrag(minimapContainer: HTMLDivElement): void');
    });

    it('calls setupMinimapDrag during initialization', () => {
        expect(rendererSource).toContain('setupMinimapDrag(minimapContainer)');
    });

    it('registers mousedown listener on minimap container', () => {
        expect(rendererSource).toMatch(/minimapContainer\.addEventListener\('mousedown'/);
    });

    it('registers document-level mousemove and mouseup for continuous drag', () => {
        expect(rendererSource).toMatch(/document\.addEventListener\('mousemove', onMouseMove\)/);
        expect(rendererSource).toMatch(/document\.addEventListener\('mouseup', onMouseUp\)/);
    });

    it('cleans up document listeners on mouseup', () => {
        expect(rendererSource).toMatch(/document\.removeEventListener\('mousemove', onMouseMove\)/);
        expect(rendererSource).toMatch(/document\.removeEventListener\('mouseup', onMouseUp\)/);
    });

    it('converts minimap coordinates to graph coordinates for panning', () => {
        // Verifies the reverse-mapping math: minimap click → graph position → viewport offset
        expect(rendererSource).toContain('panToMinimapPosition(e)');
        expect(rendererSource).toMatch(/const graphX = \(clickX - padding\) \/ mapScale \+ bounds\.minX/);
        expect(rendererSource).toMatch(/const graphY = \(clickY - padding\) \/ mapScale \+ bounds\.minY/);
    });

    it('centers viewport on clicked position', () => {
        expect(rendererSource).toMatch(/state\.offsetX = -\(graphX - visibleWidth \/ 2\) \* state\.scale/);
        expect(rendererSource).toMatch(/state\.offsetY = -\(graphY - visibleHeight \/ 2\) \* state\.scale/);
    });

    it('calls updateTransform after panning', () => {
        // Extract the panToMinimapPosition function body and verify it ends with updateTransform
        const fnMatch = rendererSource.match(/function panToMinimapPosition[\s\S]*?updateTransform\(\)/);
        expect(fnMatch).not.toBeNull();
    });

    it('stops event propagation to prevent main SVG pan', () => {
        expect(rendererSource).toMatch(/e\.stopPropagation\(\)/);
    });
});
