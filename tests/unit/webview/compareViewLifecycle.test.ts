import {
    hideCompareView,
    isCompareViewActive,
    showCompareView,
} from '../../../src/webview/ui/compareView';
import type { ParseResult } from '../../../src/webview/types';

type Listener = (event: any) => void;

type FakeElement = {
    tagName: string;
    id: string;
    className: string;
    textContent: string;
    innerHTML: string;
    dataset: Record<string, string>;
    style: {
        cssText: string;
        background: string;
        display: string;
        cursor: string;
    };
    children: FakeElement[];
    parent: FakeElement | null;
    appendChild: jest.Mock<FakeElement, [FakeElement]>;
    remove: jest.Mock<void, []>;
    addEventListener: jest.Mock<void, [string, Listener, AddEventListenerOptions?]>;
    removeEventListener: jest.Mock<void, [string, Listener]>;
    setAttribute: jest.Mock<void, [string, string]>;
    getAttribute: jest.Mock<string | null, [string]>;
    querySelector: jest.Mock<FakeElement | null, [string]>;
    querySelectorAll: jest.Mock<FakeElement[], [string]>;
    emit: (type: string, event?: any) => void;
};

function createElement(tagName: string): FakeElement {
    const listeners = new Map<string, Listener[]>();
    const attributes = new Map<string, string>();
    let innerHTMLValue = '';
    const styleState = {
        cssText: '',
        background: '',
        display: '',
        cursor: '',
    };
    const style = {} as FakeElement['style'];
    Object.defineProperty(style, 'cssText', {
        get: () => styleState.cssText,
        set: (value: string) => {
            styleState.cssText = value;
            const backgroundMatch = value.match(/background:\s*([^;]+);?/);
            if (backgroundMatch) {
                styleState.background = backgroundMatch[1].trim();
            }
            const displayMatch = value.match(/display:\s*([^;]+);?/);
            if (displayMatch) {
                styleState.display = displayMatch[1].trim();
            }
            const cursorMatch = value.match(/cursor:\s*([^;]+);?/);
            if (cursorMatch) {
                styleState.cursor = cursorMatch[1].trim();
            }
        },
    });
    Object.defineProperty(style, 'background', { get: () => styleState.background, set: (v: string) => { styleState.background = v; } });
    Object.defineProperty(style, 'display', { get: () => styleState.display, set: (v: string) => { styleState.display = v; } });
    Object.defineProperty(style, 'cursor', { get: () => styleState.cursor, set: (v: string) => { styleState.cursor = v; } });

    const element: FakeElement = {
        tagName,
        id: '',
        className: '',
        textContent: '',
        innerHTML: '',
        dataset: {},
        style,
        children: [],
        parent: null,
        appendChild: jest.fn((child: FakeElement) => {
            child.parent = element;
            element.children.push(child);
            return child;
        }),
        remove: jest.fn(() => {
            if (element.parent) {
                element.parent.children = element.parent.children.filter((child) => child !== element);
                element.parent = null;
            }
        }),
        addEventListener: jest.fn((type: string, handler: Listener) => {
            const existing = listeners.get(type) || [];
            existing.push(handler);
            listeners.set(type, existing);
        }),
        removeEventListener: jest.fn((type: string, handler: Listener) => {
            const existing = listeners.get(type) || [];
            listeners.set(type, existing.filter((candidate) => candidate !== handler));
        }),
        setAttribute: jest.fn((name: string, value: string) => {
            attributes.set(name, value);
        }),
        getAttribute: jest.fn((name: string) => attributes.get(name) || null),
        querySelector: jest.fn((selector: string) => findFirst(element.children, selector)),
        querySelectorAll: jest.fn((selector: string) => findAll(element.children, selector)),
        emit(type: string, event: any = {}) {
            for (const handler of listeners.get(type) || []) {
                handler(event);
            }
        },
    };
    Object.defineProperty(element, 'innerHTML', {
        get: () => innerHTMLValue,
        set: (value: string) => {
            innerHTMLValue = value;
            if (value === '') {
                element.children = [];
            }
        },
    });
    return element;
}

function flatten(elements: FakeElement[]): FakeElement[] {
    return elements.flatMap((element) => [element, ...flatten(element.children)]);
}

function findFirst(elements: FakeElement[], selector: string): FakeElement | null {
    return findAll(elements, selector)[0] || null;
}

function findAll(elements: FakeElement[], selector: string): FakeElement[] {
    const all = flatten(elements);
    if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return all.filter((element) => element.id === id);
    }
    if (selector === '[data-action-id]') {
        return all.filter((element) => element.getAttribute('data-action-id') !== null);
    }
    return [];
}

function makeResult(nodes: Array<{ id: string; label: string; x: number; y: number }>, joins: number): ParseResult {
    return {
        nodes: nodes.map((node) => ({
            ...node,
            type: 'table' as const,
            width: 160,
            height: 56,
        })),
        edges: nodes.length > 1
            ? [{
                id: 'e1',
                source: nodes[0].id,
                target: nodes[1].id,
            }]
            : [],
        stats: {
            tables: nodes.length,
            joins,
            subqueries: 0,
            ctes: 0,
            aggregations: 0,
            windowFunctions: 0,
            unions: 0,
            conditions: 0,
            complexity: 'Simple',
            complexityScore: nodes.length,
        },
        hints: [],
        sql: 'select 1',
        columnLineage: [],
        columnFlows: [],
        tableUsage: new Map<string, number>(),
    };
}

describe('compareView lifecycle', () => {
    const originalDocument = global.document;
    const originalWindow = global.window;

    afterEach(() => {
        hideCompareView();
        global.document = originalDocument;
        global.window = originalWindow;
    });

    it('shows, closes, responds to Escape, and rerenders on theme change', () => {
        const container = createElement('div');
        const docListeners = new Map<string, Listener[]>();
        const winListeners = new Map<string, Listener[]>();

        global.document = {
            createElement: jest.fn((tag: string) => createElement(tag)),
            createElementNS: jest.fn((_ns: string, tag: string) => createElement(tag)),
            addEventListener: jest.fn((type: string, handler: Listener) => {
                const existing = docListeners.get(type) || [];
                existing.push(handler);
                docListeners.set(type, existing);
            }),
            removeEventListener: jest.fn((type: string, handler: Listener) => {
                const existing = docListeners.get(type) || [];
                docListeners.set(type, existing.filter((candidate) => candidate !== handler));
            }),
        } as unknown as Document;

        global.window = {
            addEventListener: jest.fn((type: string, handler: Listener) => {
                const existing = winListeners.get(type) || [];
                existing.push(handler);
                winListeners.set(type, existing);
            }),
            removeEventListener: jest.fn((type: string, handler: Listener) => {
                const existing = winListeners.get(type) || [];
                winListeners.set(type, existing.filter((candidate) => candidate !== handler));
            }),
        } as unknown as Window & typeof globalThis;

        const onClose = jest.fn();
        showCompareView({
            container: container as unknown as HTMLElement,
            left: {
                label: 'Before',
                result: makeResult([
                    { id: 'orders-1', label: 'orders', x: 80, y: 80 },
                    { id: 'customers-1', label: 'customers', x: 320, y: 80 },
                ], 1),
            },
            right: {
                label: 'After',
                result: makeResult([
                    { id: 'orders-1', label: 'orders', x: 80, y: 80 },
                    { id: 'payments-1', label: 'payments', x: 320, y: 80 },
                ], 2),
            },
            isDarkTheme: true,
            onClose,
        });

        expect(isCompareViewActive()).toBe(true);
        const overlay = container.children.find((child) => child.id === 'sql-crack-compare-overlay');
        expect(overlay).toBeDefined();
        expect(overlay?.style.background).toContain('rgba(2, 6, 23, 0.95)');

        const closeButton = findFirst(container.children, '#sql-crack-compare-close');
        expect(closeButton).toBeDefined();
        closeButton?.emit('click');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(isCompareViewActive()).toBe(false);

        showCompareView({
            container: container as unknown as HTMLElement,
            left: {
                label: 'Before',
                result: makeResult([{ id: 'orders-1', label: 'orders', x: 80, y: 80 }], 0),
            },
            right: {
                label: 'After',
                result: makeResult([{ id: 'orders-1', label: 'orders updated', x: 80, y: 80 }], 0),
            },
            isDarkTheme: true,
            onClose,
        });
        expect(isCompareViewActive()).toBe(true);

        const keydownHandler = (docListeners.get('keydown') || [])[0];
        expect(keydownHandler).toBeDefined();
        const preventDefault = jest.fn();
        keydownHandler!({ key: 'Escape', preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(2);
        expect(isCompareViewActive()).toBe(false);

        showCompareView({
            container: container as unknown as HTMLElement,
            left: {
                label: 'Before',
                result: makeResult([{ id: 'orders-1', label: 'orders', x: 80, y: 80 }], 0),
            },
            right: {
                label: 'After',
                result: makeResult([{ id: 'orders-1', label: 'orders', x: 80, y: 80 }], 0),
            },
            isDarkTheme: true,
        });

        const darkOverlay = container.children.find((child) => child.id === 'sql-crack-compare-overlay');
        expect(darkOverlay?.style.background).toContain('rgba(2, 6, 23, 0.95)');

        const themeHandler = (docListeners.get('theme-change') || [])[0];
        expect(themeHandler).toBeDefined();
        themeHandler!({ detail: { dark: false } });

        const lightOverlay = container.children.find((child) => child.id === 'sql-crack-compare-overlay');
        expect(lightOverlay?.style.background).toContain('rgba(241, 245, 249, 0.96)');

        hideCompareView();
        expect(isCompareViewActive()).toBe(false);
        expect(container.children.find((child) => child.id === 'sql-crack-compare-overlay')).toBeUndefined();
    });
});
