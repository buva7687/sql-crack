/**
 * M13: fullscreen must not restore a stale display snapshot. Panels toggled
 * while fullscreen stay hidden until exit, then keep their current state.
 */

import { FULLSCREEN_HIDDEN_ATTRIBUTE, toggleFullscreen } from '../../../src/webview/features/fullscreen';

class FakeElement {
    id = '';
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    children: FakeElement[] = [];
    textContent = '';
    innerHTML = '';
    private attributes = new Map<string, string>();

    constructor(private readonly registry: FakeElement[]) {
        registry.push(this);
    }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    hasAttribute(name: string) { return this.attributes.has(name); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    appendChild(child: FakeElement) { this.children.push(child); return child; }
    addEventListener() { /* no-op */ }
    removeEventListener() { /* no-op */ }
    remove() { /* no-op */ }
}

describe('fullscreen hide/restore (M13)', () => {
    const originalDocument = (global as any).document;
    const originalRequestAnimationFrame = (global as any).requestAnimationFrame;

    beforeEach(() => {
        jest.useFakeTimers();
        (global as any).requestAnimationFrame = () => 0;
    });

    afterEach(() => {
        jest.runAllTimers();
        jest.useRealTimers();
        (global as any).document = originalDocument;
        (global as any).requestAnimationFrame = originalRequestAnimationFrame;
    });

    function setupDom() {
        const registry: FakeElement[] = [];
        const byId = new Map<string, FakeElement>();
        const create = (id = '') => {
            const element = new FakeElement(registry);
            element.id = id;
            if (id) {
                byId.set(id, element);
            }
            return element;
        };
        const statsPanel = create();
        const tabs = create('sql-crack-batch-tabs');
        const root = create('root');
        (global as any).document = {
            body: create(),
            documentElement: create(),
            head: create(),
            fullscreenElement: null,
            getElementById: (id: string) => byId.get(id) ?? null,
            querySelector: (selector: string) => (selector === '.stats-panel' ? statsPanel : null),
            querySelectorAll: (selector: string) => {
                const attribute = /^\[([^\]=]+)\]$/.exec(selector)?.[1];
                return attribute ? registry.filter(element => element.hasAttribute(attribute)) : [];
            },
            createElement: () => create(),
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        };
        return { statsPanel, tabs, root };
    }

    const toggle = (root: FakeElement, currentIsFullscreen: boolean) => toggleFullscreen({
        columnLineageBanner: null,
        currentIsFullscreen,
        getTheme: () => ({ accent: '#000', accentSurface: '#000', border: '#000', text: '#000' }),
        hideIds: ['sql-crack-batch-tabs'],
        hideSelectors: ['.stats-panel'],
        isDarkTheme: true,
        onExitRequested: () => undefined,
        rootElement: root as unknown as HTMLElement,
        svgElement: null,
        zIndex: 1000,
    });

    it('keeps panel display changes made while fullscreen and hides them until exit', () => {
        const { statsPanel, tabs, root } = setupDom();
        statsPanel.style.display = 'block';
        tabs.style.display = 'flex';

        expect(toggle(root, false)).toBe(true);
        expect(statsPanel.hasAttribute(FULLSCREEN_HIDDEN_ATTRIBUTE)).toBe(true);
        expect(tabs.hasAttribute(FULLSCREEN_HIDDEN_ATTRIBUTE)).toBe(true);

        // While fullscreen: the user hides stats (Q); query tabs re-show themselves.
        statsPanel.style.display = 'none';
        tabs.style.display = 'flex';
        expect(tabs.hasAttribute(FULLSCREEN_HIDDEN_ATTRIBUTE)).toBe(true);

        expect(toggle(root, true)).toBe(false);
        expect(statsPanel.hasAttribute(FULLSCREEN_HIDDEN_ATTRIBUTE)).toBe(false);
        expect(tabs.hasAttribute(FULLSCREEN_HIDDEN_ATTRIBUTE)).toBe(false);
        // The stats panel stays hidden as the user left it, not restored to 'block'.
        expect(statsPanel.style.display).toBe('none');
        expect(tabs.style.display).toBe('flex');
    });
});
