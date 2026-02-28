import {
    createLegendBar,
    disposeLegendBar,
    getLegendBarHeight,
    isLegendBarVisible,
    toggleLegendBar,
} from '../../../src/webview/ui/legendBar';

type Listener = (event: any) => void;

type FakeElement = {
    tagName: string;
    id: string;
    innerHTML: string;
    offsetHeight: number;
    style: {
        cssText: string;
        transform: string;
        opacity: string;
        pointerEvents: string;
        background: string;
        borderColor: string;
    };
    children: FakeElement[];
    appendChild: jest.Mock<FakeElement, [FakeElement]>;
    setAttribute: jest.Mock<void, [string, string]>;
    addEventListener: jest.Mock<void, [string, Listener]>;
    querySelector: jest.Mock<FakeElement | null, [string]>;
    emit: (type: string, event?: any) => void;
};

function createElement(tagName: string): FakeElement {
    const listeners = new Map<string, Listener>();
    const element: FakeElement = {
        tagName,
        id: '',
        innerHTML: '',
        offsetHeight: 36,
        style: {
            cssText: '',
            transform: '',
            opacity: '',
            pointerEvents: '',
            background: '',
            borderColor: '',
        },
        children: [],
        appendChild: jest.fn((child: FakeElement) => {
            element.children.push(child);
            return child;
        }),
        setAttribute: jest.fn(),
        addEventListener: jest.fn((type: string, handler: Listener) => {
            listeners.set(type, handler);
        }),
        querySelector: jest.fn((_selector: string) => null),
        emit(type: string, event: any = {}) {
            const listener = listeners.get(type);
            if (listener) {
                listener(event);
            }
        },
    };
    return element;
}

describe('legendBar', () => {
    const originalDocument = global.document;
    const originalLocalStorage = global.localStorage;
    const originalWindow = global.window;

    afterEach(() => {
        disposeLegendBar();
        global.document = originalDocument;
        global.localStorage = originalLocalStorage;
        global.window = originalWindow;
    });

    it('creates the legend, toggles visibility, and dispatches visibility events', () => {
        const container = createElement('div');
        const legendBar = createElement('div');
        const closeButton = createElement('button');
        const dispatchEvent = jest.fn();
        const docListeners = new Map<string, Listener>();

        legendBar.querySelector.mockImplementation((selector: string) => (
            selector === '#legend-bar-close' ? closeButton : null
        ));

        global.document = {
            createElement: jest.fn((_tag: string) => legendBar),
            addEventListener: jest.fn((type: string, handler: Listener) => {
                docListeners.set(type, handler);
            }),
            dispatchEvent,
        } as unknown as Document;
        global.localStorage = {
            length: 0,
            clear: jest.fn(),
            getItem: jest.fn(() => null),
            key: jest.fn(() => null),
            removeItem: jest.fn(),
            setItem: jest.fn(),
        } as Storage;
        global.window = {
            debugLogging: false,
        } as unknown as Window & typeof globalThis;

        const created = createLegendBar(container as unknown as HTMLElement, {
            isDarkTheme: () => true,
        });

        expect(created).toBe(legendBar as unknown as HTMLDivElement);
        expect(container.appendChild).toHaveBeenCalledWith(legendBar);
        expect(legendBar.innerHTML).toContain('Subquery Src');
        expect(closeButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(isLegendBarVisible()).toBe(true);
        expect(getLegendBarHeight()).toBe(36);

        toggleLegendBar(false);
        expect(legendBar.style.transform).toBe('translateY(100%)');
        expect(legendBar.style.opacity).toBe('0');
        expect(legendBar.style.pointerEvents).toBe('none');
        expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
            detail: { visible: false, height: 0 },
        }));

        toggleLegendBar(true);
        expect(legendBar.style.transform).toBe('translateY(0)');
        expect(legendBar.style.opacity).toBe('1');
        expect(legendBar.style.pointerEvents).toBe('auto');

        const themeHandler = docListeners.get('theme-change');
        expect(themeHandler).toBeDefined();
        themeHandler!({ detail: { dark: false } });
        expect(legendBar.innerHTML).toContain('Dismiss legend');
    });
});
