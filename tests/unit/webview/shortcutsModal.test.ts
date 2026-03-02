import { showKeyboardShortcutsHelpModal } from '../../../src/webview/ui/toolbar/shortcutsModal';

type ListenerMap = Record<string, Array<(event?: any) => void>>;

function createElement(tagName: string) {
    const listeners: ListenerMap = {};
    const attrs = new Map<string, string>();
    const element = {
        tagName,
        id: '',
        style: { cssText: '', background: '', color: '' },
        children: [] as any[],
        innerHTML: '',
        removed: false,
        appendChild: jest.fn((child: any) => {
            element.children.push(child);
            return child;
        }),
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
        }),
        getAttribute: jest.fn((name: string) => attrs.get(name) || null),
        addEventListener: jest.fn((type: string, handler: (event?: any) => void) => {
            listeners[type] = listeners[type] || [];
            listeners[type].push(handler);
        }),
        querySelector: jest.fn(),
        remove: jest.fn(() => {
            element.removed = true;
        }),
        focus: jest.fn(),
        emit(type: string, event?: any) {
            for (const handler of listeners[type] || []) {
                handler(event);
            }
        },
    };
    return element;
}

describe('showKeyboardShortcutsHelpModal', () => {
    let overlay: ReturnType<typeof createElement>;
    let modal: ReturnType<typeof createElement>;
    let styleEl: ReturnType<typeof createElement>;
    let closeButton: ReturnType<typeof createElement>;
    let previouslyFocused: { focus: jest.Mock };
    let documentListeners: ListenerMap;

    beforeEach(() => {
        overlay = createElement('div');
        modal = createElement('div');
        styleEl = createElement('style');
        closeButton = createElement('button');
        previouslyFocused = { focus: jest.fn() };
        documentListeners = {};

        modal.querySelector.mockImplementation((selector: string) => {
            if (selector === '#close-shortcuts') {
                return closeButton;
            }
            return null;
        });

        let createCount = 0;
        (global as any).document = {
            activeElement: previouslyFocused,
            body: {
                appendChild: jest.fn(),
            },
            createElement: jest.fn(() => {
                createCount += 1;
                if (createCount === 1) {
                    return overlay;
                }
                if (createCount === 2) {
                    return modal;
                }
                return styleEl;
            }),
            addEventListener: jest.fn((type: string, handler: (event?: any) => void) => {
                documentListeners[type] = documentListeners[type] || [];
                documentListeners[type].push(handler);
            }),
            removeEventListener: jest.fn((type: string, handler: (event?: any) => void) => {
                documentListeners[type] = (documentListeners[type] || []).filter(existing => existing !== handler);
            }),
        };
        (global as any).requestAnimationFrame = (cb: () => void) => {
            cb();
            return 1;
        };
    });

    afterEach(() => {
        delete (global as any).document;
        delete (global as any).requestAnimationFrame;
    });

    it('renders an accessible modal and focuses the close button', () => {
        showKeyboardShortcutsHelpModal({
            shortcuts: [
                { key: 'F', description: 'Toggle fullscreen' },
                { key: 'T', description: 'Toggle theme' },
            ],
            isDark: true,
            zIndex: 99,
            monoFontStack: 'monospace',
        });

        expect((global as any).document.createElement).toHaveBeenCalledWith('div');
        expect(overlay.setAttribute).toHaveBeenCalledWith('role', 'dialog');
        expect(overlay.setAttribute).toHaveBeenCalledWith('aria-modal', 'true');
        expect(overlay.setAttribute).toHaveBeenCalledWith('aria-labelledby', 'shortcuts-title');
        expect((global as any).document.body.appendChild).toHaveBeenCalledWith(overlay);
        expect(overlay.appendChild).toHaveBeenCalledWith(modal);
        expect(closeButton.focus).toHaveBeenCalled();
        expect(modal.innerHTML).toContain('Keyboard Shortcuts');
        expect(modal.innerHTML).toContain('Toggle fullscreen');
        expect(modal.innerHTML).toContain('Toggle theme');
    });

    it('closes on outside click and restores prior focus', () => {
        showKeyboardShortcutsHelpModal({
            shortcuts: [{ key: '?', description: 'Show shortcuts' }],
            isDark: false,
            zIndex: 10,
            monoFontStack: 'monospace',
        });

        overlay.emit('click', { target: overlay });
        expect(overlay.remove).toHaveBeenCalledTimes(1);
        expect(previouslyFocused.focus).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape and restores prior focus', () => {
        showKeyboardShortcutsHelpModal({
            shortcuts: [{ key: '?', description: 'Show shortcuts' }],
            isDark: false,
            zIndex: 10,
            monoFontStack: 'monospace',
        });

        const keydownHandlers = documentListeners.keydown || [];
        expect(keydownHandlers).toHaveLength(1);
        const preventDefault = jest.fn();
        keydownHandlers[0]({ key: 'Escape', preventDefault });

        expect(preventDefault).toHaveBeenCalled();
        expect(overlay.remove).toHaveBeenCalledTimes(1);
        expect(previouslyFocused.focus).toHaveBeenCalledTimes(1);
    });

    it('traps Tab on the close button and wires hover styling', () => {
        showKeyboardShortcutsHelpModal({
            shortcuts: [{ key: '/', description: 'Focus search' }],
            isDark: true,
            zIndex: 10,
            monoFontStack: 'monospace',
        });

        const keydownHandlers = documentListeners.keydown || [];
        const preventDefault = jest.fn();
        keydownHandlers[0]({ key: 'Tab', preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(closeButton.focus).toHaveBeenCalledTimes(2);

        closeButton.emit('mouseenter');
        expect(closeButton.style.background).toBe('rgba(148, 163, 184, 0.1)');
        closeButton.emit('mouseleave');
        expect(closeButton.style.background).toBe('none');
    });
});
