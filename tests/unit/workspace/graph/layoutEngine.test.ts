import { LayoutEngine } from '../../../../src/workspace/graph/layoutEngine';

describe('LayoutEngine', () => {
    it('keeps empty graphs on the hierarchical path instead of force-directed layout', () => {
        const engine = new LayoutEngine();
        const forceSpy = jest.spyOn(engine, 'forceDirectedLayout').mockImplementation(() => undefined);

        const layout = engine.autoLayout([], [], { width: 1200, height: 800 });

        expect(layout).toBe('hierarchical');
        expect(forceSpy).not.toHaveBeenCalled();
        forceSpy.mockRestore();
    });
});
