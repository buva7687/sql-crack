/**
 * M14: toolbar focus / column-lineage buttons follow the renderer state that
 * keyboard shortcuts, the command bar, Escape, and query switches change.
 */

type Listener = (event?: unknown) => void;

const buttons = new Map<string, { onClick: () => void; element: any }>();

function fakeElement(): any {
    const attributes = new Map<string, string>();
    const element: Record<string | symbol, unknown> = {
        style: {},
        dataset: {},
        classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn(), contains: jest.fn(() => false) },
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        getAttribute: (name: string) => attributes.get(name) ?? null,
    };
    return new Proxy(element, {
        get(target, property) {
            if (!(property in target)) {
                target[property] = jest.fn(() => fakeElement());
            }
            return target[property];
        },
        set(target, property, value) {
            target[property] = value;
            return true;
        },
    });
}

jest.mock('../../../src/webview/ui/toolbar/buttonFactory', () => ({
    createToolbarButton: (options: { label: string; onClick: () => void; ariaLabel?: string }) => {
        const element = fakeElement();
        buttons.set(options.ariaLabel || options.label, { onClick: options.onClick, element });
        return element;
    },
}));
jest.mock('../../../src/webview/ui/toolbar/featureMenus', () => ({
    createFocusModeSelector: () => fakeElement(),
    createPinnedTabsButton: () => fakeElement(),
    createViewLocationButton: () => fakeElement(),
}));
jest.mock('../../../src/webview/ui/layoutPicker', () => ({ createLayoutPicker: () => fakeElement() }));

import { createFeatureGroupElement } from '../../../src/webview/ui/toolbar/featureGroup';

describe('toolbar toggle sync (M14)', () => {
    const originalDocument = (global as any).document;
    const originalWindow = (global as any).window;
    let documentListeners: Map<string, Listener[]>;

    beforeEach(() => {
        buttons.clear();
        documentListeners = new Map();
        (global as any).document = {
            createElement: () => fakeElement(),
            getElementById: () => null,
            head: fakeElement(),
            body: fakeElement(),
            addEventListener: (type: string, handler: Listener) => {
                documentListeners.set(type, [...(documentListeners.get(type) || []), handler]);
            },
            removeEventListener: jest.fn(),
        };
        (global as any).window = { setTimeout: jest.fn(), matchMedia: () => ({ matches: true }) };
    });

    afterEach(() => {
        (global as any).document = originalDocument;
        (global as any).window = originalWindow;
    });

    it('toggles from and restyles to the renderer state after keyboard changes', () => {
        let focusMode = false;
        let columnFlows = false;
        const callbacks: any = new Proxy({
            isDarkTheme: () => true,
            isFocusModeEnabled: () => focusMode,
            isColumnFlowsVisible: () => columnFlows,
            onToggleFocusMode: jest.fn((active: boolean) => { focusMode = active; }),
            onToggleColumnFlows: jest.fn((active: boolean) => { columnFlows = active; }),
            getFocusMode: () => 'all',
        }, {
            get(target: any, property) {
                if (!(property in target)) {
                    target[property] = jest.fn();
                }
                return target[property];
            },
        });
        createFeatureGroupElement({
            callbacks,
            options: { persistedPinnedTabs: [], isPinnedView: false, pinId: null, viewLocation: 'tab', currentDialect: 'MySQL', isFirstRun: false } as any,
            documentListeners: [],
            getListenerOptions: () => undefined,
            getBtnStyle: () => '',
            onHintsButtonReady: jest.fn(),
            createHintsBadgeMarkup: () => '',
            showKeyboardShortcutsHelp: jest.fn(),
            applyFirstRunHelpPulse: jest.fn(),
        });
        const lineage = buttons.get('Toggle column lineage')!;
        const focus = buttons.get('Toggle focus mode')!;
        const notify = () => (documentListeners.get('layout-state-changed') || []).forEach(handler => handler());

        // The C key turns lineage on in the renderer; the button follows.
        columnFlows = true;
        notify();
        expect(lineage.element.getAttribute('aria-pressed')).toBe('true');

        // One click now turns it off (it used to send `true` again).
        lineage.onClick();
        expect(callbacks.onToggleColumnFlows).toHaveBeenLastCalledWith(false);
        expect(lineage.element.getAttribute('aria-pressed')).toBe('false');

        // Focus mode on via toolbar, then cleared by Escape / a query switch.
        focus.onClick();
        expect(callbacks.onToggleFocusMode).toHaveBeenLastCalledWith(true);
        focusMode = false;
        notify();
        expect(focus.element.getAttribute('aria-pressed')).toBe('false');
        focus.onClick();
        expect(callbacks.onToggleFocusMode).toHaveBeenLastCalledWith(true);
    });
});
