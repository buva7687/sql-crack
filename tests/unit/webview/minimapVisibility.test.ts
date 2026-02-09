import { MINIMAP_NODE_VISIBILITY_THRESHOLD, shouldShowMinimap, setMinimapMode } from '../../../src/webview/minimapVisibility';

describe('minimap visibility', () => {
    afterEach(() => {
        // Reset to default mode after each test
        setMinimapMode('auto');
    });

    it('shows minimap for standard SQL flow graphs and hides empty/trivial graphs', () => {
        expect(MINIMAP_NODE_VISIBILITY_THRESHOLD).toBe(2);
        expect(shouldShowMinimap(0)).toBe(false);
        expect(shouldShowMinimap(1)).toBe(false);
        expect(shouldShowMinimap(2)).toBe(true);
        expect(shouldShowMinimap(6)).toBe(true);
    });

    describe('minimap modes', () => {
        it('auto mode uses threshold', () => {
            setMinimapMode('auto');
            expect(shouldShowMinimap(0)).toBe(false);
            expect(shouldShowMinimap(1)).toBe(false);
            expect(shouldShowMinimap(2)).toBe(true);
            expect(shouldShowMinimap(10)).toBe(true);
        });

        it('always mode shows for any node count', () => {
            setMinimapMode('always');
            expect(shouldShowMinimap(0)).toBe(true);
            expect(shouldShowMinimap(1)).toBe(true);
            expect(shouldShowMinimap(2)).toBe(true);
        });

        it('never mode hides for any node count', () => {
            setMinimapMode('never');
            expect(shouldShowMinimap(0)).toBe(false);
            expect(shouldShowMinimap(1)).toBe(false);
            expect(shouldShowMinimap(2)).toBe(false);
            expect(shouldShowMinimap(100)).toBe(false);
        });
    });
});
