import {
    getConnectedNodeIds,
    getCycledNode,
    getKeyboardNavigableNodes,
    getSiblingCycleTarget,
    sortNodesByLayoutOrder,
} from '../../../../src/webview/navigation/keyboardNavigation';
import { FlowEdge, FlowNode } from '../../../../src/webview/types';

function createNode(id: string, x: number, y: number, depth?: number): FlowNode {
    return {
        id,
        type: 'table',
        label: id.toUpperCase(),
        x,
        y,
        width: 120,
        height: 50,
        ...(depth === undefined ? {} : { depth }),
    };
}

describe('keyboardNavigation helpers', () => {
    const nodes: FlowNode[] = [
        createNode('a', 100, 20, 0),
        createNode('b', 260, 20, 0),
        createNode('c', 80, 180, 1),
        createNode('d', 240, 180, 1),
    ];

    const edges: FlowEdge[] = [
        { id: 'e1', source: 'a', target: 'c' },
        { id: 'e2', source: 'b', target: 'c' },
        { id: 'e3', source: 'c', target: 'd' },
    ];

    it('sorts nodes in layout order for Tab navigation (top-down then left-right)', () => {
        const sorted = sortNodesByLayoutOrder([nodes[3], nodes[1], nodes[2], nodes[0]]);
        expect(sorted.map(node => node.id)).toEqual(['a', 'b', 'c', 'd']);

        const next = getCycledNode(sorted, 'c', 'next');
        expect(next?.id).toBe('d');
    });

    it('cycles in reverse for Shift+Tab navigation', () => {
        const sorted = sortNodesByLayoutOrder(nodes);
        const prev = getCycledNode(sorted, 'a', 'prev');
        expect(prev?.id).toBe('d');
    });

    it('follows upstream and downstream edge connectivity', () => {
        const upstream = getConnectedNodeIds('c', edges, 'upstream');
        expect([...upstream].sort()).toEqual(['a', 'b']);

        const downstream = getConnectedNodeIds('c', edges, 'downstream');
        expect([...downstream]).toEqual(['d']);
    });

    it('filters Tab candidates to visible connected nodes when focus mode is active', () => {
        const filtered = getKeyboardNavigableNodes({
            nodes,
            edges,
            focusModeEnabled: true,
            focusMode: 'upstream',
            selectedNodeId: 'c',
        });

        expect(filtered.map(node => node.id)).toEqual(['a', 'b', 'c']);
    });

    it('returns all nodes when focus mode is disabled', () => {
        const filtered = getKeyboardNavigableNodes({
            nodes,
            edges,
            focusModeEnabled: false,
            focusMode: 'all',
            selectedNodeId: 'c',
        });

        expect(filtered.map(node => node.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('cycles sibling nodes at the same depth for left/right navigation', () => {
        const target = getSiblingCycleTarget({
            nodes,
            currentNode: nodes[2],
            direction: 'next',
            layoutType: 'vertical',
        });

        expect(target?.id).toBe('d');
    });

    it('uses coordinate bucketing for sibling navigation when depth is missing', () => {
        const noDepthNodes: FlowNode[] = [
            createNode('p', 20, 25),
            createNode('q', 140, 22),
            createNode('r', 60, 170),
        ];

        const target = getSiblingCycleTarget({
            nodes: noDepthNodes,
            currentNode: noDepthNodes[0],
            direction: 'next',
            layoutType: 'vertical',
        });

        expect(target?.id).toBe('q');
    });
});
