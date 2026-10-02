/**
 * Keyboard support for toolbar dropdown menus (Export, Layout, Focus Direction,
 * View Location, Pinned Tabs, overflow). Menus keep their own open/close logic;
 * this layers on the same interaction model the node context menu uses:
 * opening moves focus to the first item, ArrowUp/ArrowDown/Home/End move,
 * Enter/Space activate, Escape closes and returns focus to the trigger, Tab
 * closes. Items are the menu's [role=menuitem|menuitemradio|option] rows.
 */

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"]';

export interface MenuKeyboardOptions {
    trigger: HTMLElement;
    menu: HTMLElement;
    isOpen: () => boolean;
    close: () => void;
    listenerOptions?: AddEventListenerOptions;
    /** aria-haspopup value; 'listbox' for single-choice pickers. */
    popupRole?: 'menu' | 'listbox';
}

/** Mark a menu row as a keyboard-focusable item. */
export function makeMenuItemFocusable(item: HTMLElement, role = 'menuitem'): void {
    if (!item.getAttribute('role')) {
        item.setAttribute('role', role);
    }
    item.setAttribute('tabindex', '-1');
}

export function attachMenuKeyboardNavigation(options: MenuKeyboardOptions): void {
    const { trigger, menu, isOpen, close, listenerOptions, popupRole = 'menu' } = options;
    trigger.setAttribute('aria-haspopup', popupRole);
    trigger.setAttribute('aria-expanded', String(isOpen()));
    if (!menu.getAttribute('role')) {
        menu.setAttribute('role', popupRole);
    }

    const getItems = (): HTMLElement[] => Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
        .filter(item => item.style.display !== 'none');
    const syncExpanded = (): void => {
        trigger.setAttribute('aria-expanded', String(isOpen()));
    };
    const focusItemAt = (index: number): void => {
        const items = getItems();
        if (items.length === 0) {
            return;
        }
        const wrapped = ((index % items.length) + items.length) % items.length;
        items[wrapped].focus();
    };
    const closeAndReturnFocus = (): void => {
        close();
        syncExpanded();
        trigger.focus();
    };

    // Registered after the menu's own click handler, so it observes the new state.
    trigger.addEventListener('click', () => {
        syncExpanded();
        if (isOpen()) {
            // Menus may (re)render their rows while opening.
            window.setTimeout(() => {
                if (isOpen()) {
                    focusItemAt(0);
                }
            }, 0);
        }
    }, listenerOptions);

    // Mouse selection and outside clicks close menus through their own
    // handlers; resync aria-expanded afterwards. Items stop propagation, so
    // observe the menu in the capture phase.
    const deferredSync = (): void => { window.setTimeout(syncExpanded, 0); };
    menu.addEventListener('click', deferredSync, { ...listenerOptions, capture: true });
    document.addEventListener('click', deferredSync, listenerOptions);

    trigger.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'ArrowDown' && !isOpen()) {
            event.preventDefault();
            trigger.click();
        }
    }, listenerOptions);

    menu.addEventListener('keydown', (event: KeyboardEvent) => {
        const items = getItems();
        const current = items.indexOf(document.activeElement as HTMLElement);
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                focusItemAt(current + 1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                focusItemAt(current < 0 ? items.length - 1 : current - 1);
                break;
            case 'Home':
                event.preventDefault();
                focusItemAt(0);
                break;
            case 'End':
                event.preventDefault();
                focusItemAt(items.length - 1);
                break;
            case 'Enter':
            case ' ':
                if (current >= 0) {
                    event.preventDefault();
                    items[current].click();
                    syncExpanded();
                    if (!isOpen()) {
                        trigger.focus();
                    }
                }
                break;
            case 'Delete':
            case 'Backspace': {
                const removeControl = current >= 0
                    ? items[current].querySelector<HTMLElement>('[data-menu-item-remove]')
                    : null;
                if (removeControl) {
                    event.preventDefault();
                    removeControl.click();
                    focusItemAt(Math.min(current, getItems().length - 1));
                }
                break;
            }
            case 'Escape':
                // Consume Escape so the graph-level handler does not also act.
                event.preventDefault();
                event.stopPropagation();
                closeAndReturnFocus();
                break;
            case 'Tab':
                close();
                syncExpanded();
                break;
            default:
                break;
        }
    }, listenerOptions);
}
