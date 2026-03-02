import {
    addBreadcrumbSegment,
    clearBreadcrumbBar,
    createBreadcrumbBar,
    disposeBreadcrumbBar,
    isBreadcrumbBarVisible,
    removeBreadcrumbSegment,
    repositionBreadcrumbBar,
    updateBreadcrumbBar,
} from '../../../src/webview/ui/breadcrumbBar';

type Listener = (event: any) => void;

type FakeElement = {
    tagName: string;
    id: string;
    textContent: string;
    innerHTML: string;
    offsetHeight: number;
    style: {
        cssText: string;
        display: string;
        top: string;
        background: string;
        borderColor: string;
        color: string;
    };
    children: FakeElement[];
    appendChild: jest.Mock<FakeElement, [FakeElement]>;
    addEventListener: jest.Mock<void, [string, Listener, AddEventListenerOptions?]>;
    setAttribute: jest.Mock<void, [string, string]>;
    emit: (type: string, event?: any) => void;
};

function createElement(tagName: string): FakeElement {
    const listeners = new Map<string, Listener>();
    const styleState = {
        cssText: '',
        display: '',
        top: '',
        background: '',
        borderColor: '',
        color: '',
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
            const backgroundMatch = value.match(/background:\s*([^;]+);?/);
            if (backgroundMatch) {
                styleState.background = backgroundMatch[1].trim();
            }
            const borderMatch = value.match(/border:\s*1px solid\s*([^;]+);?/);
            if (borderMatch) {
                styleState.borderColor = borderMatch[1].trim();
            }
            const colorMatch = value.match(/color:\s*([^;]+);?/);
            if (colorMatch) {
                styleState.color = colorMatch[1].trim();
            }
        },
    });
    Object.defineProperty(style, 'display', { get: () => styleState.display, set: (v: string) => { styleState.display = v; } });
    Object.defineProperty(style, 'top', { get: () => styleState.top, set: (v: string) => { styleState.top = v; } });
    Object.defineProperty(style, 'background', { get: () => styleState.background, set: (v: string) => { styleState.background = v; } });
    Object.defineProperty(style, 'borderColor', { get: () => styleState.borderColor, set: (v: string) => { styleState.borderColor = v; } });
    Object.defineProperty(style, 'color', { get: () => styleState.color, set: (v: string) => { styleState.color = v; } });

    const element: FakeElement = {
        tagName,
        id: '',
        textContent: '',
        innerHTML: '',
        offsetHeight: 0,
        style,
        children: [],
        appendChild: jest.fn((child: FakeElement) => {
            element.children.push(child);
            return child;
        }),
        addEventListener: jest.fn((type: string, handler: Listener) => {
            listeners.set(type, handler);
        }),
        setAttribute: jest.fn(),
        emit(type: string, event: any = {}) {
            const listener = listeners.get(type);
            if (listener) {
                listener(event);
            }
        },
    };
    return element;
}

describe('breadcrumbBar', () => {
    const originalDocument = global.document;

    afterEach(() => {
        disposeBreadcrumbBar();
        global.document = originalDocument;
    });

    it('renders segments, clears individual filters, and repositions around the error badge', () => {
        const container = createElement('div');
        const bodyElements = new Map<string, FakeElement>();
        const docListeners = new Map<string, Listener>();
        const errorBadge = createElement('div');
        errorBadge.offsetHeight = 24;
        bodyElements.set('sql-crack-error-badge', errorBadge);

        global.document = {
            createElement: jest.fn((tag: string) => createElement(tag)),
            addEventListener: jest.fn((type: string, handler: Listener) => {
                docListeners.set(type, handler);
            }),
            getElementById: jest.fn((id: string) => bodyElements.get(id) || null),
        } as unknown as Document;

        const onClearAll = jest.fn();
        const created = createBreadcrumbBar(container as unknown as HTMLElement, {
            isDarkTheme: () => true,
            onClearAll,
        }) as unknown as FakeElement;

        expect(container.appendChild).toHaveBeenCalledWith(created);
        expect(isBreadcrumbBarVisible()).toBe(false);

        const clearSearch = jest.fn();
        const clearFocus = jest.fn();
        updateBreadcrumbBar([
            { id: 'search', label: 'Search: orders', icon: '/', onClear: clearSearch },
            { id: 'focus', label: 'Upstream', icon: '↑', onClear: clearFocus },
        ]);

        expect(created.style.display).toBe('flex');
        expect(created.style.top).toBe('84px');
        expect(isBreadcrumbBarVisible()).toBe(true);
        expect(created.children.length).toBeGreaterThan(0);

        const segmentChip = created.children.find((child: FakeElement) => child.tagName === 'span' && child.children.length > 0);
        expect(segmentChip).toBeDefined();
        segmentChip?.emit('click', { stopPropagation: jest.fn() });
        expect(clearSearch).toHaveBeenCalled();

        addBreadcrumbSegment({ id: 'column', label: 'Column Trace', onClear: jest.fn() });
        removeBreadcrumbSegment('focus');
        repositionBreadcrumbBar();
        expect(created.style.top).toBe('84px');

        const clearAllBtn = created.children.find((child: FakeElement) => child.tagName === 'button');
        expect(clearAllBtn).toBeDefined();
        clearAllBtn?.emit('click', { stopPropagation: jest.fn() });
        expect(onClearAll).toHaveBeenCalled();
        expect(created.style.display).toBe('none');

        const themeHandler = docListeners.get('theme-change');
        expect(themeHandler).toBeDefined();
        updateBreadcrumbBar([{ id: 'search', label: 'Search: users', onClear: jest.fn() }]);
        themeHandler!({ detail: { dark: false } });
        expect(created.style.background).toBeTruthy();

        clearBreadcrumbBar();
        expect(created.style.display).toBe('none');
    });
});
