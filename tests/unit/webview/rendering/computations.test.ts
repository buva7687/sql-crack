/**
 * Tests for pure computation functions extracted from DOM-dependent rendering modules.
 * These can be imported directly — no DOM mocking needed.
 */

import {
    calculateEdgePath,
    contrastTextForBadge,
    computeCloudArrowPath,
    calculateQueryDepth,
    getQueryComplexityInfo,
    calculateStackedCloudOffsets,
} from '../../../../src/webview/rendering/computations';
import {
    layoutSubflowNodes,
    layoutSubflowNodesVertical,
} from '../../../../src/webview/rendering/cloudRenderer';
import { FlowNode, FlowEdge } from '../../../../src/webview/types';

// ============================================================
// Helpers
// ============================================================

function makeNode(overrides: Partial<FlowNode> & { id: string }): FlowNode {
    return {
        type: 'table',
        label: 'test',
        x: 0,
        y: 0,
        width: 180,
        height: 60,
        ...overrides,
    };
}

function makeEdge(source: string, target: string, id?: string): FlowEdge {
    return { id: id || `${source}->${target}`, source, target, label: '' };
}

// ============================================================
// calculateEdgePath
// ============================================================

describe('calculateEdgePath', () => {
    const source = makeNode({ id: 'A', x: 0, y: 0, width: 100, height: 50 });
    const target = makeNode({ id: 'B', x: 300, y: 200, width: 100, height: 50 });

    it('returns a valid SVG path starting with M', () => {
        const path = calculateEdgePath(source, target, 'vertical');
        expect(path).toMatch(/^M /);
    });

    describe('horizontal layout', () => {
        it('exits from right edge of source and enters left edge of target', () => {
            const path = calculateEdgePath(source, target, 'horizontal');
            // Start: right edge of source (x + width)
            expect(path).toMatch(/^M 100 25/);
            // End: left edge of target (x)
            expect(path).toContain('300 225');
        });

        it('uses cubic Bézier (C command)', () => {
            const path = calculateEdgePath(source, target, 'horizontal');
            expect(path).toContain(' C ');
        });
    });

    describe('vertical layout', () => {
        it('exits from bottom center of source and enters top center of target', () => {
            const path = calculateEdgePath(source, target, 'vertical');
            // Start: bottom center (x + width/2, y + height)
            expect(path).toMatch(/^M 50 50/);
            // End: top center (x + width/2, y)
            expect(path).toContain('350 200');
        });
    });

    describe('compact layout', () => {
        it('behaves like vertical (same branch)', () => {
            const vertPath = calculateEdgePath(source, target, 'vertical');
            const compactPath = calculateEdgePath(source, target, 'compact');
            expect(compactPath).toEqual(vertPath);
        });
    });

    describe('force layout', () => {
        it('uses quadratic Bézier (Q command)', () => {
            const path = calculateEdgePath(source, target, 'force');
            expect(path).toContain(' Q ');
        });

        it('handles target to the right (angle < PI/4)', () => {
            const right = makeNode({ id: 'R', x: 300, y: 0, width: 100, height: 50 });
            const path = calculateEdgePath(source, right, 'force');
            expect(path).toMatch(/^M /);
        });

        it('handles target to the left (angle > 3PI/4)', () => {
            const left = makeNode({ id: 'L', x: -400, y: 0, width: 100, height: 50 });
            const path = calculateEdgePath(source, left, 'force');
            // Source should exit from its left edge (x=0)
            expect(path).toMatch(/^M 0 /);
        });

        it('handles target below (angle > 0, within PI/4..3PI/4)', () => {
            const below = makeNode({ id: 'D', x: 0, y: 300, width: 100, height: 50 });
            const path = calculateEdgePath(source, below, 'force');
            // Source exits from bottom center
            expect(path).toMatch(/^M 50 50/);
        });

        it('handles target above (angle < 0)', () => {
            const above = makeNode({ id: 'U', x: 0, y: -300, width: 100, height: 50 });
            const path = calculateEdgePath(source, above, 'force');
            // Source exits from top center (y=0)
            expect(path).toMatch(/^M 50 0/);
        });
    });

    describe('radial layout', () => {
        it('shares the force layout branch', () => {
            const forcePath = calculateEdgePath(source, target, 'force');
            const radialPath = calculateEdgePath(source, target, 'radial');
            expect(radialPath).toEqual(forcePath);
        });
    });

    it('handles identical positions without NaN', () => {
        const same = makeNode({ id: 'S', x: 0, y: 0, width: 100, height: 50 });
        const path = calculateEdgePath(same, same, 'force');
        expect(path).not.toContain('NaN');
    });
});

// ============================================================
// contrastTextForBadge
// ============================================================

describe('contrastTextForBadge', () => {
    it('returns dark text for light backgrounds', () => {
        expect(contrastTextForBadge('#ffffff')).toBe('#1e293b');
        expect(contrastTextForBadge('#fbbf24')).toBe('#1e293b'); // amber
    });

    it('returns white text for dark backgrounds', () => {
        expect(contrastTextForBadge('#000000')).toBe('#ffffff');
        expect(contrastTextForBadge('#1e293b')).toBe('#ffffff'); // dark slate
    });

    it('handles 3-char hex shorthand', () => {
        expect(contrastTextForBadge('#fff')).toBe('#1e293b');
        expect(contrastTextForBadge('#000')).toBe('#ffffff');
    });

    it('handles rgb() format', () => {
        expect(contrastTextForBadge('rgb(255, 255, 255)')).toBe('#1e293b');
        expect(contrastTextForBadge('rgb(0, 0, 0)')).toBe('#ffffff');
    });

    it('handles rgb with no spaces', () => {
        expect(contrastTextForBadge('rgb(30,41,59)')).toBe('#ffffff');
    });

    it('returns white for unparseable input', () => {
        // Falls through with r=g=b=0 → brightness 0 → white
        expect(contrastTextForBadge('invalid')).toBe('#ffffff');
    });
});

// ============================================================
// computeCloudArrowPath
// ============================================================

describe('computeCloudArrowPath', () => {
    // Cloud at (0, 0), size 200x150
    const cloudX = 0, cloudY = 0, cloudW = 200, cloudH = 150;

    it('returns valid SVG path starting with M', () => {
        const path = computeCloudArrowPath(300, 50, 100, 50, cloudX, cloudY, cloudW, cloudH);
        expect(path).toMatch(/^M /);
    });

    it('node to the right: arrow starts from cloud right edge', () => {
        const path = computeCloudArrowPath(300, 50, 100, 50, cloudX, cloudY, cloudW, cloudH);
        expect(path).toMatch(/^M 200 /); // cloudWidth = 200
    });

    it('node below: arrow starts from cloud bottom edge', () => {
        const path = computeCloudArrowPath(80, 300, 100, 50, cloudX, cloudY, cloudW, cloudH);
        expect(path).toMatch(/^M 100 150/); // cloudWidth/2, cloudHeight
    });

    it('node above: arrow starts from cloud top edge', () => {
        const path = computeCloudArrowPath(80, -200, 100, 50, cloudX, cloudY, cloudW, cloudH);
        expect(path).toMatch(/^M 100 0/); // cloudWidth/2, 0
    });

    it('node to the left: arrow starts from cloud left edge', () => {
        const path = computeCloudArrowPath(-300, 50, 100, 50, cloudX, cloudY, cloudW, cloudH);
        expect(path).toMatch(/^M 0 /); // x=0
    });

    it('uses cubic Bézier (C command)', () => {
        const path = computeCloudArrowPath(300, 50, 100, 50, cloudX, cloudY, cloudW, cloudH);
        expect(path).toContain(' C ');
    });
});

// ============================================================
// calculateQueryDepth
// ============================================================

describe('calculateQueryDepth', () => {
    it('returns 0 when no result node exists', () => {
        const nodes = [makeNode({ id: 'a', type: 'table' })];
        expect(calculateQueryDepth(nodes, [])).toBe(0);
    });

    it('returns 0 for a single result node with no edges', () => {
        const nodes = [makeNode({ id: 'r', type: 'result' })];
        expect(calculateQueryDepth(nodes, [])).toBe(0);
    });

    it('calculates linear chain depth', () => {
        // table -> join -> result  (depth = 2)
        const nodes = [
            makeNode({ id: 't', type: 'table' }),
            makeNode({ id: 'j', type: 'join' }),
            makeNode({ id: 'r', type: 'result' }),
        ];
        const edges = [
            makeEdge('t', 'j'),
            makeEdge('j', 'r'),
        ];
        expect(calculateQueryDepth(nodes, edges)).toBe(2);
    });

    it('returns max of multiple branches', () => {
        //   t1 -> join -> result   (depth 2)
        //   t2 --------> result   (depth 1)
        //   t3 -> filter -> join  (depth 3 via t3->filter->join->result)
        const nodes = [
            makeNode({ id: 't1', type: 'table' }),
            makeNode({ id: 't2', type: 'table' }),
            makeNode({ id: 't3', type: 'table' }),
            makeNode({ id: 'f', type: 'filter' }),
            makeNode({ id: 'j', type: 'join' }),
            makeNode({ id: 'r', type: 'result' }),
        ];
        const edges = [
            makeEdge('t1', 'j'),
            makeEdge('t2', 'r'),
            makeEdge('t3', 'f'),
            makeEdge('f', 'j'),
            makeEdge('j', 'r'),
        ];
        expect(calculateQueryDepth(nodes, edges)).toBe(3);
    });

    it('handles cycles without infinite loop', () => {
        const nodes = [
            makeNode({ id: 'a', type: 'table' }),
            makeNode({ id: 'b', type: 'table' }),
            makeNode({ id: 'r', type: 'result' }),
        ];
        const edges = [
            makeEdge('a', 'b'),
            makeEdge('b', 'a'), // cycle
            makeEdge('b', 'r'),
        ];
        // Should terminate; exact depth depends on traversal order
        expect(typeof calculateQueryDepth(nodes, edges)).toBe('number');
    });

    it('reports true longest path in reconverging DAGs (diamond shape)', () => {
        // Diamond:  t1 -> join -> result   (short: depth 2)
        //           t1 -> filter -> join   (long:  depth 3 via t1->filter->join->result)
        // The shared "join" node must be explored at depth 1 AND depth 2.
        const nodes = [
            makeNode({ id: 't1', type: 'table' }),
            makeNode({ id: 'f', type: 'filter' }),
            makeNode({ id: 'j', type: 'join' }),
            makeNode({ id: 'r', type: 'result' }),
        ];
        const edges = [
            makeEdge('t1', 'j'),  // short path: t1 -> j -> r (depth 2)
            makeEdge('t1', 'f'),  // long path:  t1 -> f -> j -> r (depth 3)
            makeEdge('f', 'j'),
            makeEdge('j', 'r'),
        ];
        expect(calculateQueryDepth(nodes, edges)).toBe(3);
    });

    it('reports true longest path with multiple reconvergence points', () => {
        // t -> a -> b -> result   (depth 3)
        // t -> c -> a             (reconverge at a; t->c->a->b->result = depth 4)
        const nodes = [
            makeNode({ id: 't', type: 'table' }),
            makeNode({ id: 'a', type: 'filter' }),
            makeNode({ id: 'b', type: 'join' }),
            makeNode({ id: 'c', type: 'filter' }),
            makeNode({ id: 'r', type: 'result' }),
        ];
        const edges = [
            makeEdge('t', 'a'),
            makeEdge('a', 'b'),
            makeEdge('b', 'r'),
            makeEdge('t', 'c'),
            makeEdge('c', 'a'), // reconverge: longer path to a
        ];
        expect(calculateQueryDepth(nodes, edges)).toBe(4);
    });
});

// ============================================================
// getQueryComplexityInfo
// ============================================================

describe('getQueryComplexityInfo', () => {
    it('returns correct counts for a simple query', () => {
        const nodes = [
            makeNode({ id: 't', type: 'table' }),
            makeNode({ id: 'r', type: 'result' }),
        ];
        const edges = [makeEdge('t', 'r')];
        const info = getQueryComplexityInfo(nodes, edges);

        expect(info.nodeCount).toBe(2);
        expect(info.tableCount).toBe(1);
        expect(info.depth).toBe(1);
        expect(info.isComplex).toBe(false);
    });

    it('marks as complex when node count >= 8', () => {
        const nodes = Array.from({ length: 8 }, (_, i) =>
            makeNode({ id: `n${i}`, type: i === 7 ? 'result' : 'filter' })
        );
        const info = getQueryComplexityInfo(nodes, []);
        expect(info.isComplex).toBe(true);
    });

    it('marks as complex when table count >= 5', () => {
        const nodes = [
            ...Array.from({ length: 5 }, (_, i) => makeNode({ id: `t${i}`, type: 'table' })),
            makeNode({ id: 'r', type: 'result' }),
        ];
        const info = getQueryComplexityInfo(nodes, []);
        expect(info.isComplex).toBe(true);
        expect(info.tableCount).toBe(5);
    });

    it('marks as complex when depth >= 3', () => {
        const nodes = [
            makeNode({ id: 'a', type: 'table' }),
            makeNode({ id: 'b', type: 'join' }),
            makeNode({ id: 'c', type: 'filter' }),
            makeNode({ id: 'r', type: 'result' }),
        ];
        const edges = [
            makeEdge('a', 'b'),
            makeEdge('b', 'c'),
            makeEdge('c', 'r'),
        ];
        const info = getQueryComplexityInfo(nodes, edges);
        expect(info.depth).toBe(3);
        expect(info.isComplex).toBe(true);
    });

    it('returns not complex for empty graph', () => {
        const info = getQueryComplexityInfo([], []);
        expect(info.isComplex).toBe(false);
        expect(info.nodeCount).toBe(0);
        expect(info.tableCount).toBe(0);
        expect(info.depth).toBe(0);
    });
});

// ============================================================
// layoutSubflowNodes  (from cloudRenderer.ts — dagre-based, pure)
// ============================================================

describe('layoutSubflowNodes', () => {
    it('returns default size for empty children', () => {
        const result = layoutSubflowNodes([], []);
        expect(result.width).toBe(200);
        expect(result.height).toBe(100);
    });

    it('lays out single node with dagre LR', () => {
        const children = [makeNode({ id: 'c1', label: 'SELECT' })];
        const result = layoutSubflowNodes(children, []);
        expect(result.width).toBeGreaterThan(0);
        expect(result.height).toBeGreaterThan(0);
        // Node should have x,y set by dagre
        expect(typeof children[0].x).toBe('number');
        expect(typeof children[0].y).toBe('number');
    });

    it('lays out two connected nodes left-to-right', () => {
        const children = [
            makeNode({ id: 'a', label: 'source' }),
            makeNode({ id: 'b', label: 'target' }),
        ];
        const edges = [makeEdge('a', 'b')];
        const result = layoutSubflowNodes(children, edges);
        expect(result.width).toBeGreaterThan(0);
        // In LR mode, source should be left of target
        expect(children[0].x).toBeLessThan(children[1].x);
    });

    it('sets child width based on label length', () => {
        const short = [makeNode({ id: 's', label: 'ab' })];
        const long = [makeNode({ id: 'l', label: 'a_very_long_table_name_here' })];
        layoutSubflowNodes(short, []);
        layoutSubflowNodes(long, []);
        expect(long[0].width).toBeGreaterThan(short[0].width);
    });

    it('clamps child width between 80 and 280', () => {
        const tiny = [makeNode({ id: 't', label: '' })];
        const huge = [makeNode({ id: 'h', label: 'x'.repeat(100) })];
        layoutSubflowNodes(tiny, []);
        layoutSubflowNodes(huge, []);
        expect(tiny[0].width).toBeGreaterThanOrEqual(80);
        expect(huge[0].width).toBeLessThanOrEqual(280);
    });
});

// ============================================================
// layoutSubflowNodesVertical  (from cloudRenderer.ts — dagre TB)
// ============================================================

describe('layoutSubflowNodesVertical', () => {
    it('returns default size for empty children', () => {
        const result = layoutSubflowNodesVertical([], []);
        expect(result.width).toBe(120);
        expect(result.height).toBe(100);
    });

    it('lays out single node with dagre TB', () => {
        const children = [makeNode({ id: 'v1', label: 'node' })];
        const result = layoutSubflowNodesVertical(children, []);
        expect(result.width).toBeGreaterThan(0);
        expect(result.height).toBeGreaterThan(0);
    });

    it('sets fixed child dimensions (180 x 60)', () => {
        const children = [makeNode({ id: 'v2', label: 'test' })];
        layoutSubflowNodesVertical(children, []);
        expect(children[0].width).toBe(180);
        expect(children[0].height).toBe(60);
    });

    it('lays out two connected nodes top-to-bottom', () => {
        const children = [
            makeNode({ id: 'top', label: 'source' }),
            makeNode({ id: 'bot', label: 'target' }),
        ];
        const edges = [makeEdge('top', 'bot')];
        layoutSubflowNodesVertical(children, edges);
        expect(children[0].y).toBeLessThan(children[1].y);
    });

    it('handles three-node chain', () => {
        const children = [
            makeNode({ id: 'a', label: 'A' }),
            makeNode({ id: 'b', label: 'B' }),
            makeNode({ id: 'c', label: 'C' }),
        ];
        const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
        const result = layoutSubflowNodesVertical(children, edges);
        expect(result.height).toBeGreaterThan(100);
        expect(children[0].y).toBeLessThan(children[1].y);
        expect(children[1].y).toBeLessThan(children[2].y);
    });
});

// ============================================================
// calculateStackedCloudOffsets  (extracted from cloudPositioning.ts)
// ============================================================

describe('calculateStackedCloudOffsets', () => {
    // Mock layout function returning fixed sizes
    const mockLayout = jest.fn().mockReturnValue({ width: 150, height: 100 });

    beforeEach(() => {
        mockLayout.mockClear();
    });

    it('returns empty array for no expandable nodes', () => {
        const result = calculateStackedCloudOffsets({
            expandableNodes: [],
            currentEdges: [],
            layoutSubflowNodesVertical: mockLayout,
        });
        expect(result).toEqual([]);
    });

    it('returns one offset for a single node', () => {
        const nodes = [makeNode({ id: 'n1', x: 100, y: 200, width: 180, height: 60, children: [] })];
        const result = calculateStackedCloudOffsets({
            expandableNodes: nodes,
            currentEdges: [],
            layoutSubflowNodesVertical: mockLayout,
        });
        expect(result).toHaveLength(1);
        expect(result[0].nodeId).toBe('n1');
        expect(typeof result[0].offsetX).toBe('number');
        expect(typeof result[0].offsetY).toBe('number');
    });

    it('places clouds above nodes (negative offsetY)', () => {
        const nodes = [makeNode({ id: 'n1', x: 100, y: 200, width: 180, height: 60, children: [] })];
        const result = calculateStackedCloudOffsets({
            expandableNodes: nodes,
            currentEdges: [],
            layoutSubflowNodesVertical: mockLayout,
        });
        expect(result[0].offsetY).toBeLessThan(0);
    });

    it('prevents horizontal overlap between two adjacent clouds', () => {
        const nodes = [
            makeNode({ id: 'n1', x: 100, y: 200, width: 180, height: 60, children: [] }),
            makeNode({ id: 'n2', x: 120, y: 200, width: 180, height: 60, children: [] }),
        ];
        const result = calculateStackedCloudOffsets({
            expandableNodes: nodes,
            currentEdges: [],
            layoutSubflowNodesVertical: mockLayout,
        });
        expect(result).toHaveLength(2);
        // Cloud 2 should be shifted right so it doesn't overlap cloud 1
        const cloud1X = nodes[0].x + result[0].offsetX;
        const cloud2X = nodes[1].x + result[1].offsetX;
        // Cloud widths: 150 + 15*2 = 180 (layout width + padding*2)
        const cloudWidth = 150 + 15 * 2;
        expect(cloud2X).toBeGreaterThanOrEqual(cloud1X + cloudWidth);
    });

    it('calls layoutSubflowNodesVertical for each node', () => {
        const child1: FlowNode = makeNode({ id: 'child1', label: 'c1' });
        const child2: FlowNode = makeNode({ id: 'child2', label: 'c2' });
        const nodes = [
            makeNode({ id: 'n1', x: 0, y: 100, width: 180, height: 60, children: [child1] }),
            makeNode({ id: 'n2', x: 300, y: 100, width: 180, height: 60, children: [child2] }),
        ];
        calculateStackedCloudOffsets({
            expandableNodes: nodes,
            currentEdges: [],
            layoutSubflowNodesVertical: mockLayout,
        });
        expect(mockLayout).toHaveBeenCalledTimes(2);
    });

    it('well-spaced nodes do not get shifted', () => {
        const nodes = [
            makeNode({ id: 'n1', x: 0, y: 100, width: 180, height: 60, children: [] }),
            makeNode({ id: 'n2', x: 1000, y: 100, width: 180, height: 60, children: [] }),
        ];
        const result = calculateStackedCloudOffsets({
            expandableNodes: nodes,
            currentEdges: [],
            layoutSubflowNodesVertical: mockLayout,
        });
        // Both clouds should be centered on their nodes
        // Cloud 1 center = n1.x + n1.width/2 = 90, Cloud 2 center = n2.x + n2.width/2 = 1090
        // offsetX = cloudX - node.x = (center - cloudWidth/2) - node.x
        const cloudWidth = 150 + 15 * 2;
        const expectedOffset1 = (90 - cloudWidth / 2) - 0;
        const expectedOffset2 = (1090 - cloudWidth / 2) - 1000;
        expect(result[0].offsetX).toBe(expectedOffset1);
        expect(result[1].offsetX).toBe(expectedOffset2);
    });

    it('sorts by x position regardless of input order', () => {
        const nodes = [
            makeNode({ id: 'right', x: 500, y: 100, width: 180, height: 60, children: [] }),
            makeNode({ id: 'left', x: 0, y: 100, width: 180, height: 60, children: [] }),
        ];
        const result = calculateStackedCloudOffsets({
            expandableNodes: nodes,
            currentEdges: [],
            layoutSubflowNodesVertical: mockLayout,
        });
        // Result order follows the sorted cloudInfos, but nodeId maps back
        expect(result.map(r => r.nodeId)).toContain('left');
        expect(result.map(r => r.nodeId)).toContain('right');
    });
});
