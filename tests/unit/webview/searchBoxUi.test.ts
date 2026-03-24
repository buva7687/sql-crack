import { createSearchBox } from '../../../src/webview/ui/toolbar/searchBox';
import { getComponentUiColors } from '../../../src/webview/constants';

type Listener = (event: any) => void;

type FakeElement = {
    tagName: string;
    id: string;
    type?: string;
    placeholder?: string;
    title: string;
    innerHTML: string;
    textContent: string;
    style: { cssText: string };
    children: FakeElement[];
    attributes: Map<string, string>;
    appendChild: jest.Mock<FakeElement, [FakeElement]>;
    addEventListener: jest.Mock<void, [string, Listener, AddEventListenerOptions?]>;
    setAttribute: jest.Mock<void, [string, string]>;
    getAttribute: jest.Mock<string | null, [string]>;
    emit: (type: string, event?: any) => void;
};

function createElement(tagName: string): FakeElement {
    const listeners = new Map<string, Listener>();
    const attributes = new Map<string, string>();
    const element: FakeElement = {
        tagName,
        id: '',
        title: '',
        innerHTML: '',
        textContent: '',
        style: { cssText: '' },
        children: [],
        attributes,
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
        emit(type: string, event: any = {}) {
            const listener = listeners.get(type);
            if (listener) {
                listener(event);
            }
        },
    };
    return element;
}

describe('searchBox toolbar ui', () => {
    const originalDocument = global.document;

    afterEach(() => {
        global.document = originalDocument;
    });

    it('builds the search UI, exposes ready elements, and wires prev/next callbacks', () => {
        const ready = jest.fn();
        const onPrevSearchResult = jest.fn();
        const onNextSearchResult = jest.fn();
        const themeChangeListener = jest.fn();

        global.document = {
            createElement: jest.fn((tag: string) => createElement(tag)),
            addEventListener: themeChangeListener,
        } as unknown as Document;

        const root = createSearchBox({
            isDarkTheme: () => true,
            onPrevSearchResult,
            onNextSearchResult,
            onSearchBoxReady: ready,
        }, () => undefined) as unknown as FakeElement;

        expect(root.id).toBe('search-container');
        expect(root.style.cssText).toContain('display: flex');
        expect((root as any).style.background).toBe(getComponentUiColors(true).surface);

        const searchInput = root.children.find((child) => child.id === 'search-input');
        const searchCount = root.children.find((child) => child.id === 'search-count');
        const navContainer = root.children.find((child) => child.tagName === 'div' && child.children.length === 2);

        expect(searchInput).toBeDefined();
        expect(searchInput?.placeholder).toBe('Search nodes... (Ctrl+F)');
        expect(searchInput?.getAttribute('aria-label')).toBe('Search nodes');
        expect(searchCount?.getAttribute('aria-live')).toBe('polite');
        expect((searchInput as any)?.style.color).toBe(getComponentUiColors(true).text);
        expect((searchCount as any)?.style.color).toBe(getComponentUiColors(true).textMuted);
        expect(ready).toHaveBeenCalledWith(searchInput, searchCount);

        const prevBtn = navContainer?.children[0];
        const nextBtn = navContainer?.children[1];
        expect(prevBtn?.getAttribute('aria-label')).toBe('Previous match');
        expect(nextBtn?.getAttribute('aria-label')).toBe('Next match');
        expect((prevBtn as any)?.style.color).toBe(getComponentUiColors(true).textMuted);
        expect((nextBtn as any)?.style.color).toBe(getComponentUiColors(true).textMuted);

        prevBtn?.emit('click');
        nextBtn?.emit('click');

        expect(onPrevSearchResult).toHaveBeenCalled();
        expect(onNextSearchResult).toHaveBeenCalled();
        expect(themeChangeListener).toHaveBeenCalled();
    });

    it('applies light theme colors to muted search chrome', () => {
        const ready = jest.fn();
        global.document = {
            createElement: jest.fn((tag: string) => createElement(tag)),
            addEventListener: jest.fn(),
        } as unknown as Document;

        const root = createSearchBox({
            isDarkTheme: () => false,
            onPrevSearchResult: jest.fn(),
            onNextSearchResult: jest.fn(),
            onSearchBoxReady: ready,
        }, () => undefined) as unknown as FakeElement;

        const searchInput = root.children.find((child) => child.id === 'search-input');
        const searchCount = root.children.find((child) => child.id === 'search-count');
        expect((root as any).style.background).toBe(getComponentUiColors(false).surface);
        expect((root as any).style.borderColor).toBe(getComponentUiColors(false).border);
        expect((searchInput as any)?.style.color).toBe(getComponentUiColors(false).text);
        expect((searchCount as any)?.style.color).toBe(getComponentUiColors(false).textMuted);
    });
});
