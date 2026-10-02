import { createClusters, NodeCluster } from '../../../../src/webview/clustering';
import { layoutGraphHorizontal } from '../../../../src/webview/parser/forceLayout';
import {
    applyClusteringFeature,
    preserveProjectedNodePositions,
} from '../../../../src/webview/rendering/clusterProjection';
import type { FlowEdge, FlowNode } from '../../../../src/webview/types';

// Horizontal layout uses dagre; avoid loading the unrelated ESM force engine.
jest.mock('d3-force', () => ({}));

function makeGraph(): { nodes: FlowNode[]; edges: FlowEdge[]; clusters: NodeCluster[] } {
    const nodes: FlowNode[] = Array.from({ length: 100 }, (_, index) => ({
        id: `node-${index}`,
        type: index === 99 ? 'select' : 'table',
        label: `Node ${index}`,
        x: 20,
        y: index * 100,
        width: 180,
        height: 60,
    }));
    const edges = nodes.slice(0, 99).map(node => ({
        id: `${node.id}->node-99`, source: node.id, target: 'node-99',
    }));
    const clusters = createClusters(nodes).map(cluster => ({
        ...cluster, expanded: cluster.type === 'tables',
    }));
    return { nodes, edges, clusters };
}

function project(graph: ReturnType<typeof makeGraph>) {
    return applyClusteringFeature({
        nodes: graph.nodes,
        edges: graph.edges,
        currentClusters: graph.clusters,
        onClustersUpdated: clusters => { graph.clusters = clusters; },
    });
}

describe('cluster projection position preservation (S2)', () => {
    it('keeps visible and collapsed nodes in their dragged positions across a rerender', () => {
        const graph = makeGraph();
        const first = project(graph);
        layoutGraphHorizontal(first.nodes, first.edges);
        const table = first.nodes.find(node => node.id === 'node-0')!;
        const cluster = first.nodes.find(node => node.type === 'cluster')!;
        table.x += 777;
        table.y += 45;
        cluster.x += 321;
        cluster.y += 87;
        const tablePosition = { x: table.x, y: table.y };
        const clusterPosition = { x: cluster.x, y: cluster.y };

        const next = project(graph);
        expect(next.nodes).not.toBe(first.nodes);
        expect(next.nodes.find(node => node.id === cluster.id)).not.toBe(cluster);
        expect(preserveProjectedNodePositions(next.nodes, next.edges, first.nodes, first.edges)).toBe(true);
        expect(next.nodes.find(node => node.id === table.id)).toMatchObject(tablePosition);
        expect(next.nodes.find(node => node.id === cluster.id)).toMatchObject(clusterPosition);
    });

    it.each([true, false])('requires a layout when cluster expansion changes to %s', expanded => {
        const graph = makeGraph();
        graph.clusters = graph.clusters.map(cluster => ({ ...cluster, expanded: !expanded }));
        const first = project(graph);
        graph.clusters = graph.clusters.map(cluster => ({ ...cluster, expanded }));
        const next = project(graph);
        expect(preserveProjectedNodePositions(next.nodes, next.edges, first.nodes, first.edges)).toBe(false);
    });

    it('requires a layout when an edge changes endpoints despite keeping its ID', () => {
        const graph = makeGraph();
        const first = project(graph);
        const changedEdges = first.edges.map((edge, index) => index === 0
            ? { ...edge, source: 'node-1' }
            : edge);
        expect(preserveProjectedNodePositions(first.nodes, changedEdges, first.nodes, first.edges)).toBe(false);
    });
});
