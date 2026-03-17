/**
 * Tests for nodeRenderer using shared fake DOM helper.
 * Verifies that rendering functions create correct SVG structures.
 */

import {
    installFakeDocument,
    uninstallFakeDocument,
    getCreatedElements,
    getElementsOfType,
    FakeElement,
} from '../../../helpers/fakeDom';
import {
    renderClusterNodeVisual,
    renderStandardNodeVisual,
    renderJoinNodeVisual,
    NodeVisualRendererDeps,
} from '../../../../src/webview/rendering/nodeRenderer';
import type { FlowNode, ViewState } from '../../../../src/webview/types';
import { createFakeElement } from '../../../helpers/fakeDom';

// ============================================================
// Helpers
// ============================================================

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
    return {
        id: 'test-node',
        type: 'table',
        label: 'users',
        x: 50,
        y: 100,
        width: 180,
        height: 60,
        ...overrides,
    };
}

function makeDeps(overrides: Partial<NodeVisualRendererDeps> = {}): NodeVisualRendererDeps {
    return {
        state: {
            isDarkTheme: true,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            layoutType: 'vertical',
        } as ViewState,
        getNodeAccentPosition: () => 'left',
        getNodeVisualIcon: () => 'T',
        getJoinColor: () => '#ec4899',
        getJoinVennDiagram: () => '<div>venn</div>',
        getWarningColor: () => '#f59e0b',
        truncate: (v: string, max: number) => v.length > max ? v.slice(0, max) + '...' : v,
        ...overrides,
    };
}

function fakeGroup(): SVGGElement {
    return createFakeElement('g', 'http://www.w3.org/2000/svg') as unknown as SVGGElement;
}

// ============================================================
// Tests
// ============================================================

describe('nodeRenderer', () => {
    beforeEach(() => installFakeDocument());
    afterEach(() => uninstallFakeDocument());

    describe('renderClusterNodeVisual', () => {
        it('creates a rect, label, and expand icon', () => {
            const group = fakeGroup();
            const node = makeNode({ type: 'cluster' as any, label: 'Group A' });
            renderClusterNodeVisual(node, group, makeDeps());

            const fakeGroupEl = group as unknown as FakeElement;
            expect(fakeGroupEl.children.length).toBe(3);

            // First child: rect
            const rect = fakeGroupEl.children[0];
            expect(rect.tagName).toBe('rect');
            expect(rect.attrs.get('x')).toBe('50');
            expect(rect.attrs.get('y')).toBe('100');
            expect(rect.attrs.get('width')).toBe('180');
            expect(rect.attrs.get('height')).toBe('60');
            expect(rect.attrs.get('stroke-dasharray')).toBe('6,3');

            // Second child: label text
            const label = fakeGroupEl.children[1];
            expect(label.tagName).toBe('text');
            expect(label.textContent).toBe('Group A');

            // Third child: expand icon
            const icon = fakeGroupEl.children[2];
            expect(icon.tagName).toBe('text');
            expect(icon.textContent).toBe('+');
        });

        it('uses dark theme surface colors when isDarkTheme is true', () => {
            const group = fakeGroup();
            renderClusterNodeVisual(makeNode(), group, makeDeps());

            const rect = (group as unknown as FakeElement).children[0];
            // Dark theme fill from NODE_SURFACE.dark
            expect(rect.attrs.get('fill')).toBeDefined();
            expect(rect.attrs.get('fill')).not.toBe('');
        });

        it('uses light theme surface colors when isDarkTheme is false', () => {
            const group = fakeGroup();
            const deps = makeDeps({
                state: { isDarkTheme: false, scale: 1, offsetX: 0, offsetY: 0, layoutType: 'vertical' } as ViewState,
            });
            renderClusterNodeVisual(makeNode(), group, deps);

            const rect = (group as unknown as FakeElement).children[0];
            expect(rect.attrs.get('fill')).toBeDefined();
        });
    });

    describe('renderStandardNodeVisual', () => {
        it('creates at minimum: rect, accent strip, icon, and label', () => {
            const group = fakeGroup();
            const node = makeNode({ type: 'table', label: 'orders' });
            renderStandardNodeVisual(node, group, makeDeps());

            const fg = group as unknown as FakeElement;
            // Should have multiple children: rect, accent strip, icon, label (+ optional badge, desc)
            expect(fg.children.length).toBeGreaterThanOrEqual(4);

            // First element should be the main rect
            const rect = fg.children[0];
            expect(rect.tagName).toBe('rect');
            expect(rect.attrs.get('class')).toBe('node-rect');
            expect(rect.attrs.get('filter')).toBe('url(#shadow)');
        });

        it('positions node at correct coordinates', () => {
            const group = fakeGroup();
            const node = makeNode({ x: 200, y: 300, width: 150, height: 70 });
            renderStandardNodeVisual(node, group, makeDeps());

            const rect = (group as unknown as FakeElement).children[0];
            expect(rect.attrs.get('x')).toBe('200');
            expect(rect.attrs.get('y')).toBe('300');
            expect(rect.attrs.get('width')).toBe('150');
            expect(rect.attrs.get('height')).toBe('70');
        });

        it('uses left accent position by default', () => {
            const group = fakeGroup();
            renderStandardNodeVisual(makeNode(), group, makeDeps());

            // Second child should be the accent strip
            const accentStrip = (group as unknown as FakeElement).children[1];
            expect(accentStrip.tagName).toBe('rect');
            // Left accent: width=3 (thin left strip)
            expect(accentStrip.attrs.get('width')).toBe('3');
        });

        it('renders bottom accent when configured', () => {
            const group = fakeGroup();
            const deps = makeDeps({ getNodeAccentPosition: () => 'bottom' });
            renderStandardNodeVisual(makeNode(), group, deps);

            // Accent strip should have full width and small height (bottom position)
            const fg = group as unknown as FakeElement;
            const accentStrip = fg.children[1];
            expect(accentStrip.tagName).toBe('rect');
            // Bottom accent: height=3
            expect(accentStrip.attrs.get('height')).toBe('3');
        });

        it('sets write mode stroke for write-access tables', () => {
            const group = fakeGroup();
            const node = makeNode({ type: 'table', accessMode: 'write' });
            renderStandardNodeVisual(node, group, makeDeps());

            const rect = (group as unknown as FakeElement).children[0];
            // Write stroke is reddish
            expect(rect.attrs.get('stroke')).toContain('239');
        });

        it('renders label text with node label content', () => {
            const group = fakeGroup();
            const node = makeNode({ label: 'my_table' });
            renderStandardNodeVisual(node, group, makeDeps());

            const fg = group as unknown as FakeElement;
            const textElements = fg.children.filter(c => c.tagName === 'text');
            const hasLabel = textElements.some(t => t.textContent === 'my_table');
            expect(hasLabel).toBe(true);
        });
    });

    describe('renderJoinNodeVisual', () => {
        it('creates rect, accent strip, foreignObject (venn), and label', () => {
            const group = fakeGroup();
            const node = makeNode({
                type: 'join',
                label: 'INNER JOIN',
                joinType: 'INNER',
            });
            renderJoinNodeVisual(node, group, makeDeps());

            const fg = group as unknown as FakeElement;
            expect(fg.children.length).toBeGreaterThanOrEqual(3);

            // Should have a rect
            const rects = fg.children.filter(c => c.tagName === 'rect');
            expect(rects.length).toBeGreaterThanOrEqual(1);

            // Should have foreignObject for venn diagram
            const foreignObjects = fg.children.filter(c => c.tagName === 'foreignObject');
            expect(foreignObjects.length).toBe(1);
        });

        it('renders join condition text when details are present', () => {
            const group = fakeGroup();
            const node = makeNode({
                type: 'join',
                label: 'LEFT JOIN',
                joinType: 'LEFT',
                details: ['ON a.id = b.id'],
            });
            renderJoinNodeVisual(node, group, makeDeps());

            const fg = group as unknown as FakeElement;
            const textEls = fg.children.filter(c => c.tagName === 'text');
            const hasCondition = textEls.some(t =>
                t.textContent?.includes('a.id') || t.textContent?.includes('ON')
            );
            expect(hasCondition).toBe(true);
        });
    });

    describe('Theme consistency', () => {
        it('dark and light themes produce different surface fills', () => {
            const groupDark = fakeGroup();
            const groupLight = fakeGroup();

            renderStandardNodeVisual(makeNode(), groupDark, makeDeps());
            renderStandardNodeVisual(makeNode(), groupLight, makeDeps({
                state: { isDarkTheme: false, scale: 1, offsetX: 0, offsetY: 0, layoutType: 'vertical' } as ViewState,
            }));

            const darkFill = (groupDark as unknown as FakeElement).children[0].attrs.get('fill');
            const lightFill = (groupLight as unknown as FakeElement).children[0].attrs.get('fill');
            expect(darkFill).not.toEqual(lightFill);
        });
    });
});
