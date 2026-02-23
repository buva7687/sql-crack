/**
 * Regression tests for cloud child node selection and details panel lookup.
 *
 * Guards against:
 *   1. Cloud child nodes missing click handlers (selectNode callback)
 *   2. Details panel not finding child nodes (findNodeById recursive search)
 *   3. Node selection not finding child nodes for navigation
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const srcDir = join(__dirname, '../../../src/webview');
const cloudRendererSource = readFileSync(join(srcDir, 'rendering/cloudRenderer.ts'), 'utf8');
const infoPanelSource = readFileSync(join(srcDir, 'panels/infoPanel.ts'), 'utf8');
const nodeSelectionSource = readFileSync(join(srcDir, 'interaction/nodeSelection.ts'), 'utf8');
const rendererSource = readFileSync(join(srcDir, 'renderer.ts'), 'utf8');

describe('Cloud child node click handler', () => {
    it('CloudSubflowRenderCallbacks includes selectNode', () => {
        expect(cloudRendererSource).toMatch(
            /interface CloudSubflowRenderCallbacks[\s\S]*?selectNode/
        );
    });

    it('renderCloudSubflow destructures selectNode from options', () => {
        // The function body should destructure selectNode
        const fnMatch = cloudRendererSource.match(
            /export function renderCloudSubflow[\s\S]*?= options;/
        );
        expect(fnMatch).not.toBeNull();
        expect(fnMatch![0]).toContain('selectNode');
    });

    it('child nodes have click event listener with stopPropagation', () => {
        // Ensure click listener is attached to childGroup
        expect(cloudRendererSource).toMatch(
            /childGroup\.addEventListener\('click'/
        );
        // Ensure stopPropagation is called to prevent bubble to parent cloud
        const clickMatch = cloudRendererSource.match(
            /childGroup\.addEventListener\('click'[\s\S]*?stopPropagation/
        );
        expect(clickMatch).not.toBeNull();
    });

    it('click handler calls selectNode with child.id', () => {
        const clickMatch = cloudRendererSource.match(
            /childGroup\.addEventListener\('click'[\s\S]*?selectNode\(child\.id/
        );
        expect(clickMatch).not.toBeNull();
    });

    it('renderer passes selectNode callback to renderCloudSubflowFeature', () => {
        // The renderCloudSubflow wrapper in renderer.ts should pass selectNode
        const wrapperMatch = rendererSource.match(
            /renderCloudSubflowFeature\(\{[\s\S]*?\}\)/
        );
        expect(wrapperMatch).not.toBeNull();
        expect(wrapperMatch![0]).toContain('selectNode');
    });
});

describe('findNodeById recursive search in details panel', () => {
    it('infoPanel.ts has findNodeById helper function', () => {
        expect(infoPanelSource).toMatch(/function findNodeById/);
    });

    it('findNodeById recurses into node.children', () => {
        const fnMatch = infoPanelSource.match(
            /function findNodeById[\s\S]*?^}/m
        );
        expect(fnMatch).not.toBeNull();
        const fnBody = fnMatch![0];
        // Should check for children and recurse
        expect(fnBody).toContain('node.children');
        expect(fnBody).toContain('findNodeById(node.children');
    });

    it('updateDetailsPanelContent uses findNodeById instead of flat find', () => {
        // Should call findNodeById, not currentNodes.find
        expect(infoPanelSource).toMatch(/findNodeById\(currentNodes,\s*nodeId\)/);
    });
});

describe('findNodeById recursive search in node selection', () => {
    it('nodeSelection.ts has findNodeById helper function', () => {
        expect(nodeSelectionSource).toMatch(/function findNodeById/);
    });

    it('selectNodeFeature uses findNodeById for navigation lookup', () => {
        expect(nodeSelectionSource).toMatch(/findNodeById\(currentNodes,\s*nodeId\)/);
    });

    it('findNodeById in nodeSelection recurses into children', () => {
        const fnMatch = nodeSelectionSource.match(
            /function findNodeById[\s\S]*?^}/m
        );
        expect(fnMatch).not.toBeNull();
        const fnBody = fnMatch![0];
        expect(fnBody).toContain('node.children');
        expect(fnBody).toContain('findNodeById(node.children');
    });
});
