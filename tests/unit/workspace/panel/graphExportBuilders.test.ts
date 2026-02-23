import { buildWorkspaceGraphSvg } from '../../../../src/workspace/panel/graphExportBuilders';
import { WorkspaceDependencyGraph } from '../../../../src/workspace/types';

function createGraph(nodes: WorkspaceDependencyGraph['nodes']): WorkspaceDependencyGraph {
    return {
        nodes,
        edges: [
            {
                id: 'e1',
                source: 'n1',
                target: 'n2',
                referenceType: 'select',
                count: 1,
                tables: ['orders'],
            },
        ],
        stats: {
            totalFiles: 0,
            totalTables: 0,
            totalViews: 0,
            totalReferences: 0,
            orphanedDefinitions: [],
            missingDefinitions: [],
            circularDependencies: [],
            parseErrors: 0,
        },
    };
}

describe('workspace graph export builders', () => {
    it('builds SVG with finite dimensions from valid nodes', () => {
        const graph = createGraph([
            {
                id: 'n1',
                type: 'table',
                label: 'orders',
                x: 40,
                y: 80,
                width: 180,
                height: 60,
            },
            {
                id: 'n2',
                type: 'view',
                label: 'daily_orders',
                x: 360,
                y: 220,
                width: 180,
                height: 60,
            },
        ]);

        const svg = buildWorkspaceGraphSvg(graph, false, (value) => value);
        expect(svg).toContain('<svg');
        expect(svg).toContain('orders');
        expect(svg).toContain('daily_orders');
        expect(svg).not.toContain('NaN');
    });

    it('skips malformed nodes to avoid NaN SVG output', () => {
        const graph = createGraph([
            {
                id: 'n1',
                type: 'table',
                label: 'bad-node',
                x: Number.NaN,
                y: 20,
                width: 180,
                height: 60,
            },
        ]);

        const svg = buildWorkspaceGraphSvg(graph, true, (value) => value);
        expect(svg).toContain('viewBox="0 0 1200 800"');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('bad-node');
    });
});
