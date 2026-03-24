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
    const computationsSource = readFileSync(
        join(__dirname, '../../../src/webview/rendering/computations.ts'),
        'utf8'
    );

    // The pure logic now lives in computations.ts
    const fnMatch = computationsSource.match(
        /function calculateEdgePath\(sourceNode: FlowNode, targetNode: FlowNode, layoutType: LayoutType\): string \{([\s\S]*?)\n\}/
    );
    const fnBody = fnMatch ? fnMatch[1] : '';

    it('function exists and is exported', () => {
        expect(rendererSource).toContain('export function calculateEdgePath(');
        expect(edgeRendererSource).toContain('export function calculateEdgePath(');
        expect(rendererSource).toContain('return calculateEdgePathFeature(sourceNode, targetNode, layoutType);');
    });

    it('edgeRenderer delegates to computations module', () => {
        expect(edgeRendererSource).toContain("import {");
        expect(edgeRendererSource).toContain("from './computations'");
        expect(edgeRendererSource).toContain('return calculateEdgePathPure(sourceNode, targetNode, layoutType);');
    });

    it('handles horizontal layout with right/left connections', () => {
        expect(fnBody).toContain("layoutType === 'horizontal'");
        expect(fnBody).toContain('sourceNode.x + sourceNode.width');
        expect(fnBody).toContain('targetNode.y + targetNode.height / 2');
    });

    it('handles force and radial layouts with smart edge routing', () => {
        expect(fnBody).toContain("layoutType === 'force' || layoutType === 'radial'");
        expect(fnBody).toContain('Math.atan2');
    });

    it('handles vertical/compact layouts with top/bottom connections', () => {
        expect(fnBody).toContain('sourceNode.y + sourceNode.height');
        expect(fnBody).toContain('targetNode.x + targetNode.width / 2');
    });

    it('all five layout types are handled (no missing branches)', () => {
        expect(fnBody).toContain("'horizontal'");
        expect(fnBody).toContain("'force'");
        expect(fnBody).toContain("'radial'");
        expect(fnBody).toContain('Vertical/compact');
    });

    it('guards dist against zero to prevent NaN in SVG path', () => {
        // The guard now lives in computations.ts
        expect(computationsSource).toContain('Math.sqrt(dx * dx + dy * dy) || 1');
    });

    it('renderEdge uses calculateEdgePath with the active layout type', () => {
        expect(edgeRendererSource).toContain('layoutType: LayoutType;');
        expect(edgeRendererSource).toContain("path.setAttribute('d', calculateEdgePath(sourceNode, targetNode, options.layoutType));");
        expect(rendererSource).toContain("layoutType: state.layoutType || 'vertical',");
    });
});
