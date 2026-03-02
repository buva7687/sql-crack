import {
    createCommandBar,
    hideCommandBar,
    isCommandBarVisible,
    registerCommandBarActions,
    showCommandBar,
    toggleCommandBar,
} from '../../../src/webview/ui/commandBar';

type Listener = (event: any) => void;

type FakeElement = {
    tagName: string;
    id: string;
    type?: string;
    placeholder?: string;
    value?: string;
    textContent: string;
    innerHTML: string;
    offsetParent: object | null;
    style: {
        cssText: string;
        display: string;
        opacity: string;
        transform: string;
        background: string;
        borderColor: string;
        color: string;
        borderBottomColor: string;
    };
    children: FakeElement[];
    appendChild: jest.Mock<FakeElement, [FakeElement]>;
    addEventListener: jest.Mock<void, [string, Listener, AddEventListenerOptions?]>;
    setAttribute: jest.Mock<void, [string, string]>;
    getAttribute: jest.Mock<string | null, [string]>;
    removeAttribute: jest.Mock<void, [string]>;
    querySelector: jest.Mock<FakeElement | null, [string]>;
    querySelectorAll: jest.Mock<FakeElement[], [string]>;
    focus: jest.Mock<void, []>;
    click: jest.Mock<void, []>;
    scrollIntoView: jest.Mock<void, [ScrollIntoViewOptions?]>;
    emit: (type: string, event?: any) => void;
};

function createElement(tagName: string): FakeElement {
    const listeners = new Map<string, Listener>();
    const attributes = new Map<string, string>();
    let innerHTMLValue = '';
    const styleState = {
        cssText: '',
        display: '',
        opacity: '',
        transform: '',
        background: '',
        borderColor: '',
        color: '',
        borderBottomColor: '',
    };
    const style = {} as FakeElement['style'];
    Object.defineProperty(style, 'cssText', {
        get: () => styleState.cssText,
        set: (value: string) => {
            styleState.cssText = value;
            const matchProp = (prop: keyof typeof styleState, regex: RegExp) => {
                const match = value.match(regex);
                if (match) {
                    styleState[prop] = match[1].trim();
                }
            };
            matchProp('display', /display:\s*([^;]+);?/);
            matchProp('opacity', /opacity:\s*([^;]+);?/);
            matchProp('transform', /transform:\s*([^;]+);?/);
            matchProp('background', /background:\s*([^;]+);?/);
            matchProp('borderColor', /border:\s*1px solid\s*([^;]+);?/);
            matchProp('color', /color:\s*([^;]+);?/);
            matchProp('borderBottomColor', /border-bottom:\s*1px solid\s*([^;]+);?/);
        },
    });
    for (const prop of ['display', 'opacity', 'transform', 'background', 'borderColor', 'color', 'borderBottomColor'] as const) {
        Object.defineProperty(style, prop, {
            get: () => styleState[prop],
            set: (value: string) => { styleState[prop] = value; },
        });
    }

    const element: FakeElement = {
        tagName,
        id: '',
        textContent: '',
        innerHTML: '',
        offsetParent: {},
        style,
        children: [],
        appendChild: jest.fn((child: FakeElement) => {
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
        removeAttribute: jest.fn((name: string) => {
            attributes.delete(name);
        }),
        querySelector: jest.fn((selector: string) => {
            if (selector === '#command-bar-results') {
                return findFirstById(element.children, 'command-bar-results');
            }
            if (selector === '[data-active="true"]') {
                return findFirstByAttribute(element.children, 'data-active', 'true');
            }
            if (selector === '[data-action-id]') {
                return findFirstWithAttribute(element.children, 'data-action-id');
            }
            return null;
        }),
        querySelectorAll: jest.fn((selector: string) => {
            if (selector.includes(',')) {
                return flattenTree(element.children).filter((child) => ['button', 'input'].includes(child.tagName));
            }
            if (selector === '[data-action-id]') {
                return flattenTree(element.children).filter((child) => child.getAttribute('data-action-id') !== null);
            }
            if (selector === '[data-active]') {
                return flattenTree(element.children).filter((child) => child.getAttribute('data-active') !== null);
            }
            return [];
        }),
        focus: jest.fn(),
        click: jest.fn(() => {
            element.emit('click', { stopPropagation: jest.fn() });
        }),
        scrollIntoView: jest.fn(),
        emit(type: string, event: any = {}) {
            const listener = listeners.get(type);
            if (listener) {
                listener(event);
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

function flattenTree(elements: FakeElement[]): FakeElement[] {
    return elements.flatMap((element) => [element, ...flattenTree(element.children)]);
}

function findFirstByAttribute(elements: FakeElement[], attr: string, value: string): FakeElement | null {
    for (const element of flattenTree(elements)) {
        if (element.getAttribute(attr) === value) {
            return element;
        }
    }
    return null;
}

function findFirstById(elements: FakeElement[], id: string): FakeElement | null {
    for (const element of flattenTree(elements)) {
        if (element.id === id) {
            return element;
        }
    }
    return null;
}

function findFirstWithAttribute(elements: FakeElement[], attr: string): FakeElement | null {
    for (const element of flattenTree(elements)) {
        if (element.getAttribute(attr) !== null) {
            return element;
        }
    }
    return null;
}

describe('commandBar', () => {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalHTMLElement = (global as { HTMLElement?: typeof HTMLElement }).HTMLElement;

    afterEach(() => {
        global.document = originalDocument;
        global.window = originalWindow;
        global.requestAnimationFrame = originalRequestAnimationFrame;
        if (originalHTMLElement) {
            (global as { HTMLElement?: typeof HTMLElement }).HTMLElement = originalHTMLElement;
        } else {
            delete (global as { HTMLElement?: typeof HTMLElement }).HTMLElement;
        }
    });

    it('shows, filters, navigates, executes, and hides the command bar', () => {
        const container = createElement('div');
        const focusedBefore = createElement('button');
        const docListeners = new Map<string, Listener>();

        global.document = {
            createElement: jest.fn((tag: string) => createElement(tag)),
            addEventListener: jest.fn((type: string, handler: Listener) => {
                docListeners.set(type, handler);
            }),
            activeElement: focusedBefore as unknown as HTMLElement,
        } as unknown as Document;
        global.window = {
            setTimeout: jest.fn((cb: () => void) => {
                cb();
                return 1;
            }),
        } as unknown as Window & typeof globalThis;
        global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });
        (global as { HTMLElement?: typeof HTMLElement }).HTMLElement = Object as unknown as typeof HTMLElement;

        const openAction = jest.fn();
        const otherAction = jest.fn();
        registerCommandBarActions([
            { id: 'open', label: 'Open Node', shortcut: 'O', category: 'Navigation', action: openAction },
            { id: 'stats', label: 'Toggle Stats', shortcut: 'Q', category: 'Panels', action: otherAction },
        ]);

        const overlay = createCommandBar(container as unknown as HTMLElement, () => true) as unknown as FakeElement;
        const palette = overlay.children[0];
        const input = palette.children[0];
        const results = palette.children[1];

        showCommandBar();
        expect(isCommandBarVisible()).toBe(true);
        expect(overlay.style.display).toBe('flex');
        expect(overlay.style.opacity).toBe('1');
        expect(palette.style.transform).toBe('translateY(0)');
        expect(input.focus).toHaveBeenCalled();
        expect(results.children.length).toBe(2);

        input.value = 'stats';
        input.emit('input');
        expect(results.children.length).toBe(1);
        expect(results.children[0].getAttribute('data-action-id')).toBe('stats');

        input.value = '';
        input.emit('input');
        const preventDefault = jest.fn();
        input.emit('keydown', { key: 'ArrowDown', preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        const active = results.querySelector('[data-active="true"]');
        expect(active?.getAttribute('data-action-id')).toBe('stats');

        input.emit('keydown', { key: 'Enter' });
        expect(otherAction).toHaveBeenCalled();
        expect(isCommandBarVisible()).toBe(false);
        expect(focusedBefore.focus).toHaveBeenCalled();

        toggleCommandBar();
        expect(isCommandBarVisible()).toBe(true);
        overlay.emit('click', { target: overlay });
        expect(isCommandBarVisible()).toBe(false);

        const themeHandler = docListeners.get('theme-change');
        expect(themeHandler).toBeDefined();
        themeHandler!({ detail: { dark: false } });
        expect(palette.style.background).toBe('#FFFFFF');
    });
});
