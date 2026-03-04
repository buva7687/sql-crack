import type { FlowNode } from '../../../src/webview/types';
import {
    calculateStackedCloudOffsetsFeature,
    updateCloudAndArrowFeature,
} from '../../../src/webview/rendering/cloudPositioning';

function createExpandableNode(id: string, x: number, y: number): FlowNode {
    return {
        id,
        type: 'cte',
        label: id,
        x,
        y,
        width: 160,
        height: 60,
        collapsible: true,
        expanded: true,
        children: [
            { id: `${id}-child`, type: 'table', label: `${id}-child`, x: 0, y: 0, width: 120, height: 40 },
        ],
        childEdges: [],
    };
}

function createSettableElement() {
    const attrs = new Map<string, string>();
    return {
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
        }),
        getAttribute: (name: string) => attrs.get(name) || null,
    };
}

describe('cloudPositioning helpers', () => {
    it('stacks expanded clouds horizontally without overlap', () => {
        const first = createExpandableNode('cte_1', 0, 320);
        const second = createExpandableNode('cte_2', 120, 320);

        const offsets = calculateStackedCloudOffsetsFeature({
            expandableNodes: [second, first],
            currentEdges: [],
            layoutSubflowNodesVertical: () => ({ width: 120, height: 80 }),
        });

        expect(offsets).toHaveLength(2);
        const firstOffset = offsets.find(item => item.nodeId === 'cte_1');
        const secondOffset = offsets.find(item => item.nodeId === 'cte_2');
        expect(firstOffset).toBeDefined();
        expect(secondOffset).toBeDefined();
        expect(firstOffset!.offsetY).toBeLessThan(0);
        expect(secondOffset!.offsetY).toBeLessThan(0);
        expect(secondOffset!.offsetX).toBeGreaterThan(firstOffset!.offsetX);
    });

    it('updates group transform and arrow for expanded nodes', () => {
        const node = createExpandableNode('cte_1', 100, 300);
        const group = createSettableElement();
        const arrow = createSettableElement();

        updateCloudAndArrowFeature({
            node,
            cloudElements: new Map([
                ['cte_1', {
                    group: group as any,
                    cloud: createSettableElement() as any,
                    title: createSettableElement() as any,
                    arrow: arrow as any,
                    subflowGroup: createSettableElement() as any,
                    nestedSvg: createSettableElement() as any,
                    closeButton: createSettableElement() as any,
                }],
            ]),
            ensureCloudOffset: () => ({ offsetX: 220, offsetY: -180 }),
            layoutSubflowNodesVertical: () => ({ width: 140, height: 90 }),
        });

        expect(group.setAttribute).toHaveBeenCalledWith('transform', expect.stringContaining('translate('));
        expect(arrow.setAttribute).toHaveBeenCalledWith('d', expect.stringContaining('M '));
    });

    it('does not update collapsed nodes or nodes without cloud render data', () => {
        const node = createExpandableNode('cte_1', 100, 300);
        node.expanded = false;
        const cloud = createSettableElement();

        updateCloudAndArrowFeature({
            node,
            cloudElements: new Map([
                ['cte_1', {
                    group: createSettableElement() as any,
                    cloud: cloud as any,
                    title: createSettableElement() as any,
                    arrow: createSettableElement() as any,
                    subflowGroup: createSettableElement() as any,
                }],
            ]),
            ensureCloudOffset: () => ({ offsetX: 0, offsetY: 0 }),
            layoutSubflowNodesVertical: () => ({ width: 120, height: 80 }),
        });

        expect(cloud.setAttribute).not.toHaveBeenCalled();
    });
});
