import {
    captureNodeBorderState,
    ensureNodeBorderStateObserver,
    restoreNodeBorderState,
} from '../../../src/webview/nodeBorderState';

type AttrMap = Map<string, string>;

class FakeMutationObserver {
    static instances: FakeMutationObserver[] = [];
    callback: (mutations: MutationRecord[], observer: MutationObserver) => void;
    observe = jest.fn();
    disconnect = jest.fn();

    constructor(callback: (mutations: MutationRecord[], observer: MutationObserver) => void) {
        this.callback = callback;
        FakeMutationObserver.instances.push(this);
    }

    trigger(): void {
        this.callback([], this as unknown as MutationObserver);
    }
}

function createRect(initial: Record<string, string> = {}) {
    const attrs: AttrMap = new Map(Object.entries(initial));
    return {
        nodeType: 1,
        getAttribute: jest.fn((name: string) => attrs.get(name) || null),
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
        }),
        removeAttribute: jest.fn((name: string) => {
            attrs.delete(name);
        }),
        hasAttribute: jest.fn((name: string) => attrs.has(name)),
        attrs,
    } as unknown as SVGRectElement & { attrs: AttrMap; nodeType: number };
}

describe('nodeBorderState', () => {
    const originalMutationObserver = global.MutationObserver;

    beforeEach(() => {
        FakeMutationObserver.instances = [];
        (global as typeof globalThis & { MutationObserver?: typeof MutationObserver }).MutationObserver =
            FakeMutationObserver as unknown as typeof MutationObserver;
    });

    afterEach(() => {
        (global as typeof globalThis & { MutationObserver?: typeof MutationObserver }).MutationObserver =
            originalMutationObserver;
    });

    it('captures and restores semantic border state after highlight cleanup', () => {
        const rect = createRect({
            stroke: '#475569',
            'stroke-width': '1.5',
            'stroke-dasharray': '6,3',
        });

        captureNodeBorderState(rect);
        expect(rect.getAttribute('data-node-base-stroke')).toBe('#475569');
        expect(rect.getAttribute('data-node-base-stroke-width')).toBe('1.5');
        expect(rect.getAttribute('data-node-base-stroke-dasharray')).toBe('6,3');

        rect.removeAttribute('stroke');
        rect.removeAttribute('stroke-width');
        rect.removeAttribute('stroke-dasharray');
        restoreNodeBorderState(rect);

        expect(rect.getAttribute('stroke')).toBe('#475569');
        expect(rect.getAttribute('stroke-width')).toBe('1.5');
        expect(rect.getAttribute('stroke-dasharray')).toBe('6,3');
    });

    it('restores the base border when the observer sees transient attributes removed', () => {
        const rect = createRect({
            stroke: '#94a3b8',
            'stroke-width': '2',
        });

        ensureNodeBorderStateObserver(rect);
        expect(FakeMutationObserver.instances).toHaveLength(1);

        rect.removeAttribute('stroke');
        rect.removeAttribute('stroke-width');
        FakeMutationObserver.instances[0].trigger();

        expect(rect.getAttribute('stroke')).toBe('#94a3b8');
        expect(rect.getAttribute('stroke-width')).toBe('2');
    });
});
