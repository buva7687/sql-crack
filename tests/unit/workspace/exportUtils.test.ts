import { generateWorkspaceMermaid, WORKSPACE_EXPORT_OPTIONS } from '../../../src/workspace/exportUtils';
import { createWorkspaceExportContext } from '../../../src/workspace/exportMetadata';
import { WorkspaceDependencyGraph } from '../../../src/workspace/types';

describe('workspace exportUtils', () => {
    const graph: WorkspaceDependencyGraph = {
        nodes: [
            {
                id: 'file_orders',
                type: 'file',
                label: 'orders.sql',
                x: 0,
                y: 0,
                width: 100,
                height: 60,
            },
            {
                id: 'table_orders',
                type: 'table',
                label: 'orders',
                x: 120,
                y: 0,
                width: 100,
                height: 60,
            },
        ],
        edges: [
            {
                id: 'e1',
                source: 'file_orders',
                target: 'table_orders',
                referenceType: 'select',
                count: 1,
                tables: ['orders'],
            },
        ],
        stats: {
            totalFiles: 1,
            totalTables: 1,
            totalViews: 0,
            totalReferences: 1,
            orphanedDefinitions: [],
            missingDefinitions: [],
            circularDependencies: [],
            parseErrors: 0,
        },
    };

    it('includes consolidated dropdown options including clipboard PNG and copy Mermaid', () => {
        const formats = WORKSPACE_EXPORT_OPTIONS.map(option => option.format);
        expect(formats).toContain('clipboard-png');
        expect(formats).toContain('copy-mermaid');
        expect(formats).toContain('json');
        expect(formats).toContain('dot');
    });

    it('generates mermaid output in the requested direction', () => {
        const mermaid = generateWorkspaceMermaid(graph, 'BT');
        expect(mermaid).toContain('```mermaid');
        expect(mermaid).toContain('graph BT');
        expect(mermaid).toContain('file_orders["orders.sql"]');
        expect(mermaid).toContain('file_orders --> table_orders');
        expect(mermaid).toContain('```');
    });

    it('includes export metadata comments when context is provided', () => {
        const context = createWorkspaceExportContext({
            view: 'graph',
            graphMode: 'tables',
            scopeUri: '/repo/sql',
            searchFilter: { query: 'orders', nodeTypes: undefined, useRegex: false, caseSensitive: false },
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            exportedAt: '2026-03-07T12:34:56.000Z',
        });

        const mermaid = generateWorkspaceMermaid(graph, 'TD', context);

        expect(mermaid).toContain('%% SQL Crack Workspace Export');
        expect(mermaid).toContain('%% Graph Mode: tables');
        expect(mermaid).toContain('%% Filters: query="orders"');
    });
});
