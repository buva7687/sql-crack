import { MINIMAP_NODE_VISIBILITY_THRESHOLD, shouldShowMinimap } from '../../../src/webview/minimapVisibility';

describe('minimap visibility', () => {
    it('shows minimap for standard SQL flow graphs and hides empty/trivial graphs', () => {
        expect(MINIMAP_NODE_VISIBILITY_THRESHOLD).toBe(2);
        expect(shouldShowMinimap(0)).toBe(false);
        expect(shouldShowMinimap(1)).toBe(false);
        expect(shouldShowMinimap(2)).toBe(true);
        expect(shouldShowMinimap(6)).toBe(true);
    });
});

