import { readFileSync } from 'fs';
import { join } from 'path';

describe('default layout initialization', () => {
    const rendererSource = readFileSync(
        join(__dirname, '../../../src/webview/renderer.ts'),
        'utf8'
    );

    it('accepts all valid LayoutType values from window.defaultLayout', () => {
        // The state initializer should not only check for 'horizontal'
        // It should accept vertical, horizontal, compact, force, radial
        expect(rendererSource).toContain("'vertical', 'horizontal', 'compact', 'force', 'radial'");
        // Should NOT have the old pattern that only mapped horizontal
        expect(rendererSource).not.toMatch(
            /layoutType:\s*\(window\.defaultLayout\s*===\s*'horizontal'\s*\?\s*'horizontal'\s*:\s*'vertical'\)/
        );
    });

    it('applies non-vertical layout after fitView in render()', () => {
        // After fitView(), render() should call switchLayout for non-vertical defaults
        // This ensures parser positions (always vertical) get recomputed
        expect(rendererSource).toContain("if (state.layoutType && state.layoutType !== 'vertical')");
        expect(rendererSource).toContain('switchLayout(state.layoutType)');
    });

    it('updateNodeEdges uses calculateEdgePath instead of hardcoded vertical math', () => {
        // Extract the updateNodeEdges function body
        const fnMatch = rendererSource.match(
            /function updateNodeEdges\(node: FlowNode\)[\s\S]*?^}/m
        );
        expect(fnMatch).not.toBeNull();
        const fnBody = fnMatch![0];

        // Should use layout-aware calculateEdgePath
        expect(fnBody).toContain('calculateEdgePath(');

        // Should NOT have hardcoded vertical-only edge math
        expect(fnBody).not.toContain('sourceNode.y + sourceNode.height;');
        expect(fnBody).not.toContain('const midY = (y1 + y2) / 2');
    });

    it('node drag handler updates SVG visual position via transform', () => {
        // The drag mousemove handler must update the node group's transform
        // so the visual position matches the data model (node.x, node.y)
        // Same pattern as switchLayout: translate(node.x - origX, node.y - origY)
        const dragSection = rendererSource.match(
            /isDraggingNode && state\.draggingNodeId[\s\S]*?updateNodeEdges\(node\)/
        );
        expect(dragSection).not.toBeNull();
        const dragBody = dragSection![0];

        // Must update the SVG group transform during drag
        expect(dragBody).toContain("nodeGroup.setAttribute('transform'");
        expect(dragBody).toContain('.node-rect');
        // Must happen BEFORE updateNodeEdges so edges connect to the visual position
        const transformIdx = dragBody.indexOf("setAttribute('transform'");
        const edgesIdx = dragBody.indexOf('updateNodeEdges');
        expect(transformIdx).toBeLessThan(edgesIdx);
    });
});

describe('SQL Server dialect in package.json', () => {
    const packageJson = JSON.parse(
        readFileSync(join(__dirname, '../../../package.json'), 'utf8')
    );
    const dialectConfig = packageJson.contributes.configuration.properties['sqlCrack.defaultDialect'];

    it('includes "SQL Server" as an accepted enum value', () => {
        expect(dialectConfig.enum).toContain('SQL Server');
    });

    it('still includes "TransactSQL" for backwards compatibility', () => {
        expect(dialectConfig.enum).toContain('TransactSQL');
    });

    it('has matching enum and enumDescriptions lengths', () => {
        expect(dialectConfig.enum.length).toBe(dialectConfig.enumDescriptions.length);
    });
});
