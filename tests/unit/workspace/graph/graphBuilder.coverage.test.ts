import { GraphBuilder } from '../../../../src/workspace/graph/graphBuilder';
import type { WorkspaceDependencyGraph } from '../../../../src/workspace/types';

function makeWorkspaceGraph(): WorkspaceDependencyGraph {
    return {
        nodes: [
            {
                id: 'orders.sql',
                type: 'file',
                label: 'orders.sql',
                filePath: '/workspace/orders.sql',
                definitionCount: 1,
                referenceCount: 0,
                x: 10,
                y: 20,
                width: 180,
                height: 80,
            },
            {
                id: 'orders',
                type: 'table',
                label: 'orders',
                definitionCount: 1,
                referenceCount: 2,
                x: 220,
                y: 20,
                width: 140,
                height: 70,
            },
            {
                id: 'customers',
                type: 'table',
                label: 'customers',
                definitionCount: 0,
                referenceCount: 1,
                x: 420,
                y: 20,
                width: 140,
                height: 70,
            },
        ],
        edges: [
            {
                id: 'edge-1',
                source: 'orders.sql',
                target: 'orders',
                referenceType: 'select',
                count: 1,
                tables: ['orders'],
            },
            {
                id: 'edge-2',
                source: 'orders',
                target: 'customers',
                referenceType: 'join',
                count: 2,
                tables: ['customers'],
            },
        ],
        stats: {
            totalFiles: 1,
            totalTables: 2,
            totalViews: 0,
            totalReferences: 3,
            orphanedDefinitions: [],
            missingDefinitions: [],
            circularDependencies: [],
            parseErrors: 0,
        },
    };
}

describe('GraphBuilder coverage', () => {
    it('preserves node and edge metadata while applying default options', () => {
        const graph = new GraphBuilder().buildFromWorkspace(makeWorkspaceGraph());

        expect(graph.options).toEqual(expect.objectContaining({
            mode: 'file',
            direction: 'TB',
            showExternal: true,
        }));
        expect(graph.nodes[0]).toEqual(expect.objectContaining({
            id: 'orders.sql',
            label: 'orders.sql',
            filePath: '/workspace/orders.sql',
            sublabel: '1 defs, 0 refs',
            highlighted: false,
            dimmed: false,
        }));
        expect(graph.nodes[0].metadata).toEqual(expect.objectContaining({
            definitionCount: 1,
            referenceCount: 0,
        }));
        expect(graph.edges[1]).toEqual(expect.objectContaining({
            id: 'edge-2',
            source: 'orders',
            target: 'customers',
            type: 'dependency',
            label: '2',
        }));
        expect(graph.edges[1].metadata).toEqual(expect.objectContaining({
            referenceType: 'join',
            count: 2,
            tables: ['customers'],
        }));
    });

    it('filters, focuses, and highlights graph paths without mutating array references', () => {
        const builder = new GraphBuilder();
        const graph = builder.buildForMode(makeWorkspaceGraph(), 'table');

        const tableGraph = builder.filterByType(graph, ['table']);
        expect(tableGraph.nodes.map((node) => node.id)).toEqual(['orders', 'customers']);
        expect(tableGraph.edges.map((edge) => edge.id)).toEqual(['edge-2']);

        const focused = builder.focusOnNode(graph, 'orders', 1);
        expect(focused.options.focusNode).toBe('orders');
        expect(focused.nodes.map((node) => node.id).sort()).toEqual(['customers', 'orders', 'orders.sql']);

        const highlighted = builder.highlightPath(graph, 'orders.sql', 'customers');
        expect(highlighted.nodes).not.toBe(graph.nodes);
        expect(highlighted.edges).not.toBe(graph.edges);
        expect(highlighted.nodes.filter((node) => node.highlighted).map((node) => node.id).sort()).toEqual([
            'customers',
            'orders',
            'orders.sql',
        ]);
        expect(highlighted.edges.every((edge) => edge.metadata.highlighted)).toBe(true);
    });
});
