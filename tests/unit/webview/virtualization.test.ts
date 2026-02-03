/**
 * Tests for virtualization utilities
 */

import {
    getViewportBounds,
    isNodeInViewport,
    getVisibleElements,
    shouldVirtualize,
    debounce,
    throttle,
    calculateGraphBounds,
    setVirtualizationConfig,
    getVirtualizationConfig,
    ViewportBounds
} from '../../../src/webview/virtualization';
import { FlowNode, FlowEdge } from '../../../src/webview/types';

describe('virtualization', () => {
    // Reset config before each test
    beforeEach(() => {
        setVirtualizationConfig({
            padding: 100,
            minNodesForVirtualization: 50,
            enabled: true
        });
    });

    describe('getViewportBounds', () => {
        it('should calculate viewport bounds at scale 1 with no offset', () => {
            const bounds = getViewportBounds(800, 600, 1, 0, 0);

            expect(bounds.minX).toBeCloseTo(0);
            expect(bounds.minY).toBeCloseTo(0);
            expect(bounds.maxX).toBeCloseTo(800);
            expect(bounds.maxY).toBeCloseTo(600);
        });

        it('should calculate viewport bounds with positive offset (panned right/down)', () => {
            const bounds = getViewportBounds(800, 600, 1, 100, 50);

            // Positive offset means graph is moved right/down, viewport shows negative graph coords
            expect(bounds.minX).toBe(-100);
            expect(bounds.minY).toBe(-50);
            expect(bounds.maxX).toBe(700);
            expect(bounds.maxY).toBe(550);
        });

        it('should calculate viewport bounds at zoom scale 2', () => {
            const bounds = getViewportBounds(800, 600, 2, 0, 0);

            // At 2x zoom, viewport shows half the graph area
            expect(bounds.minX).toBeCloseTo(0);
            expect(bounds.minY).toBeCloseTo(0);
            expect(bounds.maxX).toBeCloseTo(400);
            expect(bounds.maxY).toBeCloseTo(300);
        });

        it('should calculate viewport bounds with zoom and offset combined', () => {
            const bounds = getViewportBounds(800, 600, 2, 200, 100);

            expect(bounds.minX).toBe(-100); // -200/2
            expect(bounds.minY).toBe(-50);  // -100/2
            expect(bounds.maxX).toBe(300);  // (800-200)/2
            expect(bounds.maxY).toBe(250);  // (600-100)/2
        });
    });

    describe('isNodeInViewport', () => {
        const bounds: ViewportBounds = {
            minX: 0,
            maxX: 800,
            minY: 0,
            maxY: 600
        };

        it('should return true for node fully inside viewport', () => {
            const node: FlowNode = {
                id: 'n1',
                type: 'table',
                label: 'Test',
                x: 100,
                y: 100,
                width: 180,
                height: 60
            };

            expect(isNodeInViewport(node, bounds, 0)).toBe(true);
        });

        it('should return true for node partially inside viewport', () => {
            const node: FlowNode = {
                id: 'n1',
                type: 'table',
                label: 'Test',
                x: -90, // Partially outside left edge
                y: 100,
                width: 180,
                height: 60
            };

            expect(isNodeInViewport(node, bounds, 0)).toBe(true);
        });

        it('should return false for node completely outside viewport', () => {
            const node: FlowNode = {
                id: 'n1',
                type: 'table',
                label: 'Test',
                x: 1000, // Far right
                y: 100,
                width: 180,
                height: 60
            };

            expect(isNodeInViewport(node, bounds, 0)).toBe(false);
        });

        it('should include padding in visibility check', () => {
            const node: FlowNode = {
                id: 'n1',
                type: 'table',
                label: 'Test',
                x: 850, // Just outside right edge
                y: 100,
                width: 180,
                height: 60
            };

            // Without padding, node is outside
            expect(isNodeInViewport(node, bounds, 0)).toBe(false);

            // With 100px padding, node is within padded bounds
            expect(isNodeInViewport(node, bounds, 100)).toBe(true);
        });
    });

    describe('getVisibleElements', () => {
        const createNodes = (count: number): FlowNode[] => {
            return Array.from({ length: count }, (_, i) => ({
                id: `n${i}`,
                type: 'table' as const,
                label: `Node ${i}`,
                x: (i % 10) * 200, // Spread horizontally
                y: Math.floor(i / 10) * 100, // Rows of 10
                width: 180,
                height: 60
            }));
        };

        const createEdges = (nodes: FlowNode[]): FlowEdge[] => {
            // Create edges between consecutive nodes
            return nodes.slice(0, -1).map((_, i) => ({
                id: `e${i}`,
                source: `n${i}`,
                target: `n${i + 1}`
            }));
        };

        it('should return all elements for small graphs (below threshold)', () => {
            const nodes = createNodes(30); // Below default threshold of 50
            const edges = createEdges(nodes);
            const bounds: ViewportBounds = { minX: 0, maxX: 500, minY: 0, maxY: 300 };

            const result = getVisibleElements(nodes, edges, bounds);

            expect(result.visibleNodes).toHaveLength(30);
            expect(result.visibleEdges).toHaveLength(29);
            expect(result.totalNodes).toBe(30);
        });

        it('should filter nodes for large graphs', () => {
            const nodes = createNodes(100); // Above threshold
            const edges = createEdges(nodes);
            // Small viewport that only shows some nodes
            const bounds: ViewportBounds = { minX: 0, maxX: 400, minY: 0, maxY: 150 };

            const result = getVisibleElements(nodes, edges, bounds);

            // Should have fewer visible nodes than total
            expect(result.visibleNodes.length).toBeLessThan(100);
            expect(result.totalNodes).toBe(100);
        });

        it('should include connected nodes (1-hop neighbors)', () => {
            const nodes = createNodes(60);
            const edges = createEdges(nodes);
            // Viewport that shows only first few nodes
            const bounds: ViewportBounds = { minX: 0, maxX: 200, minY: 0, maxY: 100 };

            const result = getVisibleElements(nodes, edges, bounds);

            // Should include node n1 even if barely outside because n0 connects to it
            const visibleIds = result.visibleNodeIds;
            expect(visibleIds.has('n0')).toBe(true);
        });

        it('should count offscreen nodes by direction', () => {
            const nodes = createNodes(100);
            const edges = createEdges(nodes);
            // Center viewport
            const bounds: ViewportBounds = { minX: 400, maxX: 600, minY: 200, maxY: 400 };

            const result = getVisibleElements(nodes, edges, bounds);

            // Should have nodes in all directions
            const { offscreenCounts } = result;
            expect(offscreenCounts.left + offscreenCounts.right +
                   offscreenCounts.top + offscreenCounts.bottom).toBeGreaterThan(0);
        });

        it('should respect enabled config', () => {
            setVirtualizationConfig({ enabled: false });

            const nodes = createNodes(100);
            const edges = createEdges(nodes);
            const bounds: ViewportBounds = { minX: 0, maxX: 200, minY: 0, maxY: 100 };

            const result = getVisibleElements(nodes, edges, bounds);

            // When disabled, should return all nodes
            expect(result.visibleNodes).toHaveLength(100);
        });
    });

    describe('shouldVirtualize', () => {
        it('should return false for small graphs', () => {
            expect(shouldVirtualize(30)).toBe(false);
            expect(shouldVirtualize(49)).toBe(false);
        });

        it('should return true for large graphs', () => {
            expect(shouldVirtualize(50)).toBe(true);
            expect(shouldVirtualize(100)).toBe(true);
            expect(shouldVirtualize(500)).toBe(true);
        });

        it('should respect config threshold', () => {
            setVirtualizationConfig({ minNodesForVirtualization: 100 });

            expect(shouldVirtualize(50)).toBe(false);
            expect(shouldVirtualize(99)).toBe(false);
            expect(shouldVirtualize(100)).toBe(true);
        });

        it('should return false when disabled', () => {
            setVirtualizationConfig({ enabled: false });

            expect(shouldVirtualize(100)).toBe(false);
        });
    });

    describe('calculateGraphBounds', () => {
        it('should return default bounds for empty array', () => {
            const bounds = calculateGraphBounds([]);

            expect(bounds.minX).toBe(0);
            expect(bounds.maxX).toBe(400);
            expect(bounds.minY).toBe(0);
            expect(bounds.maxY).toBe(300);
        });

        it('should calculate bounds for single node', () => {
            const nodes: FlowNode[] = [{
                id: 'n1',
                type: 'table',
                label: 'Test',
                x: 100,
                y: 50,
                width: 180,
                height: 60
            }];

            const bounds = calculateGraphBounds(nodes);

            expect(bounds.minX).toBe(100);
            expect(bounds.maxX).toBe(280); // 100 + 180
            expect(bounds.minY).toBe(50);
            expect(bounds.maxY).toBe(110); // 50 + 60
        });

        it('should calculate bounds for multiple nodes', () => {
            const nodes: FlowNode[] = [
                { id: 'n1', type: 'table', label: 'A', x: 0, y: 0, width: 180, height: 60 },
                { id: 'n2', type: 'table', label: 'B', x: 500, y: 300, width: 180, height: 60 }
            ];

            const bounds = calculateGraphBounds(nodes);

            expect(bounds.minX).toBe(0);
            expect(bounds.maxX).toBe(680); // 500 + 180
            expect(bounds.minY).toBe(0);
            expect(bounds.maxY).toBe(360); // 300 + 60
        });
    });

    describe('debounce', () => {
        jest.useFakeTimers();

        it('should delay function execution', () => {
            const fn = jest.fn();
            const debounced = debounce(fn, 100);

            debounced();
            expect(fn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(99);
            expect(fn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(1);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should reset timer on subsequent calls', () => {
            const fn = jest.fn();
            const debounced = debounce(fn, 100);

            debounced();
            jest.advanceTimersByTime(50);
            debounced(); // Reset timer
            jest.advanceTimersByTime(50);
            expect(fn).not.toHaveBeenCalled();

            jest.advanceTimersByTime(50);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should support cancel', () => {
            const fn = jest.fn();
            const debounced = debounce(fn, 100);

            debounced();
            debounced.cancel();
            jest.advanceTimersByTime(200);

            expect(fn).not.toHaveBeenCalled();
        });
    });

    describe('throttle', () => {
        jest.useFakeTimers();

        it('should execute immediately on first call', () => {
            const fn = jest.fn();
            const throttled = throttle(fn, 100);

            throttled();
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should throttle subsequent calls', () => {
            const fn = jest.fn();
            const throttled = throttle(fn, 100);

            throttled();
            throttled();
            throttled();

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should execute after interval', () => {
            const fn = jest.fn();
            const throttled = throttle(fn, 100);

            throttled();
            jest.advanceTimersByTime(100);
            throttled();

            expect(fn).toHaveBeenCalledTimes(2);
        });
    });

    describe('config', () => {
        it('should get default config', () => {
            const config = getVirtualizationConfig();

            expect(config.padding).toBe(100);
            expect(config.minNodesForVirtualization).toBe(50);
            expect(config.enabled).toBe(true);
        });

        it('should update config partially', () => {
            setVirtualizationConfig({ padding: 200 });
            const config = getVirtualizationConfig();

            expect(config.padding).toBe(200);
            expect(config.minNodesForVirtualization).toBe(50); // Unchanged
        });

        it('should return copy of config', () => {
            const config1 = getVirtualizationConfig();
            config1.padding = 999;
            const config2 = getVirtualizationConfig();

            expect(config2.padding).toBe(100); // Original value
        });
    });
});
