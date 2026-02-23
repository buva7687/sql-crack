import { LineageView } from '../../../../src/workspace/ui/lineageView';
import { LineageGraph } from '../../../../src/workspace/lineage/types';

describe('LineageView legend keyboard hints', () => {
    function createGraph(): LineageGraph {
        return {
            nodes: new Map([
                ['table:orders', {
                    id: 'table:orders',
                    type: 'table',
                    name: 'orders',
                    metadata: { columnCount: 3 },
                }],
                ['table:users', {
                    id: 'table:users',
                    type: 'table',
                    name: 'users',
                    metadata: { columnCount: 2 },
                }],
            ]),
            edges: [{
                id: 'edge:orders-users',
                sourceId: 'table:orders',
                targetId: 'table:users',
                type: 'join',
                metadata: {},
            }],
            columnEdges: [],
            getUpstream: () => [],
            getDownstream: () => [],
            getColumnLineage: () => [],
        };
    }

    it('renders keyboard hints inside a bottom legend strip with a dismiss control', () => {
        const view = new LineageView();
        const html = view.generateLineageGraphView(createGraph(), 'table:orders', {
            depth: 3,
            direction: 'both',
        });

        expect(html).toContain('id="lineage-legend-content"');
        expect(html).toContain('id="legend-dismiss"');
        expect(html).toContain('legend-keyboard-hints');
        expect(html).toContain('id="lineage-keyboard-hints"');
        expect(html).toContain('<kbd>L</kbd>');
        expect(html).not.toContain('id="lineage-legend-toggle"');
        expect(html).not.toContain('id="keyboard-hints"');
        expect(html).not.toContain('id="legend-toggle"');
    });
});
