/**
 * Regression test for Observation #5:
 * calculateStackedCloudOffsetsFeature must use node.childEdges (not filter currentEdges)
 * for subflow layout sizing.
 *
 * Previously, child node IDs (e.g. child_table_*) never appeared in currentEdges
 * (which are top-level edges), so the filter returned [] and layout was incorrect.
 */

import type { FlowNode, FlowEdge } from '../../../src/webview/types';
import { calculateStackedCloudOffsetsFeature } from '../../../src/webview/rendering/cloudPositioning';

function makeNode(id: string, x: number, childEdges: FlowEdge[]): FlowNode {
    return {
        id,
        type: 'cte',
        label: id,
        x,
        y: 300,
        width: 160,
        height: 60,
        collapsible: true,
        expanded: true,
        children: [
            { id: `${id}_child1`, type: 'table', label: 'table1', x: 0, y: 0, width: 120, height: 40 },
            { id: `${id}_child2`, type: 'table', label: 'table2', x: 0, y: 120, width: 120, height: 40 },
        ],
        childEdges,
    };
}

describe('Audit regression: #5 — cloud positioning uses node.childEdges', () => {
    it('passes child edges to layout function even when currentEdges is empty', () => {
        const childEdge: FlowEdge = {
            id: 'ce1',
            source: 'cte1_child1',
            target: 'cte1_child2',
        };
        const node = makeNode('cte1', 0, [childEdge]);

        let receivedEdges: FlowEdge[] = [];
        const layoutFn = (children: FlowNode[], edges: FlowEdge[]) => {
            receivedEdges = edges;
            return { width: 120, height: 80 };
        };

        calculateStackedCloudOffsetsFeature({
            expandableNodes: [node],
            currentEdges: [], // empty top-level edges — the old bug would pass [] to layout
            layoutSubflowNodesVertical: layoutFn,
        });

        // The layout function should receive the child edges from node.childEdges
        expect(receivedEdges).toHaveLength(1);
        expect(receivedEdges[0].id).toBe('ce1');
    });

    it('does not break when node has no childEdges property', () => {
        const node = makeNode('cte2', 0, []);
        // Simulate missing childEdges
        delete (node as any).childEdges;

        const offsets = calculateStackedCloudOffsetsFeature({
            expandableNodes: [node],
            currentEdges: [],
            layoutSubflowNodesVertical: () => ({ width: 100, height: 60 }),
        });

        expect(offsets).toHaveLength(1);
    });
});
