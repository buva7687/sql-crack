import type { FlowEdge, FlowNode } from '../../../src/webview/types';
import {
    layoutSubflowNodes,
    layoutSubflowNodesVertical,
} from '../../../src/webview/rendering/cloudRenderer';

function createNode(id: string, label: string): FlowNode {
    return {
        id,
        type: 'table',
        label,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    };
}

describe('cloudRenderer layout helpers', () => {
    it('returns fallback dimensions for empty horizontal and vertical subflows', () => {
        expect(layoutSubflowNodes([], [])).toEqual({ width: 200, height: 100 });
        expect(layoutSubflowNodesVertical([], [])).toEqual({ width: 120, height: 100 });
    });

    it('lays out horizontal subflows left-to-right and sizes nodes by label length', () => {
        const children = [
            createNode('a', 'short'),
            createNode('b', 'much_longer_label'),
        ];
        const edges: FlowEdge[] = [{ id: 'e1', source: 'a', target: 'b' }];

        const size = layoutSubflowNodes(children, edges);

        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
        expect(children[0].width).toBeGreaterThanOrEqual(80);
        expect(children[1].width).toBeGreaterThan(children[0].width);
        expect(children[1].x).toBeGreaterThan(children[0].x);
    });

    it('lays out vertical subflows top-to-bottom with fixed node sizes', () => {
        const children = [
            createNode('a', 'A'),
            createNode('b', 'B'),
            createNode('c', 'C'),
        ];
        const edges: FlowEdge[] = [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e2', source: 'b', target: 'c' },
        ];

        const size = layoutSubflowNodesVertical(children, edges);

        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
        expect(children.every(child => child.width === 180)).toBe(true);
        expect(children.every(child => child.height === 60)).toBe(true);
        expect(children[1].y).toBeGreaterThan(children[0].y);
        expect(children[2].y).toBeGreaterThan(children[1].y);
    });
});
