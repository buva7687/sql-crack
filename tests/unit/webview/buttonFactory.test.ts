import { createToolbarButton } from '../../../src/webview/ui/toolbar/buttonFactory';

type ListenerMap = Record<string, Array<() => void>>;

function createFakeButton() {
    const listeners: ListenerMap = {};
    const attrs = new Map<string, string>();
    return {
        innerHTML: '',
        style: {
            cssText: '',
            background: '',
        },
        attrs,
        addEventListener: jest.fn((type: string, handler: () => void) => {
            listeners[type] = listeners[type] || [];
            listeners[type].push(handler);
        }),
        setAttribute: jest.fn((name: string, value: string) => {
            attrs.set(name, value);
        }),
        emit(type: string) {
            for (const handler of listeners[type] || []) {
                handler();
            }
        },
    };
}

let fakeButton: ReturnType<typeof createFakeButton>;

describe('createToolbarButton', () => {
    beforeEach(() => {
        fakeButton = createFakeButton();
        (global as any).document = {
            createElement: jest.fn(() => fakeButton),
        };
    });

    afterEach(() => {
        delete (global as any).document;
    });

    it('creates a button with label, style, click handler, and accessibility attributes', () => {
        const onClick = jest.fn();
        const btn = createToolbarButton({
            label: '<svg></svg>',
            onClick,
            getBtnStyle: (dark) => dark ? 'color: white;' : 'color: black;',
            ariaLabel: 'Toggle fullscreen',
            isDark: true,
        });

        expect((global as any).document.createElement).toHaveBeenCalledWith('button');
        expect(btn).toBe(fakeButton as any);
        expect(fakeButton.innerHTML).toBe('<svg></svg>');
        expect(fakeButton.style.cssText).toBe('color: white;');
        expect(fakeButton.setAttribute).toHaveBeenCalledWith('aria-label', 'Toggle fullscreen');
        expect(fakeButton.setAttribute).toHaveBeenCalledWith('role', 'button');

        fakeButton.emit('click');
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('applies hover backgrounds and preserves active accent backgrounds on mouseleave', () => {
        createToolbarButton({
            label: 'X',
            onClick: jest.fn(),
            getBtnStyle: () => 'color: white;',
        });

        fakeButton.emit('mouseenter');
        expect(fakeButton.style.background).toBe('rgba(148, 163, 184, 0.1)');

        fakeButton.style.background = 'rgba(99, 102, 241, 0.3)';
        fakeButton.emit('mouseleave');
        expect(fakeButton.style.background).toBe('rgba(99, 102, 241, 0.3)');

        fakeButton.style.background = 'rgba(148, 163, 184, 0.1)';
        fakeButton.emit('mouseleave');
        expect(fakeButton.style.background).toBe('transparent');
    });
});
