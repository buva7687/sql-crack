import {
    buildWorkspaceGraphDot,
    buildWorkspaceGraphJsonExportData,
    buildWorkspaceGraphSvg,
} from '../../../../src/workspace/panel/graphExportBuilders';
import { createWorkspaceExportContext } from '../../../../src/workspace/exportMetadata';
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
    const exportContext = createWorkspaceExportContext({
        view: 'graph',
        graphMode: 'tables',
        scopeUri: '/repo/sql',
        searchFilter: { query: 'orders', nodeTypes: undefined, useRegex: false, caseSensitive: false },
        nodeCount: 2,
        edgeCount: 1,
        exportedAt: '2026-03-07T18:45:00.000Z',
    });

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

        const svg = buildWorkspaceGraphSvg(graph, false, (value) => value, exportContext);
        expect(svg).toContain('<svg');
        expect(svg).toContain('<metadata id="sql-crack-export-metadata">');
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

    it('adds metadata to JSON and DOT exports', () => {
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

        const json = buildWorkspaceGraphJsonExportData(graph, '0.6.0', exportContext) as any;
        const dot = buildWorkspaceGraphDot(graph, false, exportContext);

        expect(json.metadata.graphMode).toBe('tables');
        expect(json.metadata.scope.uri).toBe('/repo/sql');
        expect(dot).toContain('// SQL Crack Workspace Export');
        expect(dot).toContain('// Filters: query="orders"');
    });
});
