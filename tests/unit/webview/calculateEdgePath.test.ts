import { readFileSync } from 'fs';
import { join } from 'path';

describe('calculateEdgePath layout support', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );
    const edgeRendererSource = readFileSync(
        join(__dirname, '../../../src/webview/rendering/edgeRenderer.ts'),
        'utf8'
    );

    // Extract the calculateEdgePath function body
    const fnMatch = edgeRendererSource.match(
        /function calculateEdgePath\(sourceNode: FlowNode, targetNode: FlowNode, layoutType: LayoutType\): string \{([\s\S]*?)\n\}/
    );
    const fnBody = fnMatch ? fnMatch[1] : '';

    it('function exists and is exported', () => {
        expect(rendererSource).toContain('export function calculateEdgePath(');
        expect(edgeRendererSource).toContain('export function calculateEdgePath(');
        expect(rendererSource).toContain('return calculateEdgePathFeature(sourceNode, targetNode, layoutType);');
    });

    it('handles horizontal layout with right/left connections', () => {
        // Horizontal should use sourceNode.x + sourceNode.width (right edge) and targetNode.x (left edge)
        expect(fnBody).toContain("layoutType === 'horizontal'");
        expect(fnBody).toContain('sourceNode.x + sourceNode.width');
        expect(fnBody).toContain('targetNode.y + targetNode.height / 2');
    });

    it('handles force and radial layouts with smart edge routing', () => {
        expect(fnBody).toContain("layoutType === 'force' || layoutType === 'radial'");
        // Uses angle-based routing
        expect(fnBody).toContain('Math.atan2');
    });

    it('handles vertical/compact layouts with top/bottom connections', () => {
        // Default branch handles vertical and compact
        expect(fnBody).toContain('sourceNode.y + sourceNode.height');
        expect(fnBody).toContain('targetNode.x + targetNode.width / 2');
    });

    it('all five layout types are handled (no missing branches)', () => {
        // horizontal, force, radial have explicit branches; vertical and compact fall to else
        expect(fnBody).toContain("'horizontal'");
        expect(fnBody).toContain("'force'");
        expect(fnBody).toContain("'radial'");
        // The else branch covers vertical and compact — verify the comment
        expect(fnBody).toContain('Vertical/compact');
    });
});
