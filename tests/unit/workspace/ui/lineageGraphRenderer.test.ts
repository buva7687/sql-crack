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
});
