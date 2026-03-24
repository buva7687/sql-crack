/**
 * Tests for cloudRenderer using shared fake DOM helper.
 * Covers layout helpers, renderCloudSubflow, and renderSubflow.
 */

import {
    installFakeDocument,
    uninstallFakeDocument,
    createFakeElement,
    FakeElement,
} from '../../../helpers/fakeDom';
import type { FlowEdge, FlowNode } from '../../../../src/webview/types';
import {
    layoutSubflowNodes,
    layoutSubflowNodesVertical,
    renderCloudSubflow,
    renderSubflow,
    type RenderCloudSubflowOptions,
    type RenderSubflowOptions,
} from '../../../../src/webview/rendering/cloudRenderer';

// ============================================================
// Helpers
// ============================================================

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
    return {
        id: 'n1',
        type: 'table',
        label: 'users',
        x: 10,
        y: 20,
        width: 120,
        height: 36,
        ...overrides,
    };
}

function fakeGroup(): SVGGElement {
    return createFakeElement('g', 'http://www.w3.org/2000/svg') as unknown as SVGGElement;
}

function makeCloudOptions(overrides: Partial<RenderCloudSubflowOptions> = {}): RenderCloudSubflowOptions {
    return {
        childEdges: [],
        children: [],
        group: fakeGroup(),
        isDarkTheme: true,
        offsetX: 0,
        offsetY: 0,
        getNodeIcon: () => 'T',
        hideTooltip: jest.fn(),
        selectNode: jest.fn(),
        showTooltip: jest.fn(),
        truncate: (v: string, max: number) => (v.length > max ? v.slice(0, max) + '...' : v),
        updateTooltipPosition: jest.fn(),
        ...overrides,
    };
}

function makeSubflowOptions(overrides: Partial<RenderSubflowOptions> = {}): RenderSubflowOptions {
    return {
        childEdges: [],
        children: [],
        containerHeight: 200,
        containerWidth: 300,
        group: fakeGroup(),
        isDarkTheme: true,
        offsetX: 0,
        offsetY: 0,
        parentNode: makeNode({ id: 'parent-1' }),
        getNodeIcon: () => 'T',
        truncate: (v: string, max: number) => (v.length > max ? v.slice(0, max) + '...' : v),
        ...overrides,
    };
}

// ============================================================
// Layout helpers (no DOM needed)
// ============================================================

describe('cloudRenderer layout helpers', () => {
    it('returns fallback dimensions for empty horizontal and vertical subflows', () => {
        expect(layoutSubflowNodes([], [])).toEqual({ width: 200, height: 100 });
        expect(layoutSubflowNodesVertical([], [])).toEqual({ width: 120, height: 100 });
    });

    it('lays out horizontal subflows left-to-right and sizes nodes by label length', () => {
        const children = [
            makeNode({ id: 'a', label: 'short' }),
            makeNode({ id: 'b', label: 'much_longer_label' }),
        ];
        const edges: FlowEdge[] = [{ id: 'e1', source: 'a', target: 'b' }];

        const size = layoutSubflowNodes(children, edges);

        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
        expect(children[0].width).toBeGreaterThanOrEqual(80);
        expect(children[1].width).toBeGreaterThan(children[0].width);
        expect(children[1].x).toBeGreaterThan(children[0].x);
    });

    it('lays out vertical subflows top-to-bottom with fixed node sizes', () => {
        const children = [
            makeNode({ id: 'a', label: 'A' }),
            makeNode({ id: 'b', label: 'B' }),
            makeNode({ id: 'c', label: 'C' }),
        ];
        const edges: FlowEdge[] = [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e2', source: 'b', target: 'c' },
        ];

        const size = layoutSubflowNodesVertical(children, edges);

        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
        expect(children.every(child => child.width === 180)).toBe(true);
        expect(children.every(child => child.height === 60)).toBe(true);
        expect(children[1].y).toBeGreaterThan(children[0].y);
        expect(children[2].y).toBeGreaterThan(children[1].y);
    });
});

// ============================================================
// renderCloudSubflow (DOM rendering)
// ============================================================

describe('renderCloudSubflow', () => {
    beforeEach(() => installFakeDocument());
    afterEach(() => uninstallFakeDocument());

    it('renders nothing into group when children and edges are empty', () => {
        const group = fakeGroup();
        renderCloudSubflow(makeCloudOptions({ group }));

        const fg = group as unknown as FakeElement;
        expect(fg.children.length).toBe(0);
    });

    it('renders edge paths between connected child nodes', () => {
        const children = [
            makeNode({ id: 'a', label: 'A', x: 0, y: 0, width: 100, height: 36 }),
            makeNode({ id: 'b', label: 'B', x: 200, y: 0, width: 100, height: 36 }),
        ];
        const childEdges: FlowEdge[] = [{ id: 'e1', source: 'a', target: 'b' }];
        const group = fakeGroup();

        renderCloudSubflow(makeCloudOptions({ group, children, childEdges }));

        const fg = group as unknown as FakeElement;
        // First child should be the edge path
        const pathEl = fg.children[0];
        expect(pathEl.tagName).toBe('path');
        expect(pathEl.attrs.get('fill')).toBe('none');
        expect(pathEl.attrs.get('stroke-width')).toBe('2');
        expect(pathEl.attrs.get('d')).toContain('M');
        expect(pathEl.attrs.get('d')).toContain('C');
    });

    it('skips edges with missing source or target nodes', () => {
        const children = [makeNode({ id: 'a', label: 'A' })];
        const childEdges: FlowEdge[] = [{ id: 'e1', source: 'a', target: 'missing' }];
        const group = fakeGroup();

        renderCloudSubflow(makeCloudOptions({ group, children, childEdges }));

        const fg = group as unknown as FakeElement;
        // No edge path, just the child node group
        const paths = fg.children.filter(c => c.tagName === 'path');
        expect(paths.length).toBe(0);
    });

    it('renders a group per child node with rect, accent strip, icon, and label', () => {
        const children = [makeNode({ id: 'n1', label: 'orders', type: 'table' })];
        const group = fakeGroup();

        renderCloudSubflow(makeCloudOptions({ group, children }));

        const fg = group as unknown as FakeElement;
        expect(fg.children.length).toBe(1); // one child group
        const childGroup = fg.children[0];
        expect(childGroup.tagName).toBe('g');
        expect(childGroup.attrs.get('class')).toBe('cloud-subflow-node');
        expect(childGroup.attrs.get('data-node-id')).toBe('n1');

        // rect, accent strip, icon text, label text
        expect(childGroup.children.length).toBeGreaterThanOrEqual(4);
        expect(childGroup.children[0].tagName).toBe('rect'); // main rect
        expect(childGroup.children[1].tagName).toBe('rect'); // accent strip
        expect(childGroup.children[1].attrs.get('width')).toBe('3');
        expect(childGroup.children[2].tagName).toBe('text'); // icon
        expect(childGroup.children[3].tagName).toBe('text'); // label
        expect(childGroup.children[3].textContent).toBe('orders');
    });

    it('renders description text when child.description is set', () => {
        const children = [makeNode({ id: 'n1', label: 'orders', description: 'Order table' })];
        const group = fakeGroup();

        renderCloudSubflow(makeCloudOptions({ group, children }));

        const childGroup = (group as unknown as FakeElement).children[0];
        // 5 children: rect, accent, icon, label, description
        expect(childGroup.children.length).toBe(5);
        const descText = childGroup.children[4];
        expect(descText.tagName).toBe('text');
        expect(descText.textContent).toBe('Order table');
    });

    it('truncates label and description via truncate callback', () => {
        const children = [makeNode({
            id: 'n1',
            label: 'very_long_table_name_here',
            description: 'This is a very long description text',
        })];
        const group = fakeGroup();
        const truncate = jest.fn((v: string, max: number) => v.length > max ? v.slice(0, max) + '...' : v);

        renderCloudSubflow(makeCloudOptions({ group, children, truncate }));

        expect(truncate).toHaveBeenCalledWith('very_long_table_name_here', 18);
        expect(truncate).toHaveBeenCalledWith('This is a very long description text', 22);
    });

    it('uses dark theme colors when isDarkTheme is true', () => {
        const children = [makeNode({ id: 'n1', label: 'A' })];
        const group = fakeGroup();

        renderCloudSubflow(makeCloudOptions({ group, children, isDarkTheme: true }));

        const fg = group as unknown as FakeElement;
        // Edge stroke is dark-specific
        // Child rect fill is dark surface
        const childRect = fg.children[0].children[0];
        expect(childRect.attrs.get('fill')).toBe('#1A1A1A');
    });

    it('uses light theme colors when isDarkTheme is false', () => {
        const children = [makeNode({ id: 'n1', label: 'A' })];
        const group = fakeGroup();

        renderCloudSubflow(makeCloudOptions({ group, children, isDarkTheme: false }));

        const fg = group as unknown as FakeElement;
        const childRect = fg.children[0].children[0];
        expect(childRect.attrs.get('fill')).toBe('#FFFFFF');
    });

    it('uses dark edge stroke for dark theme and light edge stroke for light theme', () => {
        const children = [
            makeNode({ id: 'a', label: 'A', x: 0, y: 0, width: 100, height: 36 }),
            makeNode({ id: 'b', label: 'B', x: 200, y: 100, width: 100, height: 36 }),
        ];
        const childEdges: FlowEdge[] = [{ id: 'e1', source: 'a', target: 'b' }];

        const groupDark = fakeGroup();
        renderCloudSubflow(makeCloudOptions({ group: groupDark, children: [...children.map(c => ({ ...c }))], childEdges, isDarkTheme: true }));

        const groupLight = fakeGroup();
        renderCloudSubflow(makeCloudOptions({ group: groupLight, children: [...children.map(c => ({ ...c }))], childEdges, isDarkTheme: false }));

        const darkPath = (groupDark as unknown as FakeElement).children[0];
        const lightPath = (groupLight as unknown as FakeElement).children[0];
        expect(darkPath.attrs.get('stroke')).toBe('rgba(255, 255, 255, 0.15)');
        expect(lightPath.attrs.get('stroke')).toBe('rgba(0, 0, 0, 0.1)');
    });

    it('registers mouseenter, mousemove, mouseleave, and click event listeners', () => {
        const children = [makeNode({ id: 'n1', label: 'A' })];
        const group = fakeGroup();
        const hideTooltip = jest.fn();
        const showTooltip = jest.fn();
        const selectNode = jest.fn();
        const updateTooltipPosition = jest.fn();

        renderCloudSubflow(makeCloudOptions({
            group,
            children,
            hideTooltip,
            showTooltip,
            selectNode,
            updateTooltipPosition,
        }));

        const childGroup = (group as unknown as FakeElement).children[0];
        expect(childGroup.addEventListener).toHaveBeenCalledWith('mouseenter', expect.any(Function));
        expect(childGroup.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
        expect(childGroup.addEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
        expect(childGroup.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('click handler calls selectNode and hideTooltip', () => {
        const children = [makeNode({ id: 'n1', label: 'A' })];
        const group = fakeGroup();
        const hideTooltip = jest.fn();
        const selectNode = jest.fn();

        renderCloudSubflow(makeCloudOptions({ group, children, hideTooltip, selectNode }));

        const childGroup = (group as unknown as FakeElement).children[0];
        // Fire click event
        const clickEvent = { type: 'click', stopPropagation: jest.fn(), ctrlKey: false, metaKey: false };
        childGroup.dispatchEvent(clickEvent);

        expect(clickEvent.stopPropagation).toHaveBeenCalled();
        expect(selectNode).toHaveBeenCalledWith('n1', { skipNavigation: true });
        expect(hideTooltip).toHaveBeenCalled();
    });

    it('click with ctrl/meta key sets skipNavigation to false', () => {
        const children = [makeNode({ id: 'n1', label: 'A' })];
        const group = fakeGroup();
        const selectNode = jest.fn();

        renderCloudSubflow(makeCloudOptions({ group, children, selectNode }));

        const childGroup = (group as unknown as FakeElement).children[0];
        const clickEvent = { type: 'click', stopPropagation: jest.fn(), ctrlKey: true, metaKey: false };
        childGroup.dispatchEvent(clickEvent);

        expect(selectNode).toHaveBeenCalledWith('n1', { skipNavigation: false });
    });

    it('mouseenter shows tooltip and changes fill to hover color', () => {
        const children = [makeNode({ id: 'n1', label: 'A' })];
        const group = fakeGroup();
        const showTooltip = jest.fn();

        renderCloudSubflow(makeCloudOptions({ group, children, showTooltip, isDarkTheme: true }));

        const childGroup = (group as unknown as FakeElement).children[0];
        const rect = childGroup.children[0];
        const mouseEvent = { type: 'mouseenter' };
        childGroup.dispatchEvent(mouseEvent);

        expect(showTooltip).toHaveBeenCalled();
        // Rect fill changes to dark hover color
        expect(rect.attrs.get('fill')).toBe('#222222');
    });

    it('mouseleave hides tooltip and restores original fill', () => {
        const children = [makeNode({ id: 'n1', label: 'A' })];
        const group = fakeGroup();
        const hideTooltip = jest.fn();

        renderCloudSubflow(makeCloudOptions({ group, children, hideTooltip, isDarkTheme: true }));

        const childGroup = (group as unknown as FakeElement).children[0];
        const rect = childGroup.children[0];

        // Hover then leave
        childGroup.dispatchEvent({ type: 'mouseenter' });
        expect(rect.attrs.get('fill')).toBe('#222222');

        childGroup.dispatchEvent({ type: 'mouseleave' });
        expect(hideTooltip).toHaveBeenCalled();
        expect(rect.attrs.get('fill')).toBe('#1A1A1A'); // restored to dark surface
    });

    it('renders multiple children and edges correctly', () => {
        const children = [
            makeNode({ id: 'a', label: 'A', x: 0, y: 0, width: 100, height: 36 }),
            makeNode({ id: 'b', label: 'B', x: 200, y: 0, width: 100, height: 36 }),
            makeNode({ id: 'c', label: 'C', x: 400, y: 0, width: 100, height: 36 }),
        ];
        const childEdges: FlowEdge[] = [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e2', source: 'b', target: 'c' },
        ];
        const group = fakeGroup();

        renderCloudSubflow(makeCloudOptions({ group, children, childEdges }));

        const fg = group as unknown as FakeElement;
        // 2 edge paths + 3 child groups = 5
        expect(fg.children.length).toBe(5);
        expect(fg.children[0].tagName).toBe('path');
        expect(fg.children[1].tagName).toBe('path');
        expect(fg.children[2].tagName).toBe('g');
        expect(fg.children[3].tagName).toBe('g');
        expect(fg.children[4].tagName).toBe('g');
    });

    it('applies offset to child positions', () => {
        const children = [makeNode({ id: 'n1', label: 'A', x: 10, y: 20, width: 100, height: 36 })];
        const group = fakeGroup();

        renderCloudSubflow(makeCloudOptions({ group, children, offsetX: 50, offsetY: 30 }));

        const childGroup = (group as unknown as FakeElement).children[0];
        const rect = childGroup.children[0];
        expect(rect.attrs.get('x')).toBe('60');  // 50 + 10
        expect(rect.attrs.get('y')).toBe('50');  // 30 + 20
    });
});

// ============================================================
// renderSubflow (DOM rendering)
// ============================================================

describe('renderSubflow', () => {
    beforeEach(() => installFakeDocument());
    afterEach(() => uninstallFakeDocument());

    it('creates defs with clipPath and a subflow group', () => {
        const group = fakeGroup();
        renderSubflow(makeSubflowOptions({ group }));

        const fg = group as unknown as FakeElement;
        expect(fg.children.length).toBe(2); // defs + subflowGroup

        // defs → clipPath → clipRect
        const defs = fg.children[0];
        expect(defs.tagName).toBe('defs');
        const clip = defs.children[0];
        expect(clip.tagName).toBe('clipPath');
        expect(clip.attrs.get('id')).toBe('clip-parent-1');
        const clipRect = clip.children[0];
        expect(clipRect.tagName).toBe('rect');
        expect(clipRect.attrs.get('width')).toBe('300');
        expect(clipRect.attrs.get('height')).toBe('200');
    });

    it('subflow group has correct class and clip-path reference', () => {
        const group = fakeGroup();
        renderSubflow(makeSubflowOptions({ group }));

        const fg = group as unknown as FakeElement;
        const subflowGroup = fg.children[1];
        expect(subflowGroup.attrs.get('class')).toBe('subflow-group');
        expect(subflowGroup.attrs.get('clip-path')).toBe('url(#clip-parent-1)');
    });

    it('renders background rect inside subflow group', () => {
        const group = fakeGroup();
        renderSubflow(makeSubflowOptions({ group }));

        const fg = group as unknown as FakeElement;
        const subflowGroup = fg.children[1];
        // First child of subflow group is background rect
        const bg = subflowGroup.children[0];
        expect(bg.tagName).toBe('rect');
        expect(bg.attrs.get('width')).toBe('300');
        expect(bg.attrs.get('height')).toBe('200');
        expect(bg.attrs.get('rx')).toBe('6');
    });

    it('renders edge paths between child nodes', () => {
        const children = [
            makeNode({ id: 'a', label: 'A', x: 0, y: 0, width: 100, height: 40 }),
            makeNode({ id: 'b', label: 'B', x: 200, y: 0, width: 100, height: 40 }),
        ];
        const childEdges: FlowEdge[] = [{ id: 'e1', source: 'a', target: 'b' }];
        const group = fakeGroup();

        renderSubflow(makeSubflowOptions({ group, children, childEdges }));

        const subflowGroup = (group as unknown as FakeElement).children[1];
        // bg rect + 1 edge path + 2 child groups = 4
        expect(subflowGroup.children.length).toBe(4);
        const pathEl = subflowGroup.children[1];
        expect(pathEl.tagName).toBe('path');
        expect(pathEl.attrs.get('fill')).toBe('none');
        expect(pathEl.attrs.get('stroke-width')).toBe('2');
    });

    it('skips edges with missing nodes', () => {
        const children = [makeNode({ id: 'a', label: 'A' })];
        const childEdges: FlowEdge[] = [{ id: 'e1', source: 'a', target: 'missing' }];
        const group = fakeGroup();

        renderSubflow(makeSubflowOptions({ group, children, childEdges }));

        const subflowGroup = (group as unknown as FakeElement).children[1];
        // bg rect + 1 child group (no edge path)
        const paths = subflowGroup.children.filter(c => c.tagName === 'path');
        expect(paths.length).toBe(0);
    });

    it('renders child nodes with rect, accent strip, icon, and label', () => {
        const children = [makeNode({ id: 'n1', label: 'orders', type: 'table', width: 180, height: 60 })];
        const group = fakeGroup();

        renderSubflow(makeSubflowOptions({ group, children }));

        const subflowGroup = (group as unknown as FakeElement).children[1];
        // bg + child group
        const childGroup = subflowGroup.children[1];
        expect(childGroup.tagName).toBe('g');
        expect(childGroup.attrs.get('class')).toBe('subflow-node');

        // rect, accent, icon, label
        expect(childGroup.children.length).toBe(4);
        expect(childGroup.children[0].tagName).toBe('rect');
        expect(childGroup.children[1].tagName).toBe('rect'); // accent strip
        expect(childGroup.children[1].attrs.get('width')).toBe('3');
        expect(childGroup.children[2].tagName).toBe('text'); // icon
        expect(childGroup.children[3].tagName).toBe('text'); // label
        expect(childGroup.children[3].textContent).toBe('orders');
    });

    it('uses dark theme colors when isDarkTheme is true', () => {
        const children = [makeNode({ id: 'n1', label: 'A', width: 180, height: 60 })];
        const group = fakeGroup();

        renderSubflow(makeSubflowOptions({ group, children, isDarkTheme: true }));

        const subflowGroup = (group as unknown as FakeElement).children[1];
        const bg = subflowGroup.children[0];
        expect(bg.attrs.get('fill')).toBe('rgba(0, 0, 0, 0.2)');

        const childRect = subflowGroup.children[1].children[0];
        expect(childRect.attrs.get('fill')).toBe('#1A1A1A');
    });

    it('uses light theme colors when isDarkTheme is false', () => {
        const children = [makeNode({ id: 'n1', label: 'A', width: 180, height: 60 })];
        const group = fakeGroup();

        renderSubflow(makeSubflowOptions({ group, children, isDarkTheme: false }));

        const subflowGroup = (group as unknown as FakeElement).children[1];
        const bg = subflowGroup.children[0];
        expect(bg.attrs.get('fill')).toBe('rgba(0, 0, 0, 0.03)');

        const childRect = subflowGroup.children[1].children[0];
        expect(childRect.attrs.get('fill')).toBe('#FFFFFF');
    });

    it('applies offset to clip rect and child positions', () => {
        const children = [makeNode({ id: 'n1', label: 'A', x: 10, y: 20, width: 100, height: 40 })];
        const group = fakeGroup();

        renderSubflow(makeSubflowOptions({ group, children, offsetX: 50, offsetY: 30 }));

        // Clip rect should be at offset
        const defs = (group as unknown as FakeElement).children[0];
        const clipRect = defs.children[0].children[0];
        expect(clipRect.attrs.get('x')).toBe('50');
        expect(clipRect.attrs.get('y')).toBe('30');

        // Child node rect should be offset
        const subflowGroup = (group as unknown as FakeElement).children[1];
        const childRect = subflowGroup.children[1].children[0]; // skip bg
        expect(childRect.attrs.get('x')).toBe('60');  // 50 + 10
        expect(childRect.attrs.get('y')).toBe('50');  // 30 + 20
    });

    it('truncates child labels via truncate callback', () => {
        const children = [makeNode({ id: 'n1', label: 'a_very_long_name', width: 180, height: 60 })];
        const group = fakeGroup();
        const truncate = jest.fn((v: string, max: number) => v.length > max ? v.slice(0, max) + '...' : v);

        renderSubflow(makeSubflowOptions({ group, children, truncate }));

        expect(truncate).toHaveBeenCalledWith('a_very_long_name', 14);
    });

    it('uses horizontal cubic bezier for edges (source right → target left)', () => {
        const children = [
            makeNode({ id: 'a', label: 'A', x: 0, y: 0, width: 100, height: 40 }),
            makeNode({ id: 'b', label: 'B', x: 200, y: 0, width: 100, height: 40 }),
        ];
        const childEdges: FlowEdge[] = [{ id: 'e1', source: 'a', target: 'b' }];
        const group = fakeGroup();

        renderSubflow(makeSubflowOptions({ group, children, childEdges, offsetX: 0, offsetY: 0 }));

        const subflowGroup = (group as unknown as FakeElement).children[1];
        const pathEl = subflowGroup.children[1]; // after bg rect
        const d = pathEl.attrs.get('d')!;
        // Source: x + width = 100, y + height/2 = 20
        // Target: x = 200, y + height/2 = 20
        expect(d).toContain('M 100 20');
        expect(d).toContain('200 20');
    });
});
