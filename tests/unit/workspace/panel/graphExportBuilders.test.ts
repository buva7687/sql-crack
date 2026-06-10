import {
    buildWorkspaceGraphDot,
    buildWorkspaceGraphJsonExportData,
    buildWorkspaceGraphSvg,
    escapeDotString,
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

    describe('DOT escaping', () => {
        it('escapes quotes, backslashes, and newlines in escapeDotString', () => {
            expect(escapeDotString('a"b')).toBe('a\\"b');
            expect(escapeDotString('a\\b')).toBe('a\\\\b');
            expect(escapeDotString('a\nb')).toBe('a\\nb');
            expect(escapeDotString('a\r\nb')).toBe('a\\nb');
            // Backslash is escaped before the quote so they don't combine wrong.
            expect(escapeDotString('a\\"b')).toBe('a\\\\\\"b');
            expect(escapeDotString('')).toBe('');
        });

        it('escapes node ids and labels so quotes cannot break the DOT', () => {
            const graph = createGraph([
                { id: 'we"ird', type: 'table', label: 'a"b\\c', x: 0, y: 0, width: 100, height: 50 },
                { id: 'n2', type: 'view', label: 'plain', x: 1, y: 1, width: 100, height: 50 },
            ]);

            const dot = buildWorkspaceGraphDot(graph, false);

            expect(dot).toContain('"we\\"ird" [label="a\\"b\\\\c"');
            // No raw unescaped double quote inside the identifier/label payloads.
            expect(dot).not.toContain('"we"ird"');
        });
    });
});
