import { readFileSync } from 'fs';
import { join } from 'path';

describe('minimap viewport sync', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    it('updates minimap viewport directly during pan/zoom transforms', () => {
        expect(rendererSource).toContain('function updateTransform()');
        expect(rendererSource).toContain('updateMinimapViewport();');
        expect(rendererSource).toContain('shouldShowMinimap(nodesForMinimap.length)');

        const updateTransformMatch = rendererSource.match(/function updateTransform\(\): void \{[\s\S]*?\n\}/);
        expect(updateTransformMatch).not.toBeNull();
        const updateTransformSource = updateTransformMatch![0];
        expect(updateTransformSource).not.toContain("new CustomEvent('transform-update')");
        expect(updateTransformSource).not.toContain('document.dispatchEvent');
    });
});
