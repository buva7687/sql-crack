import {
    disposePinnedTabs,
    findPinnedTab,
    getActiveTabId,
    getPinnedTabs,
    pinCurrentVisualization,
    setActiveTabId,
    switchToTab,
    unpinTab,
    updateTabsUI,
} from '../../../src/webview/ui/pinnedTabs';

type Listener = (event: any) => void;

type FakeElement = {
    tagName: string;
    id: string;
    textContent: string;
    style: {
        cssText: string;
        display: string;
        background: string;
        color: string;
        opacity: string;
    };
    children: FakeElement[];
    appendChild: jest.Mock<FakeElement, [FakeElement]>;
    addEventListener: jest.Mock<void, [string, Listener, AddEventListenerOptions?]>;
    querySelector: jest.Mock<FakeElement | null, [string]>;
    emit: (type: string, event?: any) => void;
};

function createElement(tagName: string): FakeElement {
    const listeners = new Map<string, Listener>();
    const styleState = {
        cssText: '',
        display: '',
        background: '',
        color: '',
        opacity: '',
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
            const backgroundMatch = value.match(/background:\s*([^;]+);?/);
            if (backgroundMatch) {
                styleState.background = backgroundMatch[1].trim();
            }
            const colorMatch = value.match(/color:\s*([^;]+);?/);
            if (colorMatch) {
                styleState.color = colorMatch[1].trim();
            }
            const opacityMatch = value.match(/opacity:\s*([^;]+);?/);
            if (opacityMatch) {
                styleState.opacity = opacityMatch[1].trim();
            }
        },
    });
    Object.defineProperty(style, 'display', { get: () => styleState.display, set: (v: string) => { styleState.display = v; } });
    Object.defineProperty(style, 'background', { get: () => styleState.background, set: (v: string) => { styleState.background = v; } });
    Object.defineProperty(style, 'color', { get: () => styleState.color, set: (v: string) => { styleState.color = v; } });
    Object.defineProperty(style, 'opacity', { get: () => styleState.opacity, set: (v: string) => { styleState.opacity = v; } });

    const element: FakeElement = {
        tagName,
        id: '',
        textContent: '',
        style,
        children: [],
        appendChild: jest.fn((child: FakeElement) => {
            element.children.push(child);
            return child;
        }),
        addEventListener: jest.fn((type: string, handler: Listener) => {
            listeners.set(type, handler);
        }),
        querySelector: jest.fn((selector: string) => {
            if (selector.startsWith('#')) {
                const id = selector.slice(1);
                return findById(element.children, id);
            }
            return null;
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

function findById(elements: FakeElement[], id: string): FakeElement | null {
    for (const element of elements) {
        if (element.id === id) {
            return element;
        }
        const nested = findById(element.children, id);
        if (nested) {
            return nested;
        }
    }
    return null;
}

describe('pinnedTabs', () => {
    const originalDocument = global.document;
    const originalAlert = global.alert;
    const originalDateNow = Date.now;

    afterEach(() => {
        getPinnedTabs().length = 0;
        setActiveTabId(null);
        disposePinnedTabs();
        global.document = originalDocument;
        global.alert = originalAlert;
        Date.now = originalDateNow;
    });

    it('guards against pinning empty SQL', () => {
        const alertSpy = jest.fn();
        global.alert = alertSpy;

        pinCurrentVisualization({
            onSwitchTab: jest.fn(),
            onUnpinTab: jest.fn(),
            getCurrentSql: () => '   ',
            getCurrentDialect: () => 'PostgreSQL',
            getCurrentResult: () => null,
        });

        expect(alertSpy).toHaveBeenCalledWith('No visualization to pin');
        expect(getPinnedTabs()).toHaveLength(0);
    });

    it('pins the current visualization, renders tabs, switches, and unpins active tabs', () => {
        const root = createElement('div');
        root.id = 'root';
        const elements = new Map<string, FakeElement>([['root', root]]);

        global.document = {
            createElement: jest.fn((tag: string) => createElement(tag)),
            getElementById: jest.fn((id: string) => elements.get(id) || null),
        } as unknown as Document;
        Date.now = jest.fn(() => 12345);

        const callbacks = {
            onSwitchTab: jest.fn(),
            onUnpinTab: jest.fn(),
            getCurrentSql: () => 'select * from users',
            getCurrentDialect: () => 'PostgreSQL' as const,
            getCurrentResult: () => ({ nodes: [], edges: [], stats: {} } as any),
            isDarkTheme: () => true,
        };

        pinCurrentVisualization(callbacks, 'users.sql');

        expect(getPinnedTabs()).toHaveLength(1);
        expect(getActiveTabId()).toBe('tab-12345');
        expect(findPinnedTab('tab-12345')?.name).toBe('users');

        const container = root.children.find((child) => child.id === 'pinned-tabs-container');
        expect(container).toBeDefined();
        expect(container?.style.display).toBe('flex');

        const tabsList = container?.children.find((child) => child.id === 'tabs-list');
        expect(tabsList).toBeDefined();
        expect(tabsList?.children).toHaveLength(2);

        const currentTab = tabsList!.children[0];
        const pinnedTab = tabsList!.children[1];
        currentTab.emit('click');
        expect(callbacks.onSwitchTab).toHaveBeenCalledWith(null);

        pinnedTab.emit('click');
        expect(callbacks.onSwitchTab).toHaveBeenCalledWith('tab-12345');

        const closeBtn = pinnedTab.children.find((child) => child.textContent === '×');
        expect(closeBtn).toBeDefined();
        closeBtn?.emit('click', { stopPropagation: jest.fn() });
        expect(callbacks.onSwitchTab).toHaveBeenCalledWith(null);
        expect(getPinnedTabs()).toHaveLength(0);
        expect(getActiveTabId()).toBeNull();
    });

    it('can switch and unpin through the exported helpers', () => {
        getPinnedTabs().push({
            id: 'tab-1',
            name: 'Query 1',
            sql: 'select 1',
            dialect: 'PostgreSQL',
            result: null,
        });

        const callbacks = {
            onSwitchTab: jest.fn(),
            onUnpinTab: jest.fn(),
            getCurrentSql: () => 'select 1',
            getCurrentDialect: () => 'PostgreSQL' as const,
            getCurrentResult: () => null,
            isDarkTheme: () => true,
        };

        global.document = {
            createElement: jest.fn((tag: string) => createElement(tag)),
            getElementById: jest.fn(() => null),
        } as unknown as Document;

        updateTabsUI(callbacks);
        switchToTab('tab-1', callbacks);
        expect(getActiveTabId()).toBe('tab-1');
        expect(callbacks.onSwitchTab).toHaveBeenCalledWith('tab-1');

        unpinTab('tab-1', callbacks);
        expect(getPinnedTabs()).toHaveLength(0);
        expect(getActiveTabId()).toBeNull();
        expect(callbacks.onSwitchTab).toHaveBeenCalledWith(null);
    });
});
