/**
 * Tests for pure virtualization functions (viewport culling, graph bounds).
 * These are already in a pure module — direct import, no DOM mocking.
 */

import {
    getViewportBounds,
    isNodeInViewport,
    getVisibleElements,
    calculateGraphBounds,
    shouldVirtualize,
    setVirtualizationConfig,
    getVirtualizationConfig,
} from '../../../../src/webview/virtualization';
import type { FlowNode, FlowEdge } from '../../../../src/webview/types';

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

function makeEdge(source: string, target: string): FlowEdge {
    return { id: `${source}->${target}`, source, target, label: '' };
}

// ============================================================
// getViewportBounds
// ============================================================

describe('getViewportBounds', () => {
    it('computes correct bounds at default zoom (scale=1, no offset)', () => {
        const bounds = getViewportBounds(800, 600, 1, 0, 0);
        // -0/scale yields -0 in JS; functionally equivalent to 0
        expect(bounds.minX).toBeCloseTo(0);
        expect(bounds.minY).toBeCloseTo(0);
        expect(bounds.maxX).toBe(800);
        expect(bounds.maxY).toBe(600);
    });

    it('scales inversely with zoom level', () => {
        const bounds = getViewportBounds(800, 600, 2, 0, 0);
        expect(bounds.minX).toBeCloseTo(0);
        expect(bounds.maxX).toBe(400); // 800/2
        expect(bounds.maxY).toBe(300); // 600/2
    });

    it('applies pan offset', () => {
        const bounds = getViewportBounds(800, 600, 1, 100, 50);
        expect(bounds.minX).toBe(-100); // -offsetX/scale
        expect(bounds.minY).toBe(-50);
        expect(bounds.maxX).toBe(700);  // (800-100)/1
        expect(bounds.maxY).toBe(550);
    });

    it('combines zoom and pan correctly', () => {
        const bounds = getViewportBounds(800, 600, 2, 200, 100);
        expect(bounds.minX).toBe(-100); // -200/2
        expect(bounds.minY).toBe(-50);  // -100/2
        expect(bounds.maxX).toBe(300);  // (800-200)/2
        expect(bounds.maxY).toBe(250);  // (600-100)/2
    });
});

// ============================================================
// isNodeInViewport
// ============================================================

describe('isNodeInViewport', () => {
    const bounds = { minX: 0, maxX: 800, minY: 0, maxY: 600 };

    it('returns true for node fully inside viewport', () => {
        const node = makeNode({ id: 'a', x: 100, y: 100 });
        expect(isNodeInViewport(node, bounds, 0)).toBe(true);
    });

    it('returns true for node partially overlapping', () => {
        const node = makeNode({ id: 'b', x: -90, y: 100, width: 180 });
        // Node right edge at -90+180=90, which is > minX(0) → overlaps
        expect(isNodeInViewport(node, bounds, 0)).toBe(true);
    });

    it('returns false for node entirely off-screen right', () => {
        const node = makeNode({ id: 'c', x: 900, y: 100 });
        expect(isNodeInViewport(node, bounds, 0)).toBe(false);
    });

    it('returns false for node entirely off-screen left', () => {
        const node = makeNode({ id: 'd', x: -300, y: 100, width: 100 });
        expect(isNodeInViewport(node, bounds, 0)).toBe(false);
    });

    it('returns false for node entirely off-screen top', () => {
        const node = makeNode({ id: 'e', x: 100, y: -200, height: 50 });
        expect(isNodeInViewport(node, bounds, 0)).toBe(false);
    });

    it('returns false for node entirely off-screen bottom', () => {
        const node = makeNode({ id: 'f', x: 100, y: 700 });
        expect(isNodeInViewport(node, bounds, 0)).toBe(false);
    });

    it('includes nodes within padding zone', () => {
        // Node is at x=850 (outside viewport at 800), but padding=100 extends to 900
        const node = makeNode({ id: 'g', x: 850, y: 100 });
        expect(isNodeInViewport(node, bounds, 100)).toBe(true);
    });

    it('excludes nodes outside padding zone', () => {
        const node = makeNode({ id: 'h', x: 1000, y: 100 });
        expect(isNodeInViewport(node, bounds, 100)).toBe(false);
    });
});

// ============================================================
// getVisibleElements
// ============================================================

describe('getVisibleElements', () => {
    const bounds = { minX: 0, maxX: 800, minY: 0, maxY: 600 };

    beforeEach(() => {
        setVirtualizationConfig({ enabled: true, minNodesForVirtualization: 2, padding: 0 });
    });

    afterEach(() => {
        setVirtualizationConfig({ enabled: true, minNodesForVirtualization: 50, padding: 100 });
    });

    it('returns all elements when below minNodesForVirtualization', () => {
        setVirtualizationConfig({ minNodesForVirtualization: 100 });
        const nodes = [makeNode({ id: 'a', x: 2000, y: 2000 })]; // off-screen
        const result = getVisibleElements(nodes, [], bounds);
        expect(result.visibleNodes).toHaveLength(1); // returned anyway
    });

    it('filters out off-screen nodes when virtualization is active', () => {
        const visible = makeNode({ id: 'v', x: 100, y: 100 });
        const offscreen = makeNode({ id: 'o', x: 2000, y: 2000 });
        const result = getVisibleElements([visible, offscreen], [], bounds);
        expect(result.visibleNodes).toContainEqual(expect.objectContaining({ id: 'v' }));
        expect(result.visibleNodeIds.has('o')).toBe(false);
    });

    it('counts off-screen nodes by direction', () => {
        const nodes = [
            makeNode({ id: 'top', x: 400, y: -200, height: 50 }),
            makeNode({ id: 'bottom', x: 400, y: 800 }),
            makeNode({ id: 'left', x: -400, y: 300, width: 100 }),
            makeNode({ id: 'right', x: 1200, y: 300 }),
            makeNode({ id: 'vis', x: 400, y: 300 }),
        ];
        const result = getVisibleElements(nodes, [], bounds);
        expect(result.offscreenCounts.top).toBeGreaterThanOrEqual(1);
        expect(result.offscreenCounts.bottom).toBeGreaterThanOrEqual(1);
    });

    it('includes 1-hop connected off-screen nodes', () => {
        const visible = makeNode({ id: 'v', x: 100, y: 100 });
        const offscreen = makeNode({ id: 'o', x: 2000, y: 2000 });
        const edges = [makeEdge('v', 'o')];
        const result = getVisibleElements([visible, offscreen], edges, bounds);
        // Off-screen node 'o' should be included because it's connected to visible 'v'
        expect(result.visibleNodeIds.has('o')).toBe(true);
    });

    it('filters edges to only visible node pairs', () => {
        const a = makeNode({ id: 'a', x: 100, y: 100 });
        const b = makeNode({ id: 'b', x: 200, y: 200 });
        const c = makeNode({ id: 'c', x: 5000, y: 5000 });
        const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
        const result = getVisibleElements([a, b, c], edges, bounds);
        // Edge a->b should be visible (both visible)
        expect(result.visibleEdges.some(e => e.source === 'a' && e.target === 'b')).toBe(true);
    });

    it('returns correct totals', () => {
        const nodes = Array.from({ length: 10 }, (_, i) =>
            makeNode({ id: `n${i}`, x: i * 100, y: 100 })
        );
        const result = getVisibleElements(nodes, [], bounds);
        expect(result.totalNodes).toBe(10);
        expect(result.totalEdges).toBe(0);
    });

    it('returns all when virtualization is disabled', () => {
        setVirtualizationConfig({ enabled: false });
        const offscreen = makeNode({ id: 'far', x: 10000, y: 10000 });
        const result = getVisibleElements([offscreen], [], bounds);
        expect(result.visibleNodes).toHaveLength(1);
    });
});

// ============================================================
// calculateGraphBounds
// ============================================================

describe('calculateGraphBounds', () => {
    it('returns default bounds for empty array', () => {
        const bounds = calculateGraphBounds([]);
        expect(bounds.minX).toBe(0);
        expect(bounds.maxX).toBe(400);
        expect(bounds.minY).toBe(0);
        expect(bounds.maxY).toBe(300);
    });

    it('computes tight bounds around single node', () => {
        const node = makeNode({ id: 'a', x: 50, y: 30, width: 180, height: 60 });
        const bounds = calculateGraphBounds([node]);
        expect(bounds.minX).toBe(50);
        expect(bounds.maxX).toBe(230); // 50+180
        expect(bounds.minY).toBe(30);
        expect(bounds.maxY).toBe(90); // 30+60
    });

    it('computes correct bounds for multiple nodes', () => {
        const nodes = [
            makeNode({ id: 'a', x: 10, y: 20, width: 100, height: 50 }),
            makeNode({ id: 'b', x: 300, y: 400, width: 200, height: 80 }),
        ];
        const bounds = calculateGraphBounds(nodes);
        expect(bounds.minX).toBe(10);
        expect(bounds.maxX).toBe(500); // 300+200
        expect(bounds.minY).toBe(20);
        expect(bounds.maxY).toBe(480); // 400+80
    });

    it('handles negative coordinates', () => {
        const node = makeNode({ id: 'neg', x: -100, y: -50, width: 80, height: 40 });
        const bounds = calculateGraphBounds([node]);
        expect(bounds.minX).toBe(-100);
        expect(bounds.maxX).toBe(-20); // -100+80
    });
});

// ============================================================
// shouldVirtualize
// ============================================================

describe('shouldVirtualize', () => {
    afterEach(() => {
        setVirtualizationConfig({ enabled: true, minNodesForVirtualization: 50, padding: 100 });
    });

    it('returns false below threshold', () => {
        expect(shouldVirtualize(10)).toBe(false);
    });

    it('returns true at threshold', () => {
        expect(shouldVirtualize(50)).toBe(true);
    });

    it('returns true above threshold', () => {
        expect(shouldVirtualize(500)).toBe(true);
    });

    it('returns false when disabled', () => {
        setVirtualizationConfig({ enabled: false });
        expect(shouldVirtualize(500)).toBe(false);
    });
});

// ============================================================
// Config management
// ============================================================

describe('virtualization config', () => {
    afterEach(() => {
        setVirtualizationConfig({ enabled: true, minNodesForVirtualization: 50, padding: 100 });
    });

    it('getVirtualizationConfig returns a copy', () => {
        const config = getVirtualizationConfig();
        config.padding = 999;
        expect(getVirtualizationConfig().padding).not.toBe(999);
    });

    it('setVirtualizationConfig merges partial updates', () => {
        setVirtualizationConfig({ padding: 200 });
        const config = getVirtualizationConfig();
        expect(config.padding).toBe(200);
        expect(config.enabled).toBe(true); // unchanged
    });
});
