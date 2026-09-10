import { getViewportBounds, isNodeInViewport } from '../../../src/webview/virtualization';
import type { FlowNode } from '../../../src/webview/types';

/**
 * Regression guard: getViewportBounds divides by `scale`, and the restore paths
 * (persisted tab state, layout-history and preserved-render snapshots) assign
 * state.scale straight through. A corrupt stored scale must not produce
 * NaN/Infinity/inverted bounds, which would either defeat virtualization
 * (every node "visible") or cull every node (blank canvas).
 */
describe('getViewportBounds degenerate scale handling', () => {
    const WIDTH = 1200;
    const HEIGHT = 800;

    const makeNode = (x: number, y: number): FlowNode => ({
        id: `n-${x}-${y}`,
        type: 'table',
        label: 't',
        x,
        y,
        width: 180,
        height: 60,
    } as FlowNode);

    const nearNode = makeNode(10, 10);
    const farNode = makeNode(5000, 5000);

    it('produces finite bounds for a normal scale', () => {
        const bounds = getViewportBounds(WIDTH, HEIGHT, 1, 0, 0);
        // Compared numerically: -offsetX / scale yields -0 for a zero offset,
        // which toEqual would treat as distinct from 0.
        expect(bounds.minX).toBeCloseTo(0);
        expect(bounds.minY).toBeCloseTo(0);
        expect(bounds.maxX).toBeCloseTo(WIDTH);
        expect(bounds.maxY).toBeCloseTo(HEIGHT);
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['NaN', NaN],
        ['Infinity', Infinity],
        ['-Infinity', -Infinity],
    ])('falls back to scale 1 when scale is %s', (_label, scale) => {
        const bounds = getViewportBounds(WIDTH, HEIGHT, scale as number, 0, 0);

        expect(Number.isFinite(bounds.minX)).toBe(true);
        expect(Number.isFinite(bounds.maxX)).toBe(true);
        expect(Number.isFinite(bounds.minY)).toBe(true);
        expect(Number.isFinite(bounds.maxY)).toBe(true);

        // Bounds must not be inverted, otherwise every node is culled.
        expect(bounds.maxX).toBeGreaterThan(bounds.minX);
        expect(bounds.maxY).toBeGreaterThan(bounds.minY);

        // Same result as the safe default, so virtualization still discriminates.
        expect(bounds).toEqual(getViewportBounds(WIDTH, HEIGHT, 1, 0, 0));
    });

    it.each([
        ['zero', 0],
        ['negative', -1],
        ['NaN', NaN],
    ])('still culls off-screen nodes when scale is %s', (_label, scale) => {
        const bounds = getViewportBounds(WIDTH, HEIGHT, scale as number, 0, 0);
        expect(isNodeInViewport(nearNode, bounds)).toBe(true);
        expect(isNodeInViewport(farNode, bounds)).toBe(false);
    });

    it('honours pan offsets under a valid scale', () => {
        const bounds = getViewportBounds(WIDTH, HEIGHT, 2, -100, -50);
        expect(bounds.minX).toBe(50);
        expect(bounds.minY).toBe(25);
        expect(bounds.maxX).toBe((WIDTH + 100) / 2);
        expect(bounds.maxY).toBe((HEIGHT + 50) / 2);
    });
});
