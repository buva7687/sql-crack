import { getGraphInteractionsScriptFragment } from '../../../../src/workspace/ui/scripts/graphInteractions';

function graphController(bounds: { x: number; y: number; width: number; height: number }, width = 800, height = 600) {
    const script = getGraphInteractionsScriptFragment();
    const zoomAndFit = script.slice(0, script.indexOf('function scheduleGraphAutoFit()'));
    const wheelStart = script.indexOf("svg.addEventListener('wheel'");
    const wheelEnd = script.indexOf("}, { passive: false });", wheelStart) + "}, { passive: false });".length;
    let wheel: (event: unknown) => void = () => undefined;
    const controller = new Function('bbox', 'viewport', 'registerWheel', `
        let scale = 1, offsetX = 0, offsetY = 0;
        const svg = { addEventListener: (_event, handler) => registerWheel(handler) };
        const mainGroup = { getBBox: () => bbox, setAttribute() {} };
        const zoomLevel = {};
        const document = { querySelector: () => ({ getBoundingClientRect: () => viewport }) };
        ${zoomAndFit}
        ${script.slice(wheelStart, wheelEnd)}
        return { fitToScreen, zoomIn, zoomOut, read: () => ({ scale, x: offsetX, y: offsetY }) };
    `)(bounds, { width, height }, (handler: typeof wheel) => { wheel = handler; }) as {
        fitToScreen: () => void;
        zoomIn: () => void;
        zoomOut: () => void;
        read: () => { scale: number; x: number; y: number };
    };
    return { ...controller, wheel: (event: unknown) => wheel(event) };
}

describe('Workspace Graph fit', () => {
    it.each([
        { x: 75, y: 125, width: 4000, height: 1000 },
        { x: -100, y: -50, width: 400, height: 4000 },
    ])('fits large graph bounds fully inside the viewport: %o', bbox => {
        const controller = graphController(bbox);
        controller.fitToScreen();
        const state = controller.read();
        expect(state.scale).toBeGreaterThan(0);
        expect(state.scale).toBeLessThan(0.3);
        expect(bbox.x * state.scale + state.x).toBeGreaterThanOrEqual(60);
        expect((bbox.x + bbox.width) * state.scale + state.x).toBeLessThanOrEqual(740);
        expect(bbox.y * state.scale + state.y).toBeGreaterThanOrEqual(60);
        expect((bbox.y + bbox.height) * state.scale + state.y).toBeLessThanOrEqual(540);
    });

    it('keeps button and wheel zoom-out from increasing a fitted scale below 20%', () => {
        const controller = graphController({ x: 0, y: 0, width: 4000, height: 1000 });
        controller.fitToScreen();
        const fittedScale = controller.read().scale;
        controller.zoomOut();
        expect(controller.read().scale).toBe(fittedScale);
        controller.wheel({ deltaY: 1, preventDefault: jest.fn() });
        expect(controller.read().scale).toBe(fittedScale);
        controller.zoomIn();
        expect(controller.read().scale).toBeGreaterThan(fittedScale);
        controller.zoomOut();
        expect(controller.read().scale).toBeCloseTo(fittedScale);
    });

    it('still caps zoom-in for sparse graphs at 150%', () => {
        const controller = graphController({ x: 0, y: 0, width: 100, height: 50 });
        controller.fitToScreen();
        expect(controller.read().scale).toBe(1.5);
    });

    it('keeps the transform positive when the viewport is smaller than the padding', () => {
        const controller = graphController({ x: 0, y: 0, width: 100, height: 50 }, 80, 80);
        controller.fitToScreen();
        expect(controller.read().scale).toBeGreaterThan(0);
        expect(Number.isFinite(controller.read().x)).toBe(true);
        expect(Number.isFinite(controller.read().y)).toBe(true);
    });
});
