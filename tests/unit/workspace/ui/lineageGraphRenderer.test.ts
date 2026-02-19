import { LineageGraphRenderer } from '../../../../src/workspace/ui/lineageGraphRenderer';
import { LineageGraph } from '../../../../src/workspace/lineage/types';

describe('LineageGraphRenderer UX markup', () => {
    function createGraph(): LineageGraph {
        return {
            nodes: new Map([
                ['table:orders', {
                    id: 'table:orders',
                    type: 'table',
                    name: 'orders',
                    metadata: { columnCount: 2 },
                }],
                ['column:orders.id', {
                    id: 'column:orders.id',
                    type: 'column',
                    name: 'id',
                    parentId: 'table:orders',
                    metadata: { isPrimaryKey: true },
                    columnInfo: { dataType: 'INT' } as any,
                }],
                ['column:orders.total', {
                    id: 'column:orders.total',
                    type: 'column',
                    name: 'total',
                    parentId: 'table:orders',
                    metadata: {},
                    columnInfo: { dataType: 'DECIMAL' } as any,
                }],
            ]),
            edges: [],
            columnEdges: [],
            getUpstream: () => [],
            getDownstream: () => [],
            getColumnLineage: () => [],
        };
    }

    function createWideColumnGraph(columnCount: number): LineageGraph {
        const nodes = new Map<string, any>([
            ['table:orders', {
                id: 'table:orders',
                type: 'table',
                name: 'orders',
                metadata: { columnCount },
            }],
        ]);

        for (let i = 0; i < columnCount; i++) {
            nodes.set(`column:orders.c${i}`, {
                id: `column:orders.c${i}`,
                type: 'column',
                name: `c${i}`,
                parentId: 'table:orders',
                metadata: {},
                columnInfo: { dataType: 'TEXT' } as any,
            });
        }

        return {
            nodes,
            edges: [],
            columnEdges: [],
            getUpstream: () => [],
            getDownstream: () => [],
            getColumnLineage: () => [],
        };
    }

    it('renders expanded-node metadata for tooltip/discoverability and alternating column rows', () => {
        const renderer = new LineageGraphRenderer(createGraph());
        const graph = renderer.buildGraph({
            centerNodeId: 'table:orders',
            depth: 2,
            direction: 'both',
            expandedNodes: new Set(['table:orders']),
        });

        const svg = renderer.generateSVG(graph);
        expect(svg).toContain('data-expanded="true"');
        expect(svg).toContain('data-column-count="2"');
        expect(svg).toContain('column-row-bg even');
        expect(svg).toContain('column-row-bg odd');
        expect(svg).toContain('tabindex="0"');
        expect(svg).toContain('role="button"');
        expect(svg).toContain('data-upstream-count=');
        expect(svg).toContain('data-downstream-count=');
    });

    it('uses SVG icons for node types (no emoji glyph fallback)', () => {
        const renderer = new LineageGraphRenderer(createGraph());
        const graph = renderer.buildGraph({
            centerNodeId: 'table:orders',
            depth: 1,
            direction: 'both',
            expandedNodes: new Set(),
        });

        const svg = renderer.generateSVG(graph);
        expect(svg).toContain('<g class="node-icon-svg"');
        expect(svg).toContain('<svg width="16" height="16"');
        expect(svg).not.toMatch(/[📊👁️🔄🌐📦]/u);
    });

    it('caps expanded columns to avoid layout blowout and renders overflow hint', () => {
        const renderer = new LineageGraphRenderer(createWideColumnGraph(25));
        const graph = renderer.buildGraph({
            centerNodeId: 'table:orders',
            depth: 1,
            direction: 'both',
            expandedNodes: new Set(['table:orders']),
        });

        const svg = renderer.generateSVG(graph);
        const renderedColumnRows = (svg.match(/class="column-row(?:\s|")/g) || []).length;

        expect(renderedColumnRows).toBe(20);
        expect(svg).toContain('Showing first 20 of 25 columns');
        expect(svg).toContain('column-close-btn-circle');
        expect(svg).toContain('column-close-btn-icon');
    });

    it('reports upstream/downstream stats using internal lineage nodes only', () => {
        const graphWithExternal: LineageGraph = {
            nodes: new Map([
                ['table:orders', { id: 'table:orders', type: 'table', name: 'orders', metadata: {} }],
                ['table:customers', { id: 'table:customers', type: 'table', name: 'customers', metadata: {} }],
                ['external:vendor_feed', { id: 'external:vendor_feed', type: 'external', name: 'vendor_feed', metadata: {} }],
            ]),
            edges: [
                { id: 'e-table', sourceId: 'table:customers', targetId: 'table:orders', type: 'direct', metadata: {} },
                { id: 'e-external', sourceId: 'external:vendor_feed', targetId: 'table:orders', type: 'direct', metadata: {} },
            ],
            columnEdges: [],
            getUpstream: () => [],
            getDownstream: () => [],
            getColumnLineage: () => [],
        };

        const renderer = new LineageGraphRenderer(graphWithExternal);
        const renderGraph = renderer.buildGraph({
            centerNodeId: 'table:orders',
            depth: 5,
            direction: 'both',
            expandedNodes: new Set(),
            includeExternal: true,
        });

        expect(renderGraph.stats.upstreamCount).toBe(1);
        expect(renderGraph.stats.downstreamCount).toBe(0);
    });
});
