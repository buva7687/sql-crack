/**
 * M16: toolbar dropdown menus are operable from the keyboard.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { attachMenuKeyboardNavigation, makeMenuItemFocusable } from '../../../src/webview/ui/menuKeyboard';

type Handler = (event: any) => void;

class FakeElement {
    style: Record<string, string> = {};
    children: FakeElement[] = [];
    private attributes = new Map<string, string>();
    private handlers = new Map<string, Handler[]>();
    constructor(private readonly doc: { activeElement: unknown }, public name = '') {}
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    addEventListener(type: string, handler: Handler) {
        this.handlers.set(type, [...(this.handlers.get(type) || []), handler]);
    }
    dispatch(type: string, event: Record<string, unknown> = {}) {
        const full = { preventDefault: jest.fn(), stopPropagation: jest.fn(), ...event };
        (this.handlers.get(type) || []).forEach(handler => handler(full));
        return full;
    }
    click() { this.dispatch('click'); }
    focus() { this.doc.activeElement = this; }
    querySelector(selector: string) {
        return selector === '[data-menu-item-remove]' ? (this.children.find(child => child.name === 'remove') ?? null) : null;
    }
    querySelectorAll() { return this.children.filter(child => child.getAttribute('role')); }
}

describe('toolbar menu keyboard navigation (M16)', () => {
    const originalDocument = (global as any).document;
    const originalWindow = (global as any).window;

    beforeEach(() => {
        jest.useFakeTimers();
        (global as any).document = { activeElement: null, addEventListener: jest.fn() };
        (global as any).window = { setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms) };
    });

    afterEach(() => {
        jest.useRealTimers();
        (global as any).document = originalDocument;
        (global as any).window = originalWindow;
    });

    function setup() {
        const doc = (global as any).document;
        const trigger = new FakeElement(doc, 'trigger');
        const menu = new FakeElement(doc, 'menu');
        let open = false;
        const activated: string[] = [];
        const items = ['png', 'svg', 'pdf'].map(name => {
            const item = new FakeElement(doc, name);
            makeMenuItemFocusable(item as unknown as HTMLElement);
            item.addEventListener('click', () => { activated.push(name); open = false; });
            menu.children.push(item);
            return item;
        });
        trigger.addEventListener('click', () => { open = !open; });
        attachMenuKeyboardNavigation({ trigger: trigger as any, menu: menu as any, isOpen: () => open, close: () => { open = false; } });
        return { doc, trigger, menu, items, activated, isOpen: () => open };
    }

    it('moves focus into the menu on open and navigates with arrow keys', () => {
        const { doc, trigger, menu, items, activated } = setup();

        trigger.click();
        jest.runAllTimers();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(doc.activeElement).toBe(items[0]);

        menu.dispatch('keydown', { key: 'ArrowDown' });
        expect(doc.activeElement).toBe(items[1]);
        menu.dispatch('keydown', { key: 'ArrowUp' });
        menu.dispatch('keydown', { key: 'ArrowUp' });
        expect(doc.activeElement).toBe(items[2]);

        menu.dispatch('keydown', { key: 'Enter' });
        expect(activated).toEqual(['pdf']);
        expect(doc.activeElement).toBe(trigger);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('closes on Escape, returns focus to the trigger, and consumes the event', () => {
        const { doc, trigger, menu, isOpen } = setup();
        trigger.click();
        jest.runAllTimers();

        const escape = menu.dispatch('keydown', { key: 'Escape' });
        expect(isOpen()).toBe(false);
        expect(doc.activeElement).toBe(trigger);
        expect(escape.stopPropagation).toHaveBeenCalled();
        expect(escape.preventDefault).toHaveBeenCalled();
    });

    it('opens from the trigger with ArrowDown', () => {
        const { trigger, isOpen } = setup();
        trigger.dispatch('keydown', { key: 'ArrowDown' });
        expect(isOpen()).toBe(true);
    });

    it('is wired into every toolbar dropdown', () => {
        const read = (file: string) => readFileSync(join(__dirname, '../../../src/webview/ui', file), 'utf8');
        expect(read('exportDropdown.ts')).toContain('attachMenuKeyboardNavigation({ trigger: btn, menu: dropdown');
        expect(read('layoutPicker.ts')).toContain("popupRole: 'listbox'");
        const featureMenus = read('toolbar/featureMenus.ts');
        for (const trigger of ['trigger: btn,', 'trigger: viewLocBtn,', 'trigger: pinsBtn,']) {
            expect(featureMenus).toContain(trigger);
        }
        expect(read('toolbar/actionGroups.ts')).toContain('trigger: overflowBtn,');
        expect(read('toolbar/overflowMenu.ts')).toContain("row.setAttribute('role', 'menuitem');");
    });
});
