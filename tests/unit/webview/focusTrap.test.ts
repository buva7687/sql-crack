import { trapDialogFocus } from '../../../src/webview/ui/focusTrap';

function fixture() {
    const ownerDocument = { activeElement: null as unknown };
    const control = (disabled = false, visible = true) => {
        const element = {
            tabIndex: 0,
            matches: () => disabled,
            getClientRects: () => visible ? [{}] : [],
            focus: jest.fn(() => { ownerDocument.activeElement = element; }),
        };
        return element;
    };
    const close = control();
    const format = control();
    const save = control();
    const controls = [close, format, save];
    const dialog = {
        ownerDocument,
        isConnected: true,
        querySelectorAll: () => controls,
        focus: jest.fn(),
    };
    const key = (shiftKey = false) => ({ key: 'Tab', shiftKey, preventDefault: jest.fn(), stopPropagation: jest.fn() });
    return { ownerDocument, control, close, format, save, controls, dialog, key };
}

describe('dialog focus boundaries', () => {
    it('wraps backward navigation from Close to Save instead of the background toolbar', () => {
        const f = fixture();
        f.ownerDocument.activeElement = f.close;
        const event = f.key(true);
        trapDialogFocus(event as unknown as KeyboardEvent, f.dialog as unknown as HTMLElement);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(f.ownerDocument.activeElement).toBe(f.save);
    });

    it('wraps forward navigation from Save to Close', () => {
        const f = fixture();
        f.ownerDocument.activeElement = f.save;
        const event = f.key();
        trapDialogFocus(event as unknown as KeyboardEvent, f.dialog as unknown as HTMLElement);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(f.ownerDocument.activeElement).toBe(f.close);
    });

    it('lets native navigation move between controls inside the dialog', () => {
        const f = fixture();
        f.ownerDocument.activeElement = f.format;
        const event = f.key();
        trapDialogFocus(event as unknown as KeyboardEvent, f.dialog as unknown as HTMLElement);
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(f.ownerDocument.activeElement).toBe(f.format);
    });

    it('recomputes controls after form changes, excluding disabled, hidden and negative-tabindex controls', () => {
        const f = fixture();
        const cancel = f.control();
        const skipped = f.control();
        skipped.tabIndex = -1;
        f.controls.splice(1, f.controls.length, cancel, f.control(true), f.control(false, false), skipped);
        f.ownerDocument.activeElement = f.close;
        trapDialogFocus(f.key(true) as unknown as KeyboardEvent, f.dialog as unknown as HTMLElement);
        expect(f.ownerDocument.activeElement).toBe(cancel);
        f.controls.push(f.save);
        f.ownerDocument.activeElement = f.close;
        trapDialogFocus(f.key(true) as unknown as KeyboardEvent, f.dialog as unknown as HTMLElement);
        expect(f.ownerDocument.activeElement).toBe(f.save);
    });

    it('recovers focus that was outside the dialog', () => {
        const f = fixture();
        f.ownerDocument.activeElement = {};
        const event = f.key();
        trapDialogFocus(event as unknown as KeyboardEvent, f.dialog as unknown as HTMLElement);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(f.ownerDocument.activeElement).toBe(f.close);
    });

    it('contains focus even when no controls are available', () => {
        const f = fixture();
        f.controls.length = 0;
        const event = f.key();
        trapDialogFocus(event as unknown as KeyboardEvent, f.dialog as unknown as HTMLElement);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(f.dialog.focus).toHaveBeenCalled();
    });

    it('does not consume keys when the dialog has closed or the key is not Tab', () => {
        const f = fixture();
        f.dialog.isConnected = false;
        const event = f.key();
        trapDialogFocus(event as unknown as KeyboardEvent, f.dialog as unknown as HTMLElement);
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopPropagation).not.toHaveBeenCalled();
        f.dialog.isConnected = true;
        event.key = 'Escape';
        trapDialogFocus(event as unknown as KeyboardEvent, f.dialog as unknown as HTMLElement);
        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});
