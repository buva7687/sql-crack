/**
 * Tests for edgeRenderer using shared fake DOM helper.
 * Verifies edge rendering, highlighting, and transformation badges.
 */

import {
    installFakeDocument,
    uninstallFakeDocument,
    FakeElement,
    createFakeElement,
} from '../../../helpers/fakeDom';
import {
    renderEdge,
    RenderEdgeOptions,
    highlightConnectedEdges,
    createTransformationBadge,
    clearLineageBadges,
} from '../../../../src/webview/rendering/edgeRenderer';
import type { FlowEdge, FlowNode } from '../../../../src/webview/types';

// ============================================================
// Helpers
// ============================================================

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
    return {
        id: 'n1',
        type: 'table',
        label: 'users',
        x: 50,
        y: 100,
        width: 180,
        height: 60,
        ...overrides,
    };
}

function makeEdge(overrides: Partial<FlowEdge> = {}): FlowEdge {
    return {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        label: 'flow',
        ...overrides,
    };
}

function fakeGroup(): SVGGElement {
    return createFakeElement('g', 'http://www.w3.org/2000/svg') as unknown as SVGGElement;
}

function defaultOptions(overrides: Partial<RenderEdgeOptions> = {}): RenderEdgeOptions {
    const n1 = makeNode({ id: 'n1', x: 0, y: 0, width: 100, height: 50 });
    const n2 = makeNode({ id: 'n2', x: 300, y: 0, width: 100, height: 50 });
    const nodeMap = new Map<string, FlowNode>();
    nodeMap.set('n1', n1);
    nodeMap.set('n2', n2);
    return {
        isDark: true,
        nodeMap,
        allNodes: [n1, n2],
        layoutType: 'vertical',
        ...overrides,
    };
}

// ============================================================
// Tests
// ============================================================

describe('edgeRenderer', () => {
    beforeEach(() => installFakeDocument());
    afterEach(() => uninstallFakeDocument());

    describe('renderEdge', () => {
        it('creates a path element appended to parent', () => {
            const group = fakeGroup();
            renderEdge(makeEdge(), group, defaultOptions());

            const fg = group as unknown as FakeElement;
            expect(fg.children.length).toBe(1);
            expect(fg.children[0].tagName).toBe('path');
        });

        it('sets required SVG attributes on the path', () => {
            const group = fakeGroup();
            renderEdge(makeEdge(), group, defaultOptions());

            const path = (group as unknown as FakeElement).children[0];
            expect(path.attrs.get('fill')).toBe('none');
            expect(path.attrs.get('stroke')).toBeDefined();
            expect(path.attrs.get('stroke-width')).toBeDefined();
            expect(path.attrs.get('marker-end')).toBe('url(#arrowhead)');
            expect(path.attrs.get('class')).toBe('edge');
        });

        it('sets data attributes for source and target', () => {
            const group = fakeGroup();
            const edge = makeEdge({ id: 'e99', source: 'n1', target: 'n2' });
            renderEdge(edge, group, defaultOptions());

            const path = (group as unknown as FakeElement).children[0];
            expect(path.attrs.get('data-source')).toBe('n1');
            expect(path.attrs.get('data-target')).toBe('n2');
            expect(path.attrs.get('data-edge-id')).toBe('e99');
        });

        it('sets data-sql-clause when edge has sqlClause', () => {
            const group = fakeGroup();
            const edge = makeEdge({ sqlClause: 'WHERE a.id = b.id' });
            renderEdge(edge, group, defaultOptions());

            const path = (group as unknown as FakeElement).children[0];
            expect(path.attrs.get('data-sql-clause')).toBe('WHERE a.id = b.id');
        });

        it('sets data-clause-type when edge has clauseType', () => {
            const group = fakeGroup();
            const edge = makeEdge({ clauseType: 'join' });
            renderEdge(edge, group, defaultOptions());

            const path = (group as unknown as FakeElement).children[0];
            expect(path.attrs.get('data-clause-type')).toBe('join');
        });

        it('sets data-start-line when edge has startLine', () => {
            const group = fakeGroup();
            const edge = makeEdge({ startLine: 42 });
            renderEdge(edge, group, defaultOptions());

            const path = (group as unknown as FakeElement).children[0];
            expect(path.attrs.get('data-start-line')).toBe('42');
        });

        it('does not render if source node is missing', () => {
            const group = fakeGroup();
            const edge = makeEdge({ source: 'nonexistent' });
            renderEdge(edge, group, defaultOptions());

            const fg = group as unknown as FakeElement;
            expect(fg.children.length).toBe(0);
        });

        it('does not render if target node is missing', () => {
            const group = fakeGroup();
            const edge = makeEdge({ target: 'nonexistent' });
            renderEdge(edge, group, defaultOptions());

            const fg = group as unknown as FakeElement;
            expect(fg.children.length).toBe(0);
        });

        it('sets cursor and transition styles', () => {
            const group = fakeGroup();
            renderEdge(makeEdge(), group, defaultOptions());

            const path = (group as unknown as FakeElement).children[0];
            expect(path.style.cursor).toBe('pointer');
            expect(path.style.transition).toContain('stroke');
        });

        it('applies subquery_flow dash pattern', () => {
            const group = fakeGroup();
            const edge = makeEdge({ clauseType: 'subquery_flow' });
            renderEdge(edge, group, defaultOptions());

            const path = (group as unknown as FakeElement).children[0];
            expect(path.attrs.get('stroke-dasharray')).toBeDefined();
        });

        it('registers click event listener', () => {
            const group = fakeGroup();
            const onClick = jest.fn();
            const edge = makeEdge();
            renderEdge(edge, group, defaultOptions({ onEdgeClick: onClick }));

            const path = (group as unknown as FakeElement).children[0];
            expect(path.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        });

        it('registers hover event listeners', () => {
            const group = fakeGroup();
            renderEdge(makeEdge(), group, defaultOptions());

            const path = (group as unknown as FakeElement).children[0];
            expect(path.addEventListener).toHaveBeenCalledWith('mouseenter', expect.any(Function));
            expect(path.addEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
        });

        it('uses light theme stroke colors when isDark is false', () => {
            const groupDark = fakeGroup();
            const groupLight = fakeGroup();

            renderEdge(makeEdge(), groupDark, defaultOptions({ isDark: true }));
            renderEdge(makeEdge(), groupLight, defaultOptions({ isDark: false }));

            const darkStroke = (groupDark as unknown as FakeElement).children[0].attrs.get('stroke');
            const lightStroke = (groupLight as unknown as FakeElement).children[0].attrs.get('stroke');
            expect(darkStroke).not.toEqual(lightStroke);
        });
    });

    describe('createTransformationBadge', () => {
        it('creates a group with rect and text', () => {
            const badge = createTransformationBadge(100, 50, 'SUM', '#6366f1', '∑');
            const fg = badge as unknown as FakeElement;

            expect(fg.tagName).toBe('g');
            expect(fg.attrs.get('class')).toBe('lineage-badge');
            expect(fg.children.length).toBe(2);

            const rect = fg.children[0];
            expect(rect.tagName).toBe('rect');
            expect(rect.attrs.get('fill')).toBe('#6366f1');

            const text = fg.children[1];
            expect(text.tagName).toBe('text');
            expect(text.textContent).toBe('SUM');
        });

        it('centers badge rect around x position', () => {
            const badge = createTransformationBadge(200, 100, 'AVG', '#ec4899', '');
            const rect = (badge as unknown as FakeElement).children[0];

            const x = parseFloat(rect.attrs.get('x')!);
            const width = parseFloat(rect.attrs.get('width')!);
            // Center of rect should be approximately at 200
            expect(x + width / 2).toBeCloseTo(200, 0);
        });

        it('uses contrast text color (white on dark bg, dark on light bg)', () => {
            const darkBadge = createTransformationBadge(0, 0, 'X', '#000000', '');
            const lightBadge = createTransformationBadge(0, 0, 'X', '#ffffff', '');

            const darkText = (darkBadge as unknown as FakeElement).children[1];
            const lightText = (lightBadge as unknown as FakeElement).children[1];

            // Dark background → white text, light background → dark text
            expect(darkText.attrs.get('fill')).not.toEqual(lightText.attrs.get('fill'));
        });
    });

    describe('clearLineageBadges', () => {
        it('removes all elements with class lineage-badge', () => {
            const group = fakeGroup();
            const badge1 = createFakeElement('g', 'http://www.w3.org/2000/svg');
            badge1.setAttribute('class', 'lineage-badge');
            const badge2 = createFakeElement('g', 'http://www.w3.org/2000/svg');
            badge2.setAttribute('class', 'lineage-badge');
            const nonBadge = createFakeElement('path', 'http://www.w3.org/2000/svg');

            group.appendChild(badge1 as any);
            group.appendChild(badge2 as any);
            group.appendChild(nonBadge as any);

            const fg = group as unknown as FakeElement;
            expect(fg.children.length).toBe(3);

            clearLineageBadges(group as unknown as SVGGElement);

            // Badges should be removed via remove() calls
            expect(badge1.remove).toHaveBeenCalled();
            expect(badge2.remove).toHaveBeenCalled();
        });
    });

    describe('highlightConnectedEdges', () => {
        it('highlights edges connected to the specified node', () => {
            const group = fakeGroup();

            // Create fake edge elements
            const edge1 = createFakeElement('path', 'http://www.w3.org/2000/svg');
            edge1.setAttribute('class', 'edge');
            edge1.setAttribute('data-source', 'n1');
            edge1.setAttribute('data-target', 'n2');
            group.appendChild(edge1 as any);

            const edge2 = createFakeElement('path', 'http://www.w3.org/2000/svg');
            edge2.setAttribute('class', 'edge');
            edge2.setAttribute('data-source', 'n3');
            edge2.setAttribute('data-target', 'n4');
            group.appendChild(edge2 as any);

            highlightConnectedEdges('n1', true, group as unknown as SVGGElement, true);

            // edge1 is connected to n1 → should be highlighted
            expect(edge1.setAttribute).toHaveBeenCalledWith('stroke-width', '3');
            // edge2 is NOT connected to n1 → should NOT be highlighted with width 3
            const edge2StrokeWidthCalls = (edge2.setAttribute as jest.Mock).mock.calls
                .filter(([name, val]: [string, string]) => name === 'stroke-width' && val === '3');
            expect(edge2StrokeWidthCalls.length).toBe(0);
        });

        it('restores default styling when highlight is false', () => {
            const group = fakeGroup();

            const edge = createFakeElement('path', 'http://www.w3.org/2000/svg');
            edge.setAttribute('class', 'edge');
            edge.setAttribute('data-source', 'n1');
            edge.setAttribute('data-target', 'n2');
            group.appendChild(edge as any);

            highlightConnectedEdges('n1', false, group as unknown as SVGGElement, true);

            // Should restore default arrowhead marker
            expect(edge.setAttribute).toHaveBeenCalledWith('marker-end', 'url(#arrowhead)');
        });
    });
});
