import { createFocusModeSelector, createPinnedTabsButton, createViewLocationButton } from '../../../src/webview/ui/toolbar/featureMenus';
import { getComponentUiColors } from '../../../src/webview/constants';
import type { FocusMode } from '../../../src/webview/types';

type Listener = (event: any) => void;

type FakeElement = {
    tagName: string;
    id: string;
    className: string;
    title: string;
    innerHTML: string;
    textContent: string;
    style: {
        cssText: string;
        display: string;
        top: string;
        right: string;
        left: string;
        background: string;
        color: string;
        borderColor: string;
        boxShadow: string;
    };
    dataset: Record<string, string>;
    children: FakeElement[];
    parent: FakeElement | null;
    appendChild: jest.Mock<FakeElement, [FakeElement]>;
    addEventListener: jest.Mock<void, [string, Listener, AddEventListenerOptions?]>;
    setAttribute: jest.Mock<void, [string, string]>;
    getAttribute: jest.Mock<string | null, [string]>;
    getBoundingClientRect: jest.Mock<{ bottom: number; right: number }, []>;
    querySelectorAll: jest.Mock<FakeElement[], [string]>;
    querySelector: jest.Mock<FakeElement | null, [string]>;
    remove: jest.Mock<void, []>;
    emit: (type: string, event?: any) => void;
};

function toDatasetKey(dataKey: string): string {
    return dataKey.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function matchesSelector(element: FakeElement, selector: string): boolean {
    if (selector.startsWith('.')) {
        const className = selector.slice(1);
        return element.className.split(/\s+/).includes(className);
    }
    if (selector === 'kbd') {
        return element.tagName.toLowerCase() === 'kbd';
    }
    const dataAttrMatch = selector.match(/^\[data-([a-z-]+)(?:="([^"]+)")?\]$/);
    if (dataAttrMatch) {
        const datasetKey = toDatasetKey(dataAttrMatch[1]);
        const expectedValue = dataAttrMatch[2];
        if (!Object.prototype.hasOwnProperty.call(element.dataset, datasetKey)) {
            return false;
        }
        return expectedValue === undefined || element.dataset[datasetKey] === expectedValue;
    }
    return false;
}

function findAll(element: FakeElement, selector: string): FakeElement[] {
    const results: FakeElement[] = [];
    for (const child of element.children) {
        if (matchesSelector(child, selector)) {
            results.push(child);
        }
        results.push(...findAll(child, selector));
    }
    return results;
}

function createElement(tagName: string): FakeElement {
    const listeners = new Map<string, Listener>();
    const attributes = new Map<string, string>();
    const styleState = {
        cssText: '',
        display: '',
        top: '',
        right: '',
        left: '',
        background: '',
        color: '',
        borderColor: '',
        boxShadow: '',
    };
    const style = {} as FakeElement['style'];
    Object.defineProperty(style, 'cssText', {
        get: () => styleState.cssText,
        set: (value: string) => {
            styleState.cssText = value;
            const displayMatch = value.match(/display:\s*([^;]+);?/);
            if (displayMatch) {
                styleState.display = displayMatch[1].trim();
            }
            const topMatch = value.match(/top:\s*([^;]+);?/);
            if (topMatch) {
                styleState.top = topMatch[1].trim();
            }
            const rightMatch = value.match(/right:\s*([^;]+);?/);
            if (rightMatch) {
                styleState.right = rightMatch[1].trim();
            }
            const leftMatch = value.match(/left:\s*([^;]+);?/);
            if (leftMatch) {
                styleState.left = leftMatch[1].trim();
            }
            const backgroundMatch = value.match(/background:\s*([^;]+);?/);
            if (backgroundMatch) {
                styleState.background = backgroundMatch[1].trim();
            }
            const colorMatch = value.match(/color:\s*([^;]+);?/);
            if (colorMatch) {
                styleState.color = colorMatch[1].trim();
            }
        },
    });
    Object.defineProperty(style, 'display', {
        get: () => styleState.display,
        set: (value: string) => {
            styleState.display = value;
        },
    });
    Object.defineProperty(style, 'top', {
        get: () => styleState.top,
        set: (value: string) => {
            styleState.top = value;
        },
    });
    Object.defineProperty(style, 'right', {
        get: () => styleState.right,
        set: (value: string) => {
            styleState.right = value;
        },
    });
    Object.defineProperty(style, 'left', {
        get: () => styleState.left,
        set: (value: string) => {
            styleState.left = value;
        },
    });
    Object.defineProperty(style, 'background', {
        get: () => styleState.background,
        set: (value: string) => {
            styleState.background = value;
        },
    });
    Object.defineProperty(style, 'color', {
        get: () => styleState.color,
        set: (value: string) => {
            styleState.color = value;
        },
    });
    Object.defineProperty(style, 'borderColor', {
        get: () => styleState.borderColor,
        set: (value: string) => {
            styleState.borderColor = value;
        },
    });
    Object.defineProperty(style, 'boxShadow', {
        get: () => styleState.boxShadow,
        set: (value: string) => {
            styleState.boxShadow = value;
        },
    });
    const element: FakeElement = {
        tagName,
        id: '',
        className: '',
        title: '',
        innerHTML: '',
        textContent: '',
        style,
        dataset: {},
        children: [],
        parent: null,
        appendChild: jest.fn((child: FakeElement) => {
            child.parent = element;
            element.children.push(child);
            return child;
        }),
        addEventListener: jest.fn((type: string, handler: Listener) => {
            listeners.set(type, handler);
        }),
        setAttribute: jest.fn((name: string, value: string) => {
            attributes.set(name, value);
        }),
        getAttribute: jest.fn((name: string) => attributes.get(name) || null),
        getBoundingClientRect: jest.fn(() => ({ bottom: 40, right: 180 })),
        querySelectorAll: jest.fn((selector: string) => findAll(element, selector)),
        querySelector: jest.fn((selector: string) => findAll(element, selector)[0] || null),
        remove: jest.fn(() => {
            if (!element.parent) {
                return;
            }
            element.parent.children = element.parent.children.filter((child) => child !== element);
            element.parent = null;
        }),
        emit(type: string, event: any = {}) {
            const listener = listeners.get(type);
            if (listener) {
                listener(event);
            }
        },
    };
    return element;
}

function setupDomHarness() {
    const body = createElement('body');
    const documentListeners = new Map<string, Listener[]>();
    global.document = {
        createElement: jest.fn((tag: string) => createElement(tag)),
        body: body as unknown as HTMLBodyElement,
        addEventListener: jest.fn((type: string, handler: Listener) => {
            const listeners = documentListeners.get(type) || [];
            listeners.push(handler);
            documentListeners.set(type, listeners);
        }),
    } as unknown as Document;
    global.window = {
        innerWidth: 500,
        addEventListener: jest.fn(),
    } as unknown as Window & typeof globalThis;

    return {
        body,
        emitDocument(type: string, event: any = {}) {
            for (const listener of documentListeners.get(type) || []) {
                listener(event);
            }
        },
    };
}

describe('featureMenus toolbar ui', () => {
    const originalDocument = global.document;
    const originalWindow = global.window;

    afterEach(() => {
        global.document = originalDocument;
        global.window = originalWindow;
    });

    it('opens the focus mode dropdown and applies a mode selection callback', () => {
        const { body } = setupDomHarness();
        const docListeners: Array<{ type: string; handler: EventListener }> = [];
        global.window.innerWidth = 400;

        const onFocusModeChange = jest.fn();
        const element = createFocusModeSelector({
            isDarkTheme: () => true,
            onFocusModeChange,
            getFocusMode: () => 'all',
            onChangeViewLocation: jest.fn(),
            onOpenPinnedTab: jest.fn(),
            onUnpinTab: jest.fn(),
        }, {
            documentListeners: docListeners,
            getListenerOptions: () => undefined,
            getBtnStyle: () => 'background: transparent;',
        }) as unknown as FakeElement;

        const btn = element.children[0];
        const dropdown = body.children.find((child) => child.id === 'focus-mode-dropdown');
        expect(dropdown).toBeDefined();

        btn.emit('click', { stopPropagation: jest.fn() });
        expect(dropdown?.style.display).toBe('block');
        expect(dropdown?.style.top).toBe('44px');
        expect(dropdown?.style.right).toBe('220px');
        expect(docListeners.some((listener) => listener.type === 'click')).toBe(true);
        expect(docListeners.some((listener) => listener.type === 'resize')).toBe(true);

        const upstreamItem = dropdown?.children.find((child) => child.dataset.mode === 'upstream');
        upstreamItem?.emit('click', { stopPropagation: jest.fn() });

        expect(onFocusModeChange).toHaveBeenCalledWith('upstream' as FocusMode);
        expect(btn.innerHTML).toBe('↑');
        expect(dropdown?.style.display).toBe('none');
    });

    it('opens pinned tabs, launches a pin, and removes a pin on delete', () => {
        const { body } = setupDomHarness();

        const onOpenPinnedTab = jest.fn();
        const onUnpinTab = jest.fn();

        const btn = createPinnedTabsButton({
            isDarkTheme: () => false,
            onFocusModeChange: jest.fn(),
            getFocusMode: () => 'all',
            onChangeViewLocation: jest.fn(),
            onOpenPinnedTab,
            onUnpinTab,
        }, [
            { id: 'pin-1', name: 'Revenue Query', sql: 'select 1', dialect: 'PostgreSQL', timestamp: Date.UTC(2026, 1, 28, 12, 0, 0) },
        ], {
            documentListeners: [],
            getListenerOptions: () => undefined,
            getBtnStyle: () => 'background: transparent;',
        }) as unknown as FakeElement;

        const dropdown = body.children.find((child) => child.id === 'pinned-tabs-dropdown');
        expect(dropdown).toBeDefined();

        btn.emit('click', { stopPropagation: jest.fn() });
        expect(dropdown?.style.display).toBe('block');

        const pinItem = dropdown?.children.find((child) => child.tagName === 'div' && child !== dropdown.children[0]);
        expect(pinItem).toBeDefined();

        pinItem?.emit('click', { stopPropagation: jest.fn() });
        expect(onOpenPinnedTab).toHaveBeenCalledWith('pin-1');
        expect(dropdown?.style.display).toBe('none');

        const deleteBtn = pinItem?.children.find((child) => child.tagName === 'span' && child.innerHTML === '×');
        deleteBtn?.emit('click', { stopPropagation: jest.fn() });
        expect(onUnpinTab).toHaveBeenCalledWith('pin-1');
        expect(pinItem?.remove).toHaveBeenCalled();
    });

    it('escapes pinned visualization labels before inserting menu markup', () => {
        const { body } = setupDomHarness();

        createPinnedTabsButton({
            isDarkTheme: () => false,
            onFocusModeChange: jest.fn(),
            getFocusMode: () => 'all',
            onChangeViewLocation: jest.fn(),
            onOpenPinnedTab: jest.fn(),
            onUnpinTab: jest.fn(),
        }, [
            { id: 'pin-1', name: '<img src=x onerror=alert(1)>', sql: 'select 1', dialect: 'PostgreSQL', timestamp: Date.UTC(2026, 1, 28, 12, 0, 0) },
        ], {
            documentListeners: [],
            getListenerOptions: () => undefined,
            getBtnStyle: () => 'background: transparent;',
        });

        const dropdown = body.children.find((child) => child.id === 'pinned-tabs-dropdown');
        const pinItem = dropdown?.children.find((child) => child.tagName === 'div' && child !== dropdown.children[0]);
        expect(pinItem?.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(pinItem?.innerHTML).not.toContain('<img src=x onerror=alert(1)>');
    });

    it('uses theme-aware muted text colors for light-theme pinned metadata', () => {
        const { body } = setupDomHarness();

        createPinnedTabsButton({
            isDarkTheme: () => false,
            onFocusModeChange: jest.fn(),
            getFocusMode: () => 'all',
            onChangeViewLocation: jest.fn(),
            onOpenPinnedTab: jest.fn(),
            onUnpinTab: jest.fn(),
        }, [
            { id: 'pin-1', name: 'Revenue Query', sql: 'select 1', dialect: 'PostgreSQL', timestamp: Date.UTC(2026, 1, 28, 12, 0, 0) },
        ], {
            documentListeners: [],
            getListenerOptions: () => undefined,
            getBtnStyle: () => 'background: transparent;',
        });

        const dropdown = body.children.find((child) => child.id === 'pinned-tabs-dropdown');
        expect(dropdown?.children[0].style.cssText).toContain(`color: ${getComponentUiColors(false).textMuted}`);

        const pinItem = dropdown?.children.find((child) => child.tagName === 'div' && child !== dropdown.children[0]);
        expect(pinItem?.innerHTML).toContain(`color: ${getComponentUiColors(false).textMuted}`);

        const deleteBtn = pinItem?.children.find((child) => child.tagName === 'span' && child.innerHTML === '×');
        expect(deleteBtn?.style.cssText).toContain(`color: ${getComponentUiColors(false).textMuted}`);
    });

    it('updates the active view location selection after the user changes it', () => {
        const { body } = setupDomHarness();
        const onChangeViewLocation = jest.fn();

        const button = createViewLocationButton({
            isDarkTheme: () => false,
            onFocusModeChange: jest.fn(),
            getFocusMode: () => 'all',
            onChangeViewLocation,
            onOpenPinnedTab: jest.fn(),
            onUnpinTab: jest.fn(),
        }, 'tab', {
            documentListeners: [],
            getListenerOptions: () => undefined,
            getBtnStyle: () => 'background: transparent;',
        }) as unknown as FakeElement;

        const dropdown = body.children.find((child) => child.id === 'view-location-dropdown');
        expect(dropdown).toBeDefined();

        button.emit('click', { stopPropagation: jest.fn() });
        expect(dropdown?.style.display).toBe('block');

        const tabItem = dropdown?.children.find((child) => child.dataset.viewLocation === 'tab');
        const besideItem = dropdown?.children.find((child) => child.dataset.viewLocation === 'beside');
        expect(tabItem?.querySelector('.sql-crack-check-icon')).not.toBeNull();

        besideItem?.emit('click', { stopPropagation: jest.fn() });

        expect(onChangeViewLocation).toHaveBeenCalledWith('beside');
        expect(dropdown?.style.display).toBe('none');
        expect(besideItem?.querySelector('.sql-crack-check-icon')).not.toBeNull();
        expect(tabItem?.querySelector('.sql-crack-check-icon')).toBeNull();
    });

    it('reapplies floating menu theme styles after a theme toggle', () => {
        const { body, emitDocument } = setupDomHarness();

        createPinnedTabsButton({
            isDarkTheme: () => true,
            onFocusModeChange: jest.fn(),
            getFocusMode: () => 'all',
            onChangeViewLocation: jest.fn(),
            onOpenPinnedTab: jest.fn(),
            onUnpinTab: jest.fn(),
        }, [
            { id: 'pin-1', name: 'Revenue Query', sql: 'select 1', dialect: 'PostgreSQL', timestamp: Date.UTC(2026, 1, 28, 12, 0, 0) },
        ], {
            documentListeners: [],
            getListenerOptions: () => undefined,
            getBtnStyle: () => 'background: transparent;',
        });

        const dropdown = body.children.find((child) => child.id === 'pinned-tabs-dropdown');
        const pinItem = dropdown?.children.find((child) => child.tagName === 'div' && child !== dropdown.children[0]);
        const deleteBtn = pinItem?.children.find((child) => child.tagName === 'span' && child.innerHTML === '×');

        emitDocument('theme-change', { detail: { dark: false } });

        expect(dropdown?.style.background).toBe(getComponentUiColors(false).surfaceElevated);
        expect(deleteBtn?.style.color).toBe(getComponentUiColors(false).textMuted);

        deleteBtn?.emit('mouseenter');
        expect(deleteBtn?.style.color).toBe('#ef4444');

        deleteBtn?.emit('mouseleave');
        expect(deleteBtn?.style.color).toBe(getComponentUiColors(false).textMuted);
    });
});
