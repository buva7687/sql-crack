/**
 * Shared fake DOM factory for testing SVG-rendering modules in Jest.
 *
 * Provides lightweight FakeElement / FakeDocument objects that track
 * setAttribute calls, children, style mutations, and event listeners
 * without requiring jsdom or a real browser.
 *
 * Usage:
 *   import { installFakeDocument, uninstallFakeDocument, getCreatedElements } from '../helpers/fakeDom';
 *
 *   beforeEach(() => installFakeDocument());
 *   afterEach(() => uninstallFakeDocument());
 */

// ============================================================
// Types
// ============================================================

export interface FakeElement {
    tagName: string;
    namespaceURI: string | null;
    id: string;
    className: string;
    textContent: string | null;
    innerHTML: string;

    // Attribute tracking
    attrs: Map<string, string>;
    setAttribute: jest.Mock;
    getAttribute: jest.Mock;
    removeAttribute: jest.Mock;
    hasAttribute: jest.Mock;

    // Style (subset — extend as needed)
    style: Record<string, string> & {
        cssText: string;
        cursor: string;
        transition: string;
        display: string;
        opacity: string;
        background: string;
        position: string;
        top: string;
        left: string;
        zIndex: string;
        outline: string;
        touchAction: string;
    };

    // DOM tree
    children: FakeElement[];
    parentElement: FakeElement | null;
    appendChild: jest.Mock;
    removeChild: jest.Mock;
    remove: jest.Mock;
    insertBefore: jest.Mock;

    // Query
    querySelector: jest.Mock;
    querySelectorAll: jest.Mock;

    // Events
    addEventListener: jest.Mock;
    removeEventListener: jest.Mock;
    dispatchEvent: jest.Mock;

    // Extras used by rendering modules
    getBBox: jest.Mock;
    getBoundingClientRect: jest.Mock;
}

// ============================================================
// Factory
// ============================================================

/** Registry of all elements created during a test, in creation order. */
let createdElements: FakeElement[] = [];

/**
 * Create a fake DOM element that tracks all mutations.
 */
export function createFakeElement(tagName: string, namespaceURI: string | null = null): FakeElement {
    const attrs = new Map<string, string>();
    const listeners = new Map<string, Function[]>();

    const el: FakeElement = {
        tagName,
        namespaceURI,
        id: '',
        className: '',
        textContent: null,
        innerHTML: '',

        attrs,
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
            if (name === 'id') el.id = value;
            if (name === 'class') el.className = value;
        }),
        getAttribute: jest.fn((name: string) => attrs.get(name) ?? null),
        removeAttribute: jest.fn((name: string) => attrs.delete(name)),
        hasAttribute: jest.fn((name: string) => attrs.has(name)),

        style: new Proxy(
            {
                cssText: '',
                cursor: '',
                transition: '',
                display: '',
                opacity: '',
                background: '',
                position: '',
                top: '',
                left: '',
                zIndex: '',
                outline: '',
                touchAction: '',
            } as Record<string, string>,
            {
                get(target, prop: string) {
                    return target[prop] ?? '';
                },
                set(target, prop: string, value: string) {
                    target[prop] = value;
                    return true;
                },
            }
        ) as FakeElement['style'],

        children: [],
        parentElement: null,
        appendChild: jest.fn((child: FakeElement) => {
            el.children.push(child);
            child.parentElement = el;
            return child;
        }),
        removeChild: jest.fn((child: FakeElement) => {
            const idx = el.children.indexOf(child);
            if (idx >= 0) el.children.splice(idx, 1);
            child.parentElement = null;
            return child;
        }),
        remove: jest.fn(() => {
            if (el.parentElement) {
                const idx = el.parentElement.children.indexOf(el);
                if (idx >= 0) el.parentElement.children.splice(idx, 1);
                el.parentElement = null;
            }
        }),
        insertBefore: jest.fn((newChild: FakeElement, _refChild: FakeElement | null) => {
            el.children.push(newChild);
            newChild.parentElement = el;
            return newChild;
        }),

        querySelector: jest.fn((selector: string): FakeElement | null => {
            return findDescendant(el, selector);
        }),
        querySelectorAll: jest.fn((selector: string): FakeElement[] => {
            return findAllDescendants(el, selector);
        }),

        addEventListener: jest.fn((type: string, handler: Function) => {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type)!.push(handler);
        }),
        removeEventListener: jest.fn((type: string, handler: Function) => {
            const arr = listeners.get(type);
            if (arr) {
                const idx = arr.indexOf(handler);
                if (idx >= 0) arr.splice(idx, 1);
            }
        }),
        dispatchEvent: jest.fn((event: { type: string }) => {
            const arr = listeners.get(event.type);
            arr?.forEach(fn => fn(event));
        }),

        getBBox: jest.fn(() => ({ x: 0, y: 0, width: 100, height: 50 })),
        getBoundingClientRect: jest.fn(() => ({
            x: 0, y: 0, width: 100, height: 50,
            top: 0, right: 100, bottom: 50, left: 0,
            toJSON: () => ({}),
        })),
    };

    createdElements.push(el);
    return el;
}

// ============================================================
// Simple selector matching (covers .class, #id, tagName)
// ============================================================

function matchesSelector(el: FakeElement, selector: string): boolean {
    if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return el.className.split(/\s+/).includes(cls) ||
            (el.attrs.get('class') ?? '').split(/\s+/).includes(cls);
    }
    if (selector.startsWith('#')) {
        return el.id === selector.slice(1);
    }
    return el.tagName.toLowerCase() === selector.toLowerCase();
}

function findDescendant(root: FakeElement, selector: string): FakeElement | null {
    for (const child of root.children) {
        if (matchesSelector(child, selector)) return child;
        const found = findDescendant(child, selector);
        if (found) return found;
    }
    return null;
}

function findAllDescendants(root: FakeElement, selector: string): FakeElement[] {
    const results: FakeElement[] = [];
    for (const child of root.children) {
        if (matchesSelector(child, selector)) results.push(child);
        results.push(...findAllDescendants(child, selector));
    }
    return results;
}

// ============================================================
// Global document installation
// ============================================================

/**
 * Install a fake `document` on `global` with `createElementNS` and `createElement`.
 * Call in `beforeEach`.
 */
export function installFakeDocument(): void {
    createdElements = [];
    (global as any).document = {
        createElementNS: jest.fn((_ns: string, tag: string) => createFakeElement(tag, _ns)),
        createElement: jest.fn((tag: string) => createFakeElement(tag)),
        getElementById: jest.fn((id: string): FakeElement | null => {
            return createdElements.find(el => el.id === id) ?? null;
        }),
        querySelector: jest.fn((selector: string): FakeElement | null => {
            return createdElements.find(el => matchesSelector(el, selector)) ?? null;
        }),
        querySelectorAll: jest.fn((selector: string): FakeElement[] => {
            return createdElements.filter(el => matchesSelector(el, selector));
        }),
    };
}

/**
 * Remove the fake `document` from `global`. Call in `afterEach`.
 */
export function uninstallFakeDocument(): void {
    delete (global as any).document;
    createdElements = [];
}

/**
 * Get all elements created since the last `installFakeDocument()`.
 * Useful for assertions about what was rendered.
 */
export function getCreatedElements(): FakeElement[] {
    return [...createdElements];
}

/**
 * Find elements created with a specific tag name.
 */
export function getElementsOfType(tagName: string): FakeElement[] {
    return createdElements.filter(el => el.tagName === tagName);
}

/**
 * Find the first created element with a specific attribute value.
 */
export function findByAttribute(name: string, value: string): FakeElement | undefined {
    return createdElements.find(el => el.attrs.get(name) === value);
}
