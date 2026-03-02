import { createSearchBox } from '../../../src/webview/ui/toolbar/searchBox';

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

        global.document = {
            createElement: jest.fn((tag: string) => createElement(tag)),
        } as unknown as Document;

        const root = createSearchBox({
            isDarkTheme: () => true,
            onPrevSearchResult,
            onNextSearchResult,
            onSearchBoxReady: ready,
        }, () => undefined) as unknown as FakeElement;

        expect(root.id).toBe('search-container');
        expect(root.style.cssText).toContain('display: flex');

        const searchInput = root.children.find((child) => child.id === 'search-input');
        const searchCount = root.children.find((child) => child.id === 'search-count');
        const navContainer = root.children.find((child) => child.tagName === 'div' && child.children.length === 2);

        expect(searchInput).toBeDefined();
        expect(searchInput?.placeholder).toBe('Search nodes... (Ctrl+F)');
        expect(searchInput?.getAttribute('aria-label')).toBe('Search nodes');
        expect(searchCount?.getAttribute('aria-live')).toBe('polite');
        expect(ready).toHaveBeenCalledWith(searchInput, searchCount);

        const prevBtn = navContainer?.children[0];
        const nextBtn = navContainer?.children[1];
        expect(prevBtn?.getAttribute('aria-label')).toBe('Previous match');
        expect(nextBtn?.getAttribute('aria-label')).toBe('Next match');

        prevBtn?.emit('click');
        nextBtn?.emit('click');

        expect(onPrevSearchResult).toHaveBeenCalled();
        expect(onNextSearchResult).toHaveBeenCalled();
    });
});
